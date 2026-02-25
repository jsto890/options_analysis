import { useEffect, useMemo, useState } from "react"

import { StrikeLadder } from "@/components/StrikeLadder"
import { useStreamStore } from "@/state/store"
import { formatOptionMid } from "@/utils/format"
import { StreamClient } from "@/ws/client"
import { PlaybackClient } from "@/ws/playback"
import type { AnyEnvelope } from "@/ws/types"

export default function App(): JSX.Element {
  const [state, dispatch] = useStreamStore()
  const [mode, setMode] = useState<"live" | "playback">("live")

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

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <strong>{state.symbol || "QQQ"}</strong>
          <span className={`status ${state.connected ? "ok" : "down"}`}>{state.connected ? "CONNECTED" : "DISCONNECTED"}</span>
        </div>
        <div>Spot: {formatOptionMid(state.spot.mid)}</div>
        <div>Mode: {mode.toUpperCase()}</div>
        <div>Subs: {state.subscriptions}</div>
      </header>
      <section className="content-grid">
        <div className="left-panel">
          <h3>Config</h3>
          <p>Cadence: 500 ms</p>
          <p>Window: ±20 strikes</p>
        </div>
        <div className="center-panel">
          <StrikeLadder
            rows={rows}
            mtcCallContractId={state.summary.mtc_call_contract_id}
            mtcPutContractId={state.summary.mtc_put_contract_id}
            maxStaleMs={1500}
          />
        </div>
        <div className="right-panel">
          <h3>Summary</h3>
          <p>Pin Risk: {Math.round(state.summary.pin_risk)}</p>
          <p>MSI: {state.summary.msi_strikes.join(", ") || "N A"}</p>
          <p>Net GEX: {state.summary.net_gex_band ?? "N A"}</p>
        </div>
      </section>
    </main>
  )
}
