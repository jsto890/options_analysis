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
