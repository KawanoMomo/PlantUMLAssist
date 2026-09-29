#!/usr/bin/env python3
"""PlantUMLAssist — Windows アプリ版の起動口 (BLK-human-20260909-2200)。

配布先には Python も Java も PlantUML も入っていない。ダブルクリックで起動できる
形にするための薄い入れ物で、画面は Web 版と同じ `plantuml-assist.html` / `src/` を
そのまま読む (アプリ専用の画面は作らない)。

  python app.py          … 窓で開く
  python server.py       … 従来どおりブラウザで開く (こちらは変えない)

ここがするのは 4 つだけ:
  1. server.py を同じプロセスの中で起こす (別プロセスにすると exe 化で二重起動する)
  2. ネイティブのファイルダイアログを server に差し込む (保存がダウンロードにならない)
  3. 窓を閉じたら server も終える
  4. 起動に失敗したら理由を crash.log に残して日本語で知らせる
     (BLK-human-20260915-1200。`console=False` なので黙って消えると何も分からない)
"""
import os
import socket
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

# 同梱物 (html / src / server.py) の置き場所。exe では展開先の一時フォルダ。
APP_ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
sys.path.insert(0, str(APP_ROOT))

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


FROZEN = bool(getattr(sys, 'frozen', False))

# zip を「展開せずに」中の exe を叩くと、PyInstaller は exe 1 個だけを一時フォルダに
# 出して起動するので、ここに挙げた同梱物が揃わない。揃っているかを起動前に見る。
REQUIRED_FILES = ('plantuml-assist.html', 'server.py', os.path.join('src', 'app.js'))

WEBVIEW2_URL = 'https://developer.microsoft.com/microsoft-edge/webview2/'


def crash_log_path():
    """起動に失敗した理由を残す場所。書けない環境でも必ずパスを返す。"""
    base = (os.environ.get('LOCALAPPDATA') or os.environ.get('APPDATA')
            or str(Path.home()))
    folder = Path(base) / 'PlantUMLAssist'
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError:
        return Path(base) / 'PlantUMLAssist-crash.log'
    return folder / 'crash.log'


def missing_bundled_files():
    """同梱されているはずなのに見つからないファイル (zip の取りこぼしの目印)。"""
    return [rel for rel in REQUIRED_FILES if not (APP_ROOT / rel).exists()]


def _environment_lines():
    return [
        f'version   : {WINDOW_TITLE}',
        f'frozen    : {FROZEN}',
        f'executable: {sys.executable}',
        f'app_root  : {APP_ROOT}',
        f'cwd       : {os.getcwd()}',
        f'python    : {sys.version.splitlines()[0]}',
        f'LOCALAPPDATA: {os.environ.get("LOCALAPPDATA", "(未設定)")}',
        f'APPDATA     : {os.environ.get("APPDATA", "(未設定)")}',
        f'missing   : {", ".join(missing_bundled_files()) or "(なし)"}',
    ]


def write_crash_log(summary, detail):
    """crash.log に 1 件追記して、そのパスを返す (書けなければ None)。"""
    path = crash_log_path()
    body = '\n'.join(
        [f'==== {datetime.now().isoformat(timespec="seconds")} {summary}']
        + _environment_lines()
        + ['', detail.rstrip(), ''])
    try:
        with open(path, 'a', encoding='utf-8') as fp:
            fp.write(body + '\n')
    except OSError:
        return None
    return path


def show_error(message):
    """利用者に見えるダイアログ。出せない環境では標準出力に落とす。"""
    try:
        import ctypes
        # MB_OK | MB_ICONERROR | MB_SETFOREGROUND
        ctypes.windll.user32.MessageBoxW(
            None, message, f'{WINDOW_TITLE} を起動できませんでした', 0x10 | 0x10000)
        return True
    except Exception:
        # 窓を出せない環境 (コンソール実行・CI) では標準出力へ。
        # cp932 のコンソールでも落ちないように、出せない字は落として書く。
        try:
            print(message)
        except Exception:
            sys.stdout.write(message.encode('ascii', 'replace').decode('ascii') + '\n')
        return False


