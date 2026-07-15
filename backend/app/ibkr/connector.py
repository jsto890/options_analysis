from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime
from typing import Optional

from ib_insync import IB, Option, Ticker, util as ib_util
from ib_insync import client as ib_client
from ib_insync import connection as ib_connection
from ib_insync.contract import Contract
from ib_insync.objects import BarDataList

from app.ibkr.config import IBKRConfig
from app.ibkr.symbols import build_underlying, is_index, option_trading_class

logger = logging.getLogger(__name__)


class ReadOnlyViolation(RuntimeError):
    """Raised when order operations are attempted in read-only mode."""


class IBKRConnector:
    """Async wrapper for IBKR TWS/Gateway using ib_insync."""

    def __init__(self, config: IBKRConfig):
        self.config = config
        self.ib = IB()
        self.connected = False
        self.active_client_id = config.client_id
        self.current_market_data_type: Optional[int] = None
        self._bound_loop: asyncio.AbstractEventLoop | None = None
        self._original_util_get_loop = ib_util.getLoop
        self._original_client_get_loop = ib_client.getLoop
        self._original_connection_get_loop = ib_connection.getLoop
        if self.config.read_only:
            self._enforce_read_only()

    async def connect(self, paper: bool = True) -> bool:
        for port in self._candidate_ports(paper):
            for client_id in self._candidate_client_ids():
                attempt_error_codes: list[int] = []

                def _capture_error(_req_id, error_code, _error_string, _contract=None):
                    with contextlib.suppress(Exception):
                        attempt_error_codes.append(int(error_code))

                error_event = getattr(self.ib, "errorEvent", None)
                has_error_event = error_event is not None
                if has_error_event:
                    with contextlib.suppress(Exception):
                        error_event += _capture_error
                try:
                    with self._bound_ib_loop():
                        await self.ib.connectAsync(
                            host=self.config.host,
                            port=port,
                            clientId=client_id,
                            timeout=self.config.timeout_seconds,
                        )
                        # Give ib_insync a short event-loop turn to process async error callbacks.
                        await asyncio.sleep(0.05)

                    if not self.ib.isConnected():
                        if 326 in attempt_error_codes:
                            raise RuntimeError("Error 326, reqId -1: Unable to connect as the client id is already in use.")
                        raise RuntimeError("IBKR connect returned without an active session")
                    self.connected = True
                    self.active_client_id = client_id
                    self.set_market_data_type(self.config.market_data_type)
                    if port != (self.config.paper_port if paper else self.config.live_port):
                        logger.warning(
                            "Connected to IBKR at %s:%s using fallback port (configured port unavailable)",
                            self.config.host,
                            port,
                        )
                    elif client_id != self.config.client_id:
                        logger.warning(
                            "Connected to IBKR at %s:%s using fallback client id %s (configured %s was unavailable)",
                            self.config.host,
                            port,
                            client_id,
                            self.config.client_id,
                        )
                    else:
                        logger.info("Connected to IBKR at %s:%s", self.config.host, port)
                    return True
                except asyncio.CancelledError as exc:
                    self.connected = self.ib.isConnected()
                    if self.connected:
                        self.active_client_id = client_id
                        logger.warning("Connect raised cancellation but session is active: %s", exc)
                        self.set_market_data_type(self.config.market_data_type)
                        return True

                    if self._is_client_id_in_use(exc) or 326 in attempt_error_codes:
                        self._reset_ib_client()
                        logger.warning(
                            "IBKR client id %s is already in use on %s:%s",
                            client_id,
                            self.config.host,
                            port,
                        )
                        continue

                    if self._is_endpoint_unavailable(exc):
                        self._reset_ib_client()
                        break

                    task = asyncio.current_task()
                    if task is not None and task.cancelling() > 0:
                        raise

                    logger.error("Failed to connect to IBKR: %s", exc)
                    return False
                except Exception as exc:
                    self.connected = self.ib.isConnected()
                    if self.connected:
                        self.active_client_id = client_id
                        logger.warning("Connect raised warning but session is active: %s", exc)
                        self.set_market_data_type(self.config.market_data_type)
                        return True

                    if self._is_client_id_in_use(exc) or 326 in attempt_error_codes:
                        self._reset_ib_client()
                        logger.warning(
                            "IBKR client id %s is already in use on %s:%s",
                            client_id,
                            self.config.host,
                            port,
                        )
                        continue

                    if self._is_endpoint_unavailable(exc):
                        self._reset_ib_client()
                        break

                    logger.error("Failed to connect to IBKR: %s", exc)
                    return False
                finally:
                    if has_error_event:
                        with contextlib.suppress(Exception):
                            error_event -= _capture_error

        logger.error(
            "Failed to connect to IBKR at %s using candidate ports %s and client ids %s through %s",
            self.config.host,
            self._candidate_ports(paper),
            self.config.client_id,
            self.config.client_id + 9,
        )
        return False

    async def disconnect(self) -> None:
        if not self.connected:
            self._unbind_ib_loop()
            return
        try:
            self.ib.disconnect()
        finally:
            self.connected = False
            self._unbind_ib_loop()

    def is_connected(self) -> bool:
        return self.connected and self.ib.isConnected()

    def set_market_data_type(self, kind: int | str) -> int:
        mapping = {
            "realtime": 1,
            "real_time": 1,
            "rt": 1,
            "frozen": 2,
            "delayed": 3,
            "delayed_frozen": 4,
            "delayed-frozen": 4,
            "df": 4,
        }
        code = kind if isinstance(kind, int) else mapping.get(str(kind).strip().lower(), 1)
        if code not in (1, 2, 3, 4):
            code = 1
        if self.ib.isConnected():
            self.ib.reqMarketDataType(code)
        self.current_market_data_type = code
        return code

    async def request_snapshot(self, contract: Contract, regulatory: bool = False) -> Optional[Ticker]:
        if not self.is_connected():
            return None
        try:
            return await self._request_market_data(contract, snapshot=True, regulatory=regulatory)
        except Exception as exc:
            logger.error("Failed snapshot for %s: %s", getattr(contract, "symbol", "unknown"), exc)
            return None

    async def get_historical_data(
        self,
        contract: Contract,
        duration: str = "1 D",
        bar_size: str = "1 min",
        end_date: str = "",
    ) -> Optional[BarDataList]:
        if not self.is_connected():
            return None
        if not end_date:
            end_date = datetime.now().strftime("%Y%m%d %H:%M:%S")
        try:
            with self._bound_ib_loop():
                return await self.ib.reqHistoricalDataAsync(
                    contract,
                    endDateTime=end_date,
                    durationStr=duration,
                    barSizeSetting=bar_size,
                    whatToShow="TRADES",
                    useRTH=True,
                    formatDate=1,
                )
        except Exception as exc:
            logger.error("Failed historical data request: %s", exc)
            return None

    async def get_option_chain(self, symbol: str = "QQQ", min_dte: int = 0, max_dte: int = 7) -> list[Contract]:
        if not self.is_connected():
            return []
        try:
            qualified_underlying = await self.qualify_underlying(symbol)
            if qualified_underlying is None:
                return []
            contract = qualified_underlying
            with self._bound_ib_loop():
                chains = await self.ib.reqSecDefOptParamsAsync(
                    contract.symbol,
                    "",
                    contract.secType,
                    int(contract.conId),
                )
        except Exception as exc:
            logger.error("Failed option chain request: %s", exc)
            return []

        trading_class = option_trading_class(symbol) if is_index(symbol) else None
        if trading_class is not None:
            chains = [chain for chain in chains if chain.tradingClass == trading_class]

        today = datetime.now().date()
        by_expiry: dict[str, set[float]] = {}
        for chain in chains:
            for expiry in chain.expirations:
                dte = (datetime.strptime(expiry, "%Y%m%d").date() - today).days
                if dte < min_dte or dte > max_dte:
                    continue
                strike_set = by_expiry.setdefault(expiry, set())
                for strike in chain.strikes:
                    if strike <= 0:
                        continue
                    strike_float = float(strike)
                    # Filter out non-standard increments seen in noisy chain metadata.
                    if abs((strike_float * 2.0) - round(strike_float * 2.0)) > 1e-6:
                        continue
                    strike_set.add(strike_float)

        option_kwargs = {"tradingClass": trading_class} if trading_class else {}
        options: list[Contract] = []
        for expiry in sorted(by_expiry):
            for strike in sorted(by_expiry[expiry]):
                options.append(Option(contract.symbol, expiry, strike, "C", "SMART", **option_kwargs))
                options.append(Option(contract.symbol, expiry, strike, "P", "SMART", **option_kwargs))
        return options

    async def qualify_underlying(self, symbol: str = "QQQ") -> Optional[Contract]:
        if not self.is_connected():
            return None
        try:
            underlying = build_underlying(symbol)
            with self._bound_ib_loop():
                qualified = await self.ib.qualifyContractsAsync(underlying)
            for contract in qualified:
                conid = int(getattr(contract, "conId", 0) or 0)
                if conid > 0:
                    return contract
            return None
        except Exception as exc:
            logger.error("Failed to qualify underlying contract: %s", exc)
            return None

    async def qualify_contracts(self, contracts: list[Contract]) -> list[Contract]:
        if not self.is_connected() or not contracts:
            return []
        try:
            with self._bound_ib_loop():
                qualified = list(await self.ib.qualifyContractsAsync(*contracts))
            return [c for c in qualified if int(getattr(c, "conId", 0) or 0) > 0]
        except Exception as exc:
            logger.error("Failed to qualify %s contracts: %s", len(contracts), exc)
            return []

    async def subscribe_underlying_stream(self, symbol: str = "QQQ") -> Optional[Ticker]:
        if not self.is_connected():
            return None
        try:
            return await self._request_market_data(build_underlying(symbol), snapshot=False)
        except Exception as exc:
            logger.error("Failed underlying stream subscription: %s", exc)
            return None

    async def subscribe_option_stream(self, option_contract: Contract) -> Optional[Ticker]:
        if not self.is_connected():
            return None
        try:
            return await self._request_market_data(option_contract, snapshot=False)
        except Exception as exc:
            logger.error("Failed option stream subscription: %s", exc)
            return None

    def cancel_market_data(self, contract: Contract) -> None:
        if not self.is_connected():
            return
        with contextlib.suppress(Exception):
            self.ib.cancelMktData(contract)

    async def _request_market_data(
        self,
        contract: Contract,
        snapshot: bool,
        regulatory: bool = False,
    ) -> Optional[Ticker]:
        if hasattr(self.ib, "reqMktDataAsync"):
            with self._bound_ib_loop():
                return await self.ib.reqMktDataAsync(contract, "", snapshot, regulatory)

        # Backward compatibility for older ib_insync builds used by SPYbot.
        if snapshot:
            with self._bound_ib_loop():
                tickers = await self.ib.reqTickersAsync(contract)
            return tickers[0] if tickers else None

        return self.ib.reqMktData(contract, "", False, regulatory)

    @contextlib.contextmanager
    def _bound_ib_loop(self):
        self._bind_ib_loop(asyncio.get_running_loop())
        yield

    def _bind_ib_loop(self, running_loop: asyncio.AbstractEventLoop) -> None:
        self._bound_loop = running_loop

        def _current_util_loop():
            if self._bound_loop is not None and not self._bound_loop.is_closed():
                return self._bound_loop
            return self._original_util_get_loop()

        def _current_connection_loop():
            if self._bound_loop is not None and not self._bound_loop.is_closed():
                return self._bound_loop
            return self._original_connection_get_loop()

        def _current_client_loop():
            if self._bound_loop is not None and not self._bound_loop.is_closed():
                return self._bound_loop
            return self._original_client_get_loop()

        ib_util.getLoop = _current_util_loop
        ib_client.getLoop = _current_client_loop
        ib_connection.getLoop = _current_connection_loop

    def _unbind_ib_loop(self) -> None:
        self._bound_loop = None
        ib_util.getLoop = self._original_util_get_loop
        ib_client.getLoop = self._original_client_get_loop
        ib_connection.getLoop = self._original_connection_get_loop

    def _enforce_read_only(self) -> None:
        def _blocked(*_args, **_kwargs):
            raise ReadOnlyViolation("Order operations are disabled (IBKR read-only mode).")

        # Hard-disable all order-mutating paths on the ib_insync client.
        self.ib.placeOrder = _blocked  # type: ignore[method-assign]
        self.ib.placeOrderAsync = _blocked  # type: ignore[method-assign]
        self.ib.cancelOrder = _blocked  # type: ignore[method-assign]
        self.ib.cancelOrderAsync = _blocked  # type: ignore[method-assign]
        self.ib.reqOpenOrders = _blocked  # type: ignore[method-assign]
        self.ib.reqAllOpenOrders = _blocked  # type: ignore[method-assign]

    def _candidate_client_ids(self) -> list[int]:
        start = max(0, int(self.active_client_id))
        return [start + offset for offset in range(10)]

    def _candidate_ports(self, paper: bool) -> list[int]:
        configured = self.config.paper_port if paper else self.config.live_port
        defaults = (4002, 7497) if paper else (4001, 7496)
        ports = [configured, *defaults]
        deduped: list[int] = []
        for port in ports:
            value = int(port)
            if value not in deduped:
                deduped.append(value)
        return deduped

    @staticmethod
    def _is_client_id_in_use(exc: Exception) -> bool:
        message = str(exc).lower()
        return "client id is already in use" in message or "error 326" in message

    @staticmethod
    def _is_endpoint_unavailable(exc: BaseException) -> bool:
        if isinstance(exc, (ConnectionRefusedError, TimeoutError)):
            return True
        message = str(exc).lower()
        return "connect call failed" in message or "connection refused" in message or "timed out" in message

    def _reset_ib_client(self) -> None:
        with contextlib.suppress(Exception):
            self.ib.disconnect()
        self.ib = IB()
        if self.config.read_only:
            self._enforce_read_only()
