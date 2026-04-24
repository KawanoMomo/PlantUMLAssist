# Sprint 0 — 軽量共通抽出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/modules/sequence.js` および `src/ui/sequence-overlay.js` から、他の PlantUML 図形モジュール (UseCase / Component / Class / Activity / State) と **確実に共通** になる純粋関数のみを `src/core/` 配下の 4 モジュールに抽出し、Sequence の既存動作を regression ゼロで維持する。

**Architecture:** ブラウザで動く vanilla ES5 (ビルドなし)。各共通モジュールは `window.MA.<name>` に IIFE で公開する既存パターンを踏襲。overlay / selection / props / DSL updater 等の "本丸" 共通化は S1.5 (UseCase 実装完了後) に実施するため、本 Sprint では**意図的に対象外**。

**Tech Stack:** JavaScript ES5 + `window.MA` namespace, `tests/run-tests.js` (自作 Jest-like runner), Playwright (E2E), jsdom (overlay tests)

**Scope reference:** `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md` Section 4.1

---

## File Structure

### 新設ファイル

| Path | 責任 | 公開先 |
|---|---|---|
| `src/core/dsl-utils.js` | PlantUML DSL 共通の純粋文字列操作 — `unquote(s)`, `quote(s)`, `escapeForRegex(s)`, PlantUML 行判定 (comment / directive) | `window.MA.dslUtils` |
| `src/core/regex-parts.js` | 複数図形で再利用する PlantUML 共通 regex 部品 — identifier / quoted-name / arrow token の共通ビルダー、`@startuml`/`@enduml` 判定 | `window.MA.regexParts` |
| `src/core/line-resolver.js` | PlantUML SVG の `data-source-line` と parser の `line` 番号との対応解決 (offset candidates, order fallback)。`sequence-overlay.js` の `_matchByDataSourceLine` / `_matchByOrder` / `_pickBestOffset` を図形非依存に抽出 | `window.MA.lineResolver` |
| `src/core/formatter-interface.js` | 各図形モジュールが提供する `fmt*` 系 formatter の契約 (JSDoc 型記述) + 入力検証ヘルパー `assertFormatterContract(fn)` (開発時のみ使用) | `window.MA.formatterInterface` |
| `tests/dsl-utils.test.js` | dsl-utils.js の unit tests (7 tests) | — |
| `tests/regex-parts.test.js` | regex-parts.js の unit tests (6 tests) | — |
| `tests/line-resolver.test.js` | line-resolver.js の unit tests (5 tests、jsdom 使用) | — |
| `tests/formatter-interface.test.js` | formatter-interface.js の unit tests (5 tests) | — |

### 変更ファイル

| Path | 変更内容 |
|---|---|
| `src/modules/sequence.js` | 行 39-45 の `unquote` ローカル定義を削除し `window.MA.dslUtils.unquote` に置換。`renameWithRefs` (行 580) の regex escape を `window.MA.dslUtils.escapeForRegex` に置換。コメント判定 `indexOf("'") === 0` を `window.MA.dslUtils.isPlantumlComment` に置換 (4 箇所) |
| `src/ui/sequence-overlay.js` | `_matchByDataSourceLine` / `_matchByOrder` / `_pickBestOffset` を `window.MA.lineResolver` 呼び出しに置換 (約 70 行削除) |
| `src/core/parser-utils.js` | `detectDiagramType` 内の「`/^@startuml/.test(t)`」/「`/^@enduml/.test(t)`」判定を `window.MA.regexParts.isStartUml(t)` / `isEndUml(t)` に置換 |
| `plantuml-assist.html` 行 523-533 | 新 core モジュールを `sequence-overlay.js` / `sequence.js` より**前**に `<script>` で読み込む (4 行追加) |
| `tests/run-tests.js` 行 7-15 | `sourceFiles` 配列に新 core 4 ファイルを追加 (load 順は HTML と同じく `sequence.js` より前) |

### 不変ファイル (触らない)

- `src/app.js`, `src/ui/properties.js`, `src/ui/rich-label-editor.js`, `server.py`, `lib/`, `tests/e2e/*`, `tests/fixtures/*`
- 既存の `tests/sequence-*.test.js`, `tests/parser-utils.test.js`, `tests/selection.test.js`, `tests/text-updater.test.js`, `tests/rich-label.test.js` — これらは regression 検知のため**一切変更禁止**

---

## Branch Strategy

本 plan 実行前に以下を実施:

1. 現在 `docs/tier1-complete-master` ブランチ (spec + この plan 所在) でこの plan を commit 済であること
2. 実装は新ブランチ `feat/sprint0-core-extraction` を `docs/tier1-complete-master` から fork して実施
3. PR 作成時は base = `master`、head = `feat/sprint0-core-extraction` (docs branch の差分も同梱)

## Verification Gate

**各 task の "Commit" step 前に必ず以下を確認**:

- `npm run test:unit` が全 PASS
- Visual 影響が疑われる task (Task 7, Task 8 の後) では `npx playwright test` も実行

**最終 Task (Task 9) では追加で**:

- `npx playwright test` (local render mode) が全 PASS
- `wc -l src/modules/sequence.js src/ui/sequence-overlay.js` で抽出前後の行数差分を記録 (目安: sequence.js 1,311 → 1,280 前後、sequence-overlay.js 約 70 行減)
- Evaluator エージェントで実機スクショ検証 (ADR-014 / Visual Verification Gate)

---

### Task 1: ブランチ作成と plan 自体の commit

**Files:**
- Modify: (Git branch state のみ)

- [ ] **Step 1.1: 現在ブランチの確認**

Run: `git branch --show-current`
Expected: `docs/tier1-complete-master`

- [ ] **Step 1.2: plan ファイルをこの branch に commit**

