# Desktop App Program Structure (PM + 3 Subagents)

## Roles and Expertise

| Role | Expertise | Scope Ownership |
|---|---|---|
| PM (Orchestrator) | Interface governance, dependency gating, release QA | Contract freeze, merge order, final sign-off |
| Subagent A (Desktop Runtime) | Native desktop lifecycle + packaging | `desktop/` launcher, smoke script, macOS app packaging |
| Subagent B (Backend Platform) | API surface + persistence + static serving | `/desktop/settings`, `/app`, app-data persistence, backend startup wiring |
| Subagent C (Frontend Desktop UX) | React networking and operator UX | Same-origin API/ws changes, desktop settings panel, restart-required UX and tests |

## Handoff Order

1. Subagent B lands backend contract and static serving.
2. Subagent C lands frontend same-origin and desktop settings UX against that contract.
3. Subagent A integrates packaged runtime and app lifecycle.
4. PM executes final integration gate and release checklist.
