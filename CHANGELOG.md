# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2026-04-30

### Added (v1.2.0 follow-up)

- **保存方式の選択** — 設定 modal に「保存方式」 (localStorage / ファイル) と「保存先ディレクトリ」を追加。 ファイル選択時は server が `<dir>/<type>.puml` + `<dir>/_meta.json` をディスクに永続化。 localStorage は同期 working copy として併用、 起動時に disk → localStorage を hydrate するため `restoreFor` は同期のまま。
- **種類切替時の force-save** — diagram-type 切替時、 従来の `flush()` (pending のみ書く) に加えて `scheduleSave(currentDiagramType, mmdText) + flush()` で OUTGOING type の現在内容を強制保存。 1秒以上経過した後の切替でもユーザの編集内容が確実に書き込まれる。

### Server endpoints (`server.py`)

- `POST /autosave` — body `{type, dsl, dir}` → `<dir>/<type>.puml` + meta JSON。
- `GET /autosave?type=X&dir=Y` — type 単体の DSL 取得 / `?dir=Y` のみで `{files, meta, dir}` リスト。
- `DELETE /autosave?dir=Y` — `<dir>/*.puml` + `_meta.json` を削除。
- 入力検証: `type` は `^[A-Za-z0-9_-]+$` 必須 (path traversal 拒否)。 `dir` は expanduser + resolve で絶対化。
- `IDLE_SHUTDOWN_SEC` を 20s → 300s に緩和 (E2E 実行と長時間 dev session への耐性)。

### Tests

- 単体テスト 3 件追加 (`tests/auto-save.test.js` の `autoSave file backend` describe): file backend が `/autosave` POST を実行 / localStorage backend では fetch を呼ばない / clearAll が DELETE を発行
- E2E 既存 5 件は localStorage backend デフォルト前提で全 pass を維持
- Visual verification (`.investigation/cfg-modal-with-backend.png`): 設定 modal の新 backend セクションと file backend での「最終保存」表示

## [1.2.0] - 2026-04-30

### Added — Auto-save (DSL persistence)

- **DSL の自動保存** — 編集中の DSL を `localStorage` に diagram-type 別 (6 type) で永続化。 ブラウザ/タブのクラッシュや誤 close でも未保存内容が消えない。 トリガは `editor input` の debounce (デフォルト 1秒) + `visibilitychange (hidden)` + `beforeunload` のベストエフォート flush。
- **設定 modal** — toolbar `⚙` ボタン → `#cfg-modal`。 自動保存 ON/OFF、 保存間隔 (500ms / 1秒 / 2秒 / 5秒)、 起動時の復元動作 (auto / confirm / none、 デフォルト confirm)、 「最終保存: yyyy-mm-dd hh:mm:ss (type)」表示、 「保存データを全削除」ボタン。
- **起動時復元** — 起動時に保存 DSL があれば、 設定の `restoreMode` に従って復元: `auto` は無言で適用、 `confirm` は `window.confirm()` ダイアログで確認、 `none` は適用しない。 保存 DSL がデフォルトテンプレと同一の場合は復元プロンプトをスキップ。
- **last-active diagram-type の永続化** — `localStorage['plantuml-diagram-type']` に最後に編集した type を保存。 reload 時はその type で起動 (& boot restore はその type の保存 DSL を見る)。 これによりクラッシュ → reload で「sequence で起動 → state DSL は隠れている」状況が起きず、 ユーザの作業環境がそのまま戻る。
- **diagram-type 切替時** — 切替前に flush、 切替後は新 type の保存 DSL があればそれをロード (確認ダイアログなし、 切替自体が明示操作のため)。
- **ステータスバー indicator** — 画面下部に `💾 N秒前` 形式の最終保存時刻 (`たった今` / `N秒前` / `N分前` / `N時間前`)。 5 秒ごとに相対時刻を更新、 hover で ISO 時刻 + diagram-type を表示。

### New module