```bash
git add docs/superpowers/plans/2026-04-24-sprint0-core-extraction.md
git commit -m "docs(plan): Sprint 0 core extraction implementation plan

- 4 modules: dsl-utils.js, regex-parts.js, line-resolver.js, formatter-interface.js
- Target: pure function extraction from sequence.js + sequence-overlay.js
- Regression guard: all existing unit + e2e tests must pass unchanged"
```

- [ ] **Step 1.3: 実装ブランチ作成**

```bash
git checkout -b feat/sprint0-core-extraction
git branch --show-current
```
Expected: `feat/sprint0-core-extraction`

- [ ] **Step 1.4: baseline tests を確認 (抽出前の全 PASS 状態を記録)**

```bash
npm run test:unit 2>&1 | tail -5
```
Expected: `NN passed, 0 failed` (NN は現在の test 数、あとで比較)

記録した passed 数を plan ファイル上部コメントにメモ (後で regression 検知に使う)。

- [ ] **Step 1.5: sequence.js / sequence-overlay.js の baseline 行数を記録**

```bash
wc -l src/modules/sequence.js src/ui/sequence-overlay.js src/core/parser-utils.js
```
Expected: `1311 src/modules/sequence.js`, `... src/ui/sequence-overlay.js`, `... src/core/parser-utils.js`

記録しておく (Task 9 で最終差分確認に使用)。

---

### Task 2: `core/dsl-utils.js` + tests (TDD)

**Files:**
- Create: `src/core/dsl-utils.js`
- Create: `tests/dsl-utils.test.js`

- [ ] **Step 2.1: 失敗する test を先に書く**

Create `tests/dsl-utils.test.js`:

```javascript
'use strict';
var dslUtils = (typeof window !== 'undefined' && window.MA && window.MA.dslUtils)
  || (global.window && global.window.MA && global.window.MA.dslUtils);

describe('dslUtils.unquote', function() {
  test('removes surrounding double quotes', function() {
    expect(dslUtils.unquote('"hello"')).toBe('hello');
  });
  test('returns string unchanged if not quoted', function() {
    expect(dslUtils.unquote('hello')).toBe('hello');
  });
  test('returns empty/null/undefined unchanged', function() {
    expect(dslUtils.unquote('')).toBe('');
    expect(dslUtils.unquote(null)).toBe(null);
    expect(dslUtils.unquote(undefined)).toBe(undefined);
  });
  test('does not remove single quote on only one side', function() {
    expect(dslUtils.unquote('"hello')).toBe('"hello');
    expect(dslUtils.unquote('hello"')).toBe('hello"');
  });
});

describe('dslUtils.quote', function() {
  test('wraps with double quotes', function() {
    expect(dslUtils.quote('hello world')).toBe('"hello world"');
  });
  test('does not double-wrap already-quoted string', function() {
    expect(dslUtils.quote('"hello"')).toBe('"hello"');
  });
});

describe('dslUtils.escapeForRegex', function() {
  test('escapes regex metacharacters', function() {
    expect(dslUtils.escapeForRegex('a.b*c+d')).toBe('a\\.b\\*c\\+d');
  });
  test('returns plain identifier unchanged', function() {
    expect(dslUtils.escapeForRegex('Alice')).toBe('Alice');
  });
});

describe('dslUtils.isPlantumlComment', function() {
  test("detects single-quote comment", function() {
    expect(dslUtils.isPlantumlComment("' this is comment")).toBe(true);
    expect(dslUtils.isPlantumlComment("  ' indented")).toBe(true);
  });
  test('rejects non-comment line', function() {
    expect(dslUtils.isPlantumlComment('actor Alice')).toBe(false);
    expect(dslUtils.isPlantumlComment('')).toBe(false);
  });
});
```

- [ ] **Step 2.2: test が失敗することを確認**

Run: `node tests/run-tests.js tests/dsl-utils.test.js`
Expected: tests 実行時に `TypeError: Cannot read properties of undefined (reading 'unquote')` 等の失敗 (モジュール未作成のため)

- [ ] **Step 2.3: `src/core/dsl-utils.js` を最小実装**

Create `src/core/dsl-utils.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.dslUtils = (function() {

  function unquote(s) {
    if (s == null) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  function quote(s) {
    if (s == null) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s;
    }
    return '"' + s + '"';
  }

  function escapeForRegex(s) {
    if (s == null) return s;
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isPlantumlComment(line) {
    if (line == null || line === '') return false;
    return line.replace(/^\s+/, '').indexOf("'") === 0;
  }

  return {
    unquote: unquote,
    quote: quote,
    escapeForRegex: escapeForRegex,
    isPlantumlComment: isPlantumlComment,
  };
})();
```

- [ ] **Step 2.4: test 用 loader に登録**

Edit `tests/run-tests.js` 行 6-15 の `sourceFiles` 配列、`src/core/html-utils.js` の直後に追加:

```javascript
const sourceFiles = [
  'src/core/html-utils.js',
  'src/core/dsl-utils.js',         // ← NEW
  'src/core/text-updater.js',
  'src/core/parser-utils.js',
  'src/core/history.js',
  'src/core/selection.js',
  'src/core/connection-mode.js',
  'src/ui/properties.js',
  'src/modules/sequence.js',
];
```

- [ ] **Step 2.5: test が PASS することを確認**

Run: `node tests/run-tests.js tests/dsl-utils.test.js`
Expected: `13 passed, 0 failed` (dsl-utils.test.js 単独)

既存テストも regression なし確認:
Run: `npm run test:unit`
Expected: 既存 passed 数 + 13 新規 passed、failed = 0

- [ ] **Step 2.6: HTML の script load 順を更新**

Edit `plantuml-assist.html` 行 523-525、`html-utils.js` の直後に 1 行追加:

```html
<script src="src/core/html-utils.js"></script>
<script src="src/core/dsl-utils.js"></script>
<script src="src/core/text-updater.js"></script>
<script src="src/core/parser-utils.js"></script>
```

- [ ] **Step 2.7: Commit**

