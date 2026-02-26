import { formatContractDescriptor } from "@/utils/contracts"
import {
  formatCompactSigned,
  formatIv,
  formatIvResidualVolPoints,
  formatOptionMid,
  formatSpreadPct,
  formatSummaryPercent
} from "@/utils/format"
import type { ContractSeriesPoint } from "@/utils/timeseries"
import type { StrikeRow } from "@/ws/types"

interface PinnedSelection {
  strike: number
  side: "call" | "put"
}

interface Props {
  symbol: string
  expiry: string
  spotMid: number | null
  selection: PinnedSelection | null
  row: StrikeRow | null
  series: ContractSeriesPoint[]
  onClose: () => void
  onCopyContract: (includeConid: boolean) => void
  onJumpToStrike: (strike: number) => void
}

const SPARK_WIDTH = 250
const SPARK_HEIGHT = 56

function sparkPath(values: number[]): string {
  if (values.length < 2) {
    return ""
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(0.000001, max - min)
  const innerW = SPARK_WIDTH - 8
  const innerH = SPARK_HEIGHT - 8

  return values
    .map((value, index) => {
      const x = 4 + (index / Math.max(1, values.length - 1)) * innerW
      const y = 4 + (1 - (value - min) / span) * innerH
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

interface TrendBadge {
  label: "UP" | "DOWN" | "FLAT"
  className: "trend-up" | "trend-down" | "trend-flat"
}

function deriveTrend(values: Array<number | null>): TrendBadge {
  const compact = values.filter((value): value is number => value !== null)
  if (compact.length < 2) {
    return { label: "FLAT", className: "trend-flat" }
  }

  const startIndex = Math.max(0, compact.length - 6)
  const start = compact[startIndex]
  const end = compact[compact.length - 1]
  const base = Math.max(Math.abs(start), 0.000001)
  const movement = (end - start) / base

  if (Math.abs(movement) < 0.01) {
    return { label: "FLAT", className: "trend-flat" }
  }
  if (movement > 0) {
    return { label: "UP", className: "trend-up" }
  }
  return { label: "DOWN", className: "trend-down" }
}

function Sparkline({ label, values, latest }: { label: string; values: Array<number | null>; latest: string }): JSX.Element {
  const compact = values.filter((value): value is number => value !== null)
  const path = sparkPath(compact)
  const trend = deriveTrend(values)

  return (
    <div className="spark-card">
      <div className="spark-head">
        <span>{label}</span>
        <div className="spark-head-right">
          <span className={`trend-badge ${trend.className}`}>{trend.label}</span>
          <strong>{latest}</strong>
        </div>
      </div>
      <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}>
        {path ? <path d={path} className="spark-line" /> : null}
      </svg>
    </div>
  )
}

export function PinnedDetailDrawer({
  symbol,
  expiry,
  spotMid,
  selection,
  row,
  series,
  onClose,
  onCopyContract,
  onJumpToStrike
}: Props): JSX.Element {
  if (!selection || !row) {
    return (
      <aside className="drawer-shell" aria-label="Detail drawer">
        <div className="drawer-empty">Select a strike row to pin details.</div>
      </aside>
    )
  }

  const block = selection.side === "call" ? row.call : row.put
  const descriptor = formatContractDescriptor(block.contract_id)
  const ageMs = block.stale_ms
  const distanceToSpot =
    spotMid !== null && spotMid > 0 ? Math.abs((row.strike - spotMid) / spotMid) : null

  return (
    <aside className="drawer-shell" aria-label="Detail drawer">
      <div className="drawer-head">
        <h3>Pinned {selection.side.toUpperCase()}</h3>
        <button type="button" onClick={onClose} className="drawer-close">
          Close
        </button>
      </div>
      <p className="drawer-contract">{descriptor}</p>
      <p className="drawer-subtle">
        {symbol} {expiry || "N A"} | Strike {selection.strike}
      </p>

      <div className="drawer-actions">
        <button type="button" onClick={() => onJumpToStrike(selection.strike)}>
          Jump to Strike
        </button>
        <button type="button" onClick={() => onCopyContract(false)}>
          Copy Contract
        </button>
        <button type="button" onClick={() => onCopyContract(true)}>
          Copy w/ conid
        </button>
      </div>

      <dl className="drawer-grid">
        <dt>Mid</dt>
        <dd>{formatOptionMid(block.mid)}</dd>
        <dt>Spread</dt>
        <dd>{formatSpreadPct(block.spread_pct)}</dd>
        <dt>IV</dt>
        <dd>{formatIv(block.iv)}</dd>
        <dt>IVr</dt>
        <dd>{formatIvResidualVolPoints(block.iv_residual)}</dd>
        <dt>Delta</dt>
        <dd>{block.delta === null ? "·" : block.delta.toFixed(2)}</dd>
        <dt>Gamma/$</dt>
        <dd>{block.per_dollar.gamma_per_dollar === null ? "·" : block.per_dollar.gamma_per_dollar.toFixed(4)}</dd>
        <dt>Vega/$</dt>
        <dd>{block.per_dollar.vega_per_dollar === null ? "·" : block.per_dollar.vega_per_dollar.toFixed(3)}</dd>
        <dt>Theta/$</dt>
        <dd>{block.per_dollar.theta_per_dollar === null ? "·" : block.per_dollar.theta_per_dollar.toFixed(3)}</dd>
        <dt>Staleness</dt>
        <dd>
          {ageMs} ms ({(ageMs / 1000).toFixed(1)} s)
        </dd>
      </dl>

      {block.mtc_rationale ? (
        <dl className="drawer-grid drawer-grid-tight">
          <dt>Tradable</dt>
          <dd>{block.mtc_rationale.tradable_score.toFixed(2)}</dd>
          <dt>Liquidity</dt>
          <dd>{block.mtc_rationale.liquidity_score.toFixed(2)}</dd>
          <dt>Cheap IV</dt>
          <dd>{block.mtc_rationale.cheap_iv_score.toFixed(2)}</dd>
          <dt>Efficiency</dt>
          <dd>{block.mtc_rationale.efficiency_score.toFixed(2)}</dd>
          <dt>Stability</dt>
          <dd>{block.mtc_rationale.stability_score.toFixed(2)}</dd>
          <dt>Liquid Gate</dt>
          <dd>{block.mtc_rationale.gate_liquid ? "PASS" : "FAIL"}</dd>
          <dt>Delta Gate</dt>
          <dd>{block.mtc_rationale.gate_delta_band ? "PASS" : "FAIL"}</dd>
        </dl>
      ) : null}

      <Sparkline
        label="Mid"
        values={series.map((point) => point.mid)}
        latest={formatOptionMid(block.mid)}
      />
      <Sparkline
        label="IV"
        values={series.map((point) => (point.iv === null ? null : point.iv * 100))}
        latest={formatIv(block.iv)}
      />
      <Sparkline
        label="IVr"
        values={series.map((point) => (point.iv_residual === null ? null : point.iv_residual * 100))}
        latest={formatIvResidualVolPoints(block.iv_residual)}
      />
      <Sparkline
        label="Spread"
        values={series.map((point) => (point.spread_pct === null ? null : point.spread_pct * 100))}
        latest={formatSpreadPct(block.spread_pct)}
      />

      <div className="drawer-exposure">
        <h4>Strike Exposure</h4>
        <p>OI GEX: {formatCompactSigned(row.exposures.oi.gex)}</p>
        <p>Vol GEX: {formatCompactSigned(row.exposures.vol.gex)}</p>
        <p>MSI Score: {row.msi_score === null ? "N A" : row.msi_score.toFixed(2)}</p>
        <p>Distance to Spot: {formatSummaryPercent(distanceToSpot)}</p>
      </div>
    </aside>
  )
}
