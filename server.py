#!/usr/bin/env python3
"""PlantUMLAssist dev server.
Serves static files + /render endpoint for PlantUML local/online rendering.
"""
import atexit
import json
import os
import struct
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
JAR_PATH = ROOT / 'lib' / 'plantuml.jar'
DAEMON_SRC = ROOT / 'lib' / 'PlantUMLDaemon.java'
PORT = 8766

# Windows: suppress the console window that otherwise flashes every time
# we spawn java (once per /render call). No-op on other platforms.
_SUBPROCESS_KWARGS = {}
if sys.platform == 'win32':
    _SUBPROCESS_KWARGS['creationflags'] = subprocess.CREATE_NO_WINDOW
# Seconds of heartbeat silence before the server shuts itself down.
# Browser client POSTs /heartbeat every ~5s; if the tab is closed the
# pings stop and the watchdog terminates the server automatically.
IDLE_SHUTDOWN_SEC = 20

_state_lock = threading.Lock()
_last_heartbeat = time.time()
_shutdown_started = False


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
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
        text = data.get('text', '')
        mode = data.get('mode', 'local')
        if mode == 'local':
            svg, error = render_local(text)
        elif mode == 'online':
            svg, error = render_online(text)
        else:
            self._send_json(400, {'error': f'unknown mode: {mode}'})
            return
        if error:
            self._send_json(500, {'error': error})
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(svg)

    def _send_json(self, code, payload):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def log_message(self, fmt, *args):
        pass


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
    status = struct.unpack('>I', _read_exact(proc.stdout, 4))[0]
    body_len = struct.unpack('>I', _read_exact(proc.stdout, 4))[0]
    body = _read_exact(proc.stdout, body_len)
    if status == 0:
        return body, None
    return None, 'PlantUML error: ' + body.decode('utf-8', errors='replace')


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
        except (BrokenPipeError, EOFError, OSError):
            # Daemon died mid-session; drop it and fall back for this request.
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
    server = HTTPServer(('127.0.0.1', PORT), Handler)
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
