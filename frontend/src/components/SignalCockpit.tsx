import {
  formatCompactSigned,
  formatLatency,
  formatMarketRegime,
  formatOptionMid,
  formatQualityScore,
  formatSummaryPercent
} from "@/utils/format"

type ViewMode = "scan" | "explain"

interface Props {
  symbol: string
  expiry: string
  connected: boolean
  subscriptions: number
  mode: "live" | "playback"
  spotMid: number | null
  pinRisk: number
  netGexBand: number | null
  nearestMsiDistancePct: number | null
  marketRegime?: "pinning" | "trend" | "transition" | "unknown" | null
  dataQualityScore?: number | null
  freshContractRatio?: number | null
  streamLatencyMs?: number | null
  viewMode: ViewMode
  onToggleViewMode: () => void
  onOpenCommandPalette: () => void
}

export function SignalCockpit({
  symbol,
  expiry,
  connected,
  subscriptions,
  mode,
  spotMid,
  pinRisk,
  netGexBand,
  nearestMsiDistancePct,
  marketRegime,
  dataQualityScore,
  freshContractRatio,
  streamLatencyMs,
  viewMode,
  onToggleViewMode,
  onOpenCommandPalette
}: Props): JSX.Element {
  const qualityClass =
    dataQualityScore === null || dataQualityScore === undefined
      ? "neutral"
      : dataQualityScore >= 0.75
        ? "good"
        : dataQualityScore >= 0.5
          ? "warn"
          : "bad"

  return (
    <section className="signal-cockpit" aria-label="Decision cockpit">
      <div className="signal-cockpit-head">
        <div className="signal-cockpit-title">
          <strong>{symbol || "QQQ"}</strong>
          <span className={`status ${connected ? "ok" : "down"}`}>{connected ? "CONNECTED" : "DISCONNECTED"}</span>
          <span className="cockpit-expiry">Expiry {expiry || "N A"}</span>
        </div>
        <div className="signal-cockpit-actions">
          <button type="button" className="control-btn" onClick={onOpenCommandPalette}>
            Command (Ctrl+K)
          </button>
          <button type="button" className="control-btn" onClick={onToggleViewMode}>
            {viewMode === "scan" ? "Explain Mode" : "Scan Mode"}
          </button>
        </div>
      </div>
      <div className="signal-grid">
        <CockpitStat label="Spot" value={formatOptionMid(spotMid)} />
        <CockpitStat label="Regime" value={formatMarketRegime(marketRegime)} />
        <CockpitStat label="Quality" value={formatQualityScore(dataQualityScore)} tone={qualityClass} />
        <CockpitStat label="Fresh %" value={formatSummaryPercent(freshContractRatio ?? null, 0)} />
        <CockpitStat label="Latency" value={formatLatency(streamLatencyMs)} />
        <CockpitStat label="Pin Risk" value={Math.round(pinRisk).toString()} />
        <CockpitStat label="Net GEX" value={formatCompactSigned(netGexBand)} />
        <CockpitStat label="Nearest MSI" value={formatSummaryPercent(nearestMsiDistancePct)} />
        <CockpitStat label="Mode" value={mode.toUpperCase()} />
        <CockpitStat label="Subs" value={String(subscriptions)} />
      </div>
    </section>
  )
}

function CockpitStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }): JSX.Element {
  return (
    <article className={`cockpit-stat tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}
