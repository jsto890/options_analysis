import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StrikeLadder } from "@/components/StrikeLadder"
import { DEFAULT_CONFIG } from "@/ws/reducer"
import type { StrikeRow } from "@/ws/types"

function makeRows(count: number): StrikeRow[] {
  return Array.from({ length: count }, (_, index) => {
    const strike = 400 + index
    return {
      strike,
      msi_score: null,
      flags: { is_msi: false, wall_type: "none", is_atm: strike === 430 },
      call: {
        contract_id: `call-${strike}`,
        mid: 1,
        iv: 0.2,
        iv_residual: -0.01,
        delta: 0.4,
        gamma: 0.01,
        vega: 0.1,
        theta: -0.01,
        spread_pct: 0.02,
        volume: 100,
        oi: 200,
        liquid: true,
        stale_ms: 80,
        per_dollar: {
          gamma_per_dollar: 0.01,
          vega_per_dollar: 0.02,
          theta_per_dollar: 0.03
        },
        highlights: {
          iv_imbalance: false,
          extreme_greek: false,
          stale_level: "fresh"
        },
        mtc_score: null,
        mtc_rationale: null
      },
      put: {
        contract_id: `put-${strike}`,
        mid: 1,
        iv: 0.2,
        iv_residual: -0.01,
        delta: -0.4,
        gamma: 0.01,
        vega: 0.1,
        theta: -0.01,
        spread_pct: 0.02,
        volume: 100,
        oi: 200,
        liquid: true,
        stale_ms: 80,
        per_dollar: {
          gamma_per_dollar: 0.01,
          vega_per_dollar: 0.02,
          theta_per_dollar: 0.03
        },
        highlights: {
          iv_imbalance: false,
          extreme_greek: false,
          stale_level: "fresh"
        },
        mtc_score: null,
        mtc_rationale: null
      },
      exposures: {
        oi: { dex: 1, gex: 2, vex: 3 },
        vol: { dex: 1, gex: 2, vex: 3 }
      }
    }
  })
}

describe("StrikeLadder render containment", () => {
  it("rerenders only touched rows under heavy ladder updates", () => {
    const rows = makeRows(240)
    const renderCounts = new Map<number, number>()

    const { rerender } = render(
      <StrikeLadder
        rows={rows}
        mtcCallContractId={null}
        mtcPutContractId={null}
        config={DEFAULT_CONFIG}
        selectedStrike={null}
        selectedContractId={null}
        focusStrike={null}
        onRowRender={(strike) => {
          renderCounts.set(strike, (renderCounts.get(strike) ?? 0) + 1)
        }}
      />
    )

    renderCounts.clear()

    const nextRows = [...rows]
    nextRows[120] = {
      ...nextRows[120],
      call: {
        ...nextRows[120].call,
        mid: 1.23
      }
    }

    rerender(
      <StrikeLadder
        rows={nextRows}
        mtcCallContractId={null}
        mtcPutContractId={null}
        config={DEFAULT_CONFIG}
        selectedStrike={null}
        selectedContractId={null}
        focusStrike={null}
        onRowRender={(strike) => {
          renderCounts.set(strike, (renderCounts.get(strike) ?? 0) + 1)
        }}
      />
    )

    const rerenderedRows = Array.from(renderCounts.keys())
    expect(rerenderedRows).toEqual([nextRows[120].strike])
  })
})
