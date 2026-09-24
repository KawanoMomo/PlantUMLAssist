#!/usr/bin/env python3
"""PlantUMLAssist dev server.
Serves static files + /render endpoint for PlantUML local/online rendering.
"""
import atexit
import base64
import binascii
import collections
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# BLK-human-20260909-2200: 配布先には Python も PlantUML も無い。exe 化 (PyInstaller)
# すると `__file__` は展開先の一時フォルダ (sys._MEIPASS) を指し、そこは再起動で消え
# 書き込みも失われる。読むもの (html / src / lib) と書くもの (設定・autosave) を分ける。
FROZEN = bool(getattr(sys, 'frozen', False))
ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))


def _data_root():
    """設定と autosave を置く、再起動しても残る場所。"""
    if not FROZEN:
        return Path(__file__).parent
    base = os.environ.get('APPDATA') or str(Path.home())
    d = Path(base) / 'PlantUMLAssist'
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        return Path(base)
    return d


DATA_ROOT = _data_root()
# 同梱しない約束の jar の、同梱していた頃からの置き場所 (Web 版はここに置けば設定不要)。
DEFAULT_JAR_PATH = ROOT / 'lib' / 'plantuml.jar'
DAEMON_SRC = ROOT / 'lib' / 'PlantUMLDaemon.java'
FETCH_SCRIPT = ROOT / 'lib' / 'fetch-plantuml.ps1'
# Java も同梱しない。無いときに案内する公式配布元。
JAVA_DOWNLOAD_URL = 'https://adoptium.net/temurin/releases/'
PORT = int(os.environ.get('PUA_PORT', '8766'))
AUTOSAVE_DEFAULT_DIR = DATA_ROOT / 'autosave'

# app.py (pywebview 版) が差し込むネイティブのファイルダイアログ。
# Web 版では None のままで、保存はブラウザのダウンロードに落ちる。
NATIVE_DIALOG = None
# BLK-junior-20260907-0843: 保存先ディレクトリは localStorage にしか無く、
# 新しいタブ・別プロファイルで開くたびに既定へ戻るため、図種を変えるたびに
# ⚙設定 → ファイル → パス再入力 → OK を打ち直すことになっていた。
# 保存先はブラウザではなくこのマシンの設定なので、server 側の 1 ファイルに置く。
PREFS_PATH = DATA_ROOT / '.assist-prefs.json'
# jarPath: plantuml.jar を同梱しないので、利用者が選んだ場所をこの機械の設定として覚える。
PREFS_KEYS = ('backend', 'fileDir', 'jarPath')
# BLK-junior-20260907-1203: 図の名前はそのままファイル名 ({name}.puml) になる。
# 以前は [A-Za-z0-9_-]+ しか通さず、「GPIOドライバユースケース」のような日本語名の図が
# 保存フォルダから読めず、保存も 400 になって黙って download に落ちていた。
# ファイル名として危ないものだけを弾き、日本語はそのまま通す。
# src/core/workspace.js の isValidName と同じ規則。片方だけ変えないこと。
AUTOSAVE_UNSAFE_CHARS = set('<>:"|?*/' + chr(92)) | {chr(c) for c in range(32)}
AUTOSAVE_RESERVED = ({'con', 'prn', 'aux', 'nul'}
                     | {'com%d' % i for i in range(1, 10)}
                     | {'lpt%d' % i for i in range(1, 10)})


# BLK-human-20260917-0901: 手元の .puml を開いて、元のファイルへ書き戻す。
# 文字コード (UTF-8 BOM / UTF-8 / Shift_JIS) と改行は開いたときのまま保つ
# (改行は呼ぶ側が戻した text をそのまま書く。ここでは translate しない)。
OPEN_FILE_EXTS = ('.puml', '.plantuml', '.uml', '.txt')
OPEN_FILE_TYPES = ('PlantUML (*.puml;*.plantuml;*.uml;*.txt)', 'All files (*.*)')


def decode_source_bytes(blob):
    """バイト列を (text, encoding, bom, eol) に読む。text の改行は LF に揃える。"""
    bom = blob.startswith(b'\xef\xbb\xbf')
    if bom:
        raw, enc = blob[3:].decode('utf-8', 'replace'), 'utf-8'
    else:
        try:
            raw, enc = blob.decode('utf-8'), 'utf-8'
        except UnicodeDecodeError:
            raw, enc = blob.decode('cp932', 'replace'), 'shift_jis'
    crlf = raw.count('\r\n')
    lf = raw.count('\n') - crlf
    eol = 'crlf' if crlf and crlf >= lf else 'lf'
    return raw.replace('\r\n', '\n'), enc, bom, eol


def read_source_file(path):
    p = Path(str(path))
    if p.suffix.lower() not in OPEN_FILE_EXTS:
        raise ValueError('開けるのは .puml / .plantuml / .uml / .txt です')
    text, enc, bom, eol = decode_source_bytes(p.read_bytes())
    return {'path': str(p), 'name': p.name, 'text': text, 'encoding': enc, 'bom': bom, 'eol': eol}


def write_source_file(path, text, encoding, bom):
    """(ok, path or error)。既にある .puml 類にだけ書く (新しい場所へ複製しない)。"""
    if not isinstance(path, str) or not path.strip():
        return False, 'path が必要です'
    p = Path(path)
    if p.suffix.lower() not in OPEN_FILE_EXTS:
        return False, '書き戻せるのは .puml / .plantuml / .uml / .txt です'
    if not p.is_file():
        return False, f'元のファイルが見つかりません: {p}'
    text = '' if text is None else str(text)
    codec = 'cp932' if str(encoding or '').lower() in ('shift_jis', 'sjis', 'cp932') else 'utf-8'
    try:
        blob = text.encode(codec)
    except UnicodeEncodeError as exc:
        return False, f'Shift_JIS で書けない文字があります: {text[exc.start:exc.end]!r}'
    if codec == 'utf-8' and bom:
        blob = b'\xef\xbb\xbf' + blob
    try:
        p.write_bytes(blob)
    except OSError as exc:
        return False, f'書けません: {exc}'
    return True, str(p)


def _version_hash(text):
    """版の中身の一致を見るための sha1 (改行コード・行末の空白・末尾の空行は無視)。"""
    t = str(text or '').replace('\r\n', '\n').replace('\r', '\n')
    t = '\n'.join(line.rstrip(' \t') for line in t.split('\n')).rstrip('\n')
    return hashlib.sha1(t.encode('utf-8')).hexdigest()


def _version_head(text):
    """版の中身から「何の図だったか」を 1 行で言う。

    `@startuml` の次にある最初の中身の行 (コメントと空行は飛ばす) を返す。
    state / participant / class のような宣言がここに出るので、同じ名前で
    上書きされた別図種の版でも、開く前に見分けられる。
    """
    for line in str(text or '').splitlines():
        s = line.strip()
        if not s or s.startswith("'") or s.startswith('@start') or s.startswith('@end'):
            continue
        return s[:80]
    return ''


def is_safe_autosave_name(name):
    """True if `name` can be used as a bare filename stem (Japanese included)."""
    if not name or not isinstance(name, str):
        return False
    if name != name.strip(' .'):
        return False
    if name.lower() in AUTOSAVE_RESERVED:
        return False
    return not any(ch in AUTOSAVE_UNSAFE_CHARS for ch in name)


# --- 図種で保存先を分ける (BLK-junior-20260908-2003) -------------------------
#
# 保存は「図の名前 = ファイル名」なので、名前を既定の diagram1 のままにして
# 図種だけ変えて周を重ねると、前の周に完走した図が次の周の保存で消える。
# 控え (_versions) は消えた中身を救うが、「自分の状態遷移図を開く」ときに
# 版を探させる時点で手順が増える。図種が変わる保存は上書きではなく
# `{名前}_{図種}` へ回し、図種ごとに 1 枚ずつ残す。
DIAGRAM_KIND_PATTERNS = [
    ('state', re.compile(r'^(state\b|\[\*\]\s*-->)', re.I)),
    ('sequence', re.compile(r'^(participant|actor|boundary|control|entity|database|collections|queue)\b', re.I)),
    ('class', re.compile(r'^(class|interface|abstract|enum)\b', re.I)),
    ('usecase', re.compile(r'^(usecase|rectangle)\b|^:.*:\s+as\b', re.I)),
    ('component', re.compile(r'^component\b|^\[.+\]\s*(as\b|$)', re.I)),
    ('activity', re.compile(r'^(start\b|if\s*\()|^:.*;$', re.I)),
]
DIAGRAM_KIND_SLUGS = [slug for slug, _ in DIAGRAM_KIND_PATTERNS]
# 図の中身ではない行。ここで止めずに読み飛ばして、最初に図種の分かる行を採る。
KIND_SKIP_RE = re.compile(
    r"^(@\w|'|/'|title\b|header\b|footer\b|caption\b|legend\b|end\s|skinparam\b|!|hide\b|show\b|"
    r"scale\b|autonumber\b|allow_mixing\b|left to right\b|top to bottom\b)", re.I)


def dsl_kind(text):
    """DSL の本文から図種の slug を当てる。当てられなければ ''。

    当てられない図には手を出さない (分からないまま別名に回す方が危ない)。
    """
    if not isinstance(text, str):
        return ''
    for line in text.splitlines():
        s = line.strip()
        if not s or KIND_SKIP_RE.match(s):
            continue
        for slug, pat in DIAGRAM_KIND_PATTERNS:
            if pat.match(s):
                return slug
    return ''


def kind_base_name(name):
    """`diagram1_state` → `diagram1`。図種で分けた名前をもう一度分けない。"""
    for slug in DIAGRAM_KIND_SLUGS:
        tail = '_' + slug
        if name.endswith(tail) and len(name) > len(tail):
            return name[:-len(tail)]
    return name


# Windows: suppress the console window that otherwise flashes every time
# we spawn java (once per /render call). No-op on other platforms.
_SUBPROCESS_KWARGS = {}
if sys.platform == 'win32':
    _SUBPROCESS_KWARGS['creationflags'] = subprocess.CREATE_NO_WINDOW
# Seconds of heartbeat silence before the server shuts itself down.
# Browser client POSTs /heartbeat every ~5s; if the tab is closed the
# pings stop and the watchdog terminates the server automatically.
IDLE_SHUTDOWN_SEC = 300
# BLK-human-20260924-0900: ハーネスや E2E が起こした server は、ブラウザを閉じても落とさない。
# ページを閉じるたびに届く POST /shutdown で約 2 秒後に落ち、空いたポートを別の server が
# 取って他人の作業木を測る事故が起きていた。ただし起こした側が片付けずに死ぬと残り続けるので、
# 無音で落ちる安全弁は 3 時間に延ばして残す (ループが .running を残骸とみなす時間と同じ)。
# Windows アプリ (app.py) は設定しないので今までどおり止まる。
NO_IDLE_EXIT = os.environ.get('PUA_NO_IDLE_EXIT') == '1'
NO_IDLE_EXIT_SEC = 3 * 60 * 60
# BLK-reviewer-20260908-1203-wish: 食い違いの中身を言うために /verify-svg に添える材料の上限。
# puml は数 KB、text 要素は 1 枚の図で数十〜数百なので、この上限に当たるのは
# 図でない何かを掴んだときだけ。当たっても応答が肥らないようにするための蓋。
MAX_DIFF_PUML_CHARS = 65536
MAX_DIFF_LABELS = 2000
# BLK-reviewer-20260914-2106-wish: 可視差分プレビューに渡す SVG 本体の上限。
# 1 枚だけを確かめるときにしか添えない (withSvg) ので、実データの 1 枚ぶん
# (数十〜数百 KB) が収まれば足りる。超える図は添えずに理由を返す。
MAX_VISUAL_SVG_BYTES = 2 * 1024 * 1024

_state_lock = threading.Lock()
_last_heartbeat = time.time()
_shutdown_started = False

# BLK-builder-20260908-0744-2-red: the server answers requests on one thread per
# connection (ThreadingHTTPServer), so two clients can now be inside a handler at
# the same time. Everything the handlers write to disk -- prefs, autosave DSL /
# SVG, file-roles -- is read-modify-write on a shared file, so it is serialised
# here. Renders are already serialised by _daemon_lock.
_fs_lock = threading.Lock()


def read_prefs():
    """Saved-on-this-machine preferences. Missing/broken file → empty dict."""
    try:
        # BOM 付きで書かれた設定ファイル (PowerShell の Out-File など) も読む。
        # 読めないと jarPath を見失い、jar があるのに「無い」と言うことになる。
        data = json.loads(PREFS_PATH.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: data[k] for k in PREFS_KEYS if isinstance(data.get(k), str) and data[k]}


def write_prefs(partial):
    """Merge the given keys into the prefs file and return the stored result."""
    merged = read_prefs()
    for k in PREFS_KEYS:
        if k in partial:
            v = partial[k]
            if isinstance(v, str) and v:
                merged[k] = v
            else:
                merged.pop(k, None)
    try:
        PREFS_PATH.write_text(json.dumps(merged, ensure_ascii=False), encoding='utf-8')
    except OSError:
        pass
    return merged


# BLK-human-20260909-2200: jar は同梱しないので、どこにあるかは利用者しか知らない。
# 設定 (`.assist-prefs.json` の jarPath) を正とし、無ければ従来の lib/plantuml.jar。
def jar_path():
    """実際に描画に使う plantuml.jar のパス (存在は保証しない)。"""
    p = read_prefs().get('jarPath')
    if p:
        return Path(p)
    return DEFAULT_JAR_PATH


def use_jar(path):
    """jar のパスを設定に書き、走っている daemon を捨てる (古い jar を掴み続けるため)。

    返り値は (ok, message)。存在しないファイルは受け取らない。
    """
    p = Path(str(path or '').strip('"'))
    if not str(p).strip():
        return False, 'パスが空です'
    if not p.is_file():
        return False, f'ファイルがありません: {p}'
    if p.suffix.lower() != '.jar':
        return False, f'.jar ではありません: {p.name}'
    write_prefs({'jarPath': str(p)})
    _shutdown_daemon()
    global _daemon_disabled, _env_cache
    with _daemon_lock:
        _daemon_disabled = False
    with _env_lock:
        _env_cache = None
    return True, str(p)


# BLK-reviewer-20260907-0043: /render のリクエスト仕様がどこにも書いておらず、
# `{"dsl": ...}` を投げると text='' として描画され、PlantUML の
# "No valid @start/@end found" というエラー画が 200 で返って成功と誤認できた。
# curl から使う人がこの 1 つの窓口だけを見て分かるよう、
#   - GET /render は仕様そのものを返す
#   - POST /render は要求の形が違えば 400 で「何を期待しているか」を言う
#   - PlantUML のエラー画は 200 ではなく 422 で返す
# の 3 点を server 側で保証する。
#
# 差し戻し (同じ手順が 3 回繰り返された): 400 で名指ししても、呼ぶ側が
# 「POST の前に GET /render を読む」を手順に組み込まないかぎり、毎回
# `{"dsl": ...}` → 400 → 直す、の往復が起きる。仕様を先に読ませることに
# 頼るのをやめ、DSL の入れ物としてよく使われる名前 (dsl / source / uml /
# puml / diagram) を text の別名として受理して 1 回目の POST を成功させる。
# 誤りを黙って呑むわけではなく、レスポンスヘッダ X-PlantUMLAssist-Warning と
# GET /render の 'aliases' で「正式な名前は text」であることを毎回伝える。
DSL_FIELD_ALIASES = ('dsl', 'source', 'uml', 'puml', 'diagram')

# POST /render の 200 に必ず付ける注記。ヘッダ値は ASCII しか通らないので英語で書く。
# 「保存中の svg とこの応答をバイト比較する」使い方を、応答の側で止めるためのもの。
SVG_STAMP_HEADER = ('none; saved {name}.svg ends with <!-- @pua-source-sha1 ... --> '
                    'which this response never carries, so byte-comparing them always differs. '
                    'Compare GET /autosave entry.svgSource with entry.hash instead, '
                    'or POST /verify-svg to re-render and compare contents')

RENDER_API_DOC = {
    'endpoint': 'POST /render',
    'request': {
        'content-type': 'application/json',
        'fields': {
            'text': "必須。PlantUML の DSL 全文 (@startuml … @enduml)",
            'mode': "任意。'local' (既定、同梱 Java) または 'online' (plantuml.com へ送信)",
            'withSvg': ("任意。true にすると、保存中の svg (印を外したもの) と描き直した svg の"
                        "本文そのものを savedSvg / drawnSvg として返す。可視差分プレビュー用。"
                        "応答が重いので types が 1 件のときだけ効く"),
        },
        'aliases': {
            'fields': list(DSL_FIELD_ALIASES),
            'note': ("text の別名として上記も受理する (1 回目の POST を失敗させないため)。"
                     '別名で送ると 200 と同時に X-PlantUMLAssist-Warning ヘッダが付く。'
                     '正式な名前は text'),
        },
    },
    # BLK-reviewer-20260908-0103 (1403 追記): 「保存中の svg が今の puml から作られたか」を
    # curl で確かめようとして、この応答と保存中の svg をバイト比較した run があった。
    # 保存する svg にだけ末尾へ `<!-- @pua-source-sha1 ... -->` を刻むので、内容が
    # 完全に一致していてもバイト比較は必ず不一致になる (実データ 17 枚が全滅に見えた)。
    # 応答の説明とヘッダの両方でそれを言う — 応答だけを見て使う人に届くように。
    'comparison': {
        'note': ('この応答には @pua-source-sha1 の印が付かない。保存された {name}.svg には'
                 '末尾に印があるため、生のバイト比較は内容が同じでも必ず食い違う'),
        'how': ('保存中の svg が今の puml から作られたかは、GET /autosave の entry の'
                'svgSource (svg に刻まれた印) と hash (今の puml の sha1) を比べる。'
                '印が無い svg は POST /verify-svg が描き直して中身で確かめる'),
        'header': 'X-PlantUMLAssist-Svg-Stamp',
        # BLK-reviewer-20260908-0103 (1903 追記): POST /verify-svg の status は
        # 生バイト比較そのものではない。何を意味するかをここで言う。
        'verifyStatus': {
            'match': 'バイトまで一致した',
            'differ-format': ('描かれる中身 (文字・図形の数) は一致し、体裁'
                              '(ヘッダ属性・XML 宣言の書式) だけが違う。作り直さなくても読める'),
            'differ-content': '描かれるものが違う。作り直しが要る',
            'missing': 'svg が無い',
            'error': '描けなかった (判定していない)',
        },
    },
    'response': {
        '200': ('image/svg+xml — 描画された SVG。X-PlantUMLAssist-Svg-Stamp ヘッダで'
                '「この応答に印は付かない」ことを伝える (comparison を参照)'),
        '400': "application/json {error} — text (と別名) が無い / 文字列でない / 空",
        '422': "application/json {error, line} — DSL の文法エラー (PlantUML のエラー画)",
        '500': 'application/json {error} — 描画そのものの失敗',
    },
    'example': (
        'curl -sS -X POST http://127.0.0.1:%d/render '
        '-H "Content-Type: application/json" '
        """-d '{"text": "@startuml\\nA -> B\\n@enduml", "mode": "local"}'"""
    ) % PORT,
}

# BLK-reviewer-20260909-0403: POST /verify-svg の要求の形が呼び出し側 (src/app.js) に
# しか無く、curl / node から叩く人は `{puml, svg}` を渡して 400 を 2 回踏み、
# src/app.js を grep してようやく `{dir, types, mode}` に辿り着いていた。毎 tick 同じ
# 調べ直しが起きるので、/render と同じく「窓口自身が仕様を返す」形にする:
#   - GET /verify-svg は仕様そのものを返す
#   - POST /verify-svg の 400 には expected と example を必ず添える
#   - GET /api は全エンドポイントの索引を返す (どこから読み始めるかを迷わせない)
VERIFY_SVG_API_DOC = {
    'endpoint': 'POST /verify-svg',
    'summary': ('保存フォルダの {name}.svg が、今の {name}.puml を描いた結果そのものかを'
                '1 枚ずつ描き直して中身で確かめる。puml と svg は server が dir から読むので'
                '本文には渡さない'),
    'request': {
        'content-type': 'application/json',
        'fields': {
            'types': "必須。確かめる図の名前 (拡張子なし) の配列。1〜200 件",
            'dir': "任意。保存フォルダ。省略すると既定の保存フォルダ",
            'mode': "任意。'local' (既定、同梱 Java) または 'online' (plantuml.com へ送信)",
        },
        'note': ('puml / svg そのものは受け取らない (dir と types から server が読む)。'
                 '1 枚あたり数百 ms かかるので、確かめる図は呼ぶ側が絞って渡す'),
    },
    'response': {
        '200': ('application/json {ok, results: {<name>: {status, ...}}, verified} — '
                'status は match / differ-format / differ-content / missing / error'),
        '400': "application/json {error, expected, example} — types が無い / 201 件以上 / mode が不正",
    },
    'status': RENDER_API_DOC['comparison']['verifyStatus'],
    'example': (
        'curl -sS -X POST http://127.0.0.1:%d/verify-svg '
        '-H "Content-Type: application/json" '
        """-d '{"dir": "E:/01_Loop/persona-data/primary", "types": ["spi_init_sequence"], "mode": "local"}'"""
    ) % PORT,
}

