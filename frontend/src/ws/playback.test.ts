import { describe, expect, it, vi } from "vitest"

import { EMPTY_STATE, applyEnvelope } from "@/ws/reducer"
import { PlaybackClient, replayEnvelopes } from "@/ws/playback"
import type { AnyEnvelope, Config, HeartbeatEnvelope, SnapshotEnvelope } from "@/ws/types"

const TEST_CONFIG: Config = {
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

function sampleEnvelopes(): AnyEnvelope[] {
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
      config: TEST_CONFIG,
      summary: {
        net_gex_band: null,
        pin_risk: 61,
        msi_strikes: [430],
        mtc_call_contract_id: null,
        mtc_put_contract_id: null,
        nearest_msi_distance_pct: null
      },
      rows: []
    }
  }

  const heartbeat: HeartbeatEnvelope = {
    type: "heartbeat",
    schema_version: 1,
    ts_ms: 2,
    payload: {
      server_ts_ms: 2,
      ibkr_connected: true,
      subscriptions: 4
    }
  }

  return [snapshot, heartbeat]
}

describe("playback", () => {
  it("replays to the same state as a live reducer fold", () => {
    const envelopes = sampleEnvelopes()
    const viaPlayback = replayEnvelopes(envelopes, EMPTY_STATE)
    const viaReducer = envelopes.reduce((state, envelope) => applyEnvelope(state, envelope), EMPTY_STATE)
    expect(viaPlayback).toEqual(viaReducer)
    expect(viaPlayback.connected).toBe(true)
    expect(viaPlayback.subscriptions).toBe(4)
  })

  it("PlaybackClient dispatches all envelopes in order", () => {
    vi.useFakeTimers()
    const envelopes = sampleEnvelopes()
    const seenTypes: string[] = []
    const client = new PlaybackClient(
      envelopes,
      (envelope) => seenTypes.push(envelope.type),
      50
    )

    client.start()
    vi.advanceTimersByTime(100)
    client.stop()

    expect(seenTypes).toEqual(["snapshot", "heartbeat"])
    vi.useRealTimers()
  })

  it("PlaybackClient supports pause/resume/restart", () => {
    vi.useFakeTimers()
    const envelopes = sampleEnvelopes()
    const seenTypes: string[] = []
    const client = new PlaybackClient(envelopes, (envelope) => seenTypes.push(envelope.type), 50)

    client.start()
    vi.advanceTimersByTime(1)
    expect(seenTypes).toEqual(["snapshot"])

    client.pause()
    vi.advanceTimersByTime(200)
    expect(seenTypes).toEqual(["snapshot"])

    client.resume()
    vi.advanceTimersByTime(60)
    expect(seenTypes).toEqual(["snapshot", "heartbeat"])

    client.restart()
    vi.advanceTimersByTime(1)
    expect(seenTypes).toEqual(["snapshot", "heartbeat", "snapshot"])

    client.stop()
    vi.useRealTimers()
  })

  it("PlaybackClient seek updates index and dispatch order", () => {
    vi.useFakeTimers()
    const envelopes = sampleEnvelopes()
    const seenTypes: string[] = []
    const client = new PlaybackClient(envelopes, (envelope) => seenTypes.push(envelope.type), 50)

    client.seek(1)
    expect(client.getIndex()).toBe(1)
    expect(client.getTotal()).toBe(2)

    client.start()
    vi.advanceTimersByTime(1)
    expect(seenTypes).toEqual(["heartbeat"])

    client.stop()
    vi.useRealTimers()
  })
})
