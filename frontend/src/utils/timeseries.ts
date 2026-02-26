import type { StrikeRow } from "@/ws/types"

export interface ContractSeriesPoint {
  ts_ms: number
  mid: number | null
  iv: number | null
  iv_residual: number | null
  spread_pct: number | null
}

export type SeriesByContract = Record<string, ContractSeriesPoint[]>

function appendPoint(
  series: ContractSeriesPoint[],
  point: ContractSeriesPoint,
  maxPoints: number
): ContractSeriesPoint[] {
  const last = series[series.length - 1]
  if (
    last &&
    last.mid === point.mid &&
    last.iv === point.iv &&
    last.iv_residual === point.iv_residual &&
    last.spread_pct === point.spread_pct
  ) {
    return series
  }

  const next = [...series, point]
  if (next.length <= maxPoints) {
    return next
  }
  return next.slice(next.length - maxPoints)
}

function buildPoint(row: StrikeRow, side: "call" | "put", tsMs: number): ContractSeriesPoint {
  const block = side === "call" ? row.call : row.put
  return {
    ts_ms: tsMs,
    mid: block.mid,
    iv: block.iv,
    iv_residual: block.iv_residual,
    spread_pct: block.spread_pct
  }
}

export function updateSeriesFromRows(
  current: SeriesByContract,
  rows: StrikeRow[],
  tsMs: number,
  maxPoints = 900
): SeriesByContract {
  let next: SeriesByContract | null = null

  const upsert = (contractId: string, point: ContractSeriesPoint) => {
    const baseline = next ?? current
    const existing = baseline[contractId] ?? []
    const updated = appendPoint(existing, point, maxPoints)
    if (updated === existing) {
      return
    }
    if (next === null) {
      next = { ...current }
    }
    next[contractId] = updated
  }

  for (const row of rows) {
    if (row.call.contract_id) {
      upsert(row.call.contract_id, buildPoint(row, "call", tsMs))
    }
    if (row.put.contract_id) {
      upsert(row.put.contract_id, buildPoint(row, "put", tsMs))
    }
  }

  return next ?? current
}
