# ADR-110: State Canonical DSL Form

## Status
Accepted (2026-04-28)

## Context
PlantUML State diagram の表記揺れを canonical 化。

## Decision

| 形式 | canonical |
|---|---|
| `state NAME` / `state NAME {}` (空 body) | `state NAME` |
| `state NAME { state Inner }` (composite) | block 形式維持 |
| `state X <<choice>>` / `<<Choice>>` | `state X <<choice>>` (lowercase) |
| `state X <<history>>` / `<<historyDeep>>` | 同上 (lowercase) |
| `[*] --> A` / `A --> [*]` | そのまま (pseudo-state はリテラル) |
| `A --> B` (label なし) | `A --> B` |
| `A --> B : trigger [guard] / action` | `A --> B : trigger [guard] / action` (空白固定) |
| Note 1 行 / 複数行 | Class v0.6.1 と同じ自動判定 |

emit は label 内 trigger/guard/action を空白固定で再合成:
`<trigger> [<guard>] / <action>` (省略要素は前後の区切り含めて省略)

## Consequences
- composite nesting は 1 段のみ canonical (Tier2 で 2+ 段検討)
- pseudo-state `[*]` は state エントリ作らず transitions 内表現のため、
  parser 構造がシンプル
