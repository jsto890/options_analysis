import { MiniExposureChart } from "@/components/MiniExposureChart"
import { MiniIvChart } from "@/components/MiniIvChart"
import { MtcRationaleCard } from "@/components/MtcRationaleCard"
import { formatCompactSigned, formatIvResidualVolPoints, formatSpreadPct, formatSummaryPercent } from "@/utils/format"
import type { ContractBlock, StrikeRow } from "@/ws/types"

interface ComparedContract {
  contract_id: string
  label: string
  block: ContractBlock
}

interface Props {
  rows: StrikeRow[]
  selectedStrike: number | null
  onSelectStrike: (strike: number) => void
  msiRows: StrikeRow[]
  mtcCallBlock: ContractBlock | null
  mtcPutBlock: ContractBlock | null
  nearestMsiDistancePct: number | null
  netGexBand: number | null
  viewMode: "scan" | "explain"
  comparedContracts: ComparedContract[]
  onRemoveComparedContract: (contractId: string) => void
  onToggleCompare: (contractId: string | null) => void
  onJumpToStrike: (strike: number) => void
  onSelectContract: (contractId: string | null) => void
  onCopyContract: (contractId: string | null, includeConid: boolean) => void
}

export function DecisionAssistPanel({
  rows,
  selectedStrike,
  onSelectStrike,
  msiRows,
  mtcCallBlock,
  mtcPutBlock,
  nearestMsiDistancePct,
  netGexBand,
  viewMode,
  comparedContracts,
  onRemoveComparedContract,
  onToggleCompare,
  onJumpToStrike,
  onSelectContract,
  onCopyContract
}: Props): JSX.Element {
  return (
    <div className="right-panel decision-assist">
      <div className="decision-head">
        <h3>Decision Assist</h3>
        <p>
          Net GEX {formatCompactSigned(netGexBand)} | Nearest MSI {formatSummaryPercent(nearestMsiDistancePct)}
        </p>
      </div>

      <div className="compare-tray">
        <h4>Compare Tray ({comparedContracts.length}/2)</h4>
        {comparedContracts.length === 0 ? (
          <p className="rationale-empty">Add contracts from MTC cards to compare.</p>
        ) : (
          <div className="compare-items">
            {comparedContracts.map((item) => (
              <article key={item.contract_id} className="compare-item">
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.contract_id}</p>
                </div>
                <div className="compare-metrics">
                  <span>Spread {formatSpreadPct(item.block.spread_pct)}</span>
                  <span>IVr {formatIvResidualVolPoints(item.block.iv_residual)}</span>
                  <span>Delta {item.block.delta === null ? "N A" : item.block.delta.toFixed(2)}</span>
                </div>
                <button type="button" className="control-btn" onClick={() => onRemoveComparedContract(item.contract_id)}>
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <MiniIvChart rows={rows} selectedStrike={selectedStrike} onSelectStrike={onSelectStrike} />
      <MiniExposureChart rows={rows} selectedStrike={selectedStrike} onSelectStrike={onSelectStrike} />

      <div className="msi-card">
        <h4>Top MSI</h4>
        {msiRows.length === 0 ? (
          <p className="rationale-empty">N A</p>
        ) : (
          <ul className="msi-list">
            {msiRows.map((row) => (
              <li key={row.strike}>
                <button type="button" className="msi-item-btn" onClick={() => onJumpToStrike(row.strike)}>
                  {row.strike} | {row.flags.wall_type} | {row.msi_score === null ? "N A" : row.msi_score.toFixed(2)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MtcRationaleCard
        side="Call"
        block={mtcCallBlock}
        compared={comparedContracts.some((item) => item.contract_id === mtcCallBlock?.contract_id)}
        onToggleCompare={onToggleCompare}
        onSelectContract={onSelectContract}
        onCopyContract={onCopyContract}
      />
      <MtcRationaleCard
        side="Put"
        block={mtcPutBlock}
        compared={comparedContracts.some((item) => item.contract_id === mtcPutBlock?.contract_id)}
        onToggleCompare={onToggleCompare}
        onSelectContract={onSelectContract}
        onCopyContract={onCopyContract}
      />

      {viewMode === "explain" ? (
        <div className="explain-block">
          <h4>How to Read This</h4>
          <p>Use MSI rows for structure, then pick MTC only when liquidity and delta gates both pass.</p>
        </div>
      ) : null}
    </div>
  )
}
