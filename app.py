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
import time
from pathlib import Path

sys.path.insert(0, str(Path(getattr(sys, '_MEIPASS', Path(__file__).parent))))

import server  # noqa: E402  (sys.path を通してから読む)

WINDOW_TITLE = 'PlantUMLAssist'
APP_ID = 'PlantUMLAssist.App'


def icon_path():
    """アプリアイコン (packaging/icon.ico) の在り処。exe 化後は _MEIPASS の下。"""
    base = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
    return base / 'packaging' / 'icon.ico'


def apply_window_icon(title=WINDOW_TITLE):
    """窓 (タイトルバー・タスクバー) に packaging/icon.ico を貼る。

    pywebview は窓のアイコンを exe のリソースから取るので、`python app.py` で
    起動したときは Python の既定アイコンのままになる。Windows API で直接貼れば
    exe でもソースでも同じ絵になる。貼れない環境 (Windows 以外・窓がまだ無い)
    では黙って諦める — アイコンのために起動を落とさない。
    """
    ico = icon_path()
    if os.name != 'nt' or not ico.exists():
        return False
    try:
        import ctypes
        user32 = ctypes.windll.user32
        # タスクバーが exe ではなくこのアプリとしてまとめるための識別子。
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
        except (AttributeError, OSError):
            pass
        hwnd = 0
        for _ in range(20):  # 窓ができきる前に呼ばれることがあるので少し待つ
            hwnd = user32.FindWindowW(None, title)
            if hwnd:
                break
            time.sleep(0.1)
        if not hwnd:
            return False
        IMAGE_ICON, LR_LOADFROMFILE, WM_SETICON = 1, 0x0010, 0x0080
        SM_CXICON, SM_CYICON, SM_CXSMICON, SM_CYSMICON = 11, 12, 49, 50
        ICON_BIG, ICON_SMALL = 1, 0
        applied = False
        for wparam, cx_metric, cy_metric in (
                (ICON_BIG, SM_CXICON, SM_CYICON),       # タスクバー・Alt+Tab
                (ICON_SMALL, SM_CXSMICON, SM_CYSMICON)):  # タイトルバー
            handle = user32.LoadImageW(
                None, str(ico), IMAGE_ICON,
                user32.GetSystemMetrics(cx_metric), user32.GetSystemMetrics(cy_metric),
                LR_LOADFROMFILE)
            if handle:
                user32.SendMessageW(hwnd, WM_SETICON, wparam, handle)
                applied = True
        return applied
    except (OSError, AttributeError):
        return False


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
        apply_window_icon()

    try:
        webview.start(on_start)
    finally:
        server.NATIVE_DIALOG = None
        httpd.shutdown()
        server._shutdown_daemon()
    return 0


if __name__ == '__main__':
    sys.exit(main())
