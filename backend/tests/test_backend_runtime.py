from __future__ import annotations

import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.config_store import ConfigStore
from app.main import RuntimeSettings, create_app
from app.schemas import ContractBlock, PerDollarGreeks, StrikeRow


class DummyIB:
    def __init__(self, subscriptions: int = 0):
        self._subscriptions = subscriptions

    def tickers(self):
        return [object() for _ in range(self._subscriptions)]


class DummyConnector:
    def __init__(self, connected: bool = True, subscriptions: int = 0):
        self._connected = connected
        self.ib = DummyIB(subscriptions=subscriptions)
        self.cancelled: list = []

    async def connect(self, paper: bool = True) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    def cancel_market_data(self, contract) -> None:
        self.cancelled.append(contract)


def _make_app(tmp_path, subscriptions: int = 0, seed_rows: bool = False):
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
    if seed_rows:
        app.state.store.snapshot.underlying.spot.mid = 430.0
        app.state.store.snapshot.rows = [
            StrikeRow(
                strike=430.0,
                call=ContractBlock(
                    contract_id="call-430",
                    mid=1.20,
                    iv=0.22,
                    delta=0.45,
                    gamma=0.01,
                    vega=0.10,
                    theta=-0.02,
                    spread_pct=0.03,
                    volume=120,
                    oi=300,
                    liquid=True,
                    stale_ms=100,
                    per_dollar=PerDollarGreeks(
                        gamma_per_dollar=0.018,
                        vega_per_dollar=0.090,
                        theta_per_dollar=0.012,
                    ),
                ),
                put=ContractBlock(
                    contract_id="put-430",
                    mid=1.15,
                    iv=0.24,
                    delta=-0.48,
                    gamma=0.011,
                    vega=0.095,
                    theta=-0.018,
                    spread_pct=0.025,
                    volume=115,
                    oi=280,
                    liquid=True,
                    stale_ms=120,
                    per_dollar=PerDollarGreeks(
                        gamma_per_dollar=0.017,
                        vega_per_dollar=0.085,
                        theta_per_dollar=0.011,
                    ),
                ),
            )
        ]
    return app


def test_websocket_sends_snapshot_on_connect(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        with client.websocket_connect("/stream") as ws:
            message = ws.receive_json()
            assert message["type"] == "snapshot"
            assert message["schema_version"] == 1
            assert message["payload"]["underlying"]["symbol"] == "QQQ"
            summary = message["payload"]["summary"]
            assert "market_regime" in summary
            assert "data_quality_score" in summary
            assert "fresh_contract_ratio" in summary
            assert "stream_latency_ms" in summary


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


def test_refresh_loop_populates_msi_and_mtc_fields(tmp_path):
    app = _make_app(tmp_path, seed_rows=True)
    with TestClient(app) as client:
        with client.websocket_connect("/stream") as ws:
            ws.receive_json()  # snapshot

            analytics_delta = None
            for _ in range(40):
                message = ws.receive_json()
                if message["type"] != "delta":
                    continue
                summary_patch = message["payload"]["summary_patch"]
                if (
                    summary_patch.get("mtc_call_contract_id") == "call-430"
                    and summary_patch.get("mtc_put_contract_id") == "put-430"
                ):
                    analytics_delta = message
                    break

            assert analytics_delta is not None
            summary = analytics_delta["payload"]["summary_patch"]
            assert summary["msi_strikes"] == [430.0]
            assert summary["market_regime"] in {"pinning", "trend", "transition", "unknown"}
            assert 0.0 <= summary["data_quality_score"] <= 1.0
            assert 0.0 <= summary["fresh_contract_ratio"] <= 1.0
            assert summary["stream_latency_ms"] >= 0

            row_patches = analytics_delta["payload"]["row_patches"]
            assert row_patches
            row = row_patches[0]
            assert row["flags"]["is_msi"] is True
            assert row["call"]["mtc_score"] is not None
            assert row["put"]["mtc_score"] is not None


def test_health_reports_current_symbol(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["symbol"] == "QQQ"


def _seed_market(app):
    market = app.state.market_data
    call = SimpleNamespace(
        conId=1, symbol="QQQ", lastTradeDateOrContractMonth="20260630", right="C", strike=430.0
    )
    put = SimpleNamespace(
        conId=2, symbol="QQQ", lastTradeDateOrContractMonth="20260630", right="P", strike=430.0
    )
    market.underlying_ticker = SimpleNamespace(contract=SimpleNamespace(conId=3, symbol="QQQ"))
    market.expiry = "20260630"
    market.market_ready = True
    market.option_contracts_by_strike = {430.0: {"C": call, "P": put}}
    market.all_strikes = [430.0]
    market.active_window_strikes = [430.0]


def test_control_symbol_rejects_unknown_symbol(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        response = client.post("/control/symbol", json={"symbol": "TSLA"})
        assert response.status_code == 400
        assert app.state.market_data.symbol == "QQQ"
        assert app.state.store.snapshot.underlying.symbol == "QQQ"
        assert app.state.connector.cancelled == []


def test_control_symbol_switch_resets_runtime_and_snapshot(tmp_path):
    app = _make_app(tmp_path, seed_rows=True)
    with TestClient(app) as client:
        _seed_market(app)
        response = client.post("/control/symbol", json={"symbol": "SPY"})
        assert response.status_code == 200
        assert response.json() == {"symbol": "SPY"}

        market = app.state.market_data
        assert market.symbol == "SPY"
        assert market.market_ready is False
        assert market.underlying_ticker is None
        assert market.expiry == ""
        assert market.option_contracts_by_strike == {}
        assert market.all_strikes == []
        assert market.active_window_strikes == []
        assert market.contract_by_id == {}
        assert market.ticker_by_id == {}

        snapshot = app.state.store.snapshot
        assert snapshot.underlying.symbol == "SPY"
        assert snapshot.underlying.expiry == ""
        assert snapshot.rows == []
        assert snapshot.underlying.spot.mid is None

        # call + put option cancels from window teardown, plus the underlying
        assert len(app.state.connector.cancelled) == 3

        assert client.get("/health").json()["symbol"] == "SPY"


def test_control_symbol_same_symbol_is_noop(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        _seed_market(app)
        response = client.post("/control/symbol", json={"symbol": "QQQ"})
        assert response.status_code == 200
        assert response.json() == {"symbol": "QQQ"}
        assert app.state.market_data.market_ready is True
        assert app.state.market_data.underlying_ticker is not None
        assert app.state.connector.cancelled == []
