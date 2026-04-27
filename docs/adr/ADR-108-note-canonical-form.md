# ADR-108: Note Canonical DSL Form

## Status
Accepted (2026-04-27)

## Context
PlantUML の `note` 構文には複数の表記揺れがある:
- 1 行: `note left of Foo : text`
- 複数行: `note left of Foo` ... `end note`
- Floating: `note "..." as N` + `Foo .. N` (v0.6.1 では out-of-scope)
- Position 大文字小文字 (`Left` / `LEFT`)
- target 省略 (`note left : text`、PlantUML として有効だが parse 困難)

## Decision
Class diagram の note canonical form:

| 形式 | canonical |
|---|---|
| 1 行 directional | `note <pos> of <ID> : <text>` (空白固定: `note SP pos SP of SP id SP : SP text`) |
| 複数行 directional | block 形式維持 (`note <pos> of <ID>\n<body>\nend note`) |
| Position 揺れ | 全部小文字 (`left` / `right` / `top` / `bottom`) |
| target 省略 | parser は受理しない (target 明示必須) |
| Floating + link | v0.6.1 out-of-scope (Tier2 / v0.7.0+) |

emit ルール: text に `\n` を含む場合は自動で複数行 (block) 形式、それ以外 1 行。

## Consequences
- 1 行 / 複数行 の自動判定で UI から position 変更や text 編集時に form を再選択する必要がない
- floating note は将来 v0.7.0 (Activity) で plain-text label と統合設計する
- target 省略を捨てたのは parser 複雑度を抑えるため (PlantUML 自体は可だが UML 図として位置不定なので実用上稀)
