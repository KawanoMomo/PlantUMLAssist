# -*- coding: utf-8 -*-
"""exe の「詳細」タブに出す製品名・バージョン・説明 (BLK-human-20260915-1202)。

バージョンは手で書かない。次の順に見て最初に取れたものを使う:

  1. 環境変数 ``APP_VERSION`` (CI がタグから渡す)
  2. ``git describe --tags --abbrev=0`` (手元のビルド)
  3. ``package.json`` の ``version`` (git が無い場所での最後の砦)

PyInstaller の ``version=`` に渡す版情報ファイルを ``write_version_file()`` が書く。
"""
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

COMPANY = 'PlantUMLAssist'
PRODUCT = 'PlantUMLAssist'
DESCRIPTION = 'PlantUML をローカルで GUI 編集する UML エディタ'
COPYRIGHT = 'MIT License'


def _from_git():
    try:
        out = subprocess.run(
            ['git', 'describe', '--tags', '--abbrev=0'],
            cwd=ROOT, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ''
    return out.stdout.strip() if out.returncode == 0 else ''


def _from_package_json():
    try:
        with open(os.path.join(ROOT, 'package.json'), encoding='utf-8') as f:
            return str(json.load(f).get('version') or '')
    except (OSError, ValueError):
        return ''


def resolve_version():
    """表示用のバージョン文字列 ('2.3' など)。取れなければ '0.0.0'。"""
    for raw in (os.environ.get('APP_VERSION', ''), _from_git(), _from_package_json()):
        raw = (raw or '').strip()
        if raw:
            return re.sub(r'^v', '', raw)
    return '0.0.0'


def version_tuple(version):
    """'2.3' → (2, 3, 0, 0)。Windows の版情報は 4 つの整数しか受け付けない。"""
    nums = [int(n) for n in re.findall(r'\d+', version)[:4]]
    while len(nums) < 4:
        nums.append(0)
    return tuple(nums)


def version_file_text(version=None):
    version = version or resolve_version()
    t = version_tuple(version)
    return u"""VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=%(t)s, prodvers=%(t)s,
    mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        u'041104b0',
        [StringStruct(u'CompanyName', u'%(company)s'),
         StringStruct(u'FileDescription', u'%(desc)s'),
         StringStruct(u'FileVersion', u'%(v)s'),
         StringStruct(u'InternalName', u'%(product)s'),
         StringStruct(u'LegalCopyright', u'%(copy)s'),
         StringStruct(u'OriginalFilename', u'%(product)s.exe'),
         StringStruct(u'ProductName', u'%(product)s'),
         StringStruct(u'ProductVersion', u'%(v)s')])
    ]),
    VarFileInfo([VarStruct(u'Translation', [0x0411, 1200])])
  ]
)
""" % {'t': t, 'company': COMPANY, 'desc': DESCRIPTION, 'product': PRODUCT,
       'copy': COPYRIGHT, 'v': version}


def write_version_file(dest=None):
    """版情報ファイルを書き、そのパスを返す。既定は packaging/version_info.txt。"""
    dest = dest or os.path.join(HERE, 'version_info.txt')
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(version_file_text())
    return dest


# BLK-human-20260916-0902: 画面 (設定 → 情報) に出す版・コミット・日付。
# exe には git が無いので、ビルド時にここで src/version.json を書いて同梱する。
# ブラウザ起動 (server.py) は同じ形を git から直接作る。
def _git(args):
    try:
        out = subprocess.run(['git'] + args, cwd=ROOT, capture_output=True,
                             text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ''
    return out.stdout.strip() if out.returncode == 0 else ''


def build_info():
    """{'version': 'v2.8', 'commit': 'efe1cbf', 'date': '2026-09-16'}"""
    sha = os.environ.get('GITHUB_SHA', '')[:7] or _git(['rev-parse', '--short', 'HEAD'])
    return {
        'version': 'v' + resolve_version(),
        'commit': sha,
        'date': _git(['log', '-1', '--format=%cs']),
    }


def write_build_info_json(dest):
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(build_info(), f, ensure_ascii=False)
    return dest

if __name__ == '__main__':
    print(write_version_file())