def failure_message(summary, hint, log_path):
    """次に何をすればいいかまで書いた、そのまま見せられる日本語の文面。"""
    where = (f'詳しい記録: {log_path}' if log_path
             else '記録を書ける場所が見つかりませんでした。')
    return '\n'.join([
        f'{WINDOW_TITLE} の起動に失敗しました。', '',
        f'原因: {summary}', '',
        f'次にすること: {hint}', '',
        where,
    ])


def report_failure(summary, hint, detail):
    log_path = write_crash_log(summary, detail)
    show_error(failure_message(summary, hint, log_path))
    return 1


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

    def open_files(self, title, file_types=()):
        """複数選択の開くダイアログ (BLK-human-20260917-0901)。選んだパスのリスト。"""
        res = self._window.create_file_dialog(
            self._webview.OPEN_DIALOG, allow_multiple=True,
            file_types=tuple(file_types) or ('All files (*.*)',))
        if not res:
            return []
        return [str(x) for x in res] if isinstance(res, (list, tuple)) else [str(res)]

    def save_file(self, suggested_name):
        res = self._window.create_file_dialog(
            self._webview.SAVE_DIALOG, save_filename=suggested_name)
        if not res:
            return ''
        return res[0] if isinstance(res, (list, tuple)) else str(res)


def start_server(server, port):
    """server.py を別スレッドで起こし、その HTTPServer を返す。"""
    httpd = server.ThreadingHTTPServer(('127.0.0.1', port), server.Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    threading.Thread(target=server._get_daemon, daemon=True).start()
    return httpd


def run():
    """起動の本体。失敗は例外で上へ返し、文面づけは main に任せる。"""
    missing = missing_bundled_files()
    if missing:
        raise FileNotFoundError(
            '同梱ファイルが見つかりません: ' + ', '.join(missing))

    import webview  # noqa: E402  (失敗も crash.log に残したいのでここで読む)
    import server   # noqa: E402  (sys.path を通してから読む)

    port = int(os.environ.get('PUA_PORT') or free_port())
    httpd = start_server(server, port)
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


def diagnose(exc):
    """例外から「原因」と「次にすること」を組み立てる。"""
    text = f'{type(exc).__name__}: {exc}'
    if isinstance(exc, FileNotFoundError) and '同梱ファイル' in str(exc):
        return (str(exc),
                'zip を右クリック →「すべて展開」でフォルダごと取り出してから、'
                '展開後のフォルダの中の PlantUMLAssist.exe を実行してください'
                '(zip を開いたまま中の exe を叩くと、必要なファイルが揃いません)。')
    if isinstance(exc, ImportError) and 'webview' in text:
        return (text, '配布物が壊れている可能性があります。zip を展開し直すか、'
                      'インストーラ版 (PlantUMLAssist-setup.exe) をお使いください。')
    if 'WebView2' in text or 'EdgeChromium' in text or 'Edge' in text:
        return (text, 'Microsoft Edge WebView2 ランタイムを入れてから、'
                      f'もう一度起動してください: {WEBVIEW2_URL}')
    if isinstance(exc, PermissionError):
        return (text, '展開先のフォルダに書き込めません。'
                      'デスクトップやドキュメントなど、書き込める場所に展開し直してください。')
    return (text, 'crash.log の内容を添えて不具合として知らせてください。'
                  'インストーラ版 (PlantUMLAssist-setup.exe) なら起動できることがあります。')


def main():
    try:
        return run()
    except SystemExit:
        raise
    except BaseException as exc:  # 起動の失敗を黙って消さない
        summary, hint = diagnose(exc)
        return report_failure(summary, hint, traceback.format_exc())


if __name__ == '__main__':
    sys.exit(main())
