#!/usr/bin/env python3
"""PlantUMLAssist dev server.
Serves static files + /render endpoint for PlantUML local/online rendering.
"""
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
JAR_PATH = ROOT / 'lib' / 'plantuml.jar'
PORT = 8766


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
        if self.path != '/render':
            self.send_error(404)
            return
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


def render_local(text):
    if not JAR_PATH.exists():
        return None, f'plantuml.jar not found at {JAR_PATH}'
    try:
        proc = subprocess.run(
            ['java', '-jar', str(JAR_PATH), '-tsvg', '-pipe', '-charset', 'UTF-8'],
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30,
        )
    except FileNotFoundError:
        return None, 'java not found; install Java 8+ or switch to online mode'
    except subprocess.TimeoutExpired:
        return None, 'render timeout (30s)'
    if proc.returncode != 0:
        err = proc.stderr.decode('utf-8', errors='replace')
        return None, f'PlantUML error: {err}'
    return proc.stdout, None


def render_online(text):
    try:
        encoded = plantuml_encode(text)
        url = f'https://www.plantuml.com/plantuml/svg/{encoded}'
        with urllib.request.urlopen(url, timeout=15) as resp:
            return resp.read(), None
    except urllib.error.URLError as e:
        return None, f'online render failed: {e}'
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


def main():
    print(f'PlantUMLAssist server starting on http://127.0.0.1:{PORT}')
    print(f'  ROOT: {ROOT}')
    print(f'  JAR:  {JAR_PATH} (exists={JAR_PATH.exists()})')
    print('Press Ctrl+C to stop.')
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
        server.server_close()


if __name__ == '__main__':
    main()
