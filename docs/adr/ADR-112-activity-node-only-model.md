# ADR-112: Activity モデルは node-only (エッジモデルを持たない)

## Status
Accepted (2026-06-15)

- **カテゴリ**: アーキテクチャ
- **対象プロジェクト**: PlantUMLAssist

## Context
パーサ網羅性 (C) の検討で矢印ラベル `-> text;` (コネクタの注記) への対応要望が出た。
現 activity モデルは「ノードの列 + ネスト」のみで、ノード間の遷移 (エッジ) を
第一級オブジェクトとして持たない。

## 検討した選択肢
- **A) edge を第一級モデル化** — ラベル・コネクタ・goto/label を表現可能にする。
- **B) node-only を維持** — 矢印ラベル等のエッジ注記を v1 では対象外とする。

## Decision
**B を採用。** v1 では activity は node-only のまま。矢印ラベル / `(A)` connector /
goto-label はサポートしない。対応範囲は start / stop / end / action / decision (if・
while・repeat) / fork / split / swimlane / note の node 表現で表せる範囲とする。

## Consequences
- edge 導入は parser・overlay 分類・プロパティ・canonical の全層に波及し、ADR-111 の
  Sibling 並び替え (node 単位) とも干渉する。"ブラッシュアップ" の範囲を超えるため、
  明示的に v1 外と確定する (この「やらない」の記録自体が本 ADR の価値)。
- 将来エッジ注記が必須になった場合は、本 ADR を superseded とし edge モデル ADR を起こす。
