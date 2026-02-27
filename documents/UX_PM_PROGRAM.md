# UX PM Program (Premium Terminal Modernization)

## Scope
- Local QQQ 0DTE analytics console only.
- UX modernization for scan speed and explainability.
- No execution routing, no account or order surfaces.

## Team Model
- PM Orchestrator:
  - owns scope, dependency gates, and acceptance.
  - blocks unsupported metric claims.
  - signs off on milestone completion.
- Sub-agent 1 (Visual Systems):
  - owns design tokens, visual hierarchy, spacing, typography, motion.
  - keeps palette discrete and flicker-safe.
- Sub-agent 2 (Interaction Systems):
  - owns decision cockpit actions, command palette, keyboard flow, navigation friction.
  - owns scan/explain mode ergonomics.
- Sub-agent 3 (UX QA and Performance):
  - owns stale/disconnect behavior, accessibility checks, and render budgets.
  - validates no full-ladder rerender regressions.

## Cadence and Evidence
- Mandatory PM check-in every 45 minutes during active implementation.
- Mandatory PM check-in at end of each milestone.
- Check-in format (must match `skills/public/options-analysis-agents/references/prompts.md`):
  - `Done`
  - `Evidence`
  - `Assumptions`
  - `Unknowns`
  - `Next`

## Milestone 1 (Quick Scan and Visual Clarity)
- Tokenized premium-terminal theme.
- Decision cockpit strip and context chips.
- Command palette and speed shortcuts.
- Additive summary fields surfaced in backend and frontend types.

Acceptance:
- Operator reaches ATM/MSI/MTC in one action.
- Connection/freshness confidence is visible without opening detail drawers.
- Existing playback and ladder keyboard controls remain functional.

## Milestone 2 (Deeper Interaction and Explainability)
- Decision Assist panel with compare tray (up to two contracts).
- Scan mode versus explain mode.
- Legend popover and concise definitions.
- Stale/disconnect and zero-subscription fallback messaging.

Acceptance:
- Explain mode adds rationale without degrading scan mode speed.
- Compare tray supports side-by-side contract checks.
- Tablet fallback remains usable at <=1100 px.

## Release Gate
- Backend tests pass.
- Frontend tests pass.
- Render containment remains intact under summary-only deltas.
- Live TWS check:
  - `/health` reports connection and subscription state.
  - `/state` summary exposes quality and regime fields.
