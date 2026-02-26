# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['/Users/josephstorey/OptionsAnalysis/desktop/main.py'],
    pathex=['/Users/josephstorey/OptionsAnalysis/backend', '/Users/josephstorey/OptionsAnalysis/desktop'],
    binaries=[],
    datas=[('/Users/josephstorey/OptionsAnalysis/frontend/dist', 'frontend/dist'), ('/Users/josephstorey/OptionsAnalysis/documents/config.default.json', 'documents')],
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
    icon=None,
    bundle_identifier='com.optionsanalysis.local',
)
