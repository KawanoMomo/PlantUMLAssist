# ECN-007: 修正フロー対応 — groups (alt/loop/...), notes, message reorder UI

- **ステータス**: 適用済
- **種別**: 機能追加
- **対象コミット**: `87b1a70`
- **影響ファイル**: src/modules/sequence.js, tests/sequence-parser.test.js, tests/sequence-updater.test.js
- **関連スキル**: [`dsl-editor-spec-checklist`](~/.claude/skills/dsl-editor-spec-checklist/SKILL.md)

## コンテキスト

ユーザから「シーケンスの順番を変えられない／alt・loop も無い／注釈も入れれない」という指摘。v0.1.0 は作成フロー機能に集中しすぎて、**既存図を修正する実務フロー**の機能が UI から欠落していた。

類似プロジェクト MermaidAssist も同じ症状があり（note backend はあるが UI なし、reorder は全く無し）、これは「feature-list 駆動で spec を書く」習性から生じる見落としと判明。

## 問題の詳細

DSL 編集ツールは2つのフローを持つ:
1. **作成フロー** (Authoring): 新規に参加者 / メッセージ / タイトルを足していく
2. **修正フロー** (Iteration): 既存図の途中にメッセージを挿入 / 順序入れ替え / 条件分岐を追加 / 注釈を差し込む

v0.1.0 は(1)しか設計されておらず、(2)を要するたびに editor テキストを手で書き直す羽目になっていた。

## 対策

### Groups (alt / opt / loop / par / break / critical / group)

- Regex: `^(alt|opt|loop|par|break|critical|group)(?:\s+(.*))?$` で検出
- `groupStack` で nest tracking → `groups[].parentId` と `endLine` を埋める
- `else` は alt 内の divider として透過扱い
- `addGroup(text, kind, label)`: 空ブロック + `end` を @enduml 直前に挿入
- `deleteGroup(startLine, endLine)`: 開始と end のみ削除し中身は保持

### Notes

- Regex: `^note\s+(left of|right of|over)\s+([^:]+?)(?:\s*:\s*(.*))?$`
- `addNote(position, targets[], text)` / `updateNote(lineNum, field, value)` / note 選択時の編集パネル追加

### Message reorder (↑↓)

- `moveMessage(text, lineNum, direction)`: 隣接する空行/コメントをスキップしつつ swap、`@startuml`/`@enduml` 境界で停止
- メッセージリストの各行に ↑/↓/編集/✕ ボタンを inline で配置

### Property panel

3セクションを追加:
- 「ブロックを追加 (alt/opt/loop/par…)」: Kind select + Label/Condition + button
- 「注釈 (note) を追加」: Position + Target + Text + button
- 「ブロック一覧」「注釈一覧」: delete/edit ボタン付き

## 結果

- Unit: +16 cases (parser 5 + updater 11), 47 passed
- E2E: 9 passed
- 実機で alt/else/loop/note over を含む 22 行の PlantUML 例で SVG レンダリング確認
- ブロック一覧に `alt valid L10-15`, `loop daily L17-19` 表示確認

## 教訓

- DSL 図形エディタの仕様策定時は「**作成フロー**」と「**修正フロー**」を必ず別セクションで書き出す
- テンプレート/デフォルト例は**最低15要素以上**の規模にして、小規模で隠れる UX 問題を可視化する
- **Parse 対応済みで UI 欠落**という組み合わせが最も見落としやすい（MermaidAssist の note がまさにこれ。backend は揃っていたのに UI が無かった）
- このメタ教訓は skill `dsl-editor-spec-checklist` として workspace に格納、今後 planner エージェントが自動で invoke する