- `src/core/auto-save.js` — `window.MA.autoSave` API: `init / scheduleSave / flush / restoreFor / hasSavedFor / getMeta / clearAll / getConfig / setConfig / isAvailable / onSave`。
- localStorage layout: `plantuml-autosave-config` / `plantuml-autosave-meta` / `plantuml-autosave-dsl-<type>` / `plantuml-diagram-type`。
- 失敗時挙動: localStorage quota / private mode / 破損 JSON はすべて try/catch で吸収し in-memory DSL を維持 (decentralized resilience)。 `clearAll` は dsl/meta だけ消し、 ユーザ設定 (`-config`) は残す。

### Tests

- 単体テスト 18 件追加 (`tests/auto-save.test.js`): API skeleton (2) / config defaults・persist・round-trip・corrupt-fallback・per-field validation (6) / scheduleSave + flush + restoreFor + hasSavedFor + meta + per-type isolation + clearAll + disabled + quota + onSave (10)。
- E2E 回帰 5 件追加 (`tests/e2e/auto-save.spec.js`): UC-as-1 (cross-type round-trip: state を編集 → reload → confirm OK → state 復元) / UC-as-2 (per-type 分離) / UC-as-3 (restoreMode=none) / UC-as-4 (clear-all) / UC-as-5 (status indicator)。
- Visual verification (`.investigation/`): 設定 modal / 復元後の editor 状態 / `💾` indicator のスクリーンショット。

## [1.1.2] - 2026-04-30

### Fixed

- **Bug: 日本語 (非 ASCII) で命名した State を追加すると選択できない** — parser の `STATE_RE` が共通定数 `RP.IDENTIFIER = [A-Za-z_][A-Za-z0-9_]*` を使っており非 ASCII 識別子をマッチしない。さらに PlantUML 自身も非 ASCII id を `data-qualified-name` から脱落させる (`..A` 等) ため、 v1.1.1 で入れた renderGen race fix では塞げなかった。 Fix: `state.js` に `normalizeIdInput()` を追加し、 ユーザ入力 ID が ASCII identifier に一致しない場合は `S1`, `S2`, ... の ASCII alias を生成、 元の文字列を label として `state "状態X" as S1` 形式で書き出す。 これにより parser / PlantUML / overlay-builder 全レイヤで同一の ASCII id で整合する。 適用箇所: tail-add (state / composite) / insert-form (modal & prompt fallback) / state rename。 `addCompositeState(id, label?)` と `addStateAtLine(..., label?)` に optional label 引数を追加 (既存 ASCII-only 呼び出しは後方互換)。
- **Bug: 同じ非 ASCII id 不具合が Class / Component / Sequence / UseCase でも発生** — 監査の結果、 state.js と同じ脆弱性パターンが他 4 モジュールにも存在することを確認。 各モジュールの parser regex (CLASS_KW_RE / COMPONENT_KW_RE / MSG_RE / ACTOR_KW_RE / USECASE_KW_RE) が ASCII identifier を要求するため、 tail-add UI から日本語 alias を入力すると parser に拾われず overlay rect が作られない (sequence では参加者宣言は parse できるが MSG_RE が参照を弾く)。 Fix: 共有モジュール `src/core/id-normalizer.js` を新設し `window.MA.idNormalizer.normalize(rawInput, existingIds, prefix)` として共通化。 各モジュールから module-specific prefix (`S` / `C` / `P` / `A` / `U`) でラップして呼ぶ。 適用箇所: state / class / component / sequence / usecase の tail-add (各 entity 種別) と rename ハンドラ。 副次的修正として class.js の `fmtClass` / `fmtInterface` / `fmtAbstract` から `&& !generics` 制約を外し、 `class "Label" as Id<T>` 形式の emit を許可 (PlantUML の CLASS_KW_RE は元から quoted-label-with-generics を受理)。

### Tests

- 単体テスト 13 件追加: `tests/state-updater.test.js` (5 件: `normalizeIdInput` ASCII pass-through / Japanese → S1 alias / 既存 S1/S2 衝突回避 / empty 入力の `valid:false` / `state "状態A" as S1` の parser round-trip), `tests/class-updater.test.js` (4 件: 正規化 + `fmtClass` quoted-label-with-generics), `tests/component-overlay.test.js` (3 件: 正規化), `tests/sequence-updater.test.js` (3 件: 正規化), `tests/usecase-updater.test.js` (3 件: 正規化, prefix=A actor / prefix=U usecase)
- E2E 回帰 5 件追加: `UC-bug2-jp v1.1.2` (state) / `UC-bug-jp v1.1.2` (class / component / sequence / usecase) — それぞれ tail-add で日本語 alias を入力し、 editor に `<keyword> "<日本語>" as <ASCII alias>` が emit、 overlay rect[data-id=<ASCII alias>] が生成、 click で selection panel が正しい id+label を表示

