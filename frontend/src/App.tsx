import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { CommandPalette, type CommandAction } from "@/components/CommandPalette"
import { ContextChips } from "@/components/ContextChips"
import { DecisionAssistPanel } from "@/components/DecisionAssistPanel"
import { LegendPopover } from "@/components/LegendPopover"
import { PinnedDetailDrawer } from "@/components/PinnedDetailDrawer"
import { SignalCockpit } from "@/components/SignalCockpit"
import { StrikeLadder } from "@/components/StrikeLadder"
import { useStreamStore } from "@/state/store"
import { copyContractDescriptor } from "@/utils/contracts"
import { isCriticalStale } from "@/utils/signals"
import { updateSeriesFromRows, type SeriesByContract } from "@/utils/timeseries"
import { EMPTY_STATE, type StreamState } from "@/ws/reducer"
import { StreamClient } from "@/ws/client"
import { PlaybackClient, replayEnvelopes } from "@/ws/playback"
import type { AnyEnvelope, ContractBlock, StrikeRow } from "@/ws/types"

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

interface ComparedContract {
  contract_id: string
  label: string
  block: ContractBlock
}

export interface AppProps {
  onRowRender?: (strike: number) => void
}

const MIN_DATA_REFRESH_MS = 50
const DEFAULT_PRESENTATION_REFRESH_MS = 100
const VIEW_MODE_STORAGE_KEY = "options-analysis:view-mode"

