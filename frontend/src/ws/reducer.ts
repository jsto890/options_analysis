import type {
  AnyEnvelope,
  DeltaEnvelope,
  SnapshotEnvelope,
  StrikeRow,
  Summary,
  UnderlyingSpot
} from "@/ws/types"

export interface StreamState {
  symbol: string
  expiry: string
  spot: UnderlyingSpot
  summary: Summary
  rowsByStrike: Record<number, StrikeRow>
  lastHeartbeatMs: number
  connected: boolean
  subscriptions: number
}

export const EMPTY_STATE: StreamState = {
  symbol: "QQQ",
  expiry: "",
  spot: {
    bid: null,
    ask: null,
    last: null,
    mid: null,
    ts_ms: 0
  },
  summary: {
    net_gex_band: null,
    pin_risk: 0,
    msi_strikes: [],
    mtc_call_contract_id: null,
    mtc_put_contract_id: null,
    nearest_msi_distance_pct: null
  },
  rowsByStrike: {},
  lastHeartbeatMs: 0,
  connected: false,
  subscriptions: 0
}

function applySnapshot(state: StreamState, envelope: SnapshotEnvelope): StreamState {
  const rowsByStrike: Record<number, StrikeRow> = {}
  for (const row of envelope.payload.rows) {
    rowsByStrike[row.strike] = row
  }

  return {
    ...state,
    symbol: envelope.payload.underlying.symbol,
    expiry: envelope.payload.underlying.expiry,
    spot: envelope.payload.underlying.spot,
    summary: envelope.payload.summary,
    rowsByStrike,
    connected: true
  }
}

function applyDelta(state: StreamState, envelope: DeltaEnvelope): StreamState {
  const nextRows = { ...state.rowsByStrike }
  for (const patch of envelope.payload.row_patches) {
    const current = nextRows[patch.strike]
    if (current) {
      nextRows[patch.strike] = { ...current, ...patch }
    }
  }

  return {
    ...state,
    spot: envelope.payload.underlying_patch.spot ?? state.spot,
    summary: { ...state.summary, ...envelope.payload.summary_patch },
    rowsByStrike: nextRows
  }
}

export function applyEnvelope(state: StreamState, envelope: AnyEnvelope): StreamState {
  if (envelope.type === "snapshot") {
    return applySnapshot(state, envelope)
  }

  if (envelope.type === "delta") {
    return applyDelta(state, envelope)
  }

  return {
    ...state,
    lastHeartbeatMs: envelope.payload.server_ts_ms,
    connected: envelope.payload.ibkr_connected,
    subscriptions: envelope.payload.subscriptions
  }
}
