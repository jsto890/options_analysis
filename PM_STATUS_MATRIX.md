# PM Status Matrix

_Last updated: 2026-02-26 (local)_

## Canonical References
- SPEC: /Users/josephstorey/OptionsAnalysis/SPEC.md
- Planning baseline: /Users/josephstorey/OptionsAnalysis/PROJECT_PLAN.md
- Kickoff contract: /Users/josephstorey/OptionsAnalysis/Kickoff_Plan.md

## Subagent A (Backend/Data) - Branch `codex/subagent-a-kickoff-data-plane`

### Completed 100%
- FastAPI route skeleton and websocket scaffolding in `/Users/josephstorey/OptionsAnalysis/backend/app/main.py` (`/health`, `/state`, `/config`, `/stream`).
- Heartbeat loop contract (`2s` default) and bounded per-client websocket queue with oldest-delta drop behavior.
- FastAPI lifecycle migrated to lifespan hooks to remove deprecated startup/shutdown event usage.
- Runtime store + delta envelope builder in `/Users/josephstorey/OptionsAnalysis/backend/app/state/store.py`.
- Strike window planner module in `/Users/josephstorey/OptionsAnalysis/backend/app/ibkr/window_manager.py`.
- Refresh compute budget test guard added in `/Users/josephstorey/OptionsAnalysis/backend/tests/test_refresh_budget.py` enforcing p95 `<50ms`.
- Runtime tests added and passing:
  - `/Users/josephstorey/OptionsAnalysis/backend/tests/test_backend_runtime.py`
  - `/Users/josephstorey/OptionsAnalysis/backend/tests/test_window_manager.py`
  - `/Users/josephstorey/OptionsAnalysis/backend/tests/test_refresh_budget.py`
  - Validation: `PYTHONPATH=backend pytest -q backend` -> `13 passed, 1 skipped`

### In Progress (not 100%)
- Full IBKR tick ingestion and subscription rolling execution are not yet validated live after TWS disconnect.
- Backend refresh now consumes analytics outputs on `main`, but live pacing/roll behavior still needs market-session verification.

### Next for completion
1. Wire connector tick state into `RuntimeStore` updates on each refresh.
2. Verify runtime analytics mapping under live IBKR ticks (snapshot, delta, heartbeat, row patches).
3. Add paced subscription rolling execution against live strike windows.

## Subagent B (Analytics) - Branch `codex/subagent-b-kickoff-analytics`

### Completed 100%
- Pure analytics modules implemented:
  - `/Users/josephstorey/OptionsAnalysis/backend/app/analytics/iv_surface.py`
  - `/Users/josephstorey/OptionsAnalysis/backend/app/analytics/exposures.py`
  - `/Users/josephstorey/OptionsAnalysis/backend/app/analytics/msi_mtc.py`
  - `/Users/josephstorey/OptionsAnalysis/backend/app/analytics/engine.py`
- Added residual persistence rolling-window contract and IV imbalance persistence scoring.
- Added explicit MTC rationale payload object with component scores + hard-gate status.
- Added deterministic tests for:
  - insufficient fit points
  - persistence window threshold crossing
  - MSI stability under perturbation
  - MTC hard gate behavior
- Validation: `PYTHONPATH=backend pytest -q backend` -> `14 passed, 1 skipped` on this branch.

### In Progress (not 100%)
- Live-session validation for persistence/imbalance behavior is pending while IBKR is offline.
- Optional smoothing diagnostics are not exposed in API payloads yet.

### Next for completion
1. Ensure A refresh loop consumes `AnalyticsOutput` persistence and rationale fields.
2. Add schema-level exposure for any new persistence/rationale fields if needed by frontend.

## Subagent C (Frontend/UI) - Branch `codex/subagent-c-kickoff-ui-system`

### Completed 100%
- Vite React scaffold and ladder rendering pipeline in `/Users/josephstorey/OptionsAnalysis/frontend`.
- Stream reducer handles `snapshot|delta|heartbeat` and now accepts new-row delta inserts.
- Fixed-width ladder + tabular numerals + stale muted rendering + MSI/MTC hooks implemented.
- Added playback runtime path (`?playback=<json-url>`) and playback client:
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/ws/playback.ts`
- Added playback parity tests:
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/ws/playback.test.ts`
- Validation:
  - `npm --prefix frontend test -- --run` -> `3 passed (7 tests)`
  - `npm --prefix frontend run build` -> success

### In Progress (not 100%)
- Summary formatting and MTC rationale cards are now on `main`; chart/detail surfaces remain incomplete.
- End-to-end playback parity with real recorded backend sessions is not yet validated with a production-like dataset.

### Next for completion
1. Implement detail drawer for per-dollar greek drilldown and expanded rationale details.
2. Add summary/side charts for MSI and exposure context.
3. Validate a real recorded JSON playback file against live stream visual parity.

## Cross-Agent Blockers / Unknowns
- `gh` CLI auth is currently missing in shell; PR inspection/automation commands fail until authentication is restored.
- IBKR live validation is intentionally deferred until tomorrow due TWS disconnect.
- PM integration branch content has been merged/cherry-picked into `origin/main` and re-validated:
  - Backend: `22 passed, 1 skipped`
  - Frontend tests: `3 files passed, 9 tests`
  - Frontend build: success

## PM Priority Queue
1. Tomorrow: run live IBKR validation for window rolling, pacing, and stream integrity.
2. Capture live bug list and patch runtime ingestion/pacing as needed.
3. Complete frontend chart/detail surfaces and replay parity with recorded session data.
4. Restore `gh` auth if PR-level operations are needed.

## Merge Execution Status
- Completed:
  - Merged A into `main` and pushed.
  - Rebased/retargeted B and C onto post-A `main` and force-pushed both.
  - Merged B and C into `main`.
  - Cherry-picked PM integration commits (`integrate analytics output into runtime refresh loop`, `apply summary formatting contract for ui cards`, `render mtc rationale cards in summary panel`) into `main`.
- Current repo state:
  - `main` is clean and pushed to `origin/main`.

## Latest PM Integration Deliverable
- Branch: `codex/pm-integration-check`
- Commits:
  - `integrate analytics output into runtime refresh loop`
  - `apply summary formatting contract for ui cards`
  - `render mtc rationale cards in summary panel`
- Scope:
  - `/Users/josephstorey/OptionsAnalysis/backend/app/main.py`
  - `/Users/josephstorey/OptionsAnalysis/backend/tests/test_backend_runtime.py`
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/App.tsx`
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/components/MtcRationaleCard.tsx`
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/utils/format.ts`
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/utils/format.test.ts`
  - `/Users/josephstorey/OptionsAnalysis/frontend/src/styles.css`
- Effect:
  - Refresh loop now runs analytics engine against row contract blocks when spot/rows are available.
  - Summary MSI/MTC/GEX outputs and row exposure/MSI/MTC fields are populated before websocket delta emission.
  - Runtime test added to verify MSI/MTC population in stream deltas.
  - Summary cards now use deterministic compact signed formatting and percent formatting per UI formatting contract.
  - Right panel now renders MTC rationale score/gate cards for call and put selections.
