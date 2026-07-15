from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import os
from dataclasses import dataclass, replace
from pathlib import Path
from time import time
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from ib_insync.contract import Contract

from app.analytics.engine import AnalyticsOutput, run_analytics
from app.config_store import ConfigStore
from app.desktop.settings_store import DesktopSettingsStore
from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector
from app.ibkr.window_manager import StrikeWindowManager
from app.schemas import (
    ConfigUpdate,
    ContractBlock,
    DesktopSettings,
    DesktopSettingsApplyResponse,
    DesktopSettingsUpdate,
    HealthResponse,
    HeartbeatPayload,
    MtcRationale,
    StateSnapshot,
    StrikeRow,
    SymbolUpdate,
    UnderlyingSpot,
    build_default_snapshot,
)
from app.state.store import RuntimeStore

logger = logging.getLogger(__name__)

SWITCHABLE_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]


@dataclass(frozen=True)
class RuntimeSettings:
    heartbeat_interval_seconds: float = 2.0
    refresh_interval_seconds: float | None = None
    client_queue_size: int = 32
    queue_drop_log_interval_seconds: float = 10.0
    startup_connect: bool = False
    connect_retry_seconds: float = 10.0
    paper_trading: bool = False
    desktop_mode: bool = False
    app_data_dir: str | None = None
    frontend_dist_dir: str | None = None

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        return cls(
            startup_connect=os.getenv("IBKR_AUTO_CONNECT", "0") == "1",
            paper_trading=os.getenv("IBKR_CONNECT_PAPER", "0") == "1",
            connect_retry_seconds=max(1.0, float(os.getenv("IBKR_CONNECT_RETRY_SECONDS", "10"))),
            desktop_mode=os.getenv("OPTIONS_DESKTOP_MODE", "0") == "1",
            app_data_dir=os.getenv("OPTIONS_APP_DATA_DIR"),
            frontend_dist_dir=os.getenv("OPTIONS_FRONTEND_DIST_DIR"),
        )


@dataclass
class ClientSession:
    queue: asyncio.Queue[dict[str, Any]]
    sender_task: asyncio.Task[None] | None = None
    dropped_since_log: int = 0
    last_drop_log_ts: float = 0.0


@dataclass
class MarketDataRuntime:
    symbol: str = "QQQ"
    expiry: str = ""
    market_ready: bool = False
    underlying_ticker: Any | None = None
    option_contracts_by_strike: dict[float, dict[str, Contract]] | None = None
    all_strikes: list[float] | None = None
    active_window_strikes: list[float] | None = None
    contract_by_id: dict[str, Contract] | None = None
    ticker_by_id: dict[str, Any] | None = None
    force_snapshot_broadcast: bool = False
    last_roll_ts: float = 0.0
    bootstrap_inflight: bool = False
    switch_inflight: bool = False


def now_ms() -> int:
    return int(time() * 1000)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_frontend_dist_dir(configured_dir: str | None) -> Path:
    if configured_dir:
        return Path(configured_dir).expanduser()
    return _repo_root() / "frontend" / "dist"


def _resolve_app_data_dir(configured_dir: str | None) -> Path:
    if configured_dir:
        return Path(configured_dir).expanduser()
    return Path.home() / "Library" / "Application Support" / "OptionsAnalysis"


def _merge_ibkr_config(base: IBKRConfig, desktop_settings: DesktopSettings | None) -> IBKRConfig:
    if desktop_settings is None:
        return base
    return IBKRConfig(
        host=desktop_settings.host,
        paper_port=desktop_settings.paper_port,
        live_port=desktop_settings.live_port,
        client_id=desktop_settings.client_id,
        timeout_seconds=base.timeout_seconds,
        market_data_type=base.market_data_type,
        read_only=base.read_only,
    )


