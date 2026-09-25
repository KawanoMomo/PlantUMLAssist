# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — PlantUMLAssist の Windows アプリ (BLK-human-20260909-2200)
#
#   pyinstaller packaging/PlantUMLAssist.spec --noconfirm
#
# 同梱するのは画面 (plantuml-assist.html / src / docs) と server.py が要る補助物だけ。
# plantuml.jar は同梱しない (ライセンスと 29MB)。Java も同梱しない。
# どちらも初回起動時に設定 → レンダリングから入れる。
import os
import sys

# spec からの相対パスは spec の置き場所 (packaging/) を起点に解決されるので、
# リポジトリ直下を明示して絶対パスで渡す (どこから叩いても同じものが入る)。
ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))


def at(rel):
    return os.path.join(ROOT, rel.replace('/', os.sep))


# アイコンと版情報 (BLK-human-20260915-1202)。ico は packaging/icon.svg から
# node tools/make-icon.js で起こしたもの。版情報はここで書き出すので手入力しない。
sys.path.insert(0, os.path.join(ROOT, 'packaging'))
import version_info  # noqa: E402

ICON = at('packaging/icon.ico')
VERSION_FILE = version_info.write_version_file(
    os.path.join(workpath, 'version_info.txt'))
# 設定 → 情報 に出す版 (BLK-human-20260916-0902)。exe には git が無いので焼き込む。
BUILD_INFO = version_info.write_build_info_json(os.path.join(workpath, 'version.json'))

datas = [
    (at('plantuml-assist.html'), '.'),
    (at('server.py'), '.'),
    (at('src'), 'src'),
    (BUILD_INFO, 'src'),
    (at('lib/PlantUMLDaemon.java'), 'lib'),
    (at('lib/fetch-plantuml.ps1'), 'lib'),
    (at('lib/PLANTUML_VERSION'), 'lib'),
    (at('docs'), 'docs'),
    (at('packaging/icon.ico'), 'packaging'),
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
    icon=ICON,
    version=VERSION_FILE,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='PlantUMLAssist',
)
