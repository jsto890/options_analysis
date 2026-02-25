import { useEffect, useMemo } from "react"

import { StrikeLadder } from "@/components/StrikeLadder"
import { useStreamStore } from "@/state/store"
import { formatOptionMid } from "@/utils/format"
import { StreamClient } from "@/ws/client"

export default function App(): JSX.Element {
  const [state, dispatch] = useStreamStore()

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    const host = window.location.hostname || "127.0.0.1"
    const port = "8000"
    const client = new StreamClient(`${protocol}://${host}:${port}/stream`, (envelope) => dispatch(envelope))
    client.connect()
    return () => client.disconnect()
  }, [])

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
