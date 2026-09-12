#!/usr/bin/env python3
"""PlantUMLAssist — Windows アプリ版の起動口 (BLK-human-20260909-2200)。

配布先には Python も Java も PlantUML も入っていない。ダブルクリックで起動できる
形にするための薄い入れ物で、画面は Web 版と同じ `plantuml-assist.html` / `src/` を
そのまま読む (アプリ専用の画面は作らない)。

  python app.py          … 窓で開く
  python server.py       … 従来どおりブラウザで開く (こちらは変えない)

ここがするのは 3 つだけ:
  1. server.py を同じプロセスの中で起こす (別プロセスにすると exe 化で二重起動する)
  2. ネイティブのファイルダイアログを server に差し込む (保存がダウンロードにならない)
  3. 窓を閉じたら server も終える
"""
import os
import socket
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(getattr(sys, '_MEIPASS', Path(__file__).parent))))

import server  # noqa: E402  (sys.path を通してから読む)

WINDOW_TITLE = 'PlantUMLAssist'


def free_port():
    """空いている TCP ポートを OS に選ばせる (固定ポートは二重起動で衝突する)。"""
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class NativeDialog:
    """server.py から呼ばれるファイルダイアログ。窓ができてから差し込む。"""

    def __init__(self, window, webview):
        self._window = window
        self._webview = webview

    def open_file(self, title, file_types=()):
        res = self._window.create_file_dialog(
            self._webview.OPEN_DIALOG, allow_multiple=False,
            file_types=tuple(file_types) or ('All files (*.*)',))
        if not res:
            return ''
        return res[0] if isinstance(res, (list, tuple)) else str(res)

    def save_file(self, suggested_name):
        res = self._window.create_file_dialog(
            self._webview.SAVE_DIALOG, save_filename=suggested_name)
        if not res:
            return ''
        return res[0] if isinstance(res, (list, tuple)) else str(res)


def start_server(port):
    """server.py を別スレッドで起こし、その HTTPServer を返す。"""
    httpd = server.ThreadingHTTPServer(('127.0.0.1', port), server.Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    threading.Thread(target=server._get_daemon, daemon=True).start()
    return httpd


def main():
    try:
        import webview
    except ImportError:
        print('pywebview が入っていません: python -m pip install pywebview')
        return 1
    port = int(os.environ.get('PUA_PORT') or free_port())
    httpd = start_server(port)
    print(f'{WINDOW_TITLE} on http://127.0.0.1:{port} (data: {server.DATA_ROOT})')

    window = webview.create_window(
        WINDOW_TITLE, f'http://127.0.0.1:{port}/plantuml-assist.html',
        width=1400, height=900, text_select=True)
    # 窓ができる前にダイアログを差すと create_file_dialog が握れないので、
    # 起動完了のコールバックで差す。ここが app モードの目印でもある
    # (/env の app:true、ネイティブ保存の可否はこの 1 個で決まる)。
    def on_start():
        server.NATIVE_DIALOG = NativeDialog(window, webview)

    try:
        webview.start(on_start)
    finally:
        server.NATIVE_DIALOG = None
        httpd.shutdown()
        server._shutdown_daemon()
    return 0


if __name__ == '__main__':
    sys.exit(main())
