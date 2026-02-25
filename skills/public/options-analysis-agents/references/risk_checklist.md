# Risk and Consistency Checklist (QQQ 0DTE MVP)

Use this list at every PM gate and milestone review.

## Scope Integrity

- Build remains QQQ-only and local-first.
- Active strike window remains constrained to `+/-3%` around spot.
- Deferred features are not silently added.

## Data Integrity

- Underlying tick freshness is within configured timeout.
- Option rows include valid mid inputs before analytics use.
- Spread %, sizes, and staleness gates are applied before MTC ranking.
- Subscriptions and unsubscriptions respect pacing constraints.

## Analytics Integrity

- IV fit uses explicit model and robust handling for quote glitches.
- IV residual direction and sign are consistent with fit definition.
- Exposure units are documented and consistent across outputs.
- MSI formula terms are computed with defined bandwidth and epsilon.
- MTC ranking never bypasses liquidity hard-gates.

## Hallucination Controls

- Every metric claim is source-tagged (`IB tick`, `config`, `derived`, `test`).
- Any unsupported claim is downgraded to `Unknown` and escalated.
- Assumptions are explicit; no implicit marketwide inference from windowed data.
- Regime claims include concrete evidence from current computed state.

## Operational Reliability

- Reconnect path includes resubscribe and state recovery behavior.
- API stream uses incremental diffs, not full table dumps each tick.
- Compute budget remains under target per update burst.
- UI update cadence remains capped to avoid flicker and CPU waste.
