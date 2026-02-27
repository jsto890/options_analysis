interface LadderFilters {
  msiOnly: boolean
  mtcOnly: boolean
  liquidOnly: boolean
  hideCriticalStale: boolean
}

type ViewMode = "scan" | "explain"

interface Props {
  filters: LadderFilters
  selection: { strike: number; side: "call" | "put" } | null
  focusMode: boolean
  staleHeavy: boolean
  noSubscriptions: boolean
  connected: boolean
  viewMode: ViewMode
}

interface Chip {
  label: string
  tone?: "neutral" | "good" | "warn" | "danger"
}

export function ContextChips({
  filters,
  selection,
  focusMode,
  staleHeavy,
  noSubscriptions,
  connected,
  viewMode
}: Props): JSX.Element {
  const chips: Chip[] = [{ label: viewMode === "scan" ? "SCAN MODE" : "EXPLAIN MODE", tone: "neutral" }]

  if (selection) {
    chips.push({
      label: `Selected ${selection.side.toUpperCase()} ${selection.strike}`,
      tone: "good"
    })
  }
  if (focusMode) {
    chips.push({ label: "GUIDED FOCUS", tone: "good" })
  }
  if (filters.msiOnly) chips.push({ label: "MSI ONLY" })
  if (filters.mtcOnly) chips.push({ label: "MTC ONLY" })
  if (filters.liquidOnly) chips.push({ label: "LIQUID ONLY" })
  if (filters.hideCriticalStale) chips.push({ label: "HIDE CRITICAL STALE" })
  if (!connected) chips.push({ label: "DISCONNECTED", tone: "danger" })
  if (noSubscriptions) chips.push({ label: "NO SUBSCRIPTIONS", tone: "warn" })
  if (staleHeavy) chips.push({ label: "STALE HEAVY", tone: "warn" })

  return (
    <div className="context-chips" aria-label="Context chips">
      {chips.map((chip) => (
        <span key={chip.label} className={`context-chip tone-${chip.tone ?? "neutral"}`}>
          {chip.label}
        </span>
      ))}
    </div>
  )
}
