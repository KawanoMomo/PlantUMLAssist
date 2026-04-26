# Changelog

All notable changes to this project will be documented in this file.

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