## [1.1.1] - 2026-04-29

### Fixed

- **Bug 1: State→Sequence 切替時にプレビューが State のままになる** — `diagram-type` change handler が `clearSelection()` を呼ぶと、selection callback が stale な State-shape の `currentParsed` で `sequence.renderProps` を呼び `parsedData.elements.filter(...)` で `TypeError` を投げていた。 例外が handler を抜けるため次の `scheduleRefresh()` が走らず、プレビューが旧 State SVG のまま固まる。 Fix: change handler 内で新モジュールにより `currentParsed` を同期再パースしてから `clearSelection()` を呼ぶ。 加えて `sequence.renderProps` を `parsedData.elements/relations/groups` 欠落に対し defense-in-depth で防御化。
- **Bug 2: 新規追加した State を選択できない** — `renderSvg()` の `fetch('/render')` 応答が in-flight 中に新たな edit が走った場合、 古い応答が新しい応答の後に到着して新しい SVG を上書きする race condition があり、 新規追加 state の `g.entity` が消えるため `buildOverlay` が overlay rect を生成できずクリックしても選択できなかった。 Fix: `renderGen` 単調増加カウンタを導入し、 `renderSvg()` 内で自分の世代が最新でなければ応答を破棄。

### Tests

- E2E 回帰 3 件追加 (`tests/e2e/state.spec.js`):
  - `UC-bug1 v1.1.1` — State→Sequence 切替で `participant` が editor に入り、 SVG が Sequence 図 (Sample Sequence / User / System) で描画される
  - `UC-bug2 v1.1.1` — tail-add で新規 state を追加 → overlay rect が生成され、 click で selection に入り `#st-id` が新ID
  - `UC-bug2-race v1.1.1` — fetch interceptor で最初の `/render` 応答を 800ms 遅延させ、 古い応答が後続 edit の SVG を上書きしないこと (Alpha + Beta の両 overlay rect が残る) を確認

## [1.1.0] - 2026-04-29

### Added — State Tier2 Polish

- **Behaviors セクション** — state edit form に entry (input) / do (textarea, multi-line) / exit (input) フィールド (StableState 流 UI)。 PlantUML description line `STATE : entry / xxx` 形式で emit、 do の改行は `\n` escape で 1 行結合
- **Composite state nesting ops 全 4 種**:
  - `+ Convert to composite` — 単純 state を空 composite に変換
  - `✕ Dissolve composite` — composite を解体し子要素を top-level に持ち上げ
  - `Move into:` dropdown + `Move` — top-level state を別 composite の子へ移動 (自身/descendants は候補から除外で循環参照防止)
  - `↑ Move out of` — composite 内 state を top-level に取り出し
- **+ Outgoing transition modal** — selected state から新規 outgoing transition を target dropdown ([*] pseudo-state 含む) + trigger/guard/action 入力で追加
- 新規 public API 7 個: `setStateBehavior` / `convertToComposite` / `dissolveComposite` / `moveStateIntoComposite` / `moveStateOutOfComposite` (+ 内部ヘルパ `_findStateDeclLine` / `_findMatchingBrace` / `_showAddTransitionModal`)

### Changed

- parser に `entry` / `do` / `exit` / `descriptions` フィールドを state node に追加。 description line を prefix で振り分け (`\\n` literal escape で multi-occurrence join)
- `_renderStateEdit` 拡張: Behaviors / composite ops / + Outgoing transition の各セクション
- state rename 時の orphan 防止: 旧 bareId の description lines を削除してから新 bareId で書き直し

### Removed (Behavior change)

