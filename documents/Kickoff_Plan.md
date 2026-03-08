# Kickoff Plan Rework (SPEC-Led, Sub-Agent Optimized)

## Brief Summary
1. Canonical source is [SPEC.md](<repo-root>/SPEC.md); [PROJECT_PLAN.md](<repo-root>/PROJECT_PLAN.md) remains high-level context.
2. Kickoff will use three sub-agent PRs (A/B/C), each with one branch, one commit, one draft PR, and explicit ownership to reduce merge conflicts.
3. File creation is deferred until explicit go; target file is `<repo-root>/Kickoff_Plan.md`.

## Locked Decisions
1. Source-of-truth precedence: `SPEC.md` wins on conflicts.
2. IBKR config model: keep paper/live ports (`IBKR_PAPER_PORT`, `IBKR_LIVE_PORT`) for kickoff compatibility.
3. Workflow mode: do not write files yet; finalize plan first.
4. PR topology: direct-to-main for kickoff PRs only.
5. Commit shape: single commit per sub-agent PR.

## Important API / Interface Changes (Kickoff Contract Freeze)
1. Add missing websocket schema file at `<repo-root>/websocket_schema.json` and make it authoritative for `snapshot|delta|heartbeat`.
2. Normalize OpenAPI compatibility in [openapi.json](<repo-root>/openapi.json):
   Change `openapi` to `3.1.0` to support JSON Schema null-union typing already used.
3. Resolve per-dollar greek naming drift:
   Use explicit keys `gamma_per_dollar`, `vega_per_dollar`, `theta_per_dollar` in [types.ts](<repo-root>/types.ts), websocket schema, and OpenAPI.
4. Resolve env/config drift:
   Update spec/env references to paper/live port model and remove ambiguity around single `IBKR_PORT`.
5. Remove spec-violating account-balance read path from connector startup behavior in [backend/app/ibkr/connector.py](<repo-root>/backend/app/ibkr/connector.py) for v1 privacy constraints.
6. Remove non-config metadata key from [config.default.json](<repo-root>/config.default.json):
   Drop `"filename"` so file matches `Config` schema exactly.

## Sub-Agent Assignments (Performance-Optimized)

| Agent | Branch | Commit Message | Draft PR Title | Owned Files | Required Deliverables | Performance KPI |
|---|---|---|---|---|---|---|
| Subagent A (Backend/Data) | `codex/subagent-a-kickoff-data-plane` | `kickoff data plane contracts and runtime scaffolds` | `[codex] Kickoff data plane contracts and runtime scaffolds` | [backend/app/ibkr/config.py](<repo-root>/backend/app/ibkr/config.py), [backend/app/ibkr/connector.py](<repo-root>/backend/app/ibkr/connector.py), `<repo-root>/backend/app/main.py`, [openapi.json](<repo-root>/openapi.json), `<repo-root>/websocket_schema.json`, [config.default.json](<repo-root>/config.default.json), [BACKEND_FORMAT_HINTS.md](<repo-root>/BACKEND_FORMAT_HINTS.md) | FastAPI skeleton (`/health`, `/state`, `/config`, `/stream`), startup task wiring, heartbeat contract, config overlay flow, contract/schema freeze | Backend refresh loop target defined and test-instrumented for `<50ms` compute budget |
| Subagent B (Analytics) | `codex/subagent-b-kickoff-analytics` | `kickoff analytics engine contracts and deterministic vectors` | `[codex] Kickoff analytics engine contracts and deterministic vectors` | `<repo-root>/backend/app/analytics/iv_surface.py`, `<repo-root>/backend/app/analytics/exposures.py`, `<repo-root>/backend/app/analytics/msi_mtc.py`, `<repo-root>/backend/app/analytics/engine.py`, `<repo-root>/backend/tests/test_analytics_*.py` | Pure-function interfaces for IV fit, exposures, MSI, MTC; deterministic fixtures; liquidity/delta hard-gate enforcement; rationale payload builder | Analytics functions stable under noise and deterministic replay; documented edge-case behavior |
| Subagent C (Frontend/UI) | `codex/subagent-c-kickoff-ui-system` | `kickoff ui system with stable ladder and stream reducers` | `[codex] Kickoff ui system with stable ladder and stream reducers` | `<repo-root>/frontend/*`, [types.ts](<repo-root>/types.ts), [UI_FORMATTING.md](<repo-root>/UI_FORMATTING.md), [FRONTEND_RENDER_CHECKLIST.md](<repo-root>/FRONTEND_RENDER_CHECKLIST.md) | Vite React scaffold, websocket reducers for snapshot/delta/heartbeat, fixed-width ladder shell, deterministic formatter utilities, stale/muted/MSI/MTC rendering hooks | Stable 500ms cadence rendering with fixed columns and no row-jitter regressions |

## Merge Order and Dependency Plan
1. Subagent A merges first because it freezes API/schema contracts used by B and C.
2. Subagent B and C branch from updated `main` after A merges.
3. B and C can execute in parallel once contract freeze is merged.
4. PM requires rebase-on-main before final review to avoid schema drift.

## Required Git/PR Workflow Per Sub-Agent
1. `git checkout main`
2. `git pull --ff-only`
3. `git checkout -b <branch>`
4. Implement scoped changes only in owned files.
5. Run required tests for that agent scope.
6. `git add -A`
7. `git commit -m "<commit message>"`
8. `git push -u origin <branch>`
9. `gh pr create --draft --base main --head <branch> --title "<title>" --body-file /tmp/<agent>-pr.md`

## PM Check-In Protocol (Enforced)
1. Cadence: every 45 minutes and at milestone end.
2. Required format for each update: `Done`, `Evidence`, `Assumptions`, `Unknowns`, `Next`.
3. Any claim without source tag (`IB tick`, `config`, `derived`, `test`) is rejected.
4. Unknown critical dependencies block merge until resolved or explicitly accepted.

## Test Cases and Scenarios

### Contract and Schema
1. Validate websocket envelopes against `<repo-root>/websocket_schema.json`.
2. Validate REST payloads against [openapi.json](<repo-root>/openapi.json).
3. Confirm `types.ts` and websocket schema field parity via schema snapshot test.

### Backend/Data
1. Health endpoint returns expected fields and connection state.
2. Snapshot is sent on websocket connect.
3. Delta includes only changed rows/summary patches.
4. Heartbeat cadence is 2 seconds.
5. Config update persists and reloads correctly.
6. No account-balance read in v1 startup path.

### Analytics
1. Mid/spread/stale/liquidity gates match formula definitions.
2. IV fit returns null on insufficient points.
3. Residual persistence requires threshold crossing over configured window.
4. MTC never selects illiquid or out-of-band delta contracts.
5. MSI returns top-3 stable strikes under small quote perturbations.

### Frontend
1. Fixed column widths prevent layout shift.
2. Null rendering uses `·` in ladder and `N A` in summary cards.
3. Stale contract visual state is muted with stale flag behavior.
4. Exactly one call and one put receive MTC badge.
5. Playback applies same reducers and renders same UI outcomes as live stream.

## Assumptions and Defaults
1. `gh` will be installed and authenticated before execution.
2. Existing IBKR connection baseline is valid and treated as already established.
3. `PYTHONPATH=. pytest -q` remains backend test command convention.
4. No order placement, no account balances, and localhost bind remain hard constraints.
5. Kickoff output file write is intentionally deferred until your explicit go signal.
