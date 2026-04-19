# Sequence 直接操作 UX 強化 Design Spec

- **作成日**: 2026-04-19
- **ステータス**: 草稿
- **対象**: PlantUMLAssist Sequence (Sprint 1-7 完了後の継続改善)
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

## 背景

Sprint 1-7 で「overlay click → selection → props panel 編集」の基盤は完成したが、実運用で次の不満が残った:

1. 選択中の要素が視覚的に判別できない (右パネルのテキストでしか分からない)
2. 中間挿入が modal ベースで、位置指定が不便 (どこに入るか直前まで分かりにくい)
3. メッセージ追加時、既存 participant にない宛先を指定する手順が分断される
4. 本文 textarea のキーボード入力が StableState (DSL エディタ) に比べてぎこちない
5. participant の並び替え・色指定が SVG 上で直接できず、テキスト編集に頼る
6. プロパティ編集の undo/redo が一貫しない

加えて、バグ: **拡大率を変えると overlay と SVG がズレ選択不能** (既に commit `18e38c3` で修正済み — 本 spec の範囲外)。

## 業務ユースケース (UC-11 〜 UC-16)

(Sprint 1-7 の UC-1 〜 UC-10 からの継続連番)

| UC | 業務状況 | やりたいこと | 必要 capability | 現状 | 新仕様 |
|---|---|---|---|---|---|
| **UC-11** | 会議中に図を追加修正 | 選択箇所が一目でわかり、クリックで編集→次の操作へ迷わず進む | 選択ハイライト | ❌ | ✅ |
| **UC-12** | 既存図に 1 本挿入 (リトライ処理など) | SVG 上で挿入したい位置をマウスで直接クリック → その位置に追加 | Hover 挿入ガイド + click modal | ⚠ modal はあるが「この前/後」の相対指定 | ✅ 絶対位置 |
| **UC-13** | 新規サブシステムを表す participant 追加しつつメッセージ作成 | 「+ 新規追加」を dropdown から直接選んで流れを止めない | pulldown 新規追加 entry | ❌ | ✅ |
| **UC-14** | 本文を書き直す | textarea に入り、Tab/Escape/改行 が自然に効く | StableState 準拠キーボード | ⚠ Tab/Escape 未定義 | ✅ |
| **UC-15** | 認証層を真ん中に再配置 / 視覚的区別 | participant を SVG でドラッグ並び替え + クリックで色分け | Drag reorder + Color palette | ❌ | ✅ |
| **UC-16** | 何を書きすぎたか Ctrl+Z で戻す | 全ての props 変更が 1 回で undo 可 | history.pushHistory 網羅 | ⚠ 一部未対応 | ✅ |

## UI Capability (C14〜C19)

| # | Capability | 由来 UC |
|---|---|---|
| C14 | 選択要素ハイライト (青枠 + 半透明背景) | UC-11 |
| C15 | Hover 時の水平点線ガイド + 「+ ここに挿入」 | UC-12 |
| C16 | クリック y 座標から「line N の前/後」を自動判定 | UC-12 |
| C17 | pulldown 末尾の「+ 新規追加」で participant を先行作成 | UC-13 |
| C18 | rich-label-editor の Tab=2空白 / Escape=modal close | UC-14 |
| C19 | participant のドラッグ並び替え + 色パレット (8色 + なし) | UC-15 |
| C20 | 全 change handler で `history.pushHistory()` 呼び出し保証 | UC-16 |

## アーキテクチャ

### データフロー変更点

```
既存: [DSL] → parse → render → overlay → click → selection → props → updater → DSL
                                                      ↑
                                                   (単一 click のみ)

追加:                     ┌→ hover-layer ─→ mouseover (y監視)
                          │                     ↓
                          │                 "挿入位置 line N" 算出
                          │                     ↓
                          │                 click → modal
                          │
overlay ──→ event handler ─┼→ click → selection (既存)
                          │
                          └→ mousedown + move > 4px → drag モード
                                          ↓
                                 drop indicator 表示
                                          ↓
                              mouseup → moveParticipant(id, newIdx)
```

### 主要モジュール変更

#### `src/ui/sequence-overlay.js`

