import { describe, expect, it } from "vitest"

import {
  deriveContractSignals,
  deriveIvResidualBand,
  deriveSpreadBand,
  deriveStaleLevel,
  resolveHighlightTier
} from "@/utils/signals"
import { DEFAULT_CONFIG } from "@/ws/reducer"
import type { ContractBlock } from "@/ws/types"

function makeBlock(overrides: Partial<ContractBlock> = {}): ContractBlock {
  return {
    contract_id: "c1",
    mid: 1.1,
    iv: 0.24,
    iv_residual: -0.02,
    delta: 0.45,
    gamma: 0.01,
    vega: 0.1,
    theta: -0.01,
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
    mtc_rationale: null,
    highlights: {
      iv_imbalance: false,
      extreme_greek: false,
      stale_level: "fresh"
    },
    ...overrides
  }
}

describe("signal buckets", () => {
  it("derives stale levels from thresholds", () => {
    expect(deriveStaleLevel(1000, 1500)).toBe("fresh")
    expect(deriveStaleLevel(1700, 1500)).toBe("stale")
    expect(deriveStaleLevel(4700, 1500)).toBe("critical")
  })

  it("uses backend stale level when present", () => {
    expect(deriveStaleLevel(100, 1500, "critical")).toBe("critical")
  })

  it("bands spread and iv residual deterministically", () => {
    expect(deriveSpreadBand(0.03, 0.12)).toBe("tight")
    expect(deriveSpreadBand(0.08, 0.12)).toBe("acceptable")
    expect(deriveSpreadBand(0.18, 0.12)).toBe("wide")

    expect(deriveIvResidualBand(-0.015, -0.01)).toBe("cheap")
    expect(deriveIvResidualBand(-0.005, -0.01)).toBe("neutral")
    expect(deriveIvResidualBand(0.001, -0.01)).toBe("rich")
  })
})

describe("highlight precedence", () => {
  it("resolves priority as mtc > iv imbalance > extreme", () => {
    expect(
      resolveHighlightTier({
        staleLevel: "fresh",
        isMtc: true,
        ivImbalance: true,
        extremeGreek: true
      })
    ).toBe("mtc")

    expect(
      resolveHighlightTier({
        staleLevel: "fresh",
        isMtc: false,
        ivImbalance: true,
        extremeGreek: true
      })
    ).toBe("iv_imbalance")

    expect(
      resolveHighlightTier({
        staleLevel: "fresh",
        isMtc: false,
        ivImbalance: false,
        extremeGreek: true
      })
    ).toBe("extreme")
  })

  it("lets critical stale mute all highlight tiers", () => {
    expect(
      resolveHighlightTier({
        staleLevel: "critical",
        isMtc: true,
        ivImbalance: true,
        extremeGreek: true
      })
    ).toBe("none")
  })

  it("falls back to frontend-derived imbalance if backend flags are missing", () => {
    const block = makeBlock({
      iv_residual: -0.02,
      highlights: undefined
    })

    const signals = deriveContractSignals(block, DEFAULT_CONFIG, false)
    expect(signals.ivImbalance).toBe(true)
    expect(signals.highlightTier).toBe("iv_imbalance")
  })
})
