import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ContextChips } from "@/components/ContextChips"

describe("ContextChips", () => {
  it("renders active state chips for filters, mode, and status", () => {
    render(
      <ContextChips
        filters={{
          msiOnly: true,
          mtcOnly: false,
          liquidOnly: true,
          hideCriticalStale: true
        }}
        selection={{ strike: 431, side: "put" }}
        focusMode
        staleHeavy
        noSubscriptions
        connected={false}
        viewMode="explain"
      />
    )

    expect(screen.getByText("EXPLAIN MODE")).toBeTruthy()
    expect(screen.getByText("Selected PUT 431")).toBeTruthy()
    expect(screen.getByText("GUIDED FOCUS")).toBeTruthy()
    expect(screen.getByText("MSI ONLY")).toBeTruthy()
    expect(screen.getByText("LIQUID ONLY")).toBeTruthy()
    expect(screen.getByText("HIDE CRITICAL STALE")).toBeTruthy()
    expect(screen.getByText("DISCONNECTED")).toBeTruthy()
    expect(screen.getByText("NO SUBSCRIPTIONS")).toBeTruthy()
    expect(screen.getByText("STALE HEAVY")).toBeTruthy()
  })
})
