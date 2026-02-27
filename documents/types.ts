// filename: types.ts
export type WallType = "none" | "call_wall" | "put_wall"
export type StaleLevel = "fresh" | "stale" | "critical"

export interface UnderlyingSpot {
  bid: number | null
  ask: number | null
  last: number | null
  mid: number | null
  ts_ms: number
}

export interface PerDollarGreeks {
  gamma_per_dollar: number | null
  vega_per_dollar: number | null
  theta_per_dollar: number | null
}

export interface MtcRationale {
  liquidity_score: number
  cheap_iv_score: number
  efficiency_score: number
  stability_score: number
  tradable_score: number
  gate_liquid: boolean
  gate_delta_band: boolean
  notes: string[]
}

export interface ContractBlock {
  contract_id: string
  mid: number | null
  iv: number | null
  iv_residual: number | null
  delta: number | null
  gamma: number | null
  vega: number | null
  theta: number | null
  spread_pct: number | null
  volume: number | null
  oi: number | null
  liquid: boolean
  stale_ms: number
  per_dollar: PerDollarGreeks
  highlights?: {
    iv_imbalance?: boolean
    extreme_greek?: boolean
    stale_level?: StaleLevel
  }
  mtc_score: number | null
  mtc_rationale: MtcRationale | null
}

export interface ExposureTriple {
  dex: number | null
  gex: number | null
  vex: number | null
}

export interface StrikeExposures {
  oi: ExposureTriple
  vol: ExposureTriple
}

export interface RowFlags {
  is_msi: boolean
  is_atm?: boolean
  wall_type: WallType
}

export interface StrikeRow {
  strike: number
  msi_score: number | null
  flags: RowFlags
  call: ContractBlock
  put: ContractBlock
  exposures: StrikeExposures
}

export interface Summary {
  net_gex_band: number | null
  pin_risk: number
  msi_strikes: number[]
  atm_strike?: number | null
  mtc_call_contract_id: string | null
  mtc_put_contract_id: string | null
  nearest_msi_distance_pct: number | null
  market_regime?: "pinning" | "trend" | "transition" | "unknown" | null
  data_quality_score?: number | null
  fresh_contract_ratio?: number | null
  stream_latency_ms?: number | null
}

export interface Config {
  update_interval_ms: number
  window_strikes_each_side: number
  roll_threshold_strikes: number
  max_spread_pct: number
  min_bid_size: number
  min_ask_size: number
  max_stale_ms: number
  min_fit_points: number
  delta_band_min: number
  delta_band_max: number
  msi_bandwidth_pct: number
  gex_band_pct: number
  persistence_updates: number
  persistence_fraction: number
  iv_residual_scale: number
  iv_imbalance_threshold: number
  min_mid_for_extremes: number
  max_subscriptions_soft_limit: number
}

export interface DesktopSettings {
  connect_paper: boolean
  client_id: number
  host: string
  paper_port: number
  live_port: number
}

export interface DesktopSettingsApplyResponse {
  settings: DesktopSettings
  restart_required: boolean
}

export interface SnapshotPayload {
  underlying: {
    symbol: string
    expiry: string
    spot: UnderlyingSpot
  }
  config: Config
  summary: Summary
  rows: StrikeRow[]
}

export interface DeltaPayload {
  underlying_patch: {
    spot?: UnderlyingSpot
  }
  summary_patch: Partial<Summary>
  row_patches: Array<Partial<StrikeRow> & { strike: number }>
}

export interface HeartbeatPayload {
  server_ts_ms: number
  ibkr_connected: boolean
  subscriptions: number
}

export type EnvelopeType = "snapshot" | "delta" | "heartbeat"

export interface Envelope<TPayload> {
  type: EnvelopeType
  schema_version: 1
  ts_ms: number
  payload: TPayload
}

export type SnapshotEnvelope = Envelope<SnapshotPayload> & { type: "snapshot" }
export type DeltaEnvelope = Envelope<DeltaPayload> & { type: "delta" }
export type HeartbeatEnvelope = Envelope<HeartbeatPayload> & { type: "heartbeat" }

export type AnyEnvelope = SnapshotEnvelope | DeltaEnvelope | HeartbeatEnvelope
