import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { MiniExposureChart } from "@/components/MiniExposureChart"
import { MiniIvChart } from "@/components/MiniIvChart"
import { MtcRationaleCard } from "@/components/MtcRationaleCard"
import { PinnedDetailDrawer } from "@/components/PinnedDetailDrawer"
import { StrikeLadder } from "@/components/StrikeLadder"
import { useStreamStore } from "@/state/store"
import { copyContractDescriptor } from "@/utils/contracts"
import { formatCompactSigned, formatOptionMid, formatSummaryPercent } from "@/utils/format"
import { isCriticalStale } from "@/utils/signals"
import { updateSeriesFromRows, type SeriesByContract } from "@/utils/timeseries"
import { EMPTY_STATE, type StreamState } from "@/ws/reducer"
import { StreamClient } from "@/ws/client"
import { PlaybackClient, replayEnvelopes } from "@/ws/playback"
import type {
  AnyEnvelope,
  ContractBlock,
  DesktopSettings,
  DesktopSettingsApplyResponse,
  StrikeRow
} from "@/ws/types"

interface Selection {
  strike: number
  side: "call" | "put"
  contractId: string | null
}

interface LadderFilters {
  msiOnly: boolean
  mtcOnly: boolean
  liquidOnly: boolean
  hideCriticalStale: boolean
}

const MIN_DATA_REFRESH_MS = 50
const MAX_DATA_REFRESH_MS = 5000
const MIN_PRESENTATION_REFRESH_MS = 16
const MAX_PRESENTATION_REFRESH_MS = 2000
const DEFAULT_PRESENTATION_REFRESH_MS = 100
const MIN_CLIENT_ID = 0
const MAX_CLIENT_ID = 2_147_483_647

