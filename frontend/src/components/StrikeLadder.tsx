import { formatCount, formatIv, formatIvResidualVolPoints, formatOptionMid, formatSpreadPct } from "@/utils/format"
import type { StrikeRow } from "@/ws/types"
import type { MouseEvent } from "react"

interface Props {
  rows: StrikeRow[]
  mtcCallContractId: string | null
  mtcPutContractId: string | null
  maxStaleMs: number
  selectedStrike: number | null
  selectedContractId: string | null
  onSelectStrike?: (strike: number) => void
  onSelectContract?: (strike: number, side: "call" | "put", contractId: string) => void
}

export function StrikeLadder({
  rows,
  mtcCallContractId,
  mtcPutContractId,
  maxStaleMs,
  selectedStrike,
  selectedContractId,
  onSelectStrike,
  onSelectContract
}: Props): JSX.Element {
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
            const rowClass = `${row.flags.is_msi ? "msi-row" : ""} ${selectedStrike === row.strike ? "selected-row" : ""}`.trim()
            return (
              <tr
                key={row.strike}
                className={rowClass}
                onClick={() => onSelectStrike?.(row.strike)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onSelectStrike?.(row.strike)
                  }
                }}
                tabIndex={0}
              >
                {renderContractCells(
                  row.call,
                  row.strike,
                  "call",
                  mtcCallContractId,
                  maxStaleMs,
                  selectedContractId,
                  onSelectContract
                )}
                <td className="w-strike strike-cell">
                  {row.strike}
                  {row.flags.is_msi ? <span className="badge">MSI</span> : null}
                </td>
                {renderContractCells(
                  row.put,
                  row.strike,
                  "put",
                  mtcPutContractId,
                  maxStaleMs,
                  selectedContractId,
                  onSelectContract,
                  true
                )}
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
  strike: number,
  side: "call" | "put",
  mtcContractId: string | null,
  maxStaleMs: number,
  selectedContractId: string | null,
  onSelectContract?: (strike: number, side: "call" | "put", contractId: string) => void,
  mirrored = false
): JSX.Element[] {
  const stale = block.stale_ms > maxStaleMs
  const tooStale = block.stale_ms > maxStaleMs * 3
  const mutedClass = stale ? "muted" : ""
  const mtc = block.contract_id === mtcContractId
  const selected = block.contract_id !== "" && block.contract_id === selectedContractId

  const flags: string[] = []
  if (block.liquid) flags.push("L")
  if (stale) flags.push("S")
  if (block.iv_residual !== null && block.iv_residual <= -0.01 && block.liquid) flags.push("I")
  if (mtc) flags.push("M")

  const onCellClick = onSelectContract
    ? (event: MouseEvent<HTMLTableCellElement>) => {
        event.stopPropagation()
        if (!block.contract_id) {
          return
        }
        onSelectContract(strike, side, block.contract_id)
      }
    : undefined
  const selectedClass = selected ? "selected-cell" : ""
  const clickClass = onCellClick ? "clickable-cell" : ""

  const cells = [
    <td
      className={`w-mid ${mutedClass} ${selectedClass} ${clickClass} ${mtc ? "mtc-cell" : ""}`}
      key="mid"
      onClick={onCellClick}
    >
      {tooStale ? "·" : formatOptionMid(block.mid)}
    </td>,
    <td className={`w-spr ${mutedClass} ${selectedClass} ${clickClass}`} key="spr" onClick={onCellClick}>
      {tooStale ? "·" : formatSpreadPct(block.spread_pct)}
    </td>,
    <td className={`w-iv ${mutedClass} ${selectedClass} ${clickClass}`} key="iv" onClick={onCellClick}>
      {tooStale ? "·" : formatIv(block.iv)}
    </td>,
    <td className={`w-ivr ${mutedClass} ${selectedClass} ${clickClass}`} key="ivr" onClick={onCellClick}>
      {tooStale ? "·" : formatIvResidualVolPoints(block.iv_residual)}
    </td>,
    <td className={`w-d ${mutedClass} ${selectedClass} ${clickClass}`} key="delta" onClick={onCellClick}>
      {tooStale || block.delta === null ? "·" : block.delta.toFixed(2)}
    </td>,
    <td className={`w-g ${mutedClass} ${selectedClass} ${clickClass}`} key="gamma" onClick={onCellClick}>
      {tooStale || block.gamma === null ? "·" : block.gamma.toFixed(4)}
    </td>,
    <td className={`w-v ${mutedClass} ${selectedClass} ${clickClass}`} key="vega" onClick={onCellClick}>
      {tooStale || block.vega === null ? "·" : block.vega.toFixed(3)}
    </td>,
    <td className={`w-theta ${mutedClass} ${selectedClass} ${clickClass}`} key="theta" onClick={onCellClick}>
      {tooStale || block.theta === null ? "·" : block.theta.toFixed(3)}
    </td>,
    <td className={`w-vol ${mutedClass} ${selectedClass} ${clickClass}`} key="vol" onClick={onCellClick}>
      {tooStale ? "·" : formatCount(block.volume)}
    </td>,
    <td className={`w-oi ${mutedClass} ${selectedClass} ${clickClass}`} key="oi" onClick={onCellClick}>
      {tooStale ? "·" : formatCount(block.oi)}
    </td>,
    <td className={`w-flags flag-cell ${mutedClass} ${selectedClass} ${clickClass}`} key="flags" onClick={onCellClick}>
      {flags.join("")}
    </td>
  ]

  return mirrored ? cells.reverse() : cells
}
