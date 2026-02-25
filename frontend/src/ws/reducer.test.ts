import { describe, expect, it } from "vitest"

import { EMPTY_STATE, applyEnvelope } from "@/ws/reducer"
import type { Config, DeltaEnvelope, SnapshotEnvelope } from "@/ws/types"


describe("stream reducer", () => {
  it("applies snapshot and delta patches", () => {
    const config: Config = {
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

    const snapshot: SnapshotEnvelope = {
      type: "snapshot" as const,
      schema_version: 1 as const,
      ts_ms: 1,
      payload: {
        underlying: {
          symbol: "QQQ",
          expiry: "20260225",
          spot: { bid: 430, ask: 430.1, last: 430.05, mid: 430.05, ts_ms: 1 }
        },
        config,
        summary: {
          net_gex_band: 100,
          pin_risk: 63,
          msi_strikes: [430],
          mtc_call_contract_id: null,
          mtc_put_contract_id: null,
          nearest_msi_distance_pct: 0.1
        },
        rows: [
          {
            strike: 430,
            msi_score: 10,
            flags: { is_msi: true, wall_type: "call_wall" },
            call: {
              contract_id: "c",
              mid: 1,
              iv: 0.2,
              iv_residual: -0.01,
              delta: 0.4,
              gamma: 0.01,
              vega: 0.1,
              theta: -0.01,
              spread_pct: 0.02,
              volume: 100,
              oi: 200,
              liquid: true,
              stale_ms: 100,
              per_dollar: {
                gamma_per_dollar: 0.01,
                vega_per_dollar: 0.02,
                theta_per_dollar: 0.03
              },
              mtc_score: null,
              mtc_rationale: null
            },
            put: {
              contract_id: "p",
              mid: 1,
              iv: 0.2,
              iv_residual: -0.01,
              delta: -0.4,
              gamma: 0.01,
              vega: 0.1,
              theta: -0.01,
              spread_pct: 0.02,
              volume: 100,
              oi: 200,
              liquid: true,
              stale_ms: 100,
              per_dollar: {
                gamma_per_dollar: 0.01,
                vega_per_dollar: 0.02,
                theta_per_dollar: 0.03
              },
              mtc_score: null,
              mtc_rationale: null
            },
            exposures: {
              oi: { dex: 1, gex: 2, vex: 3 },
              vol: { dex: 1, gex: 2, vex: 3 }
            }
          }
        ]
      }
    }

    const stateAfterSnapshot = applyEnvelope(EMPTY_STATE, snapshot)
    expect(stateAfterSnapshot.rowsByStrike[430].call.mid).toBe(1)

    const delta: DeltaEnvelope = {
      type: "delta" as const,
      schema_version: 1 as const,
      ts_ms: 2,
      payload: {
        underlying_patch: {
          spot: { bid: 431, ask: 431.1, last: 431.05, mid: 431.05, ts_ms: 2 }
        },
        summary_patch: { pin_risk: 71 },
        row_patches: [{ strike: 430, msi_score: 11 }]
      }
    }

    const stateAfterDelta = applyEnvelope(stateAfterSnapshot, delta)
    expect(stateAfterDelta.spot.mid).toBe(431.05)
    expect(stateAfterDelta.summary.pin_risk).toBe(71)
    expect(stateAfterDelta.rowsByStrike[430].msi_score).toBe(11)
  })

  it("adds new strike rows that arrive in delta patches", () => {
    const config: Config = {
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

    const snapshot: SnapshotEnvelope = {
      type: "snapshot",
      schema_version: 1,
      ts_ms: 1,
      payload: {
        underlying: {
          symbol: "QQQ",
          expiry: "20260225",
          spot: { bid: 430, ask: 430.1, last: 430.05, mid: 430.05, ts_ms: 1 }
        },
        config,
        summary: {
          net_gex_band: null,
          pin_risk: 60,
          msi_strikes: [],
          mtc_call_contract_id: null,
          mtc_put_contract_id: null,
          nearest_msi_distance_pct: null
        },
        rows: []
      }
    }

    const delta: DeltaEnvelope = {
      type: "delta",
      schema_version: 1,
      ts_ms: 2,
      payload: {
        underlying_patch: {},
        summary_patch: {},
        row_patches: [
          {
            strike: 431,
            msi_score: 5,
            flags: { is_msi: false, wall_type: "none" },
            call: {
              contract_id: "c-431",
              mid: 1,
              iv: 0.2,
              iv_residual: -0.01,
              delta: 0.45,
              gamma: 0.01,
              vega: 0.1,
              theta: -0.02,
              spread_pct: 0.03,
              volume: 100,
              oi: 200,
              liquid: true,
              stale_ms: 50,
              per_dollar: {
                gamma_per_dollar: 0.01,
                vega_per_dollar: 0.02,
                theta_per_dollar: 0.03
              },
              mtc_score: null,
              mtc_rationale: null
            },
            put: {
              contract_id: "p-431",
              mid: 1,
              iv: 0.2,
              iv_residual: -0.01,
              delta: -0.45,
              gamma: 0.01,
              vega: 0.1,
              theta: -0.02,
              spread_pct: 0.03,
              volume: 100,
              oi: 200,
              liquid: true,
              stale_ms: 50,
              per_dollar: {
                gamma_per_dollar: 0.01,
                vega_per_dollar: 0.02,
                theta_per_dollar: 0.03
              },
              mtc_score: null,
              mtc_rationale: null
            },
            exposures: {
              oi: { dex: 1, gex: 2, vex: 3 },
              vol: { dex: 1, gex: 2, vex: 3 }
            }
          }
        ]
      }
    }

    const stateAfterSnapshot = applyEnvelope(EMPTY_STATE, snapshot)
    const stateAfterDelta = applyEnvelope(stateAfterSnapshot, delta)
    expect(stateAfterDelta.rowsByStrike[431]).toBeDefined()
    expect(stateAfterDelta.rowsByStrike[431].call.contract_id).toBe("c-431")
  })
})
