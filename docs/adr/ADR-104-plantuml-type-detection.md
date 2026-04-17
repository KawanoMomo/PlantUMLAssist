# ADR-104: PlantUML type detection heuristic

- **ステータス**: 承認
- **カテゴリ**: インターフェース
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

PlantUML は図形タイプが明示的に宣言されない。`@startuml...@enduml` の中身から推定。

## 検討した選択肢

### A) 独自拡張 (@startsequence)
- 誤判定 0、非標準

### B) Heuristic + fallback
- 標準維持、曖昧時の誤判定あり

### C) 手動選択のみ
- UX 悪

## 決定

**B) Heuristic + 手動 override** を採用。

判定順: participant/actor 系 → usecase → class → activity → component → state → 矢印行 → fallback = Sequence。

## 結果

- 多くの入力で自動判定成功
- 曖昧時は Sequence fallback、`<select>` で手動切替可能

## 教訓

- 明示的 type のない DSL は heuristic + manual override が現実解
