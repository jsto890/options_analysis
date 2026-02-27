import { act } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import { copyContractDescriptor } from "@/utils/contracts"
import { DEFAULT_CONFIG } from "@/ws/reducer"
import type { AnyEnvelope, DeltaEnvelope, SnapshotEnvelope, StrikeRow, Summary } from "@/ws/types"

vi.mock("@/utils/contracts", async () => {
  const actual = await vi.importActual<typeof import("@/utils/contracts")>("@/utils/contracts")
  return {
    ...actual,
    copyContractDescriptor: vi.fn(async () => true)
  }
})

const copyMock = vi.mocked(copyContractDescriptor)

function makeRow(strike: number, opts: { isMsi?: boolean; wallType?: "none" | "call_wall" | "put_wall" } = {}): StrikeRow {
  return {
    strike,
    msi_score: opts.isMsi ? 12 : null,
    flags: { is_msi: Boolean(opts.isMsi), wall_type: opts.wallType ?? "none", is_atm: strike === 430 },
    call: {
      contract_id: `call-${strike}`,
      mid: 1.1,
      iv: 0.23,
      iv_residual: -0.015,
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
        extreme_greek: false,
        stale_level: "fresh"
      },
      mtc_score: null,
      mtc_rationale: null
    },
    put: {
      contract_id: `put-${strike}`,
      mid: 1.2,
      iv: 0.25,
      iv_residual: -0.01,
      delta: -0.45,
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
      oi: { dex: 1, gex: strike * 1.5, vex: 3 },
      vol: { dex: 1, gex: strike * 1.2, vex: 3 }
    }
  }
}

function makeSnapshot(rows: StrikeRow[], summaryPatch: Partial<Summary> = {}): SnapshotEnvelope {
  return {
    type: "snapshot",
    schema_version: 1,
    ts_ms: 1,
    payload: {
      underlying: {
        symbol: "QQQ",
        expiry: "20260226",
        spot: { bid: 430, ask: 430.1, last: 430.05, mid: 430.05, ts_ms: 1 }
      },
      config: DEFAULT_CONFIG,
      summary: {
        net_gex_band: 100,
        pin_risk: 61,
        msi_strikes: rows.filter((row) => row.flags.is_msi).map((row) => row.strike),
        atm_strike: 430,
        mtc_call_contract_id: rows[0]?.call.contract_id ?? null,
        mtc_put_contract_id: rows[0]?.put.contract_id ?? null,
        nearest_msi_distance_pct: 0.01,
        market_regime: "pinning",
        data_quality_score: 0.82,
        fresh_contract_ratio: 0.75,
        stream_latency_ms: 350,
        ...summaryPatch
      },
      rows
    }
  }
}

function makeDelta(row: StrikeRow): DeltaEnvelope {
  return {
    type: "delta",
    schema_version: 1,
    ts_ms: 2,
    payload: {
      underlying_patch: {},
      summary_patch: { pin_risk: 67 },
      row_patches: [{ strike: row.strike, msi_score: 13 }]
    }
  }
}