- `buildSequenceOverlay()`: 既存 overlay rect に `data-id` に加え、参加者には `data-participant-index` を追加
- 新関数 `buildHoverLayer(containerEl, parsedData, onInsert)`: preview container の「空白部分」を監視する透明 rect を配置、mousemove で水平点線 SVG element を更新、click で `onInsert(line, position)` を呼ぶ
- drag 処理は app.js 側で overlay event を拾う (rect 単位) + ghost element 作成

#### `src/app.js`

- overlay mousedown ハンドラ拡張:
  - target が participant → 閾値判定開始 (> 4px 移動で drag モード)
  - click 閾値未満は従来の selection
- drag モード中:
  - 半透明コピー element を `document.body` 末尾に append + マウス座標追従
  - 最寄りの「participant の境界」を判定し、青点線 drop indicator を overlay に描画
  - mouseup で `moveParticipant` を呼ぶ + cleanup

#### `src/modules/sequence.js`

新 updater:
- `setParticipantColor(text, alias, hex)`: participant 行の末尾に `#HEXCOLOR` を付与 or 置換 or 削除 (hex が null なら削除)
- `moveParticipant(text, alias, newIndex)`: participant 行を DSL 順序上で移動 (他の行は維持)

renderProps: participant 選択時に `<div class="seq-color-palette">` を追加
props panel の "From / To" pulldown に `<option value="__new__">+ 新規追加…</option>` を追加し、選択時に inline 入力を展開

#### `src/ui/rich-label-editor.js`

`mount()` 内の textarea keydown ハンドラ追加:
- `Tab` (no modifier): preventDefault + 2空白挿入
- `Escape`: emit custom event `rle-escape` (modal 側で listen して close)

#### CSS

overlay rect に `selected` class を付けて視覚化:

```css
#overlay-layer rect.seq-overlay-target.selected {
  fill: rgba(124, 140, 248, 0.08);
  stroke: #7c8cf8;
  stroke-width: 2;
  rx: 3;
  pointer-events: all;
}
```

## 詳細仕様

### C14: 選択ハイライト

- 選択された overlay rect (`data-type=xxx` 全種) に `class="... selected"` を付与
- `fill: rgba(124,140,248,0.08)`, `stroke: #7c8cf8`, `stroke-width: 2`, `rx: 3` を適用
- 多重選択時は全要素に適用
- selection 変更時に古い要素から class 削除

### C15 + C16: Hover ガイド + クリック挿入

- Preview container の「overlay rect が当たらない空白部分」に対し:
  - mousemove で水平点線 `<line>` を `y=mouseY` に描画
  - 点線の近くに「+ ここに挿入」label をテキスト描画
  - mouseout で消去
- overlay rect 上にマウスがあるときはガイド非表示 (既存 hover 優先)
- click (non-rect 領域) → `onInsert(y)` 呼ぶ
  - y から最寄りの「2 messages の間」を算出
  - 該当する挿入位置 line N を計算
  - `_showInsertForm(ctx, N, 'after', 'message')` を呼ぶ (既存 modal 流用)

y → line 算出ロジック: 各 overlay rect の y座標中心を取得してソート → mouseY を区間に割り当て → 区間上端の rect の `data-line` を採用 + `position='after'`

### C17: pulldown 「+ 新規追加」

- `selectFieldHtml` を拡張し、option リスト末尾に `{ value: '__new__', label: '+ 新規追加…', class: 'new' }` を追加できる API
- change event で value が `__new__` なら inline 入力欄を動的展開:
  - Alias (required)
  - Type (participant / actor / database / entity / ...)
  - Label (optional)
- 「+ 追加」ボタン押下時、まず新 participant を末尾追加 (addParticipant) してから本命 operation

### C18: StableState 準拠キーボード

rich-label-editor の textarea keydown:
- `Tab` (no modifier): 2空白挿入
- `Shift+Tab`: 行頭 2空白除去 (outdent)
- `Escape`: custom event `rle-escape` を dispatch (modal を閉じる側で捕捉)
- 他 (`Enter`, `Ctrl+Z` 等) はブラウザ default で通す

modal 確定時: textarea 内の実改行 `\n` (U+000A) を PlantUML の literal `\n` (2文字) に変換して commit

### C19: Drag 並び替え + Color palette

#### Drag