def create_app(
    settings: RuntimeSettings | None = None,
    config_store: ConfigStore | None = None,
    connector: IBKRConnector | Any | None = None,
    desktop_settings_store: DesktopSettingsStore | None = None,
) -> FastAPI:
    runtime_settings = settings or RuntimeSettings.from_env()
    app_data_dir = _resolve_app_data_dir(runtime_settings.app_data_dir)
    frontend_dist_dir = _resolve_frontend_dist_dir(runtime_settings.frontend_dist_dir)

    resolved_desktop_settings_store = desktop_settings_store or DesktopSettingsStore(app_data_dir=app_data_dir)
    desktop_settings = resolved_desktop_settings_store.settings if runtime_settings.desktop_mode else None
    if desktop_settings is not None:
        runtime_settings = replace(runtime_settings, paper_trading=desktop_settings.connect_paper)
    ibkr_config = _merge_ibkr_config(IBKRConfig.from_env(), desktop_settings)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.connector is None:
            app.state.connector = IBKRConnector(app.state.ibkr_config)
        app.state.heartbeat_task = asyncio.create_task(_heartbeat_loop(app))
        app.state.refresh_task = asyncio.create_task(_refresh_loop(app))
        if app.state.settings.startup_connect:
            app.state.connect_task = asyncio.create_task(_connect_loop(app))

        try:
            yield
        finally:
            for task_name in ("heartbeat_task", "refresh_task", "connect_task"):
                task = getattr(app.state, task_name)
                if task:
                    task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await task

            for ws in list(app.state.clients):
                await _remove_client(app, ws)

            if app.state.connector is not None:
                with contextlib.suppress(Exception):
                    await app.state.connector.disconnect()

    app = FastAPI(title="QQQ 0DTE Ladder Backend", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
            "http://localhost:4173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.settings = runtime_settings
    app.state.desktop_mode = runtime_settings.desktop_mode
    app.state.app_data_dir = app_data_dir
    app.state.frontend_dist_dir = frontend_dist_dir
    app.state.desktop_settings_store = resolved_desktop_settings_store
    app.state.desktop_settings = desktop_settings or resolved_desktop_settings_store.settings
    app.state.ibkr_config = ibkr_config
    local_config_dir = app_data_dir if runtime_settings.desktop_mode else None
    app.state.config_store = config_store or ConfigStore(local_dir=local_config_dir)
    app.state.connector = connector
    app.state.store = RuntimeStore(build_default_snapshot(app.state.config_store.config))
    app.state.window_manager = StrikeWindowManager(
        strikes_each_side=app.state.store.snapshot.config.window_strikes_each_side,
        roll_threshold_strikes=app.state.store.snapshot.config.roll_threshold_strikes,
    )

    app.state.clients: dict[WebSocket, ClientSession] = {}
    app.state.heartbeat_task: asyncio.Task | None = None
    app.state.refresh_task: asyncio.Task | None = None
    app.state.connect_task: asyncio.Task | None = None
    app.state.residual_history: dict[str, list[float | None]] = {}
    app.state.market_data = MarketDataRuntime(
        symbol=app.state.store.snapshot.underlying.symbol,
        option_contracts_by_strike={},
        all_strikes=[],
        active_window_strikes=[],
        contract_by_id={},
        ticker_by_id={},
    )
    assets_dir = app.state.frontend_dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/app", include_in_schema=False, response_class=FileResponse, response_model=None)
    async def serve_app():
        index_path = app.state.frontend_dist_dir / "index.html"
        if not index_path.exists():
            return JSONResponse(
                status_code=503,
                content={"detail": "Frontend bundle not found. Run frontend build before launching desktop mode."},
            )
        return FileResponse(index_path)

    @app.get("/desktop/settings", response_model=DesktopSettings)
    async def get_desktop_settings() -> DesktopSettings:
        return app.state.desktop_settings_store.settings

    @app.post("/desktop/settings", response_model=DesktopSettingsApplyResponse)
    async def update_desktop_settings(update: DesktopSettingsUpdate) -> DesktopSettingsApplyResponse:
        settings_after = app.state.desktop_settings_store.update(update)
        app.state.desktop_settings = settings_after
        return DesktopSettingsApplyResponse(settings=settings_after, restart_required=True)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            ok=True,
            server_ts_ms=now_ms(),
            ibkr_connected=app.state.connector.is_connected() if app.state.connector else False,
            subscriptions=_subscription_count(app),
            symbol=app.state.market_data.symbol,
        )

    @app.get("/state", response_model=StateSnapshot)
    async def state() -> StateSnapshot:
        return app.state.store.snapshot

    @app.post("/config")
    async def update_config(update: ConfigUpdate):
        previous = app.state.store.snapshot.config
        updated = app.state.config_store.update(update)
        app.state.store.update_config(updated)

        if (
            updated.window_strikes_each_side != previous.window_strikes_each_side
            or updated.roll_threshold_strikes != previous.roll_threshold_strikes
        ):
            app.state.window_manager = StrikeWindowManager(
                strikes_each_side=updated.window_strikes_each_side,
                roll_threshold_strikes=updated.roll_threshold_strikes,
            )

        app.state.market_data.force_snapshot_broadcast = True
        return updated

    @app.post("/control/symbol")
    async def control_symbol(update: SymbolUpdate):
        symbol = update.symbol.upper()
        if symbol not in SWITCHABLE_SYMBOLS:
            raise HTTPException(status_code=400, detail=f"symbol must be one of {SWITCHABLE_SYMBOLS}")
        market: MarketDataRuntime = app.state.market_data
        if symbol == market.symbol or market.switch_inflight:
            return {"symbol": market.symbol}
        await _switch_symbol(app, symbol)
        return {"symbol": market.symbol}

    @app.websocket("/stream")
    async def stream(ws: WebSocket) -> None:
        await ws.accept()
        await _add_client(app, ws)

        snapshot_msg = {
            "type": "snapshot",
            "schema_version": 1,
            "ts_ms": now_ms(),
            "payload": app.state.store.snapshot.model_dump(),
        }
        await _enqueue_message(app, ws, snapshot_msg)

        try:
            while True:
                # Keep socket open without requiring client messages.
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await _remove_client(app, ws)

    return app


