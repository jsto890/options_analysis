const EN_US = new Intl.NumberFormat("en-US")

function isNil(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined
}

export function ladderNull(value: number | null | undefined): string {
  return isNil(value) ? "·" : String(value)
}

export function summaryNull(value: number | null | undefined): string {
  return isNil(value) ? "N A" : String(value)
}

export function formatOptionMid(mid: number | null): string {
  if (mid === null) {
    return "·"
  }
  if (mid === 0) {
    return "0.0000"
  }
  if (mid >= 1) {
    return mid.toFixed(2)
  }
  if (mid >= 0.1) {
    return mid.toFixed(3)
  }
  return mid.toFixed(4)
}

export function formatSpreadPct(spreadPct: number | null): string {
  if (spreadPct === null) {
    return "·"
  }
  if (spreadPct >= 1) {
    return "100%+"
  }
  const percent = spreadPct * 100
  if (spreadPct < 0.01) {
    return `${percent.toFixed(2)}%`
  }
  return `${percent.toFixed(1)}%`
}

export function formatIv(iv: number | null): string {
  if (iv === null) {
    return "·"
  }
  return (iv * 100).toFixed(1)
}

export function formatIvResidualVolPoints(ivResidual: number | null): string {
  if (ivResidual === null) {
    return "·"
  }
  return (ivResidual * 100).toFixed(2)
}

export function formatCount(value: number | null): string {
  if (value === null) {
    return "·"
  }
  return EN_US.format(value)
}

export function formatCompactSigned(value: number | null): string {
  if (value === null) {
    return "N A"
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) {
    return `${sign}${(absolute / 1_000_000).toFixed(2)}M`
  }
  if (absolute >= 1_000) {
    return `${sign}${(absolute / 1_000).toFixed(2)}K`
  }
  return `${sign}${absolute.toFixed(2)}`
}

export function formatSummaryPercent(value: number | null, decimals = 2): string {
  if (value === null) {
    return "N A"
  }
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatQualityScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "N A"
  }
  return `${Math.round(score * 100)}`
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return "N A"
  }
  return `${Math.max(0, Math.round(ms))} ms`
}

export function formatMarketRegime(regime: string | null | undefined): string {
  if (!regime) {
    return "UNKNOWN"
  }
  return regime.replace("_", " ").toUpperCase()
}
