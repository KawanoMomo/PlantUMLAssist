# Component Diagram + S1.5 v0.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement (Phase A) S1.5 共通基盤抽出 — extract `core/dsl-updater.js` + `core/props-renderer.js` from sequence.js + usecase.js with zero regression, then (Phase B) Component Diagram form-based MVP for v0.4.0 — new `src/modules/component.js` + 6 E2E spec files exercising 12-cell α/γ pass matrix.

**Architecture:** Vanilla ES5 DiagramModule v2. Phase A first refactors existing modules to delegate to new core helpers (Rule of Three for the 2 modules sharing the helpers); Phase B then implements Component using both Sprint 0 (dsl-utils, regex-parts, formatter-interface) and Phase A new helpers. No overlay-driven UI in v0.4.0 — deferred to v0.5.0 along with overlay-builder/selection-router extraction.

**Tech Stack:** JavaScript ES5 + `window.MA` namespace, Python 3 stdlib backend, Playwright (E2E), Node test runner (`tests/run-tests.js`).

**Spec reference:** `docs/superpowers/specs/2026-04-25-component-design.md` (commit `6a1ec2d`)

---

## File Structure

### 新設ファイル

| Path | 責任 | 公開先 |
|---|---|---|
| `src/core/dsl-updater.js` | 汎用 DSL 行操作 — `insertBeforeEnd`, `moveLineUp/Down`, `renameWithRefs` | `window.MA.dslUpdater` |
| `src/core/props-renderer.js` | selection 状態 → callback dispatch | `window.MA.propsRenderer` |
| `src/modules/component.js` | Component DiagramModule v2 — parser, formatters, ops, renderProps | `window.MA.modules.plantumlComponent` |
| `tests/dsl-updater.test.js` | dsl-updater unit tests (~10 tests) | — |
| `tests/props-renderer.test.js` | props-renderer unit tests (~5 tests) | — |
| `tests/component-parser.test.js` | Component parser tests (~20 tests) | — |
| `tests/component-updater.test.js` | Component updater + formatters tests (~20 tests) | — |
| `tests/e2e/component-uc-01-new-system.spec.js` 〜 `component-uc-06-polish-rename.spec.js` | 6 E2E spec files (α + γ describe blocks) | — |
| `docs/adr/ADR-106-component-canonical-form.md` | ADR for Component canonical DSL form | — |

### 変更ファイル

| Path | Phase | 変更内容 |
|---|---|---|
| `src/modules/sequence.js` | A | local `insertBeforeEnd` / `renameWithRefs` を削除 → `window.MA.dslUpdater.*` に置換 |
| `src/modules/usecase.js` | A | local `insertBeforeEnd` / `moveLineUp/Down` / `renameWithRefs` を削除 → core delegate。`renderProps` を `window.MA.propsRenderer.renderByDispatch` で書き換え |
| `src/core/parser-utils.js` | B | `detectDiagramType` 内の component 検出を `[*]` (state) と区別するよう精緻化 |
| `plantuml-assist.html` | A+B | `<script>` セクションに `dsl-updater.js`, `props-renderer.js`, `component.js` を追加。`<select id="diagram-type">` に Component option 追加 |
| `tests/run-tests.js` | A+B | `sourceFiles` 配列に新 4 ファイル追加 |
| `README.md` | B | Component セクション追加 |
| `CHANGELOG.md` | B | v0.4.0 リリースノート |

### 不変ファイル (触らない)

- Sprint 0 core: `dsl-utils.js`, `regex-parts.js`, `line-resolver.js`, `formatter-interface.js`
- `src/ui/sequence-overlay.js`, `src/ui/properties.js`, `src/ui/rich-label-editor.js`
- `src/app.js` (一部 component 切替時の関連は既存 diagram-type change handler で対応可能)
- `server.py`, `lib/`

---

## Branch Strategy

実装は新ブランチ `feat/tier1-component`、親は `feat/tier1-usecase` (Sprint 1 の usecase.js が必要なため)。

```bash
git checkout feat/tier1-usecase
git checkout -b feat/tier1-component
git cherry-pick 6a1ec2d  # spec
# plan は本ファイル — 取り込みは Task 1
```

PR 作成時 base = `master`、head = `feat/tier1-component`。Sprint 0/1 の PR が先にマージ済を前提。

## Verification Gate

各 task の commit 前に必ず:

- 関連 unit test PASS
- 既存 unit tests に regression なし

最終 task で:

- 全 unit + 全 E2E PASS
- Evaluator 実機スクショ検証で 12-cell マトリクス全 PASS、console error 0
- ADR-014 (Visual Verification Gate) 準拠

**Working tree hygiene (重要)**: Other agents が parallel に touching する可能性。各 commit 前に `git status --short` で意図しないファイル混入をチェック、`git checkout -- <file>` で revert してから add。

---

## Phase A — S1.5 共通基盤抽出

### Task 1: ブランチ作成 + ADR-106

**Files:** Create `docs/adr/ADR-106-component-canonical-form.md`

- [ ] **Step 1.1: ブランチ作成 + spec/plan 取り込み**

```bash
cd E:\00_Git\06_PlantUMLAssist
git checkout feat/tier1-usecase
git checkout -b feat/tier1-component
git cherry-pick 6a1ec2d  # spec only — plan will be separately committed
```

- [ ] **Step 1.2: plan を本ブランチに commit (もし未 commit なら)**

```bash
git add docs/superpowers/plans/2026-04-25-component-v0.4.0.md
git commit -m "docs(plan): Component v0.4.0 implementation plan" 2>&1 || true
```

- [ ] **Step 1.3: ADR-106 作成**

Create `docs/adr/ADR-106-component-canonical-form.md`:

