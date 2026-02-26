import { memo, useEffect, useRef, type MouseEvent } from "react"

import { formatCount, formatIv, formatIvResidualVolPoints, formatOptionMid, formatSpreadPct } from "@/utils/format"
import { deriveContractSignals } from "@/utils/signals"
import type { Config, StrikeRow } from "@/ws/types"

interface Props {
  rows: StrikeRow[]
  mtcCallContractId: string | null
  mtcPutContractId: string | null
  config: Config
  selectedStrike: number | null
  selectedContractId: string | null
  focusStrike: number | null
  onFocusStrikeHandled?: () => void
  onSelectStrike?: (strike: number) => void
  onSelectContract?: (strike: number, side: "call" | "put", contractId: string) => void
  onCopyMtcContract?: (contractId: string) => void
  onRowRender?: (strike: number) => void
}

interface RowProps {
  row: StrikeRow
  mtcCallContractId: string | null
  mtcPutContractId: string | null
  config: Config
  selectedStrike: number | null
  selectedContractId: string | null
  setRowRef: (strike: number, node: HTMLTableRowElement | null) => void
  onSelectStrike?: (strike: number) => void
  onSelectContract?: (strike: number, side: "call" | "put", contractId: string) => void
  onCopyMtcContract?: (contractId: string) => void
  onRowRender?: (strike: number) => void
}

