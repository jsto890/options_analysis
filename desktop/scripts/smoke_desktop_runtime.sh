#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[desktop-smoke] Running desktop runtime smoke check..."
python3 desktop/main.py --smoke
echo "[desktop-smoke] OK"