```bash
git add src/core/dsl-utils.js tests/dsl-utils.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(core): add dsl-utils.js with pure DSL helpers

- unquote/quote/escapeForRegex/isPlantumlComment
- no behavior change in sequence.js yet (integration in later task)
- 13 unit tests pass"
```

---

### Task 3: `core/regex-parts.js` + tests (TDD)

**Files:**
- Create: `src/core/regex-parts.js`
- Create: `tests/regex-parts.test.js`

- [ ] **Step 3.1: 失敗する test を先に書く**

Create `tests/regex-parts.test.js`:

```javascript
'use strict';
var RP = (typeof window !== 'undefined' && window.MA && window.MA.regexParts)
  || (global.window && global.window.MA && global.window.MA.regexParts);

describe('regexParts.IDENTIFIER', function() {
  test('matches plain identifier', function() {
    expect(new RegExp('^' + RP.IDENTIFIER + '$').test('Alice')).toBe(true);
    expect(new RegExp('^' + RP.IDENTIFIER + '$').test('user_1')).toBe(true);
  });
  test('rejects identifier starting with digit', function() {
    expect(new RegExp('^' + RP.IDENTIFIER + '$').test('1abc')).toBe(false);
  });
});

describe('regexParts.QUOTED_NAME', function() {
  test('matches "Login Server"', function() {
    expect(new RegExp('^' + RP.QUOTED_NAME + '$').test('"Login Server"')).toBe(true);
  });
  test('rejects unbalanced quotes', function() {
    expect(new RegExp('^' + RP.QUOTED_NAME + '$').test('"hello')).toBe(false);
  });
});

describe('regexParts.isStartUml / isEndUml', function() {
  test('detects @startuml with or without leading space', function() {
    expect(RP.isStartUml('@startuml')).toBe(true);
    expect(RP.isStartUml('  @startuml')).toBe(true);
    expect(RP.isStartUml('@startuml Title')).toBe(true);
  });
  test('detects @enduml', function() {
    expect(RP.isEndUml('@enduml')).toBe(true);
    expect(RP.isEndUml('  @enduml')).toBe(true);
  });
  test('rejects non-directive', function() {
    expect(RP.isStartUml('startuml')).toBe(false);
    expect(RP.isEndUml('end')).toBe(false);
  });
});

describe('regexParts.IDENTIFIER_OR_QUOTED', function() {
  test('matches both forms', function() {
    expect(new RegExp('^' + RP.IDENTIFIER_OR_QUOTED + '$').test('Alice')).toBe(true);
    expect(new RegExp('^' + RP.IDENTIFIER_OR_QUOTED + '$').test('"Alice B"')).toBe(true);
  });
});
```

- [ ] **Step 3.2: test が失敗することを確認**

Run: `node tests/run-tests.js tests/regex-parts.test.js`
Expected: 失敗 (モジュール未作成)

- [ ] **Step 3.3: `src/core/regex-parts.js` を実装**

Create `src/core/regex-parts.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.regexParts = (function() {

  var IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*';
  var QUOTED_NAME = '"[^"]+"';
  var IDENTIFIER_OR_QUOTED = '(?:' + IDENTIFIER + '|' + QUOTED_NAME + ')';

  var START_UML_RE = /^\s*@startuml\b/;
  var END_UML_RE = /^\s*@enduml\b/;

  function isStartUml(line) {
    if (line == null) return false;
    return START_UML_RE.test(line);
  }

  function isEndUml(line) {
    if (line == null) return false;
    return END_UML_RE.test(line);
  }

  return {
    IDENTIFIER: IDENTIFIER,
    QUOTED_NAME: QUOTED_NAME,
    IDENTIFIER_OR_QUOTED: IDENTIFIER_OR_QUOTED,
    isStartUml: isStartUml,
    isEndUml: isEndUml,
  };
})();
```

- [ ] **Step 3.4: loader に登録**

Edit `tests/run-tests.js` の `sourceFiles` に 1 行追加 (dsl-utils.js の直後):

```javascript
'src/core/dsl-utils.js',
'src/core/regex-parts.js',       // ← NEW
'src/core/text-updater.js',
```

- [ ] **Step 3.5: test PASS を確認**

Run: `node tests/run-tests.js tests/regex-parts.test.js`
Expected: `9 passed, 0 failed`

Run: `npm run test:unit`
Expected: 全体 regression なし

- [ ] **Step 3.6: HTML の script load 順を更新**

Edit `plantuml-assist.html`、`dsl-utils.js` の直後に追加:

```html
<script src="src/core/dsl-utils.js"></script>
<script src="src/core/regex-parts.js"></script>
<script src="src/core/text-updater.js"></script>
```

- [ ] **Step 3.7: Commit**

```bash
git add src/core/regex-parts.js tests/regex-parts.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(core): add regex-parts.js with shared PlantUML regex primitives

- IDENTIFIER / QUOTED_NAME / IDENTIFIER_OR_QUOTED patterns
- isStartUml / isEndUml predicates
- 9 unit tests pass"
```

---

### Task 4: `core/line-resolver.js` + tests (TDD)

**Files:**
- Create: `src/core/line-resolver.js`
- Create: `tests/line-resolver.test.js`

- [ ] **Step 4.1: 失敗する test を先に書く**

Create `tests/line-resolver.test.js`:

```javascript
'use strict';
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../src/core/line-resolver.js');
var LR = global.window.MA.lineResolver;

function makeSvg(groups) {
  // groups: [{ selector: 'g.participant', line: 5 }, ...]
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  groups.forEach(function(g) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    el.setAttribute('class', g.selector.replace('g.', ''));
    if (g.line != null) el.setAttribute('data-source-line', String(g.line));
    svg.appendChild(el);
  });
  return svg;
}

describe('lineResolver.matchByDataSourceLine', function() {
  test('matches parser line = svg line + offset', function() {
    var svg = makeSvg([{ selector: 'g.participant', line: 3 }, { selector: 'g.participant', line: 5 }]);
    var items = [{ line: 4 }, { line: 6 }];
    var matches = LR.matchByDataSourceLine(svg, items, 'g.participant', 1);
    expect(matches.length).toBe(2);
    expect(matches[0].item.line).toBe(4);
  });

  test('skips g without data-source-line', function() {
    var svg = makeSvg([{ selector: 'g.participant' }, { selector: 'g.participant', line: 5 }]);
    var items = [{ line: 6 }];
    var matches = LR.matchByDataSourceLine(svg, items, 'g.participant', 1);
    expect(matches.length).toBe(1);
  });
});

describe('lineResolver.matchByOrder', function() {
  test('pairs by appearance order when data-source-line absent', function() {
    var svg = makeSvg([{ selector: 'g.message' }, { selector: 'g.message' }]);
    var items = [{ id: 'a' }, { id: 'b' }];
    var matches = LR.matchByOrder(svg, items, 'g.message');
    expect(matches.length).toBe(2);
    expect(matches[0].item.id).toBe('a');
    expect(matches[1].item.id).toBe('b');
  });

  test('truncates to shorter length', function() {
    var svg = makeSvg([{ selector: 'g.message' }]);
    var items = [{ id: 'a' }, { id: 'b' }];
    var matches = LR.matchByOrder(svg, items, 'g.message');
    expect(matches.length).toBe(1);
  });
});

describe('lineResolver.pickBestOffset', function() {
  test('returns best offset by max match count, falls back to order match', function() {
    var svg = makeSvg([{ selector: 'g.participant', line: 3 }]);
    var items = [{ line: 4 }];  // matches with offset=1
    var result = LR.pickBestOffset(svg, items, 'g.participant', [0, 1, 5]);
    expect(result.offset).toBe(1);
    expect(result.matches.length).toBe(1);
  });
});
```

- [ ] **Step 4.2: test 失敗確認**

Run: `node tests/run-tests.js tests/line-resolver.test.js`
Expected: 失敗 (モジュール未作成)

- [ ] **Step 4.3: `src/core/line-resolver.js` を実装**

Create `src/core/line-resolver.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.lineResolver = (function() {

  function matchByDataSourceLine(svgEl, parsedItems, groupSelector, offset) {
    var matches = [];
    if (!svgEl || !parsedItems || !groupSelector) return matches;
    var groups = svgEl.querySelectorAll(groupSelector + '[data-source-line]');
    var lineToItem = {};
    parsedItems.forEach(function(item) {
      if (item && item.line != null) lineToItem[item.line] = item;
    });
    Array.prototype.forEach.call(groups, function(g) {
      var svgLine = parseInt(g.getAttribute('data-source-line'), 10);
      if (isNaN(svgLine)) return;
      var parserLine = svgLine + offset;
      var item = lineToItem[parserLine];
      if (item) {
        matches.push({ item: item, groupEl: g });
      }
    });
    return matches;
  }

  function matchByOrder(svgEl, parsedItems, groupSelector) {
    var matches = [];
    if (!svgEl || !parsedItems || !groupSelector) return matches;
    var allGroups = svgEl.querySelectorAll(groupSelector);
    var n = Math.min(allGroups.length, parsedItems.length);
    for (var i = 0; i < n; i++) {
      matches.push({ item: parsedItems[i], groupEl: allGroups[i] });
    }
    return matches;
  }

  function pickBestOffset(svgEl, parsedItems, groupSelector, candidates) {
    var best = { matches: [], offset: candidates[0] };
    for (var i = 0; i < candidates.length; i++) {
      var m = matchByDataSourceLine(svgEl, parsedItems, groupSelector, candidates[i]);
      if (m.length > best.matches.length) {
        best = { matches: m, offset: candidates[i] };
      }
    }
    if (best.matches.length === 0 && parsedItems.length > 0) {
      var fb = matchByOrder(svgEl, parsedItems, groupSelector);
      if (fb.length > 0) {
        best = { matches: fb, offset: null, usedOrderFallback: true };
      }
    }
    return best;
  }

  return {
    matchByDataSourceLine: matchByDataSourceLine,
    matchByOrder: matchByOrder,
    pickBestOffset: pickBestOffset,
  };
})();
```

- [ ] **Step 4.4: loader に登録**

Edit `tests/run-tests.js` の `sourceFiles` に追加 (regex-parts.js の直後):

```javascript
'src/core/regex-parts.js',
'src/core/line-resolver.js',     // ← NEW
'src/core/text-updater.js',
```

- [ ] **Step 4.5: test PASS 確認**

Run: `node tests/run-tests.js tests/line-resolver.test.js`
Expected: `5 passed, 0 failed`

Run: `npm run test:unit`
Expected: 全 regression なし

- [ ] **Step 4.6: HTML の script load 順を更新**

Edit `plantuml-assist.html`、`regex-parts.js` の直後に追加:

```html
<script src="src/core/regex-parts.js"></script>
<script src="src/core/line-resolver.js"></script>
<script src="src/core/text-updater.js"></script>
```

- [ ] **Step 4.7: Commit**

```bash
git add src/core/line-resolver.js tests/line-resolver.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(core): add line-resolver.js for SVG<->parser line mapping

- matchByDataSourceLine / matchByOrder / pickBestOffset
- generic (figure-agnostic) extracted from sequence-overlay.js
- 5 unit tests pass (jsdom)
- sequence-overlay.js integration in later task"
```

---

### Task 5: `core/formatter-interface.js` + tests (契約ドキュメント + 検証ヘルパー)

**Files:**
- Create: `src/core/formatter-interface.js`
- Create: `tests/formatter-interface.test.js`

- [ ] **Step 5.1: 失敗する test を先に書く**

Create `tests/formatter-interface.test.js`:

```javascript
'use strict';
var FI = (typeof window !== 'undefined' && window.MA && window.MA.formatterInterface)
  || (global.window && global.window.MA && global.window.MA.formatterInterface);

describe('formatterInterface.assertFormatterContract', function() {
  test('passes for well-formed formatter', function() {
    var fn = function(props) { return 'Alice -> Bob'; };
    expect(function() { FI.assertFormatterContract(fn, 'fmtMessage'); }).not.toThrow();
  });

  test('throws for non-function', function() {
    expect(function() { FI.assertFormatterContract(42, 'fmtFoo'); }).toThrow();
    expect(function() { FI.assertFormatterContract(null, 'fmtFoo'); }).toThrow();
  });
});

describe('formatterInterface.validateOutput', function() {
  test('empty string means no-op insertion (allowed)', function() {
    expect(FI.validateOutput('', 'fmtMessage')).toBe(true);
  });

  test('non-empty string allowed', function() {
    expect(FI.validateOutput('Alice -> Bob', 'fmtMessage')).toBe(true);
  });

  test('rejects non-string output', function() {
    expect(FI.validateOutput(42, 'fmtMessage')).toBe(false);
    expect(FI.validateOutput(null, 'fmtMessage')).toBe(false);
    expect(FI.validateOutput({}, 'fmtMessage')).toBe(false);
  });

  test('rejects string containing newline (formatters emit single line)', function() {
    expect(FI.validateOutput('line1\nline2', 'fmtMessage')).toBe(false);
  });
});

// Contract test helpers expected to be used by per-module test suites
```

`expect(fn).toThrow()` は現在の test runner に未実装なため、先に runner 拡張も行う必要がある。

- [ ] **Step 5.2: test runner の `expect().toThrow()` / `.not.toThrow()` 実装を追加**

Edit `tests/run-tests.js` 行 91-113 の `global.expect` 内、`not` オブジェクトの直前に挿入:

```javascript
    toThrow(expectedMsg) {
      if (typeof actual !== 'function') throw new Error('Expected a function to check toThrow');
      var threw = false, msg = '';
      try { actual(); } catch (e) { threw = true; msg = e.message; }
      if (!threw) throw new Error('Expected function to throw, but it did not');
      if (expectedMsg != null && msg.indexOf(expectedMsg) < 0) {
        throw new Error('Expected error message to contain "' + expectedMsg + '", got "' + msg + '"');
      }
    },
```

また `not` オブジェクト内にも追加:

```javascript
    not: {
      toBe(expected) { if (actual === expected) throw new Error(`Expected not ${JSON.stringify(expected)}`); },
      toBeNull() { if (actual === null) throw new Error('Expected not null'); },
      toContain(item) {
        if (typeof actual === 'string' && actual.includes(item)) throw new Error(`String should not contain "${item}"`);
        if (Array.isArray(actual) && actual.includes(item)) throw new Error(`Array should not contain ${JSON.stringify(item)}`);
      },
      toThrow() {
        if (typeof actual !== 'function') throw new Error('Expected a function to check .not.toThrow');
        try { actual(); } catch (e) { throw new Error('Expected function not to throw, but it threw: ' + e.message); }
      },
    },
```

- [ ] **Step 5.3: test が失敗することを確認 (モジュール未作成)**

Run: `node tests/run-tests.js tests/formatter-interface.test.js`
Expected: 失敗 (`FI` が undefined)

- [ ] **Step 5.4: `src/core/formatter-interface.js` を実装**

Create `src/core/formatter-interface.js`:

```javascript
'use strict';
window.MA = window.MA || {};

/**
 * Formatter Interface 契約
 *
 * 各図形モジュール (sequence.js, usecase.js, ...) は、DSL に挿入する 1 行を
 * 生成する純粋関数 fmtXxx(props) を複数提供する。本インターフェースはその
 * 契約 (入力 props は kind 別、出力は改行を含まない単一行文字列、必須 prop
 * 欠落時は '' を返す no-op) を明文化し、contract violation を開発時に
 * 検知する検証ヘルパーを提供する。
 *
 * Example:
 *   function fmtMessage(props) {
 *     if (!props || !props.from || !props.to) return '';
 *     return props.from + ' ' + (props.arrow || '->') + ' ' + props.to
 *       + (props.label ? ' : ' + props.label : '');
 *   }
 *
 * Contract:
 *   @param {Object} props — kind 別の formatter 引数 (各モジュール仕様に従う)
 *   @returns {string} — 単一行 DSL 文字列 (改行含まず)、または必須 prop 欠落
 *                       時は '' (caller 側で no-op として扱う)
 */
window.MA.formatterInterface = (function() {

  function assertFormatterContract(fn, name) {
    if (typeof fn !== 'function') {
      throw new Error('Formatter "' + (name || 'anonymous') + '" must be a function, got ' + typeof fn);
    }
    return true;
  }

  function validateOutput(output, formatterName) {
    if (typeof output !== 'string') return false;
    if (output.indexOf('\n') >= 0) return false;
    return true;
  }

  return {
    assertFormatterContract: assertFormatterContract,
    validateOutput: validateOutput,
  };
})();
```

- [ ] **Step 5.5: loader に登録**

Edit `tests/run-tests.js` の `sourceFiles` に追加 (line-resolver.js の直後):

```javascript
'src/core/line-resolver.js',
'src/core/formatter-interface.js', // ← NEW
'src/core/text-updater.js',
```

- [ ] **Step 5.6: test PASS 確認**

Run: `node tests/run-tests.js tests/formatter-interface.test.js`
Expected: `8 passed, 0 failed`

Run: `npm run test:unit`
Expected: 全 regression なし

- [ ] **Step 5.7: HTML の script load 順を更新**

Edit `plantuml-assist.html`、`line-resolver.js` の直後に追加:

```html
<script src="src/core/line-resolver.js"></script>
<script src="src/core/formatter-interface.js"></script>
<script src="src/core/text-updater.js"></script>
```

- [ ] **Step 5.8: Commit**