async def _connect_loop(app: FastAPI) -> None:
    while True:
        if not app.state.connector.is_connected():
            try:
                connected = await app.state.connector.connect(paper=app.state.settings.paper_trading)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("IBKR connect loop error: %s", exc)
                connected = False
            if connected:
                await _bootstrap_market_data(app)
        elif not app.state.market_data.market_ready:
            await _bootstrap_market_data(app)
        await asyncio.sleep(max(1.0, app.state.settings.connect_retry_seconds))


async def _refresh_loop(app: FastAPI) -> None:
    while True:
        interval = app.state.settings.refresh_interval_seconds
        if interval is None:
            interval = max(0.05, app.state.store.snapshot.config.update_interval_ms / 1000)

        await asyncio.sleep(interval)

        snapshot = app.state.store.snapshot
        if app.state.connector.is_connected():
            await _ingest_market_data(app)

        if app.state.market_data.force_snapshot_broadcast:
            app.state.market_data.force_snapshot_broadcast = False
            app.state.store.sync_baseline()
            msg = {
                "type": "snapshot",
                "schema_version": 1,
                "ts_ms": now_ms(),
                "payload": snapshot.model_dump(),
            }
            await _broadcast(app, msg)
            continue

        spot = snapshot.underlying.spot.mid
        if snapshot.rows and spot is not None and spot > 0:
            analytics = run_analytics(
                _build_contract_quotes(snapshot),
                spot=spot,
                config=snapshot.config.model_dump(),
                residual_history_by_contract=app.state.residual_history,
            )
            app.state.residual_history = analytics.residual_history_by_contract
            _apply_analytics(snapshot, analytics, spot)

        # Keep fallback summary values coherent when analytics data is sparse.
        app.state.store.derive_summary_defaults()
        _update_summary_quality(
            snapshot,
            server_now_ms=now_ms(),
            subscriptions=_subscription_count(app),
        )
        delta = app.state.store.compute_delta()
        if delta is None:
            continue

        msg = {
            "type": "delta",
            "schema_version": 1,
            "ts_ms": now_ms(),
            "payload": {
                "underlying_patch": delta.underlying_patch,
                "summary_patch": delta.summary_patch,
                "row_patches": delta.row_patches,
            },
        }
        await _broadcast(app, msg)


