import { describe, expect, it } from "vitest"

import {
  formatCount,
  formatIv,
  formatIvResidualVolPoints,
  formatOptionMid,
  formatSpreadPct,
  ladderNull,
  summaryNull
} from "@/utils/format"


describe("formatting", () => {
  it("formats option mid with precision tiers", () => {
    expect(formatOptionMid(1.234)).toBe("1.23")
    expect(formatOptionMid(0.4567)).toBe("0.457")
    expect(formatOptionMid(0.04567)).toBe("0.0457")
    expect(formatOptionMid(0)).toBe("0.0000")
  })

  it("formats spread percent and iv values", () => {
    expect(formatSpreadPct(0.12)).toBe("12.0%")
    expect(formatSpreadPct(0.0085)).toBe("0.85%")
    expect(formatSpreadPct(1.5)).toBe("100%+")
    expect(formatIv(0.273)).toBe("27.3")
    expect(formatIvResidualVolPoints(-0.0123)).toBe("-1.23")
  })

  it("formats null and counts consistently", () => {
    expect(ladderNull(null)).toBe("·")
    expect(summaryNull(null)).toBe("N A")
    expect(formatCount(12345)).toBe("12,345")
  })
})
