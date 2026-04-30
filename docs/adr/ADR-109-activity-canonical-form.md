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
