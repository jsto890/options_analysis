from __future__ import annotations

import json
from pathlib import Path

from app.schemas import DesktopSettings, DesktopSettingsUpdate

LEGACY_TWS_PAPER_PORT = 7497
LEGACY_TWS_LIVE_PORT = 7496
GATEWAY_PAPER_PORT = 4002
GATEWAY_LIVE_PORT = 4001


def default_app_data_dir() -> Path:
    return Path.home() / "Library" / "Application Support" / "OptionsAnalysis"


class DesktopSettingsStore:
    """Loads and persists desktop-only runtime settings."""

    def __init__(self, app_data_dir: Path | None = None):
        self.app_data_dir = (app_data_dir or default_app_data_dir()).expanduser()
        self.path = self.app_data_dir / "desktop.settings.json"
        self._settings = self._load()

    @property
    def settings(self) -> DesktopSettings:
        return self._settings

    def _load(self) -> DesktopSettings:
        if not self.path.exists():
            return DesktopSettings()

        try:
            payload = json.loads(self.path.read_text())
        except json.JSONDecodeError:
            return DesktopSettings()

        settings = DesktopSettings(**payload)
        if self._should_migrate_legacy_ports(settings):
            settings = settings.model_copy(
                update={
                    "paper_port": GATEWAY_PAPER_PORT,
                    "live_port": GATEWAY_LIVE_PORT,
                }
            )
            self._persist(settings)
        return settings

    def _persist(self, settings: DesktopSettings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(settings.model_dump(), indent=2, sort_keys=True))

    @staticmethod
    def _should_migrate_legacy_ports(settings: DesktopSettings) -> bool:
        return (
            settings.host == "127.0.0.1"
            and settings.client_id == 19
            and settings.paper_port == LEGACY_TWS_PAPER_PORT
            and settings.live_port == LEGACY_TWS_LIVE_PORT
        )

    def update(self, update: DesktopSettingsUpdate) -> DesktopSettings:
        merged = self._settings.model_dump()
        for key, value in update.model_dump(exclude_none=True).items():
            merged[key] = value
        self._settings = DesktopSettings(**merged)
        self._persist(self._settings)
        return self._settings
