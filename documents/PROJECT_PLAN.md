# QQQ 0DTE Options Console - Planning Baseline

This file is the canonical planning reference for the project.  
Status: Implementation started.
NEVER SET AN ORDER FOR A TRADE, ONLY READ THE DATA AND DISPLAY.

## 1) Product Intent

Build a local real-time analytics console for QQQ 0DTE options.  
Primary outputs:
- `MSI` (Most Significant Strike): structural wall/magnet marker in the active window.
- `MTC` (Most Tradable Contract): best executable contract candidate given a user directional thesis.

The system prioritizes subscription discipline, cache design, and UI responsiveness over complex math.

## 2) Scope and Non-Goals

In scope (MVP):
- QQQ only.
- Live strike ladder around spot.
- Mid IV, Greeks, spread/liquidity fields.
- MSI and MTC highlights.
- Manual levels overlay (ORH, ORL, prior high/low, VWAP).
- WebSocket updates at controlled cadence.

Out of scope (defer):
- Full-chain scanning.
- Max-pain automation.
- Execution routing.
- Alerts/push notifications.
- Multi-symbol expansion (unless trivial after MVP stabilization).

## 3) Hard Constraints

- Data source: IBKR TWS/Gateway local socket, no API keys.
- Required subscriptions: OPRA options market data.
- Market data line limits and pacing must be treated as first-class constraints.
- Active window default: `spot +/- 3%` in strikes.
- Roll window only when needed; avoid request bursts.
- Bind backend to `127.0.0.1` by default.

## 4) Compute Definitions (Authoritative)

## `MSI` Most Significant Strike
Purpose: structural level (wall or magnet) near spot.

Definition per strike `k`:

`ImpactScore(k) = Abs(GEX_1pct(k)) * ProximityWeight(distance_to_spot) * ConcentrationWeight(local_dominance)`

Where:
- `ProximityWeight = exp(-distance_pct / bandwidth)`, bandwidth in ~`0.5%` to `1.0%`.
- `ConcentrationWeight = Abs(GEX(k)) / (Abs(GEX(k-1)) + Abs(GEX(k)) + Abs(GEX(k+1)) + epsilon)`.

Output:
- Highlight top `1..3` strikes by `ImpactScore`.

## `MTC` Most Tradable Contract
Purpose: the contract to buy/sell after a directional thesis already exists.

Definition per contract:

`TradableScore = LiquidityScore * CheapIVScore * EfficiencyScore * RegimeFit`

Components:
- `LiquidityScore`: penalize wide spread %, low size, stale quotes, low update frequency.
- `CheapIVScore`: negative residual vs fitted intraday IV curve.
- `EfficiencyScore`: gamma-per-dollar and vega-per-dollar within sane delta band.
- `RegimeFit`: enforce delta preference by regime (pinning -> higher delta, trend -> wider band).

Rule:
- Never choose extreme Greeks when liquidity quality is below threshold.

## 5) Data Availability and Limits

Needed per subscribed contract:
- Bid/ask/last and sizes.
- Model Greeks and model IV.
- Volume/OI when available.
- Underlying spot bid/ask/last.
- Chain metadata (strikes/expiries).

Reality checks:
- True marketwide max-pain inference is not reliable from this scoped feed.
- Single highest GEX strike is not a standalone directional predictor; local shape/sign regime matters.

## 6) Target Architecture

Backend stack:
- Python `3.11+`
- `ib_insync`
- `FastAPI` + WebSocket
- `Pydantic` models
- Optional local logging (`SQLite` or parquet later)

Frontend stack:
- React + TypeScript + Vite
- Zustand or Redux Toolkit
- TanStack Table + virtualization
- Recharts for charts

Backend modules:
- `IBKR Connector`: connect/reconnect, metadata load, normalize ticks.
- `Strike Window Manager`: maintain `+/- 3%` strike window, paced roll logic.
- `Analytics Engine`: mid/spread, IV fit+residual, exposures, MSI/MTC.
- `API Layer`: health/state/config + incremental stream.

## 7) Repository Target Shape (for handoff)

- `/backend`
  - `app/main.py`
  - `app/ibkr/connector.py`
  - `app/ibkr/window_manager.py`
  - `app/analytics/iv_surface.py`
  - `app/analytics/exposures.py`
  - `app/analytics/msi_mtc.py`
  - `app/models/schemas.py`
  - `app/storage/session_store.py`
  - `tests/`
- `/frontend`
  - `src/app`
  - `src/components/StrikeLadder`
  - `src/components/IVSurface`
  - `src/components/ExposureChart`
  - `src/state/store`
  - `src/ws/client`
- `/docs`
  - setup guide
  - data contract spec
  - threshold defaults

## 8) Redesigned Sub-Agent Operating Model

Senior PM (orchestrator):
- Own phase gates, milestone acceptance, and anti-hallucination policy.
- Block progress on missing critical inputs.
- Keep a single assumptions ledger and dependency board.

Agent 1: Data Plane Engineer
- Own IBKR session stability, subscription budget, pacing-safe window rotation.
- Build normalized stream for underlying + option ticks.
- Reuse known-working connection patterns from SPYbot repo.
- Deliverables: connection state machine spec, strike window policy, stream schema.

Agent 2: Quant Analytics Engineer
- Own IV fit/residual, exposures (`GEX`, `DEX`, `VEX`), MSI/MTC scoring.
- Define smoothing policy (raw + EMA/median side-by-side).
- Encode liquidity hard-gates before ranking.
- Deliverables: formulas spec, threshold defaults, deterministic test vectors.

Agent 3: UI Systems Engineer
- Own live ladder rendering, diff updates, frame-rate/cadence controls.
- Implement MSI/MTC visualization and level overlays.
- Build pinned-strike detail drill-down and clipboard contract descriptor.
- Deliverables: state model, component contracts, update budget profile.

## 9) Checkup Protocol (Anti-Hallucination)

Cadence:
- Mandatory PM check at the end of each milestone.
- Interim check every 45 minutes during implementation windows.

Each check-in must include:
- `Done`: what changed (file paths or API contracts).
- `Evidence`: logs, tests, or computed examples.
- `Assumptions`: explicit and source-tagged.
- `Unknowns`: blockers or data not observed.
- `Next`: one concrete next action.

Gate rule:
- No unsupported claims in status updates.
- Any metric claim must point to source type: `IB tick`, `config`, or `derived`.
- If source is missing: mark as `Unknown` and escalate to PM.

## 10) Milestones and Acceptance

Milestone 1 - Plumbing:
- Stable IBKR connection and reconnect.
- 0DTE chain discovery.
- `+/- 3%` strike-window subscriptions with pacing compliance.

Milestone 2 - Analytics:
- Mid/spread + liquidity gates.
- IV fit + residual.
- Exposures and MSI/MTC scoring.

Milestone 3 - UI:
- Live strike ladder.
- Highlighting for residual and efficiency extremes.
- MSI/MTC badges and pinned detail panel.

Milestone 4 - Hardening:
- Reconnect resubscribe reliability.
- Rate-limiting and pacing hardening.
- Config presets and optional session logging.

## 11) Pre-Implementation Checklist

- Confirm SPYbot repo path and reusable modules.
- Confirm IB Gateway/TWS settings and trusted localhost API access.
- Confirm OPRA entitlement and effective line limit.
- Confirm baseline thresholds for spreads, size, stale quote timeout, delta bands.

