# SPEC.md
QQQ 0DTE Options Ladder Console
Version 1.0
Schema version 1
Status: implementation ready

## 1. Product intent
Build a local application that helps you pick the best QQQ 0DTE call or put contract to buy for intraday swings, using live greeks, implied volatility, liquidity quality, exposure statistics, and strike level structure outputs.

This is not a trading bot.
This is not an execution system.
This does not place orders.
This does not read positions or account balances.

The user already uses TradingView and IBKR charts for direction.
This application is a contract and structure analytics console to support manual execution.

## 2. Scope
### 2.1 In scope
1. Symbol: QQQ only.
2. Expiry: today only, 0DTE only.
3. Strike universe: a controlled strike window around spot, managed dynamically.
4. Data: bid, ask, sizes, last, model greeks, model implied volatility, volume, open interest when available.
5. Derived per contract: mid, spread percent, staleness, liquidity flags, iv residual, per dollar greeks, stability metrics.
6. Derived per strike: OI weighted DEX, GEX, VEX and volume weighted DEX, GEX, VEX.
7. Global summary: net GEX in band, pin risk score, MSI list, MTC picks.
8. UI: strike ladder as the core surface, plus a small set of summary charts and cards.
9. Local only deployment on the same machine as TWS or IB Gateway.

### 2.2 Explicit non goals for v1
1. Full chain streaming.
2. Automated max pain targeting.
3. Market maker intent claims.
4. Order placement.
5. Positions and account views.
6. Multi symbol, multi expiry.
7. Cloud hosting, remote access.

## 3. Primary user workflow
1. Start IB Gateway or TWS with API enabled.
2. Start backend service on localhost.
3. Start frontend on localhost.
4. Backend auto selects QQQ and today expiry.
5. Backend subscribes to a strike window around spot.
6. UI shows live ladder, MSI strikes, MTC picks, and key levels.
7. User reads their chart for direction.
8. User uses MTC call or MTC put to choose the contract with best liquidity and cheapness, then executes manually in IBKR.

## 4. Design principles
1. Signal quality over feature count.
2. Liquidity gating overrides all scoring and highlighting.
3. Analytics cadence is timer based to avoid tick spam.
4. Window management respects IBKR market data line limits and pacing.
5. Outputs do not imply deterministic targets, only structure and selection support.
6. UI must be stable at 500 ms updates without flicker.

## 5. System architecture
### 5.1 Process topology
One backend process:
1. Owns the ib_insync event loop and connection.
2. Owns contract qualification.
3. Owns subscription window management.
4. Owns analytics refresh loop.
5. Owns websocket broadcast.
6. Owns REST endpoints for health, state, config.

One frontend:
1. Websocket consumer.
2. Renders ladder and summaries.
3. Stores a small rolling cache for pinned contract time series.
4. Supports offline playback.

### 5.2 Technology stack
Backend:
1. Python 3.11 or newer
2. ib_insync
3. FastAPI
4. Uvicorn
5. Pydantic v2
6. Optional local persistence: SQLite or JSONL logs

Frontend:
1. React
2. TypeScript
3. Vite
4. Virtualized table library
5. Recharts for small charts
6. Zustand or Redux Toolkit for state

## 6. Security and privacy constraints
IBKR socket API uses TWS or IB Gateway login and session, not API keys.
Security risks are local exposure and logging.

Hard rules:
1. Backend binds to 127.0.0.1 only.
2. No remote access.
3. No cloud deployment.
4. No storage of account number, positions, orders.
5. Logs contain only timestamps, contract descriptors, and error states.
6. .env and local config files are gitignored.
7. If later enabling LAN access, add authentication and CORS restrictions, but v1 must not.

## 7. Data model and definitions
This section is the single source of truth for all computations and highlighting.

### 7.1 Time conventions
1. All internal timestamps are epoch milliseconds.
2. UI displays local time for readability.
3. staleness is computed as now_ms minus last_update_ms.

### 7.2 Underlying spot
Fields:
1. bid
2. ask
3. last
4. mid
5. ts_ms