# 400 に必ず添える「何を期待しているか」。呼ぶ側が 1 回目の失敗で形を直せるようにする。
VERIFY_SVG_EXPECTED = {
    'fields': VERIFY_SVG_API_DOC['request']['fields'],
    'doc': 'GET /verify-svg',
    'example': VERIFY_SVG_API_DOC['example'],
    # BLK-reviewer-20260914-1606: 日本語の説明は端末が cp932 だと化けて読めない。
    # **化けた応答をそのまま読んでも形が分かる**ように、同じ内容を ASCII でも併記する
    # (読み直しの打鍵をゼロにする。文字コードを選ぶ逃げ道は二の矢)。
    'fieldsAscii': {
        'types': "required. array of diagram names without extension, 1 to 200",
        'dir': "optional. save folder, full path. default: the default save folder",
        'mode': "optional. 'local' (default, bundled Java) or 'online' (sends to plantuml.com)",
    },
    'charset': "garbled? add ?charset=ascii to the URL (or send Accept-Charset: shift_jis)",
}

# BLK-reviewer-20260914-1606: 応答本文は常に utf-8 で返しているが、cp932 のコンソールから
# curl / python で叩くと端末の側で日本語が化け、fields の説明も example も読めないまま
# server.py を grep し直すことになっていた。どの文字コードで受け取るかを呼ぶ側が選べるようにする
# (既定は今までどおり utf-8。宣言する charset と実バイト列は必ず一致させる):
#   - `?charset=ascii` / `Accept-Charset: us-ascii` → \uXXXX 逃がしの純 ASCII。端末を問わず化けない
#   - `?charset=cp932` / `Accept-Charset: shift_jis` → cp932。日本語 Windows の端末でそのまま読める
JSON_CHARSETS = {
    '': ('utf-8', 'utf-8'),
    'utf-8': ('utf-8', 'utf-8'),
    'utf8': ('utf-8', 'utf-8'),
    'ascii': ('us-ascii', 'ascii'),
    'us-ascii': ('us-ascii', 'ascii'),
    'cp932': ('Shift_JIS', 'cp932'),
    'ms932': ('Shift_JIS', 'cp932'),
    'sjis': ('Shift_JIS', 'cp932'),
    'shift_jis': ('Shift_JIS', 'cp932'),
    'shift-jis': ('Shift_JIS', 'cp932'),
}

# BLK-human-20260916-0902: 設定 → 情報 に出す版。正本は git tag で、手で書かない。
# exe (git が無い) はビルド時に packaging/version_info.py が書いた src/version.json を読む。
_BUILD_INFO = None


