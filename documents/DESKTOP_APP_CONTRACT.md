# OptionsAnalysis Desktop App Contract (macOS v1)

## Program Roles

| Role | Ownership |
|---|---|
| PM (Orchestrator) | Dependency order, acceptance gates, release checklist |
| Subagent A (Desktop Runtime) | `desktop/` launcher lifecycle, PyInstaller packaging, smoke tooling |
| Subagent B (Backend Platform) | `/app` static route, `/desktop/settings` endpoints, app-data persistence |
| Subagent C (Frontend Desktop UX) | Same-origin networking, desktop settings panel, restart-required messaging |

## Backend API Contract

### GET `/desktop/settings`

Response:

```json
{
  "connect_paper": false,
  "client_id": 19,
  "host": "127.0.0.1",
  "paper_port": 4002,
  "live_port": 4001
}
```

### POST `/desktop/settings`

Request body (partial update allowed):

```json
{
  "connect_paper": false,
  "client_id": 29,
  "host": "127.0.0.1",
  "paper_port": 4002,
  "live_port": 4001
}
```

Response:

```json
{
  "settings": {
    "connect_paper": false,
    "client_id": 29,
    "host": "127.0.0.1",
    "paper_port": 4002,
    "live_port": 4001
  },
  "restart_required": true
}
```

### GET `/app`

- Returns built frontend shell (`frontend/dist/index.html`) when bundle exists.
- Returns `503` with guidance when frontend bundle is missing.

## Persistence Contract

Desktop app-data path:

- `~/Library/Application Support/OptionsAnalysis/`

Persisted files:

- `desktop.settings.json`
- `config.local.json`

## Networking Contract

- Frontend uses same-origin relative routes:
  - `fetch("/config")`
  - `fetch("/desktop/settings")`
  - websocket: `ws(s)://<current-host>/stream`

## Runtime Contract

- Desktop launcher binds backend to `127.0.0.1` on an available dynamic port.
- Launcher opens native window to `http://127.0.0.1:<port>/app`.
- Closing the window stops backend cleanly.
- Paper/live setting updates are persisted and applied on next app start.
