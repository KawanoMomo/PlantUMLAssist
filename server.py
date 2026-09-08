#!/usr/bin/env python3
"""PlantUMLAssist dev server.
Serves static files + /render endpoint for PlantUML local/online rendering.
"""
import atexit
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
JAR_PATH = ROOT / 'lib' / 'plantuml.jar'
DAEMON_SRC = ROOT / 'lib' / 'PlantUMLDaemon.java'
PORT = int(os.environ.get('PUA_PORT', '8766'))
AUTOSAVE_DEFAULT_DIR = ROOT / 'autosave'
# BLK-junior-20260907-0843: 保存先ディレクトリは localStorage にしか無く、
# 新しいタブ・別プロファイルで開くたびに既定へ戻るため、図種を変えるたびに
# ⚙設定 → ファイル → パス再入力 → OK を打ち直すことになっていた。
# 保存先はブラウザではなくこのマシンの設定なので、server 側の 1 ファイルに置く。
PREFS_PATH = ROOT / '.assist-prefs.json'
PREFS_KEYS = ('backend', 'fileDir')
# BLK-junior-20260907-1203: 図の名前はそのままファイル名 ({name}.puml) になる。
# 以前は [A-Za-z0-9_-]+ しか通さず、「GPIOドライバユースケース」のような日本語名の図が
# 保存フォルダから読めず、保存も 400 になって黙って download に落ちていた。
# ファイル名として危ないものだけを弾き、日本語はそのまま通す。
# src/core/workspace.js の isValidName と同じ規則。片方だけ変えないこと。
AUTOSAVE_UNSAFE_CHARS = set('<>:"|?*/' + chr(92)) | {chr(c) for c in range(32)}
AUTOSAVE_RESERVED = ({'con', 'prn', 'aux', 'nul'}
                     | {'com%d' % i for i in range(1, 10)}
                     | {'lpt%d' % i for i in range(1, 10)})


