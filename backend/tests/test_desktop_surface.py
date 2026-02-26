from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import RuntimeSettings, create_app


class DummyIB:
    def tickers(self):
        return []


class DummyConnector:
    def __init__(self):
        self.ib = DummyIB()

    async def connect(self, paper: bool = True) -> bool:
        return False

    async def disconnect(self) -> None:
        return None

    def is_connected(self) -> bool:
        return False


def _make_desktop_app(tmp_path, *, with_frontend_dist: bool):
    app_data_dir = tmp_path / "app-data"
    frontend_dist = tmp_path / "frontend-dist"
    if with_frontend_dist:
        assets_dir = frontend_dist / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        (frontend_dist / "index.html").write_text("<html><body>Desktop Shell</body></html>")
        (assets_dir / "main.js").write_text("console.log('desktop');")

    return create_app(
        settings=RuntimeSettings(
            heartbeat_interval_seconds=0.05,
            refresh_interval_seconds=0.05,
            startup_connect=False,
            desktop_mode=True,
            app_data_dir=str(app_data_dir),
            frontend_dist_dir=str(frontend_dist),
        ),
        connector=DummyConnector(),
    )


def test_desktop_settings_defaults_and_update(tmp_path):
    app = _make_desktop_app(tmp_path, with_frontend_dist=False)
    with TestClient(app) as client:
        defaults = client.get("/desktop/settings")
        assert defaults.status_code == 200
        assert defaults.json()["connect_paper"] is False
        assert defaults.json()["client_id"] == 19
        assert defaults.json()["paper_port"] == 4002
        assert defaults.json()["live_port"] == 4001

        response = client.post(
            "/desktop/settings",
            json={
                "connect_paper": False,
                "client_id": 77,
                "host": "127.0.0.1",
                "paper_port": 4002,
                "live_port": 4001,
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["restart_required"] is True
        assert body["settings"]["connect_paper"] is False
        assert body["settings"]["client_id"] == 77

        settings_path = tmp_path / "app-data" / "desktop.settings.json"
        assert settings_path.exists()
        persisted = json.loads(settings_path.read_text())
        assert persisted["connect_paper"] is False
        assert persisted["client_id"] == 77


def test_desktop_settings_migrates_legacy_tws_default_ports(tmp_path):
    settings_path = tmp_path / "app-data" / "desktop.settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(
        json.dumps(
            {
                "connect_paper": False,
                "client_id": 19,
                "host": "127.0.0.1",
                "paper_port": 7497,
                "live_port": 7496,
            }
        )
    )

    app = _make_desktop_app(tmp_path, with_frontend_dist=False)
    with TestClient(app) as client:
        defaults = client.get("/desktop/settings")
        assert defaults.status_code == 200
        assert defaults.json()["paper_port"] == 4002
        assert defaults.json()["live_port"] == 4001

    migrated = json.loads(settings_path.read_text())
    assert migrated["paper_port"] == 4002
    assert migrated["live_port"] == 4001


def test_app_route_and_assets_served_from_frontend_dist(tmp_path):
    app = _make_desktop_app(tmp_path, with_frontend_dist=True)
    with TestClient(app) as client:
        app_response = client.get("/app")
        assert app_response.status_code == 200
        assert "Desktop Shell" in app_response.text

        assets_response = client.get("/assets/main.js")
        assert assets_response.status_code == 200
        assert "desktop" in assets_response.text


def test_app_route_returns_503_when_frontend_dist_missing(tmp_path):
    app = _make_desktop_app(tmp_path, with_frontend_dist=False)
    with TestClient(app) as client:
        response = client.get("/app")
        assert response.status_code == 503
        assert "Frontend bundle not found" in response.json()["detail"]


def test_config_updates_persist_to_desktop_app_data_dir(tmp_path):
    app = _make_desktop_app(tmp_path, with_frontend_dist=False)
    with TestClient(app) as client:
        response = client.post("/config", json={"update_interval_ms": 275})
        assert response.status_code == 200
        assert response.json()["update_interval_ms"] == 275

    config_path = tmp_path / "app-data" / "config.local.json"
    assert config_path.exists()
    local_config = json.loads(config_path.read_text())
    assert local_config["update_interval_ms"] == 275
