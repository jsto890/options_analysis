from __future__ import annotations

import json
import os
from pathlib import Path

from app.schemas import Config, ConfigUpdate


class ConfigStore:
    """Loads default config, overlays local config, and persists runtime updates."""

    def __init__(
        self,
        root_dir: Path | None = None,
        *,
        local_dir: Path | None = None,
        default_path: Path | None = None,
    ):
        repo_root = root_dir or Path(__file__).resolve().parents[2]
        self.default_path = default_path or self._resolve_default_path(repo_root)

        if local_dir is None:
            app_data_dir = os.getenv("OPTIONS_APP_DATA_DIR")
            local_dir = Path(app_data_dir).expanduser() if app_data_dir else repo_root
        local_dir.mkdir(parents=True, exist_ok=True)
        self.local_path = local_dir / "config.local.json"
        self._config = self._load()

    @property
    def config(self) -> Config:
        return self._config

    @staticmethod
    def _resolve_default_path(repo_root: Path) -> Path:
        explicit_path = os.getenv("OPTIONS_CONFIG_DEFAULT_PATH")
        if explicit_path:
            return Path(explicit_path).expanduser()

        root_candidate = repo_root / "config.default.json"
        if root_candidate.exists():
            return root_candidate

        documents_candidate = repo_root / "documents" / "config.default.json"
        if documents_candidate.exists():
            return documents_candidate

        return root_candidate

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
