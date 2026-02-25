---
name: options-analysis-agents
description: Multi-agent build orchestration for a local QQQ 0DTE analytics console using IBKR TWS/Gateway data with strict subscription-window control (+/-3% around spot), real-time strike ladder updates, and computed MSI/MTC signals. Use when planning or implementing architecture, analytics, and UI for this project while enforcing phase gates, evidence-based check-ins, and anti-hallucination controls.
---

# Options Analysis Agents

Run this skill as a Senior PM with up to 3 sub-agents.  
Primary objective: deliver a production-ready MVP plan and implementation sequence for a local real-time QQQ 0DTE options console.

## Fixed Product Boundaries

- Treat the app as a local real-time analytics console, not a full-chain scanner.
- Use controlled strike subscriptions in a `+/-3%` spot window.
- Prioritize responsiveness, data quality, and pacing compliance over feature breadth.
- Defer max-pain automation, full-chain analysis, alerts, and execution.

## Sub-Agent Design

Senior PM (you):
- Own scope, phase gates, and cross-agent dependency ordering.
- Reject unsupported claims and block progress on unknown critical inputs.
- Maintain one assumptions ledger and one decision log.

Agent 1 - Data Plane Engineer:
- Own IBKR connect/reconnect behavior and chain metadata lifecycle.
- Own strike-window manager (`+/-3%`) with paced roll logic.
- Normalize incoming underlying/option ticks into internal events.
- Reuse known-working IBKR connection patterns from the SPYbot repo.

Agent 2 - Quant Analytics Engineer:
- Own IV curve fit and residuals in log-moneyness space.
- Own exposures (`GEX`, `DEX`, `VEX`) with OI-weighted and volume-weighted variants.
- Own `MSI` and `MTC` formulas, ranking, and threshold defaults.
- Enforce liquidity hard-gates before scoring contracts.

Agent 3 - UI Systems Engineer:
- Own WebSocket incremental stream consumption and update pacing.
- Own strike ladder rendering and visual highlighting for MSI/MTC and outliers.
- Own level overlays, pinned-strike detail panel, and contract-copy UX.
- Keep render cadence stable (target 5-10 UI updates per second).

## Required Check-In Protocol

Run PM check-ins:
- End of each milestone.
- Every 45 minutes during active implementation.

Each agent update must include:
- `Done`: concrete completed items.
- `Evidence`: logs/tests/examples.
- `Assumptions`: source-tagged.
- `Unknowns`: blocking gaps.
- `Next`: single highest-priority action.

Hard gate:
- No metric or behavior claim without source (`IB tick`, `config`, `derived calc`, or `test`).
- If source cannot be provided, mark as `Unknown` and escalate.

## Core Analytics Definitions

`MSI` (Most Significant Strike):
- `ImpactScore(k) = Abs(GEX_1pct(k)) * ProximityWeight(distance_to_spot) * ConcentrationWeight(local_dominance)`
- `ProximityWeight = exp(-distance_pct / bandwidth)` where bandwidth ~`0.5%` to `1.0%`.
- `ConcentrationWeight = Abs(GEX(k)) / (Abs(GEX(k-1)) + Abs(GEX(k)) + Abs(GEX(k+1)) + epsilon)`.

`MTC` (Most Tradable Contract):
- `TradableScore = LiquidityScore * CheapIVScore * EfficiencyScore * RegimeFit`
- Liquidity must pass hard thresholds (spread %, size, freshness) before ranking.

## Workflow

1. Scope lock (PM)
   - Confirm QQQ-only MVP, strike window policy, and deferred features.
2. Data feasibility (Agent 1)
   - Confirm subscriptions, line budget, pacing strategy, reconnect behavior.
3. Analytics contract (Agent 2)
   - Define formulas, thresholds, smoothing, and summary outputs.
4. UI contract (Agent 3)
   - Define message diffs, table/charts layout, and interaction model.
5. Gate review (PM)
   - Verify no unsupported assumptions and approve milestone handoff.

## Resources To Read

- `references/prompts.md` - role prompts and PM check-in template
- `references/risk_checklist.md` - anti-hallucination and consistency checks
- `references/output_schema.json` - baseline structured output schema
- `assets/report-template.md` - concise reporting template
- `../../../PROJECT_PLAN.md` - project canonical planning baseline

## Operating Rules

- Do not invent marketwide conclusions from limited strike-window data.
- Do not treat single highest GEX strike as directional prediction without regime context.
- Prefer raw + smoothed metrics together to detect regime shifts.
- Keep all security assumptions local-first: no IBKR credentials in repo, localhost bind by default.
