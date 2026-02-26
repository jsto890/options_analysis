# OptionsAnalysis Desktop Runbook (macOS Unsigned v1)

## Build `OptionsAnalysis.app`

1. Ensure TWS/Gateway is installed and API access is enabled.
2. Build/package:

```bash
./desktop/scripts/build_mac_app.sh
```

The script creates/uses an isolated build venv at `.venv-desktop-build/`.

3. Output artifact:
   - `dist/OptionsAnalysis.app`

## Launch

1. Start TWS/Gateway manually.
2. Open `dist/OptionsAnalysis.app` from Finder.
3. App auto-starts local backend and loads UI in native window.

## Smoke Check (No GUI)

```bash
./desktop/scripts/smoke_desktop_runtime.sh
```

## Desktop Settings Behavior

- Default mode is live.
- Change mode/client-id in the app's Desktop settings section.
- Save response returns `restart_required=true`.
- Restart the app to apply transport changes.
- Gateway defaults used for desktop settings:
  - paper port `4002`
  - live port `4001`

## Common Troubleshooting

### Client ID already in use

- Pick a different client ID in Desktop settings.
- Save and restart app.

### Paper port unavailable

- Verify TWS/Gateway paper API port (`4002`) is open.
- If only live port is open, switch mode to live and restart.

### No IBKR connection found

- Desktop runtime retries connect attempts every 10 seconds by default.

### Frontend bundle missing

- Rebuild frontend and package again:
  - `./desktop/scripts/build_mac_app.sh`
