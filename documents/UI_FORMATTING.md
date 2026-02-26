# UI_FORMATTING.md
QQQ 0DTE Options Ladder Console
Version 1.0
Applies to frontend rendering and backend formatting hints

## 1. Goals
1. Prevent UI flicker caused by column width changes.
2. Make numbers comparable at a glance across strikes.
3. Avoid ambiguity from mixed units and inconsistent decimals.
4. Ensure null and stale data is obvious.
5. Make copy actions deterministic.

## 2. Global formatting rules
### 2.1 Locale and separators
1. Use en-US numeric formatting regardless of OS locale.
2. Thousands separator: comma.
3. Decimal separator: period.
4. Never use scientific notation.

### 2.2 Sign display
1. Always show a minus sign for negative numbers.
2. Do not prefix positive numbers with plus sign, except in the Summary bar where a plus improves scanning. Summary may show plus for net_gex_band only.

### 2.3 Null display
1. Any null numeric field renders as "·" (middle dot) in ladder cells.
2. Any null numeric field in summary cards renders as "N A".
3. Any null contract id renders as "N A".

### 2.4 Stale display
1. If contract stale_ms > max_stale_ms but contract still has last values, show values but:
   1. apply muted opacity 0.5 to the entire contract block cell set
   2. show a small "STALE" tag in the far right flags column for that contract
2. If stale_ms > 3 * max_stale_ms, treat as effectively missing and render all cells as null except contract id.

### 2.5 Color usage
1. Use a fixed palette defined in a single theme file.
2. Never use heatmaps with continuous gradients in v1.
3. Use discrete categories only:
   1. normal
   2. highlight
   3. warning
   4. muted

Reason: continuous gradients flicker due to small numeric changes.

## 3. Units and field specific formatting
All decimals and units must be consistent across the UI.

### 3.1 Prices
Fields: underlying bid ask mid last, option mid

Formatting:
1. Underlying prices: 2 decimals fixed.
2. Option mid: 2 decimals fixed when mid >= 1.00.
3. Option mid: 3 decimals fixed when 0.10 <= mid < 1.00.
4. Option mid: 4 decimals fixed when 0.00 < mid < 0.10.
5. Option mid: if mid is 0 exactly, render "0.0000".

Rationale: 0DTE options can trade in sub-dollar ranges and precision matters.

### 3.2 Spread percent
Field: spread_pct

Internal representation: fraction, for example 0.12 means 12 percent.

Display:
1. Show percent with 1 decimal: 12.0%
2. For spread_pct < 0.01 show with 2 decimals: 0.85%
3. If spread_pct >= 1.00 show 100%+ as "100%+" and treat as illiquid.

### 3.3 Implied volatility
Field: iv, iv_residual

Internal representation:
1. iv is decimal, for example 0.35 means 35 percent annualized.
2. iv_residual is decimal, same units as iv.

Display rules:
1. iv: display in percent with 1 decimal, for example 35.0
2. iv: do not show percent sign in ladder to save space, show "%IV" in column header
3. iv_residual: display in vol points with 2 decimals, where 0.01 equals 1.00 vol point
   1. vol_points = iv_residual * 100
   2. display vol_points with 2 decimals
4. iv_residual sign: negative means cheaper than fit.

Examples:
1. iv = 0.273 -> "27.3"
2. iv_residual = -0.0123 -> "-1.23" meaning minus 1.23 vol points

### 3.4 Greeks
Fields: delta gamma vega theta

Delta:
1. Display with 2 decimals.
2. Calls are positive, puts are negative.
3. Also provide abs delta in MTC gating logic but do not display abs delta, show true signed delta.

Gamma:
1. Display with 4 decimals.
2. If abs(gamma) < 0.00005, display "0.0000".

Vega:
1. Display with 3 decimals.
2. If abs(vega) < 0.0005, display "0.000".

Theta:
1. Display with 3 decimals.
2. Theta is typically negative.
3. If abs(theta) < 0.0005, display "0.000".

### 3.5 Per dollar greeks
Fields: gamma_per_dollar, vega_per_dollar, theta_per_dollar
These should not clutter ladder by default.

Display:
1. Only shown in detail drawer and in MTC rationale popup.
2. Display:
   1. gamma_per_dollar with 4 decimals
   2. vega_per_dollar with 3 decimals
   3. theta_per_dollar with 3 decimals

### 3.6 Volume and open interest
Fields: volume, oi

Display:
1. Integers with thousands separators.
2. If null show "·".
3. If value is 0 show "0".

Volume highlight:
1. If volume is in top 10 percent of window, add a small dot indicator in volume cell, but do not color code in v1.

### 3.7 Exposures DEX GEX VEX
Fields: strike exposures for OI and volume weighted.

Internal: exposure values in USD units.

Display approach:
1. Do not display raw exposure numbers in the ladder by default.
2. Display exposures in right panel charts only and in the strike row tooltip.
3. In tooltip and cards, use compact notation:
   1. absolute value >= 1,000,000 -> show in M with 2 decimals, for example 12.34M
   2. absolute value >= 1,000 -> show in K with 2 decimals, for example 450.12K
   3. else show full with 2 decimals

Sign:
1. Keep sign, for example -3.21M

### 3.8 Summary values
Top bar summary shows:
1. spot mid
2. expiry
3. pin risk
4. net gex band
5. nearest MSI distance

Formatting:
1. pin_risk display as 0 to 100 with no decimals, for example 63
2. net_gex_band display compact K or M with sign and 2 decimals
3. nearest_msi_distance_pct display as percent with 2 decimals

## 4. Table layout specification
### 4.1 Table orientation
Rows:
1. Strike rows sorted ascending by strike by default.
2. Provide toggle for descending.
3. Strike is always frozen column in the center.