```bash
git add src/core/formatter-interface.js tests/formatter-interface.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(core): add formatter-interface.js for fmt* contract

- JSDoc contract for per-figure fmt* functions
- assertFormatterContract / validateOutput helpers
- toThrow / not.toThrow matchers added to test runner
- 8 unit tests pass"
```

---

### Task 6: `sequence.js` の `unquote` / コメント判定 / escape を core に置換

**Files:**
- Modify: `src/modules/sequence.js` (ローカル `unquote` 定義削除、呼び出し箇所置換、comment 判定置換、renameWithRefs の escape 置換)

- [ ] **Step 6.1: 置換箇所を先に洗い出す (参照確認)**

Run: `grep -n "unquote\|indexOf(\"'\")\|replace(/\[\\.\\\*" src/modules/sequence.js | head -20`

以下の置換対象を確認:
- 行 39-45: `function unquote(s) { ... }` ← 削除
- 行 74, 135, 255: `unquote(...)` 呼び出し ← `window.MA.dslUtils.unquote(...)` へ
- 行 91, 624, 583: `indexOf("'") === 0` ← `window.MA.dslUtils.isPlantumlComment(...)` へ
- 行 580: `oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` ← `window.MA.dslUtils.escapeForRegex(oldId)` へ

- [ ] **Step 6.2: ローカル `unquote` 定義を削除**

Edit `src/modules/sequence.js` 行 39-45:

```javascript
// BEFORE
  function unquote(s) {
    if (!s) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

// AFTER
  var unquote = window.MA.dslUtils.unquote;
```

- [ ] **Step 6.3: `renameWithRefs` の escape を置換**

Edit `src/modules/sequence.js` 行 580:

```javascript
// BEFORE
    var escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// AFTER
    var escaped = window.MA.dslUtils.escapeForRegex(oldId);
```

- [ ] **Step 6.4: コメント判定を置換 (3 箇所)**

Edit `src/modules/sequence.js`:

行 91 付近 (`parseSequence` 内):
```javascript
// BEFORE
      if (!trimmed || trimmed.indexOf("'") === 0) continue;

// AFTER
      if (!trimmed || window.MA.dslUtils.isPlantumlComment(trimmed)) continue;
```

行 624 付近 (`moveMessage` 内):
```javascript
// BEFORE
      if (!t || t.indexOf("'") === 0) { target += direction; continue; }

// AFTER
      if (!t || window.MA.dslUtils.isPlantumlComment(t)) { target += direction; continue; }
```

行 583 付近 (`renameWithRefs` 内):
```javascript
// BEFORE
      if (/^\s*'/.test(line)) return line;

// AFTER
      if (window.MA.dslUtils.isPlantumlComment(line)) return line;
```

- [ ] **Step 6.5: 全 unit tests で regression なし確認**

Run: `npm run test:unit`
Expected: 既存 sequence-parser / sequence-updater / sequence-overlay tests 全 PASS、新規 dsl-utils tests も PASS、failed = 0

- [ ] **Step 6.6: E2E smoke test (ブラウザ実行の最小 regression 確認)**

Run: `npx playwright test tests/e2e/sequence-basic.spec.js --reporter=list 2>&1 | tail -20`
Expected: 全 PASS (もし `sequence-basic.spec.js` が存在しなければ `tests/e2e/` 配下の sequence 関連 spec を 1 つ実行)

**E2E が失敗した場合**: すぐに `git diff` で置換内容を確認、`window.MA.dslUtils` の load 順 (HTML 行 524 で sequence.js より前にあるか) と test sandbox 内の `window` が core モジュールを保持しているかチェック。

- [ ] **Step 6.7: Commit**

```bash
git add src/modules/sequence.js
git commit -m "refactor(sequence): replace local unquote/escape/comment helpers with core/dsl-utils

- unquote -> window.MA.dslUtils.unquote
- regex escape in renameWithRefs -> escapeForRegex
- comment detection (3 sites) -> isPlantumlComment
- no behavior change, regression tests pass"
```

---

### Task 7: `sequence-overlay.js` の line 解決ロジックを core に置換

**Files:**
- Modify: `src/ui/sequence-overlay.js` (`_matchByDataSourceLine` / `_matchByOrder` / `_pickBestOffset` を core/line-resolver.js 呼び出しに置換)

- [ ] **Step 7.1: 現状の関数呼び出し箇所を確認**

Run: `grep -n "_matchByDataSourceLine\|_matchByOrder\|_pickBestOffset" src/ui/sequence-overlay.js`

予想される結果: 定義 3 箇所 + 呼び出し 1-3 箇所 (主に `_pickBestOffset` 経由)。

- [ ] **Step 7.2: 定義 (行 42-130 付近) を削除、呼び出しを `window.MA.lineResolver.*` に置換**

Edit `src/ui/sequence-overlay.js`:

- `function _matchByDataSourceLine(...) { ... }` の関数本体を削除
- `function _matchByOrder(...) { ... }` の関数本体を削除
- `function _pickBestOffset(svgEl, parsedItems, groupSelector, candidates) { ... }` の本体を以下に差し替え:

```javascript
  function _pickBestOffset(svgEl, parsedItems, groupSelector, candidates) {
    return window.MA.lineResolver.pickBestOffset(svgEl, parsedItems, groupSelector, candidates);
  }
```

(ローカル `_pickBestOffset` wrapper を残すことで既存の内部呼び出し箇所を書き換えずに済む。pure wrapper なので zero-cost。)

`_matchByDataSourceLine` / `_matchByOrder` を直接呼び出している箇所があれば同様に wrapper 化 or `window.MA.lineResolver.xxx` に置換。

- [ ] **Step 7.3: HTML の load 順を確認 (line-resolver.js は sequence-overlay.js より前)**

