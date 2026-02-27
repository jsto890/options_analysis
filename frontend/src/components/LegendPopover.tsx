import { useState } from "react"

const LEGEND_ITEMS = [
  { term: "MSI", meaning: "Most Significant Strike based on local GEX concentration near spot." },
  { term: "MTC", meaning: "Most Tradable Contract after liquidity and delta gates pass." },
  { term: "IVr", meaning: "IV residual in vol points. Negative values indicate relative cheapness." },
  { term: "GEX", meaning: "Gamma exposure proxy in USD per 1% underlying move." },
  { term: "S Flag", meaning: "Quote is stale. Critical stale rows render as unavailable." }
]

export function LegendPopover(): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="legend-popover">
      <button
        type="button"
        className="control-btn"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Legend
      </button>
      {open ? (
        <div className="legend-panel" role="dialog" aria-label="Signal legend">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.term} className="legend-item">
              <strong>{item.term}</strong>
              <p>{item.meaning}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