Mid rule:
1. If bid and ask exist and bid > 0 and ask > 0 and ask >= bid, mid = (bid + ask) / 2.
2. Else if last exists and last > 0, mid = last.
3. Else mid is null.

### 7.3 Option contract identity
Each option contract must have a stable identity to support diff updates and UI row stability.

Use:
1. ib_conid as the primary stable identifier from IBKR.
2. contract_id string composed as: "{conid}:{symbol}:{expiry}:{right}:{strike}"
3. right is "C" or "P".
4. expiry is YYYYMMDD as a string.
5. strike is numeric with fixed formatting, for example one decimal if needed.

### 7.4 Contract raw fields
Per contract, store:
1. bid
2. ask
3. bid_size
4. ask_size
5. last
6. volume
7. open_interest
8. model_iv
9. model_delta
10. model_gamma
11. model_vega
12. model_theta
13. last_update_ms

### 7.5 Contract derived fields
#### 7.5.1 Mid and spread
1. mid is computed from bid and ask as above, otherwise null.
2. spread = ask minus bid when bid and ask valid, otherwise null.
3. spread_pct = spread / mid when spread and mid valid and mid > 0, otherwise null.

#### 7.5.2 Staleness
1. stale_ms = now_ms minus last_update_ms.
2. If last_update_ms missing, stale_ms is large and contract fails liquidity.

#### 7.5.3 Liquidity gating
Contract is liquid if all are true:
1. mid exists and mid > 0.
2. spread_pct exists and spread_pct <= max_spread_pct.
3. bid_size exists and bid_size >= min_bid_size.
4. ask_size exists and ask_size >= min_ask_size.
5. stale_ms <= max_stale_ms.

Contracts failing liquidity are still shown but cannot be highlighted for imbalances and cannot be selected as MTC.

#### 7.5.4 Per dollar greek normalizations
Only compute if mid exists and mid > 0:
1. gamma_per_dollar = model_gamma / mid
2. vega_per_dollar = model_vega / mid
3. theta_per_dollar = abs(model_theta) / mid

These are used for extreme greek highlighting and for MTC efficiency.

### 7.6 IV curve fit and IV residual
Purpose: identify relative cheapness within the streamed window, not a marketwide surface.

Fit is performed separately for calls and puts.

Definitions:
1. S = spot mid.
2. K = strike.
3. x = ln(K / S), log moneyness.
4. Fit function: iv_fit(x) = a + b x + c x^2.

Inputs for fit:
1. Use only contracts that are liquid.
2. Use only contracts with model_iv not null.
3. Clamp model_iv to [0.01, 5.0].

Fit constraints:
1. If number of points < min_fit_points, do not fit and set iv_residual null for all contracts.
2. Use robust fitting. In v1, implement one of:
   1. Iteratively reweighted least squares with Huber weights
   2. RANSAC with a simple residual threshold
3. If fit fails numerically, return null fit.

Residual:
1. iv_residual = model_iv minus iv_fit(x) when fit exists.

Persistence for IV imbalance:
1. Maintain for each contract a rolling window of last N iv_residual values, N = persistence_updates.
2. Compute residual_persist_score as fraction of last N residuals that are below negative residual threshold.
3. Only flag IV imbalance if residual_persist_score >= persistence_fraction, default 0.7.

### 7.7 Exposure metrics
Exposures are computed per strike, using both OI and volume as separate weights.
Exposures represent sensitivity magnitudes, not dealer positioning.

Constants:
1. multiplier = 100.
2. S = spot mid.

Per contract exposure definitions:
1. DEX_usd = model_delta * S * multiplier * weight
2. GEX_1pct_usd = model_gamma * S^2 * 0.01 * multiplier * weight
3. VEX_1vol_usd = model_vega * 0.01 * multiplier * weight

Weight rules:
1. For OI weighted exposures, weight = open_interest if not null and > 0.
2. For volume weighted exposures, weight = volume if not null and > 0.
3. If weight missing, exclude from that exposure sum.

Strike aggregation:
1. Strike exposures are sums of call and put contract exposures at that strike.
2. Store both OI weighted and volume weighted exposures.

