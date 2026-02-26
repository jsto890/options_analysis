import type { Config, ContractBlock, StaleLevel } from "@/ws/types"

export type SpreadBand = "unknown" | "tight" | "acceptable" | "wide"
export type IvResidualBand = "unknown" | "cheap" | "neutral" | "rich"
export type HighlightTier = "none" | "mtc" | "iv_imbalance" | "extreme"

export interface ContractSignals {
  staleLevel: StaleLevel
  spreadBand: SpreadBand
  ivResidualBand: IvResidualBand
  ivImbalance: boolean
  extremeGreek: boolean
  highlightTier: HighlightTier
  isCriticalStale: boolean
}

export function deriveStaleLevel(
  staleMs: number,
  maxStaleMs: number,
  backendLevel?: StaleLevel
): StaleLevel {
  if (backendLevel === "fresh" || backendLevel === "stale" || backendLevel === "critical") {
    return backendLevel
  }

  if (staleMs > maxStaleMs * 3) {
    return "critical"
  }
  if (staleMs > maxStaleMs) {
    return "stale"
  }
  return "fresh"
}

export function deriveSpreadBand(spreadPct: number | null, maxSpreadPct: number): SpreadBand {
  if (spreadPct === null) {
    return "unknown"
  }

  const tightCutoff = maxSpreadPct * 0.4
  if (spreadPct <= tightCutoff) {
    return "tight"
  }
  if (spreadPct <= maxSpreadPct) {
    return "acceptable"
  }
  return "wide"
}

export function deriveIvResidualBand(
  ivResidual: number | null,
  ivImbalanceThreshold: number
): IvResidualBand {
  if (ivResidual === null) {
    return "unknown"
  }
  if (ivResidual <= ivImbalanceThreshold) {
    return "cheap"
  }
  if (ivResidual >= 0) {
    return "rich"
  }
  return "neutral"
}

export function resolveHighlightTier({
  staleLevel,
  isMtc,
  ivImbalance,
  extremeGreek
}: {
  staleLevel: StaleLevel
  isMtc: boolean
  ivImbalance: boolean
  extremeGreek: boolean
}): HighlightTier {
  if (staleLevel === "critical") {
    return "none"
  }
  if (isMtc) {
    return "mtc"
  }
  if (ivImbalance) {
    return "iv_imbalance"
  }
  if (extremeGreek) {
    return "extreme"
  }
  return "none"
}

export function deriveContractSignals(
  block: ContractBlock,
  config: Config,
  isMtc: boolean
): ContractSignals {
  const staleLevel = deriveStaleLevel(
    block.stale_ms,
    config.max_stale_ms,
    block.highlights?.stale_level
  )

  const ivImbalance =
    block.highlights?.iv_imbalance ??
    (block.liquid &&
      block.iv_residual !== null &&
      block.iv_residual <= config.iv_imbalance_threshold)

  const extremeGreek = block.highlights?.extreme_greek ?? false

  const highlightTier = resolveHighlightTier({
    staleLevel,
    isMtc,
    ivImbalance,
    extremeGreek
  })

  return {
    staleLevel,
    spreadBand: deriveSpreadBand(block.spread_pct, config.max_spread_pct),
    ivResidualBand: deriveIvResidualBand(block.iv_residual, config.iv_imbalance_threshold),
    ivImbalance,
    extremeGreek,
    highlightTier,
    isCriticalStale: staleLevel === "critical"
  }
}

export function isCriticalStale(block: ContractBlock, config: Config): boolean {
  return deriveStaleLevel(block.stale_ms, config.max_stale_ms, block.highlights?.stale_level) === "critical"
}
