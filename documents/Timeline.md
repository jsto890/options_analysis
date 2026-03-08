# Timeline

_Last updated: 2026-02-26 (local)_
_Project root: `<repo-root>`_

## 1) Execution Timeline (Chronological)

### Phase 0: Branch + repo hygiene
- Renamed kickoff plan file to canonical casing (`Kickoff_Plan.md`).
- Added root `.gitignore` and cleaned tracked cache artifacts.
- Established kickoff branches:
  - `codex/subagent-a-kickoff-data-plane`
  - `codex/subagent-b-kickoff-analytics`
  - `codex/subagent-c-kickoff-ui-system`

### Phase 1: Subagent A data-plane scaffold
- Implemented backend REST + websocket runtime shell:
  - `<repo-root>/backend/app/main.py`
  - `<repo-root>/backend/app/state/store.py`
  - `<repo-root>/backend/app/ibkr/window_manager.py`
- Added heartbeat loop, bounded per-client WS queue, snapshot/delta flow.
- Added refresh compute budget guard (`p95 < 50ms`) and runtime tests.

Validation:
- `PYTHONPATH=backend pytest -q backend` (A branch) -> `13 passed, 1 skipped`

### Phase 2: Subagent B analytics contracts
- Implemented analytics stack:
  - `<repo-root>/backend/app/analytics/iv_surface.py`
  - `<repo-root>/backend/app/analytics/exposures.py`
  - `<repo-root>/backend/app/analytics/msi_mtc.py`
  - `<repo-root>/backend/app/analytics/engine.py`
- Added persistence logic and deterministic MTC rationale contract.

Validation:
- `PYTHONPATH=backend pytest -q backend` (B branch) -> `14 passed, 1 skipped`

### Phase 3: Subagent C UI system baseline
- Implemented ladder scaffold, reducer contract handling, and playback baseline.
- Fixed reducer handling for row insert patches.
- Added formatting utilities and tests.

Validation:
- `npm --prefix frontend test -- --run` -> pass
- `npm --prefix frontend run build` -> pass

### Phase 4: PM integration + merge choreography
- Created integration branch `codex/pm-integration-check`.
- Merged B + C onto A integration baseline and validated combined behavior.
- Applied PM integration commits for runtime analytics wiring and summary formatting.
- Completed required merge order into `main`:
  1. A merged first
  2. B/C rebased on post-A main
  3. B/C merged
  4. PM integration commits cherry-picked

Validation:
- Backend on merged main: `22 passed, 1 skipped`
- Frontend tests/build on merged main: pass

### Phase 5: Live runtime activation and backend hardening
- Extended connector runtime behavior:
  - loop-binding patch for async IB calls
  - contract qualification helpers
  - option subscription cancellation helper
- Completed live ingestion/runtime window machinery in `<repo-root>/backend/app/main.py`:
  - underlying + chain bootstrap
  - expiry selection and active-window subscription
  - ticker ingestion into row contract blocks
  - paced add/remove subscription rolling
  - forced snapshot contract on window changes
- Added runtime store diff baseline sync to avoid stale-delta artifacts.

Validation:
- `PYTHONPATH=backend pytest -q backend` -> `22 passed, 1 skipped`
- Live health/state checks report connected backend, populated expiry, 41 ladder rows, MTC ids.
- Live smoke: `IBKR_CLIENT_ID=29 PYTHONPATH=backend python backend/scripts/ibkr_smoke.py --symbol QQQ --with-option --live` -> OK

### Phase 6: Frontend advanced surfaces completion
- Added detail drawer + pinned selection workflow:
  - `<repo-root>/frontend/src/components/PinnedDetailDrawer.tsx`
  - row/contract selection wiring in `<repo-root>/frontend/src/components/StrikeLadder.tsx`
  - selection + keyboard navigation in `<repo-root>/frontend/src/App.tsx`
- Added compact right-panel charts:
  - `<repo-root>/frontend/src/components/MiniIvChart.tsx`
  - `<repo-root>/frontend/src/components/MiniExposureChart.tsx`
- Added deterministic contract copy descriptor utility:
  - `<repo-root>/frontend/src/utils/contracts.ts`
- Added rolling contract timeseries cache:
  - `<repo-root>/frontend/src/utils/timeseries.ts`
- Added live playback parity fixture and tests:
  - `<repo-root>/frontend/src/ws/fixtures/live_session.sample.json`
  - `<repo-root>/frontend/src/ws/live_playback_parity.test.ts`

Validation:
- `npm --prefix frontend test -- --run` -> `6 files passed, 14 tests`
- `npm --prefix frontend run build` -> success

## 2) Current Completion Snapshot

### Subagent A
Completed:
- Live ingestion pipeline, rolling subscriptions, runtime analytics integration, backend test suite green.
In progress:
- 60-minute soak evidence and large-move roll event capture for final acceptance artifact.

### Subagent B
Completed:
- Analytics contracts and deterministic tests.
In progress:
- Optional diagnostics/smoothing fields remain deferred.

### Subagent C
Completed:
- Ladder, reducers, playback baseline, summary cards, rationale details, detail drawer, chart surfaces, copy actions, parity fixture.
In progress:
- UI playback controls for pause/seek are still deferred from strict full-SPEC behavior.

## 3) Remaining Work (Actionable)

1. Backend acceptance evidence
- Run one 60-minute live soak and archive subscription/roll logs.
- Capture one confirmed roll event with strike window transition details.

2. Optional frontend playback controls
- If required for release, add play/pause/seek controls and tests that reducer state after seek remains deterministic.

3. PR automation readiness
- Restore `gh` shell authentication before any PR automation workflow.

## 4) References for Next Context
- Spec source of truth: `<repo-root>/SPEC.md`
- Kickoff contract: `<repo-root>/Kickoff_Plan.md`
- PM status matrix: `<repo-root>/PM_STATUS_MATRIX.md`
- High-signal backend files:
  - `<repo-root>/backend/app/main.py`
  - `<repo-root>/backend/app/state/store.py`
  - `<repo-root>/backend/app/ibkr/connector.py`
- High-signal frontend files:
  - `<repo-root>/frontend/src/App.tsx`
  - `<repo-root>/frontend/src/components/StrikeLadder.tsx`
  - `<repo-root>/frontend/src/components/PinnedDetailDrawer.tsx`
  - `<repo-root>/frontend/src/ws/live_playback_parity.test.ts`