- overlay の `rect[data-type="participant"]` に `mousedown` 配線:
  - 閾値未満 (< 4px) の離上は既存 click (選択) 扱い
  - 4px 超で drag モード:
    - `document.body` に半透明コピー div を append (`position: fixed; pointer-events: none; opacity: 0.6`)
    - mousemove で追従
    - overlay 内で最寄りの 「participant 境界」を計算、青点線 `<line>` で drop indicator 描画
    - mouseup で `moveParticipant(text, id, newIndex)` を呼ぶ + cleanup
    - Escape 中断

#### Color

- participant 選択時のみ props panel に「色」セクション:
  - 8 色 swatch (色なし + 7色: `#FFAAAA`, `#FFD700`, `#AAEEAA`, `#AACCFF`, `#E0AAFF`, `#FFB88C`, `#D3D3D3`)
  - 現在の色 swatch に selected class (白border + 青glow)
  - swatch クリックで `setParticipantColor(text, alias, hex)` 呼ぶ

PlantUML 構文: `participant System #FFAAAA` (hex suffix)。既存 `fmtParticipant` に color を追加するか、別関数で後付けする。

### C20: Undo 網羅

- 全 change event handler で `window.MA.history.pushHistory()` を値変更**前**に呼ぶ
- 既存実装を grep で洗い出して漏れ補完 (Sprint 7 時点で多くは対応済、残件を audit)
- 重要: drag 完了時、color 変更時、新 participant 作成時も pushHistory
- Playwright E2E で Ctrl+Z → 復元を検証

## E2E テスト (UC → spec file mapping)

| UC | ファイル |
|---|---|
| UC-11 | `tests/e2e/uc-11-selection-highlight.spec.js` |
| UC-12 | `tests/e2e/uc-12-hover-insert.spec.js` |
| UC-13 | `tests/e2e/uc-13-pulldown-new.spec.js` |
| UC-14 | `tests/e2e/uc-14-stablestate-keyboard.spec.js` |
| UC-15 | `tests/e2e/uc-15-drag-color.spec.js` |
| UC-16 | `tests/e2e/uc-16-undo-coverage.spec.js` |

加えて capability 単位 (C14〜C20) の unit test (jsdom) を sequence-overlay.test.js に追加。

## エラー処理

| 状況 | 対応 |
|---|---|
| drag 中にブラウザウィンドウ外へ出る | mouseup または mouseleave でキャンセル |
| hover layer と overlay rect の event 競合 | pointer-events 調整。hover layer は `pointer-events: none` で rect を透過、container 側で mousemove 捕捉 |
| 色変更後の hex 書式バリデーション | 6桁 + `#` prefix の regex で確認、不正時は例外 throw せず no-op |
| Tab キーが modal の focus trap と競合 | modal フォーカスターゲット管理を分ける (rich editor 内では 2空白、panel 内 button 間移動は通常の Tab) |
| drag 中に SVG 再描画 (別編集) | 確定前に scheduleRefresh() を抑制、drop 後に再有効化 |

## ロードマップ

### Phase 1: 選択ハイライト + キーボード + Undo audit (Sprint 8)
- C14 + C18 + C20
- 実装単純、先に入れて UX 改善を即感じられる

### Phase 2: Hover 挿入 + pulldown 新規追加 (Sprint 9)
- C15 + C16 + C17
- Hover layer 新規実装 + 既存 pulldown 拡張

### Phase 3: Drag + Color (Sprint 10)
- C19
- 最複雑な drag 実装と DSL hex 解析

### Phase 4: UC E2E 検証 (Sprint 11)
- UC-11 〜 UC-16 の全 PASS

## スコープ外

- 複数 participant 同時選択 → 一括色変更 (YAGNI)
- カスタム色 (HEX 直接入力) — 8 swatch で 80% カバー
- メッセージ arrow のドラッグ移動 (matrix transform 必要、実装複雑)
- Note の hover 挿入 (Phase 2 は message のみ)
- アニメーション付き drop indicator (視覚的マーカーのみで十分)

## 完了基準

- 全 UC-11 〜 UC-16 が UI のみで完遂可 (E2E PASS)
- 視覚検証: selection highlight / hover ガイド / drag preview / color palette が手動でも確認可
- 既存 94 unit + 16 E2E の regression なし
- Ctrl+Z で全 props 変更が戻る