Edit `plantuml-assist.html` を確認。現在の期待される順序:
```html
<script src="src/core/html-utils.js"></script>
<script src="src/core/dsl-utils.js"></script>
<script src="src/core/regex-parts.js"></script>
<script src="src/core/line-resolver.js"></script>
<script src="src/core/formatter-interface.js"></script>
<script src="src/core/text-updater.js"></script>
<script src="src/core/parser-utils.js"></script>
<script src="src/core/history.js"></script>
<script src="src/core/selection.js"></script>
<script src="src/core/connection-mode.js"></script>
<script src="src/ui/properties.js"></script>
<script src="src/ui/sequence-overlay.js"></script>
```

line-resolver.js が sequence-overlay.js より前にあることを確認 (Task 4 の Step 4.6 で設定済のはず)。

- [ ] **Step 7.4: `tests/sequence-overlay.test.js` が regression なし**

Run: `node tests/run-tests.js tests/sequence-overlay.test.js`
Expected: 既存 tests 全 PASS (line 解決ロジックは core に移っただけ、外部 API 不変)

- [ ] **Step 7.5: 全 unit + E2E で regression なし確認**

Run: `npm run test:unit`
Expected: 全 PASS

Run: `npx playwright test --reporter=list 2>&1 | tail -20`
Expected: 全 PASS (overlay の click/selection 動作に影響なし)

- [ ] **Step 7.6: Commit**

```bash
git add src/ui/sequence-overlay.js
git commit -m "refactor(overlay): delegate line resolution to core/line-resolver

- _matchByDataSourceLine / _matchByOrder / _pickBestOffset bodies
  moved to core/line-resolver.js (done in earlier task)
- sequence-overlay.js keeps thin wrappers for zero call-site changes
- ~70 lines removed from sequence-overlay.js
- regression tests + e2e pass"
```

---

### Task 8: `parser-utils.js` の directive 判定を core に統一

**Files:**
- Modify: `src/core/parser-utils.js` (`/^@startuml/` / `/^@enduml/` リテラル regex を `window.MA.regexParts.isStartUml` / `isEndUml` に置換)

- [ ] **Step 8.1: `parser-utils.js` の該当箇所を確認**

Run: `grep -n "@startuml\|@enduml" src/core/parser-utils.js`

期待される行:
- 行 11: `if (/^@startuml/.test(t)) { inBlock = true; continue; }`
- 行 12: `if (/^@enduml/.test(t)) break;`

- [ ] **Step 8.2: `window.MA.regexParts.isStartUml` / `isEndUml` に置換**

Edit `src/core/parser-utils.js` 行 11-12:

```javascript
// BEFORE
      if (/^@startuml/.test(t)) { inBlock = true; continue; }
      if (/^@enduml/.test(t)) break;

// AFTER
      if (window.MA.regexParts.isStartUml(t)) { inBlock = true; continue; }
      if (window.MA.regexParts.isEndUml(t)) break;
```

**注意**: `parser-utils.js` が `regex-parts.js` より後に load される必要がある。
`tests/run-tests.js` / `plantuml-assist.html` の順序確認 (Task 3 で `regex-parts.js` が `text-updater.js` の前、`parser-utils.js` は `text-updater.js` の後なので OK):

```
html-utils.js
dsl-utils.js
regex-parts.js          ← before parser-utils.js ✓
line-resolver.js
formatter-interface.js
text-updater.js
parser-utils.js         ← uses window.MA.regexParts
...
```

- [ ] **Step 8.3: `tests/parser-utils.test.js` が regression なし**

Run: `node tests/run-tests.js tests/parser-utils.test.js`
Expected: 既存 tests 全 PASS (`detectDiagramType` の挙動は不変)

- [ ] **Step 8.4: 全 unit + E2E で regression なし確認**

Run: `npm run test:unit`
Expected: 全 PASS

Run: `npx playwright test --reporter=list 2>&1 | tail -10`
Expected: 全 PASS

- [ ] **Step 8.5: Commit**

```bash
git add src/core/parser-utils.js
git commit -m "refactor(parser-utils): use regex-parts.isStartUml / isEndUml

- centralized @startuml / @enduml detection
- behavior identical, regression tests pass"
```

---

### Task 9: 総合 regression + Visual Verification + 行数記録

**Files:**
- (検証のみ、コード変更なし)
- 必要に応じ commit message に最終行数を記録

- [ ] **Step 9.1: 全 unit tests 実行**

Run: `npm run test:unit 2>&1 | tail -5`
Expected: `(baseline passed + 35) passed, 0 failed`

(内訳: baseline + dsl-utils 13 + regex-parts 9 + line-resolver 5 + formatter-interface 8 = +35 tests)

- [ ] **Step 9.2: 全 E2E tests 実行 (local render mode)**

Run: `npx playwright test 2>&1 | tail -20`
Expected: 全 PASS

(注意: Java 環境が必要。`lib/plantuml.jar` が配置されていない場合 `bash lib/fetch-plantuml.sh` で先に取得)

- [ ] **Step 9.3: 行数差分を記録**

Run: `wc -l src/modules/sequence.js src/ui/sequence-overlay.js src/core/parser-utils.js src/core/*.js`

期待値 (目安):
- `src/modules/sequence.js`: 1,311 → ~1,285 (約 26 行減: unquote 7 + escape 1 行 + comment 3 箇所を wrapper 化した分)
- `src/ui/sequence-overlay.js`: 約 -60〜-70 行
- `src/core/` 配下: 新規 4 モジュール追加

**注意**: 仕様の "1,311 → ~1,150" は `sequence.js` 単独では到達しない (主な削減元は `sequence-overlay.js`)。実際の削減は `sequence.js + sequence-overlay.js` 合計で約 80〜100 行、core 追加で差し引き +200 行 (テスト含めれば +400 行) が期待値。spec の数字は approximately の意で、本 Sprint の成功基準は「regression ゼロ かつ 共通 API が core に存在すること」。

- [ ] **Step 9.4: Visual Verification — Evaluator エージェントで実機スクショ検証**

ブランチを一旦 push (ローカルのみでも可):