### 7.8 Net GEX in band
Purpose: regime and pin risk estimation within streamed window.

Definition:
1. Compute band strikes where abs(K minus S) / S <= gex_band_pct.
2. net_gex_band = sum of strike OI weighted GEX_1pct_usd for strikes in band.

Band default:
1. gex_band_pct = 0.0075, meaning 0.75 percent.

### 7.9 MSI, Most Significant Strike
MSI is strike level structure output.

Goal:
1. Find top strikes that have concentrated exposure impact near spot.

Score inputs:
1. Use abs(strike_gex_oi) where strike_gex_oi is OI weighted GEX_1pct_usd at that strike.
2. distance_pct = abs(K minus S) / S.
3. proximity_weight = exp( minus distance_pct / msi_bandwidth_pct ).
4. concentration_weight = abs(GEX(K)) / (abs(GEX(Km)) + abs(GEX(K)) + abs(GEX(Kp)) + epsilon).

Score:
1. MSI_score = abs(GEX(K)) * proximity_weight * concentration_weight.

Neighbor definition:
1. Km is nearest lower strike in the current window.
2. Kp is nearest higher strike in the current window.
3. If a neighbor missing, treat its abs GEX as 0.

Output:
1. MSI list top 3 strikes by MSI_score.
2. For each MSI strike, determine wall_type:
   1. call_wall if abs(call_gex_oi) >= abs(put_gex_oi)
   2. put_wall otherwise

### 7.10 MTC, Most Tradable Contract
MTC outputs two contracts:
1. best_call_contract_id
2. best_put_contract_id

MTC is contract selection support, not a trade signal.

Hard gates:
1. Contract must be liquid.
2. Contract delta must be within delta band:
   1. delta_band_min <= abs(delta) <= delta_band_max
   2. Use abs(delta) to avoid sign confusion, calls positive, puts negative.

Score components:
1. LiquidityScore
2. CheapIVScore
3. EfficiencyScore
4. StabilityScore

LiquidityScore:
1. ls1 = clamp(1 minus spread_pct / max_spread_pct, 0, 1)
2. ls2 = clamp(1 minus stale_ms / max_stale_ms, 0, 1)
3. LiquidityScore = ls1 * ls2

CheapIVScore:
1. If iv_residual null, CheapIVScore = 0.
2. Else CheapIVScore = clamp((0 minus iv_residual) / iv_residual_scale, 0, 1)
3. iv_residual_scale default 0.015, meaning 1.5 vol points.

EfficiencyScore:
1. gp = clamp(gamma_per_dollar / gamma_per_dollar_scale, 0, 1)
2. vp = clamp(vega_per_dollar / vega_per_dollar_scale, 0, 1)
3. tp = clamp(theta_per_dollar / theta_per_dollar_scale, 0, 1)
4. EfficiencyScore = clamp(gp + vp - tp, 0, 1)

Default scales:
1. gamma_per_dollar_scale = 0.02
2. vega_per_dollar_scale = 0.10
3. theta_per_dollar_scale = 0.20

StabilityScore:
1. Maintain rolling arrays of spread_pct and iv_residual, last N updates.
2. Compute spread_std and residual_std.
3. StabilityScore = clamp(1 minus spread_std / spread_std_scale, 0, 1) * clamp(1 minus residual_std / residual_std_scale, 0, 1)

Default stability scales:
1. spread_std_scale = 0.03
2. residual_std_scale = 0.01

TradableScore:
1. TradableScore = LiquidityScore * (0.5 + 0.5 * CheapIVScore) * (0.5 + 0.5 * EfficiencyScore) * StabilityScore

Output:
1. MTC_call is highest TradableScore among call contracts.
2. MTC_put is highest TradableScore among put contracts.
3. Provide rationale object with all component scores and gate status.

### 7.11 Highlighting rules
All highlights require liquidity.

IV imbalance highlight:
1. Contract is liquid.
2. iv_residual exists.
3. iv_residual <= iv_imbalance_threshold, default -0.01.
4. residual_persist_score >= persistence_fraction, default 0.7.