def _git_out(args):
    try:
        out = subprocess.run(['git'] + args, cwd=str(ROOT), capture_output=True,
                             text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ''
    return out.stdout.strip() if out.returncode == 0 else ''


def build_info():
    global _BUILD_INFO
    if _BUILD_INFO is not None:
        return _BUILD_INFO
    info = {'version': '', 'commit': '', 'date': ''}
    baked = ROOT / 'src' / 'version.json'
    if baked.is_file():
        try:
            data = json.loads(baked.read_text(encoding='utf-8'))
            for k in info:
                info[k] = str(data.get(k) or '')
        except (OSError, ValueError):
            pass
    if not info['version']:
        info['version'] = _git_out(['describe', '--tags', '--abbrev=0'])
        info['commit'] = _git_out(['rev-parse', '--short', 'HEAD'])
        info['date'] = _git_out(['log', '-1', '--format=%cs'])
    _BUILD_INFO = info
    return info


# BLK-human-20260917-0900: 設定 → 情報 の「更新を確認」。押されたとき (または利用者が
# 起動時確認を入れたとき) だけ GitHub Releases の latest を 1 回読む。図・DSL・ファイルは送らない。
# 落とさない・実行しない。開けるのはこのリポジトリの GitHub の URL だけ。
UPDATE_REPO_URL = 'https://github.com/KawanoMomo/PlantUMLAssist'
UPDATE_LATEST_API = 'https://api.github.com/repos/KawanoMomo/PlantUMLAssist/releases/latest'


def fetch_latest_release(opener=None):
    """{current, release:{tag_name, html_url, assets:[{name, browser_download_url}]}} か {current, error}。"""
    out = {'current': build_info()}
    try:
        req = urllib.request.Request(UPDATE_LATEST_API, headers={
            'User-Agent': 'PlantUMLAssist-update-check',
            'Accept': 'application/vnd.github+json',
        })
        with (opener or urllib.request.urlopen)(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        out['release'] = {
            'tag_name': str(data.get('tag_name') or ''),
            'html_url': str(data.get('html_url') or ''),
            'assets': [{'name': str(a.get('name') or ''),
                        'browser_download_url': str(a.get('browser_download_url') or '')}
                       for a in (data.get('assets') or []) if isinstance(a, dict)],
        }
    except urllib.error.HTTPError as e:
        out['error'] = f'HTTP {e.code}'
    except Exception as e:  # オフライン・プロキシ等。画面に理由を出す
        out['error'] = str(getattr(e, 'reason', '') or e)[:120]
    return out


def open_repo_url(url):
    """このリポジトリの GitHub URL だけを既定のブラウザで開く (アプリの窓を遷移させない)。"""
    if not isinstance(url, str) or not url.startswith(UPDATE_REPO_URL + '/'):
        return False
    import webbrowser
    return bool(webbrowser.open(url))

# GET /api — 窓口の索引。docs/api.md と同じ並びで、1 行ずつ何をするかを言う。
API_INDEX = {
    'name': 'PlantUMLAssist server API',
    'doc': 'docs/api.md (同じ内容。GET /api が正本)',
    'endpoints': [
        {'endpoint': 'GET /api', 'summary': 'この索引'},
        {'endpoint': 'GET /version', 'summary': 'アプリの版・コミット・日付 (git tag が正本)'},
        {'endpoint': 'GET /update-check', 'summary': 'GitHub Releases の最新版を 1 回読む (押したときだけ。落とさない)'},
        {'endpoint': 'POST /open-url', 'summary': 'このリポジトリの GitHub の URL を既定のブラウザで開く',
         'request': "{url}"},
        {'endpoint': 'GET /render', 'summary': 'POST /render の仕様'},
        {'endpoint': 'POST /render', 'summary': 'DSL を描いて SVG を返す',
         'request': "{text, mode}"},
        {'endpoint': 'GET /verify-svg', 'summary': 'POST /verify-svg の仕様'},
        {'endpoint': 'POST /verify-svg', 'summary': '保存中の svg が今の puml の結果かを中身で確かめる',
         'request': "{dir, types: [名前...], mode}"},
        {'endpoint': 'GET /autosave', 'summary': '保存フォルダの図の一覧 (dsl・hash・svgSource)',
         'request': '?dir=&type='},
        {'endpoint': 'POST /autosave', 'summary': '図の DSL を保存する', 'request': "{type, dir, dsl}"},
        {'endpoint': 'DELETE /autosave', 'summary': 'type を付ければその図 1 枚 (版は残す)、省けば保存フォルダの図を全部消す',
         'request': '?dir=&type='},
        {'endpoint': 'POST /autosave-svg', 'summary': '書き出した svg を保存する (印を刻む)',
         'request': "{type, dir, svg}"},
        {'endpoint': 'GET /autosave-versions', 'summary': '1 枚の図の版の一覧', 'request': '?dir=&type='},
        {'endpoint': 'GET /version-search', 'summary': '保存フォルダの全図の版から部品名を探す (混入点の材料)',
         'request': '?dir=&q='},
        {'endpoint': 'GET /version-diff', 'summary': '1 枚の図の「その版」と「直前の版」の本文を組で返す (全文差分の材料)',
         'request': '?dir=&type=[&stamp=]'},
        {'endpoint': 'GET /peek-dirs', 'summary': '保存フォルダの候補を覗く'},
        {'endpoint': 'GET /git-status', 'summary': '保存先が Git 作業木ならブランチ・ahead/behind・変更 (M/A/D)。読むだけで通信しない',
         'request': '?dir='},
        {'endpoint': 'GET /git-log', 'summary': 'その図 (file 省略で保存先全体) に関係するコミット。新しい順',
         'request': '?dir=&file='},
        {'endpoint': 'GET /git-refs', 'summary': 'ブランチとタグの一覧', 'request': '?dir='},
        {'endpoint': 'GET /git-show', 'summary': 'rev 時点の {file}.puml の本文 {text}', 'request': '?dir=&file=&rev='},
        {'endpoint': 'POST /git-commit', 'summary': '保存先の変更を全部載せてコミットする', 'request': '{dir, message}'},
        {'endpoint': 'POST /git-pull', 'summary': '取得 (pull --ff-only)。押したときだけ', 'request': '{dir}'},
        {'endpoint': 'POST /git-push', 'summary': '送信 (push)。押したときだけ。認証は OS の git', 'request': '{dir}'},
        {'endpoint': 'POST /git-checkout', 'summary': 'ブランチ切り替え', 'request': '{dir, branch}'},
        {'endpoint': 'GET /peek-notes', 'summary': '隣のフォルダに置かれた指摘 (.md) を読む',
         'request': '?dir='},
        {'endpoint': 'GET /name-registry', 'summary': '保存フォルダの親にある正式表記の登録簿 (3 人で共有)',
         'request': '?dir='},
        {'endpoint': 'POST /name-registry', 'summary': '正式表記の登録簿を置き換える',
         'request': "{dir, entries: [{canonical, variants, note, by, at}]}"},
        {'endpoint': 'GET /cohort-ack', 'summary': 'ドメイン突合で内部揺れと確認済みの組の台帳',
         'request': '?dir='},
        {'endpoint': 'POST /cohort-ack', 'summary': '確認済みの組の台帳を置き換える',
         'request': "{dir, entries: [{key, domain, kind, left, right, fingerprint, note, by, at}]}"},
        {'endpoint': 'GET /meeting-log', 'summary': '会議セットで並べた日時の控え (▤ 変更サマリボードの「変更前 = 前回の会議」)',
         'request': '?dir='},
        {'endpoint': 'POST /meeting-log', 'summary': '会議セットで並べた日時を 1 つ足す',
         'request': '{dir, at}'},
        {'endpoint': 'GET /vault', 'summary': '保管庫の中身', 'request': '?dir='},
        {'endpoint': 'POST /vault', 'summary': '保管庫へ入れる'},
        {'endpoint': 'GET /tickets', 'summary': '変更チケットの一覧', 'request': '?dir='},
        {'endpoint': 'POST /tickets', 'summary': '変更チケットを 1 枚書く', 'request': "{dir, ticket}"},
        {'endpoint': 'DELETE /tickets', 'summary': '変更チケットを 1 枚消す', 'request': '?dir=&id='},
        {'endpoint': 'GET /peek-settled', 'summary': '「相手 × 図種は手本なしで確定」の一覧 (以後は聞かない)',
         'request': '?dir='},
        {'endpoint': 'POST /peek-settled', 'summary': '確定を 1 つ足す / 外す (clear で全部外す)',
         'request': "{dir, peer, kind, settled} | {dir, clear: true}"},
        {'endpoint': 'GET /rename-pairs', 'summary': 'そのフォルダで打たれた置換の組', 'request': '?dir='},
        {'endpoint': 'POST /rename-pairs', 'summary': '置換の組を 1 つ覚える',
         'request': "{dir, from, to, hits}"},
        {'endpoint': 'GET /doc-sets', 'summary': 'そのフォルダに登録した資料セット', 'request': '?dir='},
        {'endpoint': 'POST /doc-sets', 'summary': '資料セットを 1 つ登録する (同じ名前は置き換え)',
         'request': "{dir, name, docs, items}"},
        {'endpoint': 'DELETE /doc-sets', 'summary': '資料セットを 1 つ消す', 'request': '?dir=&name='},
        {'endpoint': 'POST /file-roles', 'summary': '保存フォルダの _roles.json を置き換える',
         'request': "{dir, roles}"},
        {'endpoint': 'POST /export-zip', 'summary': '書き出した zip を保存フォルダに置き、書けたバイト数を返す',
         'request': "{dir, name, base64}"},
        {'endpoint': 'POST /export-log', 'summary': '書き出しの控えを 1 件足す'},
        {'endpoint': 'POST /file-op', 'summary': 'FILES ツリーの右クリック: 図の名前変更 / 複製 / 別フォルダへ移動 / 場所を開く'},
        {'endpoint': 'GET /prefs', 'summary': 'この機械に保存した設定'},
        {'endpoint': 'POST /prefs', 'summary': '設定を書く'},
        {'endpoint': 'POST /jar-path', 'summary': 'plantuml.jar の場所を設定する {path}'},
        {'endpoint': 'POST /pick-jar', 'summary': 'アプリ版: jar をファイルダイアログで選ぶ'},
        {'endpoint': 'POST /fetch-jar', 'summary': 'アプリ版/Windows: 公式から jar を取得する'},
        {'endpoint': 'POST /native-save', 'summary': 'アプリ版: 保存ダイアログで書き出す {fileName, text|base64}'},
        {'endpoint': 'POST /native-open', 'summary': 'アプリ版: 開くダイアログ (複数選択) で .puml を読む → {files: [{path, name, text, encoding, bom, eol}]}'},
        {'endpoint': 'POST /native-write', 'summary': '開いた元の .puml へ文字コードを保って書き戻す', 'request': '{path, text, encoding, bom}'},
        {'endpoint': 'GET /env', 'summary': 'Java / jar の有無など実行環境'},
        {'endpoint': 'POST /heartbeat', 'summary': '生存通知 (無音 300 秒で server は落ちる)'},
        {'endpoint': 'POST /shutdown', 'summary': '停止を予約する'},
    ],
}

# PlantUML のエラー画の目印。src/core/render-error.js の detect と同じ 3 条件。
# 片方だけ変えないこと。
_ERR_GREEN_MARK = b'fill="#33FF02"'
_ERR_RED_TEXT_RE = re.compile(rb'<text[^>]*fill="#FF0000"[^>]*>(.*?)</text>', re.S | re.I)
_ERR_LINE_RE = re.compile(rb'\[From string \(line (\d+)\)')
_ENTITIES = {'&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&', '&#160;': ' '}


def _decode_entities(raw):
    text = raw.decode('utf-8', 'replace')
    for k, v in _ENTITIES.items():
        text = text.replace(k, v)
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)
    return text.strip()


# BLK-migrator-20260924-1432: PlantUML が描いている途中で落ちた (例外) ときの絵。
# 文法エラーの配色を使わず白地に黒文字で「An error has occured : <例外>」と
# 「PlantUML (版) has crashed.」を書く。src/core/render-error.js の detectCrash と同じ 2 条件。
_CRASH_HEAD_RE = re.compile(rb'<text[^>]*>\s*An error has occured\s*:?\s*(.*?)</text>', re.S | re.I)
_CRASH_MARK_RE = re.compile(rb'<text[^>]*>\s*PlantUML \(([^)<]*)\) has crashed\.?\s*</text>', re.I)


def detect_render_crash(svg):
    """PlantUML が描画の途中で落ちた絵なら {'message', 'line': None, 'crashed': True}。"""
    if not svg:
        return None
    h = _CRASH_HEAD_RE.search(svg)
    if not h:
        return None
    c = _CRASH_MARK_RE.search(svg)
    if not c:
        return None
    cause = _decode_entities(h.group(1))
    version = c.group(1).decode('utf-8', 'replace')
    message = 'PlantUML %s が描画の途中で落ちました' % version + (' (%s)' % cause if cause else '')
    return {'message': message, 'line': None, 'crashed': True}


def detect_render_error(svg):
    """PlantUML の「エラー画」なら {'message', 'line'}。図なら None。"""
    if not svg or _ERR_GREEN_MARK not in svg:
        return detect_render_crash(svg)
    m = _ERR_RED_TEXT_RE.search(svg)
    if not m:
        return None
    message = _decode_entities(m.group(1))
    if 'error' not in message.lower():
        return None
    lm = _ERR_LINE_RE.search(svg)
    return {'message': message, 'line': int(lm.group(1)) if lm else None}


def resolve_render_request(data):
    """POST /render の body を (text, mode, warning, error) に解く。

    text が無ければ DSL_FIELD_ALIASES の別名を順に探し、見つかればそれを text
    として使い、warning に「別名で受理した」旨を入れて返す。error があれば 400。
    """
    if not isinstance(data, dict):
        return None, None, None, "body must be a JSON object with a 'text' field. GET /render で仕様を返します"

    field = 'text'
    warning = None
    if 'text' not in data:
        found = [k for k in DSL_FIELD_ALIASES if k in data]
        if not found:
            got = ', '.join(sorted(data.keys())) or '(なし)'
            return None, None, None, (
                "required field 'text' is missing. 受け取ったフィールド: %s. "
                'GET /render で仕様を返します' % got)
        if len(found) > 1:
            return None, None, None, (
                "DSL のフィールドが複数あります (%s)。どれを描くか決められないので "
                "'text' 1 つにしてください" % ', '.join(found))
        field = found[0]
        warning = ("'%s' を 'text' の別名として受理しました。正式な名前は 'text' です "
                   '(GET /render に一覧があります)' % field)

    value = data[field]
    if not isinstance(value, str):
        return None, None, None, "'%s' must be a string (PlantUML の DSL 全文)" % field
    if not value.strip():
        return None, None, None, "'%s' is empty — @startuml … @enduml を含む DSL を渡してください" % field

    mode = data.get('mode', 'local')
    if mode not in ('local', 'online'):
        return None, None, None, "unknown mode: %r — 'local' か 'online' です" % (mode,)
    return value, mode, warning, None


# BLK-reviewer-20260913-0306: reviewer は保存フォルダの .puml / .svg を GUI の外から
# 直に読む。write_text は「開いて 0 バイトに切り詰めてから書く」ので、書いている
# 数百 ms の間に読んだ側は空・または途中までのファイルを見る (reviewer は 1298 →
# 78 バイトの揺れを実測した)。読んだ側にはそれが「中身が消えた」としか見えず、
# 本当の消失と区別できない。同じフォルダに一時ファイルを書いてから os.replace で
# 差し替えれば、読む側からは必ず「前の全文」か「次の全文」のどちらかになる
# (os.replace は同一ボリュームなら Windows でも原子的)。
#
# Windows の os.replace は、置き換える先を誰かが開いている一瞬の間だけ
# PermissionError を返す。読まれていることを理由に保存を落とすわけにはいかないので、
# 数ミリ秒おきに少しだけ粘り、それでも駄目なら従来どおりその場に書く
# (途中を見せる可能性は残るが、保存は必ず通る)。
REPLACE_RETRY_SECONDS = 2.0
REPLACE_RETRY_INTERVAL = 0.005


# BLK-reviewer-20260914-0906: 印 (@pua-source-sha1) の付いていない svg では、
# 「この絵がどの図のものか」を言う手掛かりが svg 自身の中にしかない。PlantUML は
# 書き出した svg の末尾に元の DSL を `<?plantuml-src …?>` として畳んで埋めるので、
# それを開けば印が無くても相手を名指しできる。reviewer はこの展開を 1 枚ずつ
# 手で書いていた (図の枚数だけ render API を叩き直していた)。
#
# 畳み方は 2 通りある。PlantUML がそのまま書くと XML の processing instruction
# `<?plantuml-src …?>` になるが、svg を DOM に入れて取り出し直した経路では
# `<!--?plantuml-src …?-->` (HTML コメントに包まれた形) で残る。ブラウザが
# 未知の PI をコメントとして読み直すためで、どちらも中身は同じ token。
# 片方しか読めないと、まさに入れ替わった図が黙って未刻印に落ちる。
_PLANTUML_SRC_RE = re.compile(
    rb'<\?plantuml-src\s+([0-9A-Za-z_-]+)\s*\?>'
    rb'|<!--\?plantuml-src\s+([0-9A-Za-z_-]+)\s*\?-->')
_PLANTUML_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
_STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
_PLANTUML_B64_MAP = str.maketrans(_PLANTUML_B64, _STD_B64)


def decode_svg_plantuml_src(svg_bytes):
    """svg に畳まれている元の DSL を返す。埋まっていなければ None。

    埋め込みは `@startuml` / `@enduml` を含まない (PlantUML がそう畳む)。
    """
    m = None
    for m in _PLANTUML_SRC_RE.finditer(svg_bytes or b''):
        pass          # 最後の 1 つが図全体の元 DSL
    if m is None:
        return None
    token = (m.group(1) or m.group(2)).decode('ascii').translate(_PLANTUML_B64_MAP)
    token += '=' * (-len(token) % 4)
    try:
        return zlib.decompress(base64.b64decode(token), -15).decode('utf-8', 'replace')
    except (binascii.Error, zlib.error, ValueError):
        return None


def normalize_dsl(text):
    """畳まれた DSL と保存中の .puml を突き合わせるための形にそろえる。

    埋め込みには `@startuml` / `@enduml` が無く、行末の空白も落ちている。
    ここを揃えないと、同じ図でも「別物」と言ってしまう。
    """
    out = []
    for line in (text or '').replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        line = line.rstrip()
        if not line:
            continue
        low = line.strip().lower()
        if low.startswith('@startuml') or low.startswith('@enduml'):
            continue
        out.append(line)
    return '\n'.join(out)


def _eol_newline(eol):
    """開いたファイルの改行 ('lf' / 'crlf') を open() の newline に直す。

    分からないものは None (これまでどおり platform の既定) にする。開いた元が
    無い図の保存の仕方までは変えない (BLK-migrator-20260918-0349)。
    """
    s = str(eol or '').strip().lower()
    if s == 'lf':
        return '\n'
    if s == 'crlf':
        return '\r\n'
    return None


def _atomic_write_text(path, text, encoding='utf-8', newline=None):
    """`path` を、読んでいる側に途中経過を見せずに置き換える。"""
    tmp = path.with_name(path.name + '.tmp-' + str(os.getpid()) + '-' + str(threading.get_ident()))
    try:
        with open(tmp, 'w', encoding=encoding, newline=newline) as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        deadline = time.monotonic() + REPLACE_RETRY_SECONDS
        while True:
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if time.monotonic() >= deadline:
                    break
                time.sleep(REPLACE_RETRY_INTERVAL)
        # 粘っても開かれっぱなしだった。保存を落とさないことを優先する。
        with open(path, 'w', encoding=encoding, newline=newline) as f:
            f.write(text)
    except BaseException:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise
    try:
        tmp.unlink()
    except OSError:
        pass


def _atomic_write_bytes(path, data):
    """`path` をバイト列で置き換える。zip は 1 バイトでも欠けると開けないので
    書き途中を見せない (BLK-primary-20260918-0249)。"""
    tmp = path.with_name(path.name + '.tmp-' + str(os.getpid()) + '-' + str(threading.get_ident()))
    try:
        with open(tmp, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        deadline = time.monotonic() + REPLACE_RETRY_SECONDS
        while True:
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if time.monotonic() >= deadline:
                    break
                time.sleep(REPLACE_RETRY_INTERVAL)
        with open(path, 'wb') as f:
            f.write(data)
    except BaseException:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise
    try:
        tmp.unlink()
    except OSError:
        pass


# ── Git (BLK-human-20260923-1702, design 10c) ─────────────────────────────
# 保存先が Git 作業木のときだけ、FILES ツリーの下端に GIT 欄を出す。
# ここは OS の `git` を呼ぶだけで、資格情報は持たない (認証は git 側の設定に任せる)。
# 取得 (pull)・送信 (push)・ブランチ切替は、画面で人が押したときの POST だけが動かす
# (GET は読むだけで、通信するコマンドを 1 つも呼ばない)。マージと衝突の解消は扱わない。
GIT_TIMEOUT_SEC = 20
GIT_NET_TIMEOUT_SEC = 120
GIT_LOG_MAX = 200
_GIT_EXE = None


def git_exe():
    """PATH 上の git。無ければ '' (GIT 欄を出さない)。"""
    global _GIT_EXE
    if _GIT_EXE is None:
        import shutil
        _GIT_EXE = shutil.which('git') or ''
    return _GIT_EXE


def run_git(cwd, args, timeout=GIT_TIMEOUT_SEC):
    """`git -C cwd args...` を実行し (returncode, stdout, stderr) を返す。git が無ければ None。"""
    exe = git_exe()
    if not exe:
        return None
    env = dict(os.environ)
    env['GIT_TERMINAL_PROMPT'] = '0'   # 資格情報を端末で訊かない (画面が固まる)
    env['LC_ALL'] = 'C'
    try:
        r = subprocess.run([exe, '-C', str(cwd), '-c', 'core.quotepath=false'] + list(args),
                           capture_output=True, timeout=timeout, env=env, **_SUBPROCESS_KWARGS)
    except (OSError, subprocess.TimeoutExpired) as e:
        return (1, '', str(e))

    def dec(b):
        return (b or b'').decode('utf-8', 'replace')
    return (r.returncode, dec(r.stdout), dec(r.stderr))


def git_toplevel(save_dir):
    """save_dir を含む作業木の根。作業木でなければ None。"""
    try:
        if not Path(save_dir).is_dir():
            return None
    except OSError:
        return None
    r = run_git(save_dir, ['rev-parse', '--show-toplevel'])
    if not r or r[0] != 0:
        return None
    top = r[1].strip()
    if not top:
        return None
    # 作業木の中でも .gitignore で外したフォルダ (例: 成果物リポジトリの test-results/) は
    # Git で管理していないので、GIT 欄を出さない。
    rel = _git_rel(top, save_dir)
    if rel:
        ci = run_git(top, ['check-ignore', '-q', '--', rel + '/'])
        if ci and ci[0] == 0:
            return None
    return Path(top)


def parse_git_branch_line(line):
    """`## main...origin/main [ahead 1, behind 2]` を {branch, upstream, ahead, behind} に。"""
    out = {'branch': '', 'upstream': '', 'ahead': 0, 'behind': 0}
    s = line[3:] if line.startswith('## ') else line
    m = re.search(r'\[(.*)\]\s*$', s)
    if m:
        for part in m.group(1).split(','):
            mm = re.match(r'(ahead|behind)\s+(\d+)', part.strip())
            if mm:
                out[mm.group(1)] = int(mm.group(2))
        s = s[:m.start()].strip()
    for head in ('No commits yet on ', 'Initial commit on '):
        if s.startswith(head):
            s = s[len(head):]
    if '...' in s:
        b, up = s.split('...', 1)
        out['branch'], out['upstream'] = b.strip(), up.strip()
    else:
        out['branch'] = s.strip()
    return out


def parse_git_porcelain(text):
    """`git status --porcelain=v1 -b` を読む。M / A / D の 1 文字に畳む (未追跡は A)。"""
    info = {'branch': '', 'upstream': '', 'ahead': 0, 'behind': 0, 'changes': []}
    for line in text.splitlines():
        if not line:
            continue
        if line.startswith('## '):
            info.update(parse_git_branch_line(line))
            continue
        xy, path = line[:2], line[3:]
        if ' -> ' in path:
            path = path.split(' -> ', 1)[1]
        path = path.strip().strip('"')
        if xy == '??':
            code = 'A'
        elif 'D' in xy:
            code = 'D'
        elif 'A' in xy:
            code = 'A'
        else:
            code = 'M'
        info['changes'].append({'code': code, 'path': path})
    return info


def _git_rel(top, save_dir, name=''):
    """作業木の根から見た save_dir (と name.puml) の相対パス。区切りは /。"""
    rel = os.path.relpath(os.path.realpath(str(save_dir)), os.path.realpath(str(top)))
    rel = '' if rel == '.' else rel.replace('\\', '/')
    if name:
        fn = name + '.puml'
        return (rel + '/' + fn) if rel else fn
    return rel


def git_status(save_dir):
    """保存先の Git の様子。作業木でなければ {'repo': False}。"""
    if not git_exe():
        return {'available': False, 'repo': False}
    top = git_toplevel(save_dir)
    if not top:
        return {'available': True, 'repo': False}
    r = run_git(save_dir, ['status', '--porcelain=v1', '-b', '--untracked-files=all', '--', '.'])
    if not r or r[0] != 0:
        return {'available': True, 'repo': False, 'error': (r[2] if r else '').strip()}
    info = parse_git_porcelain(r[1])
    rel = _git_rel(top, save_dir)
    for c in info['changes']:
        p = c['path']
        local = p[len(rel) + 1:] if rel and p.startswith(rel + '/') else p
        c['file'] = local
        c['name'] = local[:-5] if local.lower().endswith('.puml') and '/' not in local else ''
    info['available'] = True
    info['repo'] = True
    info['root'] = str(top)
    info['modified'] = len(info['changes'])
    return info


_GIT_LOG_FMT = '%x1e%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%D'


def parse_git_log(text):
    """_GIT_LOG_FMT + --numstat の出力を commit の列にする。"""
    out = []
    for rec in text.split('\x1e'):
        rec = rec.strip('\n')
        if not rec.strip():
            continue
        lines = rec.split('\n')
        f = lines[0].split('\x1f')
        if len(f) < 6:
            continue
        refs = [x.strip() for x in f[5].split(',') if x.strip()]
        tags = [x[len('tag: '):] for x in refs if x.startswith('tag: ')]
        added = removed = 0
        for ln in lines[1:]:
            parts = ln.split('\t')
            if len(parts) >= 3:
                try:
                    added += int(parts[0])
                    removed += int(parts[1])
                except ValueError:
                    pass
        out.append({'hash': f[0], 'short': f[1], 'author': f[2], 'date': f[3],
                    'message': f[4], 'tags': tags,
                    'head': any(x == 'HEAD' or x.startswith('HEAD -> ') for x in refs),
                    'added': added, 'removed': removed})
    return out


def git_log(save_dir, name=''):
    """この図に関係するコミット (name が空なら保存先全体)。新しい順。"""
    top = git_toplevel(save_dir)
    if not top:
        return {'repo': False, 'commits': []}
    path = _git_rel(top, save_dir, name) if name else (_git_rel(top, save_dir) or '.')
    args = ['log', '-n', str(GIT_LOG_MAX), '--format=' + _GIT_LOG_FMT, '--numstat']
    if name:
        args.append('--follow')
    r = run_git(top, args + ['--', path])
    if not r or r[0] != 0:
        # コミットが 1 つも無い作業木は log が失敗する。空の履歴として返す。
        return {'repo': True, 'commits': []}
    return {'repo': True, 'commits': parse_git_log(r[1])}


def git_refs(save_dir):
    top = git_toplevel(save_dir)
    if not top:
        return {'repo': False, 'current': '', 'branches': [], 'tags': []}
    b = run_git(top, ['for-each-ref', '--format=%(refname:short)%09%(objectname:short)%09%(HEAD)',
                      'refs/heads'])
    t = run_git(top, ['for-each-ref', '--sort=-creatordate',
                      '--format=%(refname:short)%09%(objectname:short)', 'refs/tags'])
    branches, tags, current = [], [], ''
    for ln in (b[1] if b and b[0] == 0 else '').splitlines():
        f = ln.split('\t')
        if len(f) >= 3:
            on = f[2].strip() == '*'
            branches.append({'name': f[0], 'short': f[1], 'current': on})
            if on:
                current = f[0]
    for ln in (t[1] if t and t[0] == 0 else '').splitlines():
        f = ln.split('\t')
        if len(f) >= 2:
            tags.append({'name': f[0], 'short': f[1]})
    return {'repo': True, 'current': current, 'branches': branches, 'tags': tags}


_GIT_REV_RE = re.compile(r'^[0-9A-Za-z._/\-~^]{1,200}$')


def git_rev_ok(rev):
    return bool(rev) and bool(_GIT_REV_RE.match(rev)) and not rev.startswith('-')


def git_show(save_dir, rev, name):
    """rev 時点の {name}.puml の本文。無ければ None。"""
    if not git_rev_ok(rev):
        return None
    top = git_toplevel(save_dir)
    if not top:
        return None
    r = run_git(top, ['show', rev + ':' + _git_rel(top, save_dir, name)])
    if not r or r[0] != 0:
        return None
    return r[1]


def git_commit(save_dir, message):
    """保存先の変更を全部載せてコミットする。戻り値 (ok, dict)。"""
    msg = (message or '').strip()
    if not msg:
        return False, {'error': 'コミットメッセージを書いてください'}
    top = git_toplevel(save_dir)
    if not top:
        return False, {'error': '保存先は Git の作業木ではありません'}
    a = run_git(save_dir, ['add', '-A', '--', '.'])
    if not a or a[0] != 0:
        return False, {'error': (a[2] if a else 'git がありません').strip()}
    c = run_git(save_dir, ['commit', '-m', msg, '--', '.'])
    if not c or c[0] != 0:
        return False, {'error': ((c[2] or c[1]) if c else 'git がありません').strip()}
    h = run_git(top, ['rev-parse', '--short', 'HEAD'])
    return True, {'ok': True, 'short': (h[1].strip() if h and h[0] == 0 else '')}


def git_net(save_dir, op, branch=''):
    """pull / push / checkout。人が押したときだけ呼ばれる。"""
    top = git_toplevel(save_dir)
    if not top:
        return False, {'error': '保存先は Git の作業木ではありません'}
    if op == 'pull':
        r = run_git(top, ['pull', '--ff-only'], timeout=GIT_NET_TIMEOUT_SEC)
    elif op == 'push':
        r = run_git(top, ['push'], timeout=GIT_NET_TIMEOUT_SEC)
    elif op == 'checkout':
        if not git_rev_ok(branch):
            return False, {'error': 'ブランチ名が読めません'}
        r = run_git(top, ['checkout', branch])
    else:
        return False, {'error': 'unknown op'}
    if not r or r[0] != 0:
        return False, {'error': ((r[2] or r[1]) if r else 'git がありません').strip()}
    return True, {'ok': True, 'output': (r[1] + r[2]).strip()}



class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/autosave-versions':
            with _fs_lock:
                return self._handle_autosave_versions()
        if self.path.split('?')[0] == '/version-search':
            with _fs_lock:
                return self._handle_version_search()
        if self.path.split('?')[0] == '/version-diff':
            with _fs_lock:
                return self._handle_version_diff()
        if self.path.split('?')[0] == '/vault':
            with _fs_lock:
                return self._handle_vault_get()
        if self.path.split('?')[0] == '/tickets':
            with _fs_lock:
                return self._handle_tickets_get()
        if self.path.split('?')[0] == '/peek-settled':
            with _fs_lock:
                return self._handle_peek_settled_get()
        if self.path.split('?')[0] == '/rename-pairs':
            with _fs_lock:
                return self._handle_rename_pairs_get()
        if self.path.split('?')[0] == '/doc-sets':
            with _fs_lock:
                return self._handle_doc_sets_get()
        if self.path.startswith('/autosave'):
            with _fs_lock:
                return self._handle_autosave_get()
        if self.path.split('?')[0] == '/name-registry':
            with _fs_lock:
                return self._handle_name_registry_get()
        if self.path.split('?')[0] == '/cohort-ack':
            with _fs_lock:
                return self._handle_cohort_ack_get()
        if self.path.split('?')[0] == '/meeting-log':
            with _fs_lock:
                return self._handle_meeting_log_get()
        if self.path.split('?')[0] == '/peek-dirs':
            with _fs_lock:
                return self._handle_peek_dirs()
        if self.path.split('?')[0] == '/peek-notes':
            with _fs_lock:
                return self._handle_peek_notes()
        # BLK-human-20260923-1702 (design 10c): 保存先の Git を読む口。読むだけで通信しない。
        if self.path.split('?')[0] in ('/git-status', '/git-log', '/git-refs', '/git-show'):
            return self._handle_git_get()
        if self.path.split('?')[0] == '/version':
            return self._send_json(200, build_info())
        if self.path.split('?')[0] == '/update-check':
            return self._send_json(200, fetch_latest_release())
        if self.path.split('?')[0] == '/render':
            return self._send_json(200, RENDER_API_DOC)
        if self.path.split('?')[0] == '/verify-svg':
            return self._send_json(200, VERIFY_SVG_API_DOC)
        if self.path.split('?')[0] == '/api':
            return self._send_json(200, API_INDEX)
        if self.path.split('?')[0] == '/prefs':
            with _fs_lock:
                return self._send_json(200, read_prefs())
        if self.path.split('?')[0] == '/env':
            return self._send_json(200, detect_env())
        path = self.path.split('?')[0]
        if path == '/':
            path = '/plantuml-assist.html'
        file_path = ROOT / path.lstrip('/')
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, f'Not found: {path}')
            return
        ext = file_path.suffix.lower()
        mime = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
        }.get(ext, 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def do_POST(self):
        global _last_heartbeat, _shutdown_started
        if self.path == '/autosave':
            with _fs_lock:
                return self._handle_autosave_post()
        if self.path == '/autosave-svg':
            with _fs_lock:
                return self._handle_autosave_svg_post()
        if self.path == '/vault':
            with _fs_lock:
                return self._handle_vault_post()
        if self.path == '/tickets':
            with _fs_lock:
                return self._handle_tickets_post()
        if self.path == '/rename-pairs':
            with _fs_lock:
                return self._handle_rename_pairs_post()
        if self.path == '/peek-settled':
            with _fs_lock:
                return self._handle_peek_settled_post()
        if self.path == '/doc-sets':
            with _fs_lock:
                return self._handle_doc_sets_post()
        if self.path == '/name-registry':
            with _fs_lock:
                return self._handle_name_registry_post()
        if self.path == '/cohort-ack':
            with _fs_lock:
                return self._handle_cohort_ack_post()
        if self.path == '/meeting-log':
            with _fs_lock:
                return self._handle_meeting_log_post()
        if self.path == '/file-roles':
            with _fs_lock:
                return self._handle_file_roles_post()
        if self.path == '/export-zip':
            with _fs_lock:
                return self._handle_export_zip_post()
        if self.path == '/export-log':
            with _fs_lock:
                return self._handle_export_log_post()
        if self.path == '/verify-svg':
            with _fs_lock:
                return self._handle_verify_svg_post()
        # BLK-human-20260923-1701 (design 10b): FILES ツリーの右クリック・ドラッグから
        # ファイル単位の操作 (名前変更 / 複製 / 別フォルダへ移動 / 場所を開く) を受ける口。
        if self.path == '/file-op':
            with _fs_lock:
                return self._handle_file_op_post()
        if self.path == '/prefs':
            with _fs_lock:
                return self._handle_prefs_post()
        # BLK-human-20260909-2200: jar と Java は同梱しない。選ぶ・取ってくるの 3 窓口。
        if self.path == '/jar-path':
            with _fs_lock:
                return self._handle_jar_path_post()
        if self.path == '/pick-jar':
            with _fs_lock:
                return self._handle_pick_jar_post()
        if self.path == '/fetch-jar':
            return self._handle_fetch_jar_post()
        if self.path == '/open-url':
            data = self._read_json_object()
            if data is None:
                return
            if not open_repo_url(data.get('url')):
                return self._send_json(400, {'error': 'このリポジトリの GitHub の URL だけ開けます'})
            return self._send_json(200, {'ok': True})
        # アプリ版の保存はブラウザのダウンロードではなくネイティブのダイアログ。
        if self.path == '/native-save':
            return self._handle_native_save_post()
        # BLK-human-20260917-0901: 手元の .puml を開く (アプリ版はネイティブの複数選択)
        # と、開いた元のファイルへ文字コード・改行を保ったまま書き戻す。
        if self.path == '/native-open':
            return self._handle_native_open_post()
        if self.path == '/native-write':
            with _fs_lock:
                return self._handle_native_write_post()
        # BLK-human-20260923-1702 (design 10c): コミット・取得・送信・ブランチ切替。
        # どれも画面で人が押したときだけ届く (自動では呼ばない)。
        if self.path in ('/git-commit', '/git-pull', '/git-push', '/git-checkout'):
            return self._handle_git_post()
        if self.path == '/heartbeat':
            with _state_lock:
                _last_heartbeat = time.time()
            self.send_response(204)
            self.end_headers()
            return
        if self.path == '/shutdown':
            if NO_IDLE_EXIT:
                self.send_response(204)
                self.end_headers()
                return
            # Don't kill immediately — F5 reload also fires pagehide/beforeunload.
            # Instead fast-forward the idle timer so the watchdog fires in ~2s,
            # which a fresh heartbeat from the new page will cancel.
            with _state_lock:
                _last_heartbeat = time.time() - IDLE_SHUTDOWN_SEC + 2
            self.send_response(204)
            self.end_headers()
            return
        if self.path != '/render':
            self.send_error(404)
            return
        # Any render counts as activity too, so a client mid-edit is never killed.
        with _state_lock:
            _last_heartbeat = time.time()
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        text, mode, warning, problem = resolve_render_request(data)
        if problem:
            self._send_json(400, {'error': problem, 'api': RENDER_API_DOC})
            return
        if mode == 'local':
            svg, error = render_local(text)
        else:
            svg, error = render_online(text)
        if error:
            self._send_json(500, {'error': error})
        else:
            # PlantUML は文法エラーでも SVG (エラー画) を 200 で返す。そのまま流すと
            # curl では成功と区別できないので、ここで 422 に落とす。ブラウザ側は
            # 元から !resp.ok を描画エラー扱いにしているので見え方は変わらない。
            err = detect_render_error(svg)
            if err:
                msg = ('%d 行目: %s' % (err['line'], err['message'])) if err['line'] else err['message']
                payload = {'error': msg, 'line': err['line'],
                           'kind': 'plantuml-crash' if err.get('crashed') else 'plantuml-syntax'}
                if warning:
                    payload['warning'] = warning
                self._send_json(422, payload)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Cache-Control', 'no-cache')
            # BLK-reviewer-20260908-0103 (1403 追記): この応答には印が付かない。
            # 保存中の svg とバイト比較する使い方をここで止める (ASCII のみ)。
            self.send_header('X-PlantUMLAssist-Svg-Stamp', SVG_STAMP_HEADER)
            # 別名で受理したことは 200 でも必ず伝える (黙って呑まない)。
            # ヘッダ値は ASCII しか通らないので日本語は %xx で包む。
            if warning:
                self.send_header('X-PlantUMLAssist-Warning',
                                 urllib.parse.quote(warning, safe=''))
            self.end_headers()
            self.wfile.write(svg)

    # --- jar / Java (BLK-human-20260909-2200) --------------------------------
    #
    # 配布物に plantuml.jar も Java も同梱しない (ライセンスと容量)。jar は
    # 「利用者が選ぶ」「利用者の操作で公式から取る」の 2 経路だけで入り、
    # 選んだ場所は `.assist-prefs.json` の jarPath に残る。Java が無いときは
    # /env の javaUrl (Temurin) を画面に出す。ここから外へ図は出さない。

    def _read_json_object(self):
        """Body を dict として読む。読めなければ 400 を返して None。"""
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length).decode('utf-8') if length else ''
        try:
            data = json.loads(raw) if raw else {}
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return None
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return None
        return data

    def _handle_jar_path_post(self):
        data = self._read_json_object()
        if data is None:
            return
        ok, msg = use_jar(data.get('path'))
        if not ok:
            return self._send_json(400, {'error': msg})
        self._send_json(200, {'jarPath': msg, 'env': detect_env()})

    def _handle_pick_jar_post(self):
        if NATIVE_DIALOG is None:
            return self._send_json(409, {'error': 'ファイルダイアログはアプリ版だけで使えます'})
        picked = NATIVE_DIALOG.open_file('plantuml.jar を選ぶ', ('Jar files (*.jar)',))
        if not picked:
            return self._send_json(200, {'canceled': True, 'env': detect_env()})
        ok, msg = use_jar(picked)
        if not ok:
            return self._send_json(400, {'error': msg})
        self._send_json(200, {'jarPath': msg, 'env': detect_env()})

    def _handle_fetch_jar_post(self):
        """利用者が押したときだけ lib/fetch-plantuml.ps1 を回して jar を取る。"""
        if os.name != 'nt' or not FETCH_SCRIPT.exists():
            return self._send_json(409, {'error': 'fetch-plantuml.ps1 が使えない環境です'})
        dest_dir = DATA_ROOT / 'lib'
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return self._send_json(500, {'error': f'保存先を作れません: {exc}'})
        env = dict(os.environ, PLANTUML_OUT=str(dest_dir))
        try:
            proc = subprocess.run(
                ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                 '-File', str(FETCH_SCRIPT)],
                cwd=str(dest_dir), capture_output=True, timeout=600, env=env,
                **_SUBPROCESS_KWARGS,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            return self._send_json(500, {'error': f'取得に失敗しました: {exc}'})
        out = (proc.stdout or b'').decode('utf-8', 'replace') + (proc.stderr or b'').decode('utf-8', 'replace')
        got = dest_dir / 'plantuml.jar'
        if proc.returncode != 0 or not got.is_file():
            return self._send_json(500, {'error': '取得に失敗しました', 'log': out[-2000:]})
        ok, msg = use_jar(got)
        if not ok:
            return self._send_json(500, {'error': msg, 'log': out[-2000:]})
        self._send_json(200, {'jarPath': msg, 'env': detect_env()})

    # --- native save (BLK-human-20260909-2200) -------------------------------

    def _handle_native_save_post(self):
        """アプリ版: 保存ダイアログを出して書く。Web 版は 409 (呼び出し側が download に落ちる)。"""
        if NATIVE_DIALOG is None:
            return self._send_json(409, {'error': 'ネイティブ保存はアプリ版だけで使えます'})
        data = self._read_json_object()
        if data is None:
            return
        name = str(data.get('fileName') or '').strip()
        if not name:
            return self._send_json(400, {'error': 'fileName が必要です'})
        if 'base64' in data:
            try:
                blob = base64.b64decode(str(data.get('base64') or ''), validate=True)
            except (ValueError, binascii.Error):
                return self._send_json(400, {'error': 'base64 が壊れています'})
        else:
            blob = str(data.get('text') or '').encode('utf-8')
        target = NATIVE_DIALOG.save_file(name)
        if not target:
            return self._send_json(200, {'canceled': True})
        try:
            Path(target).write_bytes(blob)
        except OSError as exc:
            return self._send_json(500, {'error': f'保存できません: {exc}'})
        self._send_json(200, {'path': str(target)})

    # --- open local .puml (BLK-human-20260917-0901) -------------------------

    def _handle_native_open_post(self):
        """アプリ版: 開くダイアログ (複数選択) で選んだ .puml を読んで返す。Web 版は 409。"""
        if NATIVE_DIALOG is None:
            return self._send_json(409, {'error': 'ファイルダイアログはアプリ版だけで使えます'})
        picker = getattr(NATIVE_DIALOG, 'open_files', None)
        if picker is None:
            one = NATIVE_DIALOG.open_file('.puml を開く', OPEN_FILE_TYPES)
            picked = [one] if one else []
        else:
            picked = picker('.puml を開く', OPEN_FILE_TYPES)
        if not picked:
            return self._send_json(200, {'canceled': True, 'files': []})
        files = []
        for path in picked:
            try:
                files.append(read_source_file(path))
            except (OSError, ValueError) as exc:
                files.append({'path': str(path), 'name': Path(path).name, 'error': str(exc)})
        self._send_json(200, {'files': files})

    def _handle_native_write_post(self):
        """開いた元のファイルへ書き戻す。{path, text, encoding, bom}。"""
        data = self._read_json_object()
        if data is None:
            return
        ok, result = write_source_file(data.get('path'), data.get('text'),
                                       data.get('encoding'), data.get('bom'))
        if not ok:
            return self._send_json(400, {'error': result})
        self._send_json(200, {'path': result})

    def _json_charset(self):
        """応答本文の文字コードを呼ぶ側の希望から決める (BLK-reviewer-20260914-1606)。

        `?charset=` を優先し、無ければ `Accept-Charset` の先頭を見る。知らない名前は
        既定の utf-8。戻り値は (Content-Type に書く名前, python の codec 名)。
        """
        want = ''
        try:
            vals = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('charset')
        except ValueError:
            vals = None
        if vals:
            want = vals[0]
        if not want:
            want = (self.headers.get('Accept-Charset') or '').split(',')[0].split(';')[0]
        return JSON_CHARSETS.get(want.strip().lower(), JSON_CHARSETS[''])

    def _send_json(self, code, payload):
        # BLK-reviewer-20260907-0043: エラーメッセージも API 仕様も日本語なので、
        # エスケープに潰さずそのまま読める形で返す (curl から読む窓口である)。
        # BLK-reviewer-20260914-1606: 既定は utf-8 のまま、呼ぶ側が ascii / cp932 を選べる。
        label, codec = self._json_charset()
        text = json.dumps(payload, ensure_ascii=(codec == 'ascii'))
        # cp932 に無い文字 (絵文字・⇄ など) は \uXXXX に逃がす。宣言した文字コードで
        # 必ず decode できる形にして、「宣言と実バイト列が食い違う」を作らない。
        body = text.encode(codec, 'backslashreplace')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=%s' % label)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass

    # --- prefs ---------------------------------------------------------------

    def _handle_prefs_post(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        self._send_json(200, write_prefs(data))

    # --- autosave helpers ----------------------------------------------------

    def _handle_git_get(self):
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        name = params.get('file', '')
        if name and not self._autosave_validate_type(name):
            return self._send_json(400, {'error': 'invalid file'})
        route = parsed.path
        if route == '/git-status':
            return self._send_json(200, git_status(save_dir))
        if route == '/git-log':
            return self._send_json(200, git_log(save_dir, name))
        if route == '/git-refs':
            return self._send_json(200, git_refs(save_dir))
        if not name:
            return self._send_json(400, {'error': 'file が要ります'})
        text = git_show(save_dir, params.get('rev', ''), name)
        if text is None:
            return self._send_json(404, {'error': 'そのコミットにこの図はありません'})
        return self._send_json(200, {'text': text})

    def _handle_git_post(self):
        data = self._read_json_object()
        if data is None:
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        if self.path == '/git-commit':
            with _fs_lock:
                ok, res = git_commit(save_dir, data.get('message', ''))
        else:
            ok, res = git_net(save_dir, self.path[len('/git-'):], data.get('branch', ''))
        return self._send_json(200 if ok else 409, res)

    def _autosave_resolve_dir(self, raw):
        """Resolve an autosave dir argument to an absolute Path. Empty/None → default."""
        if not raw:
            return AUTOSAVE_DEFAULT_DIR
        return Path(raw).expanduser().resolve()

    def _handle_peek_dirs(self):
        """BLK-junior-20260908-0723: 他ペルソナの図を「読むだけ」で見るための行き先一覧。

        保存先ディレクトリの隣にあるフォルダ (と自分自身) を、.puml の枚数と一緒に返す。
        保存先を打ち直させないためだけの口なので、親より上は辿らないし、書き込みもしない。
        """
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        cur = self._autosave_resolve_dir(params.get('dir'))
        parent = cur.parent
        entries = []
        seen = set()

        def add(path):
            key = str(path)
            if key in seen:
                return
            seen.add(key)
            try:
                if not (path.exists() and path.is_dir()):
                    return
                count = sum(1 for f in path.iterdir() if f.is_file() and f.suffix.lower() == '.puml')
            except OSError:
                return
            entries.append({'name': path.name, 'path': key, 'files': count,
                            'current': key == str(cur)})

        add(cur)
        try:
            for child in sorted(parent.iterdir(), key=lambda p: p.name.lower()):
                if child.is_dir():
                    add(child)
        except OSError:
            pass
        # 図が 1 枚も無いフォルダは行き先にならない (自分の保存先だけは空でも残す)。
        entries = [e for e in entries if e['files'] > 0 or e['current']]
        self._send_json(200, {'current': str(cur), 'parent': str(parent), 'dirs': entries})

    def _handle_peek_notes(self):
        """BLK-junior-20260913-0306-wish: 隣のフォルダに置かれた指摘 (.md) を読む。

        reviewer の指摘は `.puml` ではないので /peek-dirs の行き先にも
        /autosave の一覧にも出ない (指摘.md だけのフォルダは図が 0 枚)。
        GUI から指摘を 1 件ずつ選べるようにするには本文が要るので、ここで
        「保存先とその兄弟フォルダの直下にある .md」だけを読んで返す。
        読むだけの口で、親より上は辿らないし書き込みもしない。
        """
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        cur = self._autosave_resolve_dir(params.get('dir'))
        notes = []
        seen = set()
        # 1 ファイルの上限。指摘は人が書く文章なので、これを超えるものは
        # 指摘ではない (巨大な生成物を GUI へ流し込まない)。
        limit = 256 * 1024

        def add_dir(path):
            key = str(path)
            if key in seen:
                return
            seen.add(key)
            try:
                if not (path.exists() and path.is_dir()):
                    return
                files = sorted(
                    (f for f in path.iterdir() if f.is_file() and f.suffix.lower() == '.md'),
                    key=lambda f: f.name.lower())
            except OSError:
                return
            for f in files:
                try:
                    if f.stat().st_size > limit:
                        continue
                    text = f.read_text(encoding='utf-8', errors='replace')
                except OSError:
                    continue
                notes.append({'folder': path.name, 'dir': str(path), 'name': f.name,
                              'path': str(f), 'text': text,
                              'current': str(path) == str(cur)})

        add_dir(cur)
        try:
            for child in sorted(cur.parent.iterdir(), key=lambda p: p.name.lower()):
                if child.is_dir():
                    add_dir(child)
        except OSError:
            pass
        self._send_json(200, {'current': str(cur), 'notes': notes})

    def _autosave_validate_type(self, dt):
        """Return True if dt is a safe filename component."""
        return is_safe_autosave_name(dt)

    def _autosave_meta_path(self, save_dir):
        return save_dir / '_meta.json'

    def _roles_path(self, save_dir):
        """BLK-reviewer-20260908-0203-wish: ファイルが実データかテンプレかの宣言。

        保存フォルダの隣に置く。GUI の設定ではなくフォルダの属性なので、
        別の PC で開いても・audit.js から読んでも同じ答えになる。
        """
        return save_dir / '_roles.json'

    def _kinds_path(self, save_dir):
        """BLK-junior-20260912-2103-wish: 保存したときの図種の控え。

        本文からの判定 (dsl_kind) は「別図種と紛らわしい書き方」で外れる
        (actor を持ち、ラベルに括弧の付くシーケンスはユースケースに見える)。
        保存した側が知っている図種をフォルダの属性として残し、開くときはこれを使う。
        図の本文には足さない (puml をバイトで突き合わせるレビューを濁らせないため)。
        """
        return save_dir / '_kinds.json'

    def _read_saved_kinds(self, save_dir):
        p = self._kinds_path(save_dir)
        if not p.exists():
            return {}
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return {}
        kinds = data.get('kinds') if isinstance(data, dict) else None
        if not isinstance(kinds, dict):
            return {}
        return {k: v for k, v in kinds.items()
                if isinstance(k, str) and v in DIAGRAM_KIND_SLUGS}

    def _note_saved_kind(self, save_dir, name, kind):
        """1 枚分の控えを書き足す。図種が読めない保存は前の控えを消さない。

        呼び出し元 (do_POST) が既に _fs_lock を持っているのでここでは取らない
        (threading.Lock は入れ子にできず、取ると保存が固まる)。
        """
        if kind not in DIAGRAM_KIND_SLUGS:
            return
        kinds = self._read_saved_kinds(save_dir)
        if kinds.get(name) == kind:
            return
        kinds[name] = kind
        try:
            self._kinds_path(save_dir).write_text(
                json.dumps({'kinds': kinds}, ensure_ascii=False), encoding='utf-8')
        except OSError:
            pass  # 控えは best-effort。書けなくても保存そのものは通す

    def _export_log_path(self, save_dir):
        """BLK-primary-20260909-0003-wish: 「いつ・どの版で何を客先に出したか」の控え。

        図の隣に置く。ブラウザの localStorage に置いていたときは、開き直す・
        別の端末で開くたびに控えが消え、同じフォルダで何度出しても毎回
        「初回提出」になっていた。控えはフォルダの属性なので図に従う。
        """
        return save_dir / '_export-log.json'

    def _read_export_log(self, save_dir):
        p = self._export_log_path(save_dir)
        if not p.exists():
            return None
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return None
        return data if isinstance(data, dict) else None

    def _read_file_roles(self, save_dir):
        p = self._roles_path(save_dir)
        if not p.exists():
            return {}
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return {}
        roles = data.get('roles') if isinstance(data, dict) else None
        return roles if isinstance(roles, dict) else {}

    @classmethod
    def _strip_svg_stamp(cls, svg_bytes):
        """書き出し元の印を外した svg。描画の結果と比べられる形にする。

        BLK-reviewer-20260908-1903-wish: 印の前の改行だけを見て探すと、CRLF に
        変換されて保存された svg (Windows の write_text の既定) では印が見つからず、
        印を含んだままバイト比較して全件 differ になる。改行の形は問わずに探し、
        直前の改行も一緒に外す。
        """
        mark = cls.SVG_STAMP_PREFIX.encode('utf-8')
        at = svg_bytes.rfind(mark)
        if at < 0:
            return svg_bytes
        while at > 0 and svg_bytes[at - 1:at] in (b'\n', b'\r'):
            at -= 1
        return svg_bytes[:at]

    @staticmethod
    def _svg_text_labels(svg_bytes):
        """svg に実際に書かれている文字列 (text 要素の中身) を、出てくる順に重複なく。

        BLK-reviewer-20260908-1203-wish: 食い違いの中身を言うには「その svg に何と
        書いてあるか」が要る。svg 全文を返すと 1 枚あたり数百 KB になるので、
        描かれている文字だけを抜いて渡す。読めない svg は空で返す (落とさない)。
        """
        try:
            text = svg_bytes.decode('utf-8', errors='replace')
        except Exception:
            return []
        out, seen = [], set()
        for raw in re.findall(r'<text[^>]*>(.*?)</text>', text, re.S):
            s = re.sub(r'<[^>]*>', '', raw)
            # PlantUML は ASCII 以外を数値参照 (&#21463; など) で書く。
            # 戻さないと「受注サービス」が図の中に無いことになってしまう。
            s = re.sub(r'&#(x[0-9a-fA-F]+|[0-9]+);',
                       lambda m: chr(int(m.group(1)[1:], 16) if m.group(1)[0] in 'xX'
                                     else int(m.group(1))), s)
            s = (s.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
                  .replace('&apos;', "'").replace('&amp;', '&')).strip()
            if not s or s in seen:
                continue
            seen.add(s)
            out.append(s)
            if len(out) >= MAX_DIFF_LABELS:
                break
        return out

    # BLK-reviewer-20260908-1303: 文字に現れない差 (矢印の向き・note の位置・
    # 要素の並び) を数として掴むための、図形の内訳。svg 全文を GUI に渡さずに
    # 「保存中の svg と、今 描いた svg で何個違うか」を言えるようにする。
    SHAPE_TAGS = ('path', 'polygon', 'line', 'rect', 'ellipse', 'circle', 'text', 'polyline')

    @classmethod
    def _svg_shape_counts(cls, svg_bytes):
        """svg に含まれる図形要素をタグごとに数える。読めない svg は空で返す。"""
        try:
            text = svg_bytes.decode('utf-8', errors='replace')
        except Exception:
            return {}
        out = {}
        for tag in cls.SHAPE_TAGS:
            n = len(re.findall(r'<%s[\s/>]' % tag, text))
            if n:
                out[tag] = n
        return out

    def _svg_verify_path(self, save_dir):
        """BLK-reviewer-20260908-1103-wish: 「この svg は本当に今の puml の姿か」の控え。

        時刻ではなく指紋で持つ。{name: {pumlHash, svgHash, result, at}} で、
        突き合わせた 2 つの指紋も一緒に控えるので、あとで puml か svg が動けば
        その控えは今の 2 つについては何も言っていないことが GUI 側で分かる。
        """
        return save_dir / '_svg-verify.json'

    def _read_svg_verify(self, save_dir):
        p = self._svg_verify_path(save_dir)
        if not p.exists():
            return {}
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return {}
        recs = data.get('verified') if isinstance(data, dict) else None
        return recs if isinstance(recs, dict) else {}

    def _write_svg_verify(self, save_dir, records):
        try:
            self._svg_verify_path(save_dir).write_text(
                json.dumps({'verified': records}, ensure_ascii=False), encoding='utf-8')
        except OSError:
            pass  # 控えは best-effort。書けなければ次に確かめ直すだけ

    def _autosave_file_path(self, save_dir, dt):
        return save_dir / (dt + '.puml')

    # --- 版の控え (BLK-junior-20260908-2003) ---------------------------------
    #
    # 保存は「図の名前 = ファイル名」で、同じ名前に別の図を書けば前の中身は
    # 黙って消える。名前を既定の diagram1 のまま図種だけ変えて作業を続けると、
    # 完走した図が次の周で上書きされ、保存フォルダには最後の 1 枚しか残らない。
    # 上書きの直前に前の中身を `_versions/` へ退避しておけば、消えた図は
    # 一覧から開き直せる。退避は保存の副作用なので、失敗しても保存は止めない。
    VERSIONS_DIRNAME = '_versions'
    VERSIONS_KEEP = 20      # 1 図あたりに残す版の数 (古いものから捨てる)
    VERSION_SEP = '--'      # {name}--{YYYYMMDD-HHMMSS}.puml

    def _versions_dir(self, save_dir):
        return save_dir / self.VERSIONS_DIRNAME

    def _version_path(self, save_dir, dt, stamp):
        return self._versions_dir(save_dir) / (dt + self.VERSION_SEP + stamp + '.puml')

    @staticmethod
    def _stamp_key(stamp):
        """刻印を並べ替えの鍵にする。

        BLK-primary-20260916-0100: 同じ秒の 2 本目以降は `20260914-001159.2` の
        ように連番が付く。文字列のまま並べると `.2` が `.18` より新しいことに
        なり、一覧の「新しい順」が嘘になるうえ、上限を超えた分を捨てるときに
        **どれが古いのかを取り違えて、まだ中身のある版を先に捨てる**。
        連番は数として読む。
        """
        base, sep, suffix = str(stamp).partition('.')
        try:
            n = int(suffix) if sep else 0
        except ValueError:
            n = 0
        return (base, n)

    def _version_stamps(self, save_dir, dt):
        """`dt` の過去版の刻印を新しい順に返す。無ければ空リスト。"""
        vdir = self._versions_dir(save_dir)
        prefix = dt + self.VERSION_SEP
        stamps = []
        try:
            for p in vdir.glob('*.puml'):
                if p.stem.startswith(prefix):
                    stamps.append(p.stem[len(prefix):])
        except OSError:
            return []
        stamps.sort(key=self._stamp_key, reverse=True)
        return stamps

    def _version_counts(self, save_dir):
        """図名 → 控えてある版の数。一覧に「履歴 N」を出すために 1 回だけ数える。"""
        counts = {}
        try:
            for p in self._versions_dir(save_dir).glob('*.puml'):
                head = p.stem.rsplit(self.VERSION_SEP, 1)
                if len(head) != 2:
                    continue
                counts[head[0]] = counts.get(head[0], 0) + 1
        except OSError:
            pass
        return counts

    # 1 版あたりに一覧へ載せる本文の上限。これを超える控えは差分の材料に
    # しない (一覧の応答に巨大な生成物を紛れ込ませない)。
    PREV_TEXT_LIMIT = 256 * 1024

    def _attach_prev_version(self, save_dir, entry):
        """一覧の 1 行に「直前の退避版」の刻印と本文を足す。

        BLK-junior-20260914-1306-wish: 先輩の図を取り込む側が要るのは
        「前回保存から何が増え何が消えたか」で、判定の材料は直前版 1 つで足りる
        (20 版すべてを運ぶ必要はない)。控えが無い図は刻印も本文も付けない ——
        付けないこと自体が「このフォルダで初めての保存」を意味する。
        """
        entry['prevStamp'] = None
        entry['prevText'] = None
        stamps = self._version_stamps(save_dir, entry.get('name', ''))
        if not stamps:
            return
        path = self._version_path(save_dir, entry['name'], stamps[0])
        try:
            if path.stat().st_size > self.PREV_TEXT_LIMIT:
                entry['prevStamp'] = stamps[0]
                return
            entry['prevText'] = path.read_text(encoding='utf-8')
        except OSError:
            return
        entry['prevStamp'] = stamps[0]

    def _stash_version(self, save_dir, dt, new_dsl):
        """上書きの直前に、今ある中身を `_versions/` へ退避する。

        中身が変わらない保存 (自動保存は何度も走る) では版を増やさない。
        増やすと 1 分で上限に達し、本当に別物だった版から先に捨ててしまう。
        """
        file_path = self._autosave_file_path(save_dir, dt)
        try:
            if not file_path.exists():
                return
            old = file_path.read_text(encoding='utf-8')
        except OSError:
            return
        if old == new_dsl:
            return
        vdir = self._versions_dir(save_dir)
        try:
            vdir.mkdir(parents=True, exist_ok=True)
            stamp = time.strftime('%Y%m%d-%H%M%S', time.gmtime())
            target = self._version_path(save_dir, dt, stamp)
            # 同じ秒に 2 回保存しても前の退避を潰さない (末尾に連番を足す)。
            n = 1
            while target.exists():
                target = self._version_path(save_dir, dt, '%s.%d' % (stamp, n))
                n += 1
            _atomic_write_text(target, old)
        except OSError:
            return
        # 上限を超えた分は古い方から捨てる。
        stamps = self._version_stamps(save_dir, dt)
        for old_stamp in stamps[self.VERSIONS_KEEP:]:
            try:
                self._version_path(save_dir, dt, old_stamp).unlink()
            except OSError:
                pass

    def _handle_autosave_versions(self):
        """GET /autosave-versions?dir=&type=[&stamp=] — 過去版の一覧、または 1 版の本文。"""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        dt = params.get('type', '')
        if not self._autosave_validate_type(dt):
            self._send_json(400, {'error': 'invalid type — パス区切り・制御文字・Windows の禁止文字は使えません'})
            return
        stamp = params.get('stamp', '')
        if stamp:
            if not is_safe_autosave_name(stamp):
                self._send_json(400, {'error': 'invalid stamp'})
                return
            path = self._version_path(save_dir, dt, stamp)
            if not path.exists():
                self.send_error(404, 'version not found')
                return
            try:
                content = path.read_text(encoding='utf-8')
            except OSError as e:
                self._send_json(500, {'error': f'read failed: {e}'})
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            return
        versions = []
        for s in self._version_stamps(save_dir, dt):
            path = self._version_path(save_dir, dt, s)
            item = {'stamp': s, 'size': None, 'lines': None, 'head': ''}
            try:
                text = path.read_text(encoding='utf-8')
            except OSError:
                versions.append(item)
                continue
            item['size'] = len(text.encode('utf-8'))
            item['lines'] = len(text.splitlines())
            # 図種が変わって消えた版を見分けるのに要るのは最初の宣言行だけ。
            # 本文全部を一覧に載せると、20 版で数百 KB を毎回運ぶことになる。
            item['head'] = _version_head(text)
            # BLK-owner-20260923-2312-prune: 「この図の履歴」は前の版に戻った「往復」に印を付ける。
            # 本文を運ばずに中身の一致を言えるよう、改行・行末の空白・末尾の空行を無視した中身の sha1 を添える。
            item['hash'] = _version_hash(text)
            versions.append(item)
        self._send_json(200, {'name': dt, 'dir': str(save_dir), 'versions': versions})

    # --- 混入点の検索 (BLK-primary-20260915-0506-wish) ------------------------
    #
    # 不具合対応では「この部品名がいつの版から入ったか」を知りたい。今までは
    # /autosave-versions を図ごとに引き、返ってきた版を 1 つずつ開いて中身を
    # 読み比べるしかなく、開く回数が「図の枚数 × 版数」で増えていた。
    # ここは保存フォルダの全図・全版を 1 回で走査し、**語が当たった行だけ**を返す。
    # 版と版の突き合わせ (どこで増えたか) は GUI 側 (blame-point.js) の仕事なので、
    # server は数えて抜き出すところまでしかやらない。本文全部は返さない
    # (14 枚 × 20 版の本文を毎回運ぶと、それ自体が待ち時間になる)。
    SEARCH_TERMS_MAX = 6        # 1 回に突き合わせる語の数 (混在は 2〜3 語で足りる)
    SEARCH_LINES_PER_VERSION = 40   # 1 版から返す当たり行の上限

    def _search_hits(self, text, terms):
        """本文 → 語ごとの出現数と、当たった行 (行番号つき)。"""
        counts = [0] * len(terms)
        lines = []
        for no, line in enumerate(str(text or '').splitlines(), 1):
            hit = False
            for i, t in enumerate(terms):
                c = line.count(t)
                if c:
                    counts[i] += c
                    hit = True
            if hit and len(lines) < self.SEARCH_LINES_PER_VERSION:
                lines.append({'no': no, 'text': line.rstrip()[:200]})
        return counts, lines

    def _handle_version_search(self):
        """GET /version-search?dir=&q= — 保存フォルダの全図の版から語を探す。

        `q` は空白区切りの語 (混在を見るので複数可)。返すのは図ごとの
        「古い順の版 + いまの中身」で、各版に語ごとの出現数と当たり行が付く。
        """
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        raw = params.get('q', '')
        terms = [t for t in str(raw).split() if t][:self.SEARCH_TERMS_MAX]
        if not terms:
            self._send_json(400, {'error': 'q is required — 探す部品名を 1 つ以上'})
            return
        names = []
        try:
            for p in sorted(save_dir.iterdir(), key=lambda x: x.name.lower()):
                if p.is_file() and p.suffix.lower() == '.puml':
                    names.append(p.stem)
        except OSError:
            names = []
        files = []
        scanned = 0
        for name in names:
            versions = []
            # 古い順。刻印は昇順に並べれば時系列になる (server は同じ書式で打つ)。
            for stamp in sorted(self._version_stamps(save_dir, name)):
                try:
                    text = self._version_path(save_dir, name, stamp).read_text(encoding='utf-8')
                except OSError:
                    continue
                counts, lines = self._search_hits(text, terms)
                versions.append({'stamp': stamp, 'current': False,
                                 'counts': counts, 'lines': lines})
                scanned += 1
            try:
                text = (save_dir / (name + '.puml')).read_text(encoding='utf-8')
            except OSError:
                text = ''
            counts, lines = self._search_hits(text, terms)
            versions.append({'stamp': '', 'current': True,
                             'counts': counts, 'lines': lines})
            scanned += 1
            files.append({'name': name, 'versions': versions})
        self._send_json(200, {'terms': terms, 'dir': str(save_dir),
                              'files': files, 'scanned': scanned})

    # --- 版と版の全文 (BLK-primary-20260915-0606-wish) ------------------------
    #
    # 混入点は「語が当たった行」しか返さないので、原因を直すのに要る前後の文脈が
    # 出ない。今まではその版を開き、直前の版も開いて目で照合する 2 手が要り、
    # 部品数 × 該当版数ぶん積み上がっていた。ここは 1 回の要求で「その版」と
    # 「直前の版」の本文を組で返す。突き合わせ自体は GUI 側 (version-diff.js)。

    def _handle_version_diff(self):
        """GET /version-diff?dir=&type=[&stamp=] — その版と直前の版の本文。

        `stamp` を省くと「いまの中身」と最新の控えを比べる。最古の控えを指した
        ときは直前が無いので prev を null、before を空にして first を立てる。
        """
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        dt = params.get('type', '')
        if not self._autosave_validate_type(dt):
            self._send_json(400, {'error': 'invalid type — パス区切り・制御文字・Windows の禁止文字は使えません'})
            return
        stamp = params.get('stamp', '')
        if stamp and not is_safe_autosave_name(stamp):
            self._send_json(400, {'error': 'invalid stamp'})
            return
        stamps = sorted(self._version_stamps(save_dir, dt))

        def read(path):
            try:
                return path.read_text(encoding='utf-8')
            except OSError:
                return None

        if stamp:
            if stamp not in stamps:
                self._send_json(404, {'error': 'version not found — その版は残っていません'})
                return
            after = read(self._version_path(save_dir, dt, stamp))
            if after is None:
                self._send_json(500, {'error': 'read failed'})
                return
            idx = stamps.index(stamp)
            prev = stamps[idx - 1] if idx > 0 else None
        else:
            after = read(save_dir / (dt + '.puml'))
            if after is None:
                self._send_json(404, {'error': 'diagram not found — その図は保存フォルダにありません'})
                return
            prev = stamps[-1] if stamps else None
        before = ''
        if prev is not None:
            got = read(self._version_path(save_dir, dt, prev))
            if got is None:
                prev = None
            else:
                before = got
        self._send_json(200, {
            'name': dt, 'dir': str(save_dir),
            'stamp': stamp, 'current': not stamp,
            'prev': prev, 'first': prev is None,
            'before': before, 'after': after,
        })

    # --- 提出物庫 (BLK-junior-20260908-2203-wish) -----------------------------
    #
    # `_versions/` はファイル名ごとの控えなので、「周を 1 つ完走して画像を出した」
    # という区切りは残らない。名前を既定の diagram1 のまま次の周を始めれば、
    # 完走した図は上書きの控えとして 20 版の中に紛れ、どれが提出物かは分からない。
    # 提出物庫は「画像を書き出した瞬間の DSL」をファイル名と無関係な刻印で積む
    # だけの、追記しかしない置き場。上書きも削除もしないので前回分は消えない。
    VAULT_DIRNAME = '_vault'

    def _vault_dir(self, save_dir):
        return save_dir / self.VAULT_DIRNAME

    def _vault_paths(self, save_dir, stamp):
        vdir = self._vault_dir(save_dir)
        return vdir / (stamp + '.puml'), vdir / (stamp + '.json')

    def _vault_entries(self, save_dir):
        """庫にある提出物を新しい順に。刻印が名前なので、並べ替えは名前順でよい。"""
        out = []
        try:
            paths = sorted(self._vault_dir(save_dir).glob('*.json'), reverse=True)
        except OSError:
            return out
        for p in paths:
            try:
                meta = json.loads(p.read_text(encoding='utf-8'))
            except (ValueError, OSError):
                continue
            if not isinstance(meta, dict):
                continue
            meta['stamp'] = p.stem
            out.append(meta)
        return out

    def _handle_vault_get(self):
        """GET /vault?dir=[&stamp=] — 提出物の一覧、または 1 件の DSL 本文。"""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        stamp = params.get('stamp', '')
        if stamp:
            if not is_safe_autosave_name(stamp):
                self._send_json(400, {'error': 'invalid stamp'})
                return
            puml, _meta = self._vault_paths(save_dir, stamp)
            if not puml.exists():
                self.send_error(404, 'vault entry not found')
                return
            try:
                content = puml.read_text(encoding='utf-8')
            except OSError as e:
                self._send_json(500, {'error': f'read failed: {e}'})
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            return
        self._send_json(200, {'dir': str(save_dir), 'entries': self._vault_entries(save_dir)})

    def _handle_vault_post(self):
        """POST /vault {dir, dsl, name, title, subject, kind, format} — 1 件積む。

        書き出しの副作用なので、失敗しても画像の書き出しは止めない (GUI 側で握る)。
        """
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        dsl = data.get('dsl')
        if not isinstance(dsl, str) or dsl.strip() == '':
            self._send_json(400, {'error': 'dsl must be a non-empty string'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        vdir = self._vault_dir(save_dir)
        try:
            vdir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            self._send_json(500, {'error': f'mkdir failed: {e}'})
            return
        stamp = time.strftime('%Y%m%d-%H%M%S', time.gmtime())
        puml, meta_path = self._vault_paths(save_dir, stamp)
        n = 1
        while puml.exists():
            puml, meta_path = self._vault_paths(save_dir, '%s.%d' % (stamp, n))
            n += 1
        meta = {
            'name': str(data.get('name') or ''),
            'title': str(data.get('title') or ''),
            'subject': str(data.get('subject') or ''),
            'kind': str(data.get('kind') or ''),
            'format': str(data.get('format') or ''),
            'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'lines': len(dsl.splitlines()),
        }
        try:
            _atomic_write_text(puml, dsl)
            meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        meta['stamp'] = puml.stem
        self._send_json(200, {'dir': str(save_dir), 'entry': meta})

    # --- 変更チケット (BLK-primary-20260909-0603-wish) ------------------------
    #
    # 依存グラフの影響一覧はモーダルを閉じると消えるので、1 つの仕様変更が
    # 数日・複数 run にまたがると「15 枚のうちどこまで直したか」を持ち越せない。
    # 札を保存フォルダに置くのは、run をまたぐ・ペルソナをまたぐため
    # (localStorage では reviewer が読めず、指摘.md への転記が要る)。
    # 図と同じ階層に置くと作業ファイルに紛れるので `_tickets/` に隔離する。
    TICKETS_DIRNAME = '_tickets'

    def _tickets_dir(self, save_dir):
        return save_dir / self.TICKETS_DIRNAME

    def _tickets_entries(self, save_dir):
        out = []
        try:
            paths = sorted(self._tickets_dir(save_dir).glob('*.json'))
        except OSError:
            return out
        for p in paths:
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
            except (ValueError, OSError):
                continue
            if not isinstance(data, dict):
                continue
            data['id'] = p.stem
            out.append(data)
        return out

    def _handle_tickets_get(self):
        """GET /tickets?dir= — その保存フォルダの変更チケット全件."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        self._send_json(200, {'dir': str(save_dir), 'tickets': self._tickets_entries(save_dir)})

    def _handle_tickets_post(self):
        """POST /tickets {dir, ticket} — 1 枚まるごと置き換える。

        差分ではなく全文で書くのは、直した印を 1 個立てるたびに
        server 側で札を組み直さないため (組み立ての正本は change-ticket.js の 1 か所)。
        """
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        ticket = data.get('ticket')
        if not isinstance(ticket, dict):
            self._send_json(400, {'error': 'ticket must be an object'})
            return
        ticket_id = ticket.get('id')
        if not isinstance(ticket_id, str) or not is_safe_autosave_name(ticket_id):
            self._send_json(400, {'error': 'invalid ticket id'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        tdir = self._tickets_dir(save_dir)
        try:
            tdir.mkdir(parents=True, exist_ok=True)
            (tdir / (ticket_id + '.json')).write_text(
                json.dumps(ticket, ensure_ascii=False, indent=1), encoding='utf-8')
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'ticket': ticket})

    def _handle_tickets_delete(self):
        """DELETE /tickets?dir=&id= — 済んだ札を畳む."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        ticket_id = params.get('id', '')
        if not is_safe_autosave_name(ticket_id):
            self._send_json(400, {'error': 'invalid ticket id'})
            return
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        try:
            (self._tickets_dir(save_dir) / (ticket_id + '.json')).unlink()
        except OSError:
            pass
        self._send_json(200, {'ok': True})

    # --- 手本なしの確定 (BLK-junior-20260916-2314-wish) -------------------------
    #
    # 👀他フォルダで「相手に ○○ 図は 0 枚。対応不要として控えますか」と聞かれる答えは、
    # 開いている 1 枚の図の中にしか残らず、次の周に別の図を開くとまた同じ質問が出た。
    # 「この相手のこの図種は手本なし」は図 1 枚ではなく保存フォルダの決めごとなので、
    # フォルダ側に置き、ブラウザや図が替わっても聞き直さない。
    PEEK_SETTLED_DIRNAME = '_peek'
    PEEK_SETTLED_MAX = 200

    def _peek_settled_path(self, save_dir):
        return save_dir / self.PEEK_SETTLED_DIRNAME / 'settled.json'

    def _read_peek_settled(self, save_dir):
        try:
            data = json.loads(self._peek_settled_path(save_dir).read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return []
        rows = data.get('entries') if isinstance(data, dict) else None
        if not isinstance(rows, list):
            return []
        return [r for r in rows if isinstance(r, dict) and r.get('peer') and r.get('kind')]

    def _handle_peek_settled_get(self):
        """GET /peek-settled?dir= — 手本なしで確定した (相手, 図種) の一覧."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        self._send_json(200, {'dir': str(save_dir), 'entries': self._read_peek_settled(save_dir)})

    def _handle_peek_settled_post(self):
        """POST /peek-settled {dir, peer, kind, settled} — 確定を足す / 外す."""
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        if data.get('clear') is True:
            rows = []
        else:
            peer = data.get('peer')
            kind = data.get('kind')
            if not isinstance(peer, str) or not isinstance(kind, str) or not peer or not kind:
                self._send_json(400, {'error': 'peer and kind must be non-empty strings',
                                      'expected': '{dir, peer, kind, settled} | {dir, clear: true}'})
                return
            rows = [r for r in self._read_peek_settled(save_dir)
                    if not (r.get('peer') == peer and r.get('kind') == kind)]
            if data.get('settled', True) is not False:
                rows.insert(0, {'peer': peer, 'kind': kind,
                                'count': int(data.get('count') or 0),
                                'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
            rows = rows[:self.PEEK_SETTLED_MAX]
        path = self._peek_settled_path(save_dir)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(path, json.dumps({'entries': rows}, ensure_ascii=False, indent=1))
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'entries': rows})

    # --- 置換の組 (BLK-primary-20260914-1306-friction) ------------------------
    #
    # 「過去に当てた置換の組」は localStorage にしか無かったので、ブラウザを
    # 変える・プロファイルが新しくなるだけで消え、同じ SpiDrv → Spi_Driver を
    # 毎回打ち直すことになっていた。組は図と同じく保存フォルダの持ち物なので、
    # フォルダ側に置く。当たらなかった組 (hits 0) も残すのは、「もう残っていない
    # ことを確かめるためだけの空打ち」こそ消したい手数だから。
    RENAMES_DIRNAME = '_renames'
    RENAMES_MAX = 200

    def _renames_path(self, save_dir):
        return save_dir / self.RENAMES_DIRNAME / 'pairs.json'

    def _read_rename_pairs(self, save_dir):
        try:
            data = json.loads(self._renames_path(save_dir).read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return []
        if not isinstance(data, dict):
            return []
        pairs = data.get('pairs')
        return [p for p in pairs if isinstance(p, dict)] if isinstance(pairs, list) else []

    def _handle_rename_pairs_get(self):
        """GET /rename-pairs?dir= — その保存フォルダで打たれた置換の組."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        self._send_json(200, {'dir': str(save_dir), 'pairs': self._read_rename_pairs(save_dir)})

    def _handle_rename_pairs_post(self):
        """POST /rename-pairs {dir, from, to, hits} — 組を 1 つ覚える (新しい順)."""
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        src = data.get('from')
        dst = data.get('to')
        if not isinstance(src, str) or not isinstance(dst, str) or not src or not dst:
            self._send_json(400, {'error': 'from and to must be non-empty strings'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        entry = {
            'from': src,
            'to': dst,
            'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'hits': int(data.get('hits') or 0),
        }
        # 同じ組は 1 行。打ち直すたびに先頭へ上がるので、最近の関心が上に並ぶ。
        pairs = [p for p in self._read_rename_pairs(save_dir)
                 if not (p.get('from') == src and p.get('to') == dst)]
        pairs.insert(0, entry)
        pairs = pairs[:self.RENAMES_MAX]
        path = self._renames_path(save_dir)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(path, json.dumps({'pairs': pairs}, ensure_ascii=False, indent=1))
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'pairs': pairs})

    # --- 資料セット (BLK-primary-20260914-2006-wish) --------------------------
    #
    # 「全図を SVG で保存 (zip)」の対象は開いているタブだけで、保存フォルダに
    # 25 枚あってもタブが 1 枚なら 1 枚しか入らなかった。資料に入れる図の組は
    # タブの状態ではなく利用者の決めごとなので、名前を付けてフォルダ側に置く。
    # 図と同じフォルダの持ち物なので、ブラウザやプロファイルが変わっても残る。
    SETS_DIRNAME = '_sets'
    SETS_MAX = 50

    def _sets_path(self, save_dir):
        return save_dir / self.SETS_DIRNAME / 'sets.json'

    def _read_doc_sets(self, save_dir):
        try:
            data = json.loads(self._sets_path(save_dir).read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return []
        if not isinstance(data, dict):
            return []
        sets = data.get('sets')
        if not isinstance(sets, list):
            return []
        out = []
        for s in sets:
            if not isinstance(s, dict):
                continue
            name = s.get('name')
            docs = s.get('docs')
            if not isinstance(name, str) or not name or not isinstance(docs, list):
                continue
            out.append({'name': name,
                        'docs': [d for d in docs if isinstance(d, str) and d],
                        'items': self._sanitize_set_items(s.get('items')),
                        'at': s.get('at') if isinstance(s.get('at'), str) else ''})
        return out

    # BLK-primary-20260916-0100-wish: 資料に貼るときの体裁 (見出し・1 行説明) は
    # 図の中身ではなく資料セットの持ち物なので、DSL ではなくここに置く。
    # 見出しと説明は資料の 1 行に載る文なので、改行は畳んで 1 行に保つ。
    @staticmethod
    def _sanitize_set_items(items):
        out = []
        seen = set()
        if not isinstance(items, list):
            return out
        for it in items:
            if not isinstance(it, dict):
                continue
            name = it.get('name')
            if not isinstance(name, str) or not name.strip() or name in seen:
                continue
            seen.add(name)

            def _line(v):
                return ' '.join(str(v).split()) if isinstance(v, str) else ''

            out.append({'name': name,
                        'heading': _line(it.get('heading')),
                        'note': _line(it.get('note'))})
        return out

    def _write_doc_sets(self, save_dir, sets):
        path = self._sets_path(save_dir)
        path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write_text(path, json.dumps({'sets': sets}, ensure_ascii=False, indent=1))

    # BLK-reviewer-20260915-0506-wish: 表記揺れの「揃える先」を 3 人が同じ 1 冊で
    # 見るための口。保存フォルダはペルソナごとに別なので、共有できる場所は親
    # (persona-data) だけ。ここが唯一の置き場所で、親より上は辿らない。
    NAME_REGISTRY_FILE = '_names.json'
    # 人が決めた語の一覧。これを超える大きさは登録簿ではない。
    NAME_REGISTRY_MAX = 512 * 1024

    def _name_registry_path(self, save_dir):
        return Path(save_dir).parent / self.NAME_REGISTRY_FILE

    def _read_name_registry(self, save_dir):
        path = self._name_registry_path(save_dir)
        try:
            if not path.exists() or path.stat().st_size > self.NAME_REGISTRY_MAX:
                return {'entries': []}
            data = json.loads(path.read_text(encoding='utf-8-sig'))
        except (OSError, ValueError):
            return {'entries': []}
        if isinstance(data, list):
            data = {'entries': data}
        if not isinstance(data, dict) or not isinstance(data.get('entries'), list):
            return {'entries': []}
        out = []
        for e in data['entries']:
            if not isinstance(e, dict):
                continue
            canonical = e.get('canonical')
            if not isinstance(canonical, str) or not canonical.strip():
                continue
            variants = [v for v in (e.get('variants') or []) if isinstance(v, str) and v.strip()]
            out.append({
                'canonical': canonical.strip(),
                'variants': variants,
                'note': e.get('note') if isinstance(e.get('note'), str) else '',
                'by': e.get('by') if isinstance(e.get('by'), str) else '',
                'at': e.get('at') if isinstance(e.get('at'), str) else '',
            })
        return {'entries': out}

    COHORT_ACK_FILE = '_cohort-ack.json'
    # 確認済みの組の台帳。これを超える大きさは台帳ではない。
    COHORT_ACK_MAX = 512 * 1024

    def _cohort_ack_path(self, save_dir):
        return Path(save_dir).parent / self.COHORT_ACK_FILE

    @staticmethod
    def _cohort_ack_payload(entries):
        """台帳の 1 行を素通しで受ける形に整える.

        どの組を確認済みとするかの判定 (組の鍵・差分の指紋) は
        src/core/cohort-ack.js にしか無い (同じ規則を 2 つ持たない)。
        ここでやるのは型と重複の掃除だけ。
        """
        out = []
        seen = set()
        for e in entries:
            if not isinstance(e, dict):
                continue
            key = e.get('key')
            if not isinstance(key, str) or not key.strip():
                continue
            key = key.strip()
            if key in seen:
                continue
            seen.add(key)
            row = {'key': key}
            for f in ('domain', 'kind', 'left', 'right', 'fingerprint', 'note', 'by', 'at'):
                v = e.get(f)
                row[f] = v.strip() if isinstance(v, str) else ''
            out.append(row)
        out.sort(key=lambda r: r['key'])
        return out

    def _read_cohort_ack(self, save_dir):
        path = self._cohort_ack_path(save_dir)
        try:
            if not path.exists() or path.stat().st_size > self.COHORT_ACK_MAX:
                return {'entries': []}
            data = json.loads(path.read_text(encoding='utf-8-sig'))
        except (OSError, ValueError):
            return {'entries': []}
        if isinstance(data, list):
            data = {'entries': data}
        if not isinstance(data, dict) or not isinstance(data.get('entries'), list):
            return {'entries': []}
        return {'entries': self._cohort_ack_payload(data['entries'])}

    def _handle_cohort_ack_get(self):
        """GET /cohort-ack?dir= — 保存フォルダの親にある確認済みの組の台帳."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        led = self._read_cohort_ack(save_dir)
        self._send_json(200, {'dir': str(save_dir), 'path': str(self._cohort_ack_path(save_dir)),
                              'entries': led['entries']})

    def _handle_cohort_ack_post(self):
        """POST /cohort-ack {dir, entries} — 台帳を丸ごと置き換える."""
        data = self._read_json_object()
        if data is None:
            return
        entries = data.get('entries')
        if not isinstance(entries, list):
            self._send_json(400, {'error': 'entries must be a list'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        path = self._cohort_ack_path(save_dir)
        clean = self._cohort_ack_payload(entries)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(path, json.dumps({'entries': clean}, ensure_ascii=False, indent=2) + '\n')
        except OSError as e:
            self._send_json(500, {'error': f'書き込めません: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'path': str(path), 'entries': clean})

    # BLK-primary-20260924-1332-wish: 会議セットで並べた日時の控え。▤ 変更サマリボードの
    # 「変更前 = 前回の会議」はこれを読む。ブラウザを起こし直しても (localStorage が空でも)
    # 前の会議の時点で比べられるよう、保存フォルダに置く。1 日 1 件 (その日の最後の時刻)。
    MEETING_LOG_FILE = '_meetings.json'
    MEETING_LOG_MAX = 64 * 1024
    MEETING_LOG_KEEP = 30

    def _meeting_log_path(self, save_dir):
        return Path(save_dir) / self.MEETING_LOG_FILE

    def _read_meeting_log(self, save_dir):
        path = self._meeting_log_path(save_dir)
        try:
            if not path.exists() or path.stat().st_size > self.MEETING_LOG_MAX:
                return []
            data = json.loads(path.read_text(encoding='utf-8-sig'))
        except (OSError, ValueError):
            return []
        items = data.get('meetings') if isinstance(data, dict) else data
        if not isinstance(items, list):
            return []
        return sorted({v.strip() for v in items if isinstance(v, str) and v.strip()})

    def _handle_meeting_log_get(self):
        """GET /meeting-log?dir= — 会議セットで並べた日時の控え (古い順)."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        self._send_json(200, {'dir': str(save_dir), 'meetings': self._read_meeting_log(save_dir)})

    def _handle_meeting_log_post(self):
        """POST /meeting-log {dir, at} — 日時を 1 つ足す。同じ日の分はその日の最後の時刻に置き換える."""
        data = self._read_json_object()
        if data is None:
            return
        at = data.get('at')
        if not isinstance(at, str) or not re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', at.strip()):
            self._send_json(400, {'error': 'at must be an ISO datetime'})
            return
        at = at.strip()
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        items = [v for v in self._read_meeting_log(save_dir) if v[:10] != at[:10]]
        items.append(at)
        items = sorted(items)[-self.MEETING_LOG_KEEP:]
        path = self._meeting_log_path(save_dir)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(path, json.dumps({'meetings': items}, ensure_ascii=False, indent=2) + '\n')
        except OSError as e:
            self._send_json(500, {'error': f'書き込めません: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'meetings': items})

    def _handle_name_registry_get(self):
        """GET /name-registry?dir= — 保存フォルダの親にある正式表記の登録簿."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        reg = self._read_name_registry(save_dir)
        self._send_json(200, {'dir': str(save_dir), 'path': str(self._name_registry_path(save_dir)),
                              'entries': reg['entries']})

    def _handle_name_registry_post(self):
        """POST /name-registry {dir, entries} — 登録簿を丸ごと置き換える.

        1 語ずつの差分ではなく全体を受けるのは、揃える先の決定が
        src/core/name-registry.js にしか無いため (同じ規則を 2 つ持たない)。
        """
        data = self._read_json_object()
        if data is None:
            return
        entries = data.get('entries')
        if not isinstance(entries, list):
            self._send_json(400, {'error': 'entries must be a list'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        path = self._name_registry_path(save_dir)
        clean = self._read_name_registry_payload(entries)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(path, json.dumps({'entries': clean}, ensure_ascii=False, indent=2) + '\n')
        except OSError as e:
            self._send_json(500, {'error': f'書き込めません: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'path': str(path), 'entries': clean})

    @staticmethod
    def _read_name_registry_payload(entries):
        out = []
        seen = set()
        for e in entries:
            if not isinstance(e, dict):
                continue
            canonical = e.get('canonical')
            if not isinstance(canonical, str) or not canonical.strip():
                continue
            canonical = canonical.strip()
            key = re.sub(r'[^a-z0-9]', '', canonical.lower())
            if not key or key in seen:
                continue
            seen.add(key)
            variants = sorted({v.strip() for v in (e.get('variants') or [])
                               if isinstance(v, str) and v.strip() and v.strip() != canonical})
            out.append({
                'canonical': canonical,
                'variants': variants,
                'note': (e.get('note') or '') if isinstance(e.get('note'), str) else '',
                'by': (e.get('by') or '') if isinstance(e.get('by'), str) else '',
                'at': (e.get('at') or '') if isinstance(e.get('at'), str) else '',
            })
        out.sort(key=lambda x: x['canonical'])
        return out

    def _handle_doc_sets_get(self):
        """GET /doc-sets?dir= — そのフォルダに登録した資料セット."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        self._send_json(200, {'dir': str(save_dir), 'sets': self._read_doc_sets(save_dir)})

    def _handle_doc_sets_post(self):
        """POST /doc-sets {dir, name, docs} — 1 つ登録する (同じ名前は置き換え)."""
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        name = data.get('name')
        docs = data.get('docs')
        if not isinstance(name, str) or not name.strip():
            self._send_json(400, {'error': 'name must be a non-empty string'})
            return
        if not isinstance(docs, list):
            self._send_json(400, {'error': 'docs must be a list'})
            return
        # 図が 1 枚も無いセットは作らない。選べてしまうと、また 0 枚の zip が出る。
        names = []
        for d in docs:
            if isinstance(d, str) and d and d not in names:
                names.append(d)
        if not names:
            self._send_json(400, {'error': 'docs must not be empty'})
            return
        name = name.strip()
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        prev = [s for s in self._read_doc_sets(save_dir) if s.get('name') == name]
        # items を渡さない登録 (図の組だけ入れ替える) では、前に書いた体裁を残す。
        # 図を足し直しただけで見出しと説明が消えると、貼る前の手戻りが戻ってくる。
        raw_items = data.get('items') if 'items' in data else (prev[0].get('items') if prev else [])
        entry = {'name': name, 'docs': names,
                 'items': [it for it in self._sanitize_set_items(raw_items)
                           if it['name'] in names],
                 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        sets = [s for s in self._read_doc_sets(save_dir) if s.get('name') != name]
        sets.insert(0, entry)
        sets = sets[:self.SETS_MAX]
        try:
            self._write_doc_sets(save_dir, sets)
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'sets': sets})

    def _handle_doc_sets_delete(self):
        """DELETE /doc-sets?dir=&name= — 1 つ消す."""
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        name = (params.get('name') or '').strip()
        if not name:
            self._send_json(400, {'error': 'name is required'})
            return
        save_dir = self._autosave_resolve_dir(params.get('dir'))
        sets = [s for s in self._read_doc_sets(save_dir) if s.get('name') != name]
        try:
            self._write_doc_sets(save_dir, sets)
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'dir': str(save_dir), 'sets': sets})

    def _autosave_read_meta(self, save_dir):
        p = self._autosave_meta_path(save_dir)
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return None

    # --- autosave POST -------------------------------------------------------

    def _handle_autosave_post(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        dt = data.get('type')
        dsl = data.get('dsl', '')
        dir_raw = data.get('dir')
        # BLK-migrator-20260918-0349: 元が LF のファイルを開いて保存すると、
        # テキストモードの既定 (Windows では os.linesep) が \n を \r\n に書き換え、
        # 無変更保存でもバイト単位で一致しなくなっていた。本文は常に LF で受け、
        # 書くときの改行だけをここで決める (控え・版・hash の比較は LF のまま)。
        newline = _eol_newline(data.get('eol'))
        if not self._autosave_validate_type(dt):
            self._send_json(400, {'error': 'invalid type — パス区切り・制御文字・Windows の禁止文字は使えません'})
            return
        if not isinstance(dsl, str):
            self._send_json(400, {'error': 'dsl must be a string'})
            return
        save_dir = self._autosave_resolve_dir(dir_raw)
        try:
            save_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            self._send_json(500, {'error': f'cannot create directory: {e}'})
            return
        # BLK-junior-20260908-2003: 図種が変わる保存は上書きではなく別ファイルへ回す。
        target, prev_kind, new_kind = self._resolve_save_target(save_dir, dt, dsl)
        file_path = self._autosave_file_path(save_dir, target)
        # 同じ図種の中での上書きは今までどおり。消える中身は先に控える。
        self._stash_version(save_dir, target, dsl)
        try:
            # 改行を指定されたときは、本文をいったん LF に揃えてから書く
            # (\r\n のまま newline='\r\n' で書くと \r\r\n になる)。
            _atomic_write_text(file_path,
                               dsl.replace('\r\n', '\n') if newline else dsl,
                               newline=newline)
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        meta = {
            'lastSavedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'lastSavedType': target,
        }
        try:
            self._autosave_meta_path(save_dir).write_text(json.dumps(meta), encoding='utf-8')
        except OSError:
            pass  # meta is best-effort
        # BLK-junior-20260912-2103-wish: 保存した側が知っている図種だけを控える。
        # 本文からの判定 (new_kind) は控えに入れない —— 紛らわしい書き方の図で
        # 外れた判定を控えてしまうと、次に開くときも同じ図種で開いてしまう
        # (控えの値打ちは「判定に頼らないこと」にある)。
        self._note_saved_kind(save_dir, target, data.get('kind'))
        out = {'ok': True, 'meta': meta, 'path': str(file_path),
               'savedAs': target, 'kind': new_kind,
               'savedKind': self._read_saved_kinds(save_dir).get(target, '')}
        if target != dt:
            out['renamedFrom'] = dt
            out['prevKind'] = prev_kind
        self._send_json(200, out)

    def _resolve_save_target(self, save_dir, dt, dsl):
        """書き先の名前を決める。(名前, 前の図種, 今の図種)。

        既にある同名ファイルが別の図種なら、上書きせず `{名前}_{図種}` へ回す。
        その名前も別の図種で埋まっていれば連番を足す。図種が読めないときは
        今までどおり上書きする (当てずっぽうで名前を増やさない)。
        """
        new_kind = dsl_kind(dsl)
        path = self._autosave_file_path(save_dir, dt)
        try:
            if not path.exists():
                return dt, '', new_kind
            prev_kind = dsl_kind(path.read_text(encoding='utf-8'))
        except OSError:
            return dt, '', new_kind
        if not new_kind or not prev_kind or new_kind == prev_kind:
            return dt, prev_kind, new_kind
        base = kind_base_name(dt) + '_' + new_kind
        for cand in [base] + ['%s-%d' % (base, i) for i in range(2, 21)]:
            if not is_safe_autosave_name(cand):
                break
            p = self._autosave_file_path(save_dir, cand)
            try:
                if not p.exists():
                    return cand, prev_kind, new_kind
                k = dsl_kind(p.read_text(encoding='utf-8'))
            except OSError:
                break
            if not k or k == new_kind:
                return cand, prev_kind, new_kind
        # 行き先が決められないときは、消さない方を採って刻印付きの名前にする。
        stamp = time.strftime('%Y%m%d-%H%M%S', time.gmtime())
        return base + '-' + stamp, prev_kind, new_kind

    def _handle_export_zip_post(self):
        """書き出した zip を保存フォルダに置き、置けたバイト数を答える。

        BLK-primary-20260918-0249: zip の受け渡しがブラウザの a[download] だけだと、
        どこへ落ちたか (落ちたのか) をアプリ側が知る術が無く、届いていなくても
        「保存しました」と出てしまう。ここで実際に書いた結果を返し、画面は
        この答えを見てから成功を名乗る。
        """
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        name = data.get('name')
        if not isinstance(name, str) or not name.lower().endswith('.zip'):
            self._send_json(400, {'error': 'name must end with .zip'})
            return
        # パス区切り・上位への脱出・Windows の禁止文字を弾く (保存フォルダの外に書かない)。
        if not self._autosave_validate_type(name[:-4]):
            self._send_json(400, {'error': 'invalid name — パス区切り・制御文字・Windows の禁止文字は使えません'})
            return
        b64 = data.get('base64')
        if not isinstance(b64, str) or b64 == '':
            self._send_json(400, {'error': 'base64 must be a non-empty string'})
            return
        try:
            raw = base64.b64decode(b64, validate=True)
        except (binascii.Error, ValueError):
            self._send_json(400, {'error': 'base64 decode failed'})
            return
        # zip の先頭 (PK\x03\x04) が無いものは受け取らない。空の zip を「届いた」と言わない。
        if len(raw) < 4 or raw[:2] != b'PK':
            self._send_json(400, {'error': 'not a zip'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        try:
            save_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            self._send_json(500, {'error': f'mkdir failed: {e}'})
            return
        target = save_dir / name
        try:
            _atomic_write_bytes(target, raw)
            written = target.stat().st_size
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        if written != len(raw):
            self._send_json(500, {'error': 'short write'})
            return
        self._send_json(200, {'ok': True, 'path': str(target), 'bytes': written})

    def _handle_autosave_svg_post(self):
        """保存フォルダの {type}.svg だけを書き直す。

        BLK-reviewer-20260908-0103: puml を書き戻すと puml の方が新しくなり、
        「svg が古い」が永久に消えない。作り直しは svg 側だけに触る。
        """
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        dt = data.get('type')
        svg = data.get('svg', '')
        if not self._autosave_validate_type(dt):
            self._send_json(400, {'error': 'invalid type — パス区切り・制御文字・Windows の禁止文字は使えません'})
            return
        if not isinstance(svg, str) or svg == '':
            self._send_json(400, {'error': 'svg must be a non-empty string'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        puml_path = self._autosave_file_path(save_dir, dt)
        if not puml_path.exists():
            self._send_json(404, {'error': 'その名前の図が保存フォルダにありません'})
            return
        svg_path = puml_path.with_suffix('.svg')
        try:
            # newline='' — 改行を CRLF に変換させない。変換すると、描き直した
            # 結果とはバイトで必ず食い違い、/verify-svg が全件 differ と答える。
            _atomic_write_text(svg_path, svg + self._svg_stamp(puml_path), newline='')
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        try:
            mtime = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(svg_path.stat().st_mtime))
        except OSError:
            mtime = None
        self._send_json(200, {'ok': True, 'path': str(svg_path), 'svgMtime': mtime})

    # BLK-reviewer-20260908-1103: mtime 比較だけでは「svg が今の puml から作られたか」は
    # 分からない (保存し直しただけで中身は追いついている図と、前々回の編集から
    # 追いついていない図が同じ「古い」に見える)。書き出した svg の末尾に、その時の
    # puml の sha1 を 1 行だけ刻む。以後は一覧がこの印と今の puml の sha1 を突き合わせ、
    # 内容の一致・不一致を言い切れる (再描画して diff を取る手作業が要らなくなる)。
    SVG_STAMP_PREFIX = '<!-- @pua-source-sha1 '
    SVG_STAMP_SUFFIX = ' -->'

    @classmethod
    def _svg_stamp(cls, puml_path):
        """svg の末尾に付ける印。puml が読めなければ印を付けない (嘘を刻まない)。"""
        try:
            digest = hashlib.sha1(puml_path.read_bytes()).hexdigest()
        except OSError:
            return ''
        return '\n' + cls.SVG_STAMP_PREFIX + digest + cls.SVG_STAMP_SUFFIX + '\n'

    @classmethod
    def _read_svg_stamp(cls, svg_path):
        """svg の末尾から sha1 の印を読む。無ければ None。

        末尾 200 バイトだけを読む — 図が大きくても一覧の生成が遅くならないように。
        """
        try:
            with open(svg_path, 'rb') as f:
                try:
                    f.seek(-200, 2)
                except OSError:
                    f.seek(0)
                tail = f.read().decode('utf-8', 'replace')
        except OSError:
            return None
        at = tail.rfind(cls.SVG_STAMP_PREFIX)
        if at < 0:
            return None
        rest = tail[at + len(cls.SVG_STAMP_PREFIX):]
        end = rest.find(cls.SVG_STAMP_SUFFIX)
        if end < 0:
            return None
        digest = rest[:end].strip()
        return digest if len(digest) == 40 and all(c in '0123456789abcdef' for c in digest) else None

    def _handle_verify_svg_post(self):
        """保存中の {name}.svg が、今の {name}.puml を描いた結果そのものかを中身で確かめる。

        BLK-reviewer-20260908-1103-wish: 時刻の比較では「puml が後に触られたか」しか
        分からず、実データ 16 枚のうち中身まで食い違っていたのは 7 枚だった。
        ここで 1 枚ずつ描き直してバイト比較し、結果を指紋つきで控える。
        描画は重い (1 枚あたり数百 ms) ので、確かめる図は呼び出し側が選んで渡す。
        """
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON',
                                  'errorAscii': 'request body is not valid JSON',
                                  'expected': VERIFY_SVG_EXPECTED})
            return
        names = data.get('types')
        if not isinstance(names, list) or not names:
            self._send_json(400, {
                'error': ("'types' に確かめる図の名前を 1 つ以上入れてください "
                          "(puml / svg は渡さない。server が dir から読む)"),
                # 化けても読める言い直し (BLK-reviewer-20260914-1606)。
                'errorAscii': "'types' is required: a non-empty array of diagram names",
                'expected': VERIFY_SVG_EXPECTED,
            })
            return
        if len(names) > 200:
            self._send_json(400, {'error': '一度に確かめられるのは 200 枚までです',
                                  'errorAscii': "'types' holds at most 200 names",
                                  'expected': VERIFY_SVG_EXPECTED})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        mode = data.get('mode', 'local')
        if mode not in ('local', 'online'):
            self._send_json(400, {
                'error': "unknown mode: %r — 'local' か 'online' です" % (mode,),
                'errorAscii': "'mode' is 'local' or 'online'",
                'expected': VERIFY_SVG_EXPECTED,
            })
            return
        # BLK-reviewer-20260914-2106-wish: stale と出た 1 枚について、旧 SVG と
        # 描き直した SVG を並べて可視差分を見る画面のための材料。server は
        # 既に両方を手元に持っているので、ここで返せば GUI は /render を
        # 別に叩き直さずに済む (reviewer が使い捨てスクリプトを書いていた所)。
        # 一覧ぶん (最大 200 枚) を毎回返すと応答が肥るので 1 枚のときだけ。
        with_svg = bool(data.get('withSvg')) and len(names) == 1
        results = {}
        recs = self._read_svg_verify(save_dir)
        for name in names:
            if not isinstance(name, str) or not self._autosave_validate_type(name):
                results[str(name)] = {'status': 'error', 'error': 'invalid type'}
                continue
            puml_path = self._autosave_file_path(save_dir, name)
            svg_path = puml_path.with_suffix('.svg')
            try:
                puml_bytes = puml_path.read_bytes()
            except OSError:
                results[name] = {'status': 'error', 'error': 'その名前の図が保存フォルダにありません'}
                continue
            try:
                svg_bytes = svg_path.read_bytes()
            except OSError:
                results[name] = {'status': 'missing'}
                continue
            text = puml_bytes.decode('utf-8', errors='replace')
            drawn, err = render_local(text) if mode == 'local' else render_online(text)
            if drawn is None:
                # 描けなかったものを「一致」とも「食い違い」とも言わない。控えも残さない。
                results[name] = {'status': 'error', 'error': err or 'render failed'}
                continue
            # 保存中の svg には書き出し元の印 (BLK-reviewer-20260908-1103) が付いている。
            # 印は描画の結果ではないので、比べる前に外す。
            stripped = self._strip_svg_stamp(svg_bytes)
            # BLK-reviewer-20260908-0103 (1903 追記): 生バイト比較だけで differ と言うと、
            # 書き出し経路の違い (contentStyleType の大小・style="max-width…" の有無・
            # XML 宣言の書式) しか差が無い svg も「食い違い」になる。実データ 7 枚が
            # ラベル・図形数まで完全一致なのに differ と出て、reviewer は毎回
            # labels/shape を目で見比べて判定し直していた。ここで中身の一致を先に見て、
            #   differ-format  — 中身は一致。体裁 (ヘッダ属性など) だけが違う
            #   differ-content — 描かれるものが違う。作り直しが要る
            # に分ける。'match' は今までどおりバイトまで一致した図だけ。
            if drawn == stripped:
                status = 'match'
            elif (self._svg_text_labels(drawn) == self._svg_text_labels(stripped)
                  and self._svg_shape_counts(drawn) == self._svg_shape_counts(stripped)):
                status = 'differ-format'
            else:
                status = 'differ-content'
            recs[name] = {
                'pumlHash': hashlib.sha1(puml_bytes).hexdigest(),
                'svgHash': hashlib.sha1(svg_bytes).hexdigest(),
                'result': status,
                'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }
            results[name] = {'status': status, 'contentMatch': status != 'differ-content'}
            if status == 'differ-format':
                # 何が違ったのかを結果自身が言う。reviewer が server.py を読みに行かない。
                results[name]['note'] = (
                    '描かれる中身 (文字・図形の数) は今の puml と一致します。'
                    '違うのは書き出し経路による体裁 (ヘッダ属性・XML 宣言の書式) だけなので、'
                    '作り直さなくても読めます')
            if status.startswith('differ'):
                # BLK-reviewer-20260908-1203-wish: 「ずれている」だけでは、reviewer は
                # 食い違った図を 1 枚ずつ開いて grep で中身を突き止めることになる。
                # 中身を言うのに要る材料 — 今の puml の本文と、保存中の svg に実際に
                # 書かれている文字列 — をこの結果に添える。突き合わせと言葉づかいは
                # GUI 側 (src/core/svg-diff-summary.js) が受け持つ。
                results[name]['pumlText'] = text[:MAX_DIFF_PUML_CHARS]
                results[name]['svgLabels'] = self._svg_text_labels(svg_bytes)
                # BLK-reviewer-20260908-1303: puml と保存中の svg を突き合わせるだけでは、
                # 「矢印の向き・note の位置・要素の並び」のように文字が同じまま構造だけ
                # 変わった差を見分けられず、「文字の上での違い無し」が「実害なし」と
                # 誤読される。ここでは描き直した結果そのもの (drawn) が手元にあるので、
                # 保存中の svg と描き直した svg を直に比べる材料も添える。
                results[name]['drawnLabels'] = self._svg_text_labels(drawn)
                results[name]['svgShape'] = self._svg_shape_counts(
                    self._strip_svg_stamp(svg_bytes))
                results[name]['drawnShape'] = self._svg_shape_counts(drawn)
            if with_svg:
                # 印は描画の結果ではないので、外した形で渡す (印が付いたままだと
                # 「差がある」と見えるのは印のせいなのか中身なのかが濁る)。
                if len(stripped) > MAX_VISUAL_SVG_BYTES or len(drawn) > MAX_VISUAL_SVG_BYTES:
                    results[name]['svgOmitted'] = (
                        'SVG が大きすぎるため本文は添えていません (上限 %d bytes)'
                        % MAX_VISUAL_SVG_BYTES)
                else:
                    results[name]['savedSvg'] = stripped.decode('utf-8', errors='replace')
                    results[name]['drawnSvg'] = drawn.decode('utf-8', errors='replace')
        self._write_svg_verify(save_dir, recs)
        self._send_json(200, {'ok': True, 'results': results, 'verified': recs})

    def _handle_file_roles_post(self):
        """保存フォルダの _roles.json を丸ごと置き換える。

        BLK-reviewer-20260908-0203-wish: 22 枚を毎回同列に扱わざるを得なかったのは、
        「これはテンプレだ」という宣言の置き場所が無かったため。図の隣に置く。
        """
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        roles = data.get('roles')
        if not isinstance(roles, dict):
            self._send_json(400, {'error': 'roles must be an object'})
            return
        clean = {}
        for name, rec in roles.items():
            if not self._autosave_validate_type(name):
                self._send_json(400, {'error': f'invalid name: {name!r}'})
                return
            if not isinstance(rec, dict) or rec.get('role') not in ('data', 'template'):
                self._send_json(400, {'error': f'role must be data or template: {name!r}'})
                return
            base = rec.get('baseline')
            at = rec.get('at')
            clean[name] = {
                'role': rec['role'],
                'baseline': base if isinstance(base, str) else None,
                'at': at if isinstance(at, str) else None,
            }
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        if not (save_dir.exists() and save_dir.is_dir()):
            self._send_json(404, {'error': '保存フォルダがありません'})
            return
        try:
            self._roles_path(save_dir).write_text(
                json.dumps({'version': 1, 'roles': clean}, ensure_ascii=False, indent=1),
                encoding='utf-8')
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'ok': True, 'roles': clean})

    def _handle_export_log_post(self):
        """保存フォルダの _export-log.json を丸ごと置き換える。

        中身の形 (channels / entries) は GUI の職掌なのでここでは見ない。
        オブジェクトであること・保存フォルダが実在することだけを確かめる。
        """
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        if not isinstance(data, dict):
            self._send_json(400, {'error': 'body must be an object'})
            return
        log = data.get('log')
        if not isinstance(log, dict):
            self._send_json(400, {'error': 'log must be an object'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        if not (save_dir.exists() and save_dir.is_dir()):
            self._send_json(404, {'error': '保存フォルダがありません'})
            return
        try:
            self._export_log_path(save_dir).write_text(
                json.dumps(log, ensure_ascii=False, indent=1), encoding='utf-8')
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        self._send_json(200, {'ok': True, 'dir': str(save_dir)})

    # --- autosave GET --------------------------------------------------------

    def _handle_autosave_get(self):
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        dir_raw = params.get('dir')
        save_dir = self._autosave_resolve_dir(dir_raw)
        dt = params.get('type', '')
        if dt:
            if not self._autosave_validate_type(dt):
                self._send_json(400, {'error': 'invalid type — パス区切り・制御文字・Windows の禁止文字は使えません'})
                return
            file_path = self._autosave_file_path(save_dir, dt)
            if not file_path.exists():
                self.send_error(404, 'autosave entry not found')
                return
            try:
                content = file_path.read_text(encoding='utf-8')
            except OSError as e:
                self._send_json(500, {'error': f'read failed: {e}'})
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            return
        # List mode: return all .puml stems + meta.
        # BLK-reviewer-20260907-1403: 名前だけでは「前回見た版から変わったか」が分からず、
        # 変更が無い日でも全図を読み直して初めて「変更なし」と言えていた。
        # 1 図ずつ最終保存時刻と本文の指紋 (sha1) を返し、GUI 側で前回見た版と突き合わせる。
        files = []
        entries = []
        # BLK-primary-20260908-0103: 存在しないディレクトリでも空の一覧を 200 で
        # 返していたため、GUI からは「保存先が間違っている」と「まだ 1 枚も無い」が
        # 区別できず、保存先の書式を誤ると一覧が黙って空になっていた。
        # 実在するかどうかをそのまま返し、区別は GUI に任せる。
        exists = save_dir.exists() and save_dir.is_dir()
        # BLK-reviewer-20260914-1106-wish: 部品ごとの突合 (遷移ラベル / メッセージ名が
        # クラスのメソッドに在るか) は本文が要る。1 枚ずつ取りに行くと図の枚数だけ
        # 往復が増え、印の付く前の一覧が先に出てしまうので、頼まれたら一覧と同時に返す。
        want_texts = params.get('texts') in ('1', 'true', 'yes')
        # BLK-junior-20260914-1306-wish: 「この図は前回保存から何を足され何を消されたか」を
        # 一覧の行で言うには、直前の退避版の本文が要る。1 枚ずつ /autosave-versions を
        # 叩くと図の枚数だけ往復が増え、印の付く前の一覧が先に出てしまうので、
        # 頼まれたら一覧と同時に返す (`prev=1`)。頼まれなければ読まない。
        want_prev = params.get('prev') in ('1', 'true', 'yes')
        # BLK-junior-20260908-2003: 「この図には前の版が N 個ある」は一覧の時点で要る。
        # 消えたと思った図を探すのに 22 枚を 1 枚ずつ開き直させないため。
        vcounts = self._version_counts(save_dir) if exists else {}
        if exists:
            for p in sorted(save_dir.glob('*.puml'), key=lambda q: q.stem):
                files.append(p.stem)
                entry = self._autosave_entry(p, with_text=want_texts)
                entry['versions'] = vcounts.get(p.stem, 0)
                if want_prev:
                    self._attach_prev_version(save_dir, entry)
                entries.append(entry)
        # 本体がもう無いのに版だけ残っている図。消えた図こそ探す対象なので、
        # 現存する図の一覧 (entries) とは混ぜず、別枠で名前と版数だけ返す。
        gone = [{'name': n, 'versions': vcounts[n]}
                for n in sorted(set(vcounts) - set(files))]
        meta = self._autosave_read_meta(save_dir)
        # BLK-reviewer-20260908-0203-wish: 実データ / テンプレの宣言は一覧と同時に要る。
        # 別呼び出しにすると、印が付く前の一覧が一瞬出て「未分類 22 枚」に見える。
        roles = self._read_file_roles(save_dir) if exists else {}
        # BLK-reviewer-20260908-0923-wish: 「この図は直近 N 分以内に更新された」を
        # GUI が言うには、mtime を刻んだのと同じ時計の「今」が要る。閲覧している端末の
        # 時計と比べると、数分ずれているだけで全部が更新中にも全部が静止にも見える。
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        # BLK-reviewer-20260908-1103-wish: 中身まで突き合わせた控えも一覧と同時に返す。
        # 別呼び出しにすると「未確認 22 枚」の一覧が一瞬出て、確かめた図まで疑わせる。
        verified = self._read_svg_verify(save_dir) if exists else {}
        export_log = self._read_export_log(save_dir) if exists else None
        # BLK-primary-20260916-2314-friction: 控え (_export-log.json) より前に作った納品 zip が
        # フォルダに残っていても「まだ 1 度も提出していません」と出ていた。zip の中の svg/ から
        # 何を出したかは読めるので、一覧と同時に返す (版の比較はできないが、対象の選び直しには足りる)。
        delivery_zips = self._delivery_zips(save_dir) if exists else []
        # BLK-junior-20260912-2103-wish: 保存したときの図種の控え。一覧と同時に返す
        # (別呼び出しにすると、図種の印が付く前の一覧が一瞬出る)。
        saved_kinds = self._read_saved_kinds(save_dir) if exists else {}
        for entry in entries:
            entry['savedKind'] = saved_kinds.get(entry['name'], '')
        self._resolve_unstamped_svg_sources(save_dir, entries)
        self._send_json(200, {'files': files, 'entries': entries, 'meta': meta,
                              'dir': str(save_dir), 'exists': exists, 'roles': roles,
                              'verified': verified, 'now': now, 'gone': gone,
                              'exportLog': export_log, 'kinds': saved_kinds,
                              'deliveryZips': delivery_zips})

    DELIVERY_ZIP_RE = re.compile(r'^delivery-(\d{8})-(\d{4})([a-z]?)\.zip$')

    def _delivery_zips(self, save_dir, limit=20):
        """保存フォルダの納品 zip (delivery-YYYYMMDD-HHMM.zip) を新しい順に返す。

        各 zip の svg/{name}.svg から、その回に出した図の名前を読む。壊れた zip は飛ばす。
        """
        import zipfile
        out = []
        try:
            paths = [p for p in save_dir.glob('delivery-*.zip') if self.DELIVERY_ZIP_RE.match(p.name)]
        except OSError:
            return out
        paths.sort(key=lambda p: p.name, reverse=True)
        for p in paths[:limit]:
            m = self.DELIVERY_ZIP_RE.match(p.name)
            try:
                with zipfile.ZipFile(str(p)) as z:
                    names = [n[4:-4] for n in z.namelist()
                             if n.startswith('svg/') and n.endswith('.svg') and '/' not in n[4:]]
            except (OSError, zipfile.BadZipFile, ValueError):
                continue
            d, t = m.group(1), m.group(2)
            out.append({'file': p.name, 'names': names,
                        'at': '%s-%s-%sT%s:%s' % (d[:4], d[4:6], d[6:], t[:2], t[2:])})
        return out

    def _resolve_unstamped_svg_sources(self, save_dir, entries):
        """印の無い svg の持ち主を、svg に畳まれた DSL から名指しする。

        BLK-reviewer-20260914-0906: 印 (@pua-source-sha1) が付いていない svg は
        「今の puml の絵ではない」までしか言えず、無関係な絵への入れ替わりは
        印の有無では検出できない。reviewer は 1 枚ずつ render API を叩き、
        返った svg の plantuml-src 埋め込みをデコードして相手を突き止めていた
        (図の枚数だけ手順が線形に増える)。

        埋め込みを開いて、同じフォルダの他の図の本文とそろえて突き合わせ、
        一致したら `svgSource` にその図の sha1 を入れる。以後は印が付いていた
        場合と同じ扱いになり、一覧の「他図の絵 / 絵が入れ替わり」がそのまま出る。
        `svgSourceFrom` に 'stamp' / 'embedded' のどちらで分かったかを添える。
        """
        need = [e for e in entries if e.get('svgMtime') and not e.get('svgSource')]
        for e in entries:
            if e.get('svgSource'):
                e['svgSourceFrom'] = 'stamp'
        if not need:
            return
        by_norm = {}
        for e in entries:
            if not e.get('hash'):
                continue
            try:
                raw = self._autosave_file_path(save_dir, e['name']).read_bytes()
            except OSError:
                continue
            by_norm.setdefault(normalize_dsl(raw.decode('utf-8', 'replace')), e['hash'])
        for e in need:
            svg_path = self._autosave_file_path(save_dir, e['name']).with_suffix('.svg')
            try:
                src = decode_svg_plantuml_src(svg_path.read_bytes())
            except OSError:
                continue
            if src is None:
                continue
            norm = normalize_dsl(src)
            # 相手がこのフォルダに居なくても、「この図の絵ではない」とは言い切れる。
            # 言わずに黙ると「未刻印 (確かめようが無い)」に落ち、reviewer は
            # 結局その 1 枚を render API で確かめ直すことになる。
            e['svgSource'] = by_norm.get(norm) or ('embedded:' + hashlib.sha1(norm.encode('utf-8')).hexdigest())
            e['svgSourceFrom'] = 'embedded'

    def _autosave_entry(self, path, with_text=False):
        """1 図分の {name, mtime, size, hash, svgMtime}。読めない図でも名前だけは返す。

        with_text=True のときは本文 (`text`) も入れる。保存フォルダをまたいだ突合
        (BLK-reviewer-20260914-1106-wish) は本文が無いと判定できない。

        BLK-reviewer-20260908-0103: 隣に置いた {name}.svg が puml より古いかどうかを
        `ls -l` で 1 枚ずつ突き合わせていた。同じ一覧で答えられるよう、
        svg の最終更新時刻もここで返す (無ければ None)。
        """
        entry = {'name': path.stem, 'mtime': None, 'size': None, 'hash': None,
                 'svgMtime': None, 'svgSource': None, 'svgHash': None, 'pins': None,
                 'kind': ''}
        svg_path = path.with_suffix('.svg')
        try:
            svg_st = svg_path.stat()
            entry['svgMtime'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(svg_st.st_mtime))
            # BLK-reviewer-20260908-1103: この svg がどの puml から作られたか。
            entry['svgSource'] = self._read_svg_stamp(svg_path)
            # BLK-reviewer-20260908-1103-wish: 「確かめたときの svg」と「今の svg」が
            # 同じものかは時刻では言えない (保存し直しただけで時刻は動く)。指紋で持つ。
            entry['svgHash'] = hashlib.sha1(svg_path.read_bytes()).hexdigest()
        except OSError:
            pass
        try:
            st = path.stat()
            entry['mtime'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(st.st_mtime))
            entry['size'] = st.st_size
        except OSError:
            return entry
        try:
            raw = path.read_bytes()
            entry['hash'] = hashlib.sha1(raw).hexdigest()
            # BLK-junior-20260908-0630-wish: レビュー指摘の反映状態は DSL の
            # `' @pin` 行に入っている。一覧で「未反映 / 反映済み」を出すために
            # 22 枚を 1 枚ずつ開き直すのは、別名保存を続けるのと同じ手間になる。
            # 本文はここで既に読んでいるので、その場で数えて一覧に載せる。
            entry['pins'] = self._pin_counts(raw)
            # BLK-junior-20260908-2003: 「状態遷移図が無い」を一覧の時点で言うために、
            # 1 枚ずつ開かなくても図種が分かるようにする (本文はここで既に読んでいる)。
            entry['kind'] = dsl_kind(raw.decode('utf-8', 'replace'))
            if with_text:
                entry['text'] = raw.decode('utf-8', 'replace')
        except OSError:
            pass
        return entry

    @staticmethod
    def _pin_counts(raw):
        """DSL の本文から {open, read, done, total} を数える。

        指摘行は `' @pin {id}|{state}|...`。state が読めない行は open として数える
        (数え落として「反映済み」と言うより、未反映側に倒す方が安全)。
        壊れた本文でも一覧を落とさない。
        """
        counts = {'open': 0, 'read': 0, 'done': 0, 'total': 0}
        try:
            text = raw.decode('utf-8', 'replace')
        except Exception:
            return counts
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("' @pin "):
                continue
            counts['total'] += 1
            fields = stripped[len("' @pin "):].split('|')
            state = fields[1].strip() if len(fields) > 1 else ''
            if state not in ('read', 'done'):
                state = 'open'
            counts[state] += 1
        return counts

    # --- autosave DELETE -----------------------------------------------------

    def do_DELETE(self):
        if self.path.split('?')[0] == '/doc-sets':
            with _fs_lock:
                return self._handle_doc_sets_delete()
        if self.path.split('?')[0] == '/tickets':
            with _fs_lock:
                return self._handle_tickets_delete()
        if self.path.startswith('/autosave'):
            return self._handle_autosave_delete()
        self.send_error(404)

    def _handle_autosave_delete(self):
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        dir_raw = params.get('dir')
        save_dir = self._autosave_resolve_dir(dir_raw)
        # BLK-primary-20260914-1306-wish: 1 枚だけ消す窓口。これが無いため、
        # 本体と byte 単位で同じ「-編集中」が積み上がっても、GUI からは
        # 「全部消す」か「保存フォルダを直接触る」しか手が無かった。
        dt = params.get('type', '')
        if dt:
            with _fs_lock:
                return self._autosave_delete_one(save_dir, dt)
        if save_dir.exists():
            for p in save_dir.glob('*.puml'):
                # BLK-reviewer-20260908-0103: puml だけ消すと {name}.svg が残り、
                # 「元の図は無いのに SVG だけある」= 一番読み違えやすい状態を作る。
                # 図を消すときは隣の SVG も一緒に消す。
                for target in (p, p.with_suffix('.svg')):
                    try:
                        target.unlink()
                    except OSError:
                        pass
            # BLK-reviewer-20260908-0203-wish: 図を全部消したら「これはテンプレだ」の
            # 宣言も一緒に消す。図が無いのに宣言だけ残ると、同じ名前で作り直した
            # 別物が前の baseline と比べられ、身に覚えのない汚染として赤くなる。
            for side in (self._autosave_meta_path(save_dir), self._roles_path(save_dir)):
                if side.exists():
                    try:
                        side.unlink()
                    except OSError:
                        pass
            # BLK-junior-20260908-2003: 図を全部消すなら過去版も一緒に消す。
            # 残すと、消したはずの図が「履歴」から出続けることになる。
            vdir = self._versions_dir(save_dir)
            try:
                for p in vdir.glob('*.puml'):
                    try:
                        p.unlink()
                    except OSError:
                        pass
                vdir.rmdir()
            except OSError:
                pass
            # 提出物庫は「図を全部消す」では消えない。上書きから守るための庫なので、
            # 作業ファイルを片付けたら提出物も消えるのでは守れていない。
            # 消せるのは `?vault=1` を明示したときだけ (テストの下ごしらえ用)。
            if params.get('vault') == '1':
                vault = self._vault_dir(save_dir)
                try:
                    for p in vault.iterdir():
                        try:
                            p.unlink()
                        except OSError:
                            pass
                    vault.rmdir()
                except OSError:
                    pass
            # 変更チケットも同じ理由で残す。仕様変更は図を作り直しても続いている
            # ので、作業ファイルを片付けたら進捗が消えるのでは持ち越せていない。
            if params.get('tickets') == '1':
                tdir = self._tickets_dir(save_dir)
                try:
                    for p in tdir.iterdir():
                        try:
                            p.unlink()
                        except OSError:
                            pass
                    tdir.rmdir()
                except OSError:
                    pass
        self._send_json(200, {'ok': True})

    def _autosave_delete_one(self, save_dir, dt):
        """図を 1 枚だけ消す (BLK-primary-20260914-1306-wish)。

        消すのは {name}.puml と隣の {name}.svg、それに「この図はこういう図種だ /
        実データだ / svg を確かめた」の控えの当該行だけ。**過去版は消さない** ——
        重複の片付けは取り違えると戻せないので、消した図は `gone` (本体は無いが
        版は残っている図) として一覧に出続け、そこから中身を取り戻せる。
        """
        if not self._autosave_validate_type(dt):
            self._send_json(400, {'error': 'invalid type — パス区切り・制御文字・Windows の禁止文字は使えません'})
            return
        path = self._autosave_file_path(save_dir, dt)
        if not path.exists():
            self._send_json(404, {'error': 'その名前の図が保存フォルダにありません'})
            return
        for target in (path, path.with_suffix('.svg')):
            try:
                target.unlink()
            except OSError:
                pass
        kinds = self._read_saved_kinds(save_dir)
        if dt in kinds:
            del kinds[dt]
            try:
                self._kinds_path(save_dir).write_text(
                    json.dumps({'kinds': kinds}, ensure_ascii=False), encoding='utf-8')
            except OSError:
                pass
        roles = self._read_file_roles(save_dir)
        if dt in roles:
            del roles[dt]
            try:
                self._roles_path(save_dir).write_text(
                    json.dumps({'version': 1, 'roles': roles}, ensure_ascii=False, indent=1),
                    encoding='utf-8')
            except OSError:
                pass
        verified = self._read_svg_verify(save_dir)
        if dt in verified:
            del verified[dt]
            self._write_svg_verify(save_dir, verified)
        self._send_json(200, {'ok': True, 'deleted': dt,
                              'versions': self._version_counts(save_dir).get(dt, 0)})


    def _handle_file_op_post(self):
        """FILES ツリーのファイル単位の操作 (BLK-human-20260923-1701 / design 10b)。

        body: {op, dir, name, to?, toDir?}
          rename … {name}.puml を {to}.puml へ (隣の .svg と図種の控えも一緒に)
          copy   … {name}.puml を {to}.puml へ複製 (.svg は複製しない。描き直せば揃う)
          move   … {name}.puml と .svg を toDir へ (名前は変えない)
          reveal … その図の場所をエクスプローラで開く (PUA_NO_REVEAL があれば開かず場所だけ返す)
        行き先に同じ名前があれば 409 で断る (黙って上書きしない)。過去版は動かさない。
        """
        data = self._read_json_object()
        if data is None:
            return
        op = str(data.get('op') or '')
        name = str(data.get('name') or '')
        if op not in ('rename', 'copy', 'move', 'reveal'):
            return self._send_json(400, {'error': 'op は rename / copy / move / reveal のどれか'})
        if not self._autosave_validate_type(name):
            return self._send_json(400, {'error': '名前にパス区切り・制御文字・Windows の禁止文字は使えません'})
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        src = self._autosave_file_path(save_dir, name)
        if not src.exists():
            return self._send_json(404, {'error': 'その名前の図が保存フォルダにありません'})
        if op == 'reveal':
            opened = False
            if sys.platform == 'win32' and not os.environ.get('PUA_NO_REVEAL'):
                try:
                    subprocess.Popen(['explorer', '/select,', str(src)])
                    opened = True
                except OSError:
                    opened = False
            return self._send_json(200, {'ok': True, 'path': str(src), 'opened': opened})
        if op == 'move':
            to_raw = str(data.get('toDir') or '').strip()
            if not to_raw:
                return self._send_json(400, {'error': '移動先のフォルダを指定してください'})
            to_dir = self._autosave_resolve_dir(to_raw)
            if to_dir == save_dir:
                return self._send_json(400, {'error': '移動先が今のフォルダと同じです'})
            to_name = name
        else:
            to_dir = save_dir
            to_name = str(data.get('to') or '').strip()
            if to_name.lower().endswith('.puml'):
                to_name = to_name[:-5]
            if not self._autosave_validate_type(to_name):
                return self._send_json(400, {'error': '新しい名前にパス区切り・制御文字・Windows の禁止文字は使えません'})
            if to_name == name:
                return self._send_json(400, {'error': '名前が変わっていません'})
        dst = self._autosave_file_path(to_dir, to_name)
        if dst.exists():
            return self._send_json(409, {'error': '行き先に同じ名前の図があります: ' + to_name})
        try:
            to_dir.mkdir(parents=True, exist_ok=True)
            if op == 'copy':
                shutil.copyfile(str(src), str(dst))
            else:
                os.replace(str(src), str(dst))
                svg = src.with_suffix('.svg')
                if svg.exists():
                    try:
                        os.replace(str(svg), str(dst.with_suffix('.svg')))
                    except OSError:
                        pass
        except OSError as e:
            return self._send_json(500, {'error': '動かせませんでした: ' + str(e)})
        # 図種の控えは名前に付いているので、行き先の名前へ写す (元は rename / move なら消す)。
        try:
            kinds = self._read_saved_kinds(save_dir)
            if name in kinds:
                kind = kinds[name]
                if op != 'copy':
                    del kinds[name]
                    self._kinds_path(save_dir).write_text(
                        json.dumps({'kinds': kinds}, ensure_ascii=False), encoding='utf-8')
                dst_kinds = self._read_saved_kinds(to_dir) if to_dir != save_dir else kinds
                dst_kinds[to_name] = kind
                self._kinds_path(to_dir).write_text(
                    json.dumps({'kinds': dst_kinds}, ensure_ascii=False), encoding='utf-8')
        except OSError:
            pass
        return self._send_json(200, {'ok': True, 'op': op, 'name': to_name, 'dir': str(to_dir)})


# --- Environment probe (GET /env) --------------------------------------------
#
# design「1a 設定と網羅」5a は、設定のレンダリング画面に Java の検出結果を
# その場で出すことを求める。local を選んだのに Java が無い環境では描画が
# 落ちるまで気づけないため、選ぶ前に見えている必要がある。
# `java -version` は 100ms 前後かかるので、プロセス内で 1 回だけ調べて使い回す。

_env_lock = threading.Lock()
_env_cache = None

JAVA_VERSION_RE = re.compile(r'version "([0-9][0-9._]*)')


def _java_major(version):
    """'21.0.2' -> 21 / '1.8.0_402' -> 8 (Java 8 以前は 1.x 表記)."""
    if not version:
        return None
    parts = version.replace('_', '.').split('.')
    try:
        first = int(parts[0])
    except ValueError:
        return None
    if first == 1 and len(parts) > 1:
        try:
            return int(parts[1])
        except ValueError:
            return None
    return first


def detect_env():
    """Report what the local render path needs: a java on PATH and the jar."""
    global _env_cache
    with _env_lock:
        if _env_cache is not None:
            return _env_report(_env_cache['java'])
    java = {'found': False, 'version': None, 'major': None}
    try:
        proc = subprocess.run(
            ['java', '-version'],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            timeout=10, **_SUBPROCESS_KWARGS,
        )
        out = (proc.stdout or b'').decode('utf-8', 'replace')
        m = JAVA_VERSION_RE.search(out)
        if proc.returncode == 0 and m:
            java = {'found': True, 'version': m.group(1), 'major': _java_major(m.group(1))}
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass
    with _env_lock:
        _env_cache = {'java': java}
    return _env_report(java)


def _env_report(java):
    """/env の答え。jar の有無と app モードは毎回見る (走行中に変わる)。"""
    jar = jar_path()
    return {
        'java': java,
        'javaUrl': JAVA_DOWNLOAD_URL,
        'jar': jar.exists(),
        'jarPath': str(jar) if jar.exists() else '',
        'app': NATIVE_DIALOG is not None,
        'canFetchJar': FETCH_SCRIPT.exists() and os.name == 'nt',
    }


# --- Local render: persistent Java daemon (fast path) ------------------------
#
# Starting `java -jar plantuml.jar -pipe` per request costs ~1s of JVM startup.
# Instead we launch a single long-running JVM (lib/PlantUMLDaemon.java) that
# reads DSL / writes SVG through its stdin / stdout. No sockets are opened, so
# the daemon is unreachable from the network.
#
# Requires Java 11+ (single-file source-launcher, JEP 330). On older Javas the
# daemon startup fails and render_local() falls back to the legacy -pipe path.

_daemon_lock = threading.Lock()
_daemon_proc = None
_daemon_disabled = False  # set True once we decide to stop retrying the daemon
# BLK-builder-20260907-2249-1: the daemon's stderr must never be left unread.
# PlantUML logs through java.util.logging, whose ConsoleHandler writes to
# System.err; on a diagram it cannot export (Logme.error) that is a full stack
# trace. Nobody drained the pipe, so after a few such diagrams the OS buffer
# filled and the JVM blocked forever inside FileOutputStream.writeBytes --
# it stopped answering on stdout, /render never returned, and the
# single-threaded HTTPServer stopped accepting connections for good.
# Every following E2E test then failed with ERR_CONNECTION_REFUSED.
_daemon_log = collections.deque(maxlen=200)  # last stderr lines, for diagnosis
# Upper bound on one daemon render. A daemon that goes quiet is killed and the
# request falls back to the one-shot -pipe path instead of wedging the server.
DAEMON_RENDER_TIMEOUT_SEC = float(os.environ.get('PUA_RENDER_TIMEOUT', '30'))


def _drain_daemon_stderr(proc):
    """Keep the daemon's stderr pipe empty, remembering the last lines."""
    try:
        for line in iter(proc.stderr.readline, b''):
            _daemon_log.append(line.decode('utf-8', errors='replace').rstrip())
    except Exception:
        pass


def daemon_log_tail(n=20):
    """Last few daemon stderr lines (most recent last)."""
    return list(_daemon_log)[-n:]


def _start_daemon():
    """Spawn the persistent PlantUML daemon. Returns the Popen, or None on failure."""
    jar = jar_path()
    if not jar.exists() or not DAEMON_SRC.exists():
        return None
    try:
        proc = subprocess.Popen(
            ['java', '--source', '11',
             '-cp', str(jar),
             str(DAEMON_SRC)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            **_SUBPROCESS_KWARGS,
        )
    except FileNotFoundError:
        return None
    threading.Thread(target=_drain_daemon_stderr, args=(proc,), daemon=True).start()
    # Give the JVM a moment to start; if it dies immediately (unsupported Java,
    # compile error, etc.) we detect that here rather than on first /render.
    time.sleep(0.05)
    if proc.poll() is not None:
        return None
    return proc


def _get_daemon():
    """Lazily start the daemon on first use. Returns Popen or None if unusable."""
    global _daemon_proc, _daemon_disabled
    if _daemon_disabled:
        return None
    if _daemon_proc is not None and _daemon_proc.poll() is None:
        return _daemon_proc
    _daemon_proc = _start_daemon()
    if _daemon_proc is None:
        _daemon_disabled = True
    return _daemon_proc


def _render_via_daemon(text):
    """Send DSL to the daemon, read SVG back. Returns (svg, error) or raises on IO."""
    proc = _get_daemon()
    if proc is None:
        return None, 'daemon unavailable'
    payload = text.encode('utf-8')
    proc.stdin.write(struct.pack('>I', len(payload)))
    proc.stdin.write(payload)
    proc.stdin.flush()
    status, body = _read_daemon_reply(proc, DAEMON_RENDER_TIMEOUT_SEC)
    if status == 0:
        return body, None
    return None, 'PlantUML error: ' + body.decode('utf-8', errors='replace')


def _read_daemon_reply(proc, timeout):
    """Read one [status][len][body] reply, giving up after `timeout` seconds.

    The read runs on a helper thread so a wedged daemon raises here instead of
    blocking the server's request thread forever (see BLK-builder-20260907-2249-1).
    On timeout the caller kills the daemon, which unblocks the helper thread.
    """
    result = {}

    def read_reply():
        try:
            status = struct.unpack('>I', _read_exact(proc.stdout, 4))[0]
            body_len = struct.unpack('>I', _read_exact(proc.stdout, 4))[0]
            result['reply'] = (status, _read_exact(proc.stdout, body_len))
        except Exception as exc:  # re-raised on the calling thread below
            result['error'] = exc

    reader = threading.Thread(target=read_reply, daemon=True)
    reader.start()
    reader.join(timeout)
    if reader.is_alive():
        raise EOFError(f'daemon did not answer within {timeout:g}s')
    if 'error' in result:
        raise result['error']
    return result['reply']


def _read_exact(stream, n):
    chunks = []
    remaining = n
    while remaining > 0:
        buf = stream.read(remaining)
        if not buf:
            raise EOFError('daemon closed stdout')
        chunks.append(buf)
        remaining -= len(buf)
    return b''.join(chunks)


def _render_via_pipe(text):
    """Fallback: one-shot `java -jar plantuml.jar -pipe` (slower, Java 8+ compatible)."""
    try:
        proc = subprocess.run(
            ['java', '-jar', str(jar_path()), '-tsvg', '-pipe', '-charset', 'UTF-8'],
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30,
            **_SUBPROCESS_KWARGS,
        )
    except FileNotFoundError:
        return None, 'java not found; install Java 8+ or switch to online mode'
    except subprocess.TimeoutExpired:
        return None, 'render timeout (30s)'
    if proc.returncode != 0:
        return None, 'PlantUML error: ' + proc.stderr.decode('utf-8', errors='replace')
    return proc.stdout, None


def render_local(text):
    global _daemon_proc
    jar = jar_path()
    if not jar.exists():
        return None, (f'plantuml.jar not found at {jar}. '
                      '設定 → レンダリング で jar を選ぶか「公式から取得」を押してください')
    with _daemon_lock:
        try:
            svg, err = _render_via_daemon(text)
            if svg is not None or err is not None and err != 'daemon unavailable':
                return svg, err
        except (BrokenPipeError, EOFError, OSError) as exc:
            # Daemon died or stopped answering; drop it and fall back for this
            # request. Print what it last said so the next stall is diagnosable.
            print(f'daemon unusable ({exc}); falling back to -pipe')
            for line in daemon_log_tail(10):
                print(f'  daemon stderr: {line}')
            if _daemon_proc is not None:
                try:
                    _daemon_proc.kill()
                except Exception:
                    pass
            _daemon_proc = None
    return _render_via_pipe(text)


def _shutdown_daemon():
    global _daemon_proc
    if _daemon_proc is None:
        return
    try:
        _daemon_proc.stdin.close()
    except Exception:
        pass
    try:
        _daemon_proc.wait(timeout=2)
    except Exception:
        try:
            _daemon_proc.kill()
        except Exception:
            pass
    _daemon_proc = None


atexit.register(_shutdown_daemon)


def render_online(text):
    try:
        encoded = plantuml_encode(text)
        url = f'https://www.plantuml.com/plantuml/svg/{encoded}'
        req = urllib.request.Request(url, headers={
            'User-Agent': 'PlantUMLAssist/0.1 (+https://github.com/KawanoMomo)',
            'Accept': 'image/svg+xml',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read(), None
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = ': ' + e.read().decode('utf-8', errors='replace')[:200]
        except Exception:
            pass
        return None, f'online render failed: HTTP {e.code}{detail}'
    except urllib.error.URLError as e:
        return None, f'online render failed: {e.reason}'
    except Exception as e:
        return None, f'online render error: {e}'


def plantuml_encode(text):
    """Encode PlantUML text to URL-safe form used by plantuml.com.
    Uses zlib deflate (no header) + custom base64 alphabet.
    """
    import zlib
    compressed = zlib.compress(text.encode('utf-8'))[2:-4]
    return _encode_base64(compressed)


def _encode_base64(data):
    alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
    out = []
    i = 0
    while i < len(data):
        b1 = data[i]
        b2 = data[i + 1] if i + 1 < len(data) else 0
        b3 = data[i + 2] if i + 2 < len(data) else 0
        out.append(alphabet[(b1 >> 2) & 0x3F])
        out.append(alphabet[((b1 << 4) | (b2 >> 4)) & 0x3F])
        out.append(alphabet[((b2 << 2) | (b3 >> 6)) & 0x3F])
        out.append(alphabet[b3 & 0x3F])
        i += 3
    return ''.join(out)


def _idle_limit_sec():
    return NO_IDLE_EXIT_SEC if NO_IDLE_EXIT else IDLE_SHUTDOWN_SEC


def _idle_watchdog(server):
    """Shut the server down when the browser client stops sending heartbeats."""
    global _shutdown_started
    while True:
        time.sleep(2)
        with _state_lock:
            if _shutdown_started:
                return
            idle = time.time() - _last_heartbeat
        if idle > _idle_limit_sec():
            with _state_lock:
                if _shutdown_started:
                    return
                _shutdown_started = True
            print(f'\nNo heartbeat for {idle:.1f}s (browser tab closed?) -- shutting down.')
            server.shutdown()
            return


def main():
    print(f'PlantUMLAssist server starting on http://127.0.0.1:{PORT}')
    print(f'  ROOT: {ROOT}')
    print(f'  DATA: {DATA_ROOT}')
    print(f'  JAR:  {jar_path()} (exists={jar_path().exists()})')
    if NO_IDLE_EXIT:
        print(f'  IDLE_SHUTDOWN: {NO_IDLE_EXIT_SEC}s, browser close ignored (PUA_NO_IDLE_EXIT)')
    else:
        print(f'  IDLE_SHUTDOWN: {IDLE_SHUTDOWN_SEC}s (auto-stops if browser tab closes)')
    print('Press Ctrl+C to stop.')
    # Warm up the JVM daemon in a background thread so the first /render
    # call doesn't pay the ~1s startup cost.
    threading.Thread(target=_get_daemon, daemon=True).start()
    # BLK-builder-20260908-0744-2-red: one thread per connection. A single
    # /render holds the daemon for up to DAEMON_RENDER_TIMEOUT_SEC; on a
    # single-threaded server every other request -- including the plain GET of
    # plantuml-assist.html -- queued behind it. With several browsers open at
    # once (playwright --workers=N) page loads timed out and whole specs went
    # red for reasons that had nothing to do with what they tested.
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    server.daemon_threads = True
    # Grace period before the watchdog starts counting.
    global _last_heartbeat
    _last_heartbeat = time.time() + 30
    threading.Thread(target=_idle_watchdog, args=(server,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
    finally:
        server.server_close()
        _shutdown_daemon()


if __name__ == '__main__':
    main()
