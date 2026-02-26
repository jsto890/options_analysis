import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { StrikeLadder } from "@/components/StrikeLadder"
import { DEFAULT_CONFIG } from "@/ws/reducer"
import type { StrikeRow } from "@/ws/types"

function makeRow(): StrikeRow {
  return {
    strike: 430,
    msi_score: 15,
    flags: { is_msi: true, is_atm: true, wall_type: "call_wall" },
    call: {
      contract_id: "call-430",
      mid: 1.2,
      iv: 0.22,
      iv_residual: -0.02,
      delta: 0.45,
      gamma: 0.01,
      vega: 0.1,
      theta: -0.02,
      spread_pct: 0.03,
      volume: 120,
      oi: 300,
      liquid: true,
      stale_ms: 100,
      per_dollar: {
        gamma_per_dollar: 0.018,
        vega_per_dollar: 0.09,
        theta_per_dollar: 0.012
      },
      highlights: {
        iv_imbalance: true,
        extreme_greek: true,
        stale_level: "fresh"
      },
      mtc_score: null,
      mtc_rationale: null
    },
    put: {
      contract_id: "put-430",
      mid: 1.15,
      iv: 0.24,
      iv_residual: -0.01,
      delta: -0.48,
      gamma: 0.011,
      vega: 0.095,
      theta: -0.018,
      spread_pct: 0.025,
      volume: 115,
      oi: 280,
      liquid: true,
      stale_ms: 120,
      per_dollar: {
        gamma_per_dollar: 0.017,
        vega_per_dollar: 0.085,
        theta_per_dollar: 0.011
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
}

describe("StrikeLadder", () => {
  it("applies MTC highlight precedence over iv/extreme flags", () => {
    const { container } = render(
      <StrikeLadder
        rows={[makeRow()]}
        mtcCallContractId="call-430"
        mtcPutContractId={null}
        config={DEFAULT_CONFIG}
        selectedStrike={null}
        selectedContractId={null}
        focusStrike={null}
      />
    )

    const callMidCell = container.querySelector("tbody tr td.w-mid")
    expect(callMidCell?.className).toContain("highlight-mtc")
    expect(callMidCell?.className).not.toContain("highlight-iv")
  })

  it("emits copy callback when mtc badge is clicked", () => {
    const onCopy = vi.fn()

    const { getByRole } = render(
      <StrikeLadder
        rows={[makeRow()]}
        mtcCallContractId="call-430"
        mtcPutContractId={null}
        config={DEFAULT_CONFIG}
        selectedStrike={null}
        selectedContractId={null}
        focusStrike={null}
        onCopyMtcContract={onCopy}
      />
    )

    getByRole("button", { name: "MTC" }).click()
    expect(onCopy).toHaveBeenCalledWith("call-430")
  })
})
