# DSL Auto-Save + Settings Modal Design (v1.2.0)

**Date:** 2026-04-30
**Status:** Approved (brainstorm), pending plan
**Owner:** Kawano Momo / Claude Opus 4.7

## Problem

PlantUMLAssist の DSL は `#editor` (textarea) の in-memory 値だけで管理されている。 ブラウザ/タブのクラッシュ、誤 close、リフレッシュなどで未保存の DSL が消失する。 ユーザは Open/Save (ファイル DL) で明示保存しない限り作業を失うリスクを常に持つ。 v1.1.x 系列で UX が成熟してきた今、 自動保存はベースライン機能として欠落していると判断。

## Goals

- 編集中の DSL を localStorage に自動保存し、 ブラウザ再起動後に復元できる
- 自動保存は ON/OFF・保存間隔・復元動作をユーザが設定できる
- 既存の Open/Save (ファイル DL) フローと共存（自動保存はあくまで保険であり、 明示保存を置き換えない）

## Non-goals

- サーバ側永続化 (localStorage で十分)
- マルチデバイス同期
- 履歴 (Undo/Redo は別レイヤ既存)
- IndexedDB (DSL は数 KB レベルで localStorage 5–10 MB の枠で十分)

## Architecture

### Storage layout

- `plantuml-autosave-config` — 設定 JSON (enabled, debounceMs, restoreMode)
- `plantuml-autosave-dsl-<diagram-type>` — diagram-type 別の DSL 文字列 (6 type)
- `plantuml-autosave-meta` — `{ lastSavedAt: ISO string, lastSavedType: string }`

> Why per diagram-type: diagram-type を切り替えると `setMmdText(template())` で DSL が置き換わる現状動作のため、 切替時に直前の DSL を失わないには type 別保存が必要。 ユーザは複数 type を平行編集する想定。

### New module: `src/core/auto-save.js`

```js
window.MA.autoSave = {
  init(),                              // boot: read config, attach unload handler
  scheduleSave(diagramType, dsl),      // debounced (config.debounceMs)
  flush(),                             // immediate write of pending save
  restoreFor(diagramType),             // returns saved DSL or null
  hasSavedFor(diagramType),            // boolean (for confirm dialog gate)
  getMeta(),                           // { lastSavedAt, lastSavedType }
  clearAll(),                          // remove all autosave keys
  getConfig() / setConfig(partial),    // merge + persist + apply (debounce changes)
  isAvailable(),                       // localStorage probe (private mode false-positive guard)
};
```

### Config defaults

```js
{
  enabled: true,
  debounceMs: 1000,                    // 500 / 1000 / 2000 / 5000
  restoreMode: 'confirm',              // 'auto' | 'confirm' | 'none'
}
```

### Save trigger

- `editorEl input` (debounced) — 既存 `scheduleRefresh` と同レーンで `autoSave.scheduleSave(currentDiagramType, mmdText)`
- `document.visibilitychange` で `document.hidden === true` のとき `autoSave.flush()` (タブ切替/最小化)
- `window.beforeunload` で `autoSave.flush()` (タブ閉じ/リロード)

> debounce window 内のクラッシュは最大 `debounceMs` ミリ秒のロスを許容。 default 1s なら実用上問題なし。

### Boot-time restore

`app.js` 初期化シーケンスの末尾、 デフォルトテンプレ load の直後に挟む:

```
1. 既存: diagramType を localStorage 'plantuml-diagram-type' or default から決定
2. 既存: setMmdText(currentModule.template())
3. 新規: var saved = autoSave.restoreFor(currentDiagramType);
4. 新規: if (saved && saved !== currentModule.template()) {
           if (config.restoreMode === 'auto') setMmdText(saved);
           else if (config.restoreMode === 'confirm' && confirm('前回編集中の DSL が見つかりました。 復元しますか？')) setMmdText(saved);
           // 'none' なら何もしない (テンプレのまま)
         }
5. 既存: scheduleRefresh()
```

> 設計判断: ユーザがテンプレを意図的に開いた場合と、 復元すべき編集途中とを区別できないため、 default は `confirm` モード。 (brainstorm で b を選択)

### Diagram-type 切替時

既存 `diagram-type change` handler (app.js:469 付近) で:

```
1. 既存: 現 mmdText を直前 type の何らかとして失わないようにする処理 (現状: setMmdText(newModule.template()) で上書き)
2. 新規: 切替前に autoSave.flush() (前 type の保存を即時確定)
3. 新規: 切替後、 新 type に saved があれば setMmdText(saved)、 なければ template
   (boot と同じ confirm 判断は適用しない — type 切替は明示操作なので auto restore でよい)
```

