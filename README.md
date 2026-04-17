# PlantUMLAssist

PlantUML 記法の GUI 編集ツール。Python バックエンド + HTML/JS フロント。[MermaidAssist](../05_MermaidAssist) の sister project。

## 特徴

- **Tier1 ロードマップ** (対応予定): Sequence / Use Case / Class / Activity / Component / State の UML 主要6図形
- **v0.1.0** 時点では **Sequence Diagram** の MVP 実装
- **local (Java)** がデフォルトレンダリング、**online (plantuml.com)** にもオプションで切替可能
- **DiagramModule v2** インターフェース (MermaidAssist 踏襲)
- **縦並びラベル付き追加フォーム**、DSL エディタ Tab/Shift+Tab でインデント挿入

## 起動

```bash
cd 06_PlantUMLAssist
python server.py
# http://127.0.0.1:8766 をブラウザで開く
```

## 要件

- Python 3 (標準ライブラリのみ)
- Java 8+ (local render モード用。online モードでは不要)
- `lib/plantuml.jar` (リポジトリ同梱、v1.2024.7)

Java がインストールされていない場合は、UI 右上の `render-mode` を `online` に切替えて使用可能 (plantuml.com の公開サーバー利用、業務データは外部送信されることに注意)。

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

MIT。`lib/plantuml.jar` は PlantUML プロジェクト (GPL-3.0 / LGPL / Apache 2.0 dual-license) から同梱、各々のライセンスに従う。
