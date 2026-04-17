# ADR-101: Python バックエンド選定

- **ステータス**: 承認
- **カテゴリ**: アーキテクチャ
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

PlantUML は Java 実行が必要。MermaidAssist と違いクライアント JS では完結しない。バックエンドを用意する必要があり、言語/ランタイム選定が必要。

## 検討した選択肢

### A) Node.js (Express)
- メリット: JS/TS 統一、既存 MermaidAssist ツールチェインに近い
- デメリット: npm install 前提

### B) Python 3 stdlib のみ (http.server)
- メリット: 組み込み stdlib のみで完結、pip 依存不要
- デメリット: http.server は production 用途でないが、本プロジェクトはローカル開発ツールなので問題なし

### C) Java (Jetty)
- メリット: plantuml.jar とランタイム共有
- デメリット: 起動遅い、Java server 実装コストが高い

## 決定

**B) Python 3 stdlib のみ** を採用。

## 結果

- `server.py` 約 150 行で完結
- 外部依存 0 (stdlib のみ)
- `python server.py` で起動

## 教訓

- ローカル開発ツールは stdlib のみで書けるとセットアップが極小で済む