Extreme greek highlight:
1. Contract is liquid.
2. mid >= min_mid_for_extremes, default 0.05.
3. gamma_per_dollar in top quantile within window, default top 10 percent, and stable.
4. Optionally separate call and put distributions.

MSI highlight:
1. Strike row is one of top 3 MSI strikes.

MTC highlight:
1. Contract_id equals MTC_call or MTC_put.

## 8. Configuration
### 8.1 Config storage
1. Runtime config lives in memory in backend.
2. Config can be updated via POST /config.
3. Config is persisted to a local JSON file config.local.json that is gitignored.
4. On startup, load defaults then overlay config.local.json then overlay env values where relevant.

### 8.2 Default config values
1. update_interval_ms = 500
2. window_strikes_each_side = 20
3. roll_threshold_strikes = 2
4. max_spread_pct = 0.12
5. min_bid_size = 10
6. min_ask_size = 10
7. max_stale_ms = 1500
8. min_fit_points = 8
9. delta_band_min = 0.30
10. delta_band_max = 0.65
11. msi_bandwidth_pct = 0.0075
12. gex_band_pct = 0.0075
13. persistence_updates = 10
14. persistence_fraction = 0.7
15. iv_residual_scale = 0.015
16. iv_imbalance_threshold = -0.01
17. min_mid_for_extremes = 0.05
18. playback_mode_enabled = false
19. max_subscriptions_soft_limit = 95

### 8.3 Environment variables
Backend:
1. IBKR_HOST default "127.0.0.1"
2. IBKR_PAPER_PORT default 4002
3. IBKR_LIVE_PORT default 4001
4. IBKR_CLIENT_ID default 19
5. BACKEND_HOST default "127.0.0.1"
6. BACKEND_PORT default 8000
7. LOG_LEVEL default "INFO"

## 9. Backend implementation details
### 9.1 Modules and responsibilities
1. app.main
   1. FastAPI app creation
   2. startup and shutdown hooks
   3. route registration
2. app.ibkr.connector
   1. connect and reconnect
   2. qualify contracts
   3. request chain params
   4. manage subscriptions
   5. receive ticks and update raw state
3. app.ibkr.window_manager
   1. compute ATM strike index
   2. compute target window strikes
   3. compare to current window
   4. perform cancel then subscribe transitions
4. app.state.store
   1. in memory store for underlying, contracts, strike rows, summary
   2. version counters for rows and summary
5. app.analytics.engine
   1. periodic refresh loop
   2. call pure analytics functions
   3. update store derived fields
   4. compute patches for websocket
6. app.api.routes
   1. GET /health
   2. GET /state
   3. POST /config
   4. WS /stream
7. app.schemas
   1. Pydantic models for REST and websocket messages
8. app.logging
   1. structured logging setup
9. app.recording
   1. optional recorder writing snapshot and delta messages to JSONL for offline playback

### 9.2 State store details
In memory objects:
1. UnderlyingState
2. OptionContractState keyed by contract_id
3. StrikeRowState keyed by strike numeric
4. SummaryState singleton
5. ConfigState singleton

Versioning:
1. Each StrikeRowState has row_version integer.
2. SummaryState has summary_version integer.
3. On analytics refresh, update versions when any output field changes beyond epsilon.

Epsilon rules:
1. price changes less than 0.001 do not bump version.
2. iv changes less than 0.001 do not bump version.
3. spread_pct changes less than 0.002 do not bump version.
4. greek changes less than 1e-5 do not bump version.

### 9.3 Tick ingestion
Use ib_insync tick events.
On each tick:
1. Identify contract_id.
2. Update raw fields that changed.
3. Set last_update_ms.
4. Do not recompute full analytics on each tick.
5. Mark contract dirty for the next analytics refresh.

### 9.4 Analytics refresh loop
Timer interval:
1. update_interval_ms from config, default 500.