def is_safe_autosave_name(name):
    """True if `name` can be used as a bare filename stem (Japanese included)."""
    if not name or not isinstance(name, str):
        return False
    if name != name.strip(' .'):
        return False
    if name.lower() in AUTOSAVE_RESERVED:
        return False
    return not any(ch in AUTOSAVE_UNSAFE_CHARS for ch in name)

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
        data = json.loads(PREFS_PATH.read_text(encoding='utf-8'))
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
    'response': {
        '200': 'image/svg+xml — 描画された SVG',
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


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/autosave'):
            with _fs_lock:
                return self._handle_autosave_get()
        if self.path.split('?')[0] == '/peek-dirs':
            with _fs_lock:
                return self._handle_peek_dirs()
        if self.path.split('?')[0] == '/render':
            return self._send_json(200, RENDER_API_DOC)
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
        if self.path == '/file-roles':
            with _fs_lock:
                return self._handle_file_roles_post()
        if self.path == '/verify-svg':
            with _fs_lock:
                return self._handle_verify_svg_post()
        if self.path == '/prefs':
            with _fs_lock:
                return self._handle_prefs_post()
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
            # 別名で受理したことは 200 でも必ず伝える (黙って呑まない)。
            # ヘッダ値は ASCII しか通らないので日本語は %xx で包む。
            if warning:
                self.send_header('X-PlantUMLAssist-Warning',
                                 urllib.parse.quote(warning, safe=''))
            self.end_headers()
            self.wfile.write(svg)

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
        """書き出し元の印を外した svg。描画の結果と比べられる形にする。"""
        mark = ('\n' + cls.SVG_STAMP_PREFIX).encode('utf-8')
        at = svg_bytes.rfind(mark)
        return svg_bytes[:at] if at >= 0 else svg_bytes

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
        file_path = self._autosave_file_path(save_dir, dt)
        try:
            file_path.write_text(dsl, encoding='utf-8')
        except OSError as e:
            self._send_json(500, {'error': f'write failed: {e}'})
            return
        meta = {
            'lastSavedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'lastSavedType': dt,
        }
        try:
            self._autosave_meta_path(save_dir).write_text(json.dumps(meta), encoding='utf-8')
        except OSError:
            pass  # meta is best-effort
        self._send_json(200, {'ok': True, 'meta': meta, 'path': str(file_path)})

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
            svg_path.write_text(svg + self._svg_stamp(puml_path), encoding='utf-8')
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
            self._send_json(400, {'error': 'invalid JSON'})
            return
        names = data.get('types')
        if not isinstance(names, list) or not names:
            self._send_json(400, {'error': "'types' に確かめる図の名前を 1 つ以上入れてください"})
            return
        if len(names) > 200:
            self._send_json(400, {'error': '一度に確かめられるのは 200 枚までです'})
            return
        save_dir = self._autosave_resolve_dir(data.get('dir'))
        mode = data.get('mode', 'local')
        if mode not in ('local', 'online'):
            self._send_json(400, {'error': "unknown mode: %r — 'local' か 'online' です" % (mode,)})
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
            status = 'match' if drawn == self._strip_svg_stamp(svg_bytes) else 'differ'
            recs[name] = {
                'pumlHash': hashlib.sha1(puml_bytes).hexdigest(),
                'svgHash': hashlib.sha1(svg_bytes).hexdigest(),
                'result': status,
                'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }
            results[name] = {'status': status}
            if status == 'differ':
                # BLK-reviewer-20260908-1203-wish: 「ずれている」だけでは、reviewer は
                # 食い違った図を 1 枚ずつ開いて grep で中身を突き止めることになる。
                # 中身を言うのに要る材料 — 今の puml の本文と、保存中の svg に実際に
                # 書かれている文字列 — をこの結果に添える。突き合わせと言葉づかいは
                # GUI 側 (src/core/svg-diff-summary.js) が受け持つ。
                results[name]['pumlText'] = text[:MAX_DIFF_PUML_CHARS]
                results[name]['svgLabels'] = self._svg_text_labels(svg_bytes)
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
        if exists:
            for p in sorted(save_dir.glob('*.puml'), key=lambda q: q.stem):
                files.append(p.stem)
                entries.append(self._autosave_entry(p))
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
        self._send_json(200, {'files': files, 'entries': entries, 'meta': meta,
                              'dir': str(save_dir), 'exists': exists, 'roles': roles,
                              'verified': verified, 'now': now})

    def _autosave_entry(self, path):
        """1 図分の {name, mtime, size, hash, svgMtime}。読めない図でも名前だけは返す。

        BLK-reviewer-20260908-0103: 隣に置いた {name}.svg が puml より古いかどうかを
        `ls -l` で 1 枚ずつ突き合わせていた。同じ一覧で答えられるよう、
        svg の最終更新時刻もここで返す (無ければ None)。
        """
        entry = {'name': path.stem, 'mtime': None, 'size': None, 'hash': None,
                 'svgMtime': None, 'svgSource': None, 'svgHash': None, 'pins': None}
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
        if self.path.startswith('/autosave'):
            return self._handle_autosave_delete()
        self.send_error(404)

    def _handle_autosave_delete(self):
        parsed = urllib.parse.urlparse(self.path)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        dir_raw = params.get('dir')
        save_dir = self._autosave_resolve_dir(dir_raw)
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
        self._send_json(200, {'ok': True})


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
            return _env_cache
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
    env = {'java': java, 'jar': JAR_PATH.exists()}
    with _env_lock:
        _env_cache = env
    return env


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
    if not JAR_PATH.exists() or not DAEMON_SRC.exists():
        return None
    try:
        proc = subprocess.Popen(
            ['java', '--source', '11',
             '-cp', str(JAR_PATH),
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
            ['java', '-jar', str(JAR_PATH), '-tsvg', '-pipe', '-charset', 'UTF-8'],
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
    if not JAR_PATH.exists():
        return None, f'plantuml.jar not found at {JAR_PATH}'
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
    print(f'  JAR:  {JAR_PATH} (exists={JAR_PATH.exists()})')
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
