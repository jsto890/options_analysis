from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from ib_insync import IB, Option, Stock, Ticker
from ib_insync.contract import Contract
from ib_insync.objects import BarDataList

from app.ibkr.config import IBKRConfig

logger = logging.getLogger(__name__)


class ReadOnlyViolation(RuntimeError):
    """Raised when order operations are attempted in read-only mode."""


class IBKRConnector:
    """Async wrapper for IBKR TWS/Gateway using ib_insync."""

    def __init__(self, config: IBKRConfig):
        self.config = config
        self.ib = IB()
        self.connected = False
        self.current_market_data_type: Optional[int] = None
        self.account_info: dict[str, float | int | str] = {}
        if self.config.read_only:
            self._enforce_read_only()

    async def connect(self, paper: bool = True) -> bool:
        port = self.config.paper_port if paper else self.config.live_port
        try:
            await self.ib.connectAsync(
                host=self.config.host,
                port=port,
                clientId=self.config.client_id,
                timeout=self.config.timeout_seconds,
            )
            self.connected = True
            self.set_market_data_type(self.config.market_data_type)
            await self._load_account_info()
            logger.info("Connected to IBKR at %s:%s", self.config.host, port)
            return True
        except Exception as exc:
            self.connected = False
            logger.error("Failed to connect to IBKR: %s", exc)
            return False

    async def disconnect(self) -> None:
        if not self.connected:
            return
        try:
            self.ib.disconnect()
        finally:
            self.connected = False

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
            underlying = Stock(symbol, "SMART", "USD")
            qualified = await self.ib.qualifyContractsAsync(underlying)
            if not qualified:
                return []
            contract = qualified[0]
            chains = await self.ib.reqSecDefOptParamsAsync(
                contract.symbol,
                "",
                contract.secType,
                int(contract.conId),
            )
        except Exception as exc:
            logger.error("Failed option chain request: %s", exc)
            return []

        today = datetime.now().date()
        options: list[Contract] = []
        for chain in chains:
            for expiry in chain.expirations:
                dte = (datetime.strptime(expiry, "%Y%m%d").date() - today).days
                if dte < min_dte or dte > max_dte:
                    continue
                for strike in chain.strikes:
                    options.append(Option(underlying.symbol, expiry, strike, "C", "SMART"))
                    options.append(Option(underlying.symbol, expiry, strike, "P", "SMART"))
        return options

    async def subscribe_underlying_stream(self, symbol: str = "QQQ") -> Optional[Ticker]:
        if not self.is_connected():
            return None
        try:
            return await self._request_market_data(Stock(symbol, "SMART", "USD"), snapshot=False)
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

    async def _request_market_data(
        self,
        contract: Contract,
        snapshot: bool,
        regulatory: bool = False,
    ) -> Optional[Ticker]:
        if hasattr(self.ib, "reqMktDataAsync"):
            return await self.ib.reqMktDataAsync(contract, "", snapshot, regulatory)

        # Backward compatibility for older ib_insync builds used by SPYbot.
        if snapshot:
            tickers = await self.ib.reqTickersAsync(contract)
            return tickers[0] if tickers else None

        return self.ib.reqMktData(contract, "", False, regulatory)

    async def _load_account_info(self) -> None:
        if not self.is_connected():
            return
        try:
            rows = await self.ib.accountSummaryAsync()
            if not rows:
                return
            account_id = self.config.account or rows[0].account
            filtered = [r for r in rows if r.account == account_id] or rows

            def value(tag: str, default: float = 0.0) -> float:
                tag_rows = [r for r in filtered if str(r.tag) == tag]
                if not tag_rows:
                    return default
                usd = [r for r in tag_rows if getattr(r, "currency", "USD") == "USD"]
                chosen = usd[0] if usd else tag_rows[0]
                try:
                    return float(chosen.value)
                except Exception:
                    return default

            self.account_info = {
                "account": account_id,
                "net_liquidation": value("NetLiquidation"),
                "total_cash": value("TotalCashValue"),
                "buying_power": value("BuyingPower"),
                "available_funds": value("AvailableFunds"),
            }
        except Exception as exc:
            logger.error("Failed to load account summary: %s", exc)

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
