import { formatCount, formatIv, formatIvResidualVolPoints, formatOptionMid, formatSpreadPct } from "@/utils/format"
import type { StrikeRow } from "@/ws/types"

interface Props {
  rows: StrikeRow[]
  mtcCallContractId: string | null
  mtcPutContractId: string | null
  maxStaleMs: number
}

export function StrikeLadder({ rows, mtcCallContractId, mtcPutContractId, maxStaleMs }: Props): JSX.Element {
  return (
    <div className="ladder-shell">
      <table className="ladder">
        <thead>
          <tr>
            <th className="w-mid">C Mid</th>
            <th className="w-spr">C Spr%</th>
            <th className="w-iv">C IV</th>
            <th className="w-ivr">C IVr</th>
            <th className="w-d">C Δ</th>
            <th className="w-g">C Γ</th>
            <th className="w-v">C V</th>
            <th className="w-theta">C Θ</th>
            <th className="w-vol">C Vol</th>
            <th className="w-oi">C OI</th>
            <th className="w-flags">C F</th>
            <th className="w-strike">Strike</th>
            <th className="w-flags">P F</th>
            <th className="w-oi">P OI</th>
            <th className="w-vol">P Vol</th>
            <th className="w-theta">P Θ</th>
            <th className="w-v">P V</th>
            <th className="w-g">P Γ</th>
            <th className="w-d">P Δ</th>
            <th className="w-ivr">P IVr</th>
            <th className="w-iv">P IV</th>
            <th className="w-spr">P Spr%</th>
            <th className="w-mid">P Mid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowClass = row.flags.is_msi ? "msi-row" : ""
            return (
              <tr key={row.strike} className={rowClass}>
                {renderContractCells(row.call, mtcCallContractId, maxStaleMs)}
                <td className="w-strike strike-cell">
                  {row.strike}
                  {row.flags.is_msi ? <span className="badge">MSI</span> : null}
                </td>
                {renderContractCells(row.put, mtcPutContractId, maxStaleMs, true)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function renderContractCells(
  block: StrikeRow["call"],
  mtcContractId: string | null,
  maxStaleMs: number,
  mirrored = false
): JSX.Element[] {
  const stale = block.stale_ms > maxStaleMs
  const tooStale = block.stale_ms > maxStaleMs * 3
  const mutedClass = stale ? "muted" : ""
  const mtc = block.contract_id === mtcContractId

  const flags: string[] = []
  if (block.liquid) flags.push("L")
  if (stale) flags.push("S")
  if (block.iv_residual !== null && block.iv_residual <= -0.01 && block.liquid) flags.push("I")
  if (mtc) flags.push("M")

  const cells = [
    <td className={`w-mid ${mutedClass} ${mtc ? "mtc-cell" : ""}`} key="mid">{tooStale ? "·" : formatOptionMid(block.mid)}</td>,
    <td className={`w-spr ${mutedClass}`} key="spr">{tooStale ? "·" : formatSpreadPct(block.spread_pct)}</td>,
    <td className={`w-iv ${mutedClass}`} key="iv">{tooStale ? "·" : formatIv(block.iv)}</td>,
    <td className={`w-ivr ${mutedClass}`} key="ivr">{tooStale ? "·" : formatIvResidualVolPoints(block.iv_residual)}</td>,
    <td className={`w-d ${mutedClass}`} key="delta">{tooStale || block.delta === null ? "·" : block.delta.toFixed(2)}</td>,
    <td className={`w-g ${mutedClass}`} key="gamma">{tooStale || block.gamma === null ? "·" : block.gamma.toFixed(4)}</td>,
    <td className={`w-v ${mutedClass}`} key="vega">{tooStale || block.vega === null ? "·" : block.vega.toFixed(3)}</td>,
    <td className={`w-theta ${mutedClass}`} key="theta">{tooStale || block.theta === null ? "·" : block.theta.toFixed(3)}</td>,
    <td className={`w-vol ${mutedClass}`} key="vol">{tooStale ? "·" : formatCount(block.volume)}</td>,
    <td className={`w-oi ${mutedClass}`} key="oi">{tooStale ? "·" : formatCount(block.oi)}</td>,
    <td className={`w-flags flag-cell ${mutedClass}`} key="flags">{flags.join("")}</td>
  ]

  return mirrored ? cells.reverse() : cells
}
