from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.config_store import ConfigStore
from app.main import RuntimeSettings, create_app


class DummyIB:
    def __init__(self, subscriptions: int = 0):
        self._subscriptions = subscriptions

    def tickers(self):
        return [object() for _ in range(self._subscriptions)]


class DummyConnector:
    def __init__(self, connected: bool = True, subscriptions: int = 0):
        self._connected = connected
        self.ib = DummyIB(subscriptions=subscriptions)

    async def connect(self, paper: bool = True) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected


def _make_app(tmp_path, subscriptions: int = 0):
    default_cfg = {
        "update_interval_ms": 500,
        "window_strikes_each_side": 20,
        "roll_threshold_strikes": 2,
        "max_spread_pct": 0.12,
        "min_bid_size": 10,
        "min_ask_size": 10,
        "max_stale_ms": 1500,
        "min_fit_points": 8,
        "delta_band_min": 0.3,
        "delta_band_max": 0.65,
        "msi_bandwidth_pct": 0.0075,
        "gex_band_pct": 0.0075,
        "persistence_updates": 10,
        "persistence_fraction": 0.7,
        "iv_residual_scale": 0.015,
        "iv_imbalance_threshold": -0.01,
        "min_mid_for_extremes": 0.05,
        "max_subscriptions_soft_limit": 95,
    }
    (tmp_path / "config.default.json").write_text(json.dumps(default_cfg))

    app = create_app(
        settings=RuntimeSettings(heartbeat_interval_seconds=0.05, refresh_interval_seconds=0.05),
        config_store=ConfigStore(root_dir=tmp_path),
        connector=DummyConnector(connected=True, subscriptions=subscriptions),
    )
    return app


def test_websocket_sends_snapshot_on_connect(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/stream") as ws:
            message = ws.receive_json()
            assert message["type"] == "snapshot"
            assert message["schema_version"] == 1
            assert message["payload"]["underlying"]["symbol"] == "QQQ"


def test_websocket_sends_heartbeat(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/stream") as ws:
            ws.receive_json()  # snapshot
            heartbeat = None
            for _ in range(20):
                message = ws.receive_json()
                if message["type"] == "heartbeat":
                    heartbeat = message
                    break
            assert heartbeat is not None
            assert "server_ts_ms" in heartbeat["payload"]
            assert "subscriptions" in heartbeat["payload"]


def test_config_update_triggers_delta_patch(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/stream") as ws:
            ws.receive_json()  # snapshot

            # Drain the initial derived summary delta.
            for _ in range(20):
                msg = ws.receive_json()
                if msg["type"] == "delta":
                    break

            response = client.post("/config", json={"window_strikes_each_side": 25})
            assert response.status_code == 200
            assert response.json()["window_strikes_each_side"] == 25

            config_delta = None
            for _ in range(30):
                msg = ws.receive_json()
                if msg["type"] != "delta":
                    continue
                if msg["payload"]["summary_patch"].get("pin_risk") == 50.0:
                    config_delta = msg
                    break

            assert config_delta is not None
            assert config_delta["payload"]["row_patches"] == []


def test_health_reports_subscription_count(tmp_path):
    app = _make_app(tmp_path, subscriptions=3)
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["subscriptions"] == 3