function installFetch(envelopes: AnyEnvelope[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("playback.json")) {
      return new Response(JSON.stringify(envelopes), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({ error: "not-found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    })
  })

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  window.history.pushState({}, "", "/?playback=/playback.json")
  copyMock.mockClear()
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.pushState({}, "", "/")
})

describe("App controls + integrations", () => {
  it("keeps control-strip filter state across stream updates", async () => {
    const rows = [makeRow(430), makeRow(431, { isMsi: true, wallType: "call_wall" })]
    installFetch([makeSnapshot(rows), makeDelta(rows[1])])

    const { container } = render(<App />)

    await waitFor(() => expect(screen.getByRole("toolbar", { name: "Ladder controls" })).toBeTruthy())

    const sortButton = screen.getByRole("button", { name: /Sort:/ })
    expect(sortButton.textContent).toContain("ASC")
    fireEvent.click(sortButton)
    expect(sortButton.textContent).toContain("DESC")

    const msiOnly = screen.getByRole("checkbox", { name: "MSI only" })
    fireEvent.click(msiOnly)
    expect((msiOnly as HTMLInputElement).checked).toBe(true)
    expect(container.querySelectorAll("tbody tr").length).toBe(1)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650))
    })
    expect((msiOnly as HTMLInputElement).checked).toBe(true)
    expect(container.querySelectorAll("tbody tr").length).toBe(1)
    expect(screen.queryByLabelText("Data refresh (ms)")).toBeNull()
    expect(screen.queryByLabelText("UI refresh (ms)")).toBeNull()
    expect(screen.queryByLabelText("Paper mode")).toBeNull()
    expect(screen.queryByRole("button", { name: "Save Desktop Settings" })).toBeNull()
  })

  it("supports keyboard shortcuts Arrow/Enter/c/Shift+c/Esc", async () => {
    const rows = [makeRow(430), makeRow(431)]
    installFetch([makeSnapshot(rows)])

    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelector("tbody tr[data-strike='430']")).not.toBeNull())

    const row430 = container.querySelector("tbody tr[data-strike='430']")
    expect(row430).not.toBeNull()
    fireEvent.click(row430 as Element)

    fireEvent.keyDown(window, { key: "c" })
    fireEvent.keyDown(window, { key: "C", shiftKey: true })
    expect(copyMock).toHaveBeenCalledWith("call-430", false)
    expect(copyMock).toHaveBeenCalledWith("call-430", true)

    fireEvent.keyDown(window, { key: "ArrowDown" })
    expect(container.querySelector("tbody tr.selected-row")?.getAttribute("data-strike")).toBe("431")

    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByText("Pinned PUT")).toBeTruthy()

    fireEvent.keyDown(window, { key: "Enter" })
    expect(screen.getByText("Select a strike row to pin details.")).toBeTruthy()

    fireEvent.click(container.querySelector("tbody tr[data-strike='430']") as Element)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.getByText("Select a strike row to pin details.")).toBeTruthy()
  })

  it("supports click-through flows MSI list → ladder, MTC card → ladder, chart point → ladder", async () => {
    const rows = [makeRow(430), makeRow(431, { isMsi: true, wallType: "call_wall" })]
    installFetch([
      makeSnapshot(rows, {
        mtc_call_contract_id: "call-430",
        mtc_put_contract_id: "put-430"
      })
    ])

    const { container } = render(<App />)

    await waitFor(() => expect(screen.getByRole("button", { name: /431 \| call_wall/ })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /431 \| call_wall/ }))
    expect(container.querySelector("tbody tr.selected-row")?.getAttribute("data-strike")).toBe("431")

    fireEvent.click(screen.getAllByRole("button", { name: "Focus" })[0])
    expect(container.querySelector("tbody tr.selected-row")?.getAttribute("data-strike")).toBe("430")

    const circles = container.querySelectorAll(".mini-chart-shell svg circle")
    expect(circles.length).toBeGreaterThan(0)
    fireEvent.click(circles[circles.length - 1])
    expect(container.querySelector("tbody tr.selected-row")?.getAttribute("data-strike")).toBe("431")
  })

  it("supports playback seek/scrub", async () => {
    const rows = [makeRow(430), makeRow(431)]
    installFetch([makeSnapshot(rows), makeDelta(rows[1]), makeDelta(rows[1])])

    render(<App />)

    await waitFor(() => expect(screen.getByLabelText("Seek")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Pause" }))

    const seek = screen.getByLabelText("Seek") as HTMLInputElement
    fireEvent.change(seek, { target: { value: "2" } })
    expect(seek.value).toBe("2")
    expect(screen.getByText(/Frame 2\/3/)).toBeTruthy()
  })

  it("opens command palette with meta+k and runs jump action", async () => {
    const rows = [makeRow(430), makeRow(431, { isMsi: true, wallType: "call_wall" })]
    installFetch([makeSnapshot(rows)])

    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector("tbody tr[data-strike='430']")).not.toBeNull())

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Jump to nearest MSI/i }))
    expect(container.querySelector("tbody tr.selected-row")?.getAttribute("data-strike")).toBe("431")
  })

  it("updates cockpit summary deltas without rerendering ladder rows", async () => {
    const rows = [makeRow(430), makeRow(431, { isMsi: true, wallType: "call_wall" })]
    const summaryOnlyDelta: DeltaEnvelope = {
      type: "delta",
      schema_version: 1,
      ts_ms: 3,
      payload: {
        underlying_patch: {},
        summary_patch: {
          market_regime: "trend",
          data_quality_score: 0.67
        },
        row_patches: []
      }
    }
    installFetch([makeSnapshot(rows), summaryOnlyDelta])

    const rowRenderSpy = vi.fn()
    render(<App onRowRender={rowRenderSpy} />)

    await waitFor(() => expect(screen.getByText("PINNING")).toBeTruthy())
    rowRenderSpy.mockClear()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650))
    })

    expect(screen.getByText("TREND")).toBeTruthy()
    expect(rowRenderSpy).not.toHaveBeenCalled()
  })
})
