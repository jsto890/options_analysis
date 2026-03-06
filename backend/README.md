# Backend

Backend service for IBKR connectivity, strike-window management, analytics computation, and websocket broadcasting.

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --reload
```

## Test

```bash
cd backend
pytest
```

## Primary Endpoints

- `GET /health` runtime health and subscription count
- `GET /state` current state snapshot
- `POST /config` update runtime config
- `WS /stream` live snapshot/delta/heartbeat stream
- `GET /app` serves built frontend when available

Environment variables are documented in the root [.env.example](../.env.example).