export default function App({ onRowRender }: AppProps = {}): JSX.Element {
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
  const [focusMode, setFocusMode] = useState(false)
  const [focusStrike, setFocusStrike] = useState<number | null>(null)
  const [keyboardContext, setKeyboardContext] = useState<"none" | "ladder">("none")
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [playbackTotal, setPlaybackTotal] = useState(0)
  const [playbackRunning, setPlaybackRunning] = useState(false)
  const [playbackEnvelopes, setPlaybackEnvelopes] = useState<AnyEnvelope[]>([])
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"scan" | "explain">(() => {
    if (typeof window === "undefined") {
      return "scan"
    }
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return stored === "explain" ? "explain" : "scan"
  })
  const [comparedContractIds, setComparedContractIds] = useState<string[]>([])

  const copyStatusTimer = useRef<number | null>(null)
  const playbackClientRef = useRef<PlaybackClient | null>(null)
  const liveEnvelopeQueueRef = useRef<AnyEnvelope[]>([])

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

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
    }, DEFAULT_PRESENTATION_REFRESH_MS)

    return () => window.clearInterval(timer)
  }, [dispatch])

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

  const staleCriticalRatio = useMemo(() => {
    if (allRowsAsc.length === 0) {
      return 0
    }
    const criticalRows = allRowsAsc.filter(
      (row) => isCriticalStale(row.call, state.config) && isCriticalStale(row.put, state.config)
    ).length
    return criticalRows / allRowsAsc.length
  }, [allRowsAsc, state.config])

  const staleHeavy = staleCriticalRatio >= 0.45

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
      if (focusMode) {
        const isSelected = selection?.strike === row.strike
        const isTradableContext =
          row.flags.is_msi ||
          row.call.liquid ||
          row.put.liquid ||
          row.call.contract_id === state.summary.mtc_call_contract_id ||
          row.put.contract_id === state.summary.mtc_put_contract_id ||
          isSelected
        if (!isTradableContext) {
          return false
        }
      }
      return true
    })
  }, [
    allRowsSorted,
    filters,
    focusMode,
    selection?.strike,
    state.summary.mtc_call_contract_id,
    state.summary.mtc_put_contract_id,
    state.config
  ])

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

  useEffect(() => {
    setComparedContractIds((current) =>
      current.filter((contractId) => findContractById(allRowsAsc, contractId) !== null)
    )
  }, [allRowsAsc])

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

  const comparedContracts = useMemo<ComparedContract[]>(() => {
    return comparedContractIds
      .map((contractId) => buildComparedContract(allRowsAsc, contractId))
      .filter((contract): contract is ComparedContract => contract !== null)
      .slice(0, 2)
  }, [allRowsAsc, comparedContractIds])

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

  const toggleCompare = (contractId: string | null) => {
    if (!contractId) {
      return
    }
    setComparedContractIds((current) => {
      if (current.includes(contractId)) {
        return current.filter((id) => id !== contractId)
      }
      return [...current, contractId].slice(-2)
    })
  }

  const jumpSelectionByOffset = (offset: number) => {
    if (!selection || rows.length === 0) {
      jumpToStrike(atmStrike)
      return
    }

    const strikes = rows.map((row) => row.strike)
    const currentIndex = strikes.indexOf(selection.strike)
    if (currentIndex === -1) {
      return
    }

    const nextIndex = Math.max(0, Math.min(strikes.length - 1, currentIndex + offset))
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

  const commandActions = useMemo<CommandAction[]>(
    () => [
      {
        id: "jump-atm",
        label: "Jump to ATM",
        description: "Select and center the ATM strike.",
        shortcut: "A",
        disabled: atmStrike === null,
        run: () => jumpToStrike(atmStrike)
      },
      {
        id: "jump-msi",
        label: "Jump to nearest MSI",
        description: "Center the closest MSI strike to spot.",
        shortcut: "M",
        disabled: nearestMsiStrike === null,
        run: () => jumpToStrike(nearestMsiStrike)
      },
      {
        id: "jump-mtc-call",
        label: "Jump to MTC call",
        description: "Focus the current best call contract row.",
        run: () => jumpToSelection(mtcCallSelection)
      },
      {
        id: "jump-mtc-put",
        label: "Jump to MTC put",
        description: "Focus the current best put contract row.",
        run: () => jumpToSelection(mtcPutSelection)
      },
      {
        id: "toggle-focus",
        label: focusMode ? "Disable guided focus" : "Enable guided focus",
        description: "Show tradable/MSI context rows only.",
        run: () => setFocusMode((current) => !current)
      },
      {
        id: "toggle-mode",
        label: viewMode === "scan" ? "Switch to explain mode" : "Switch to scan mode",
        description: "Change information density in Decision Assist.",
        run: () => setViewMode((current) => (current === "scan" ? "explain" : "scan"))
      },
      {
        id: "copy-selected",
        label: "Copy selected contract",
        description: "Copy selected contract descriptor to clipboard.",
        shortcut: "C",
        disabled: !selection?.contractId,
        run: () => {
          void handleCopyContract(selection?.contractId ?? null)
        }
      },
      {
        id: "copy-selected-conid",
        label: "Copy selected contract + conid",
        description: "Copy descriptor with conid prefix.",
        shortcut: "Shift+C",
        disabled: !selection?.contractId,
        run: () => {
          void handleCopyContract(selection?.contractId ?? null, true)
        }
      }
    ],
    [
      atmStrike,
      focusMode,
      mtcCallSelection,
      mtcPutSelection,
      nearestMsiStrike,
      selection?.contractId,
      viewMode
    ]
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      if (commandPaletteOpen) {
        if (event.key === "Escape") {
          event.preventDefault()
          setCommandPaletteOpen(false)
        }
        return
      }

      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "RANGE"].includes(target.tagName)) {
        return
      }

      if (event.key === "Escape") {
        setSelection(null)
        return
      }

      if (event.key === "a" || event.key === "A") {
        event.preventDefault()
        jumpToStrike(atmStrike)
        return
      }

      if (event.key === "m" || event.key === "M") {
        event.preventDefault()
        jumpToStrike(nearestMsiStrike)
        return
      }

      if (event.key === "[") {
        event.preventDefault()
        jumpSelectionByOffset(-1)
        return
      }

      if (event.key === "]") {
        event.preventDefault()
        jumpSelectionByOffset(1)
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
  }, [
    atmStrike,
    commandPaletteOpen,
    keyboardContext,
    nearestMsiStrike,
    rows,
    selection,
    state.rowsByStrike
  ])

  const statusMessages = useMemo(() => {
    const messages: string[] = []
    if (!state.connected) {
      messages.push("Live stream disconnected. Data may be stale until reconnect.")
    }
    if (mode === "live" && state.subscriptions === 0) {
      messages.push("No active option subscriptions. Verify TWS market data and line budget.")
    }
    if (staleHeavy) {
      messages.push("Critical staleness is elevated. Prefer contracts with fresh quotes only.")
    }
    return messages
  }, [mode, staleHeavy, state.connected, state.subscriptions])

  return (
    <main className="app-shell premium-shell">
      <SignalCockpit
        symbol={state.symbol}
        expiry={state.expiry}
        connected={state.connected}
        subscriptions={state.subscriptions}
        mode={mode}
        spotMid={state.spot.mid}
        pinRisk={state.summary.pin_risk}
        netGexBand={state.summary.net_gex_band}
        nearestMsiDistancePct={state.summary.nearest_msi_distance_pct}
        marketRegime={state.summary.market_regime}
        dataQualityScore={state.summary.data_quality_score}
        freshContractRatio={state.summary.fresh_contract_ratio}
        streamLatencyMs={state.summary.stream_latency_ms}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((current) => (current === "scan" ? "explain" : "scan"))}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

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

      {statusMessages.length > 0 ? (
        <div className="status-banner" role="status" aria-live="polite">
          {statusMessages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <ContextChips
        filters={filters}
        selection={selection ? { strike: selection.strike, side: selection.side } : null}
        focusMode={focusMode}
        staleHeavy={staleHeavy}
        noSubscriptions={mode === "live" && state.subscriptions === 0}
        connected={state.connected}
        viewMode={viewMode}
      />

      {copyStatus ? <div className="copy-toast">{copyStatus}</div> : null}

      <section className="content-grid">
        <div className="left-panel">
          <h3>Config</h3>
          <p>Cadence: {state.config.update_interval_ms} ms</p>
          <p>Window: ±{state.config.window_strikes_each_side} strikes</p>
          <p>Max stale: {state.config.max_stale_ms} ms</p>
          <p>Max spread: {(state.config.max_spread_pct * 100).toFixed(1)}%</p>
          <p>IV imbalance: {(state.config.iv_imbalance_threshold * 100).toFixed(2)} vol pts</p>
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
              <button
                type="button"
                onClick={() => setFocusMode((current) => !current)}
                className="control-btn"
              >
                Focus: {focusMode ? "ON" : "OFF"}
              </button>
              <span className="ladder-count">Rows: {rows.length}</span>
              <LegendPopover />
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
            onRowRender={onRowRender}
          />
        </div>

        <DecisionAssistPanel
          rows={allRowsAsc}
          selectedStrike={selection?.strike ?? null}
          onSelectStrike={(strike) => jumpToStrike(strike)}
          msiRows={msiRows}
          mtcCallBlock={mtcCallBlock}
          mtcPutBlock={mtcPutBlock}
          nearestMsiDistancePct={state.summary.nearest_msi_distance_pct}
          netGexBand={state.summary.net_gex_band}
          viewMode={viewMode}
          comparedContracts={comparedContracts}
          onRemoveComparedContract={(contractId) =>
            setComparedContractIds((current) => current.filter((id) => id !== contractId))
          }
          onToggleCompare={toggleCompare}
          onJumpToStrike={(strike) => jumpToStrike(strike)}
          onSelectContract={(contractId) => jumpToSelection(findSelectionByContract(allRowsAsc, contractId))}
          onCopyContract={(contractId, includeConid) => {
            void handleCopyContract(contractId, includeConid)
          }}
        />
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

      <CommandPalette open={commandPaletteOpen} actions={commandActions} onClose={() => setCommandPaletteOpen(false)} />
    </main>
  )
}

function buildComparedContract(rows: StrikeRow[], contractId: string): ComparedContract | null {
  for (const row of rows) {
    if (row.call.contract_id === contractId) {
      return {
        contract_id: contractId,
        label: `CALL ${row.strike}`,
        block: row.call
      }
    }
    if (row.put.contract_id === contractId) {
      return {
        contract_id: contractId,
        label: `PUT ${row.strike}`,
        block: row.put
      }
    }
  }
  return null
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

function streamPath(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/stream`
}