async def _heartbeat_loop(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(max(0.1, app.state.settings.heartbeat_interval_seconds))
        payload = HeartbeatPayload(
            server_ts_ms=now_ms(),
            ibkr_connected=app.state.connector.is_connected(),
            subscriptions=_subscription_count(app),
        )

        msg = {
            "type": "heartbeat",
            "schema_version": 1,
            "ts_ms": now_ms(),
            "payload": payload.model_dump(),
        }
        await _broadcast(app, msg)


def _clean_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed


def _coerce_int(value: Any) -> int | None:
    parsed = _clean_number(value)
    if parsed is None:
        return None
    return int(parsed)


def _normalize_expiry(raw_expiry: Any) -> str:
    expiry = str(raw_expiry or "")
    return expiry[:8] if len(expiry) >= 8 else expiry


def _format_strike(strike: float) -> str:
    return f"{strike:.4f}".rstrip("0").rstrip(".")


def _contract_id(contract: Contract) -> str:
    conid = int(getattr(contract, "conId", 0) or 0)
    symbol = str(getattr(contract, "symbol", ""))
    expiry = _normalize_expiry(getattr(contract, "lastTradeDateOrContractMonth", ""))
    right = str(getattr(contract, "right", "")).upper()
    strike = float(getattr(contract, "strike", 0.0) or 0.0)
    return f"{conid}:{symbol}:{expiry}:{right}:{_format_strike(strike)}"


def _ticker_timestamp_ms(ticker: Any) -> int | None:
    ts = getattr(ticker, "time", None)
    if ts is None:
        return None
    with contextlib.suppress(Exception):
        return int(ts.timestamp() * 1000)
    return None


def _spot_from_ticker(ticker: Any) -> UnderlyingSpot:
    bid = _clean_number(getattr(ticker, "bid", None))
    ask = _clean_number(getattr(ticker, "ask", None))
    last = _clean_number(getattr(ticker, "last", None))
    ts_ms = _ticker_timestamp_ms(ticker) or now_ms()

    mid: float | None = None
    if bid is not None and ask is not None and bid > 0 and ask > 0 and ask >= bid:
        mid = (bid + ask) / 2.0
    elif last is not None and last > 0:
        mid = last

    return UnderlyingSpot(
        bid=bid,
        ask=ask,
        last=last,
        mid=mid,
        ts_ms=ts_ms,
    )


def _build_option_grids(options: list[Contract]) -> dict[str, dict[float, dict[str, Contract]]]:
    expiry_grid: dict[str, dict[float, dict[str, Contract]]] = {}
    for contract in options:
        expiry = _normalize_expiry(getattr(contract, "lastTradeDateOrContractMonth", ""))
        right = str(getattr(contract, "right", "")).upper()
        strike = _clean_number(getattr(contract, "strike", None))
        if not expiry or right not in {"C", "P"} or strike is None or strike <= 0:
            continue
        expiry_entry = expiry_grid.setdefault(expiry, {})
        strike_entry = expiry_entry.setdefault(float(strike), {})
        strike_entry[right] = contract

    filtered: dict[str, dict[float, dict[str, Contract]]] = {}
    for expiry, strikes in expiry_grid.items():
        contracts_by_strike: dict[float, dict[str, Contract]] = {}
        for strike in sorted(strikes):
            rights = strikes[strike]
            if "C" in rights and "P" in rights:
                contracts_by_strike[strike] = {"C": rights["C"], "P": rights["P"]}
        if contracts_by_strike:
            filtered[expiry] = contracts_by_strike
    return filtered


async def _select_viable_expiry(
    app: FastAPI,
    expiry_grids: dict[str, dict[float, dict[str, Contract]]],
    spot: float,
) -> tuple[str, dict[float, dict[str, Contract]]]:
    if not expiry_grids:
        return "", {}

    for expiry in sorted(expiry_grids):
        contracts_by_strike = expiry_grids[expiry]
        strikes = sorted(contracts_by_strike)
        if not strikes:
            continue
        candidate_window = app.state.window_manager.target_window(strikes, spot)
        if not candidate_window:
            continue

        center = len(candidate_window) // 2
        sample_strikes = candidate_window[max(0, center - 1) : min(len(candidate_window), center + 2)]
        sample_contracts: list[Contract] = []
        for strike in sample_strikes:
            rights = contracts_by_strike.get(strike, {})
            if "C" in rights:
                sample_contracts.append(rights["C"])
            if "P" in rights:
                sample_contracts.append(rights["P"])

        qualified = await app.state.connector.qualify_contracts(sample_contracts)
        if len(qualified) >= 2:
            return expiry, contracts_by_strike

    fallback_expiry = sorted(expiry_grids.keys())[0]
    return fallback_expiry, expiry_grids[fallback_expiry]


def _apply_soft_limit(strikes: list[float], max_subscriptions_soft_limit: int) -> list[float]:
    max_option_contracts = max(2, max_subscriptions_soft_limit - 1)
    max_strikes = max(1, max_option_contracts // 2)
    ordered = sorted(strikes)
    if len(ordered) <= max_strikes:
        return ordered
    start = max(0, (len(ordered) - max_strikes) // 2)
    end = start + max_strikes
    return ordered[start:end]


async def _bootstrap_market_data(app: FastAPI) -> None:
    if not app.state.connector.is_connected():
        return

    market: MarketDataRuntime = app.state.market_data
    snapshot = app.state.store.snapshot
    if market.market_ready or market.bootstrap_inflight:
        return
    market.bootstrap_inflight = True

    try:
        subscribe_underlying = getattr(app.state.connector, "subscribe_underlying_stream", None)
        if not callable(subscribe_underlying):
            return
        if market.underlying_ticker is None:
            market.underlying_ticker = await subscribe_underlying(market.symbol)
        if market.underlying_ticker is None:
            return

        spot_state = _spot_from_ticker(market.underlying_ticker)
        app.state.store.update_underlying_spot(spot_state)
        if spot_state.mid is None or spot_state.mid <= 0:
            return

        get_option_chain = getattr(app.state.connector, "get_option_chain", None)
        if not callable(get_option_chain):
            return
        options = await get_option_chain(symbol=market.symbol, min_dte=0, max_dte=1)
        expiry_grids = _build_option_grids(options)
        expiry, contracts_by_strike = await _select_viable_expiry(app, expiry_grids, spot_state.mid)
        if not expiry or not contracts_by_strike:
            return

        market.expiry = expiry
        snapshot.underlying.expiry = expiry
        market.option_contracts_by_strike = contracts_by_strike
        market.all_strikes = sorted(contracts_by_strike)
        reference_spot = spot_state.mid

        target = app.state.window_manager.target_window(market.all_strikes, reference_spot)
        target = _apply_soft_limit(target, snapshot.config.max_subscriptions_soft_limit)
        await _set_active_window(app, target, reason="bootstrap")
        market.market_ready = bool(market.active_window_strikes)

        logger.info(
            "IBKR market bootstrap complete: expiry=%s strikes=%s",
            market.expiry,
            len(market.active_window_strikes or []),
        )
    finally:
        market.bootstrap_inflight = False


async def _switch_symbol(app: FastAPI, symbol: str) -> None:
    market: MarketDataRuntime = app.state.market_data
    market.switch_inflight = True
    try:
        await _set_active_window(app, [], reason="switch")
        if market.underlying_ticker is not None:
            contract = getattr(market.underlying_ticker, "contract", None)
            if contract is not None:
                app.state.connector.cancel_market_data(contract)
            market.underlying_ticker = None

        market.symbol = symbol
        market.expiry = ""
        market.market_ready = False
        market.option_contracts_by_strike = {}
        market.all_strikes = []
        market.active_window_strikes = []
        market.contract_by_id = {}
        market.ticker_by_id = {}
        app.state.residual_history = {}

        snapshot = app.state.store.snapshot
        snapshot.underlying.symbol = symbol
        snapshot.underlying.expiry = ""
        snapshot.rows = []
        app.state.store.update_underlying_spot(UnderlyingSpot())
        market.force_snapshot_broadcast = True
        logger.info("Switched active symbol to %s", symbol)
    finally:
        market.switch_inflight = False


async def _ingest_market_data(app: FastAPI) -> None:
    market: MarketDataRuntime = app.state.market_data
    snapshot = app.state.store.snapshot
    cfg = snapshot.config

    if market.underlying_ticker is not None:
        app.state.store.update_underlying_spot(_spot_from_ticker(market.underlying_ticker))
    elif app.state.connector.is_connected():
        subscribe_underlying = getattr(app.state.connector, "subscribe_underlying_stream", None)
        if callable(subscribe_underlying):
            market.underlying_ticker = await subscribe_underlying(market.symbol)
        if market.underlying_ticker is not None:
            app.state.store.update_underlying_spot(_spot_from_ticker(market.underlying_ticker))

    if app.state.connector.is_connected() and not market.market_ready:
        await _bootstrap_market_data(app)
        if not market.market_ready:
            return

    server_now_ms = now_ms()
    tickers = market.ticker_by_id or {}
    for row in snapshot.rows:
        _update_contract_block_from_ticker(row.call, tickers.get(row.call.contract_id), cfg, "C", server_now_ms)
        _update_contract_block_from_ticker(row.put, tickers.get(row.put.contract_id), cfg, "P", server_now_ms)

    spot = snapshot.underlying.spot.mid
    if (
        spot is not None
        and spot > 0
        and market.all_strikes
        and market.active_window_strikes
        and (time() - market.last_roll_ts) >= 1.0
    ):
        await _roll_window_if_needed(app, spot)


async def _roll_window_if_needed(app: FastAPI, spot: float) -> None:
    market: MarketDataRuntime = app.state.market_data
    current = market.active_window_strikes or []
    all_strikes = market.all_strikes or []
    if not current or not all_strikes:
        return
    if not app.state.window_manager.should_roll(current, all_strikes, spot):
        return

    plan = app.state.window_manager.plan_roll(current, all_strikes, spot)
    target = _apply_soft_limit(plan.target_strikes, app.state.store.snapshot.config.max_subscriptions_soft_limit)
    await _set_active_window(app, target, reason="roll")


async def _set_active_window(app: FastAPI, target_strikes: list[float], reason: str) -> None:
    market: MarketDataRuntime = app.state.market_data
    contracts_by_strike = market.option_contracts_by_strike or {}
    current = set(market.active_window_strikes or [])
    target = sorted(set(target_strikes))
    if set(target) == current:
        return

    remove_strikes = sorted(current - set(target))
    add_strikes = sorted(set(target) - current)

    for strike in remove_strikes:
        rights = contracts_by_strike.get(strike, {})
        for contract in rights.values():
            contract_id = _contract_id(contract)
            app.state.connector.cancel_market_data(contract)
            if market.ticker_by_id is not None:
                market.ticker_by_id.pop(contract_id, None)
            if market.contract_by_id is not None:
                market.contract_by_id.pop(contract_id, None)

    batch_size = 5
    retained = sorted(current & set(target))
    successful_adds: list[float] = []
    for offset in range(0, len(add_strikes), batch_size):
        strike_batch = add_strikes[offset : offset + batch_size]
        contracts_to_qualify: list[Contract] = []
        for strike in strike_batch:
            rights = contracts_by_strike.get(strike, {})
            for right in ("C", "P"):
                contract = rights.get(right)
                if contract is not None:
                    contracts_to_qualify.append(contract)

        qualified = await app.state.connector.qualify_contracts(contracts_to_qualify)
        qualified_map: dict[tuple[str, float, str], Contract] = {}
        for contract in qualified:
            key = (
                _normalize_expiry(getattr(contract, "lastTradeDateOrContractMonth", "")),
                float(getattr(contract, "strike", 0.0)),
                str(getattr(contract, "right", "")).upper(),
            )
            qualified_map[key] = contract

        for strike in strike_batch:
            rights = contracts_by_strike.get(strike, {})
            subscribed_rights: dict[str, Contract] = {}
            for right in ("C", "P"):
                contract = rights.get(right)
                if contract is None:
                    continue
                qualified_contract = qualified_map.get(
                    (
                        _normalize_expiry(getattr(contract, "lastTradeDateOrContractMonth", "")),
                        float(getattr(contract, "strike", 0.0)),
                        right,
                    ),
                )
                if qualified_contract is None:
                    continue
                contract_id = _contract_id(qualified_contract)
                ticker = await app.state.connector.subscribe_option_stream(qualified_contract)
                if ticker is None:
                    continue
                subscribed_rights[right] = qualified_contract
                if market.contract_by_id is not None:
                    market.contract_by_id[contract_id] = qualified_contract
                if market.ticker_by_id is not None:
                    market.ticker_by_id[contract_id] = ticker

            if len(subscribed_rights) == 2:
                rights["C"] = subscribed_rights["C"]
                rights["P"] = subscribed_rights["P"]
                successful_adds.append(strike)
            else:
                for partial in subscribed_rights.values():
                    contract_id = _contract_id(partial)
                    app.state.connector.cancel_market_data(partial)
                    if market.contract_by_id is not None:
                        market.contract_by_id.pop(contract_id, None)
                    if market.ticker_by_id is not None:
                        market.ticker_by_id.pop(contract_id, None)

        if offset + batch_size < len(add_strikes):
            await asyncio.sleep(0.1)

    market.active_window_strikes = sorted(retained + successful_adds)
    market.last_roll_ts = time()
    _rebuild_rows_for_active_window(app)
    market.force_snapshot_broadcast = True
    logger.info(
        "Updated strike window (%s): active=%s add=%s remove=%s",
        reason,
        len(market.active_window_strikes),
        len(successful_adds),
        len(remove_strikes),
    )


def _rebuild_rows_for_active_window(app: FastAPI) -> None:
    market: MarketDataRuntime = app.state.market_data
    snapshot = app.state.store.snapshot
    contracts_by_strike = market.option_contracts_by_strike or {}
    active_strikes = market.active_window_strikes or []

    existing_rows = {row.strike: row for row in snapshot.rows}
    rebuilt_rows: list[StrikeRow] = []
    for strike in active_strikes:
        rights = contracts_by_strike.get(strike, {})
        call_contract = rights.get("C")
        put_contract = rights.get("P")
        if call_contract is None or put_contract is None:
            continue

        call_id = _contract_id(call_contract)
        put_id = _contract_id(put_contract)
        row = existing_rows.get(strike)
        if row is None:
            row = StrikeRow(
                strike=strike,
                call=ContractBlock(contract_id=call_id),
                put=ContractBlock(contract_id=put_id),
            )
        else:
            if row.call.contract_id != call_id:
                row.call = ContractBlock(contract_id=call_id)
            if row.put.contract_id != put_id:
                row.put = ContractBlock(contract_id=put_id)

        rebuilt_rows.append(row)

    snapshot.rows = rebuilt_rows
    snapshot.underlying.expiry = market.expiry


def _update_contract_block_from_ticker(
    block: ContractBlock,
    ticker: Any | None,
    config: Any,
    right: str,
    server_now_ms: int,
) -> None:
    if ticker is None:
        block.liquid = False
        block.stale_ms = max(block.stale_ms, config.max_stale_ms * 4)
        return

    bid = _clean_number(getattr(ticker, "bid", None))
    ask = _clean_number(getattr(ticker, "ask", None))
    last = _clean_number(getattr(ticker, "last", None))

    mid: float | None = None
    spread: float | None = None
    spread_pct: float | None = None
    if bid is not None and ask is not None and bid > 0 and ask > 0 and ask >= bid:
        mid = (bid + ask) / 2.0
        spread = ask - bid
    elif last is not None and last > 0:
        mid = last

    if spread is not None and mid is not None and mid > 0:
        spread_pct = spread / mid

    greeks = getattr(ticker, "modelGreeks", None) or getattr(ticker, "lastGreeks", None)
    iv = _clean_number(getattr(greeks, "impliedVol", None)) if greeks else None
    delta = _clean_number(getattr(greeks, "delta", None)) if greeks else None
    gamma = _clean_number(getattr(greeks, "gamma", None)) if greeks else None
    vega = _clean_number(getattr(greeks, "vega", None)) if greeks else None
    theta = _clean_number(getattr(greeks, "theta", None)) if greeks else None

    bid_size = _coerce_int(getattr(ticker, "bidSize", None))
    ask_size = _coerce_int(getattr(ticker, "askSize", None))
    volume = _coerce_int(getattr(ticker, "volume", None))
    oi_attr = "callOpenInterest" if right == "C" else "putOpenInterest"
    oi = _coerce_int(getattr(ticker, oi_attr, None))
    if oi is None:
        oi = _coerce_int(getattr(ticker, "openInterest", None))

    ts_ms = _ticker_timestamp_ms(ticker)
    if ts_ms is None and (mid is not None or iv is not None or volume is not None or oi is not None):
        ts_ms = server_now_ms
    stale_ms = (server_now_ms - ts_ms) if ts_ms is not None else config.max_stale_ms * 4

    liquid = (
        mid is not None
        and mid > 0
        and spread_pct is not None
        and spread_pct <= config.max_spread_pct
        and bid_size is not None
        and bid_size >= config.min_bid_size
        and ask_size is not None
        and ask_size >= config.min_ask_size
        and stale_ms <= config.max_stale_ms
    )

    gamma_per_dollar = (gamma / mid) if gamma is not None and mid is not None and mid > 0 else None
    vega_per_dollar = (vega / mid) if vega is not None and mid is not None and mid > 0 else None
    theta_per_dollar = (abs(theta) / mid) if theta is not None and mid is not None and mid > 0 else None

    block.mid = mid
    block.iv = iv
    block.delta = delta
    block.gamma = gamma
    block.vega = vega
    block.theta = theta
    block.spread_pct = spread_pct
    block.volume = volume
    block.oi = oi
    block.stale_ms = stale_ms
    block.liquid = liquid
    block.per_dollar.gamma_per_dollar = gamma_per_dollar
    block.per_dollar.vega_per_dollar = vega_per_dollar
    block.per_dollar.theta_per_dollar = theta_per_dollar


def _build_contract_quotes(snapshot: StateSnapshot) -> list[dict[str, Any]]:
    quotes: list[dict[str, Any]] = []
    for row in snapshot.rows:
        for right, block in (("C", row.call), ("P", row.put)):
            quotes.append(
                {
                    "contract_id": block.contract_id,
                    "right": right,
                    "strike": row.strike,
                    "mid": block.mid,
                    "model_iv": block.iv,
                    "liquid": block.liquid,
                    "model_delta": block.delta,
                    "model_gamma": block.gamma,
                    "model_vega": block.vega,
                    "open_interest": block.oi,
                    "volume": block.volume,
                    "spread_pct": block.spread_pct,
                    "stale_ms": block.stale_ms,
                    "delta": block.delta,
                    "gamma_per_dollar": block.per_dollar.gamma_per_dollar,
                    "vega_per_dollar": block.per_dollar.vega_per_dollar,
                    "theta_per_dollar": block.per_dollar.theta_per_dollar,
                }
            )
    return quotes


def _apply_analytics(snapshot: StateSnapshot, analytics: AnalyticsOutput, spot: float) -> None:
    msi_by_strike = {item.strike: item for item in analytics.msi}
    msi_strikes = [item.strike for item in analytics.msi]

    snapshot.summary.msi_strikes = msi_strikes
    snapshot.summary.mtc_call_contract_id = (
        analytics.mtc.best_call.contract_id if analytics.mtc.best_call is not None else None
    )
    snapshot.summary.mtc_put_contract_id = (
        analytics.mtc.best_put.contract_id if analytics.mtc.best_put is not None else None
    )
    snapshot.summary.nearest_msi_distance_pct = (
        min(abs(strike - spot) / spot for strike in msi_strikes) if msi_strikes and spot > 0 else None
    )
    snapshot.summary.atm_strike = _nearest_strike(snapshot.rows, spot)

    if spot > 0:
        net_gex_band = 0.0
        band = snapshot.config.gex_band_pct
        for strike, exposure in analytics.exposures_by_strike.items():
            if abs(strike - spot) / spot <= band:
                net_gex_band += float(exposure.oi.gex or 0.0)
        snapshot.summary.net_gex_band = net_gex_band
    else:
        snapshot.summary.net_gex_band = None

    for row in snapshot.rows:
        msi = msi_by_strike.get(row.strike)
        row.msi_score = msi.msi_score if msi else None
        row.flags.is_msi = msi is not None
        row.flags.is_atm = row.strike == snapshot.summary.atm_strike
        row.flags.wall_type = msi.wall_type if msi else "none"

        exposure = analytics.exposures_by_strike.get(row.strike)
        if exposure:
            row.exposures.oi.dex = exposure.oi.dex
            row.exposures.oi.gex = exposure.oi.gex
            row.exposures.oi.vex = exposure.oi.vex
            row.exposures.vol.dex = exposure.vol.dex
            row.exposures.vol.gex = exposure.vol.gex
            row.exposures.vol.vex = exposure.vol.vex

        _apply_contract_analytics(
            row.call,
            analytics,
            analytics.mtc.best_call,
            max_stale_ms=snapshot.config.max_stale_ms,
        )
        _apply_contract_analytics(
            row.put,
            analytics,
            analytics.mtc.best_put,
            max_stale_ms=snapshot.config.max_stale_ms,
        )


def _update_summary_quality(snapshot: StateSnapshot, *, server_now_ms: int, subscriptions: int) -> None:
    contracts = [block for row in snapshot.rows for block in (row.call, row.put)]
    if not contracts:
        snapshot.summary.fresh_contract_ratio = None
        snapshot.summary.stream_latency_ms = _spot_latency_ms(snapshot, server_now_ms)
        snapshot.summary.data_quality_score = None
        snapshot.summary.market_regime = "unknown"
        return

    max_stale_ms = max(1, snapshot.config.max_stale_ms)
    fresh_count = sum(1 for block in contracts if block.stale_ms <= max_stale_ms)
    fresh_ratio = fresh_count / len(contracts)
    snapshot.summary.fresh_contract_ratio = fresh_ratio

    contract_staleness = sorted(max(0, int(block.stale_ms)) for block in contracts)
    median_contract_staleness = contract_staleness[len(contract_staleness) // 2]
    spot_latency_ms = _spot_latency_ms(snapshot, server_now_ms)
    stream_latency_ms = (
        max(median_contract_staleness, spot_latency_ms)
        if spot_latency_ms is not None
        else median_contract_staleness
    )
    snapshot.summary.stream_latency_ms = stream_latency_ms

    staleness_ratio = min(1.0, stream_latency_ms / (max_stale_ms * 3))
    sub_ratio = min(1.0, subscriptions / max(1, snapshot.config.max_subscriptions_soft_limit))
    quality = (fresh_ratio * 0.7) + ((1 - staleness_ratio) * 0.2) + ((1 - sub_ratio) * 0.1)
    snapshot.summary.data_quality_score = max(0.0, min(1.0, quality))
    snapshot.summary.market_regime = _derive_market_regime(snapshot)


def _spot_latency_ms(snapshot: StateSnapshot, server_now_ms: int) -> int | None:
    ts_ms = snapshot.underlying.spot.ts_ms
    if ts_ms <= 0:
        return None
    return max(0, int(server_now_ms - ts_ms))


def _derive_market_regime(snapshot: StateSnapshot) -> str:
    summary = snapshot.summary
    if not snapshot.rows:
        return "unknown"

    pin_risk = float(summary.pin_risk or 0.0)
    nearest = summary.nearest_msi_distance_pct
    net_gex = summary.net_gex_band

    if nearest is not None and pin_risk >= 65 and nearest <= 0.008:
        return "pinning"

    if net_gex is not None and abs(net_gex) >= 1_000_000 and pin_risk <= 45:
        return "trend"

    if (nearest is not None and nearest <= 0.02) or (
        net_gex is not None and abs(net_gex) >= 250_000
    ):
        return "transition"

    return "unknown"


def _nearest_strike(rows: list[StrikeRow], spot: float) -> float | None:
    if spot <= 0 or not rows:
        return None
    return min(rows, key=lambda row: abs(row.strike - spot)).strike


def _apply_contract_analytics(
    block: ContractBlock,
    analytics: AnalyticsOutput,
    mtc_selection: Any,
    *,
    max_stale_ms: int,
) -> None:
    block.iv_residual = analytics.iv_fit.residual_by_contract.get(block.contract_id)
    block.highlights.iv_imbalance = analytics.iv_imbalance_by_contract.get(block.contract_id, False)
    block.highlights.extreme_greek = analytics.extreme_greek_by_contract.get(block.contract_id, False)
    block.highlights.stale_level = _stale_level(block.stale_ms, max_stale_ms)

    if mtc_selection is None or block.contract_id != mtc_selection.contract_id:
        block.mtc_score = None
        block.mtc_rationale = None
        return

    rationale = mtc_selection.rationale
    notes: list[str] = []
    if not rationale.gate_liquid:
        notes.append("liquidity-gate-failed")
    if not rationale.gate_delta_band:
        notes.append("delta-gate-failed")

    block.mtc_score = mtc_selection.tradable_score
    block.mtc_rationale = MtcRationale(
        liquidity_score=rationale.liquidity_score,
        cheap_iv_score=rationale.cheap_iv_score,
        efficiency_score=rationale.efficiency_score,
        stability_score=rationale.stability_score,
        tradable_score=mtc_selection.tradable_score,
        gate_liquid=rationale.gate_liquid,
        gate_delta_band=rationale.gate_delta_band,
        notes=notes,
    )


def _stale_level(stale_ms: int, max_stale_ms: int) -> str:
    if stale_ms > max_stale_ms * 3:
        return "critical"
    if stale_ms > max_stale_ms:
        return "stale"
    return "fresh"


def _subscription_count(app: FastAPI) -> int:
    tickers = getattr(app.state.connector.ib, "tickers", None)
    if callable(tickers):
        with contextlib.suppress(Exception):
            return len(list(tickers()))
    return 0


async def _add_client(app: FastAPI, ws: WebSocket) -> None:
    if ws in app.state.clients:
        return

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=app.state.settings.client_queue_size)
    session = ClientSession(queue=queue)
    app.state.clients[ws] = session
    session.sender_task = asyncio.create_task(_client_sender(app, ws))


async def _remove_client(app: FastAPI, ws: WebSocket) -> None:
    session = app.state.clients.pop(ws, None)
    if session is None:
        return

    current = asyncio.current_task()
    if session.sender_task and session.sender_task is not current:
        session.sender_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await session.sender_task

    with contextlib.suppress(Exception):
        await ws.close()


async def _client_sender(app: FastAPI, ws: WebSocket) -> None:
    try:
        while True:
            session = app.state.clients.get(ws)
            if session is None:
                return
            msg = await session.queue.get()
            await ws.send_json(msg)
    except Exception:
        app.state.clients.pop(ws, None)
        with contextlib.suppress(Exception):
            await ws.close()


async def _enqueue_message(app: FastAPI, ws: WebSocket, msg: dict[str, Any]) -> None:
    session = app.state.clients.get(ws)
    if session is None:
        return

    if session.queue.full():
        with contextlib.suppress(asyncio.QueueEmpty):
            session.queue.get_nowait()
        session.dropped_since_log += 1
        now = time()
        if now - session.last_drop_log_ts >= app.state.settings.queue_drop_log_interval_seconds:
            logger.warning("WS queue full: dropped %s oldest messages", session.dropped_since_log)
            session.last_drop_log_ts = now
            session.dropped_since_log = 0

    with contextlib.suppress(asyncio.QueueFull):
        session.queue.put_nowait(msg)


async def _broadcast(app: FastAPI, msg: dict[str, Any]) -> None:
    for ws in list(app.state.clients):
        await _enqueue_message(app, ws, msg)


app = create_app()