- **`capabilities.hoverInsert` / `showInsertForm` を `false` 化** — State 図は graph-like layout で hover 位置から挿入先を予測できないため除去
- 旧 v1.0.0 の UC-6 / UC-7 E2E テスト (hover insert / empty click insert modal) を削除 (capability 廃止に伴い obsolete)

### Notes

- 設計詳細: `docs/superpowers/specs/2026-04-29-state-v1.1.0-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-29-state-v1.1.0.md`
- ユーザ指摘 「State は縦方向に図形が生成されることが保証されないから、 ここに挿入で追加するのは不適切」 + 「entry/exit/during 処理をプロパティから記載できるように」 を解消
- transition source/target 変更 (vi) は v1.0.0 で実装済を確認、 E2E verification を追加 (UC-4 v1.0.0)
- entry/exit/do フィールドの UI は StableState (`04_StableState/stablestate.html:3683-3697`) を参考
- v1.1.x+ 繰越: graph-aware 代替挿入 UX、 2 段以上 composite ネスト、 concurrent region、 internal transition、 transition reorder、 buildOverlay の Activity composite 内 rect 制限、 description line 移動時の orphan 防止 (state を composite 間で move した時の `S : entry / x` 等の追従)

## [1.0.3] - 2026-04-29

### Fixed — Note attachment

- **`addNoteAtLine` の attachment bug 修正** — position='before' で note を target line の前に挿入していたため、 PlantUML の「note は直前 statement に attach」仕様により **意図した action ではなく前の action** に note が付いていた。 targetIdx を常に lineNum に固定し、 必ず target line の AFTER に挿入するよう変更
- API signature `(text, lineNum, position, fields)` は v1.0.1 互換のため維持、 position 引数は内部で無視
- Unit テスト: +1 (position='before' 渡しでも正しい attachment になる回帰テスト)

### Notes

- 設計詳細: `docs/superpowers/specs/2026-04-29-activity-v1.0.3-design.md`
- ユーザ指摘 「複雑なアクティビティ図を書いたときに Note を挿入すると選択したものとは違う Action に Note が付きます」 を解消
- v1.0.4+ 繰越: property panel `+ Note` ボタンの indent 継承、 `note right of ALIAS` 構文移行、 buildOverlay の composite 内 action overlay rect emit、 State 図の同種 polish

## [1.0.2] - 2026-04-29

### Fixed — Branch-aware insertion

- **mid-insert で X 座標を考慮** — `resolveInsertLine(overlayEl, x, y)` をユークリッド距離での最近接 rect 選択に変更。 if/fork の水平分岐 composite で「else 列クリック → then 末尾に挿入される」 critical UX bug を解消
- **Hover ガイドのカラム幅制限** — 解決された rect の X 範囲 ± 10px padding にガイド線を制限。 「どっちの branch に入るか」が視覚的に明示される
- Sequence / State の `resolveInsertLine` も signature を `(overlayEl, x, y)` に揃え (X は無視)、 caller (`src/app.js`) を統一インターフェース化
- Unit テスト: +4 (branch disambiguation 3 + rectX/rectWidth 1)、E2E テスト: +2 (UC-1 v1.0.2 guide span / branch-aware click)

### Notes

- 設計詳細: `docs/superpowers/specs/2026-04-29-activity-v1.0.2-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-29-activity-v1.0.2.md`
- ユーザ指摘 「ここに挿入が行レベルで管理されるので分岐があるとどちらの分岐に挿入されるかわかりません」 を解消
- v1.0.3+ 繰越: buildOverlay の composite 内 action overlay rect emit (v1.0.1 UC-2 + v1.0.2 UC-1 の skip 原因)、 State 図の同種 polish

## [1.0.1] - 2026-04-29

### Added — Activity Mid-flow Editing Polish