export default function App(): JSX.Element {
  const [state, dispatch] = useStreamStore()
  const [mode, setMode] = useState<"live" | "playback">("live")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [seriesByContract, setSeriesByContract] = useState<SeriesByContract>({})
  const [copyStatus, setCopyStatus] = useState<string>("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [filters, setFilters] = useState<LadderFilters>({
    msiOnly: false,
    mtcOnly: false,
    liquidOnly: false,
    hideCriticalStale: false
  })
  const [focusStrike, setFocusStrike] = useState<number | null>(null)
  const [keyboardContext, setKeyboardContext] = useState<"none" | "ladder">("none")
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [playbackTotal, setPlaybackTotal] = useState(0)
  const [playbackRunning, setPlaybackRunning] = useState(false)
  const [playbackEnvelopes, setPlaybackEnvelopes] = useState<AnyEnvelope[]>([])
  const [dataRefreshDraft, setDataRefreshDraft] = useState<string>(String(state.config.update_interval_ms))
  const [presentationRefreshMs, setPresentationRefreshMs] = useState<number>(DEFAULT_PRESENTATION_REFRESH_MS)
  const [presentationRefreshDraft, setPresentationRefreshDraft] = useState<string>(
    String(DEFAULT_PRESENTATION_REFRESH_MS)
  )
  const [desktopSettingsDraft, setDesktopSettingsDraft] = useState<DesktopSettings | null>(null)
  const [desktopSettingsLoading, setDesktopSettingsLoading] = useState<boolean>(true)
  const [desktopSettingsError, setDesktopSettingsError] = useState<string>("")
  const [desktopRestartRequired, setDesktopRestartRequired] = useState<boolean>(false)

  const copyStatusTimer = useRef<number | null>(null)
  const playbackClientRef = useRef<PlaybackClient | null>(null)
  const liveEnvelopeQueueRef = useRef<AnyEnvelope[]>([])

  useEffect(() => {
    setDataRefreshDraft(String(state.config.update_interval_ms))
  }, [state.config.update_interval_ms])

  useEffect(() => {
    let cancelled = false
    setDesktopSettingsLoading(true)
    setDesktopSettingsError("")

    void (async () => {
      try {
        const response = await fetch(apiPath("/desktop/settings"))
        if (!response.ok) {
          throw new Error(`desktop settings status ${response.status}`)
        }
        const payload = (await response.json()) as DesktopSettings
        if (cancelled) {
          return
        }
        setDesktopSettingsDraft(payload)
      } catch {
        if (cancelled) {
          return
        }
        setDesktopSettingsError("Desktop settings unavailable")
      } finally {
        if (!cancelled) {
          setDesktopSettingsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const queue = liveEnvelopeQueueRef.current
      if (queue.length === 0) {
        return
      }

      const batch = queue.splice(0, queue.length)
      for (const envelope of batch) {
        dispatch(envelope)
      }
    }, presentationRefreshMs)

    return () => window.clearInterval(timer)
  }, [dispatch, presentationRefreshMs])

  useEffect(() => {
    let mounted = true
    let liveClient: StreamClient | null = null
    let playbackClient: PlaybackClient | null = null

    const params = new URLSearchParams(window.location.search)
    const playbackFile = params.get("playback")

    if (playbackFile) {
      setMode("playback")
      void (async () => {
        try {
          const response = await fetch(playbackFile)
          if (!response.ok) {
            throw new Error(`Playback fetch failed with status ${response.status}`)
          }
          const envelopes = (await response.json()) as AnyEnvelope[]
          if (!mounted) {
            return
          }

          setPlaybackEnvelopes(envelopes)
          setPlaybackIndex(0)
          setPlaybackTotal(envelopes.length)

          playbackClient = new PlaybackClient(
            envelopes,
            (envelope) => dispatch(envelope),
            Math.max(MIN_DATA_REFRESH_MS, state.config.update_interval_ms),
            () => setPlaybackRunning(false),
            (index, total) => {
              setPlaybackIndex(index)
              setPlaybackTotal(total)
            }
          )
          playbackClientRef.current = playbackClient
          setPlaybackRunning(true)
          playbackClient.start()
        } catch (error) {
          console.error("Playback bootstrap failed", error)
        }
      })()

      return () => {
        mounted = false
        playbackClient?.stop()
        playbackClientRef.current = null
        setPlaybackRunning(false)
      }
    }

    setMode("live")
    setPlaybackEnvelopes([])
    setPlaybackIndex(0)
    setPlaybackTotal(0)
    playbackClientRef.current = null
    setPlaybackRunning(false)

    liveEnvelopeQueueRef.current = []

    liveClient = new StreamClient(streamPath(), (envelope) => {
      liveEnvelopeQueueRef.current.push(envelope)
    })
    liveClient.connect()

    return () => {
      mounted = false
      liveClient?.disconnect()
      liveEnvelopeQueueRef.current = []
    }
  }, [dispatch, state.config.update_interval_ms])

  const allRowsAsc = useMemo(
    () => Object.values(state.rowsByStrike).sort((a, b) => a.strike - b.strike),
    [state.rowsByStrike]
  )

  const allRowsSorted = useMemo(() => {
    const copy = [...allRowsAsc]
    if (sortOrder === "desc") {
      copy.reverse()
    }
    return copy
  }, [allRowsAsc, sortOrder])

  const rows = useMemo(() => {
    return allRowsSorted.filter((row) => {
      if (filters.msiOnly && !row.flags.is_msi) {
        return false
      }
      if (filters.mtcOnly) {
        const isMtcRow =
          row.call.contract_id === state.summary.mtc_call_contract_id ||
          row.put.contract_id === state.summary.mtc_put_contract_id
        if (!isMtcRow) {
          return false
        }
      }
      if (filters.liquidOnly && !row.call.liquid && !row.put.liquid) {
        return false
      }
      if (
        filters.hideCriticalStale &&
        isCriticalStale(row.call, state.config) &&
        isCriticalStale(row.put, state.config)
      ) {
        return false
      }
      return true
    })
  }, [allRowsSorted, filters, state.summary.mtc_call_contract_id, state.summary.mtc_put_contract_id, state.config])

  useEffect(() => {
    if (allRowsAsc.length === 0) {
      return
    }
    setSeriesByContract((current) => updateSeriesFromRows(current, allRowsAsc, Date.now()))
  }, [allRowsAsc])

  useEffect(() => {
    const timer = copyStatusTimer.current
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    if (selection && !state.rowsByStrike[selection.strike]) {
      setSelection(null)
    }
  }, [selection, state.rowsByStrike])

  const mtcCallBlock = useMemo(
    () => findContractById(allRowsAsc, state.summary.mtc_call_contract_id),
    [allRowsAsc, state.summary.mtc_call_contract_id]
  )
  const mtcPutBlock = useMemo(
    () => findContractById(allRowsAsc, state.summary.mtc_put_contract_id),
    [allRowsAsc, state.summary.mtc_put_contract_id]
  )

  const msiRows = useMemo(
    () =>
      allRowsAsc
        .filter((row) => row.flags.is_msi)
        .sort((a, b) => (b.msi_score ?? 0) - (a.msi_score ?? 0))
        .slice(0, 3),
    [allRowsAsc]
  )

  const selectedRow = selection ? state.rowsByStrike[selection.strike] ?? null : null
  const selectedSeries = selection?.contractId ? seriesByContract[selection.contractId] ?? [] : []

  const atmStrike = useMemo(() => {
    if (state.summary.atm_strike !== undefined && state.summary.atm_strike !== null) {
      return state.summary.atm_strike
    }
    return nearestStrikeToSpot(allRowsAsc, state.spot.mid)
  }, [state.summary.atm_strike, allRowsAsc, state.spot.mid])

  const nearestMsiStrike = useMemo(() => {
    if (msiRows.length === 0) {
      return null
    }
    const spot = state.spot.mid
    if (spot === null || spot <= 0) {
      return msiRows[0].strike
    }
    return msiRows.reduce((best, current) => {
      if (Math.abs(current.strike - spot) < Math.abs(best - spot)) {
        return current.strike
      }
      return best
    }, msiRows[0].strike)
  }, [msiRows, state.spot.mid])

  const mtcCallSelection = useMemo(
    () => findSelectionByContract(allRowsAsc, state.summary.mtc_call_contract_id),
    [allRowsAsc, state.summary.mtc_call_contract_id]
  )
  const mtcPutSelection = useMemo(
    () => findSelectionByContract(allRowsAsc, state.summary.mtc_put_contract_id),
    [allRowsAsc, state.summary.mtc_put_contract_id]
  )

  const publishCopyStatus = (message: string) => {
    setCopyStatus(message)
    if (copyStatusTimer.current !== null) {
      window.clearTimeout(copyStatusTimer.current)
    }
    copyStatusTimer.current = window.setTimeout(() => {
      setCopyStatus("")
    }, 1800)
  }

  const handleCopyContract = async (contractId: string | null, includeConid = false) => {
    const success = await copyContractDescriptor(contractId, includeConid)
    if (!success) {
      publishCopyStatus("Copy failed")
      return
    }
    publishCopyStatus(includeConid ? "Copied with conid" : "Copied contract")
  }

  const resetPlaybackState = useCallback(
    (targetIndex: number) => {
      const replayed = replayEnvelopes(playbackEnvelopes.slice(0, targetIndex), EMPTY_STATE)
      dispatch(streamStateToSnapshotEnvelope(replayed))
      setSeriesByContract({})
    },
    [dispatch, playbackEnvelopes]
  )

  const togglePlayback = () => {
    const playback = playbackClientRef.current
    if (!playback) {
      return
    }

    if (playback.isRunning()) {
      playback.pause()
      setPlaybackRunning(false)
      return
    }

    playback.resume()
    setPlaybackRunning(true)
  }

  const restartPlayback = () => {
    const playback = playbackClientRef.current
    if (!playback) {
      return
    }

    resetPlaybackState(0)
    playback.restart()
    setPlaybackRunning(true)
  }

  const seekPlayback = (rawIndex: number) => {
    const playback = playbackClientRef.current
    if (!playback) {
      return
    }

    const nextIndex = Math.max(0, Math.min(playbackTotal, Math.floor(rawIndex)))
    const wasRunning = playback.isRunning()

    playback.pause()
    setPlaybackRunning(false)

    resetPlaybackState(nextIndex)
    playback.seek(nextIndex)

    if (wasRunning) {
      playback.resume()
      setPlaybackRunning(true)
    }
  }

  const applyPresentationRefresh = () => {
    const parsed = clampMs(
      Number.parseInt(presentationRefreshDraft, 10),
      MIN_PRESENTATION_REFRESH_MS,
      MAX_PRESENTATION_REFRESH_MS,
      DEFAULT_PRESENTATION_REFRESH_MS
    )
    setPresentationRefreshMs(parsed)
    setPresentationRefreshDraft(String(parsed))
    publishCopyStatus(`UI refresh ${parsed} ms`)
  }

  const applyDataRefresh = async () => {
    const parsed = clampMs(
      Number.parseInt(dataRefreshDraft, 10),
      MIN_DATA_REFRESH_MS,
      MAX_DATA_REFRESH_MS,
      Math.max(MIN_DATA_REFRESH_MS, state.config.update_interval_ms)
    )
    setDataRefreshDraft(String(parsed))

    try {
      const response = await fetch(apiPath("/config"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          update_interval_ms: parsed
        })
      })

      if (!response.ok) {
        publishCopyStatus("Data refresh update failed")
        return
      }

      publishCopyStatus(`Data refresh ${parsed} ms`)
    } catch {
      publishCopyStatus("Data refresh update failed")
    }
  }

  const updateDesktopDraft = (patch: Partial<DesktopSettings>) => {
    setDesktopSettingsDraft((current) => {
      if (!current) {
        return current
      }
      return { ...current, ...patch }
    })
  }

  const saveDesktopSettings = async () => {
    if (!desktopSettingsDraft) {
      return
    }

    const payload: DesktopSettings = {
      connect_paper: desktopSettingsDraft.connect_paper,
      client_id: clampMs(desktopSettingsDraft.client_id, MIN_CLIENT_ID, MAX_CLIENT_ID, 19),
      host: (desktopSettingsDraft.host || "127.0.0.1").trim() || "127.0.0.1",
      paper_port: clampMs(desktopSettingsDraft.paper_port, 1, 65535, 4002),
      live_port: clampMs(desktopSettingsDraft.live_port, 1, 65535, 4001)
    }
    setDesktopSettingsDraft(payload)

    try {
      const response = await fetch(apiPath("/desktop/settings"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        publishCopyStatus("Desktop settings save failed")
        return
      }

      const result = (await response.json()) as DesktopSettingsApplyResponse
      setDesktopSettingsDraft(result.settings)
      setDesktopRestartRequired(result.restart_required)
      publishCopyStatus(result.restart_required ? "Desktop settings saved (restart required)" : "Desktop settings saved")
    } catch {
      publishCopyStatus("Desktop settings save failed")
    }
  }

  const selectStrike = (strike: number) => {
    const row = state.rowsByStrike[strike]
    if (!row) {
      return
    }
    setSelection((current) => {
      const side = current?.side ?? "call"
      const block = side === "call" ? row.call : row.put
      return {
        strike,
        side,
        contractId: block.contract_id
      }
    })
    setKeyboardContext("ladder")
  }

  const selectContract = (strike: number, side: "call" | "put", contractId: string) => {
    setSelection({ strike, side, contractId })
    setKeyboardContext("ladder")
  }

  const jumpToStrike = (strike: number | null) => {
    if (strike === null) {
      return
    }
    selectStrike(strike)
    setFocusStrike(strike)
  }

  const jumpToSelection = (nextSelection: Selection | null) => {
    if (!nextSelection) {
      return
    }
    setSelection(nextSelection)
    setFocusStrike(nextSelection.strike)
    setKeyboardContext("ladder")
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "RANGE"].includes(target.tagName)) {
        return
      }

      if (event.key === "Escape") {
        setSelection(null)
        return
      }

      if (event.key === "c" || event.key === "C") {
        if (!selection?.contractId) {
          return
        }
        event.preventDefault()
        void handleCopyContract(selection.contractId, event.shiftKey)
        return
      }

      if (keyboardContext !== "ladder" || !selection) {
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        setSelection(null)
        return
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        const row = state.rowsByStrike[selection.strike]
        if (!row) {
          return
        }
        const nextSide = event.key === "ArrowLeft" ? "call" : "put"
        const nextBlock = nextSide === "call" ? row.call : row.put
        setSelection({
          strike: selection.strike,
          side: nextSide,
          contractId: nextBlock.contract_id
        })
        return
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return
      }

      event.preventDefault()
      const strikes = rows.map((row) => row.strike)
      const currentIndex = strikes.indexOf(selection.strike)
      if (currentIndex === -1) {
        return
      }

      const direction = event.key === "ArrowUp" ? -1 : 1
      const nextIndex = Math.max(0, Math.min(strikes.length - 1, currentIndex + direction))
      if (nextIndex === currentIndex) {
        return
      }

      const nextStrike = strikes[nextIndex]
      const nextRow = state.rowsByStrike[nextStrike]
      if (!nextRow) {
        return
      }

      const nextBlock = selection.side === "call" ? nextRow.call : nextRow.put
      setSelection({
        strike: nextStrike,
        side: selection.side,
        contractId: nextBlock.contract_id
      })
      setFocusStrike(nextStrike)
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [keyboardContext, rows, selection, state.rowsByStrike])

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <strong>{state.symbol || "QQQ"}</strong>
          <span className={`status ${state.connected ? "ok" : "down"}`}>{state.connected ? "CONNECTED" : "DISCONNECTED"}</span>
        </div>
        <div>Expiry: {state.expiry || "N A"}</div>
        <div>Spot: {formatOptionMid(state.spot.mid)}</div>
        <div>Mode: {mode.toUpperCase()}</div>
        <div>Subs: {state.subscriptions}</div>
      </header>
      {mode === "playback" ? (
        <div className="playback-strip">
          <button type="button" className="control-btn" onClick={togglePlayback}>
            {playbackRunning ? "Pause" : "Play"}
          </button>
          <button type="button" className="control-btn" onClick={restartPlayback}>
            Restart
          </button>
          <label htmlFor="playback-scrub">Seek</label>
          <input
            id="playback-scrub"
            type="range"
            min={0}
            max={Math.max(0, playbackTotal)}
            value={playbackIndex}
            step={1}
            onChange={(event) => seekPlayback(Number.parseInt(event.target.value, 10))}
            disabled={playbackTotal === 0}
          />
          <span>
            Frame {playbackIndex}/{playbackTotal || "N A"}
          </span>
        </div>
      ) : null}
      {copyStatus ? <div className="copy-toast">{copyStatus}</div> : null}
      <section className="content-grid">
        <div className="left-panel">
          <h3>Config</h3>
          <p>Cadence: {state.config.update_interval_ms} ms</p>
          <p>Window: ±{state.config.window_strikes_each_side} strikes</p>
          <p>Max stale: {state.config.max_stale_ms} ms</p>
          <p>Max spread: {(state.config.max_spread_pct * 100).toFixed(1)}%</p>
          <p>IV imbalance: {(state.config.iv_imbalance_threshold * 100).toFixed(2)} vol pts</p>
          <div className="refresh-controls">
            <label htmlFor="data-refresh-ms">Data refresh (ms)</label>
            <input
              id="data-refresh-ms"
              type="number"
              min={MIN_DATA_REFRESH_MS}
              max={MAX_DATA_REFRESH_MS}
              step={1}
              value={dataRefreshDraft}
              onChange={(event) => setDataRefreshDraft(event.target.value)}
            />
            <button type="button" className="control-btn" onClick={() => void applyDataRefresh()}>
              Apply Data
            </button>
            <label htmlFor="presentation-refresh-ms">UI refresh (ms)</label>
            <input
              id="presentation-refresh-ms"
              type="number"
              min={MIN_PRESENTATION_REFRESH_MS}
              max={MAX_PRESENTATION_REFRESH_MS}
              step={1}
              value={presentationRefreshDraft}
              onChange={(event) => setPresentationRefreshDraft(event.target.value)}
            />
            <button type="button" className="control-btn" onClick={applyPresentationRefresh}>
              Apply UI
            </button>
          </div>
          <div className="desktop-settings">
            <h4>Desktop</h4>
            {desktopSettingsLoading ? <p>Loading desktop settings...</p> : null}
            {!desktopSettingsLoading && desktopSettingsError ? <p>{desktopSettingsError}</p> : null}
            {!desktopSettingsLoading && !desktopSettingsError && desktopSettingsDraft ? (
              <>
                <label className="desktop-mode-toggle">
                  <input
                    type="checkbox"
                    checked={desktopSettingsDraft.connect_paper}
                    onChange={(event) => {
                      updateDesktopDraft({ connect_paper: event.target.checked })
                      setDesktopRestartRequired(false)
                    }}
                  />
                  Paper mode
                </label>
                <label htmlFor="desktop-client-id">Client ID</label>
                <input
                  id="desktop-client-id"
                  type="number"
                  min={MIN_CLIENT_ID}
                  max={MAX_CLIENT_ID}
                  step={1}
                  value={desktopSettingsDraft.client_id}
                  onChange={(event) =>
                    updateDesktopDraft({
                      client_id: clampMs(Number.parseInt(event.target.value, 10), MIN_CLIENT_ID, MAX_CLIENT_ID, 19)
                    })
                  }
                />
                <details>
                  <summary>Advanced host/ports</summary>
                  <label htmlFor="desktop-host">Host</label>
                  <input
                    id="desktop-host"
                    type="text"
                    value={desktopSettingsDraft.host}
                    onChange={(event) => updateDesktopDraft({ host: event.target.value })}
                  />
                  <label htmlFor="desktop-paper-port">Paper port</label>
                  <input
                    id="desktop-paper-port"
                    type="number"
                    min={1}
                    max={65535}
                    step={1}
                    value={desktopSettingsDraft.paper_port}
                    onChange={(event) =>
                      updateDesktopDraft({ paper_port: clampMs(Number.parseInt(event.target.value, 10), 1, 65535, 4002) })
                    }
                  />
                  <label htmlFor="desktop-live-port">Live port</label>
                  <input
                    id="desktop-live-port"
                    type="number"
                    min={1}
                    max={65535}
                    step={1}
                    value={desktopSettingsDraft.live_port}
                    onChange={(event) =>
                      updateDesktopDraft({ live_port: clampMs(Number.parseInt(event.target.value, 10), 1, 65535, 4001) })
                    }
                  />
                </details>
                <button type="button" className="control-btn" onClick={() => void saveDesktopSettings()}>
                  Save Desktop Settings
                </button>
                {desktopRestartRequired ? (
                  <p className="desktop-restart-banner">Restart app to apply IBKR connection changes.</p>
                ) : null}
              </>
            ) : null}
          </div>
          <p>Status: {state.connected ? "Streaming" : "Awaiting"}</p>
        </div>
        <div className="center-panel">
          <div className="ladder-controls" role="toolbar" aria-label="Ladder controls">
            <div className="ladder-controls-group">
              <button
                type="button"
                onClick={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
                className="control-btn"
              >
                Sort: {sortOrder.toUpperCase()}
              </button>
              <span className="ladder-count">Rows: {rows.length}</span>
            </div>
            <div className="ladder-controls-group">
              <label>
                <input
                  type="checkbox"
                  checked={filters.msiOnly}
                  onChange={(event) => setFilters((current) => ({ ...current, msiOnly: event.target.checked }))}
                />
                MSI only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.mtcOnly}
                  onChange={(event) => setFilters((current) => ({ ...current, mtcOnly: event.target.checked }))}
                />
                MTC only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.liquidOnly}
                  onChange={(event) => setFilters((current) => ({ ...current, liquidOnly: event.target.checked }))}
                />
                Liquid only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.hideCriticalStale}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, hideCriticalStale: event.target.checked }))
                  }
                />
                Hide critical stale
              </label>
            </div>
            <div className="ladder-controls-group">
              <button type="button" className="control-btn" onClick={() => jumpToStrike(atmStrike)} disabled={atmStrike === null}>
                ATM
              </button>
              <button
                type="button"
                className="control-btn"
                onClick={() => jumpToStrike(nearestMsiStrike)}
                disabled={nearestMsiStrike === null}
              >
                Nearest MSI
              </button>
              <button
                type="button"
                className="control-btn"
                onClick={() => jumpToSelection(mtcCallSelection)}
                disabled={!mtcCallSelection}
              >
                MTC Call
              </button>
              <button
                type="button"
                className="control-btn"
                onClick={() => jumpToSelection(mtcPutSelection)}
                disabled={!mtcPutSelection}
              >
                MTC Put
              </button>
            </div>
          </div>

          <StrikeLadder
            rows={rows}
            mtcCallContractId={state.summary.mtc_call_contract_id}
            mtcPutContractId={state.summary.mtc_put_contract_id}
            config={state.config}
            selectedStrike={selection?.strike ?? null}
            selectedContractId={selection?.contractId ?? null}
            focusStrike={focusStrike}
            onFocusStrikeHandled={() => setFocusStrike(null)}
            onSelectStrike={selectStrike}
            onSelectContract={selectContract}
            onCopyMtcContract={(contractId) => {
              void handleCopyContract(contractId)
            }}
          />
        </div>
        <div className="right-panel">
          <h3>Summary</h3>
          <p>Pin Risk: {Math.round(state.summary.pin_risk)}</p>
          <p>ATM: {state.summary.atm_strike ?? "N A"}</p>
          <p>MSI: {state.summary.msi_strikes.join(", ") || "N A"}</p>
          <p>Net GEX: {formatCompactSigned(state.summary.net_gex_band)}</p>
          <p>Nearest MSI: {formatSummaryPercent(state.summary.nearest_msi_distance_pct)}</p>

          <MiniIvChart
            rows={allRowsAsc}
            selectedStrike={selection?.strike ?? null}
            onSelectStrike={(strike) => jumpToStrike(strike)}
          />
          <MiniExposureChart
            rows={allRowsAsc}
            selectedStrike={selection?.strike ?? null}
            onSelectStrike={(strike) => jumpToStrike(strike)}
          />

          <div className="msi-card">
            <h4>Top MSI</h4>
            {msiRows.length === 0 ? (
              <p className="rationale-empty">N A</p>
            ) : (
              <ul className="msi-list">
                {msiRows.map((row) => (
                  <li key={row.strike}>
                    <button
                      type="button"
                      className="msi-item-btn"
                      onClick={() => jumpToStrike(row.strike)}
                    >
                      {row.strike} | {row.flags.wall_type} | {row.msi_score === null ? "N A" : row.msi_score.toFixed(2)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <MtcRationaleCard
            side="Call"
            block={mtcCallBlock}
            onSelectContract={(contractId) => jumpToSelection(findSelectionByContract(allRowsAsc, contractId))}
            onCopyContract={(contractId, includeConid) => {
              void handleCopyContract(contractId, includeConid)
            }}
          />
          <MtcRationaleCard
            side="Put"
            block={mtcPutBlock}
            onSelectContract={(contractId) => jumpToSelection(findSelectionByContract(allRowsAsc, contractId))}
            onCopyContract={(contractId, includeConid) => {
              void handleCopyContract(contractId, includeConid)
            }}
          />
        </div>
      </section>
      <PinnedDetailDrawer
        symbol={state.symbol}
        expiry={state.expiry}
        spotMid={state.spot.mid}
        selection={selection ? { strike: selection.strike, side: selection.side } : null}
        row={selectedRow}
        series={selectedSeries}
        onClose={() => setSelection(null)}
        onJumpToStrike={(strike) => jumpToStrike(strike)}
        onCopyContract={(includeConid) => {
          void handleCopyContract(selection?.contractId ?? null, includeConid)
        }}
      />
    </main>
  )
}

function findContractById(rows: StrikeRow[], contractId: string | null): ContractBlock | null {
  if (!contractId) {
    return null
  }
  for (const row of rows) {
    if (row.call.contract_id === contractId) {
      return row.call
    }
    if (row.put.contract_id === contractId) {
      return row.put
    }
  }
  return null
}

function findSelectionByContract(rows: StrikeRow[], contractId: string | null): Selection | null {
  if (!contractId) {
    return null
  }
  for (const row of rows) {
    if (row.call.contract_id === contractId) {
      return { strike: row.strike, side: "call", contractId }
    }
    if (row.put.contract_id === contractId) {
      return { strike: row.strike, side: "put", contractId }
    }
  }
  return null
}

function nearestStrikeToSpot(rows: StrikeRow[], spot: number | null): number | null {
  if (spot === null || spot <= 0 || rows.length === 0) {
    return null
  }

  return rows.reduce((best, current) => {
    if (Math.abs(current.strike - spot) < Math.abs(best - spot)) {
      return current.strike
    }
    return best
  }, rows[0].strike)
}

function streamStateToSnapshotEnvelope(state: StreamState): AnyEnvelope {
  return {
    type: "snapshot",
    schema_version: 1,
    ts_ms: Date.now(),
    payload: {
      underlying: {
        symbol: state.symbol,
        expiry: state.expiry,
        spot: state.spot
      },
      config: state.config,
      summary: state.summary,
      rows: Object.values(state.rowsByStrike).sort((a, b) => a.strike - b.strike)
    }
  }
}

function apiPath(path: string): string {
  return path
}

function streamPath(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/stream`
}

function clampMs(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.floor(value)))
}
