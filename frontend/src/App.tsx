import { useEffect, useMemo, useRef, useState } from "react"

import { MiniExposureChart } from "@/components/MiniExposureChart"
import { MiniIvChart } from "@/components/MiniIvChart"
import { MtcRationaleCard } from "@/components/MtcRationaleCard"
import { PinnedDetailDrawer } from "@/components/PinnedDetailDrawer"
import { StrikeLadder } from "@/components/StrikeLadder"
import { useStreamStore } from "@/state/store"
import { copyContractDescriptor } from "@/utils/contracts"
import { updateSeriesFromRows, type SeriesByContract } from "@/utils/timeseries"
import { formatCompactSigned, formatOptionMid, formatSummaryPercent } from "@/utils/format"
import { StreamClient } from "@/ws/client"
import { PlaybackClient } from "@/ws/playback"
import type { AnyEnvelope, ContractBlock, StrikeRow } from "@/ws/types"

interface Selection {
  strike: number
  side: "call" | "put"
  contractId: string | null
}

export default function App(): JSX.Element {
  const [state, dispatch] = useStreamStore()
  const [mode, setMode] = useState<"live" | "playback">("live")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [seriesByContract, setSeriesByContract] = useState<SeriesByContract>({})
  const [copyStatus, setCopyStatus] = useState<string>("")
  const copyStatusTimer = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true
    let liveClient: StreamClient | null = null
    let playbackClient: PlaybackClient | null = null

    const params = new URLSearchParams(window.location.search)
    const playbackFile = params.get("playback")

    if (playbackFile) {
      setMode("playback")
      void (async () => {
        try {
          const response = await fetch(playbackFile)
          if (!response.ok) {
            throw new Error(`Playback fetch failed with status ${response.status}`)
          }
          const envelopes = (await response.json()) as AnyEnvelope[]
          if (!mounted) {
            return
          }
          playbackClient = new PlaybackClient(envelopes, (envelope) => dispatch(envelope), 500)
          playbackClient.start()
        } catch (error) {
          console.error("Playback bootstrap failed", error)
        }
      })()
      return () => {
        mounted = false
        playbackClient?.stop()
      }
    }

    setMode("live")
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    const host = window.location.hostname || "127.0.0.1"
    const port = "8000"
    liveClient = new StreamClient(`${protocol}://${host}:${port}/stream`, (envelope) => dispatch(envelope))
    liveClient.connect()
    return () => {
      mounted = false
      liveClient?.disconnect()
    }
  }, [dispatch])

  const rows = useMemo(
    () => Object.values(state.rowsByStrike).sort((a, b) => a.strike - b.strike),
    [state.rowsByStrike]
  )

  useEffect(() => {
    if (rows.length === 0) {
      return
    }
    setSeriesByContract((current) => updateSeriesFromRows(current, rows, Date.now()))
  }, [rows])

  useEffect(() => {
    const timer = copyStatusTimer.current
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  const mtcCallBlock = useMemo(
    () => findContractById(rows, state.summary.mtc_call_contract_id),
    [rows, state.summary.mtc_call_contract_id]
  )
  const mtcPutBlock = useMemo(
    () => findContractById(rows, state.summary.mtc_put_contract_id),
    [rows, state.summary.mtc_put_contract_id]
  )

  const msiRows = useMemo(
    () => rows.filter((row) => row.flags.is_msi).sort((a, b) => (b.msi_score ?? 0) - (a.msi_score ?? 0)).slice(0, 3),
    [rows]
  )

  const selectedRow = selection ? state.rowsByStrike[selection.strike] ?? null : null
  const selectedSeries = selection?.contractId ? seriesByContract[selection.contractId] ?? [] : []

  useEffect(() => {
    if (!selection) {
      return
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null)
        return
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return
      }

      const strikes = rows.map((row) => row.strike)
      const currentIndex = strikes.indexOf(selection.strike)
      if (currentIndex === -1) {
        return
      }

      const direction = event.key === "ArrowUp" ? -1 : 1
      const nextIndex = Math.max(0, Math.min(strikes.length - 1, currentIndex + direction))
      if (nextIndex === currentIndex) {
        return
      }

      const nextStrike = strikes[nextIndex]
      const nextRow = state.rowsByStrike[nextStrike]
      if (!nextRow) {
        return
      }

      const nextBlock = selection.side === "call" ? nextRow.call : nextRow.put
      setSelection({
        strike: nextStrike,
        side: selection.side,
        contractId: nextBlock.contract_id
      })
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selection, rows, state.rowsByStrike])

  const handleSelectStrike = (strike: number) => {
    const row = state.rowsByStrike[strike]
    if (!row) {
      return
    }
    setSelection((current) => {
      const side = current?.side ?? "call"
      const block = side === "call" ? row.call : row.put
      return {
        strike,
        side,
        contractId: block.contract_id
      }
    })
  }

  const handleSelectContract = (strike: number, side: "call" | "put", contractId: string) => {
    setSelection({ strike, side, contractId })
  }

  const publishCopyStatus = (message: string) => {
    setCopyStatus(message)
    if (copyStatusTimer.current !== null) {
      window.clearTimeout(copyStatusTimer.current)
    }
    copyStatusTimer.current = window.setTimeout(() => {
      setCopyStatus("")
    }, 1800)
  }

  const handleCopyContract = async (contractId: string | null, includeConid = false) => {
    const success = await copyContractDescriptor(contractId, includeConid)
    if (!success) {
      publishCopyStatus("Copy failed")
      return
    }
    publishCopyStatus(includeConid ? "Copied with conid" : "Copied contract")
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <strong>{state.symbol || "QQQ"}</strong>
          <span className={`status ${state.connected ? "ok" : "down"}`}>{state.connected ? "CONNECTED" : "DISCONNECTED"}</span>
        </div>
        <div>Expiry: {state.expiry || "N A"}</div>
        <div>Spot: {formatOptionMid(state.spot.mid)}</div>
        <div>Mode: {mode.toUpperCase()}</div>
        <div>Subs: {state.subscriptions}</div>
      </header>
      {copyStatus ? <div className="copy-toast">{copyStatus}</div> : null}
      <section className="content-grid">
        <div className="left-panel">
          <h3>Config</h3>
          <p>Cadence: 500 ms</p>
          <p>Window: ±20 strikes</p>
          <p>Status: {state.connected ? "Streaming" : "Awaiting"}</p>
        </div>
        <div className="center-panel">
          <StrikeLadder
            rows={rows}
            mtcCallContractId={state.summary.mtc_call_contract_id}
            mtcPutContractId={state.summary.mtc_put_contract_id}
            maxStaleMs={1500}
            selectedStrike={selection?.strike ?? null}
            selectedContractId={selection?.contractId ?? null}
            onSelectStrike={handleSelectStrike}
            onSelectContract={handleSelectContract}
          />
        </div>
        <div className="right-panel">
          <h3>Summary</h3>
          <p>Pin Risk: {Math.round(state.summary.pin_risk)}</p>
          <p>MSI: {state.summary.msi_strikes.join(", ") || "N A"}</p>
          <p>Net GEX: {formatCompactSigned(state.summary.net_gex_band)}</p>
          <p>Nearest MSI: {formatSummaryPercent(state.summary.nearest_msi_distance_pct)}</p>

          <MiniIvChart rows={rows} />
          <MiniExposureChart rows={rows} />

          <div className="msi-card">
            <h4>Top MSI</h4>
            {msiRows.length === 0 ? (
              <p className="rationale-empty">N A</p>
            ) : (
              <ul className="msi-list">
                {msiRows.map((row) => (
                  <li key={row.strike}>
                    {row.strike} | {row.flags.wall_type} | {row.msi_score === null ? "N A" : row.msi_score.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <MtcRationaleCard
            side="Call"
            block={mtcCallBlock}
            onCopyContract={(contractId, includeConid) => {
              void handleCopyContract(contractId, includeConid)
            }}
          />
          <MtcRationaleCard
            side="Put"
            block={mtcPutBlock}
            onCopyContract={(contractId, includeConid) => {
              void handleCopyContract(contractId, includeConid)
            }}
          />
        </div>
      </section>
      <PinnedDetailDrawer
        symbol={state.symbol}
        expiry={state.expiry}
        spotMid={state.spot.mid}
        selection={selection ? { strike: selection.strike, side: selection.side } : null}
        row={selectedRow}
        series={selectedSeries}
        onClose={() => setSelection(null)}
        onCopyContract={(includeConid) => {
          void handleCopyContract(selection?.contractId ?? null, includeConid)
        }}
      />
    </main>
  )
}

function findContractById(rows: StrikeRow[], contractId: string | null): ContractBlock | null {
  if (!contractId) {
    return null
  }
  for (const row of rows) {
    if (row.call.contract_id === contractId) {
      return row.call
    }
    if (row.put.contract_id === contractId) {
      return row.put
    }
  }
  return null
}
