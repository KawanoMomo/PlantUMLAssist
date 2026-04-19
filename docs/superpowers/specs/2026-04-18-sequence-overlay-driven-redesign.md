# Sequence プロパティパネル再設計 (overlay 駆動 / UC 駆動)

- **作成日**: 2026-04-18
- **ステータス**: 草稿
- **対象**: PlantUMLAssist Sequence 先行 / その後 MermaidAssist 横展開
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

## 背景

v0.1.0〜現状の Sequence 編集 UI は **追加フォーム乱立 + 末尾固定挿入** の構造で、業務での修正フロー (途中挿入 / 後付け alt / 範囲操作 / 参照追従リネーム / 近傍 note / etc.) のほとんどが **テキスト直接編集に頼らないと完遂できない**。後述の業務 UC では 10件中 8件が UI で破綻。

根本原因は「StableState/Block で機能していた『SVG要素クリック → 選択 → プロパティ編集 → 文脈で追加位置決定』のループが、Mermaid/PlantUML が他人 (公式エンジン) の SVG を出すために断裂したこと」。本仕様はこのループを overlay 層で復元する。

## 業務ユースケース (UC-1 〜 UC-10)

| UC | 業務状況 | やりたいこと | 必要 element 操作 | 現状 | 新仕様 |
|---|---|---|---|---|---|
| UC-1 | 新規機能設計 (API 認証フロー) | 空からシーケンス図を起こす | 末尾追加×多数 | ✅ | ✅ |
| UC-2 | 不具合対応 (リトライ時トークン更新漏れ) | 既存図 #5/#6 間に retry alt + 2-3 メッセージ挿入 | 途中挿入 + 後付け alt | ❌ | ✅ |
| UC-3 | 仕様変更 (DB 前に Cache 層追加) | Cache 参加者を Database の手前に挿入 + 関連メッセージ宛先一括変更 + 中継メッセージ追加 | 参加者順序挿入 + 参照追従 + 途中挿入 | ❌ | ✅ |
| UC-4 | コードレビュー指摘 (エラー処理が図にない) | 各成功メッセージ直後に「失敗時 alt」を複数箇所挿入 | 範囲 alt 挿入×複数箇所 | ❌ | ✅ |
| UC-5 | リファクタリング (Cache 層全面見直し) | 既存 Cache 関連メッセージを範囲削除 → 新方式で書き直し | 範囲削除 + 末尾追加 | ⚠ | ✅ |
| UC-6 | 本番障害の root cause 反映 (timeout 想定 5s vs 実測 30s) | 該当メッセージに実測値 note + タイムアウト alt 分岐追加 | メッセージ近傍 note + 後付け alt | ❌ | ✅ |
| UC-7 | onboarding 用整理 | 既存図の各メッセージに学習用 note を多数付与 | メッセージ近傍 note ×多数 | ❌ | ✅ |
| UC-8 | IEC 61508 Safety Case 作成 | 各メッセージに fault detection / response の note + エラー応答 alt 明示 | UC-7 + UC-3 合成 | ❌ | ✅ |
| UC-9 | 横展開 (ログイン → サインアップ) | 既存図コピー + 一部メッセージ削除/変更 + 参加者リネーム参照追従 | 流用 + リネーム参照追従 | ❌ | ✅ |
| UC-10 | 公開前 polish | ラベル微調整 / autonumber / title / 重要箇所強調 | 編集系のみ | ✅ | ✅ |

完了基準: 全 10 UC が **現状 ✅ / 新仕様 ✅** で UI のみで完遂できる。

## UI Capability (C1〜C13)

| # | Capability | 由来 UC |
|---|---|---|
| C1 | 位置駆動の挿入 (前/後/内側 + 種類 select) | UC-2,3,4,6,8 |
| C2 | 範囲選択 + 一括操作 (alt囲/loop囲/削除) | UC-3,4,5 |
| C3 | 参加者の順序指定挿入 | UC-3,9 |
| C4 | 参照追従リネーム | UC-3,9 |
| C5 | メッセージ近傍 note 挿入 | UC-6,7,8 |
| C6 | 後付け alt/loop (既存メッセージを囲む) | UC-2,3,4,6 |
| C7 | 複数箇所 multi-select 一括操作 | UC-4,7,8 |
| C8 | コピー流用 (範囲 → 別位置複製) | UC-9 |
| C9 | ライフライン自動推論 (送信→activate / 返信→deactivate を一括) | UC-7 |
| C10 | 明示「中身保持」削除 (block 削除時に中身残し選択) | UC-5 |
| C11 | 複数行ラベル (改行サポート) | (品質) |
| C12 | 行/部分単位スタイル (色 + B/I/U) | (品質) |
| C13 | ラベル WYSIWYG プレビュー | (品質) |