```markdown
# ADR-106: Component Canonical DSL Form

- **Status**: Accepted
- **Date**: 2026-04-25
- **Spec reference**: `docs/superpowers/specs/2026-04-25-component-design.md` Section 7

## Context

PlantUML Component Diagram has multiple equivalent DSL syntaxes:
- component: `component X` / `component "Label" as X` / `[X]` / `[X] as A`
- interface: `interface X` / `interface "Label" as X` / `() X`
- package boundary: `package "L" {` / `folder "L" {` / `frame "L" {` / `node "L" {` / `rectangle "L" {`
- lollipop: `component -() interface` (provides) / `interface )- component` (requires) / reverse forms

The parser must accept all variants but the updater must emit ONE canonical form.

## Decision

Component DSL emit uses keyword-first canonical form:

- component: `component X` (when label==id) / `component "Label" as X` (when label!=id)
- interface: `interface X` / `interface "Label" as X`
- port: `port X` (placed on line directly after parent component)
- package: `package "Label" {` ... `}` (label always quoted)
- association: `A -- B` (label optional `: text`)
- dependency: `A ..> B`
- provides (lollipop): `component -() interface`
- requires (lollipop): `interface )- component`

Short forms (`[X]`, `() X`, `folder`/`frame`/`node`/`rectangle`) are accepted on parse but normalized away on emit.

## Rationale

1. Consistency with ADR-105 (UseCase) keyword-first principle
2. Grep-friendliness: `grep -n "component\b"` reliably finds component declarations
3. renameWithRefs robustness: keyword anchors reduce identifier match ambiguity
4. Round-trip predictability: short-form input gets normalized on save

## Consequences

- Parser test fixtures must include both forms
- README must note that PlantUML official samples (which often use short forms) get normalized
- Future Tier1 figures inherit this convention
```

- [ ] **Step 1.4: ADR-106 commit**

```bash
git add docs/adr/ADR-106-component-canonical-form.md
git commit -m "docs(adr): ADR-106 Component canonical DSL form (keyword-first)

Reference: spec 2026-04-25-component-design.md Section 7"
```

---

### Task 2: `core/dsl-updater.js` (Phase A — TDD)

**Files:**
- Create: `src/core/dsl-updater.js`
- Create: `tests/dsl-updater.test.js`
- Modify: `tests/run-tests.js`, `plantuml-assist.html`

- [ ] **Step 2.1: failing test を書く**

Create `tests/dsl-updater.test.js`:

```javascript
'use strict';
var DUR = (typeof window !== 'undefined' && window.MA && window.MA.dslUpdater)
  || (global.window && global.window.MA && global.window.MA.dslUpdater);

describe('dslUpdater.insertBeforeEnd', function() {
  test('inserts before @enduml', function() {
    var t = '@startuml\nactor A\n@enduml';
    expect(DUR.insertBeforeEnd(t, 'actor B')).toBe('@startuml\nactor A\nactor B\n@enduml');
  });
  test('appends if no @enduml', function() {
    var t = '@startuml\nactor A';
    expect(DUR.insertBeforeEnd(t, 'actor B')).toBe('@startuml\nactor A\nactor B');
  });
});

describe('dslUpdater.moveLineUp', function() {
  test('swaps adjacent lines', function() {
    var t = '@startuml\nA\nB\n@enduml';
    expect(DUR.moveLineUp(t, 3)).toBe('@startuml\nB\nA\n@enduml');
  });
  test('no-op at line 1', function() {
    var t = '@startuml\nA\n@enduml';
    expect(DUR.moveLineUp(t, 1)).toBe(t);
  });
});

describe('dslUpdater.moveLineDown', function() {
  test('swaps adjacent lines', function() {
    var t = '@startuml\nA\nB\n@enduml';
    expect(DUR.moveLineDown(t, 2)).toBe('@startuml\nB\nA\n@enduml');
  });
  test('no-op at last line', function() {
    var t = '@startuml\nA';
    expect(DUR.moveLineDown(t, 2)).toBe(t);
  });
});

describe('dslUpdater.renameWithRefs', function() {
  test('renames identifier with word boundary', function() {
    var t = '@startuml\nactor User\nUser --> Login\n@enduml';
    var out = DUR.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain('actor Admin');
    expect(out).toContain('Admin --> Login');
  });
  test('does not match inside other identifiers', function() {
    var t = '@startuml\nUser User2\n@enduml';
    var out = DUR.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain('Admin User2');
    expect(out).not.toContain('AdminUser2');
  });
  test('preserves quoted labels', function() {
    var t = '@startuml\nactor "User Name" as U\n@enduml';
    var out = DUR.renameWithRefs(t, 'U', 'Admin');
    expect(out).toContain('"User Name"');
    expect(out).toContain('as Admin');
  });
  test('skips comment lines', function() {
    var t = "@startuml\n' rename User\nactor User\n@enduml";
    var out = DUR.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain("' rename User");
    expect(out).toContain('actor Admin');
  });
});
```

- [ ] **Step 2.2: 実装作成**

Create `src/core/dsl-updater.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.dslUpdater = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;

  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (RP.isEndUml(lines[i])) { endIdx = i; break; }
    }
    if (endIdx < 0) {
      var insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, newLine);
    } else {
      lines.splice(endIdx, 0, newLine);
    }
    return lines.join('\n');
  }

  function moveLineUp(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx <= 0 || idx >= lines.length) return text;
    var tmp = lines[idx]; lines[idx] = lines[idx - 1]; lines[idx - 1] = tmp;
    return lines.join('\n');
  }

  function moveLineDown(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length - 1) return text;
    var tmp = lines[idx]; lines[idx] = lines[idx + 1]; lines[idx + 1] = tmp;
    return lines.join('\n');
  }

  function renameWithRefs(text, oldId, newId) {
    if (!oldId || !newId || oldId === newId) return text;
    var escaped = DU.escapeForRegex(oldId);
    var pattern = new RegExp('\\b' + escaped + '\\b', 'g');
    return text.split('\n').map(function(line) {
      if (DU.isPlantumlComment(line)) return line;
      var quoted = [];
      var stripped = line.replace(/"[^"]*"/g, function(m) {
        quoted.push(m);
        return '' + (quoted.length - 1) + '';
      });
      var replaced = stripped.replace(pattern, newId);
      return replaced.replace(/(\d+)/g, function(_, idx) {
        return quoted[parseInt(idx, 10)];
      });
    }).join('\n');
  }

  return {
    insertBeforeEnd: insertBeforeEnd,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    renameWithRefs: renameWithRefs,
  };
})();
```

- [ ] **Step 2.3: 登録 + tests pass 確認**

Edit `tests/run-tests.js` `sourceFiles` — add `'src/core/dsl-updater.js'` after `'src/core/formatter-interface.js'`:

```javascript
'src/core/formatter-interface.js',
'src/core/dsl-updater.js',     // ← NEW
'src/core/text-updater.js',
```

Edit `plantuml-assist.html` — add `<script src="src/core/dsl-updater.js"></script>` after `formatter-interface.js`:

```html
<script src="src/core/formatter-interface.js"></script>
<script src="src/core/dsl-updater.js"></script>
<script src="src/core/text-updater.js"></script>
```

Run: `npm run test:unit`
Expected: baseline 208 + 10 new = 218 passed, 0 failed.

- [ ] **Step 2.4: Commit**

```bash
git status --short  # verify only 4 expected files
git add src/core/dsl-updater.js tests/dsl-updater.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(core): add dsl-updater.js with shared DSL line ops

- insertBeforeEnd / moveLineUp/Down / renameWithRefs
- extracted contract — sequence.js / usecase.js refactor follows
- 10 unit tests pass"
```

---

### Task 3: `core/props-renderer.js` (Phase A — TDD)

**Files:**
- Create: `src/core/props-renderer.js`
- Create: `tests/props-renderer.test.js`
- Modify: `tests/run-tests.js`, `plantuml-assist.html`

- [ ] **Step 3.1: failing test を書く**

Create `tests/props-renderer.test.js`:

```javascript
'use strict';
var PR = (typeof window !== 'undefined' && window.MA && window.MA.propsRenderer)
  || (global.window && global.window.MA && global.window.MA.propsRenderer);

function makeMockEl() {
  return { innerHTML: '' };
}

describe('propsRenderer.renderByDispatch', function() {
  var parsed = {
    elements: [{ kind: 'actor', id: 'U', label: 'U', line: 3 }],
    relations: [{ id: '__r_0', kind: 'association', from: 'U', to: 'L', line: 4 }],
    groups: [{ kind: 'package', id: 'pkg_0', label: 'P', startLine: 5, endLine: 7 }],
  };

  test('calls onNoSelection when selData empty', function() {
    var called = null;
    PR.renderByDispatch([], parsed, makeMockEl(), {
      onNoSelection: function() { called = 'noSel'; },
      onElement: function() { called = 'elt'; },
    });
    expect(called).toBe('noSel');
  });

  test('calls onElement for actor selection', function() {
    var got = null;
    PR.renderByDispatch([{ type: 'actor', id: 'U', line: 3 }], parsed, makeMockEl(), {
      onElement: function(e) { got = e; },
    });
    expect(got.kind).toBe('actor');
    expect(got.id).toBe('U');
  });

  test('calls onRelation for relation selection', function() {
    var got = null;
    PR.renderByDispatch([{ type: 'message', id: '__r_0', line: 4 }], parsed, makeMockEl(), {
      onRelation: function(r) { got = r; },
    });
    expect(got.id).toBe('__r_0');
  });

  test('calls onGroup for group selection', function() {
    var got = null;
    PR.renderByDispatch([{ type: 'group', id: 'pkg_0', line: 5 }], parsed, makeMockEl(), {
      onGroup: function(g) { got = g; },
    });
    expect(got.kind).toBe('package');
  });

  test('does not throw when no matching dispatcher', function() {
    expect(function() {
      PR.renderByDispatch([{ type: 'unknown', id: 'X' }], parsed, makeMockEl(), {});
    }).not.toThrow();
  });
});
```

- [ ] **Step 3.2: 実装作成**

Create `src/core/props-renderer.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.propsRenderer = (function() {
  function renderByDispatch(selData, parsedData, propsEl, dispatchers) {
    if (!propsEl) return;
    if (!selData || selData.length === 0) {
      if (dispatchers.onNoSelection) dispatchers.onNoSelection(parsedData, propsEl);
      return;
    }
    var sel = selData[0];
    var relation = (parsedData.relations || []).find(function(r) { return r.id === sel.id; });
    if (relation && dispatchers.onRelation) {
      dispatchers.onRelation(relation, parsedData, propsEl);
      return;
    }
    var group = (parsedData.groups || []).find(function(g) { return g.id === sel.id; });
    if (group && dispatchers.onGroup) {
      dispatchers.onGroup(group, parsedData, propsEl);
      return;
    }
    var element = (parsedData.elements || []).find(function(e) {
      return e.id === sel.id && e.kind === sel.type;
    });
    if (element && dispatchers.onElement) {
      dispatchers.onElement(element, parsedData, propsEl);
      return;
    }
    if (dispatchers.onUnknown) dispatchers.onUnknown(sel, parsedData, propsEl);
  }
  return { renderByDispatch: renderByDispatch };
})();
```

- [ ] **Step 3.3: 登録 + tests pass**

Edit `tests/run-tests.js` — add `'src/core/props-renderer.js'` after `'src/core/dsl-updater.js'`:

```javascript
'src/core/dsl-updater.js',
'src/core/props-renderer.js',  // ← NEW
'src/core/text-updater.js',
```

Edit `plantuml-assist.html` similarly.

Run: `npm run test:unit`
Expected: 218 + 5 = 223 passed.

- [ ] **Step 3.4: Commit**

```bash
git add src/core/props-renderer.js tests/props-renderer.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(core): add props-renderer.js dispatcher

- renderByDispatch: selData -> appropriate callback (onNoSelection / onElement / onRelation / onGroup)
- enables figure modules to share selection-state routing
- 5 unit tests pass"
```

---

### Task 4: Refactor sequence.js to use core/dsl-updater (Phase A)

**Files:** Modify `src/modules/sequence.js`

- [ ] **Step 4.1: 置換箇所を grep で確認**

```bash
grep -n "function insertBeforeEnd\|function renameWithRefs" src/modules/sequence.js
```

- [ ] **Step 4.2: insertBeforeEnd 削除 → core delegate**

Delete the local `function insertBeforeEnd(text, newLine) { ... }` block. Replace with:

```javascript
  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;
```

- [ ] **Step 4.3: renameWithRefs 削除 → core delegate**

Delete the local `function renameWithRefs(text, oldId, newId) { ... }` block. Replace with:

```javascript
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;
```

- [ ] **Step 4.4: NOTE — moveMessage は残す**

`moveMessage` is sequence-specific (skips group boundaries). Do NOT replace with `dslUpdater.moveLineUp/Down`.

- [ ] **Step 4.5: regression 確認**

Run: `npm run test:unit`
Expected: all sequence tests still pass.

Run: `npx playwright test tests/e2e/sequence-basic.spec.js --workers=1 --reporter=list 2>&1 | tail -10`
Expected: sequence E2E pass.

- [ ] **Step 4.6: Commit**

```bash
git status --short  # only sequence.js
git add src/modules/sequence.js
git commit -m "refactor(sequence): delegate insertBeforeEnd / renameWithRefs to core/dsl-updater

- ~30 lines removed
- moveMessage retained (sequence-specific group-boundary skip semantics)
- regression tests pass"
```

---

### Task 5: Refactor usecase.js to use core/dsl-updater + props-renderer (Phase A)

**Files:** Modify `src/modules/usecase.js`

- [ ] **Step 5.1: dsl-updater delegate**

Delete local `insertBeforeEnd`, `moveLineUp`, `moveLineDown`, `renameWithRefs`. Replace with:

```javascript
  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;
  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;
```

- [ ] **Step 5.2: renderProps を props-renderer.renderByDispatch で書き換え**

The current `renderProps` is monolithic (no-selection branch + selection branch all in one function). Refactor to use dispatcher:

```javascript
  function renderProps(selData, parsedData, propsEl, ctx) {
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(parsed, el) { _renderNoSelection(parsed, el, ctx); },
      onElement: function(elt, parsed, el) { _renderElementEdit(elt, parsed, el, ctx); },
      onRelation: function(rel, parsed, el) { _renderRelationEdit(rel, parsed, el, ctx); },
      onGroup: function(grp, parsed, el) { _renderGroupReadOnly(grp, parsed, el, ctx); },
    });
  }
```

Move existing logic into 4 private functions: `_renderNoSelection`, `_renderElementEdit`, `_renderRelationEdit`, `_renderGroupReadOnly`. The HTML/binding logic per branch is unchanged — just reorganized.

- [ ] **Step 5.3: regression 確認**

Run: `npm run test:unit`
Expected: 223 passed (no usecase regression).

Run: `npx playwright test tests/e2e/usecase-uc-01-new-system.spec.js --workers=1 --reporter=list 2>&1 | tail -10`
Expected: 5 passed.

Run all 6 usecase E2E with single worker:
```bash
npx playwright test tests/e2e/usecase-uc-*.spec.js --workers=1 --reporter=list 2>&1 | tail -10
```
Expected: 25 passed.

- [ ] **Step 5.4: Commit**

```bash
git add src/modules/usecase.js
git commit -m "refactor(usecase): delegate to core/dsl-updater + props-renderer

- dsl ops: insertBeforeEnd / moveLineUp/Down / renameWithRefs
- renderProps now uses propsRenderer.renderByDispatch with 4 callbacks
- ~50 lines removed
- regression: 25 E2E + 30 unit tests pass"
```

---

## Phase B — Component MVP

### Task 6: component.js skeleton + parser elements (component / interface)

**Files:**
- Create: `src/modules/component.js`
- Create: `tests/component-parser.test.js`
- Modify: `tests/run-tests.js`, `plantuml-assist.html`

- [ ] **Step 6.1: failing test**

Create `tests/component-parser.test.js`:

```javascript
'use strict';
require('../src/core/dsl-utils.js');
require('../src/core/regex-parts.js');
require('../src/core/parser-utils.js');
require('../src/core/text-updater.js');
require('../src/modules/component.js');

var co = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlComponent);

describe('parseComponent component element', function() {
  test('parses bare component', function() {
    var r = co.parse('@startuml\ncomponent WebApp\n@enduml');
    expect(r.elements[0].kind).toBe('component');
    expect(r.elements[0].id).toBe('WebApp');
  });
  test('parses component with quoted label and as alias', function() {
    var r = co.parse('@startuml\ncomponent "Web App" as WebApp\n@enduml');
    expect(r.elements[0].id).toBe('WebApp');
    expect(r.elements[0].label).toBe('Web App');
  });
  test('parses [X] short form', function() {
    var r = co.parse('@startuml\n[WebApp]\n@enduml');
    expect(r.elements[0].kind).toBe('component');
    expect(r.elements[0].id).toBe('WebApp');
  });
  test('parses [Label] as Alias', function() {
    var r = co.parse('@startuml\n[Web App] as WebApp\n@enduml');
    expect(r.elements[0].id).toBe('WebApp');
    expect(r.elements[0].label).toBe('Web App');
  });
});

describe('parseComponent interface element', function() {
  test('parses bare interface', function() {
    var r = co.parse('@startuml\ninterface IAuth\n@enduml');
    expect(r.elements[0].kind).toBe('interface');
    expect(r.elements[0].id).toBe('IAuth');
  });
  test('parses interface with quoted label as alias', function() {
    var r = co.parse('@startuml\ninterface "Authentication" as IAuth\n@enduml');
    expect(r.elements[0].id).toBe('IAuth');
    expect(r.elements[0].label).toBe('Authentication');
  });
  test('parses () X short form', function() {
    var r = co.parse('@startuml\n() IAuth\n@enduml');
    expect(r.elements[0].kind).toBe('interface');
    expect(r.elements[0].id).toBe('IAuth');
  });
});
```

- [ ] **Step 6.2: 実装作成**

Create `src/modules/component.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlComponent = (function() {
  var DU = window.MA.dslUtils;
  var RP = window.MA.regexParts;
  var ID = RP.IDENTIFIER;

  // component: keyword form (with capturing label group)
  var COMPONENT_KW_RE = new RegExp(
    '^component\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // component: [X] / [Label] as Alias
  var COMPONENT_SHORT_RE = /^\[([^\]]+)\](?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  // interface: keyword form
  var INTERFACE_KW_RE = new RegExp(
    '^interface\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // interface: () X / () X as I
  var INTERFACE_SHORT_RE = /^\(\)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      var m;
      // component keyword
      m = trimmed.match(COMPONENT_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'component', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: null });
        continue;
      }
      // component short [X]
      m = trimmed.match(COMPONENT_SHORT_RE);
      if (m) {
        var label = m[1].trim();
        var id = m[2] || label;
        result.elements.push({ kind: 'component', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: null });
        continue;
      }
      // interface keyword
      m = trimmed.match(INTERFACE_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'interface', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: null });
        continue;
      }
      // interface short () X
      m = trimmed.match(INTERFACE_SHORT_RE);
      if (m) {
        var label = m[1].trim();
        var id = m[2] || label;
        result.elements.push({ kind: 'interface', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: null });
        continue;
      }
    }
    return result;
  }

  return {
    type: 'plantuml-component',
    displayName: 'Component',
    parse: parse,
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-component'; },
    template: function() {
      return [
        '@startuml',
        'title Sample Component',
        'component WebApp',
        'interface IAuth',
        '',
        'WebApp -() IAuth',
        '@enduml',
      ].join('\n');
    },
  };
})();
```

- [ ] **Step 6.3: 登録 + tests**

Edit `tests/run-tests.js` — add `'src/modules/component.js'` after `'src/modules/usecase.js'`.

Edit `plantuml-assist.html` — add `<script src="src/modules/component.js">` after `usecase.js`.

Run: `npm run test:unit`
Expected: 223 + 7 = 230 passed.

- [ ] **Step 6.4: Commit**

```bash
git status --short
git add src/modules/component.js tests/component-parser.test.js tests/run-tests.js plantuml-assist.html
git commit -m "feat(component): parser skeleton + component/interface element parsing

- IIFE on window.MA.modules.plantumlComponent, DiagramModule v2 shape
- 4 element variants: component keyword/short, interface keyword/short
- 7 unit tests pass"
```

---

### Task 7: Parser package (delegate UseCase pattern) + parentPackageId

**Files:** Modify `src/modules/component.js`, `tests/component-parser.test.js`

- [ ] **Step 7.1: failing tests を append**

Append to `tests/component-parser.test.js`:

```javascript
describe('parseComponent package', function() {
  test('parses single package with quoted label', function() {
    var r = co.parse('@startuml\npackage "Backend" {\ncomponent WebApp\n}\n@enduml');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('package');
    expect(r.groups[0].label).toBe('Backend');
    expect(r.groups[0].startLine).toBe(2);
    expect(r.groups[0].endLine).toBe(4);
  });
  test('assigns parentPackageId to elements inside package', function() {
    var r = co.parse('@startuml\npackage "Backend" {\ncomponent WebApp\n}\n@enduml');
    var c = r.elements.find(function(e) { return e.kind === 'component'; });
    expect(c.parentPackageId).toBe(r.groups[0].id);
  });
  test('folder/frame/node/rectangle all normalize to package kind', function() {
    var r1 = co.parse('@startuml\nfolder "F" {\ncomponent A\n}\n@enduml');
    var r2 = co.parse('@startuml\nframe "Fr" {\ncomponent B\n}\n@enduml');
    var r3 = co.parse('@startuml\nnode "N" {\ncomponent C\n}\n@enduml');
    var r4 = co.parse('@startuml\nrectangle "R" {\ncomponent D\n}\n@enduml');
    expect(r1.groups[0].kind).toBe('package');
    expect(r2.groups[0].kind).toBe('package');
    expect(r3.groups[0].kind).toBe('package');
    expect(r4.groups[0].kind).toBe('package');
  });
});
```

- [ ] **Step 7.2: 実装追加**

In `src/modules/component.js`, after the existing regex constants, add:

```javascript
  var PACKAGE_OPEN_RE = new RegExp(
    '^(?:package|folder|frame|node|rectangle)\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );
  var PACKAGE_CLOSE_RE = /^\s*\}\s*$/;
```

In the `parse()` function, before the for loop add:

```javascript
    var packageStack = [];
    var packageCounter = 0;
```

Inside the for loop, after the title check and before the component/interface parsing, add:

```javascript
      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var label = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var parent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', id: pkgId, label: label, startLine: lineNum, endLine: 0, parentId: parent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }
      if (PACKAGE_CLOSE_RE.test(lines[i])) {
        if (packageStack.length > 0) {
          var closing = packageStack.pop();
          closing.endLine = lineNum;
        }
        continue;
      }

      var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
```

In all 4 element pushes, change `parentPackageId: null` to `parentPackageId: currentPackageId`.

- [ ] **Step 7.3: tests pass**

Run: `npm run test:unit`
Expected: 230 + 3 = 233 passed.

- [ ] **Step 7.4: Commit**

```bash
git add src/modules/component.js tests/component-parser.test.js
git commit -m "feat(component): parse package + parentPackageId (folder/frame/node/rectangle aliases)

- packageStack tracks nesting
- 5 boundary keywords accepted, normalized to kind: 'package'
- 3 new unit tests pass"
```

---

### Task 8: Parser port + parentComponentId

**Files:** Modify `src/modules/component.js`, `tests/component-parser.test.js`

- [ ] **Step 8.1: failing tests append**

```javascript
describe('parseComponent port', function() {
  test('parses port directly after component', function() {
    var r = co.parse('@startuml\ncomponent WebApp\nport p1\n@enduml');
    var port = r.elements.find(function(e) { return e.kind === 'port'; });
    expect(port).toBeDefined();
    expect(port.id).toBe('p1');
    expect(port.parentComponentId).toBe('WebApp');
  });
  test('parses port with quoted label as alias', function() {
    var r = co.parse('@startuml\ncomponent WebApp\nport "Port One" as p1\n@enduml');
    var port = r.elements.find(function(e) { return e.kind === 'port'; });
    expect(port.label).toBe('Port One');
    expect(port.id).toBe('p1');
  });
  test('port not preceded by component has parentComponentId null', function() {
    var r = co.parse('@startuml\nport orphan\n@enduml');
    var port = r.elements[0];
    expect(port.kind).toBe('port');
    expect(port.parentComponentId).toBe(null);
  });
});
```

- [ ] **Step 8.2: 実装追加**

In `src/modules/component.js`:

```javascript
  var PORT_KW_RE = new RegExp(
    '^port\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
```

In `parse()` for loop, track `lastComponentId`:

Initialize before the for loop:
```javascript
    var lastComponentId = null;
```

When component is parsed (both keyword + short forms), set `lastComponentId = id;` after the push.

Add port parsing after interface parsing:
```javascript
      m = trimmed.match(PORT_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({
          kind: 'port', id: id, label: label,
          parentComponentId: lastComponentId,
          line: lineNum, parentPackageId: currentPackageId
        });
        continue;
      }
```

When ANY non-port element is parsed, reset `lastComponentId = null` (port is only valid directly after component).

Actually safer: track `lastComponentId` set ONLY by component parses, and other elements DON'T reset it. But spec says "port directly after component" — for v0.4.0 take the strict interpretation: reset lastComponentId on ANY non-port element.

```javascript
// After interface push (and other non-port pushes), reset:
lastComponentId = null;
```

For component push, set:
```javascript
lastComponentId = id;
```

- [ ] **Step 8.3: tests pass**

Run: `npm run test:unit`
Expected: 233 + 3 = 236 passed.

- [ ] **Step 8.4: Commit**

```bash
git add src/modules/component.js tests/component-parser.test.js
git commit -m "feat(component): parse port + parentComponentId

- port valid directly after component (strict adjacency)
- 3 new unit tests pass"
```

---

### Task 9: Parser relations (4 kinds: association/dependency/provides/requires)

**Files:** Modify `src/modules/component.js`, `tests/component-parser.test.js`

- [ ] **Step 9.1: failing tests append**

```javascript
describe('parseComponent relations', function() {
  test('parses association --', function() {
    var r = co.parse('@startuml\nA -- B\n@enduml');
    expect(r.relations[0].kind).toBe('association');
    expect(r.relations[0].arrow).toBe('--');
  });
  test('parses dependency ..>', function() {
    var r = co.parse('@startuml\nA ..> B\n@enduml');
    expect(r.relations[0].kind).toBe('dependency');
    expect(r.relations[0].arrow).toBe('..>');
  });
  test('parses lollipop provides component -() interface', function() {
    var r = co.parse('@startuml\nWebApp -() IAuth\n@enduml');
    expect(r.relations[0].kind).toBe('provides');
    expect(r.relations[0].from).toBe('WebApp');
    expect(r.relations[0].to).toBe('IAuth');
  });
  test('parses lollipop provides reverse interface ()- component', function() {
    var r = co.parse('@startuml\nIAuth ()- WebApp\n@enduml');
    expect(r.relations[0].kind).toBe('provides');
    // canonicalized to component -> interface direction
    expect(r.relations[0].from).toBe('WebApp');
    expect(r.relations[0].to).toBe('IAuth');
  });
  test('parses lollipop requires interface )- component', function() {
    var r = co.parse('@startuml\nIAuth )- WebApp\n@enduml');
    expect(r.relations[0].kind).toBe('requires');
    expect(r.relations[0].from).toBe('IAuth');
    expect(r.relations[0].to).toBe('WebApp');
  });
});
```

- [ ] **Step 9.2: 実装追加**

In `src/modules/component.js`:

```javascript
  var RELATION_RE = new RegExp(
    '^(' + ID + '|"[^"]+")\\s+(-\\(\\)|\\(\\)-|\\)-|-\\(|\\.\\.>|<\\.\\.|-->|<--|--|<-|->)\\s+(' + ID + '|"[^"]+")(?:\\s*:\\s*(.+))?$'
  );
```

In parse() for loop, after port parsing:

```javascript
      m = trimmed.match(RELATION_RE);
      if (m) {
        var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
        var from = DU.unquote(fromRaw);
        var to = DU.unquote(toRaw);
        var kind = 'association';

        if (arrow === '-()') {
          kind = 'provides';  // component -() interface
        } else if (arrow === '()-') {
          kind = 'provides';
          // canonicalize to component -> interface
          var tmp = from; from = to; to = tmp; arrow = '-()';
        } else if (arrow === ')-') {
          kind = 'requires';  // interface )- component
        } else if (arrow === '-(') {
          kind = 'requires';
          var tmp2 = from; from = to; to = tmp2; arrow = ')-';
        } else if (arrow === '..>' || arrow === '.>') {
          kind = 'dependency';
        } else if (arrow === '<..') {
          kind = 'dependency';
          var tmp3 = from; from = to; to = tmp3; arrow = '..>';
        }

        result.relations.push({
          id: '__r_' + result.relations.length,
          kind: kind, from: from, to: to, arrow: arrow, label: lbl, line: lineNum,
        });
        continue;
      }
```

- [ ] **Step 9.3: tests pass**

Run: `npm run test:unit`
Expected: 236 + 5 = 241 passed.

- [ ] **Step 9.4: Commit**

```bash
git add src/modules/component.js tests/component-parser.test.js
git commit -m "feat(component): parse 4 relation kinds (assoc/dep/provides/requires)

- lollipop -() / ()- / )- / -( all accepted, canonicalized
- provides direction: component -> interface; requires: interface -> component
- 5 new unit tests pass"
```

---

### Task 10: Formatters + add operations

**Files:** Modify `src/modules/component.js`, Create `tests/component-updater.test.js`

- [ ] **Step 10.1: failing tests を新ファイルに**

Create `tests/component-updater.test.js`:

```javascript
'use strict';
require('../src/core/dsl-utils.js');
require('../src/core/regex-parts.js');
require('../src/core/parser-utils.js');
require('../src/core/text-updater.js');
require('../src/core/dsl-updater.js');
require('../src/modules/component.js');

var co = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlComponent);

describe('component formatters', function() {
  test('fmtComponent label==id', function() {
    expect(co.fmtComponent('WebApp', 'WebApp')).toBe('component WebApp');
  });
  test('fmtComponent label!=id', function() {
    expect(co.fmtComponent('WA', 'Web App')).toBe('component "Web App" as WA');
  });
  test('fmtInterface label==id', function() {
    expect(co.fmtInterface('IAuth', 'IAuth')).toBe('interface IAuth');
  });
  test('fmtInterface label!=id', function() {
    expect(co.fmtInterface('I1', 'Authentication')).toBe('interface "Authentication" as I1');
  });
  test('fmtPort', function() {
    expect(co.fmtPort('p1', 'p1')).toBe('port p1');
    expect(co.fmtPort('p1', 'Port One')).toBe('port "Port One" as p1');
  });
  test('fmtPackage always quotes', function() {
    expect(co.fmtPackage('Backend')).toBe('package "Backend" {');
  });
  test('fmtRelation association', function() {
    expect(co.fmtRelation('association', 'A', 'B')).toBe('A -- B');
    expect(co.fmtRelation('association', 'A', 'B', 'data')).toBe('A -- B : data');
  });
  test('fmtRelation dependency', function() {
    expect(co.fmtRelation('dependency', 'A', 'B')).toBe('A ..> B');
  });
  test('fmtRelation provides (lollipop)', function() {
    expect(co.fmtRelation('provides', 'WebApp', 'IAuth')).toBe('WebApp -() IAuth');
  });
  test('fmtRelation requires (lollipop)', function() {
    expect(co.fmtRelation('requires', 'IAuth', 'WebApp')).toBe('IAuth )- WebApp');
  });
});

describe('component add operations', function() {
  var TEMPLATE = '@startuml\ntitle T\ncomponent W\n@enduml';

  test('addComponent appends', function() {
    var out = co.addComponent(TEMPLATE, 'DB', 'DB');
    expect(out).toContain('component DB');
  });
  test('addInterface appends', function() {
    var out = co.addInterface(TEMPLATE, 'IAuth', 'Authentication');
    expect(out).toContain('interface "Authentication" as IAuth');
  });
  test('addPort appends', function() {
    var out = co.addPort(TEMPLATE, 'p1', 'p1');
    expect(out).toContain('port p1');
  });
  test('addPackage appends open + close', function() {
    var out = co.addPackage(TEMPLATE, 'Backend');
    expect(out).toContain('package "Backend" {');
    expect(out).toContain('}');
  });
  test('addRelation provides', function() {
    var out = co.addRelation(TEMPLATE, 'provides', 'W', 'IAuth');
    expect(out).toContain('W -() IAuth');
  });
});
```

- [ ] **Step 10.2: 実装追加**

In `src/modules/component.js`, after regex constants:

```javascript
  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  // Formatters (ADR-106)
  function fmtComponent(id, label) {
    if (label && label !== id) return 'component "' + label + '" as ' + id;
    return 'component ' + id;
  }
  function fmtInterface(id, label) {
    if (label && label !== id) return 'interface "' + label + '" as ' + id;
    return 'interface ' + id;
  }
  function fmtPort(id, label) {
    if (label && label !== id) return 'port "' + label + '" as ' + id;
    return 'port ' + id;
  }
  function fmtPackage(label) {
    return 'package "' + label + '" {';
  }
  function fmtRelation(kind, from, to, label) {
    var lbl = label || '';
    if (kind === 'dependency') return from + ' ..> ' + to + (lbl ? ' : ' + lbl : '');
    if (kind === 'provides') return from + ' -() ' + to;
    if (kind === 'requires') return from + ' )- ' + to;
    // association (default)
    return from + ' -- ' + to + (lbl ? ' : ' + lbl : '');
  }

  function addComponent(text, id, label) { return insertBeforeEnd(text, fmtComponent(id, label || id)); }
  function addInterface(text, id, label) { return insertBeforeEnd(text, fmtInterface(id, label || id)); }
  function addPort(text, id, label) { return insertBeforeEnd(text, fmtPort(id, label || id)); }
  function addPackage(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtPackage(label)), '}');
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }
```

In the IIFE return, add all 10 functions (5 fmt + 5 add).

- [ ] **Step 10.3: tests pass**

Run: `npm run test:unit`
Expected: 241 + 15 = 256 passed.

- [ ] **Step 10.4: Commit**

```bash
git add src/modules/component.js tests/component-updater.test.js
git commit -m "feat(component): formatters + add operations (fmt* + add*)

- 5 formatters per ADR-106 canonical
- 5 add ops via insertBeforeEnd (delegated to dsl-updater)
- 15 unit tests pass"
```

---

### Task 11: Update + delete + line ops + renameWithRefs (delegate to core)

**Files:** Modify `src/modules/component.js`, `tests/component-updater.test.js`

- [ ] **Step 11.1: failing tests append**

```javascript
describe('component update operations', function() {
  test('updateComponent changes label', function() {
    var t = '@startuml\ncomponent W\n@enduml';
    var out = co.updateComponent(t, 2, 'label', 'Web App');
    expect(out).toContain('component "Web App" as W');
  });
  test('updateInterface changes id', function() {
    var t = '@startuml\ninterface IAuth\n@enduml';
    var out = co.updateInterface(t, 2, 'id', 'IA');
    expect(out).toContain('interface IA');
  });
  test('updateRelation changes kind from association to dependency', function() {
    var t = '@startuml\nA -- B\n@enduml';
    var out = co.updateRelation(t, 2, 'kind', 'dependency');
    expect(out).toContain('A ..> B');
  });
  test('updateRelation changes association to provides (lollipop)', function() {
    var t = '@startuml\nA -- B\n@enduml';
    var out = co.updateRelation(t, 2, 'kind', 'provides');
    expect(out).toContain('A -() B');
  });
});

describe('component line operations', function() {
  test('deleteLine works', function() {
    var t = '@startuml\nA\nB\n@enduml';
    var out = co.deleteLine(t, 3);
    expect(out).not.toContain('B');
  });
  test('moveLineUp delegates to core', function() {
    var t = '@startuml\nA\nB\n@enduml';
    var out = co.moveLineUp(t, 3);
    expect(out.split('\n')[1]).toBe('B');
  });
  test('setTitle works', function() {
    var t = '@startuml\ncomponent A\n@enduml';
    var out = co.setTitle(t, 'My Component');
    expect(out).toContain('title My Component');
  });
});

describe('component renameWithRefs', function() {
  test('renames component and updates relation', function() {
    var t = '@startuml\ncomponent W\ninterface I\nW -() I\n@enduml';
    var out = co.renameWithRefs(t, 'W', 'WebApp');
    expect(out).toContain('component WebApp');
    expect(out).toContain('WebApp -() I');
  });
});
```

- [ ] **Step 11.2: 実装追加**

In `src/modules/component.js`:

```javascript
  function updateComponent(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(COMPONENT_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(COMPONENT_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtComponent(id, label);
    return lines.join('\n');
  }

  function updateInterface(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(INTERFACE_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(INTERFACE_SHORT_RE);
      if (!sm) return text;
      id = sm[1].trim(); label = sm[2] || id;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtInterface(id, label);
    return lines.join('\n');
  }

  function updateRelation(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var m = trimmed.match(RELATION_RE);
    if (!m) return text;
    var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
    var from = DU.unquote(fromRaw), to = DU.unquote(toRaw);
    var kind = 'association';
    if (arrow === '-()' || arrow === '()-') kind = 'provides';
    else if (arrow === ')-' || arrow === '-(') kind = 'requires';
    else if (arrow === '..>' || arrow === '<..' || arrow === '.>') kind = 'dependency';

    if (field === 'kind') kind = value;
    else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') lbl = value;

    lines[idx] = indent + fmtRelation(kind, from, to, lbl);
    return lines.join('\n');
  }

  // Delegate line ops to core
  function deleteLine(text, lineNum) { return window.MA.textUpdater.deleteLine(text, lineNum); }
  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

  function setTitle(text, newTitle) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+/.test(lines[i])) {
        var indent = lines[i].match(/^(\s*)/)[1];
        lines[i] = indent + 'title ' + newTitle;
        return lines.join('\n');
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (RP.isStartUml(lines[j])) {
        lines.splice(j + 1, 0, 'title ' + newTitle);
        return lines.join('\n');
      }
    }
    return text;
  }
```

In IIFE return, add: updateComponent, updateInterface, updateRelation, deleteLine, moveLineUp, moveLineDown, setTitle, renameWithRefs.

- [ ] **Step 11.3: tests pass**

Run: `npm run test:unit`
Expected: 256 + 8 = 264 passed.

- [ ] **Step 11.4: Commit**

```bash
git add src/modules/component.js tests/component-updater.test.js
git commit -m "feat(component): update + delete + line ops + rename (delegate to core)

- updateComponent / updateInterface / updateRelation
- deleteLine / moveLineUp/Down / setTitle / renameWithRefs (delegate)
- 8 unit tests pass"
```

---

### Task 12: detectDiagramType extension + module registration

**Files:** Modify `src/core/parser-utils.js`, `tests/parser-utils.test.js`, `plantuml-assist.html`

- [ ] **Step 12.1: parser-utils test を追加**

Append to `tests/parser-utils.test.js` (inside existing describe):

```javascript
  test('detects component from component keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\ncomponent WebApp\n@enduml')).toBe('plantuml-component');
  });
  test('detects component from [X] short form', function() {
    expect(parserUtils.detectDiagramType('@startuml\n[A] -- [B]\n@enduml')).toBe('plantuml-component');
  });
  test('does not confuse [*] with [X] (state vs component)', function() {
    expect(parserUtils.detectDiagramType('@startuml\n[*] --> Idle\nstate Idle\n@enduml')).toBe('plantuml-state');
  });
```

- [ ] **Step 12.2: parser-utils.js を更新**

Current detectDiagramType already detects component via `/^\[[^\]]+\]/` and `/^component\b/`. Verify the [*] case is handled correctly: `/^state\b|^\[\*\]/.test(t)` → state takes priority via the priority chain.

The component bracket regex `/^\[[^\]*][^\]]*\]/` should NOT match `[*]`. Verify this. If it accidentally matches, fix to:

```javascript
if (/^\[[^\]]+\]/.test(t) && !/^\[\*\]/.test(t)) hasComponentBracket = true;
```

Actually checking the existing parser-utils.js Sprint 0 fix, the regex is `/^\[[^\]*][^\]]*\]/` which means "first char inside brackets is NOT `]` and NOT `*`, followed by zero+ non-`]` chars". This already excludes `[*]`. Good.

In priority chain ensure: `if (hasStateKw)` precedes `if (hasComponentKw || hasComponentBracket)`. Already the case.

- [ ] **Step 12.3: HTML diagram-type select + script tag**

Edit `plantuml-assist.html`:

```html
<select id="diagram-type" title="図の種類">
  <option value="plantuml-sequence">Sequence</option>
  <option value="plantuml-usecase">UseCase</option>
  <option value="plantuml-component">Component</option>
</select>
```

Verify `<script src="src/modules/component.js">` is already added (Task 6 Step 6.3).

- [ ] **Step 12.4: tests pass**

Run: `npm run test:unit`
Expected: 264 + 3 = 267 passed.

- [ ] **Step 12.5: Commit**

```bash
git status --short
git add src/core/parser-utils.js tests/parser-utils.test.js plantuml-assist.html
git commit -m "feat(parser-utils,html): detect plantuml-component + register option

- [*] state vs [X] component disambiguation verified
- diagram-type select exposes Component option
- 3 new parser-utils tests pass"
```

---

### Task 13: renderProps (no-selection + selection edit using dispatcher)

**Files:** Modify `src/modules/component.js`

- [ ] **Step 13.1: renderProps + private callbacks**

In `src/modules/component.js`, add:

```javascript
  function renderProps(selData, parsedData, propsEl, ctx) {
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(parsed, el) { _renderNoSelection(parsed, el, ctx); },
      onElement: function(elt, parsed, el) { _renderElementEdit(elt, parsed, el, ctx); },
      onRelation: function(rel, parsed, el) { _renderRelationEdit(rel, parsed, el, ctx); },
      onGroup: function(grp, parsed, el) { _renderGroupReadOnly(grp, parsed, el, ctx); },
    });
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var elements = parsedData.elements || [];
    var components = elements.filter(function(e) { return e.kind === 'component'; });
    var interfaces = elements.filter(function(e) { return e.kind === 'interface'; });
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
        P.fieldHtml('Title', 'co-title', parsedData.meta.title) +
        P.primaryButtonHtml('co-set-title', 'Title 適用') +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'co-tail-kind', [
          { value: 'component', label: 'Component', selected: true },
          { value: 'interface', label: 'Interface' },
          { value: 'port',      label: 'Port' },
          { value: 'package',   label: 'Package境界' },
          { value: 'relation',  label: 'Relation (関係)' },
        ]) +
        '<div id="co-tail-detail" style="margin-top:6px;"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('co-set-title', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('co-title').value.trim()));
      ctx.onUpdate();
    });

    var renderTailDetail = function() {
      var kind = document.getElementById('co-tail-kind').value;
      var detailEl = document.getElementById('co-tail-detail');
      var compOpts = components.map(function(c) { return { value: c.id, label: c.label }; });
      var intfOpts = interfaces.map(function(i) { return { value: i.id, label: i.label }; });
      var allOpts = compOpts.concat(intfOpts);
      if (allOpts.length === 0) allOpts = [{ value: '', label: '（要素なし）' }];

      var html = '';
      if (kind === 'component') {
        html =
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: WebApp') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.primaryButtonHtml('co-tail-add', '+ Component 追加');
      } else if (kind === 'interface') {
        html =
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: IAuth') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.primaryButtonHtml('co-tail-add', '+ Interface 追加');
      } else if (kind === 'port') {
        html =
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: p1') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.primaryButtonHtml('co-tail-add', '+ Port 追加');
      } else if (kind === 'package') {
        html =
          P.fieldHtml('Label', 'co-tail-label', '', '例: Backend') +
          P.primaryButtonHtml('co-tail-add', '+ Package 追加');
      } else if (kind === 'relation') {
        html =
          P.selectFieldHtml('Kind', 'co-tail-rkind', [
            { value: 'association', label: 'Association (--)', selected: true },
            { value: 'dependency',  label: 'Dependency (..>)' },
            { value: 'provides',    label: 'Provides (lollipop -())' },
            { value: 'requires',    label: 'Requires (lollipop )-)' },
          ]) +
          P.selectFieldHtml('From', 'co-tail-from', allOpts) +
          P.selectFieldHtml('To', 'co-tail-to', allOpts) +
          P.fieldHtml('Label', 'co-tail-rlabel', '', 'association/dependency のみ任意') +
          P.primaryButtonHtml('co-tail-add', '+ Relation 追加');
      }
      detailEl.innerHTML = html;

      P.bindEvent('co-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var out = t;
        if (kind === 'component') {
          var al = document.getElementById('co-tail-alias').value.trim();
          if (!al) { alert('Alias 必須'); return; }
          window.MA.history.pushHistory();
          out = addComponent(t, al, document.getElementById('co-tail-label').value.trim() || al);
        } else if (kind === 'interface') {
          var al2 = document.getElementById('co-tail-alias').value.trim();
          if (!al2) { alert('Alias 必須'); return; }
          window.MA.history.pushHistory();
          out = addInterface(t, al2, document.getElementById('co-tail-label').value.trim() || al2);
        } else if (kind === 'port') {
          var al3 = document.getElementById('co-tail-alias').value.trim();
          if (!al3) { alert('Alias 必須'); return; }
          window.MA.history.pushHistory();
          out = addPort(t, al3, document.getElementById('co-tail-label').value.trim() || al3);
        } else if (kind === 'package') {
          var lbl = document.getElementById('co-tail-label').value.trim();
          if (!lbl) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          out = addPackage(t, lbl);
        } else if (kind === 'relation') {
          var fr = document.getElementById('co-tail-from').value;
          var to = document.getElementById('co-tail-to').value;
          if (!fr || !to) { alert('From/To 必須'); return; }
          var rkind = document.getElementById('co-tail-rkind').value;
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, fr, to, document.getElementById('co-tail-rlabel').value.trim());
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('co-tail-kind').addEventListener('change', renderTailDetail);
    renderTailDetail();
  }

  function _renderElementEdit(element, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' + element.kind.toUpperCase() + ' (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'co-edit-id', element.id) +
        P.fieldHtml('Label', 'co-edit-label', element.label) +
        P.primaryButtonHtml('co-edit-apply', '変更を反映') +
        '<div style="margin-top:6px;">' +
          P.primaryButtonHtml('co-rename-refs', 'Alias 変更を関連 Relation にも追従') +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
          '<button id="co-move-up" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
          '<button id="co-move-down" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
          '<button id="co-delete" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('co-edit-apply', 'click', function() {
      var newId = document.getElementById('co-edit-id').value.trim();
      var newLabel = document.getElementById('co-edit-label').value.trim();
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var fn = element.kind === 'component' ? updateComponent
             : element.kind === 'interface' ? updateInterface
             : null;
      if (fn) {
        if (newId !== element.id) t = fn(t, element.line, 'id', newId);
        if (newLabel !== element.label) t = fn(t, element.line, 'label', newLabel);
      }
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('co-rename-refs', 'click', function() {
      var newId = document.getElementById('co-edit-id').value.trim();
      if (!newId || newId === element.id) { alert('Alias を変更してから実行してください'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(renameWithRefs(ctx.getMmdText(), element.id, newId));
      ctx.onUpdate();
    });
    P.bindEvent('co-move-up', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineUp(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('co-move-down', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineDown(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('co-delete', 'click', function() {
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), element.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderRelationEdit(relation, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
        P.selectFieldHtml('Kind', 'co-rel-kind', [
          { value: 'association', label: 'Association (--)', selected: relation.kind === 'association' },
          { value: 'dependency',  label: 'Dependency (..>)', selected: relation.kind === 'dependency' },
          { value: 'provides',    label: 'Provides (-())', selected: relation.kind === 'provides' },
          { value: 'requires',    label: 'Requires ()-)', selected: relation.kind === 'requires' },
        ]) +
        P.fieldHtml('From', 'co-rel-from', relation.from) +
        P.fieldHtml('To', 'co-rel-to', relation.to) +
        P.fieldHtml('Label', 'co-rel-label', relation.label) +
        P.primaryButtonHtml('co-rel-apply', '変更を反映') +
        '<div style="margin-top:8px;">' +
          '<button id="co-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('co-rel-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newKind = document.getElementById('co-rel-kind').value;
      var newFrom = document.getElementById('co-rel-from').value.trim();
      var newTo = document.getElementById('co-rel-to').value.trim();
      var newLabel = document.getElementById('co-rel-label').value.trim();
      if (newKind !== relation.kind) t = updateRelation(t, relation.line, 'kind', newKind);
      if (newFrom !== relation.from) t = updateRelation(t, relation.line, 'from', newFrom);
      if (newTo !== relation.to) t = updateRelation(t, relation.line, 'to', newTo);
      if (newLabel !== relation.label) t = updateRelation(t, relation.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('co-delete', 'click', function() {
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), relation.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderGroupReadOnly(group, parsedData, propsEl, ctx) {
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">PACKAGE (L' + group.startLine + '-' + group.endLine + ')</label>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Label: ' + group.label + '</div>' +
        '<div style="font-size:10px;color:var(--text-secondary);">v0.4.0: package ラベル変更 / 範囲指定 wrap は v0.5.0 で対応</div>' +
      '</div>';
    propsEl.innerHTML = html;
  }
```

Add to IIFE return:

```javascript
    renderProps: renderProps,
    buildOverlay: function() { /* v0.4.0 では overlay なし */ },
```

- [ ] **Step 13.2: 動作確認 + Commit**

Run: `npm run test:unit`
Expected: 267 passed (renderProps is browser-only, no regression).

```bash
git add src/modules/component.js
git commit -m "feat(component): renderProps via propsRenderer.renderByDispatch

- 4 callbacks: onNoSelection / onElement / onRelation / onGroup
- 5-kind tail-add (component/interface/port/package/relation)
- selection edit with rename/move/delete
- delegates layout dispatch to core/props-renderer"
```

---

### Task 14-19: E2E UC-1 〜 UC-6

Pattern matches UseCase E2E specs. Each UC file has α + γ describe blocks. Below are concise specs — full code in plan but compressed for brevity.

#### Task 14: E2E UC-1 (新規)

Create `tests/e2e/component-uc-01-new-system.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-1: 新規 (システムブロック構成の初期描画)', () => {
  test.describe('α: DSL technical', () => {
    test('switching to Component loads template', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component WebApp');
      expect(t).toContain('interface IAuth');
    });
    test('add component emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('component');
      await page.locator('#co-tail-alias').fill('DB');
      await page.locator('#co-tail-label').fill('Database');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component "Database" as DB');
    });
    test('add interface and association', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('interface');
      await page.locator('#co-tail-alias').fill('ILog');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('association');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('ILog');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('interface ILog');
      expect(t).toContain('WebApp -- ILog');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('user can complete new-system flow in <5 ops', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('component');
      await page.locator('#co-tail-alias').fill('Cache');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('Cache');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component Cache');
      expect(t).toContain('WebApp -- Cache');
    });
    test('console error count is 0', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('component');
      await page.locator('#co-tail-alias').fill('X');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
```

Run + commit:
```bash
npx playwright test tests/e2e/component-uc-01-new-system.spec.js --workers=1 --reporter=list 2>&1 | tail -10
git add tests/e2e/component-uc-01-new-system.spec.js
git commit -m "test(component): UC-1 E2E spec (新規 / α + γ blocks, 5 tests)"
```

#### Task 15: E2E UC-2 (仕様変更 / package 内追加)

Create `tests/e2e/component-uc-02-spec-change.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-2: 仕様変更 (新規 component を package 内に追加)', () => {
  test.describe('α: DSL technical', () => {
    test('parser assigns parentPackageId', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\npackage "Backend" {\ncomponent W\n}\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var parentId = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var p = window.MA.modules.plantumlComponent.parse(t);
        return p.elements[0].parentPackageId;
      });
      expect(parentId).toBeTruthy();
    });
    test('addPackage emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('package');
      await page.locator('#co-tail-label').fill('Frontend');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('package "Frontend" {');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('user can add package in single op', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('package');
      await page.locator('#co-tail-label').fill('Auth');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('package "Auth"');
    });
    test('package open and close paired', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('package');
      await page.locator('#co-tail-label').fill('X');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      var lines = t.split('\n');
      var openIdx = lines.findIndex(function(l) { return l.includes('package "X"'); });
      var closeIdx = lines.findIndex(function(l, i) { return i > openIdx && l.trim() === '}'; });
      expect(closeIdx).toBeGreaterThan(openIdx);
    });
  });
});
```

Run + commit:
```bash
git add tests/e2e/component-uc-02-spec-change.spec.js
git commit -m "test(component): UC-2 E2E spec (package boundary, 4 tests)"
```

#### Task 16: E2E UC-3 (不具合対応 / dependency)

Create `tests/e2e/component-uc-03-bug-fix-dep.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-3: 不具合対応 (dependency 追記)', () => {
  test.describe('α: DSL technical', () => {
    test('addRelation dependency emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('dependency');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('IAuth');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('WebApp ..> IAuth');
    });
    test('parser distinguishes association vs dependency', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\nA -- B\nC ..> D\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var kinds = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.parse(t).relations.map(function(r) { return r.kind; });
      });
      expect(kinds).toContain('association');
      expect(kinds).toContain('dependency');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('relation kind selector exposes both options', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      var options = await page.locator('#co-tail-rkind option').allTextContents();
      expect(options.some(function(o) { return o.includes('Association'); })).toBe(true);
      expect(options.some(function(o) { return o.includes('Dependency'); })).toBe(true);
    });
    test('post-add kind change works via updateRelation API', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\nA -- B\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.updateRelation(t, 2, 'kind', 'dependency');
      });
      expect(newT).toContain('A ..> B');
    });
  });
});
```

Commit:
```bash
git add tests/e2e/component-uc-03-bug-fix-dep.spec.js
git commit -m "test(component): UC-3 E2E spec (dependency, 4 tests)"
```

#### Task 17: E2E UC-4 (レビュー指摘 / lollipop)

Create `tests/e2e/component-uc-04-review-lollipop.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-4: レビュー指摘 (lollipop で interface を明示)', () => {
  test.describe('α: DSL technical', () => {
    test('addRelation provides emits canonical -()', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('provides');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('IAuth');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('WebApp -() IAuth');
    });
    test('addRelation requires emits canonical )-', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('requires');
      await page.locator('#co-tail-from').selectOption('IAuth');
      await page.locator('#co-tail-to').selectOption('WebApp');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('IAuth )- WebApp');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('lollipop options visible in kind selector', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      var options = await page.locator('#co-tail-rkind option').allTextContents();
      expect(options.some(function(o) { return o.includes('Provides'); })).toBe(true);
      expect(options.some(function(o) { return o.includes('Requires'); })).toBe(true);
    });
    test('parser canonicalizes reverse forms', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\nIAuth ()- WebApp\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var rel = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.parse(t).relations[0];
      });
      expect(rel.kind).toBe('provides');
      expect(rel.from).toBe('WebApp');
      expect(rel.to).toBe('IAuth');
    });
  });
});
```

Commit:
```bash
git add tests/e2e/component-uc-04-review-lollipop.spec.js
git commit -m "test(component): UC-4 E2E spec (lollipop provides/requires, 4 tests)"
```

#### Task 18: E2E UC-5 (横展開 / port 追加)

Create `tests/e2e/component-uc-05-deployment-port.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-5: 横展開 (ports を追加して詳細ブロック化)', () => {
  test.describe('α: DSL technical', () => {
    test('addPort emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('port');
      await page.locator('#co-tail-alias').fill('p1');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('port p1');
    });
    test('parser links port parentComponentId', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\ncomponent W\nport p1\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var port = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var p = window.MA.modules.plantumlComponent.parse(t);
        return p.elements.find(function(e) { return e.kind === 'port'; });
      });
      expect(port.parentComponentId).toBe('W');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('port option visible in kind selector', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      var options = await page.locator('#co-tail-kind option').allTextContents();
      expect(options.some(function(o) { return o.includes('Port'); })).toBe(true);
    });
    test('multi-port workflow', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('port');
      await page.locator('#co-tail-alias').fill('p1');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind').selectOption('port');
      await page.locator('#co-tail-alias').fill('p2');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('port p1');
      expect(t).toContain('port p2');
    });
  });
});
```

Commit:
```bash
git add tests/e2e/component-uc-05-deployment-port.spec.js
git commit -m "test(component): UC-5 E2E spec (port, 4 tests)"
```

#### Task 19: E2E UC-6 (polish / rename)

Create `tests/e2e/component-uc-06-polish-rename.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-6: polish (component / interface id 命名見直し)', () => {
  test.describe('α: DSL technical', () => {
    test('renameWithRefs updates component and relation refs', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.renameWithRefs(t, 'WebApp', 'Web');
      });
      expect(newT).toContain('component Web');
      expect(newT).toContain('Web -() IAuth');
    });
    test('renameWithRefs preserves quoted labels', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\ncomponent "Web App" as W\ninterface IAuth\nW -() IAuth\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.renameWithRefs(t, 'W', 'WebApp');
      });
      expect(newT).toContain('"Web App"');
      expect(newT).toContain('as WebApp');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('selection panel exposes rename button', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        window.MA.selection.setSelected([{ type: 'component', id: 'WebApp', line: 3 }]);
      });
      await page.waitForTimeout(200);
      var hasRenameBtn = await page.locator('#co-rename-refs').count();
      expect(hasRenameBtn).toBeGreaterThan(0);
    });
    test('rename via Undo round-trip', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        window.MA.history.pushHistory();
        var t = document.getElementById('editor').value;
        var newT = window.MA.modules.plantumlComponent.renameWithRefs(t, 'WebApp', 'Web');
        var ed = document.getElementById('editor');
        ed.value = newT;
      });
      await page.waitForTimeout(200);
      var afterText = await getEditorText(page);
      expect(afterText).toContain('component Web');
      await page.evaluate(() => {
        if (window.MA.history && window.MA.history.undo) window.MA.history.undo();
      });
      await page.waitForTimeout(300);
      var undone = await getEditorText(page);
      expect(undone).toContain('component WebApp');
    });
  });
});
```

Commit:
```bash
git add tests/e2e/component-uc-06-polish-rename.spec.js
git commit -m "test(component): UC-6 E2E spec (renameWithRefs, 4 tests)"
```

---

### Task 20: README + CHANGELOG

**Files:** Modify `README.md`, `CHANGELOG.md`

- [ ] **Step 20.1: README に Component セクション追加**

After UseCase section, before "## 設計ドキュメント", add:

```markdown
## Component Diagram (v0.4.0)

PlantUML Component Diagram の form-based 編集に対応。システムブロック構成・モジュール依存・インターフェース表現の業務フローで使用。

### 対応 DSL 要素

- `component` (キーワード形式 / 短縮 `[X]`)
- `interface` (キーワード形式 / 短縮 `() X`)
- `port` (component 直後行に配置)
- `package "Label" { ... }` 境界 (`folder`/`frame`/`node`/`rectangle` も同義として受理)
- 4 種の関係:
  - association `A -- B` (label 任意)
  - dependency `A ..> B` (label 任意)
  - provides (lollipop) `component -() interface`
  - requires (lollipop) `interface )- component`

### Canonical 出力 (ADR-106)

GUI からの編集はすべて keyword-first canonical 形式で emit (例: `component "Web App" as WA`)。短縮記法 (`[X]` / `() X` / `folder/frame/node/rectangle`) は parser で受理しますが、保存時に正規化されます。

### サンプル DSL

\`\`\`plantuml
@startuml
title Sample Component
package "Backend" {
  component WebApp
  interface IAuth
}
WebApp -() IAuth
WebApp ..> Logger
@enduml
\`\`\`

### v0.4.0 制約 (v0.5.0 で対応予定)

- SVG 要素クリック選択 (overlay-driven UI)
- ドラッグで関係作成
- 既存要素を package に範囲指定で囲む
```

- [ ] **Step 20.2: CHANGELOG v0.4.0**

Prepend to `CHANGELOG.md`:

```markdown
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
- `src/core/parser-utils.js` `detectDiagramType` now distinguishes Component `[X]` from State `[*]`

### Notes
- v0.5.0 へ繰越: overlay-builder / selection-router 抽出, overlay-driven SVG selection, drag-to-connect, package range wrap

```

- [ ] **Step 20.3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README + CHANGELOG for v0.4.0 Component Diagram"
```

---

### Task 21: 最終 regression + Visual Verification

**Files:** none (verification only)

- [ ] **Step 21.1: 全 unit tests**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 全 PASS。Sprint 1 baseline (208) + dsl-updater (10) + props-renderer (5) + parser-utils (+3) + component-parser (~18) + component-updater (~23) ≈ **267 passed, 0 failed**

- [ ] **Step 21.2: 全 E2E**

```bash
npx playwright test --workers=1 --reporter=list 2>&1 | tail -25
```
Expected: 既存 sequence + usecase + 新 component で多数 PASS。pre-existing 3 failures (UC-6/7/8 sequence-side) は許容。

- [ ] **Step 21.3: Server + Evaluator dispatch**

```bash
# Start server with heartbeat keepalive (per Sprint 1 lesson)
python server.py &
sleep 2
curl -s -o /dev/null -w "HTTP_%{http_code}\n" http://127.0.0.1:8766/
# Heartbeat keepalive in parallel:
( while sleep 5; do curl -s -X POST -o /dev/null http://127.0.0.1:8766/heartbeat || break; done ) &
```

Dispatch evaluator subagent (controller side):

```
Agent(subagent_type=evaluator, prompt="
Project: 06_PlantUMLAssist
Branch: feat/tier1-component
Sprint: sprint-2 (Component v0.4.0 + S1.5)
Spec: docs/superpowers/specs/2026-04-25-component-design.md
Plan: docs/superpowers/plans/2026-04-25-component-v0.4.0.md
Dev server: http://127.0.0.1:8766/

Verify 12-cell α/γ matrix (UC-1〜UC-6 × DSL+workflow). Output: .eval/sprint-2/report.md.
PASS criteria: all 12 cells PASS, console error 0 (excl favicon).
Don't flag: WinError 10053 (pre-existing infra), Sequence/UseCase pre-existing E2E failures.
")
```

- [ ] **Step 21.4: PR description 草案 + 最終 commit (差分があれば)**

Create `.git/PR_DESCRIPTION.md`:

```markdown
## v0.4.0 — Component Diagram + S1.5

Spec: `docs/superpowers/specs/2026-04-25-component-design.md`
Plan: `docs/superpowers/plans/2026-04-25-component-v0.4.0.md`
ADR: `docs/adr/ADR-106-component-canonical-form.md`

### Summary
- Phase A: extracted `core/dsl-updater.js` + `core/props-renderer.js` (Rule of Three)
- Phase B: `src/modules/component.js` (~700 lines) Component DiagramModule v2
- 4 element kinds: component / interface / port / package boundary
- 4 relation kinds: association / dependency / provides (lollipop) / requires (lollipop)
- ADR-106: keyword-first canonical DSL form

### Test Plan
- [x] `npm run test:unit` — 267+ passed
- [x] `npx playwright test` — Component 25+ tests pass
- [x] Evaluator visual sweep — 12-cell α/γ all PASS, console error 0
- [x] No regression on Sprint 0/1 (sequence + usecase E2E)

### Out of Scope (v0.5.0 deferred)
- core/overlay-builder + core/selection-router 抽出
- Component overlay-driven SVG selection
- drag-to-connect (lollipop / port)
- package range wrap

### Acceptance
12-cell pass matrix (6 UCs × 2 axes) all PASS per `.eval/sprint-2/report.md`
```

```bash
git status --short
git log --oneline feat/tier1-component ^feat/tier1-usecase 2>&1 | head -25
```
Expected: 約 21 commits (Task 1 〜 Task 21).

---

## Self-Review

### Spec coverage

| Spec section | 対応 Task |
|---|---|
| 1.2 Phase A (S1.5) | Task 2 (dsl-updater), Task 3 (props-renderer), Task 4 (sequence refactor), Task 5 (usecase refactor) |
| 1.2 Phase B (Component MVP) | Task 6-13 |
| 2 UC × α/γ matrix | Task 14-19 (各 UC を 1 spec ファイル × 2 describe) |
| 3 Capability list (C1-C8) | Task 13 (UI), Task 11 (line ops + rename) |
| 4 データモデル | Task 6, 7, 8, 9 |
| 5 DSL coverage (parse/emit) | Task 6-11 |
| 6 S1.5 抽出方針 | Task 2-5 |
| 7 ADR-106 | Task 1 |
| 8 テスト戦略 | Task 2-11 (unit), 14-19 (E2E), 21 (visual sweep) |
| 9 受入基準 | Task 21 |
| 11 v0.5.0 繰越 | スコープ外として Section 1.3 + ADR-106 で明示 |

### Placeholder scan
- "TBD" / "TODO" / "implement later" — なし (検索済)
- "Add appropriate error handling" — なし
- "Similar to Task N" — なし (各 Task で完全 code 提供)

### Type consistency
- `parse()` return shape: meta/elements/relations/groups (Task 6+)
- `fmtComponent(id, label)`, `fmtInterface(id, label)`, `fmtPort(id, label)`, `fmtPackage(label)`, `fmtRelation(kind, from, to, label)` — 引数順 Task 10 で定義、Task 11 と Task 13 で同順序
- `addComponent(text, id, label)` etc — Task 10 で定義、Task 13 (renderProps) で同順序
- `updateComponent(text, lineNum, field, value)` — Task 11 で定義、Task 13 で同呼出
- `renameWithRefs(text, oldId, newId)` — Task 11 で delegate (core/dsl-updater)、Task 13 で呼出

### Scope check
v0.4.0 は Phase A (S1.5) + Phase B (Component MVP) を 1 sprint で扱う (master spec 通り)。1 plan で完結、依存関係 (Phase A → Phase B) は task 順序で表現。
