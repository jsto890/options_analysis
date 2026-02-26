from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class IBKRConfig:
    host: str = "127.0.0.1"
    paper_port: int = 4002
    live_port: int = 4001
    client_id: int = 19
    timeout_seconds: int = 30
    market_data_type: int = 1
    read_only: bool = True

    @classmethod
    def from_env(cls) -> "IBKRConfig":
        return cls(
            host=os.getenv("IBKR_HOST", "127.0.0.1"),
            paper_port=int(os.getenv("IBKR_PAPER_PORT", "4002")),
            live_port=int(os.getenv("IBKR_LIVE_PORT", "4001")),
            client_id=int(os.getenv("IBKR_CLIENT_ID", "19")),
            timeout_seconds=int(os.getenv("IBKR_TIMEOUT_SECONDS", "30")),
            market_data_type=int(os.getenv("IBKR_MARKET_DATA_TYPE", "1")),
            read_only=os.getenv("IBKR_READ_ONLY", "1") == "1",
        )
