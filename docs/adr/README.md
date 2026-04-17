# Architecture Decision Records (ADR)

PlantUMLAssist の技術的意思決定の履歴。

## 一覧

| # | タイトル | カテゴリ | ステータス | 日付 |
|---|---|---|---|---|
| [101](ADR-101-python-backend.md) | Python バックエンド選定 | アーキテクチャ | 承認 | 2026-04-17 |
| [102](ADR-102-async-render-pipeline.md) | Java 非同期 render pipeline | インターフェース | 承認 | 2026-04-17 |
| [103](ADR-103-render-mode-switch.md) | Local / Online render モード切替 | 配布・運用 | 承認 | 2026-04-17 |
| [104](ADR-104-plantuml-type-detection.md) | PlantUML type detection heuristic | インターフェース | 承認 | 2026-04-17 |

## 命名規則

`ADR-NNN-kebab-case-title.md` (NNN は3桁ゼロ埋め、101 から開始)

注意: ADR-001〜010 はワークスペース共通、ADR-011〜019 は MermaidAssist が使用済み、ADR-101〜 は PlantUMLAssist 名前空間。

## 関連

- ワークスペース共通 ADR: `E:\00_Git\docs\adr\`
- MermaidAssist ADR で本プロジェクトに適用するもの: ADR-011 (JS外部分割), ADR-012 (DiagramModule v2), ADR-013 (Connection Mode), ADR-014 (Visual Verification Gate), ADR-015 (Vertical relation form), ADR-016 (system-tester), ADR-018 (registry merge)
