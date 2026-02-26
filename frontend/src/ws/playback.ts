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
  private running = false

  constructor(
    private readonly envelopes: AnyEnvelope[],
    private readonly onEnvelope: (envelope: AnyEnvelope) => void,
    private readonly cadenceMs = 500,
    private readonly onDone?: () => void,
    private readonly onProgress?: (index: number, total: number) => void
  ) {}

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.tick()
  }

  pause(): void {
    this.running = false
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  resume(): void {
    this.start()
  }

  restart(): void {
    this.pause()
    this.seek(0)
    this.start()
  }

  stop(): void {
    this.pause()
  }

  isRunning(): boolean {
    return this.running
  }

  seek(nextIndex: number): void {
    const clamped = Math.max(0, Math.min(this.envelopes.length, Math.floor(nextIndex)))
    this.index = clamped
    this.onProgress?.(this.index, this.envelopes.length)
  }

  getIndex(): number {
    return this.index
  }

  getTotal(): number {
    return this.envelopes.length
  }

  private tick(): void {
    if (!this.running) {
      return
    }

    if (this.index >= this.envelopes.length) {
      this.timer = null
      this.running = false
      this.onDone?.()
      return
    }

    const envelope = this.envelopes[this.index]
    this.index += 1
    this.onEnvelope(envelope)
    this.onProgress?.(this.index, this.envelopes.length)
    this.timer = setTimeout(() => this.tick(), Math.max(1, this.cadenceMs))
  }
}
