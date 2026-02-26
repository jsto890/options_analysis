export interface ParsedContractId {
  conid: number
  symbol: string
  expiry: string
  right: "C" | "P"
  strike: number
}

function formatDescriptorStrike(strike: number): string {
  if (Number.isInteger(strike)) {
    return String(strike)
  }
  return strike.toFixed(1).replace(/\.0$/, "")
}

export function parseContractId(contractId: string | null | undefined): ParsedContractId | null {
  if (!contractId) {
    return null
  }

  const parts = contractId.split(":")
  if (parts.length !== 5) {
    return null
  }

  const [conidText, symbol, expiry, rightText, strikeText] = parts
  const conid = Number(conidText)
  const strike = Number(strikeText)
  const right = rightText.toUpperCase()

  if (!Number.isFinite(conid) || conid <= 0) {
    return null
  }
  if (!symbol || !/^\d{8}$/.test(expiry)) {
    return null
  }
  if (right !== "C" && right !== "P") {
    return null
  }
  if (!Number.isFinite(strike) || strike <= 0) {
    return null
  }

  return {
    conid,
    symbol,
    expiry,
    right,
    strike
  }
}

export function formatContractDescriptor(contractId: string | null | undefined, includeConid = false): string {
  const parsed = parseContractId(contractId)
  if (!parsed) {
    return "N A"
  }

  const core = `${parsed.symbol} ${parsed.expiry} ${parsed.right} ${formatDescriptorStrike(parsed.strike)} SMART`
  if (!includeConid) {
    return core
  }
  return `conid=${parsed.conid} ${core}`
}

export async function copyContractDescriptor(
  contractId: string | null | undefined,
  includeConid = false
): Promise<boolean> {
  const descriptor = formatContractDescriptor(contractId, includeConid)
  if (descriptor === "N A") {
    return false
  }

  try {
    await navigator.clipboard.writeText(descriptor)
    return true
  } catch {
    return false
  }
}
