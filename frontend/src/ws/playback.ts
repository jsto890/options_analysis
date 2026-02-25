import { EMPTY_STATE, applyEnvelope, type StreamState } from "@/ws/reducer"
import type { AnyEnvelope } from "@/ws/types"

export function replayEnvelopes(
  envelopes: AnyEnvelope[],
  initialState: StreamState = EMPTY_STATE
): StreamState {
  return envelopes.reduce((state, envelope) => applyEnvelope(state, envelope), initialState)
}

export class PlaybackClient {
  private timer: ReturnType<typeof setTimeout> | null = null
  private index = 0

  constructor(
    private readonly envelopes: AnyEnvelope[],
    private readonly onEnvelope: (envelope: AnyEnvelope) => void,
    private readonly cadenceMs = 500,
    private readonly onDone?: () => void
  ) {}

  start(): void {
    if (this.timer !== null) {
      return
    }
    this.tick()
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (this.index >= this.envelopes.length) {
      this.timer = null
      this.onDone?.()
      return
    }

    const envelope = this.envelopes[this.index]
    this.index += 1
    this.onEnvelope(envelope)
    this.timer = setTimeout(() => this.tick(), Math.max(1, this.cadenceMs))
  }
}
