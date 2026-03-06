# OptionsAnalysis

OptionsAnalysis is a local-first analytics app for QQQ 0DTE options. It streams live data from IBKR, computes contract/strike signals, and surfaces a decision-focused ladder for manual execution.

> Analytics only. This project does not place orders or manage accounts.

## Highlights

- Live IBKR ingest via `ib_insync` (TWS/Gateway)
- FastAPI backend with websocket `snapshot` / `delta` / `heartbeat` events
- React + TypeScript ladder UI with playback support
- macOS desktop wrapper using `pywebview` + `PyInstaller`
- Test coverage across backend runtime/analytics and frontend reducers/components

## Tech Stack

- Backend: Python, FastAPI, Pydantic, ib_insync
- Frontend: React, TypeScript, Vite, Vitest
- Desktop: pywebview, PyInstaller

## Prerequisites

- Python 3.11+
- Node.js 20+
- IBKR TWS or Gateway with API access enabled

## Quick Start (Web Development)

### 1. Start backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --reload
```

### 2. Start frontend

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`.

## Desktop App (macOS)

```bash
./desktop/scripts/build_mac_app.sh
open dist/OptionsAnalysis.app
```

Headless smoke check:

```bash
./desktop/scripts/smoke_desktop_runtime.sh
```

## Testing

```bash
cd backend && pytest
cd frontend && npm test
```

## Repository Layout

```text
backend/     FastAPI runtime, IBKR connector, analytics engine, tests
frontend/    React UI, websocket client/reducer, component tests
desktop/     Native launcher and packaging scripts
documents/   Specs, contracts, runbooks, planning artifacts
```

## Key Documentation

- [Product spec](documents/SPEC.md)
- [Desktop runbook](documents/DESKTOP_APP_RUNBOOK.md)
- [WebSocket schema](documents/websocket_schema.json)
- [OpenAPI snapshot](documents/openapi.json)

## License

MIT. See [LICENSE](LICENSE).
