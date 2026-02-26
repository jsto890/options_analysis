import { describe, expect, it } from "vitest"

import { updateSeriesFromRows } from "@/utils/timeseries"
import type { StrikeRow } from "@/ws/types"

function sampleRow(): StrikeRow {
  return {
    strike: 430,
    msi_score: 1,
    flags: { is_msi: true, wall_type: "call_wall" },
    call: {
      contract_id: "1:QQQ:20260226:C:430",
      mid: 1.2,
      iv: 0.22,
      iv_residual: -0.01,
      delta: 0.4,
      gamma: 0.01,
      vega: 0.1,
      theta: -0.02,
      spread_pct: 0.03,
      volume: 100,
      oi: 200,
      liquid: true,
      stale_ms: 100,
      per_dollar: {
        gamma_per_dollar: 0.01,
        vega_per_dollar: 0.02,
        theta_per_dollar: 0.03
      },
      mtc_score: null,
      mtc_rationale: null
    },
    put: {
      contract_id: "2:QQQ:20260226:P:430",
      mid: 1.1,
      iv: 0.23,
      iv_residual: -0.02,
      delta: -0.4,
      gamma: 0.01,
      vega: 0.1,
      theta: -0.02,
      spread_pct: 0.025,
      volume: 90,
      oi: 180,
      liquid: true,
      stale_ms: 120,
      per_dollar: {
        gamma_per_dollar: 0.011,
        vega_per_dollar: 0.021,
        theta_per_dollar: 0.031
      },
      mtc_score: null,
      mtc_rationale: null
    },
    exposures: {
      oi: { dex: 1, gex: 2, vex: 3 },
      vol: { dex: 1, gex: 2, vex: 3 }
    }
  }
}

describe("timeseries cache", () => {
  it("appends and trims contract points", () => {
    const row = sampleRow()

    let cache = updateSeriesFromRows({}, [row], 1000, 2)
    cache = updateSeriesFromRows(cache, [row], 2000, 2)

    const callSeries = cache[row.call.contract_id]
    expect(callSeries).toHaveLength(1)

    row.call.mid = 1.25
    cache = updateSeriesFromRows(cache, [row], 3000, 2)
    cache = updateSeriesFromRows(cache, [row], 4000, 2)

    expect(cache[row.call.contract_id]).toHaveLength(2)
    expect(cache[row.call.contract_id][1].mid).toBe(1.25)
  })
})