At each refresh:
1. Read current underlying spot mid.
2. Assemble normalized ladder input structure with all strike rows.
3. Call analytics pure functions to compute derived outputs.
4. Update store derived fields.
5. Prepare websocket delta patch containing:
   1. underlying_patch if changed
   2. summary_patch if changed
   3. row_patches for strike rows whose row_version changed

### 9.5 Subscription window management
Initial setup:
1. Get all strikes for today expiry via reqSecDefOptParams.
2. Determine nearest strike to spot, ATM strike.
3. Select window_strikes_each_side on each side.
4. Create call and put contracts for each strike.
5. Qualify all option contracts.
6. Subscribe to all option contracts and underlying.

Rolling:
1. Recompute ATM strike index each refresh.
2. If abs(new_atm_index minus current_atm_index) >= roll_threshold_strikes:
   1. Build new window strike set.
   2. Determine strikes to remove and strikes to add.
   3. Cancel market data for removed contracts.
   4. Subscribe to new contracts.
   5. Ensure total subscription count <= max_subscriptions_soft_limit.

Pacing:
1. Batch cancellations first.
2. Then subscribe adds in small groups, for example 10 contracts per 100 ms, configurable.
3. Log pacing warnings but do not crash.

### 9.6 REST endpoints behavior
GET /health:
1. returns ok, server time, ibkr connected boolean, subscriptions count.

GET /state:
1. returns current config, underlying, summary, and full rows snapshot.
2. This exists for debugging and manual sanity checks.

POST /config:
1. validates inputs against schema.
2. updates runtime config and persists to config.local.json.
3. triggers a window recompute if window parameters changed.

### 9.7 Websocket behavior
WS /stream:
1. On connect:
   1. send snapshot message
2. After connect:
   1. send delta messages when refresh loop produces changes
   2. send heartbeat every 2 seconds
3. On disconnect:
   1. remove client from broadcast list
4. Backpressure:
   1. each client has a bounded queue
   2. if queue full, drop oldest delta, keep latest state, and log once per interval

## 10. Frontend implementation details
### 10.1 State model
Frontend state slices:
1. connection
2. config
3. underlying
4. summary
5. rows by strike
6. pinned selection
7. local timeseries cache per pinned contract
8. playback state

Update rules:
1. On snapshot:
   1. replace state with snapshot
2. On delta:
   1. patch only fields included
   2. update timestamps
3. On heartbeat:
   1. update last_heartbeat_ms
   2. update connection health indicator

### 10.2 Layout specification
Top bar:
1. left: symbol QQQ, expiry, connection status light
2. center: spot mid, percent change, last update age
3. right: subscription count, pin risk score, time

Left panel config:
1. window controls:
   1. strikes each side
   2. roll threshold strikes
   3. update interval
2. liquidity gates:
   1. max spread pct
   2. min bid size
   3. min ask size
   4. max stale ms
3. MTC controls:
   1. delta band min
   2. delta band max
4. IV controls:
   1. min fit points
   2. iv imbalance threshold
   3. persistence updates
5. levels:
   1. add level label and price
   2. toggle visibility
   3. save preset

Center ladder:
1. Virtualized table with fixed row height.
2. Column groups:
   1. Calls group
   2. Strike column
   3. Puts group
3. Calls and puts columns:
   1. mid
   2. spread pct
   3. IV
   4. iv residual
   5. delta
   6. gamma
   7. vega
   8. theta
   9. volume
   10. OI
   11. flags icons and MTC badge

Row and cell highlight priorities:
1. If row is MSI, apply MSI background highlight.
2. If cell is MTC, apply bold border and badge.
3. If cell is IV imbalance, apply IV imbalance highlight.
4. If cell is extreme greek, apply extreme highlight.
5. Liquidity failures show muted styling and remove highlights.

Interactions:
1. Clicking strike row pins the row and opens detail drawer.
2. Clicking a contract cell pins that contract specifically.
3. Clicking MTC badge copies contract descriptor string to clipboard.

Right panel:
1. IV curve chart:
   1. scatter points for calls and puts separately
   2. fitted curve line for each
   3. optionally residual color encoding
2. Exposure chart:
   1. bar chart for OI weighted GEX by strike
   2. optional overlay for volume weighted GEX
