# filename: backend_skeleton_notes.py
# This is not full code. It is the exact control flow that Subagent A should implement.

# 1. Startup
# 1.1 Load config.default.json
# 1.2 Overlay config.local.json if present
# 1.3 Overlay env vars for host and port
# 1.4 Start FastAPI
# 1.5 Start ib_insync connection task
# 1.6 Start analytics refresh timer task
# 1.7 Start heartbeat broadcaster task

# 2. ib_insync connection task
# 2.1 Connect to IBKR using host, port, client id
# 2.2 Qualify QQQ stock contract
# 2.3 Request option chain params and strikes for QQQ
# 2.4 Determine todays expiry string
# 2.5 Subscribe to underlying market data
# 2.6 Build strike window around ATM
# 2.7 Qualify option contracts in window
# 2.8 Subscribe to options with generic ticks for volume and OI and option computations
# 2.9 Register tick callbacks that update OptionContractState and last_update_ms

# 3. Analytics refresh task
# 3.1 Every update_interval_ms:
# 3.1.1 Read underlying spot mid
# 3.1.2 Compute ATM index, roll window if needed
# 3.1.3 Build normalized ladder input structure
# 3.1.4 Call analytics module to compute derived fields
# 3.1.5 Update store and version counters using epsilons
# 3.1.6 Build delta patch and broadcast to clients

# 4. Websocket broadcast
# 4.1 On connect:
# 4.1.1 Send snapshot envelope
# 4.2 On delta:
# 4.2.1 Send delta envelope if any rows or summary changed
# 4.3 On heartbeat:
# 4.3.1 Send heartbeat envelope every 2000 ms

# 5. Window rolling rules
# 5.1 Cancel removed contracts first
# 5.2 Subscribe new contracts in small batches
# 5.3 Ensure subscription count below soft limit
# 5.4 Log if soft limit would be exceeded and clamp window size