Columns:
The ladder is symmetrical:
Calls block on the left, strike center, puts block on the right.

### 4.2 Column order and headers
Calls block columns, left to right:
1. C Mid
2. C Spr%
3. C IV
4. C IVr
5. C Δ
6. C Γ
7. C V
8. C Θ
9. C Vol
10. C OI
11. C Flags

Center:
12. Strike

Puts block columns, left to right:
13. P Flags
14. P OI
15. P Vol
16. P Θ
17. P V
18. P Γ
19. P Δ
20. P IVr
21. P IV
22. P Spr%
23. P Mid

Rationale:
1. Mirror symmetry makes scanning easier when you compare calls and puts.

Header text rules:
1. No multi line headers in v1.
2. Use short labels.
3. Use unicode for delta and gamma if supported, else use plain text D and G.

### 4.3 Fixed column widths
To avoid flicker, each column has a fixed width in pixels.

Recommended widths:
1. Mid: 74 px
2. Spr%: 60 px
3. IV: 56 px
4. IVr: 60 px
5. Δ: 48 px
6. Γ: 64 px
7. V: 56 px
8. Θ: 56 px
9. Vol: 70 px
10. OI: 70 px
11. Flags: 48 px
12. Strike: 78 px

Total width should fit a standard 1440 px wide window with side panels collapsible.

### 4.4 Row height
1. Fixed row height 28 px.
2. Font size 12 px in ladder cells.
3. Font family monospaced or tabular numerals enabled to avoid jitter.

### 4.5 Cell alignment
1. All numeric cells right aligned.
2. Contract id never shown in ladder cells.
3. Flags cells center aligned.

### 4.6 Row overlays
MSI:
1. MSI rows get a subtle background highlight across entire row.
2. Show a small badge "MSI" in the Strike column for MSI rows only.

ATM marker:
1. Strike closest to spot gets an "ATM" small dot icon in Strike column.

### 4.7 Flags column content
Flags column shows compact icons:
1. L for liquid, only shown if liquid true, else blank
2. S for stale, shown if stale_ms > max_stale_ms
3. I for IV imbalance highlight active
4. G for extreme gamma per dollar highlight active
5. M for MTC selected

These are single characters to avoid width growth.

## 5. Highlight color semantics
All highlights must be deterministic and based on backend flags to avoid frontend drift.
Frontend should not independently compute highlight categories in v1, except for local selection state.

Highlight types:
1. MSI row highlight, from flags.is_msi
2. MTC badge, from mtc_rationale not null and contract id equals summary mtc contract id
3. IV imbalance, from backend computed flag, or derived as:
   1. liquid true
   2. iv_residual <= iv_imbalance_threshold
   3. persistence met
4. Extreme greek, from backend flag, not computed in frontend

Color assignment:
1. MSI: neutral highlight, low saturation.
2. MTC: strong accent border.
3. IV imbalance: cool tone highlight.
4. Extreme greek: warm tone highlight.
5. Illiquid: muted gray.

## 6. Numeric formatting in tooltips and drawers
### 6.1 Tooltip on hover for a contract cell
Show:
1. contract descriptor: symbol expiry right strike
2. mid, bid, ask, sizes
3. iv and iv_residual in vol points
4. delta gamma vega theta
5. per dollar greeks
6. liquidity gate status and which gate failed
7. staleness ms

Formatting:
1. Use the same decimals as in ladder, but show bid and ask with same precision rules as mid.
2. Show staleness as integer milliseconds and also as seconds with 1 decimal.

### 6.2 MTC rationale popup
When user clicks MTC badge, show:
1. TradableScore
2. LiquidityScore
3. CheapIVScore
4. EfficiencyScore
5. StabilityScore
6. Spread percent, staleness, delta
7. iv_residual in vol points
8. gamma_per_dollar, vega_per_dollar, theta_per_dollar
9. Notes list

All scores are displayed as 0.00 to 1.00 with 2 decimals.

### 6.3 Strike row tooltip
On hover over strike, show:
1. OI weighted DEX, GEX, VEX compact format
2. Volume weighted DEX, GEX, VEX compact format
3. MSI_score
4. distance to spot percent

## 7. Copy string spec
Copy action must be deterministic and consistent across sessions.

Contract descriptor string format:
1. "QQQ {expiry} {right} {strike} SMART"
2. strike formatted with no trailing zeros beyond one decimal where needed:
   1. if strike is integer, show as integer
   2. else show with one decimal
3. expiry is YYYYMMDD

Example:
1. "QQQ 20260225 C 430 SMART"
2. "QQQ 20260225 P 432.5 SMART"

Also provide a secondary copy that includes conid:
1. "conid={conid} QQQ 20260225 C 430 SMART"

## 8. Chart formatting
### 8.1 IV curve chart
Axes:
1. x axis: strike
2. y axis: IV percent, 0 to auto
3. show fitted curve line
4. show points

Tooltip:
1. strike
2. iv
3. residual vol points
4. liquid status

### 8.2 Exposure chart
Axes:
1. x axis: strike
2. y axis: GEX in compact units
3. show OI weighted bars
4. optionally show volume weighted outline

Zero line:
1. show horizontal zero line for sign context.

## 9. Accessibility and keyboard
1. Support keyboard navigation for pinned selection:
   1. up and down arrows move pinned strike
2. Enter toggles pin.
3. Escape closes drawer.
4. Copy action accessible via keyboard when MTC focused.

## 10. Performance rules
1. Do not rerender full ladder on every delta.
2. Use memoization per row key.
3. Batch state updates per websocket message.
4. Avoid expensive formatting in render loops:
   1. precompute formatted strings when patch applied
   2. store formatted fields in state if needed

End of UI_FORMATTING.md