- **mid-insert 全 7 kind** — `showInsertForm` 再構成、modal に kind selector + 条件フィールド (action/if/while/repeat/fork/swimlane/note)
- **composite 内挿入** — if/while/fork の body 内にもホバー位置に応じて挿入、indent 自動継承で入れ子整合
- **既存 if に branch 後付け** — `+ elseif 追加` `+ else 追加` ボタン (property panel)、既存 else があれば disabled
- **既存 fork に分岐後付け** — `+ fork again 追加` ボタン
- **branch 個別削除** — elseif / else / fork again 各行に `✕` ボタン、構造本体は保持
- 新規 public API 7 個: `addControlAtLine` / `addSwimlaneAtLine` / `addNoteAtLine` / `addElseifBranch` / `addElseBranch` / `addForkBranch` / `deleteBranchAt`
- 内部ヘルパ: `_resolveInsertIndent` / `_findMatchingEndif` / `_findElseLine` / `_findMatchingEndFork`
- Unit テスト: +18 (557 total)、E2E テスト: +6 (UC-1/UC-2/UC-3/UC-5/UC-6/UC-8/UC-9)

### Notes

- 設計詳細: `docs/superpowers/specs/2026-04-28-activity-v1.0.1-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-28-activity-v1.0.1.md`
- ユーザ指摘 「アクションの挿入がアクションのみなので途中で If 文や Loop を表現したい場合、後段のすべての内容を削除しないと追加できない。これはツールとして破綻している」 を解消
- v1.0.2+ 繰越: State 図の同種 polish (mid-insert state/transition/note + composite-state 内挿入)、 既存ノードを if/while で囲む UX、 branch 順序入れ替え、 buildOverlay の composite 内 action overlay rect 対応 (UC-2 E2E が現状 skip する根本原因)

## [1.0.0] - 2026-04-28

### Added — Tier1 完成

