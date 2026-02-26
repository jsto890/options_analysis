import { formatCompactSigned } from "@/utils/format"
import type { StrikeRow } from "@/ws/types"

interface Props {
  rows: StrikeRow[]
  selectedStrike?: number | null
  onSelectStrike?: (strike: number) => void
}

const WIDTH = 250
const HEIGHT = 150
const PADDING_X = 12
const PADDING_Y = 12

export function MiniExposureChart({ rows, selectedStrike = null, onSelectStrike }: Props): JSX.Element {
  const gexData = rows
    .map((row) => ({ strike: row.strike, gex: row.exposures.oi.gex ?? 0 }))
    .filter((row) => Number.isFinite(row.gex))

  if (gexData.length === 0) {
    return <p className="mini-chart-empty">N A</p>
  }

  const maxAbs = Math.max(
    1,
    ...gexData.map((point) => Math.abs(point.gex))
  )
  const innerWidth = WIDTH - PADDING_X * 2
  const innerHeight = HEIGHT - PADDING_Y * 2
  const barWidth = Math.max(3, innerWidth / Math.max(gexData.length, 1) - 1)
  const zeroY = PADDING_Y + innerHeight / 2

  return (
    <div className="mini-chart-shell">
      <h4>Exposure (OI GEX)</h4>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="Exposure chart">
        <line x1={PADDING_X} x2={WIDTH - PADDING_X} y1={zeroY} y2={zeroY} className="chart-zero-line" />
        {gexData.map((point, index) => {
          const x = PADDING_X + index * (barWidth + 1)
          const scaled = (Math.abs(point.gex) / maxAbs) * (innerHeight / 2)
          const y = point.gex >= 0 ? zeroY - scaled : zeroY
          return (
            <rect
              key={point.strike}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, scaled)}
              className={`${point.gex >= 0 ? "chart-bar-pos" : "chart-bar-neg"} ${
                selectedStrike === point.strike ? "chart-bar-selected" : ""
              }`.trim()}
              onClick={() => onSelectStrike?.(point.strike)}
            >
              <title>
                {point.strike} | {formatCompactSigned(point.gex)}
              </title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}
