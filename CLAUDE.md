# CLAUDE.md (06_PlantUMLAssist)

## プロジェクト概要

PlantUMLAssist — PlantUML 記法の GUI 編集ツール。Python 3 backend + HTML/JS frontend。MermaidAssist の sister project、DiagramModule v2 インターフェースを流用。

## 技術スタック

- Python 3 stdlib (http.server) — backend
- Java 8+ (plantuml.jar 実行) — local render mode のみ
- JavaScript ES5 (ビルドなし、単一 HTML + src/*.js 構成)
- Playwright — E2E

## アーキテクチャ

- `server.py` — backend (render endpoint + 静的配信)
- `plantuml-assist.html` — エントリ
- `src/core/` — MermaidAssist と共有 (コピー)
- `src/ui/properties.js` — 14 helpers (MermaidAssist 共通)
- `src/modules/*` — 各 PlantUML 図形モジュール
- `src/app.js` — async render pipeline
- `lib/plantuml.jar` — PlantUML 公式 jar

## 開発コマンド

- 起動: `python server.py` → http://127.0.0.1:8766
- Unit: `node tests/run-tests.js`
- E2E: `npx playwright test`

## Visual Verification Gate

GUI 描画に影響するコード変更時は Playwright で実機スクリーンショット検証。自動テスト GREEN だけでは不十分 (MermaidAssist ADR-014 準拠)。

## 設計ドキュメント

- Design: `docs/superpowers/specs/2026-04-17-plantuml-assist-design.md`
- Plan: `docs/superpowers/plans/2026-04-17-plantuml-assist-v0.1.0.md`
- ADR: `docs/adr/` (ADR-101+)、workspace ADR-011 + MermaidAssist ADR-011〜018 も適用
- ECN: `docs/ecn/`
