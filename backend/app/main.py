from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from dataclasses import dataclass
from time import time
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.analytics.engine import AnalyticsOutput, run_analytics
from app.config_store import ConfigStore
from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector
from app.ibkr.window_manager import StrikeWindowManager
from app.schemas import (
    ConfigUpdate,
    ContractBlock,
    HealthResponse,
    HeartbeatPayload,
    MtcRationale,
    StateSnapshot,
    build_default_snapshot,
)
from app.state.store import RuntimeStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RuntimeSettings:
    heartbeat_interval_seconds: float = 2.0
    refresh_interval_seconds: float | None = None
    client_queue_size: int = 32
    queue_drop_log_interval_seconds: float = 10.0
    startup_connect: bool = False
    connect_retry_seconds: float = 5.0
    paper_trading: bool = True

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        return cls(
            startup_connect=os.getenv("IBKR_AUTO_CONNECT", "0") == "1",
            paper_trading=os.getenv("IBKR_CONNECT_PAPER", "1") == "1",
        )


@dataclass
class ClientSession:
    queue: asyncio.Queue[dict[str, Any]]
    sender_task: asyncio.Task[None] | None = None
    dropped_since_log: int = 0
    last_drop_log_ts: float = 0.0


def now_ms() -> int:
    return int(time() * 1000)


def create_app(
    settings: RuntimeSettings | None = None,
    config_store: ConfigStore | None = None,
    connector: IBKRConnector | None = None,
) -> FastAPI:
    runtime_settings = settings or RuntimeSettings.from_env()

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
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

            with contextlib.suppress(Exception):
                await app.state.connector.disconnect()

    app = FastAPI(title="QQQ 0DTE Ladder Backend", version="1.0.0", lifespan=lifespan)
    app.state.settings = runtime_settings
    app.state.config_store = config_store or ConfigStore()
    app.state.connector = connector or IBKRConnector(IBKRConfig.from_env())
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

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            ok=True,
            server_ts_ms=now_ms(),
            ibkr_connected=app.state.connector.is_connected(),
            subscriptions=_subscription_count(app),
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

        return updated

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
            await app.state.connector.connect(paper=app.state.settings.paper_trading)
        await asyncio.sleep(max(1.0, app.state.settings.connect_retry_seconds))


async def _refresh_loop(app: FastAPI) -> None:
    while True:
        interval = app.state.settings.refresh_interval_seconds
        if interval is None:
            interval = max(0.05, app.state.store.snapshot.config.update_interval_ms / 1000)

        await asyncio.sleep(interval)

        snapshot = app.state.store.snapshot
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


def _build_contract_quotes(snapshot: StateSnapshot) -> list[dict[str, Any]]:
    quotes: list[dict[str, Any]] = []
    for row in snapshot.rows:
        for right, block in (("C", row.call), ("P", row.put)):
            quotes.append(
                {
                    "contract_id": block.contract_id,
                    "right": right,
                    "strike": row.strike,
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
        row.flags.wall_type = msi.wall_type if msi else "none"

        exposure = analytics.exposures_by_strike.get(row.strike)
        if exposure:
            row.exposures.oi.dex = exposure.oi.dex
            row.exposures.oi.gex = exposure.oi.gex
            row.exposures.oi.vex = exposure.oi.vex
            row.exposures.vol.dex = exposure.vol.dex
            row.exposures.vol.gex = exposure.vol.gex
            row.exposures.vol.vex = exposure.vol.vex

        _apply_contract_analytics(row.call, analytics, analytics.mtc.best_call)
        _apply_contract_analytics(row.put, analytics, analytics.mtc.best_put)


def _apply_contract_analytics(
    block: ContractBlock,
    analytics: AnalyticsOutput,
    mtc_selection: Any,
) -> None:
    block.iv_residual = analytics.iv_fit.residual_by_contract.get(block.contract_id)

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
