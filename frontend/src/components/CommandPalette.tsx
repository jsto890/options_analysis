import { useEffect, useMemo, useRef, useState } from "react"

export interface CommandAction {
  id: string
  label: string
  description: string
  shortcut?: string
  disabled?: boolean
  run: () => void
}

interface Props {
  open: boolean
  actions: CommandAction[]
  onClose: () => void
}

export function CommandPalette({ open, actions, onClose }: Props): JSX.Element | null {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      return
    }
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return actions
    }
    return actions.filter((action) => {
      return (
        action.label.toLowerCase().includes(needle) ||
        action.description.toLowerCase().includes(needle) ||
        action.shortcut?.toLowerCase().includes(needle)
      )
    })
  }, [actions, query])

  if (!open) {
    return null
  }

  return (
    <div className="command-overlay" role="dialog" aria-label="Command palette">
      <div className="command-shell">
        <div className="command-head">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command"
            aria-label="Command search"
          />
          <button type="button" className="control-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="command-list">
          {filtered.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className="command-item"
                disabled={action.disabled}
                onClick={() => {
                  action.run()
                  onClose()
                }}
              >
                <span>
                  <strong>{action.label}</strong>
                  <p>{action.description}</p>
                </span>
                {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="command-empty">No commands match your search.</li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
