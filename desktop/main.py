from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import uvicorn


def repo_root() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def ensure_backend_path() -> None:
    backend_path = repo_root() / "backend"
    if backend_path.exists() and str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def default_app_data_dir() -> Path:
    return Path.home() / "Library" / "Application Support" / "OptionsAnalysis"


def find_open_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def bootstrap_environment() -> None:
    root = repo_root()
    app_data_dir = default_app_data_dir()
    app_data_dir.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("OPTIONS_DESKTOP_MODE", "1")
    os.environ.setdefault("OPTIONS_APP_DATA_DIR", str(app_data_dir))
    os.environ.setdefault("OPTIONS_FRONTEND_DIST_DIR", str(root / "frontend" / "dist"))

    default_config_path = root / "documents" / "config.default.json"
    if default_config_path.exists():
        os.environ.setdefault("OPTIONS_CONFIG_DEFAULT_PATH", str(default_config_path))

    # Desktop mode should auto-attempt connection to a running TWS/Gateway instance.
    os.environ.setdefault("IBKR_AUTO_CONNECT", "1")
    os.environ.setdefault("IBKR_CONNECT_PAPER", "0")
    os.environ.setdefault("IBKR_CONNECT_RETRY_SECONDS", "10")


def wait_for_endpoint(url: str, timeout_seconds: float = 10.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.1)
    return False


def launch_backend(port: int):
    from app.main import create_app

    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return server, thread


def run_smoke(url_base: str) -> None:
    if not wait_for_endpoint(f"{url_base}/health", timeout_seconds=12.0):
        raise RuntimeError("Backend health endpoint did not become ready")
    if not wait_for_endpoint(f"{url_base}/app", timeout_seconds=3.0):
        raise RuntimeError("Frontend app endpoint did not become ready")
    print(f"Smoke passed at {url_base}")


def launch_window(url: str) -> None:
    import webview

    webview.create_window(
        title="OptionsAnalysis",
        url=url,
        width=1580,
        height=980,
        min_size=(1200, 760),
    )
    webview.start()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OptionsAnalysis desktop launcher")
    parser.add_argument("--smoke", action="store_true", help="Run headless health checks and exit")
    parser.add_argument("--port", type=int, default=0, help="Optional fixed backend port")
    return parser.parse_args()


def main() -> int:
    ensure_backend_path()
    bootstrap_environment()
    args = parse_args()
    port = args.port if args.port > 0 else find_open_port()
    base_url = f"http://127.0.0.1:{port}"

    server, thread = launch_backend(port)
    try:
        if args.smoke:
            run_smoke(base_url)
            return 0

        if not wait_for_endpoint(f"{base_url}/health", timeout_seconds=12.0):
            raise RuntimeError("Backend health endpoint did not become ready")
        launch_window(f"{base_url}/app")
        return 0
    finally:
        server.should_exit = True
        thread.join(timeout=5.0)


if __name__ == "__main__":
    raise SystemExit(main())
