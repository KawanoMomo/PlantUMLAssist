# PlantUMLAssist

PlantUML 記法の GUI 編集ツール。Python バックエンド + HTML/JS フロント。[MermaidAssist](../05_MermaidAssist) の sister project。

## 特徴

- **Tier1 ロードマップ** (対応予定): Sequence / Use Case / Class / Activity / Component / State の UML 主要6図形
- **v0.1.0** 時点では **Sequence Diagram** の MVP 実装
- **local (Java)** がデフォルトレンダリング、**online (plantuml.com)** にもオプションで切替可能
- **DiagramModule v2** インターフェース (MermaidAssist 踏襲)
- **縦並びラベル付き追加フォーム**、DSL エディタ Tab/Shift+Tab でインデント挿入

## セットアップ

> **初回のみ**: リポジトリには PlantUML jar を同梱していません (ライセンス整合性のため)。
> 下記いずれかで `lib/plantuml.jar` を配置してください。

```bash
# macOS / Linux / WSL / Git Bash
bash lib/fetch-plantuml.sh

# Windows PowerShell
.\lib\fetch-plantuml.ps1
```

または PlantUML 公式リリース (https://github.com/plantuml/plantuml/releases) から任意の
ライセンス変種 (GPLv3 / LGPL / Apache 2.0 / EPL / MIT / BSD) を手動ダウンロードして
`lib/plantuml.jar` として配置してください。詳細は `lib/README.md` を参照。

## 起動

> **重要**: MermaidAssist と違い、HTML をダブルクリックしても動きません。PlantUML は Java 実行または plantuml.com への POST を必要とするため、Python バックエンド経由でアクセスしてください。

```bash
cd 06_PlantUMLAssist
python server.py
```

コンソールに `PlantUMLAssist server starting on http://127.0.0.1:8766` と表示されたら、ブラウザで **http://127.0.0.1:8766/** を開きます。

Windows では `start.bat` をダブルクリックでも起動可能（server.py を起動してブラウザを自動で開きます）。

**自動停止**: ブラウザタブを閉じるとサーバーも自動で停止します (heartbeat 方式、タブ close 後 2〜6秒以内に終了)。F5 リロードは自動判定で継続。明示的に止めたい場合は `Ctrl+C`。

## 要件

- Python 3 (標準ライブラリのみ、追加パッケージ不要)
- Java 8+ (local render モード用。online モードのみ使うなら不要)
- `lib/plantuml.jar` (**別途ダウンロード必要**、fetch スクリプト提供。推奨: v1.2026.2、約 22 MB)

Java がインストールされていない場合は、UI 右上の `render-mode` セレクトを `online (plantuml.com)` に切替えて使用可能。plantuml.com の公開サーバを利用するため、**業務データは外部送信される**ことに注意。

### トラブルシューティング

| 症状 | 原因 | 対策 |
|---|---|---|
| "Render error: Failed to fetch" | server.py が起動していない / HTML を `file://` で開いている | `python server.py` を起動し、`http://127.0.0.1:8766/` にアクセス |
| "java not found" (local mode) | Java 未インストール | JDK/JRE 8+ をインストール、または online モードへ切替 |
| "online render failed: HTTP 4xx/5xx" | plantuml.com のレート制限/障害 | 時間をおいて再試行、または local モードへ切替 |

## テスト

```bash
npm install
npm run test:unit   # Node runner
npm run test:e2e    # Playwright
npm run test:all
```

## 設計ドキュメント

- Design: `docs/superpowers/specs/2026-04-17-plantuml-assist-design.md`
- Plan: `docs/superpowers/plans/2026-04-17-plantuml-assist-v0.1.0.md`
- ADR: `docs/adr/` (ADR-101+)
- ECN: `docs/ecn/`

## ライセンス

本リポジトリは **MIT** (`LICENSE` 参照)。

`lib/plantuml.jar` は同梱していません。利用者が PlantUML 公式から任意のライセンス変種
(GPLv3 / LGPL / Apache 2.0 / EPL / MIT / BSD) をダウンロードして配置します。jar の
ライセンスはその配布元の条項に従い、本リポジトリのライセンスとは別扱いです。
