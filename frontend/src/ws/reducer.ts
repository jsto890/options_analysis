import type {
  AnyEnvelope,
  Config,
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
  config: Config
  summary: Summary
  rowsByStrike: Record<number, StrikeRow>
  lastHeartbeatMs: number
  connected: boolean
  subscriptions: number
}

export const DEFAULT_CONFIG: Config = {
  update_interval_ms: 500,
  window_strikes_each_side: 20,
  roll_threshold_strikes: 2,
  max_spread_pct: 0.12,
  min_bid_size: 10,
  min_ask_size: 10,
  max_stale_ms: 1500,
  min_fit_points: 8,
  delta_band_min: 0.3,
  delta_band_max: 0.65,
  msi_bandwidth_pct: 0.0075,
  gex_band_pct: 0.0075,
  persistence_updates: 10,
  persistence_fraction: 0.7,
  iv_residual_scale: 0.015,
  iv_imbalance_threshold: -0.01,
  min_mid_for_extremes: 0.05,
  max_subscriptions_soft_limit: 95
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
  config: DEFAULT_CONFIG,
  summary: {
    net_gex_band: null,
    pin_risk: 0,
    msi_strikes: [],
    atm_strike: null,
    mtc_call_contract_id: null,
    mtc_put_contract_id: null,
    nearest_msi_distance_pct: null,
    market_regime: null,
    data_quality_score: null,
    fresh_contract_ratio: null,
    stream_latency_ms: null
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
    config: envelope.payload.config,
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
    } else {
      // New strike rows can arrive when the backend rolls the strike window.
      nextRows[patch.strike] = patch as StrikeRow
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