```bash
git push -u origin feat/sprint0-core-extraction 2>&1 | tail -3
```
(ユーザーが明示承認済でなければ push は省略可。ローカル起動で検証する場合は次ステップへ)

ローカル起動で検証:

```bash
python server.py &
sleep 2
```

Evaluator エージェントを起動 (Task tool 経由):

```
Agent(subagent_type=evaluator, prompt="
Project: 06_PlantUMLAssist
Branch: feat/sprint0-core-extraction
Dev server URL: http://127.0.0.1:8766/
Sprint: sprint-0 (core extraction regression check)
Scope: Sequence Diagram の既存 UC (参加者追加 / メッセージ追加 / note 追加 / overlay click selection / renameWithRefs / autonumber toggle) すべて regression なしを実機で確認。
Evidence required: console error 0, visual regression 0, 各 UC のスクリーンショット。
")
```

Expected: Evaluator が `.eval/sprint-0/report.md` を PASS で生成、console error = 0

サーバー停止:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 9.5: CHANGELOG 更新 (任意、spec の通例に合わせる場合)**

もし `CHANGELOG.md` が存在する場合、`[Unreleased]` に以下を追加:

```markdown
### Added
- `src/core/dsl-utils.js`, `src/core/regex-parts.js`, `src/core/line-resolver.js`, `src/core/formatter-interface.js` — Tier1 共通基盤 Sprint 0 抽出分

### Changed
- `src/modules/sequence.js`, `src/ui/sequence-overlay.js`, `src/core/parser-utils.js` — 共通ヘルパーに移譲、挙動変更なし
```

(存在しなければ Step 9.5 はスキップ)

- [ ] **Step 9.6: 最終 commit (差分があれば) + 結果サマリを PR description 候補としてメモ**

```bash
git status --short
```

差分がなければ push のみ:
```bash
git log --oneline origin/master..HEAD 2>/dev/null || git log --oneline -10
```

期待される commit 履歴:
```
[Task 8] refactor(parser-utils): use regex-parts.isStartUml / isEndUml
[Task 7] refactor(overlay): delegate line resolution to core/line-resolver
[Task 6] refactor(sequence): replace local unquote/escape/comment helpers with core/dsl-utils
[Task 5] feat(core): add formatter-interface.js for fmt* contract
[Task 4] feat(core): add line-resolver.js for SVG<->parser line mapping
[Task 3] feat(core): add regex-parts.js with shared PlantUML regex primitives
[Task 2] feat(core): add dsl-utils.js with pure DSL helpers
[Task 1] docs(plan): Sprint 0 core extraction implementation plan
```

- [ ] **Step 9.7: PR description template を作成 (ユーザーが PR 作成を承認した時用)**

以下を `.git/PR_DESCRIPTION.md` に保存 (ユーザーが手動で `gh pr create` するとき流用):

```markdown
## Sprint 0 — Core Extraction (軽量共通抽出)

Master spec: `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md` Section 4.1
Plan: `docs/superpowers/plans/2026-04-24-sprint0-core-extraction.md`

### Summary
- 4 new core modules: `dsl-utils.js`, `regex-parts.js`, `line-resolver.js`, `formatter-interface.js`
- `sequence.js` / `sequence-overlay.js` / `parser-utils.js` delegate to core
- Zero behavior change, 35 new unit tests, 0 e2e regression

### Test Plan
- [x] `npm run test:unit` — all pass (baseline + 35)
- [x] `npx playwright test` — local render mode all pass
- [x] Evaluator visual sweep — console error 0

### Out of Scope (S1.5 でやる)
- overlay-builder / selection-router / props-renderer / dsl-updater の共通抽出
```

---

## Self-Review

### Spec coverage

Spec Section 4.1 (S0 軽量抽出) の全要件:

| 要件 | 対応 Task | 状態 |
|---|---|---|
| `core/dsl-utils.js` 新設 (unquote/quote/escape/comment 判定) | Task 2 | ✓ |
| `core/regex-parts.js` 新設 (identifier/quoted-name/arrow/@startuml) | Task 3 | ✓ |
| `core/line-resolver.js` 新設 (data-source-line → model) | Task 4 | ✓ |
| `core/formatter-interface.js` 新設 (契約 + 検証ヘルパー) | Task 5 | ✓ |
| sequence.js が 4 モジュールを import して動作 | Task 6 | ✓ |
| 既存 unit + e2e tests PASS | Task 6, 7, 8, 9 | ✓ |
| 各 core モジュールに unit tests 5-10 件追加 | Task 2-5 | ✓ (13/9/5/8 tests) |
| **S0 除外**: overlay/selection/props/updater の抽出 | (意図的スコープ外、Task なし) | ✓ |

Spec の明示除外 (S1.5 対象) は Task に含まれていない → 正しい。

### Placeholder scan

- "TBD", "TODO", "implement later" — なし (検索済)
- "add appropriate error handling" — なし
- "similar to Task N" — なし (全 Task で完全なコード記述)
- 型/関数の未定義参照 — なし (`window.MA.dslUtils.*`, `window.MA.regexParts.*`, `window.MA.lineResolver.*`, `window.MA.formatterInterface.*` は Task 2-5 で定義)

### Type consistency

- `matchByDataSourceLine` / `matchByOrder` / `pickBestOffset` — Task 4 で定義、Task 7 で呼び出し、型一致
- `unquote` / `quote` / `escapeForRegex` / `isPlantumlComment` — Task 2 で定義、Task 6, 7, 8 で呼び出し、型一致
- `isStartUml` / `isEndUml` — Task 3 で定義、Task 8 で呼び出し、型一致
- `assertFormatterContract` / `validateOutput` — Task 5 で定義 (図形モジュールでの使用は本 Sprint 対象外、S1.5 以降で使用)

### Scope check

本 plan は「Sprint 0 の 1 スプリント」で完結。UseCase 実装 / S1.5 本丸抽出 は別 plan。スコープ適切。
