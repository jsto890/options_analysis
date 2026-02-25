import type { MtcRationale } from "@/ws/types"

interface Props {
  side: "Call" | "Put"
  contractId: string | null
  rationale: MtcRationale | null
}

function fmt(value: number): string {
  return value.toFixed(2)
}

export function MtcRationaleCard({ side, contractId, rationale }: Props): JSX.Element {
  return (
    <div className="rationale-card">
      <h4>{side} MTC</h4>
      <p className="rationale-contract">{contractId ?? "N A"}</p>
      {rationale ? (
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
          <dd>{rationale.gate_liquid ? "PASS" : "FAIL"}</dd>
          <dt>Delta Gate</dt>
          <dd>{rationale.gate_delta_band ? "PASS" : "FAIL"}</dd>
        </dl>
      ) : (
        <p className="rationale-empty">N A</p>
      )}
    </div>
  )
}