### Settings UI

- 既存 `#st-modal` パターンを流用した `#cfg-modal` を追加
- topbar の Open/Save の右に `<button id="btn-config" title="設定">⚙</button>`
- modal フィールド:
  - `<input type="checkbox" id="cfg-enabled">` 自動保存を有効にする
  - `<select id="cfg-debounce">`: [500ms / 1秒 / 2秒 / 5秒]
  - radio group `cfg-restore-mode`: [auto / confirm / none] (各日本語ラベル)
  - 表示: 「最終保存: 2026-04-30 10:23:45 (state)」 (現在時刻と最終保存時刻の差分も "30秒前" 形式で表示)
  - `[保存データを全削除]` ボタン (confirm 後に `autoSave.clearAll()`)
  - `[キャンセル]` `[OK]`
- OK 時のみ config persist。 キャンセルは元の値に戻す
- 「保存データを全削除」は modal を閉じずに即時実行 + meta 表示更新

### Status indicator

ステータスバー (画面下部 既存) の右側に小さく `💾 1秒前` 形式で最終保存時刻を表示。 `mouseover` で diagram-type も表示。

### Failure modes

- localStorage `setItem` 例外 (quota exceeded、 disabled): try/catch でつぶし、 ステータスに `⚠ 自動保存に失敗しました` を 5 秒表示。 in-memory DSL は継続。
- localStorage `getItem` が破損 JSON: try/catch、 当該キー削除、 デフォルトに falls back
- 起動時 `isAvailable()` が false: 設定 modal で「localStorage が使えないため自動保存は無効」を表示

## File changes

| File | Change |
|------|--------|
| `src/core/auto-save.js` | 新規 |
| `src/app.js` | boot restore hook / edit save hook / type-switch flush+restore / status indicator update |
| `plantuml-assist.html` | ⚙ボタン追加 / `#cfg-modal` markup 追加 / status indicator span 追加 |
| `tests/auto-save.test.js` | 新規 (config / save / restore / debounce / quota handling) |
| `tests/e2e/auto-save.spec.js` | 新規 (edit → reload → confirm → restored / settings modal interaction) |
| `tests/run-tests.js` | id-normalizer の隣に auto-save 追加 |
| `CHANGELOG.md` | v1.2.0 entry |

## Test plan

### Unit (`tests/auto-save.test.js`)

- `getConfig()` returns defaults when nothing saved
- `setConfig({ debounceMs: 2000 })` persists and merges
- `scheduleSave` debounces and only writes once after the window
- `flush()` writes immediately and resets the pending timer
- `restoreFor('plantuml-state')` returns saved string after `scheduleSave`+`flush`
- `clearAll()` removes all `plantuml-autosave-dsl-*` + `plantuml-autosave-meta` keys。 `plantuml-autosave-config` は残す (ユーザの設定値はクリア対象外)
- localStorage 例外時に throw しない (jsdom mock で setItem を投げさせる)

### E2E (`tests/e2e/auto-save.spec.js`)

- **happy path**: state テンプレを編集 → 1.5 秒待つ → reload → confirm dialog で OK → editor が編集後の値
- **restoreMode='none'**: 設定で none → 編集 → reload → 確認ダイアログ出ず、 デフォルトテンプレ
- **restoreMode='auto'**: 設定で auto → 編集 → reload → ダイアログ無しで自動復元
- **per-type isolation**: state を編集 → class に切替 → class を編集 → state に戻す → 直前 state DSL に戻る
- **clear all**: 編集 → 設定 → 削除 → reload → ダイアログ出ず、 テンプレ
- **disabled**: 設定で OFF → 編集 → reload → 復元されない

### Visual gate (CLAUDE.md 必須)

- 設定 modal 表示の screenshot
- 復元 confirm dialog の screenshot
- ステータスバーの 💾 indicator の screenshot

## Risks / Open Questions

- 既存 localStorage key `plantuml-render-mode` / `plantuml-diagram-type` (もしあれば) は無関係 prefix なので衝突しない (前置詞 `plantuml-autosave-`)
- diagram-type 切替時の per-type save behavior は現実装の type 別 mmdText 保持とのインタラクションを確認する必要あり (現実装は singleton mmdText)。 → 切替時 flush で対応。
- `confirm()` ネイティブダイアログは UX が古いので将来的に modal 化したくなる可能性あり (今回は YAGNI で `confirm()` 採用)。

## Out of scope (future)

- 履歴 (autosave snapshots over time)
- 名前付き保存 (project tabs)
- Cloud sync
- Diff viewer (saved vs current)