## アーキテクチャ

### データフロー

```
[DSL text]
    │ parse (既存)
    ↓
[Model] {participants, messages, notes, groups, activations}
    │
    ├──→ render (Java jar / plantuml.com)
    │       ↓
    │   [SVG]
    │       │
    │       ↓ buildSequenceOverlay() (NEW)
    │   [Overlay Layer: 透明 <rect> / <line> with data-line, data-type, data-id]
    │       │ click / shift-click
    │       ↓
    │   [Selection]
    │
    └──→ renderProps (selection-driven, NEW)
            ↓
        [Property Panel] (B' レイアウト)
            │
            ├ no selection: Title / autonumber / 末尾追加 menu
            ├ single: 編集フォーム + 位置駆動挿入 + 削除
            └ range: 一括操作バー
            │
            ↓ insert/edit/delete
        [新 updaters: insertBefore / insertAfter / wrapWith / unwrap / renameWithRefs]
            ↓
        [DSL text 更新]
```

### 主要モジュール

#### `buildSequenceOverlay(svgEl, parsedData, overlayEl)`

Gantt の `calibrateScale` パターンを Sequence 用に書く。マッチング戦略:

| 要素 | SVG 検索 | DSL マッチング |
|---|---|---|
| participant | `text` (top of lifeline, x座標 + 文字内容) | label 文字列で一致 → 一致した text の bbox 周辺に rect |
| message | `text` (中央配置) + `line`/`path` | DSL 出現順 (line番号昇順) と SVG 内 y座標昇順を**序数マッチ** |
| note | `g.note > rect` または `rect` (note 専用 fill 色) | text 内容と座標 |
| activation | 細長い縦 `rect` (width < 20, height > 30) | 親 lifeline の x + y range で照合 |

エラー耐性: マッチ失敗時 (例: alt/loop の特殊レイアウトで序数ズレ) は overlay rect を生成せず、warning bar をパネル top に出す:
```
⚠ オーバーレイマッチングに 2 件失敗。リスト一覧から編集してください。[詳細]
```

#### `renderProps(selData, parsedData, propsEl, ctx)` 再設計

3つの状態:

##### State 1: no selection
- Title 編集 (即時反映)
- autonumber checkbox
- 「末尾追加」compact menu (種類 select [message/note/block/activation/participant] + 詳細フォーム展開)

##### State 2: single selection
B' レイアウト準拠:

```
[selected-bar]
  選択要素のラベル + 種類 + 行番号

[編集フォーム]
  選択要素の種類に応じたフィールド (即時反映)
  - message: From / Arrow / To / 本文 (rich editor)
  - participant: Type / Alias / Label (rich) / [☑ 参照追従リネーム]
  - note: Position / Target(s) / Text (rich)
  - block: Kind / Label
  - activation: Action / Target

[挿入アクション] (位置駆動 = 選択要素基準)
  ↑ この前にメッセージ追加
  ↓ この後にメッセージ追加
  ↓ この後に注釈追加
  ⌗ alt/loop で囲む…
  ⚡ ライフライン自動推論 (このメッセージに対し)
  📋 複製

[移動]
  ↑ 上へ / ↓ 下へ

[削除]
  ✕ 削除  (block の場合: ☑ 中身を残す)
```

##### State 3: range selection (multi-select)

```
[selected-bar]
  N items selected (line A〜line B)

[一括アクション]
  ⌗ alt で囲む / loop で囲む / opt で囲む
  📋 複製
  ↑↓ 一括移動
  ✕ 一括削除
```

#### Rich Label Editor (C11/C12/C13)

各テキストフィールド (message 本文 / note text / participant label) で共通使用:

- **textarea (multi-line)** + auto-resize
- **toolbar**: B / I / U / 色チップ7色+解除 / 改行 (↵)
- **live preview** (白背景の WYSIWYG 枠)
- 内部表現: PlantUML 形式 (`\n`, `<color:red>...</color>`, `<b>...</b>`) で textarea に挿入。手書き編集も可
- Mermaid 移植時は `\n` → `<br>` 変換層を追加

#### 新 updaters

```js
// 既存末尾追加: addMessage(text, from, to, arrow, label)
// 新規:
insertBefore(text, lineNum, kind, props) → 指定行の前に挿入
insertAfter(text, lineNum, kind, props)  → 指定行の後に挿入
wrapWith(text, startLine, endLine, blockKind, blockLabel) → 範囲を block で囲む
unwrap(text, blockStartLine, blockEndLine, keepInner) → block 解除 (中身残す/消す選択)
renameWithRefs(text, oldId, newId) → participant リネーム + 全 from/to 参照を追従
duplicateRange(text, startLine, endLine, insertAfterLine) → 範囲複製
inferActivations(text, msgLine) → 単一メッセージから activate/deactivate を推論挿入
```

