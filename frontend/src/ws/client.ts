import type { AnyEnvelope } from "@/ws/types"

export class StreamClient {
  private socket: WebSocket | null = null

  constructor(
    private readonly url: string,
    private readonly onEnvelope: (envelope: AnyEnvelope) => void,
    private readonly onOpen?: () => void,
    private readonly onClose?: () => void
  ) {}

  connect(): void {
    if (this.socket) {
      return
    }

    this.socket = new WebSocket(this.url)
    this.socket.onopen = () => this.onOpen?.()
    this.socket.onclose = () => {
      this.socket = null
      this.onClose?.()
    }
    this.socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as AnyEnvelope
      this.onEnvelope(parsed)
    }
  }

  disconnect(): void {
    if (!this.socket) {
      return
    }
    this.socket.close()
    this.socket = null
  }
}
