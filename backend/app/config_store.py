from __future__ import annotations

import json
from pathlib import Path

from app.schemas import Config, ConfigUpdate


class ConfigStore:
    """Loads default config, overlays local config, and persists runtime updates."""

    def __init__(self, root_dir: Path | None = None):
        repo_root = root_dir or Path(__file__).resolve().parents[2]
        self.default_path = repo_root / "config.default.json"
        self.local_path = repo_root / "config.local.json"
        self._config = self._load()

    @property
    def config(self) -> Config:
        return self._config

    def _load(self) -> Config:
        config_data: dict = {}
        if self.default_path.exists():
            config_data.update(json.loads(self.default_path.read_text()))

        if self.local_path.exists():
            config_data.update(json.loads(self.local_path.read_text()))

        return Config(**config_data)

    def update(self, update: ConfigUpdate) -> Config:
        merged = self._config.model_dump()
        for key, value in update.model_dump(exclude_none=True).items():
            merged[key] = value

        self._config = Config(**merged)
        self.local_path.write_text(json.dumps(self._config.model_dump(), indent=2, sort_keys=True))
        return self._config
