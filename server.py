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
# BLK-reviewer-20260908-1203-wish: 食い違いの中身を言うために /verify-svg に添える材料の上限。
# puml は数 KB、text 要素は 1 枚の図で数十〜数百なので、この上限に当たるのは
# 図でない何かを掴んだときだけ。当たっても応答が肥らないようにするための蓋。
MAX_DIFF_PUML_CHARS = 65536
MAX_DIFF_LABELS = 2000

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
}

# GET /api — 窓口の索引。docs/api.md と同じ並びで、1 行ずつ何をするかを言う。
API_INDEX = {
    'name': 'PlantUMLAssist server API',
    'doc': 'docs/api.md (同じ内容。GET /api が正本)',
    'endpoints': [
        {'endpoint': 'GET /api', 'summary': 'この索引'},
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
        {'endpoint': 'GET /peek-dirs', 'summary': '保存フォルダの候補を覗く'},
        {'endpoint': 'GET /peek-notes', 'summary': '隣のフォルダに置かれた指摘 (.md) を読む',
         'request': '?dir='},
        {'endpoint': 'GET /vault', 'summary': '保管庫の中身', 'request': '?dir='},
        {'endpoint': 'POST /vault', 'summary': '保管庫へ入れる'},
        {'endpoint': 'GET /tickets', 'summary': '変更チケットの一覧', 'request': '?dir='},
        {'endpoint': 'POST /tickets', 'summary': '変更チケットを 1 枚書く', 'request': "{dir, ticket}"},
        {'endpoint': 'DELETE /tickets', 'summary': '変更チケットを 1 枚消す', 'request': '?dir=&id='},
        {'endpoint': 'POST /file-roles', 'summary': '保存フォルダの _roles.json を置き換える',
         'request': "{dir, roles}"},
        {'endpoint': 'POST /export-log', 'summary': '書き出しの控えを 1 件足す'},
        {'endpoint': 'GET /prefs', 'summary': 'この機械に保存した設定'},
        {'endpoint': 'POST /prefs', 'summary': '設定を書く'},
        {'endpoint': 'POST /jar-path', 'summary': 'plantuml.jar の場所を設定する {path}'},
        {'endpoint': 'POST /pick-jar', 'summary': 'アプリ版: jar をファイルダイアログで選ぶ'},
        {'endpoint': 'POST /fetch-jar', 'summary': 'アプリ版/Windows: 公式から jar を取得する'},
        {'endpoint': 'POST /native-save', 'summary': 'アプリ版: 保存ダイアログで書き出す {fileName, text|base64}'},
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


def detect_render_error(svg):
    """PlantUML の「エラー画」なら {'message', 'line'}。図なら None。"""
    if not svg or _ERR_GREEN_MARK not in svg:
        return None
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


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/autosave-versions':
            with _fs_lock:
                return self._handle_autosave_versions()
        if self.path.split('?')[0] == '/vault':
            with _fs_lock:
                return self._handle_vault_get()
        if self.path.split('?')[0] == '/tickets':
            with _fs_lock:
                return self._handle_tickets_get()
        if self.path.startswith('/autosave'):
            with _fs_lock:
                return self._handle_autosave_get()
        if self.path.split('?')[0] == '/peek-dirs':
            with _fs_lock:
                return self._handle_peek_dirs()
        if self.path.split('?')[0] == '/peek-notes':
            with _fs_lock:
                return self._handle_peek_notes()
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
        if self.path == '/file-roles':
            with _fs_lock:
                return self._handle_file_roles_post()
        if self.path == '/export-log':
            with _fs_lock:
                return self._handle_export_log_post()
        if self.path == '/verify-svg':
            with _fs_lock:
                return self._handle_verify_svg_post()
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
        # アプリ版の保存はブラウザのダウンロードではなくネイティブのダイアログ。
        if self.path == '/native-save':
            return self._handle_native_save_post()
        if self.path == '/heartbeat':
            with _state_lock:
                _last_heartbeat = time.time()
            self.send_response(204)
            self.end_headers()
            return
        if self.path == '/shutdown':
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
                payload = {'error': msg, 'line': err['line'], 'kind': 'plantuml-syntax'}
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

    def _send_json(self, code, payload):
        # BLK-reviewer-20260907-0043: エラーメッセージも API 仕様も日本語なので、
        # エスケープに潰さずそのまま読める形で返す (curl から読む窓口である)。
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
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
        stamps.sort(reverse=True)
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
            versions.append(item)
        self._send_json(200, {'name': dt, 'dir': str(save_dir), 'versions': versions})

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
            _atomic_write_text(file_path, dsl)
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
            self._send_json(400, {'error': 'invalid JSON', 'expected': VERIFY_SVG_EXPECTED})
            return
        names = data.get('types')
        if not isinstance(names, list) or not names:
            self._send_json(400, {
                'error': ("'types' に確かめる図の名前を 1 つ以上入れてください "
                          "(puml / svg は渡さない。server が dir から読む)"),
                'expected': VERIFY_SVG_EXPECTED,
            })
            return
        if len(names) > 200:
            self._send_json(400, {'error': '一度に確かめられるのは 200 枚までです',
                                  'expected': VERIFY_SVG_EXPECTED})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        mode = data.get('mode', 'local')
        if mode not in ('local', 'online'):
            self._send_json(400, {
                'error': "unknown mode: %r — 'local' か 'online' です" % (mode,),
                'expected': VERIFY_SVG_EXPECTED,
            })
            return
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
        # BLK-junior-20260908-2003: 「この図には前の版が N 個ある」は一覧の時点で要る。
        # 消えたと思った図を探すのに 22 枚を 1 枚ずつ開き直させないため。
        vcounts = self._version_counts(save_dir) if exists else {}
        if exists:
            for p in sorted(save_dir.glob('*.puml'), key=lambda q: q.stem):
                files.append(p.stem)
                entry = self._autosave_entry(p, with_text=want_texts)
                entry['versions'] = vcounts.get(p.stem, 0)
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
        # BLK-junior-20260912-2103-wish: 保存したときの図種の控え。一覧と同時に返す
        # (別呼び出しにすると、図種の印が付く前の一覧が一瞬出る)。
        saved_kinds = self._read_saved_kinds(save_dir) if exists else {}
        for entry in entries:
            entry['savedKind'] = saved_kinds.get(entry['name'], '')
        self._resolve_unstamped_svg_sources(save_dir, entries)
        self._send_json(200, {'files': files, 'entries': entries, 'meta': meta,
                              'dir': str(save_dir), 'exists': exists, 'roles': roles,
                              'verified': verified, 'now': now, 'gone': gone,
                              'exportLog': export_log, 'kinds': saved_kinds})

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


def _idle_watchdog(server):
    """Shut the server down when the browser client stops sending heartbeats."""
    global _shutdown_started
    while True:
        time.sleep(2)
        with _state_lock:
            if _shutdown_started:
                return
            idle = time.time() - _last_heartbeat
        if idle > IDLE_SHUTDOWN_SEC:
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
