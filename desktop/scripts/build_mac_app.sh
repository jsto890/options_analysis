#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$ROOT_DIR/.venv-desktop-build"

echo "[desktop-build] Building frontend bundle..."
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "[desktop-build] Installing Python dependencies..."
cd "$ROOT_DIR"
if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt -r desktop/requirements.txt

ICON_PATH="$ROOT_DIR/desktop/assets/OptionsAnalysis.icns"

echo "[desktop-build] Packaging OptionsAnalysis.app..."
if [[ -f "$ICON_PATH" ]]; then
  pyinstaller \
    --noconfirm \
    --windowed \
    --name OptionsAnalysis \
    --osx-bundle-identifier com.optionsanalysis.local \
    --paths "$ROOT_DIR/backend" \
    --paths "$ROOT_DIR/desktop" \
    --add-data "$ROOT_DIR/frontend/dist:frontend/dist" \
    --add-data "$ROOT_DIR/documents/config.default.json:documents" \
    --icon "$ICON_PATH" \
    "$ROOT_DIR/desktop/main.py"
else
  pyinstaller \
    --noconfirm \
    --windowed \
    --name OptionsAnalysis \
    --osx-bundle-identifier com.optionsanalysis.local \
    --paths "$ROOT_DIR/backend" \
    --paths "$ROOT_DIR/desktop" \
    --add-data "$ROOT_DIR/frontend/dist:frontend/dist" \
    --add-data "$ROOT_DIR/documents/config.default.json:documents" \
    "$ROOT_DIR/desktop/main.py"
fi

deactivate
echo "[desktop-build] Build complete: $ROOT_DIR/dist/OptionsAnalysis.app"
