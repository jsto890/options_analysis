import { describe, expect, it } from "vitest"

import { formatContractDescriptor, parseContractId } from "@/utils/contracts"

describe("contract descriptor utilities", () => {
  it("parses backend contract id shape", () => {
    const parsed = parseContractId("12345:QQQ:20260226:C:430")
    expect(parsed).toEqual({
      conid: 12345,
      symbol: "QQQ",
      expiry: "20260226",
      right: "C",
      strike: 430
    })
  })

  it("formats deterministic copy descriptors", () => {
    expect(formatContractDescriptor("12345:QQQ:20260226:P:432.5")).toBe("QQQ 20260226 P 432.5 SMART")
    expect(formatContractDescriptor("12345:QQQ:20260226:P:432.5", true)).toBe(
      "conid=12345 QQQ 20260226 P 432.5 SMART"
    )
  })

  it("returns N A for malformed contract ids", () => {
    expect(parseContractId("bad")).toBeNull()
    expect(formatContractDescriptor("bad")).toBe("N A")
  })
})
