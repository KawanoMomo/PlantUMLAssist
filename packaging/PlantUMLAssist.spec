# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — PlantUMLAssist の Windows アプリ (BLK-human-20260909-2200)
#
#   pyinstaller packaging/PlantUMLAssist.spec --noconfirm
#
# 同梱するのは画面 (plantuml-assist.html / src / docs) と server.py が要る補助物だけ。
# plantuml.jar は同梱しない (ライセンスと 29MB)。Java も同梱しない。
# どちらも初回起動時に設定 → レンダリングから入れる。
import os

# spec からの相対パスは spec の置き場所 (packaging/) を起点に解決されるので、
# リポジトリ直下を明示して絶対パスで渡す (どこから叩いても同じものが入る)。
ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))


def at(rel):
    return os.path.join(ROOT, rel.replace('/', os.sep))

datas = [
    (at('plantuml-assist.html'), '.'),
    (at('server.py'), '.'),
    (at('src'), 'src'),
    (at('lib/PlantUMLDaemon.java'), 'lib'),
    (at('lib/fetch-plantuml.ps1'), 'lib'),
    (at('docs'), 'docs'),
    (at('README.md'), '.'),
    (at('LICENSE'), '.'),
]

a = Analysis(
    [at('app.py')],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=['server'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter'],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PlantUMLAssist',
    debug=False,
    strip=False,
    upx=False,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='PlantUMLAssist',
)
