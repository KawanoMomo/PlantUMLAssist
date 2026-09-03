# ADR-109: Activity Canonical DSL Form

## Status
Accepted (2026-04-27)

## Context
PlantUML Activity diagram には新記法 (`:action;`, `if (cond) then ...`) と
legacy 記法 (`(*) --> :action;`) が共存している。さらに同一構文内でも
表記揺れが多い (label 省略、空白揺れ、swimlane の color 指定)。

## Decision

| 形式 | canonical |
|---|---|
| start / `:start;` (legacy) | `start` |
| stop / `:stop;` | `stop` |
| end / `:end;` | `end` |
| `:foo;` (1 行) | `:foo;` |
| `:line1\nline2;` (複数行) | `:line1\nline2;` (text 内改行保持) |
| `if (c)` / `if (c) then` / `if (c) then (yes)` | `if (c) then (yes)` |
| `else` / `else (no)` | `else (no)` |
| elseif | `elseif (c) then (yes)` |
| endif (空白揺れ) | `endif` |
| `while (c)` / `while (c) is (yes)` | `while (c) is (yes)` |
| endwhile | `endwhile` |
| repeat ... `repeat while (c)` | `repeat ... repeat while (c) is (yes)` |
| `forkagain` / `fork  again` | `fork again` |
| `endfork` / `end  fork` | `end fork` |
| Legacy `(*) --> :foo;` | parse-only。新記法に normalize して emit (start + 順次 action) |
| swimlane `\|color\|name\|` | `\|name\|` (color 部分は v0.7.0 で捨てる) |
| note right / left (1 行 / 複数行) | Class v0.6.1 と同じ自動判定 |

emit ルール:
- label 省略時は `(yes)` / `(no)` を補完 (新記法では label 必須に等価扱い)
- legacy emit はサポートしない (v0.7.0 では新記法 emit のみ)

## Consequences
- 新記法 primary により、graphviz auto-layout の安定性を最大化
- Legacy ファイルを読み込むと normalize されて editor に表示 → 元 DSL は失われる
  (ユーザーには CHANGELOG で周知)
- 将来 v0.7.1+ で legacy emit option を追加可能 (本 ADR は新記法 emit を canonical と確定するのみで、legacy emit を禁止しない)

## Addendum (2026-06-15) — 色付き action / split 対応

パーサ網羅性 (C) 拡張に伴い、以下を canonical に追加する (既存決定は不変、拡張のみ)。

| 形式 | canonical |
|---|---|
| `#color:foo;` (色付き action) | `#<color>:foo;` (色プレフィックスは保持し正規化しない。本体 `:foo;` は既存ルール通り) |
| `split` / `split  again` (空白揺れ) | `split` / `split again` |
| `end split` / `end  split` | `end split` |

- 従来 `#color:foo;` はどの規則にもマッチせず **サイレント消失** していた。本追補で正式対応 (修正を兼ねる)。
- 色は Action の属性であり、新ノード種別を作らない。
- split は fork と構造同型 (Composite node・Branch・原子移動)。emit も fork に準ずる。
- overlay 分類 (`_classifyShape`) は rx / height ベースのため色付きでも action として分類される想定。新図形 (split bar) は fork bar と被るため、分類ロジックの視覚検証が必須 (ADR-111 / visual verification gate)。
- 関連: [ADR-111](ADR-111-activity-sibling-reorder.md) (並び替え), [ADR-112](ADR-112-activity-node-only-model.md) (node-only)。
