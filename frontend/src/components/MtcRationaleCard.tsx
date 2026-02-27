import { formatContractDescriptor } from "@/utils/contracts"
import { formatIvResidualVolPoints, formatSpreadPct } from "@/utils/format"
import type { ContractBlock, MtcRationale } from "@/ws/types"

interface Props {
  side: "Call" | "Put"
  block: ContractBlock | null
  onCopyContract: (contractId: string | null, includeConid: boolean) => void
  onSelectContract?: (contractId: string | null) => void
  onToggleCompare?: (contractId: string | null) => void
  compared?: boolean
}

function fmt(value: number): string {
  return value.toFixed(2)
}

export function MtcRationaleCard({
  side,
  block,
  onCopyContract,
  onSelectContract,
  onToggleCompare,
  compared = false
}: Props): JSX.Element {
  const contractId = block?.contract_id ?? null
  const rationale: MtcRationale | null = block?.mtc_rationale ?? null

  return (
    <div className={`rationale-card ${side === "Call" ? "rationale-call" : "rationale-put"}`}>
      <h4>{side} MTC</h4>
      <p className="rationale-contract">{formatContractDescriptor(contractId)}</p>
      <div className="rationale-actions">
        <button type="button" onClick={() => onSelectContract?.(contractId)} disabled={!contractId}>
          Focus
        </button>
        <button type="button" onClick={() => onToggleCompare?.(contractId)} disabled={!contractId}>
          {compared ? "Uncompare" : "Compare"}
        </button>
        <button type="button" onClick={() => onCopyContract(contractId, false)}>
          Copy
        </button>
        <button type="button" onClick={() => onCopyContract(contractId, true)}>
          Copy + conid
        </button>
      </div>
      {rationale ? (
        <>
          <dl className="rationale-grid">
            <dt>Tradable</dt>
            <dd>{fmt(rationale.tradable_score)}</dd>
            <dt>Liquidity</dt>
            <dd>{fmt(rationale.liquidity_score)}</dd>
            <dt>Cheap IV</dt>
            <dd>{fmt(rationale.cheap_iv_score)}</dd>
            <dt>Efficiency</dt>
            <dd>{fmt(rationale.efficiency_score)}</dd>
            <dt>Stability</dt>
            <dd>{fmt(rationale.stability_score)}</dd>
            <dt>Liquid Gate</dt>
            <dd>
              <span className={`gate-badge ${rationale.gate_liquid ? "pass" : "fail"}`}>
                {rationale.gate_liquid ? "PASS" : "FAIL"}
              </span>
            </dd>
            <dt>Delta Gate</dt>
            <dd>
              <span className={`gate-badge ${rationale.gate_delta_band ? "pass" : "fail"}`}>
                {rationale.gate_delta_band ? "PASS" : "FAIL"}
              </span>
            </dd>
            <dt>Spread</dt>
            <dd>{formatSpreadPct(block?.spread_pct ?? null)}</dd>
            <dt>Staleness</dt>
            <dd>{block ? `${block.stale_ms} ms` : "N A"}</dd>
            <dt>Delta</dt>
            <dd>{block?.delta === null || block?.delta === undefined ? "N A" : block.delta.toFixed(2)}</dd>
            <dt>IVr</dt>
            <dd>{formatIvResidualVolPoints(block?.iv_residual ?? null)}</dd>
            <dt>Gamma/$</dt>
            <dd>{block?.per_dollar.gamma_per_dollar === null || block?.per_dollar.gamma_per_dollar === undefined ? "N A" : block.per_dollar.gamma_per_dollar.toFixed(4)}</dd>
            <dt>Vega/$</dt>
            <dd>{block?.per_dollar.vega_per_dollar === null || block?.per_dollar.vega_per_dollar === undefined ? "N A" : block.per_dollar.vega_per_dollar.toFixed(3)}</dd>
            <dt>Theta/$</dt>
            <dd>{block?.per_dollar.theta_per_dollar === null || block?.per_dollar.theta_per_dollar === undefined ? "N A" : block.per_dollar.theta_per_dollar.toFixed(3)}</dd>
          </dl>
          {rationale.notes.length > 0 ? (
            <div className="rationale-note-chips">
              {rationale.notes.map((note) => (
                <span key={note} className="rationale-note-chip">
                  {note}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="rationale-empty">N A</p>
      )}
    </div>
  )
}
