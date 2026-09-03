# ADR-111: Activity Node Sibling Reorder

## Status
Accepted (2026-06-15)

- **カテゴリ**: インタラクション
- **対象プロジェクト**: PlantUMLAssist

## Context
Activity モジュールには作成・途中挿入・分岐操作はあるが「並び替え」が無い
(`capabilities.participantDrag=false`。participant drag は sequence 専用の横方向
カラム入替であり、縦フロー + ネスト構造を持つ activity には流用できない)。
並び替えを入れるには、ネストをまたぐ移動の意味論を先に確定する必要がある。

## 検討した選択肢
- **(i) フラット行スワップ** — 隣接行を機械的に入替。実装は容易だが、ブロック境界を
  越えると DSL が壊れ、暗黙に Branch 所属が変わる。GREEN でも意味が壊れる
  (visual verification gate / MermaidAssist ADR-014 が警告する事故型)。
- **(ii) 構造認識 Sibling 並び替え** — Body 構造を理解した上で兄弟内のみ移動。

## Decision
**(ii) を採用。** 詳細:

- 並び替えは **Sibling**(同一 Body 配列)内でのみ行う。
- **Composite node** (if / while / repeat / fork / split) は原子単位で移動する
  (ヘッダ・全 Branch・Body・終端トークンを一塊として動かす。分割しない)。
- 機構は **プロパティパネルの ↑/↓ ボタン**(前/次の Sibling と入替)。v1 では drag を
  採用しない — overlay rect は既に click=選択 / hover=挿入アフォーダンスの 2 ジェスチャを
  持ち、drag 追加は 1 要素 3 ジェスチャの衝突を招く。ドロップ座標判定はピクセル単位の
  視覚検証も困難。
- 兄弟の**先頭での ↑** / **末尾での ↓** は **disabled**。ブロック境界越え
  (Branch からの脱出・流入、swimlane 跨ぎ) は v1 で禁止。
- ノードの**移動スパン** = `line`〜`endLine` + 直後に attach された note 群。
  move は当スパンを一塊で remove / insert し、note を常に正しいノードへ追従させる
  (PlantUML の note は直前 statement に attach される位置依存仕様のため)。
- swimlane 宣言行 `|Lane|` は v1 で並び替え対象外 (Sibling 列挙から除外)。
  レーン所属の変更は別 UI (プロパティの所属レーン変更) で後日扱う。

## Consequences
- 並び替え後も DSL は常に妥当 (境界不変条件を保持)。
- drag・境界越え移動・レーン移動は、↑/↓ move 操作と Sibling モデルの上に乗る将来の
  上物として後から追加できる。
- C (パーサ網羅性) で増える新ノード種別も、parser が `line`/`endLine` と正しい
  nesting を与える限り自動的に並び替え対象に含まれる
  (色付き action は Action の属性なので不変、split は Composite node)。
