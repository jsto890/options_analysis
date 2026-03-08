# PM Status Matrix

_Last updated: 2026-02-26 (local)_

## Canonical References
- SPEC: <repo-root>/SPEC.md
- Planning baseline: <repo-root>/PROJECT_PLAN.md
- Kickoff contract: <repo-root>/Kickoff_Plan.md
- Timeline handoff: <repo-root>/Timeline.md

## Subagent A (Backend/Data) - Branch lineage `codex/subagent-a-kickoff-data-plane`

### Completed 100%
- FastAPI route skeleton + websocket scaffolding (`/health`, `/state`, `/config`, `/stream`) in `<repo-root>/backend/app/main.py`.
- Runtime store delta pipeline with cached baselines + forced snapshot baseline sync in `<repo-root>/backend/app/state/store.py`.
- IBKR connector hardening in `<repo-root>/backend/app/ibkr/connector.py`:
  - loop-binding safety for async calls
  - contract qualification helpers
  - market data cancel helper
  - connect warning recovery when socket is already active
- Live data-plane ingestion and strike-window runtime wiring in `<repo-root>/backend/app/main.py`:
  - bootstrap from underlying + option chain
  - active window subscription setup
  - refresh ingestion from tickers
  - paced window roll execution with force-snapshot contract on window changes
- Live smoke script flow validated in `<repo-root>/backend/scripts/ibkr_smoke.py`.
- Validation evidence:
  - `PYTHONPATH=backend pytest -q backend` -> `22 passed, 1 skipped`
  - `IBKR_CLIENT_ID=29 PYTHONPATH=backend python backend/scripts/ibkr_smoke.py --symbol QQQ --with-option --live` -> connect + stock stream + option stream OK
  - live runtime check: `/health` reports `ibkr_connected=true`, `/state` shows expiry + 41 rows + MTC ids

### In Progress (not 100%)
- Session-length soak criteria (`60 minutes`) and broad roll behavior under larger spot displacement are not yet logged as a completed acceptance artifact.

### Next for completion
1. Run 60-minute soak during active market and retain subscription/roll log snapshot.
2. Capture one observed roll event with before/after active strikes for acceptance evidence.

## Subagent B (Analytics) - Branch lineage `codex/subagent-b-kickoff-analytics`

### Completed 100%
- Pure analytics modules are implemented and integrated:
  - `<repo-root>/backend/app/analytics/iv_surface.py`
  - `<repo-root>/backend/app/analytics/exposures.py`
  - `<repo-root>/backend/app/analytics/msi_mtc.py`
  - `<repo-root>/backend/app/analytics/engine.py`
- Deterministic contracts for IV fit, exposure outputs, MSI stability, MTC hard-gates, and rationale payloads are in place.
- Runtime integration into refresh loop is active on `main` and validated by backend runtime tests.

### In Progress (not 100%)
- Optional diagnostics/smoothing payload surfacing remains deferred (not required for kickoff acceptance).

### Next for completion
1. If required post-kickoff, expose optional diagnostics fields in API/schema with explicit version bump.

## Subagent C (Frontend/UI) - Branch lineage `codex/subagent-c-kickoff-ui-system`

### Completed 100%
- Stable ladder + reducer + playback baseline remains complete.
- Added advanced UI surfaces:
  - detail drawer with pinned row/contract metrics + per-dollar greek drilldown + sparkline history
  - compact IV curve and exposure charts in right panel
  - MSI top-list card with wall-type context
- Added deterministic copy actions for contract descriptor + conid descriptor:
  - `<repo-root>/frontend/src/utils/contracts.ts`
- Added rolling frontend timeseries cache for pinned drawer:
  - `<repo-root>/frontend/src/utils/timeseries.ts`
- Added keyboard handling for pinned navigation (`ArrowUp/ArrowDown`) and drawer close (`Escape`).
- Added playback parity fixture captured from live backend stream:
  - `<repo-root>/frontend/src/ws/fixtures/live_session.sample.json`
  - `<repo-root>/frontend/src/ws/live_playback_parity.test.ts`
- Validation evidence:
  - `npm --prefix frontend test -- --run` -> `6 files passed, 14 tests`
  - `npm --prefix frontend run build` -> success

### In Progress (not 100%)
- Playback controls are start-only (`playback` query bootstrap). UI pause/seek controls are still deferred from strict full SPEC behavior.

### Next for completion
1. Add explicit playback transport controls (play/pause/seek) if promoted from deferred to required scope.

## Cross-Agent Blockers / Unknowns
- `gh` CLI auth is still not active in shell; PR automation commands remain blocked until `gh auth login`.

## PM Priority Queue
1. Execute and archive a 60-minute live soak report (A acceptance evidence).
2. Decide whether playback pause/seek controls are required for current release gate.
3. If yes, implement playback controls and add reducer parity tests for seek behavior.

## Merge / Working Tree Status
- Historical A/B/C merge choreography and PM integration commits are already in `main`.
- Current repo state is a local working set with additional runtime + UI completion changes not yet committed/pushed.

## Latest Validation Snapshot
- Backend tests: `22 passed, 1 skipped`
- Frontend tests: `6 files passed, 14 tests`
- Frontend build: success
- Live IBKR checks: healthy connection and populated ladder confirmed
