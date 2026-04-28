# Changelog

All notable changes to this project will be documented in this file.

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
