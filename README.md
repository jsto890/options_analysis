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

## AI Agents

This project uses a multi-agent delivery model with clear ownership by surface area.


| Agent                     | Role                                                                                                  | Rules                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Product Manager Agent     | Coordinates Agents and merge order, acceptance criteria, and cross-agent contract alignment.          | Enforce source-of-truth from `documents/SPEC.md`, require evidence-backed check-ins, and block merges with unresolved contract drift. |
| Subagent A (Backend/Data) | Owns backend runtime, IBKR connectivity, websocket contracts, and config/runtime behavior.            | Keep API/schema contracts stable, enforce localhost-first operation, and validate backend changes with `pytest`.                      |
| Subagent B (Analytics)    | Owns pure analytics logic (IV surface, exposures, MSI/MTC scoring) and deterministic analytics tests. | Keep analytics deterministic, respect liquidity/delta gates, and avoid side-effect-heavy logic in core calculations.                  |
| Subagent C (Frontend/UI)  | Owns React UI, reducer behavior, playback parity, and rendering performance/stability.                | Preserve stable ladder rendering, maintain snapshot/delta/heartbeat reducer parity, and cover UI behavior with tests.                 |


Shared operating rules:

- Work in scoped branches with focused, reviewable changes.
- Respect owned-file boundaries unless coordination is explicit.
- Run relevant tests before merge and include validation evidence.
- Keep privacy/security constraints intact: no order placement/account surfaces, no secret commits, localhost-first defaults.

## Key Documentation

- [Product spec](documents/SPEC.md)
- [Desktop runbook](documents/DESKTOP_APP_RUNBOOK.md)
- [WebSocket schema](documents/websocket_schema.json)
- [OpenAPI snapshot](documents/openapi.json)

## License

MIT. See [LICENSE](LICENSE).