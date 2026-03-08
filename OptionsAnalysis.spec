# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

ROOT = Path(__file__).resolve().parent

a = Analysis(
    [str(ROOT / "desktop" / "main.py")],
    pathex=[str(ROOT / "backend"), str(ROOT / "desktop")],
    binaries=[],
    datas=[
        (str(ROOT / "frontend" / "dist"), "frontend/dist"),
        (str(ROOT / "documents" / "config.default.json"), "documents"),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='OptionsAnalysis',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[str(ROOT / "desktop" / "assets" / "OptionsAnalysis.icns")],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='OptionsAnalysis',
)
app = BUNDLE(
    coll,
    name='OptionsAnalysis.app',
    icon=str(ROOT / "desktop" / "assets" / "OptionsAnalysis.icns"),
    bundle_identifier='com.optionsanalysis.local',
)
