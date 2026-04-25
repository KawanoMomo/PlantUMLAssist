# Changelog

All notable changes to this project will be documented in this file.

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