## エラー処理

| 状況 | 対応 |
|---|---|
| overlay マッチング失敗 | warning bar + list-based UI にフォールバック |
| range 選択中に削除 → 中に block の開始/終了が片方だけ含まれる | 削除前に確認モーダル「block 構造が壊れます。{...} を一緒に削除しますか？」 |
| renameWithRefs で id 衝突 (新名が既存と被る) | 確定前に検出してエラー表示、既存名候補を提示 |
| rich editor で不正な装飾 nest | 確定時に自動補正 (close tag 補完) |

## テスト戦略 (UC → E2E mapping)

各 UC は **1 spec ファイル** に対応:

| UC | E2E spec ファイル | 主要検証 |
|---|---|---|
| UC-1 | `tests/e2e/uc-01-new-design.spec.js` | 空 → 9 element の図、UI のみで完遂 |
| UC-2 | `tests/e2e/uc-02-bug-fix-mid-insert.spec.js` | 既存10msg → #5 と #6 間に alt + 2msg 挿入 |
| UC-3 | `tests/e2e/uc-03-spec-change-cache-layer.spec.js` | DB 前に Cache 順序挿入 + 4 msg 宛先一括変更 |
| UC-4 | `tests/e2e/uc-04-review-error-handling.spec.js` | 3 箇所のメッセージ直後に「失敗時 alt」追加 |
| UC-5 | `tests/e2e/uc-05-refactor-range-delete.spec.js` | 既存 Cache 関連 4 msg を範囲選択削除 |
| UC-6 | `tests/e2e/uc-06-incident-near-note-alt.spec.js` | 該当 msg に実測値 note + タイムアウト alt |
| UC-7 | `tests/e2e/uc-07-onboarding-near-notes.spec.js` | 各 msg に学習用 note 連続追加 |
| UC-8 | `tests/e2e/uc-08-safety-case-fault-handling.spec.js` | UC-7 + UC-3 合成 |
| UC-9 | `tests/e2e/uc-09-derive-new-flow.spec.js` | コピー → リネーム参照追従 |
| UC-10 | `tests/e2e/uc-10-pre-publish-polish.spec.js` | ラベル微調整 + autonumber + title |

加えて Capability 単体テスト (`tests/e2e/capability/`):
- `c1-position-insert.spec.js` 〜 `c13-rich-preview.spec.js`

ユニットテスト:
- 新 updaters 各 5-8 テスト
- buildSequenceOverlay calibration 単体 (SVG fixture 入力 → overlay rect 出力)

## ロードマップ

### Phase 1: 基盤 (Sprint 1-2)
- 新 updater 実装 + ユニットテスト
- buildSequenceOverlay 実装 + calibration ユニットテスト

### Phase 2: 選択駆動パネル (Sprint 3-4)
- B' レイアウトの no-selection / single-selection 実装
- Rich Label Editor (textarea + toolbar + preview)

### Phase 3: 範囲選択 (Sprint 5)
- shift-click 範囲選択
- 一括操作バー

### Phase 4: UC 検証 (Sprint 6-7)
- UC-1 〜 UC-10 の E2E spec 実装
- 失敗 UC があれば該当 capability にフィードバック
- 全 UC PASS が完了基準

### Phase 5: ECN cross-apply (Sprint 8)
- MermaidAssist Sequence に同パターン適用 (overlay 計算式は Mermaid SVG 構造に合わせ調整)

### Phase 6: 横展開 (将来)
- PlantUMLAssist Tier1 残り 5 図形 (Use Case / Class / Activity / Component / State) に同じ overlay 駆動 + UC 駆動アプローチを適用

## A' フォールバック保留

overlay マッチングが破綻した場合の代替案として「自前簡易レンダラで編集中表示 → 確定で公式エンジン再描画」がある。この案は:
- 利点: SVG 構造のバージョン依存リスクを完全回避
- 欠点: 実装コスト大 (各図形ごとに簡易レンダラを書く)

本仕様では **A 路線の overlay マッチング** を主路線とし、Phase 4 で UC PASS 率が 80% 未満になった図形のみ A' を検討する (ADR で保留)。

## スコープ外

- 自前簡易レンダラの実装 (A' 路線)
- 図のドラッグ&ドロップでの participant 入れ替え (現状は select+順序挿入で代替)
- リアルタイム collaborative editing
- AI suggest (smart context, mockup C 案) は将来検討
