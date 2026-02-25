from __future__ import annotations

import asyncio
import contextlib
from time import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.config_store import ConfigStore
from app.ibkr.config import IBKRConfig
from app.ibkr.connector import IBKRConnector
from app.schemas import ConfigUpdate, HealthResponse, HeartbeatPayload, StateSnapshot, build_default_snapshot


def now_ms() -> int:
    return int(time() * 1000)


def create_app() -> FastAPI:
    app = FastAPI(title="QQQ 0DTE Ladder Backend", version="1.0.0")

    app.state.config_store = ConfigStore()
    app.state.connector = IBKRConnector(IBKRConfig.from_env())
    app.state.snapshot = build_default_snapshot(app.state.config_store.config)
    app.state.clients: set[WebSocket] = set()
    app.state.heartbeat_task: asyncio.Task | None = None

    @app.on_event("startup")
    async def startup_event() -> None:
        app.state.heartbeat_task = asyncio.create_task(_heartbeat_loop(app))

    @app.on_event("shutdown")
    async def shutdown_event() -> None:
        task = app.state.heartbeat_task
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

        for client in list(app.state.clients):
            with contextlib.suppress(Exception):
                await client.close()
        app.state.clients.clear()

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            ok=True,
            server_ts_ms=now_ms(),
            ibkr_connected=app.state.connector.is_connected(),
            subscriptions=0,
        )

    @app.get("/state", response_model=StateSnapshot)
    async def state() -> StateSnapshot:
        return app.state.snapshot

    @app.post("/config")
    async def update_config(update: ConfigUpdate):
        updated = app.state.config_store.update(update)
        app.state.snapshot.config = updated
        return updated

    @app.websocket("/stream")
    async def stream(ws: WebSocket) -> None:
        await ws.accept()
        app.state.clients.add(ws)

        snapshot_msg = {
            "type": "snapshot",
            "schema_version": 1,
            "ts_ms": now_ms(),
            "payload": app.state.snapshot.model_dump(),
        }
        await ws.send_json(snapshot_msg)

        try:
            while True:
                # Keep socket open without requiring client messages.
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            app.state.clients.discard(ws)

    return app


async def _heartbeat_loop(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(2)
        payload = HeartbeatPayload(
            server_ts_ms=now_ms(),
            ibkr_connected=app.state.connector.is_connected(),
            subscriptions=0,
        )

        msg = {
            "type": "heartbeat",
            "schema_version": 1,
            "ts_ms": now_ms(),
            "payload": payload.model_dump(),
        }

        disconnected: list[WebSocket] = []
        for client in list(app.state.clients):
            try:
                await client.send_json(msg)
            except Exception:
                disconnected.append(client)

        for client in disconnected:
            app.state.clients.discard(client)


app = create_app()
