# Desktop

Native macOS wrapper that launches the local backend and serves the bundled frontend in a desktop window.

## Local Run (from source)

```bash
python3 desktop/main.py
```

## Build macOS App

```bash
./desktop/scripts/build_mac_app.sh
```

Output artifact:

- `dist/OptionsAnalysis.app`

## Smoke Check

```bash
./desktop/scripts/smoke_desktop_runtime.sh
```

For operational details, see [Desktop runbook](../documents/DESKTOP_APP_RUNBOOK.md).
