import { formatIv } from "@/utils/format"
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

type Point = { strike: number; iv: number }

function linePath(points: Point[], minStrike: number, maxStrike: number, minIv: number, maxIv: number): string {
  const xSpan = Math.max(1, maxStrike - minStrike)
  const ySpan = Math.max(0.01, maxIv - minIv)
  const innerWidth = WIDTH - PADDING_X * 2
  const innerHeight = HEIGHT - PADDING_Y * 2

  return points
    .map((point, index) => {
      const x = PADDING_X + ((point.strike - minStrike) / xSpan) * innerWidth
      const y = PADDING_Y + (1 - (point.iv - minIv) / ySpan) * innerHeight
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

export function MiniIvChart({ rows, selectedStrike = null, onSelectStrike }: Props): JSX.Element {
  const calls = rows
    .map((row) => ({ strike: row.strike, iv: row.call.iv }))
    .filter((point): point is Point => point.iv !== null)
  const puts = rows
    .map((row) => ({ strike: row.strike, iv: row.put.iv }))
    .filter((point): point is Point => point.iv !== null)

  const all = [...calls, ...puts]
  if (all.length < 2) {
    return <p className="mini-chart-empty">N A</p>
  }

  const minStrike = Math.min(...all.map((point) => point.strike))
  const maxStrike = Math.max(...all.map((point) => point.strike))
  const minIv = Math.min(...all.map((point) => point.iv))
  const maxIv = Math.max(...all.map((point) => point.iv))

  const callPath = calls.length >= 2 ? linePath(calls, minStrike, maxStrike, minIv, maxIv) : ""
  const putPath = puts.length >= 2 ? linePath(puts, minStrike, maxStrike, minIv, maxIv) : ""

  return (
    <div className="mini-chart-shell">
      <h4>IV Curve</h4>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="IV curve chart">
        {callPath ? <path d={callPath} className="chart-line-call" /> : null}
        {putPath ? <path d={putPath} className="chart-line-put" /> : null}
        {all.map((point, index) => {
          const xSpan = Math.max(1, maxStrike - minStrike)
          const ySpan = Math.max(0.01, maxIv - minIv)
          const x = PADDING_X + ((point.strike - minStrike) / xSpan) * (WIDTH - PADDING_X * 2)
          const y = PADDING_Y + (1 - (point.iv - minIv) / ySpan) * (HEIGHT - PADDING_Y * 2)
          return (
            <circle
              key={`${point.strike}-${point.iv}-${index}-interactive`}
              cx={x}
              cy={y}
              r={selectedStrike === point.strike ? 3.2 : 2.4}
              className={`chart-point ${selectedStrike === point.strike ? "chart-point-selected" : ""}`.trim()}
              onClick={() => onSelectStrike?.(point.strike)}
            >
              <title>
                {point.strike} | {formatIv(point.iv)}
              </title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}