3. Cards:
   1. MSI top 3 list with strike and wall type
   2. MTC call and put with rationale numbers
   3. pin risk card, net gex band, nearest MSI distance

Detail drawer:
1. Shows pinned contract identity.
2. Shows last 5 to 15 minutes time series for:
   1. mid
   2. IV
   3. iv residual
   4. spread pct
3. Timeseries comes from frontend cache updated from deltas.

### 10.3 Offline playback
Input file format:
1. JSONL where each line is a websocket envelope message, snapshot or delta or heartbeat.
2. Each message contains ts in epoch ms.

Playback behavior:
1. load file
2. build an index by timestamp
3. support play, pause, seek
4. apply messages in order to the same reducers as live mode

## 11. Recording and reproducibility
Recorder mode:
1. Backend writes websocket messages as JSONL to a session file per day.
2. File name format uses date and time, no sensitive info.

Purpose:
1. UI development without live IBKR.
2. Debugging for analytics.
3. Regression tests for patches.

## 12. Testing requirements
### 12.1 Analytics unit tests
Test fixtures include synthetic ladders with known greeks and IV.

Required tests:
1. Mid and spread percent correctness.
2. Liquidity gating correctness.
3. IV curve fit returns null when insufficient points.
4. IV residual stable under small noise.
5. Exposure calculations match formulas.
6. MSI selection stable under noise.
7. MTC never selects illiquid contracts.
8. Persistence logic flags only after threshold.

### 12.2 Backend integration tests
Required tests:
1. Websocket snapshot is sent on connect.
2. Delta messages contain only changed rows.
3. Heartbeat cadence.
4. Config update persists and triggers window recompute.
5. Reconnect logic resubscribes without crashing.

### 12.3 Frontend tests
Required tests:
1. Snapshot render.
2. Delta patch correctness.
3. No flicker at target cadence, manual check plus performance budget.
4. MTC copy action works.
5. Playback mode loads and replays.

## 13. Performance budgets
1. Analytics refresh compute time target: under 50 ms per refresh.
2. Websocket broadcast time target: under 20 ms per refresh.
3. UI render should not re render the full ladder per update. Only affected rows should rerender.
4. Subscription count must remain under soft limit.

## 14. Deliverables and acceptance criteria
Backend acceptance:
1. Stable run for 60 minutes.
2. Subscription count never exceeds soft limit.
3. Window rolls correctly when spot moves.
4. Snapshot and delta messages validate against schema.
5. No sensitive logging.

Analytics acceptance:
1. No crashes on missing data.
2. MSI top 3 stable under typical quote noise.
3. MTC always respects liquidity and delta band.
4. IV imbalance highlights only when persistent.

Frontend acceptance:
1. Ladder usable and readable at 500 ms updates.
2. Highlights match backend flags.
3. Pinned drawer updates and shows a rolling time series.
4. Playback mode works with recorded sessions.

## 15. Roles and subagent boundaries
### 15.1 Subagent A, Backend and IBKR data
Owns:
1. IBKR connection, chain retrieval, contract qualification.
2. Window manager and subscriptions.
3. Tick ingestion and raw state updates.
4. FastAPI REST and websocket.
5. Recorder.

Does not own:
1. IV fitting logic details
2. MSI and MTC logic details beyond calling analytics module

### 15.2 Subagent B, Analytics and scoring
Owns:
1. All pure functions for derived metrics.
2. IV fit and residuals.
3. Exposure computations.
4. MSI and MTC selection and rationales.
5. Unit tests for analytics.

Does not own:
1. IBKR connection code
2. UI code

### 15.3 Subagent C, Frontend UI
Owns:
1. UI layout and rendering.
2. Websocket client and patch application.
3. Highlight rules matching backend flags.
4. Playback tooling.

Does not own:
1. analytics formulas
2. backend subscription management

## 16. Message contract references
See:
1. openapi.json for REST
2. websocket_schema.json for websocket envelopes and payloads
3. types.ts for shared TypeScript types

End of SPEC.md
