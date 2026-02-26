import { describe, expect, it } from "vitest"

import { EMPTY_STATE, applyEnvelope } from "@/ws/reducer"
import { replayEnvelopes } from "@/ws/playback"
import fixture from "@/ws/fixtures/live_session.sample.json"
import type { AnyEnvelope } from "@/ws/types"

describe("live playback parity fixture", () => {
  it("replays recorded live envelopes to same reducer state", () => {
    const envelopes = fixture as AnyEnvelope[]
    const fromPlayback = replayEnvelopes(envelopes, EMPTY_STATE)
    const fromReducerFold = envelopes.reduce((state, envelope) => applyEnvelope(state, envelope), EMPTY_STATE)

    expect(fromPlayback).toEqual(fromReducerFold)
    expect(Object.keys(fromPlayback.rowsByStrike).length).toBeGreaterThan(10)
    expect(Array.isArray(fromPlayback.summary.msi_strikes)).toBe(true)
    expect(fromPlayback.connected).toBe(true)
  })
})