- **State Diagram** — Tier1 ロードマップ最後 (#6) — `src/modules/state.js`
- 6 element kinds: state / composite-state (1-level nesting) / initial pseudo `[*]` / final pseudo `[*]` / choice / history (deep history 含む)
- Transitions: `A --> B` + label `: trigger [guard] / action`
- Notes: `note (left|right) of NAME` 1 行 + 複数行
- ADR-110: State canonical DSL form
- Property panel: state edit / transition edit / note edit / no-selection (tail-add 4 kinds)
- Overlay-driven (Class パターン流用、`<g class="entity" data-qualified-name>`)
- **hoverInsert + showInsertForm** 最初から組み込み (state / transition モーダル挿入)
- E2E: state.spec.js (8 tests, α + γ axes)

### Notes

**Tier1 ロードマップ完成** — Sequence + UseCase + Component + Class + Activity + State の全 6 図形が overlay-driven で完備。
- 設計詳細: `docs/superpowers/specs/2026-04-28-state-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-28-state-v1.0.0.md`
- v1.x+ 繰越: 2 段以上の composite ネスト、concurrent region、entry/exit actions、internal transition

## [0.7.1] - 2026-04-27

### Added
- **Activity 途中挿入** — Sequence の hover-insert ガイドと同じ UX を Activity でも有効化:
  - preview hover で「+ ここに挿入」ガイド表示
  - 空白部分 click で modal 表示 (action text textarea)
  - 確定で `:text;` を該当行の前/後に挿入 (indent 自動継承)
- `addActionAtLine(text, lineNum, position, actionText)` — indent-preserving insertion API
- `resolveInsertLine(overlayEl, y)` — Y 座標 → 最近接 node line/position
- `showInsertForm(ctx, line, position, kind)` + HTML modal (`act-modal`)
- `defaultInsertKind: 'action'` (sequence の 'message' に対する Activity の既定 kind)
- E2E: hover guide 表示 + 空白 click → form → 挿入 (2 tests)

### Changed
- `src/app.js` insert click handler: hardcoded `window.MA.sequenceOverlay.resolveInsertLine`
  を `currentModule.resolveInsertLine` 経由に refactor (sequence は fallback path で互換維持)
- Activity capabilities: `hoverInsert: true`, `showInsertForm: true`

### Notes
- v0.7.0 で繰越となっていた iterative-workflow editing (途中挿入) を埋めるための polish スプリント
- 設計詳細: 軽量 polish、別 spec 不要 (v0.7.0 spec § 9 で「v0.7.1+ 繰越」記載分の対応)

## [0.7.0] - 2026-04-27

### Added
- **Activity Diagram** — Tier1 ロードマップの 5 番目の図形 (`src/modules/activity.js`)
- 6 node kinds: start / stop / end / action / decision (if/while/repeat) / fork
- 制御構造 4 種: if/elseif/else/endif、while/endwhile、repeat/repeat while、fork/fork again/end fork
- Swimlane (`|name|`、color 部分は v0.7.0 で捨てる)
- Note (`note right` / `note left`、1行 + 複数行、action attachment)
- Legacy parse-only (`(*) -->` syntax → 新記法 normalize)
- ADR-109: Activity canonical DSL form (新記法 primary)
- Property panel: 4 layouts (action / control / swimlane / note) + tail-add 9 kinds
- Overlay-driven (shape signature classification: rect/polygon/ellipse)
- E2E: activity.spec.js (9 tests)

### Changed
- `src/core/parser-utils.js` `detectDiagramType` に Activity 判定追加 (priority: Activity > Class > Component)

### Notes
- 設計詳細: `docs/superpowers/specs/2026-04-27-activity-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-27-activity-v0.7.0.md`
- v0.7.1 へ繰越: detach/kill, rake, connector, partition reuse, swimlane color, drag-to-reorder

## [0.6.1] - 2026-04-27

### Added
- **Member 個別 SVG クリック選択** — class / interface / abstract / enum の attribute / method / enum-value 行を SVG で直接 click → property panel が自動 expand inline edit + auto-scroll
- **Note on class** — 1行 + 複数行 directional note (`note (left|right|top|bottom) of NAME`) の parse / formatter / add / update / delete + class 削除時の cascade
- `core/overlay-builder.js` `extractMultiLineTextBBoxes(g, opts)` API 追加 (Activity v0.7.0 と共有予定)
- ADR-108: Note canonical DSL form
- E2E: `class-v0.6.1.spec.js` (6 tests, member click + note)

### Changed
- `src/core/selection-router.js` shift+click 時に `member` type の selection を `parentClass` に coerce + dedup (multi-select connect 互換性のため)
- `src/modules/class.js` `_renderElementEdit` に opts.focusMemberIndex 受付追加 (member 選択時の auto-expand 用)

### Notes
- v0.7.0 へ繰越: 内部クラス、floating note (`note "..." as N`) + link、note on relation、member の drag-to-reorder
- 設計詳細: `docs/superpowers/specs/2026-04-27-class-v0.6.1-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-27-class-v0.6.1.md`

## [0.6.0] - 2026-04-26

### Added
- **Class Diagram** support — Tier1 ロードマップの 4 番目の図形 (`src/modules/class.js`)
- 4 element kinds: class / interface / abstract class / enum
- 6 relation kinds: association / inheritance / implementation / composition / aggregation / dependency
- Members: attribute / method with visibility (+/-/#/~), static, abstract
- Extensions: stereotype `<<X>>`, generics `Foo<T>` (incl nested `Map<K, V>`)
- Nesting: package + namespace
- ADR-107: Class canonical DSL form (keyword-first)
- Multi-select connect (Component / UseCase と同じ Shift+click 流儀、6 kinds + auto-swap for implementation)
- E2E coverage: class-overlay (11 tests, α + γ axes)
- Total tests: 374 unit + 91 E2E (前 308+80 から +66 unit + +11 E2E)

### Changed
- `src/core/parser-utils.js` `detectDiagramType` に Class 判定追加 (priority: hasComponentKw > Class判定)

### Notes
- v0.6.1 へ繰越: SVG 上の member 個別クリック選択 (`extractMultiLineTextBBoxes` API は Activity v0.7.0 と統合設計)、内部クラス、note on class
- 設計詳細: `docs/superpowers/specs/2026-04-26-class-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-26-class-v0.6.0.md`

## [0.5.0] - 2026-04-26

### Added
- **Overlay-driven editing** for UseCase + Component (`src/modules/{usecase,component}.js` の `buildOverlay` 実装)
- `src/core/overlay-builder.js` 抽出 — 図形非依存な SVG/DOM プリミティブ (addRect / extractBBox / extractEdgeBBox / pickBestOffset / hitTestTopmost / dedupById / matchByDataSourceLine / matchByOrder / syncDimensions / warnIfMismatch)
- `src/core/selection-router.js` 抽出 — overlay click / shift+click / multi-toggle / 空白解除 / highlight 適用
- **Module capability contract** — 各 DiagramModule v2 が `overlaySelection` / `hoverInsert` / `participantDrag` / `showInsertForm` / `multiSelectConnect` を明示宣言
- **Multi-select connect** — UseCase + Component で 2 figure を Shift+クリック → Connect form で関係作成 (kind selector + swap + label + button)
- **Relation click selection** — UseCase + Component の relation (edge) を SVG クリックで選択 → kind 切替 / from/to swap / label 編集 / delete
- E2E coverage: `usecase-overlay.spec.js` (5 tests) + `component-overlay.spec.js` (5 tests)
- Total tests: 303 unit + 80 E2E (前 267 unit + 70 E2E から +36 unit + 10 E2E)

### Changed
- `src/app.js` のハードコード `currentModule === modules['plantuml-sequence']` 比較を `moduleHas('cap')` 経由に全廃 (5 箇所)
- `src/ui/sequence-overlay.js` を core/overlay-builder + core/selection-router へ delegate (sequence 固有のレイアウト知識のみ残存)
- CSS class `.seq-overlay-target` → `.selectable` に統一
- `usecase.buildOverlay` / `component.buildOverlay` は実機 PlantUML SVG (`<g class="entity" data-qualified-name="X">`) に整合

### Fixed
- 4 sequence-side E2E (UC-1/UC-6/UC-7/UC-8) が偶発的に解消 — Phase A の overlay click 統合化が原因と推測

### Notes
- v0.6.0 へ繰越: drag-to-connect / package 範囲 wrap / 要素を別 package へ drag / Sequence の multi-select connect / Class diagram (Tier1 残り)
- 設計詳細: `docs/superpowers/specs/2026-04-26-tier1-overlay-driven-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-26-tier1-overlay-driven-v0.5.0.md`

## [0.4.0] - 2026-04-25

### Added
- Component Diagram form-based MVP (`src/modules/component.js`)
- DSL elements: component / interface / port / package + 4 relation kinds (association / dependency / provides / requires lollipop)
- ADR-106: Component canonical DSL form (keyword-first)
- S1.5 共通基盤抽出: `src/core/dsl-updater.js`, `src/core/props-renderer.js`
- E2E coverage: 6 UC × α/γ 2 axes (12-cell pass matrix), ~25 Playwright tests

### Changed
- `src/modules/sequence.js`, `src/modules/usecase.js` delegate insertBeforeEnd / moveLine* / renameWithRefs to `core/dsl-updater`
- `src/modules/usecase.js` `renderProps` refactored to use `core/props-renderer.renderByDispatch` dispatcher
- `src/core/parser-utils.js` `detectDiagramType` now distinguishes Component from Class (priority Component > Class because Component diagrams legally contain `interface`)

### Fixed
- `src/app.js` diagram-type change handler now updates `currentModule` so subsequent edits use the chosen module's parser/updater (was: ran through previous module)

### Notes
- v0.5.0 へ繰越: overlay-builder / selection-router 抽出, overlay-driven SVG selection, drag-to-connect, package range wrap

## [0.3.0] - 2026-04-25

### Added
- UseCase Diagram form-based MVP (`src/modules/usecase.js`)
- Parser: actor / usecase / package + 4 relation kinds (association / generalization / include / extend)
- Updater: add / update / delete / move / setTitle / renameWithRefs operations
- Property panel: Title 設定 + 末尾追加 (kind selector) + selection 編集
- E2E coverage: 6 UC × α/γ 2 axes (12-cell pass matrix), 25 Playwright tests
- ADR-105: UseCase canonical DSL form (keyword-first)
- Sprint 0 軽量共通抽出: `src/core/dsl-utils.js`, `src/core/regex-parts.js`, `src/core/line-resolver.js`, `src/core/formatter-interface.js`

### Changed
- `src/core/parser-utils.js` `detectDiagramType` enhanced for usecase detection (priority-based keyword presence check)
- `src/modules/sequence.js` and `src/ui/sequence-overlay.js` delegate shared helpers to Sprint 0 core modules (no behavior change)

### Notes
- v0.5.0 へ繰越: overlay-driven SVG selection / drag-to-connect / package range wrap
