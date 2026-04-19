# ECN-005: Preview 背景白化 + heartbeat 方式の自動シャットダウン

- **ステータス**: 適用済
- **種別**: 改善
- **対象コミット**: `751efb0`
- **影響ファイル**: plantuml-assist.html, server.py, src/app.js, README.md

## コンテキスト

2つの UX 問題への同時対応:

1. PlantUML は SVG を透過で出力するが、preview container 背景が dark (`--bg-primary`) だったため、黒文字・黒線が溶けて読めなかった。MermaidAssist は mermaid.js 自体に dark テーマがあり SVG 内で色調整しているのでこの問題は出ない
2. ブラウザタブを閉じたあとも `python server.py` が残り続け、ユーザが `Ctrl+C` しに戻る必要がある

## 対策

### 背景

- `#preview-container` を `#f5f5f5` (soft gray) に
- `#preview-svg` を純白 + drop shadow で「図が紙に載っている」見た目に
- editor / toolbar / props-pane は dark theme を維持（IDE 的コントラスト）

### auto-shutdown (heartbeat 方式)

- **client (app.js)**: 5秒ごとに `/heartbeat` POST。`pagehide` / `beforeunload` で `navigator.sendBeacon('/shutdown')` を発射
- **server (server.py)**: watchdog スレッドが 2秒おきに最後の heartbeat からの idle を確認、`IDLE_SHUTDOWN_SEC=20` を超えたら `server.shutdown()` を呼ぶ
- **/shutdown endpoint**: 即殺ではなく `_last_heartbeat = now - IDLE_SHUTDOWN_SEC + 2` に設定して 2秒後に idle タイムアウト発火させる。F5 リロード中に新ページが heartbeat を送れば shutdown がキャンセルされる
- **Playwright 対策**: `navigator.webdriver` を見て shutdown beacon をスキップ（E2E テスト中にサーバを殺さない）
- **Windows cp932 locale 対策**: print() の em-dash を ASCII に変更（UnicodeEncodeError で watchdog スレッドごと落ちたため）

## 結果

- 実機: browser close 6秒後に server exit code 0
- F5 リロードで server 継続確認
- E2E 9件 pass（server killed 問題なし）

## 教訓

- DSL 図形エディタの preview 背景は **「描画ライブラリが色を塗るか」で分岐**する。mermaid.js は塗る、PlantUML は塗らない。後者は白背景の枠が必須
- ローカルサーバ型アプリは「タブ閉じで自動終了」を標準 UX として提供すべき。heartbeat + sendBeacon 併用はブラウザクラッシュ含めた耐性を持つ
- 日本語/アジア系 locale Windows での print() クラッシュは頻出。em-dash / 特殊記号は ASCII 化するか `encoding='utf-8'` を明示