export function StrikeLadder({
  rows,
  mtcCallContractId,
  mtcPutContractId,
  config,
  selectedStrike,
  selectedContractId,
  focusStrike,
  onFocusStrikeHandled,
  onSelectStrike,
  onSelectContract,
  onCopyMtcContract,
  onRowRender
}: Props): JSX.Element {
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  useEffect(() => {
    if (focusStrike === null) {
      return
    }
    const ref = rowRefs.current[String(focusStrike)]
    if (!ref) {
      return
    }
    ref.scrollIntoView({ block: "center", behavior: "smooth" })
    onFocusStrikeHandled?.()
  }, [focusStrike, onFocusStrikeHandled, rows])

  const setRowRef = (strike: number, node: HTMLTableRowElement | null) => {
    rowRefs.current[String(strike)] = node
  }

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
          {rows.map((row) => (
            <StrikeLadderRow
              key={row.strike}
              row={row}
              mtcCallContractId={mtcCallContractId}
              mtcPutContractId={mtcPutContractId}
              config={config}
              selectedStrike={selectedStrike}
              selectedContractId={selectedContractId}
              setRowRef={setRowRef}
              onSelectStrike={onSelectStrike}
              onSelectContract={onSelectContract}
              onCopyMtcContract={onCopyMtcContract}
              onRowRender={onRowRender}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const StrikeLadderRow = memo(function StrikeLadderRow({
  row,
  mtcCallContractId,
  mtcPutContractId,
  config,
  selectedStrike,
  selectedContractId,
  setRowRef,
  onSelectStrike,
  onSelectContract,
  onCopyMtcContract,
  onRowRender
}: RowProps): JSX.Element {
  onRowRender?.(row.strike)

  const rowClasses = [
    row.flags.is_msi ? "msi-row" : "",
    row.flags.is_atm ? "atm-row" : "",
    selectedStrike === row.strike ? "selected-row" : ""
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <tr
      className={rowClasses}
      data-strike={row.strike}
      ref={(node) => {
        setRowRef(row.strike, node)
      }}
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
        config,
        selectedContractId,
        onSelectContract,
        onCopyMtcContract
      )}
      <td className={`w-strike strike-cell ${wallClassName(row.flags.wall_type)}`}>
        <div className="strike-stack">
          <span>{row.strike}</span>
          <span className="strike-tags">
            {row.flags.is_atm ? <span className="badge atm-badge">ATM</span> : null}
            {row.flags.is_msi ? <span className="badge">MSI</span> : null}
          </span>
        </div>
      </td>
      {renderContractCells(
        row.put,
        row.strike,
        "put",
        mtcPutContractId,
        config,
        selectedContractId,
        onSelectContract,
        onCopyMtcContract,
        true
      )}
    </tr>
  )
}, areRowPropsEqual)

function areRowPropsEqual(prev: RowProps, next: RowProps): boolean {
  return (
    prev.row === next.row &&
    prev.mtcCallContractId === next.mtcCallContractId &&
    prev.mtcPutContractId === next.mtcPutContractId &&
    prev.config === next.config &&
    prev.selectedStrike === next.selectedStrike &&
    prev.selectedContractId === next.selectedContractId
  )
}

function renderContractCells(
  block: StrikeRow["call"],
  strike: number,
  side: "call" | "put",
  mtcContractId: string | null,
  config: Config,
  selectedContractId: string | null,
  onSelectContract?: (strike: number, side: "call" | "put", contractId: string) => void,
  onCopyMtcContract?: (contractId: string) => void,
  mirrored = false
): JSX.Element[] {
  const mtc = block.contract_id === mtcContractId
  const selected = block.contract_id !== "" && block.contract_id === selectedContractId
  const signals = deriveContractSignals(block, config, mtc)

  const staleClass =
    signals.staleLevel === "critical"
      ? "stale-critical"
      : signals.staleLevel === "stale"
        ? "stale-soft"
        : ""

  const selectedClass = selected ? "selected-cell" : ""
  const clickClass = onSelectContract ? "clickable-cell" : ""
  const sideClass = side === "call" ? "side-call" : "side-put"
  const highlightClass =
    signals.highlightTier === "mtc"
      ? "highlight-mtc"
      : signals.highlightTier === "iv_imbalance"
        ? "highlight-iv"
        : signals.highlightTier === "extreme"
          ? "highlight-extreme"
          : ""

  const flags: string[] = []
  if (block.liquid) flags.push("L")
  if (signals.staleLevel !== "fresh") flags.push("S")
  if (signals.ivImbalance && block.liquid) flags.push("I")
  if (signals.extremeGreek && block.liquid) flags.push("G")
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

  const shared = [sideClass, staleClass, selectedClass, clickClass, highlightClass].filter(Boolean).join(" ")

  const renderValue = (value: string) => (signals.isCriticalStale ? "·" : value)

  const cells = [
    <td className={`w-mid ${shared}`} key="mid" onClick={onCellClick}>
      {renderValue(formatOptionMid(block.mid))}
    </td>,
    <td className={`w-spr ${shared} spread-${signals.spreadBand}`} key="spr" onClick={onCellClick}>
      {renderValue(formatSpreadPct(block.spread_pct))}
    </td>,
    <td className={`w-iv ${shared}`} key="iv" onClick={onCellClick}>
      {renderValue(formatIv(block.iv))}
    </td>,
    <td className={`w-ivr ${shared} ivres-${signals.ivResidualBand}`} key="ivr" onClick={onCellClick}>
      {renderValue(formatIvResidualVolPoints(block.iv_residual))}
    </td>,
    <td className={`w-d ${shared}`} key="delta" onClick={onCellClick}>
      {signals.isCriticalStale || block.delta === null ? "·" : block.delta.toFixed(2)}
    </td>,
    <td className={`w-g ${shared}`} key="gamma" onClick={onCellClick}>
      {signals.isCriticalStale || block.gamma === null ? "·" : block.gamma.toFixed(4)}
    </td>,
    <td className={`w-v ${shared}`} key="vega" onClick={onCellClick}>
      {signals.isCriticalStale || block.vega === null ? "·" : block.vega.toFixed(3)}
    </td>,
    <td className={`w-theta ${shared}`} key="theta" onClick={onCellClick}>
      {signals.isCriticalStale || block.theta === null ? "·" : block.theta.toFixed(3)}
    </td>,
    <td className={`w-vol ${shared}`} key="vol" onClick={onCellClick}>
      {renderValue(formatCount(block.volume))}
    </td>,
    <td className={`w-oi ${shared}`} key="oi" onClick={onCellClick}>
      {renderValue(formatCount(block.oi))}
    </td>,
    <td className={`w-flags flag-cell ${shared}`} key="flags" onClick={onCellClick}>
      <span>{flags.join("")}</span>
      {mtc && block.contract_id && onCopyMtcContract ? (
        <button
          type="button"
          className="flag-copy"
          title="Copy MTC contract"
          onClick={(event) => {
            event.stopPropagation()
            onCopyMtcContract(block.contract_id)
          }}
        >
          MTC
        </button>
      ) : null}
    </td>
  ]

  return mirrored ? cells.reverse() : cells
}

function wallClassName(wallType: StrikeRow["flags"]["wall_type"]): string {
  if (wallType === "call_wall") {
    return "strike-wall-call"
  }
  if (wallType === "put_wall") {
    return "strike-wall-put"
  }
  return ""
}
