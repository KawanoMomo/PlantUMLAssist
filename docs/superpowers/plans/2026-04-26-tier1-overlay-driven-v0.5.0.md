# Tier1 Overlay-Driven v0.5.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UseCase + Component を overlay-driven 化し、`core/overlay-builder.js` + `core/selection-router.js` を抽出。同時に capability 契約を導入して app.js のハードコード比較を全廃。

**Architecture:** 3-Phase 構成 (Phase 0: capability契約 → Phase A: core抽出 → Phase B: UseCase+Component overlay化 → Phase C: docs)。各 phase の完了で `npm run test:all` GREEN を必須ゲート。

**Tech Stack:** Vanilla JavaScript ES5 (DiagramModule v2)、jsdom (unit)、Playwright (E2E)、PlantUML local/online render。

**Spec:** `docs/superpowers/specs/2026-04-26-tier1-overlay-driven-design.md`

**Base branch:** `feat/tier1-overlay-driven` (派生元: `feat/tier1-component`)

---

## File Structure

### 新規ファイル

| ファイル | 責務 |
|---|---|
| `src/core/overlay-builder.js` | 図形非依存な SVG/DOM プリミティブ (addRect, extractBBox, pickBestOffset, hitTestTopmost, dedupById) |
| `src/core/selection-router.js` | overlay-layer の click/shift+click/multi-toggle を window.MA.selection に変換、highlight 適用 |
| `tests/overlay-builder.test.js` | overlay-builder の 10 unit tests |
| `tests/selection-router.test.js` | selection-router の 8 unit tests |
| `tests/usecase-overlay.test.js` | usecase.buildOverlay の 6 unit tests |
| `tests/component-overlay.test.js` | component.buildOverlay の 6 unit tests |
| `tests/e2e/usecase-overlay.spec.js` | UseCase overlay-driven E2E (5 tests) |
| `tests/e2e/component-overlay.spec.js` | Component overlay-driven E2E (5 tests) |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/modules/sequence.js` | capabilities フラグ追加、buildOverlay を overlay-builder にdelegate |
| `src/modules/usecase.js` | capabilities フラグ追加、buildOverlay 実装、relation 編集 form、multi-select connect dispatcher |
| `src/modules/component.js` | capabilities フラグ追加、buildOverlay 実装 (port 階層含む)、relation 編集 form、multi-select connect dispatcher |
| `src/core/props-renderer.js` | dispatcher に `onMultiSelectConnect` case 追加 |
| `src/ui/sequence-overlay.js` | core/overlay-builder へ汎用部分移譲 (薄くなる) |
| `src/app.js` | `moduleHas(cap)` helper 追加、ハードコード比較全廃、selection-router を delegate |
| `plantuml-assist.html` | overlay rect 用 CSS (`.selectable`, `.selected` の visual styles) を追加 |
| `README.md` | v0.5.0 overlay-driven セクション追加 |
| `CHANGELOG.md` | v0.5.0 entry prepend |

---

## Phase 0: Capability 契約導入 (2 commits)

### Task 1: capabilities フラグを 3 module に追加

**Files:**
- Modify: `src/modules/sequence.js` (return オブジェクトに capabilities 追加)
- Modify: `src/modules/usecase.js` (同)
- Modify: `src/modules/component.js` (同)

- [ ] **Step 1.1: sequence.js に capabilities 追加**

`src/modules/sequence.js` の return オブジェクト末尾 (`buildOverlay` の前) に挿入:

```javascript
    capabilities: {
      overlaySelection: true,
      hoverInsert: true,
      participantDrag: true,
      showInsertForm: true,
      multiSelectConnect: false,
    },
```

- [ ] **Step 1.2: usecase.js に capabilities 追加**

`src/modules/usecase.js` の return オブジェクト末尾 (`buildOverlay` の前) に挿入:

```javascript
    capabilities: {
      overlaySelection: false,  // Phase B で true に切替
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,  // Phase B で true に切替
    },
```

- [ ] **Step 1.3: component.js に capabilities 追加**

usecase.js と同じ初期値で挿入。

- [ ] **Step 1.4: 自然言語 sanity check**

`src/app.js` で 3 module すべてが `currentModule.capabilities` を持つことを確認:

```bash
grep -n "capabilities:" src/modules/*.js
```
Expected: sequence.js, usecase.js, component.js それぞれ 1 件マッチ。

- [ ] **Step 1.5: Run unit tests**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 267 passed, 0 failed (フラグ追加だけなのでテストに影響なし)

- [ ] **Step 1.6: Commit**

```bash
git add src/modules/sequence.js src/modules/usecase.js src/modules/component.js
git commit -m "feat(modules): add capabilities flag (Phase 0)

DiagramModule v2 に capabilities フラグを追加 (master spec § 8.5)。
sequence のみ overlay/hover/drag/insertForm が true、UseCase/Component
は Phase B で順次 true 化する前提で全 false で開始。

5 capability flags: overlaySelection / hoverInsert / participantDrag
/ showInsertForm / multiSelectConnect"
```

---

### Task 2: app.js の moduleHas helper + ハードコード比較廃止

**Files:**
- Modify: `src/app.js`

- [ ] **Step 2.1: moduleHas helper 追加 (init 関数の手前)**

`src/app.js:38` (function init() の手前) に追加:

```javascript
function moduleHas(cap) {
  return !!(currentModule && currentModule.capabilities && currentModule.capabilities[cap]);
}
```

- [ ] **Step 2.2: hover mousemove guard を置換**

`src/app.js:122-127` 付近の hover mousemove handler で:

旧:
```javascript
if (!currentModule || !currentModule.showInsertForm) {
  clearHoverGuide();
  return;
}
```

新:
```javascript
if (!moduleHas('hoverInsert')) {
  clearHoverGuide();
  return;
}
```

- [ ] **Step 2.3: hover click guard を置換**

`src/app.js:152-159` 付近の click handler で:

旧:
```javascript
if (!currentModule || !currentModule.showInsertForm) return;
```

新:
```javascript
if (!moduleHas('showInsertForm')) return;
```

- [ ] **Step 2.4: participant drag mousedown guard 追加**

`src/app.js:292` 付近の `ovForDrag.addEventListener('mousedown', ...)` の先頭に追加:

```javascript
ovForDrag.addEventListener('mousedown', function(e) {
  if (!moduleHas('participantDrag')) return;  // ← 新規
  var target = e.target;
  if (!target.getAttribute) return;
  if (target.getAttribute('data-type') !== 'participant') return;
  // ...
});
```

- [ ] **Step 2.5: renderSvg の sequence highlight guard を置換**

`src/app.js:824` 付近:

旧:
```javascript
if (currentModule === modules['plantuml-sequence']) {
```

新:
```javascript
if (moduleHas('overlaySelection') && currentModule === modules['plantuml-sequence']) {
```

(中間状態として `&&` 形を採用。Phase A で selection-router 抽出時に sequence 比較は消える)

- [ ] **Step 2.6: selection.init callback の sequence highlight guard を置換**

`src/app.js:481` 付近:

旧:
```javascript
if (currentModule === modules['plantuml-sequence']
    && ovEl && window.MA.sequenceOverlay && window.MA.sequenceOverlay.setSelectedHighlight) {
```

新:
```javascript
if (moduleHas('overlaySelection')
    && currentModule === modules['plantuml-sequence']
    && ovEl && window.MA.sequenceOverlay && window.MA.sequenceOverlay.setSelectedHighlight) {
```

- [ ] **Step 2.7: Run unit tests**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 267 passed, 0 failed.

- [ ] **Step 2.8: Run E2E spot-check (sequence + UseCase 各 1)**

```bash
python server.py > /tmp/server.log 2>&1 &
sleep 2
( while sleep 5; do curl -s -X POST -o /dev/null http://127.0.0.1:8766/heartbeat 2>/dev/null || break; done ) &
npx playwright test tests/e2e/uc-02-bug-fix-mid-insert.spec.js tests/e2e/usecase-uc-01-new-system.spec.js tests/e2e/component-uc-01-new-system.spec.js --workers=1 --reporter=line 2>&1 | tail -10
```
Expected: 全 PASS (sequence の mid-insert + UseCase/Component の UC-1 が動く)

- [ ] **Step 2.9: Commit**

```bash
git add src/app.js
git commit -m "refactor(app): introduce moduleHas() + replace hardcoded sequence checks

Phase 0: app.js の currentModule === modules['plantuml-sequence']
ハードコード比較を moduleHas('cap') 経由に置換。

5 箇所を契約化:
- hover mousemove guide (showInsertForm → hoverInsert に分離)
- hover click insert popup (showInsertForm)
- participant drag mousedown (participantDrag)
- renderSvg の setSelectedHighlight (overlaySelection)
- selection.init callback の setSelectedHighlight (overlaySelection)

sequence と sequenceOverlay の比較は overlaySelection で gate
した上で残存 (Phase A で selection-router 抽出と同時に消える)。

Verified: 267 unit + 3 spot E2E PASS (sequence/UseCase/Component の UC-1)"
```

---

## Phase A: core 抽出 (8 commits)

### Task 3: overlay-builder.js skeleton + addRect/syncDimensions (TDD)

**Files:**
- Create: `src/core/overlay-builder.js`
- Create: `tests/overlay-builder.test.js`

- [ ] **Step 3.1: 失敗テストを書く**

`tests/overlay-builder.test.js` を作成:

```javascript
'use strict';
var OB = (typeof window !== 'undefined' && window.MA && window.MA.overlayBuilder)
  || (global.window && global.window.MA && global.window.MA.overlayBuilder);

describe('overlayBuilder.addRect', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="overlay" xmlns="http://www.w3.org/2000/svg"></svg>';
  });
  test('creates a rect with given coords + transparent fill', function() {
    var ov = document.getElementById('overlay');
    var r = OB.addRect(ov, 10, 20, 30, 40, { 'data-type': 'foo', 'data-id': 'X' });
    expect(r).not.toBeNull();
    expect(r.getAttribute('x')).toBe('10');
    expect(r.getAttribute('y')).toBe('20');
    expect(r.getAttribute('width')).toBe('30');
    expect(r.getAttribute('height')).toBe('40');
    expect(r.getAttribute('fill')).toBe('transparent');
    expect(r.getAttribute('data-type')).toBe('foo');
    expect(r.getAttribute('data-id')).toBe('X');
    expect(r.classList.contains('selectable')).toBe(true);
  });
  test('1x1 placeholder gets pointer-events: none', function() {
    var ov = document.getElementById('overlay');
    var r = OB.addRect(ov, 0, 0, 1, 1, { 'data-type': 'p' });
    expect(r.style.pointerEvents).toBe('none');
  });
});

describe('overlayBuilder.syncDimensions', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" viewBox="0 0 100 200" width="100" height="200"></svg>' +
      '<svg id="dst"></svg>';
  });
  test('copies viewBox/width/height from src to dst', function() {
    var src = document.getElementById('src');
    var dst = document.getElementById('dst');
    OB.syncDimensions(src, dst);
    expect(dst.getAttribute('viewBox')).toBe('0 0 100 200');
    expect(dst.getAttribute('width')).toBe('100');
    expect(dst.getAttribute('height')).toBe('200');
  });
});
```

- [ ] **Step 3.2: テスト失敗を確認**

```bash
npm run test:unit 2>&1 | grep -E "overlayBuilder|fail" | head -10
```
Expected: `overlayBuilder is undefined` 系の失敗。

- [ ] **Step 3.3: src/core/overlay-builder.js を実装**

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.overlayBuilder = (function() {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function addRect(overlayEl, x, y, w, h, attrs) {
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('stroke', 'none');
    rect.classList.add('selectable');
    rect.style.cursor = 'pointer';
    var isPlaceholder = (w === 1 && h === 1);
    rect.style.pointerEvents = isPlaceholder ? 'none' : 'all';
    if (attrs) {
      Object.keys(attrs).forEach(function(k) { rect.setAttribute(k, attrs[k]); });
    }
    overlayEl.appendChild(rect);
    return rect;
  }

  function syncDimensions(svgEl, overlayEl) {
    if (!svgEl || !overlayEl) return;
    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);
  }

  return {
    addRect: addRect,
    syncDimensions: syncDimensions,
  };
})();
```

- [ ] **Step 3.4: HTML に script 追加**

`plantuml-assist.html` の他の `src/core/*.js` script タグの近くに追加:

```html
<script src="src/core/overlay-builder.js"></script>
```

- [ ] **Step 3.5: tests/run-tests.js に登録 (sandbox loader 経由なので追記不要なケースが多い、確認のみ)**

```bash
grep -n "overlay-builder" tests/run-tests.js || grep -n "core/" tests/run-tests.js | head -5
```
sandbox loader が src/core/* を自動 load する場合は変更不要。明示 load の場合は追加。

- [ ] **Step 3.6: Run tests**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 267+2 = 269 passed, 0 failed.

- [ ] **Step 3.7: Commit**

```bash
git add src/core/overlay-builder.js tests/overlay-builder.test.js plantuml-assist.html
git commit -m "feat(core): overlay-builder.js skeleton + addRect/syncDimensions

Phase A の最初の primitive。図形セマンティクスを持たない pure SVG/DOM
helpers を切り出す Rule of Three の起点 (sequence-overlay.js から段階的に
移譲、UseCase/Component の buildOverlay でも使う前提)。

addRect:
- 透明 fill + .selectable class
- 1x1 placeholder は pointer-events: none

syncDimensions: viewBox/width/height を src→dst にコピー

+2 unit tests (269 total)"
```

---

### Task 4: overlay-builder.extractBBox + extractEdgeBBox (TDD)

**Files:**
- Modify: `src/core/overlay-builder.js`
- Modify: `tests/overlay-builder.test.js`

- [ ] **Step 4.1: 失敗テストを書く**

`tests/overlay-builder.test.js` 末尾に追加:

```javascript
describe('overlayBuilder.extractBBox', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" id="root">' +
      '<g id="g1"><text x="10" y="20" textLength="50">Hi</text></g>' +
      '<g id="g2"><line x1="0" y1="0" x2="100" y2="50"/></g>' +
      '<g id="g3"></g>' +
      '</svg>';
  });
  test('returns text bbox via x/y/textLength fallback (jsdom)', function() {
    var g = document.getElementById('g1');
    var bb = OB.extractBBox(g);
    expect(bb.x).toBe(10);
    expect(bb.y).toBe(20);
    expect(bb.width).toBe(50);
    expect(bb.height).toBe(14);  // default fallback
  });
  test('falls back to line bbox when text is missing', function() {
    var g = document.getElementById('g2');
    var bb = OB.extractBBox(g);
    expect(bb.x).toBe(0);
    expect(bb.y).toBe(-6);  // y - 6 padding (per sequence-overlay heritage)
    expect(bb.width).toBe(100);
  });
  test('returns null for empty group', function() {
    var g = document.getElementById('g3');
    expect(OB.extractBBox(g)).toBeNull();
  });
});

describe('overlayBuilder.extractEdgeBBox', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" id="root">' +
      '<line id="ln" x1="10" y1="20" x2="50" y2="60"/>' +
      '</svg>';
  });
  test('returns padded bbox around line endpoints', function() {
    var ln = document.getElementById('ln');
    var bb = OB.extractEdgeBBox(ln, 8);
    expect(bb.x).toBe(2);    // min(x1,x2) - padding
    expect(bb.y).toBe(12);   // min(y1,y2) - padding
    expect(bb.width).toBe(56);   // |x2-x1| + 2*padding
    expect(bb.height).toBe(56);  // |y2-y1| + 2*padding
  });
});
```

- [ ] **Step 4.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "extractBBox|extractEdgeBBox" | head -10
```
Expected: `extractBBox is not a function` 系の失敗。

- [ ] **Step 4.3: src/core/overlay-builder.js に実装追加**

`function syncDimensions` の手前に追加:

```javascript
  function extractBBox(g, opts) {
    if (!g) return null;
    var t = g.querySelector('text');
    if (t) {
      if (typeof t.getBBox === 'function') {
        try { return t.getBBox(); } catch (e) { /* jsdom fallback */ }
      }
      return {
        x: parseFloat(t.getAttribute('x')) || 0,
        y: parseFloat(t.getAttribute('y')) || 0,
        width: parseFloat(t.getAttribute('textLength')) || parseFloat(t.getAttribute('width')) || 0,
        height: 14,
      };
    }
    var line = g.querySelector('line');
    if (line) {
      var x1 = parseFloat(line.getAttribute('x1')) || 0;
      var x2 = parseFloat(line.getAttribute('x2')) || 0;
      var y1 = parseFloat(line.getAttribute('y1')) || 0;
      var y2 = parseFloat(line.getAttribute('y2')) || 0;
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2) - 6,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1) + 12,
      };
    }
    return null;
  }

  function extractEdgeBBox(pathEl, padding) {
    var pad = padding || 8;
    if (!pathEl) return null;
    if (pathEl.tagName.toLowerCase() === 'line') {
      var x1 = parseFloat(pathEl.getAttribute('x1')) || 0;
      var x2 = parseFloat(pathEl.getAttribute('x2')) || 0;
      var y1 = parseFloat(pathEl.getAttribute('y1')) || 0;
      var y2 = parseFloat(pathEl.getAttribute('y2')) || 0;
      return {
        x: Math.min(x1, x2) - pad,
        y: Math.min(y1, y2) - pad,
        width: Math.abs(x2 - x1) + 2 * pad,
        height: Math.abs(y2 - y1) + 2 * pad,
      };
    }
    if (typeof pathEl.getBBox === 'function') {
      try {
        var bb = pathEl.getBBox();
        return { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
      } catch (e) { /* jsdom: fall through */ }
    }
    return null;
  }
```

return オブジェクトに `extractBBox: extractBBox, extractEdgeBBox: extractEdgeBBox,` を追加。

- [ ] **Step 4.4: テスト合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 272 passed, 0 failed.

- [ ] **Step 4.5: Commit**

```bash
git add src/core/overlay-builder.js tests/overlay-builder.test.js
git commit -m "feat(core): overlayBuilder extractBBox + extractEdgeBBox

extractBBox: text → line → null の順で fallback (sequence-overlay の
_gBBox から汎用化)。jsdom でも動作。

extractEdgeBBox: line/path に padding (default 8px) を付けた hit-area
計算。UseCase/Component の relation 選択で使用。

+3 unit tests (272 total)"
```

---

### Task 5: overlay-builder.matchByDataSourceLine / matchByOrder / pickBestOffset

**Files:**
- Modify: `src/core/overlay-builder.js`
- Modify: `tests/overlay-builder.test.js`

- [ ] **Step 5.1: 失敗テストを書く**

`tests/overlay-builder.test.js` 末尾に追加:

```javascript
describe('overlayBuilder.matchByDataSourceLine', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="X" data-source-line="2"></g>' +
      '<g class="X" data-source-line="3"></g>' +
      '<g class="X" data-source-line="5"></g>' +
      '</svg>';
  });
  test('matches items whose lineNum = svgLine + offset (offset=1)', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a', line: 3 }, { id: 'b', line: 4 }, { id: 'c', line: 6 }];
    var matches = OB.matchByDataSourceLine(svg, items, 'g.X', 1);
    expect(matches.length).toBe(3);
    expect(matches[0].item.id).toBe('a');
    expect(matches[1].item.id).toBe('b');
    expect(matches[2].item.id).toBe('c');
  });
  test('returns empty when offset mismatches all', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a', line: 100 }];
    expect(OB.matchByDataSourceLine(svg, items, 'g.X', 0).length).toBe(0);
  });
});

describe('overlayBuilder.matchByOrder', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="Y"></g><g class="Y"></g><g class="Y"></g>' +
      '</svg>';
  });
  test('pairs N parsed items with first N matching SVG groups', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a' }, { id: 'b' }];
    var matches = OB.matchByOrder(svg, items, 'g.Y');
    expect(matches.length).toBe(2);
    expect(matches[0].item.id).toBe('a');
    expect(matches[1].item.id).toBe('b');
  });
});

describe('overlayBuilder.pickBestOffset', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="Z" data-source-line="3"></g>' +
      '<g class="Z" data-source-line="5"></g>' +
      '</svg>';
  });
  test('picks offset that yields max matches', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a', line: 3 }, { id: 'b', line: 5 }];
    var result = OB.pickBestOffset(svg, items, 'g.Z', [0, 1, 2]);
    expect(result.offset).toBe(0);
    expect(result.matches.length).toBe(2);
  });
});
```

- [ ] **Step 5.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "matchBy|pickBestOffset" | head -10
```
Expected: 関数未定義エラー。

- [ ] **Step 5.3: src/core/overlay-builder.js に実装**

`function syncDimensions` の手前に追加:

```javascript
  function matchByDataSourceLine(svgEl, items, selector, offset) {
    var groups = svgEl.querySelectorAll(selector);
    var byLine = {};
    Array.prototype.forEach.call(groups, function(g) {
      var sl = parseInt(g.getAttribute('data-source-line'), 10);
      if (!isNaN(sl)) byLine[sl + offset] = g;
    });
    var matches = [];
    items.forEach(function(item) {
      if (item.line != null && byLine[item.line]) {
        matches.push({ item: item, groupEl: byLine[item.line] });
      }
    });
    return matches;
  }

  function matchByOrder(svgEl, items, selector) {
    var groups = svgEl.querySelectorAll(selector);
    var n = Math.min(items.length, groups.length);
    var matches = [];
    for (var i = 0; i < n; i++) {
      matches.push({ item: items[i], groupEl: groups[i] });
    }
    return matches;
  }

  function pickBestOffset(svgEl, items, selector, candidates) {
    var best = { offset: candidates[0], matches: [] };
    candidates.forEach(function(off) {
      var m = matchByDataSourceLine(svgEl, items, selector, off);
      if (m.length > best.matches.length) {
        best = { offset: off, matches: m };
      }
    });
    if (best.matches.length === 0) {
      best = { offset: null, matches: matchByOrder(svgEl, items, selector) };
    }
    return best;
  }
```

return オブジェクトに 3 関数追加。

- [ ] **Step 5.4: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 276 passed.

- [ ] **Step 5.5: Commit**

```bash
git add src/core/overlay-builder.js tests/overlay-builder.test.js
git commit -m "feat(core): matching strategies (matchByDataSourceLine / matchByOrder / pickBestOffset)

3 strategies migrated from sequence-overlay.js _matchByDataSourceLine
/ _matchByOrder / _pickBestOffset.

pickBestOffset: 候補 offset から最大マッチを採るアダプティブ戦略。
matchByOrder fallback で data-source-line 不在時にも対応。

+4 unit tests (276 total)"
```

---

### Task 6: overlay-builder.hitTestTopmost + dedupById + warnIfMismatch

**Files:**
- Modify: `src/core/overlay-builder.js`
- Modify: `tests/overlay-builder.test.js`

- [ ] **Step 6.1: 失敗テストを書く**

```javascript
describe('overlayBuilder.hitTestTopmost', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="selectable" x="0" y="0" width="100" height="100" data-id="parent"/>' +
      '<rect class="selectable" x="40" y="40" width="20" height="20" data-id="child"/>' +
      '</svg>';
  });
  test('returns the topmost (last appended) selectable rect at point', function() {
    var ov = document.getElementById('ov');
    var hit = OB.hitTestTopmost(ov, 50, 50);
    expect(hit).not.toBeNull();
    expect(hit.getAttribute('data-id')).toBe('child');
  });
  test('returns parent when point only intersects parent', function() {
    var ov = document.getElementById('ov');
    var hit = OB.hitTestTopmost(ov, 10, 10);
    expect(hit.getAttribute('data-id')).toBe('parent');
  });
  test('returns null when point is outside all rects', function() {
    var ov = document.getElementById('ov');
    expect(OB.hitTestTopmost(ov, 200, 200)).toBeNull();
  });
});

describe('overlayBuilder.dedupById', function() {
  test('keeps first occurrence per data-id', function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect data-id="A"/><rect data-id="A"/><rect data-id="B"/>' +
      '</svg>';
    var ov = document.getElementById('ov');
    var rects = Array.prototype.slice.call(ov.querySelectorAll('rect'));
    var unique = OB.dedupById(rects);
    expect(unique.length).toBe(2);
    expect(unique[0].getAttribute('data-id')).toBe('A');
    expect(unique[1].getAttribute('data-id')).toBe('B');
  });
});
```

- [ ] **Step 6.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "hitTestTopmost|dedupById" | head -10
```

- [ ] **Step 6.3: 実装追加**

`syncDimensions` の手前に:

```javascript
  function hitTestTopmost(overlayEl, x, y) {
    var rects = overlayEl.querySelectorAll('rect.selectable');
    // 後から追加された rect が SVG document 順で末尾 = 最前面。
    // 末尾から走査して最初にヒットしたものを返す。
    for (var i = rects.length - 1; i >= 0; i--) {
      var r = rects[i];
      var rx = parseFloat(r.getAttribute('x')) || 0;
      var ry = parseFloat(r.getAttribute('y')) || 0;
      var rw = parseFloat(r.getAttribute('width')) || 0;
      var rh = parseFloat(r.getAttribute('height')) || 0;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
        return r;
      }
    }
    return null;
  }

  function dedupById(rects) {
    var seen = {};
    var unique = [];
    rects.forEach(function(r) {
      var id = r.getAttribute('data-id');
      if (!id || seen[id]) return;
      seen[id] = true;
      unique.push(r);
    });
    return unique;
  }

  function warnIfMismatch(kind, modelCount, matched) {
    if (modelCount !== matched && typeof console !== 'undefined' && console.warn) {
      console.warn('[overlay-builder] ' + kind + ' mismatch: model=' + modelCount + ' matched=' + matched);
    }
  }
```

return に 3 関数追加。

- [ ] **Step 6.4: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 280 passed.

- [ ] **Step 6.5: Commit**

```bash
git add src/core/overlay-builder.js tests/overlay-builder.test.js
git commit -m "feat(core): hitTestTopmost + dedupById + warnIfMismatch

hitTestTopmost: 重なる rect から末尾 (= 最前面) を返す。
component の port 階層選択 / future composite state の子優先で使う。

dedupById: 同一 data-id の重複 rect を 1 つにまとめる (観点 J)。
sequence の participant head/tail/lifeline 3 重表現の整合性を保つ。

warnIfMismatch: model と SVG 一致数の divergence を console.warn。
SVG 構造変化の早期検出 (sequence-overlay から移譲)。

+4 unit tests (280 total)"
```

---

### Task 7: selection-router.js (TDD)

**Files:**
- Create: `src/core/selection-router.js`
- Create: `tests/selection-router.test.js`

- [ ] **Step 7.1: 失敗テストを書く**

`tests/selection-router.test.js`:

```javascript
'use strict';
var SR = (typeof window !== 'undefined' && window.MA && window.MA.selectionRouter)
  || (global.window && global.window.MA && global.window.MA.selectionRouter);
var Sel = (typeof window !== 'undefined' && window.MA && window.MA.selection)
  || (global.window && global.window.MA && global.window.MA.selection);

describe('selectionRouter.bind', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="selectable" data-type="actor" data-id="A" data-line="3" x="0" y="0" width="50" height="50"/>' +
      '<rect class="selectable" data-type="usecase" data-id="U" data-line="4" x="60" y="0" width="50" height="50"/>' +
      '</svg>';
    Sel.clearSelection();
  });

  test('click on rect selects single item', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    var r = ov.querySelector('[data-id="A"]');
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    var sel = Sel.getSelected();
    expect(sel.length).toBe(1);
    expect(sel[0].id).toBe('A');
    expect(sel[0].type).toBe('actor');
    expect(sel[0].line).toBe(3);
  });

  test('shift+click adds to selection', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    ov.querySelector('[data-id="A"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ov.querySelector('[data-id="U"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(Sel.getSelected().length).toBe(2);
  });

  test('clicking same item again toggles off', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    var r = ov.querySelector('[data-id="A"]');
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(Sel.getSelected().length).toBe(0);
  });

  test('shift+click on already-selected item removes it (multi toggle)', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    ov.querySelector('[data-id="A"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ov.querySelector('[data-id="U"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    ov.querySelector('[data-id="U"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    var sel = Sel.getSelected();
    expect(sel.length).toBe(1);
    expect(sel[0].id).toBe('A');
  });

  test('click on non-selectable area clears selection', function() {
    var ov = document.getElementById('ov');
    SR.bind(ov);
    ov.querySelector('[data-id="A"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(Sel.getSelected().length).toBe(0);
  });
});

describe('selectionRouter.applyHighlight', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="selectable" data-type="actor" data-id="A"/>' +
      '<rect class="selectable" data-type="actor" data-id="A"/>' +  // 同 id の重複
      '<rect class="selectable" data-type="usecase" data-id="U"/>' +
      '</svg>';
  });
  test('adds .selected class to all rects with matching type+id', function() {
    var ov = document.getElementById('ov');
    SR.applyHighlight(ov, [{ type: 'actor', id: 'A' }]);
    var sel = ov.querySelectorAll('rect.selected');
    expect(sel.length).toBe(2);  // 同 id の重複も両方ハイライト
  });
  test('removes .selected from all when selData is empty', function() {
    var ov = document.getElementById('ov');
    SR.applyHighlight(ov, [{ type: 'actor', id: 'A' }]);
    SR.applyHighlight(ov, []);
    expect(ov.querySelectorAll('rect.selected').length).toBe(0);
  });

  test('non-matching selection clears highlight', function() {
    var ov = document.getElementById('ov');
    SR.applyHighlight(ov, [{ type: 'actor', id: 'A' }]);
    SR.applyHighlight(ov, [{ type: 'usecase', id: 'U' }]);
    var sel = ov.querySelectorAll('rect.selected');
    expect(sel.length).toBe(1);
    expect(sel[0].getAttribute('data-id')).toBe('U');
  });
});
```

- [ ] **Step 7.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "selectionRouter" | head -10
```

- [ ] **Step 7.3: src/core/selection-router.js を実装**

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.selectionRouter = (function() {

  function _itemFromTarget(target) {
    if (!target.getAttribute) return null;
    var type = target.getAttribute('data-type');
    var id = target.getAttribute('data-id');
    if (!type || !id) return null;
    var line = parseInt(target.getAttribute('data-line'), 10);
    return { type: type, id: id, line: isNaN(line) ? null : line };
  }

  function _isSameItem(a, b) {
    return a && b && a.type === b.type && a.id === b.id;
  }

  function bind(overlayEl, opts) {
    if (!overlayEl) return;
    overlayEl.addEventListener('click', function(e) {
      // 空白クリック: 選択解除
      var item = _itemFromTarget(e.target);
      if (!item) {
        if (!e.shiftKey) window.MA.selection.clearSelection();
        return;
      }

      var current = window.MA.selection.getSelected() || [];

      if (e.shiftKey) {
        // Shift+click: multi-toggle (観点 B)
        var existing = current.filter(function(s) { return _isSameItem(s, item); });
        if (existing.length > 0) {
          window.MA.selection.setSelected(current.filter(function(s) { return !_isSameItem(s, item); }));
        } else {
          window.MA.selection.setSelected(current.concat([item]));
        }
      } else {
        // 通常 click: 同一なら toggle 解除、別物なら単一選択 (観点 B)
        if (current.length === 1 && _isSameItem(current[0], item)) {
          window.MA.selection.clearSelection();
        } else {
          window.MA.selection.setSelected([item]);
        }
      }
    });
  }

  function applyHighlight(overlayEl, selData) {
    if (!overlayEl) return;
    var all = overlayEl.querySelectorAll('rect.selectable');
    Array.prototype.forEach.call(all, function(r) { r.classList.remove('selected'); });
    if (!selData || selData.length === 0) return;
    selData.forEach(function(s) {
      var rects = overlayEl.querySelectorAll(
        'rect[data-type="' + s.type + '"][data-id="' + s.id + '"]'
      );
      Array.prototype.forEach.call(rects, function(r) { r.classList.add('selected'); });
    });
  }

  return {
    bind: bind,
    applyHighlight: applyHighlight,
  };
})();
```

`plantuml-assist.html` に script 追加:
```html
<script src="src/core/selection-router.js"></script>
```

- [ ] **Step 7.4: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 287 passed (8 selection-router + 1 既存)。

- [ ] **Step 7.5: Commit**

```bash
git add src/core/selection-router.js tests/selection-router.test.js plantuml-assist.html
git commit -m "feat(core): selection-router.js — overlay click handling

Phase A の 2 つ目の core モジュール。click/shift+click/multi-toggle/
空白クリック解除/highlight 適用を window.MA.selection に変換。

bind(overlayEl): click handler を attach
- 通常 click: 同一なら toggle 解除、別物なら単一選択
- Shift+click: multi-toggle (追加/削除)
- 非 selectable click: clearSelection

applyHighlight(overlayEl, selData): id-based dedup で .selected class
を全該当 rect に適用 (観点 J: 重複表現も同一 highlight)

+8 unit tests (287 total)"
```

---

### Task 8: sequence.js を core/overlay-builder へ delegate (refactor)

**Files:**
- Modify: `src/ui/sequence-overlay.js`
- Modify: `src/modules/sequence.js`

- [ ] **Step 8.1: sequence-overlay.js から汎用部分を削除**

`src/ui/sequence-overlay.js` の冒頭付近で:

旧 `_addRect`, `_clearChildren`, `_gBBox`, `_pickBestOffset` (汎用部分) のローカル定義を削除し、ファイル先頭に shorthand を入れる:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var OB = window.MA.overlayBuilder;

  function _clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function _addRect(overlayEl, x, y, w, h, attrs) {
    return OB.addRect(overlayEl, x, y, w, h, attrs);
  }

  // _matchByDataSourceLine / _matchByOrder / _pickBestOffset / _gBBox / _warnIfMismatch
  // はすべて OB.* に置換
```

ファイル全体で:
- `_matchByDataSourceLine` → `OB.matchByDataSourceLine`
- `_matchByOrder` → `OB.matchByOrder`
- `_pickBestOffset` → `OB.pickBestOffset`
- `_gBBox` → `OB.extractBBox`
- `_warnIfMismatch` → `OB.warnIfMismatch`

`buildSequenceOverlay` 冒頭で `OB.syncDimensions(svgEl, overlayEl)` を呼ぶ (旧コードの viewBox/width/height コピーを置換)。

`setSelectedHighlight` を削除 (selection-router の applyHighlight に統合)。

- [ ] **Step 8.2: app.js で setSelectedHighlight の呼出を applyHighlight に置換**

`src/app.js:824` 付近:

旧:
```javascript
if (moduleHas('overlaySelection') && currentModule === modules['plantuml-sequence']) {
  var sel = window.MA.selection.getSelected() || [];
  if (window.MA.sequenceOverlay && window.MA.sequenceOverlay.setSelectedHighlight) {
    window.MA.sequenceOverlay.setSelectedHighlight(overlayEl, sel);
  }
}
```

新:
```javascript
if (moduleHas('overlaySelection')) {
  var sel = window.MA.selection.getSelected() || [];
  window.MA.selectionRouter.applyHighlight(overlayEl, sel);
}
```

`src/app.js:481` 付近の selection.init callback も同様に置換 (sequence ハードコードを削除して全 module 適用)。

- [ ] **Step 8.3: app.js の overlay click handler を selection-router.bind に移譲**

`src/app.js:359-393` の `overlayEl.addEventListener('click', ...)` 全体を削除し、init() の overlay-related 初期化セクションに置換:

```javascript
// Overlay click → selection (Phase A: selection-router へ移譲)
var overlayEl = document.getElementById('overlay-layer');
if (overlayEl) {
  // drag suppress: participant drag 直後の click は無視
  overlayEl.addEventListener('click', function(e) {
    if (Date.now() - justDraggedAt < DRAG_CLICK_SUPPRESS_MS) {
      e.stopImmediatePropagation();
    }
  }, true);  // capture phase で suppress
  window.MA.selectionRouter.bind(overlayEl);
}
```

- [ ] **Step 8.4: HTML CSS に `.selectable` / `.selected` styles 追加**

`plantuml-assist.html` の `<style>` ブロック内 `#overlay-layer rect.seq-overlay-target` セクションを置換:

```css
#overlay-layer rect.selectable {
  fill: transparent;
  stroke: none;
}
#overlay-layer rect.selectable.selected {
  fill: rgba(80, 160, 255, 0.18);
  stroke: rgba(80, 160, 255, 0.65);
  stroke-width: 1.5;
}
#overlay-layer rect.selectable:hover:not(.selected) {
  fill: rgba(255, 255, 255, 0.05);
}
```

旧 `seq-overlay-target` 参照は削除 (sequence の rect は `.selectable` を継承)。

- [ ] **Step 8.5: Run unit tests**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 287 passed.

- [ ] **Step 8.6: Run sequence E2E (regression check)**

```bash
curl -sf http://127.0.0.1:8766/ > /dev/null && echo "UP" || (python server.py > /tmp/server.log 2>&1 & sleep 2)
( while sleep 5; do curl -s -X POST -o /dev/null http://127.0.0.1:8766/heartbeat 2>/dev/null || break; done ) &
npx playwright test tests/e2e/uc-02-bug-fix-mid-insert.spec.js tests/e2e/uc-04-error-paths-multi.spec.js tests/e2e/uc-05-cache-refactor.spec.js --workers=1 --reporter=line 2>&1 | tail -10
```
Expected: 全 PASS (sequence のクリック選択 + alt 囲み + 範囲削除 が動く)

- [ ] **Step 8.7: Commit**

```bash
git add src/ui/sequence-overlay.js src/modules/sequence.js src/app.js plantuml-assist.html
git commit -m "refactor(ui,app): sequence-overlay delegates to core/overlay-builder + selection-router

Phase A 完了。sequence-overlay.js は sequence 固有の overlay レイアウト
(participant head/tail/lifeline 3 重対応、note placeholder、group bare-rect 推定)
だけを残し、汎用部分は core/overlay-builder に移譲。

app.js:
- overlay click handler を window.MA.selectionRouter.bind() に置換
- setSelectedHighlight 呼出を applyHighlight に置換 (sequence ハードコード廃止)

CSS: .seq-overlay-target → .selectable に統一

Verified: 287 unit + sequence regression E2E (UC-2/4/5) PASS"
```

---

## Phase B: UseCase + Component overlay 化 (16 commits)

### Task 9: UseCase actor/usecase の buildOverlay (TDD)

**Files:**
- Create: `tests/usecase-overlay.test.js`
- Modify: `src/modules/usecase.js`

- [ ] **Step 9.1: 失敗テストを書く**

`tests/usecase-overlay.test.js`:

```javascript
'use strict';
var ucMod = (typeof window !== 'undefined' && window.MA && window.MA.modules
  && window.MA.modules.plantumlUsecase)
  || (global.window && global.window.MA && global.window.MA.modules
  && global.window.MA.modules.plantumlUsecase);

describe('usecase.buildOverlay — actor/usecase', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
        '<g class="actor" data-source-line="3"><text x="10" y="20" textLength="30">User</text></g>' +
        '<g class="usecase" data-source-line="4"><text x="60" y="20" textLength="50">Login</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });

  test('creates rect for each actor with data-type="actor"', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'actor', id: 'User', line: 3 },
        { kind: 'usecase', id: 'Login', line: 4 },
      ],
      relations: [],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var actors = ov.querySelectorAll('rect[data-type="actor"]');
    expect(actors.length).toBe(1);
    expect(actors[0].getAttribute('data-id')).toBe('User');
    expect(actors[0].getAttribute('data-line')).toBe('3');
  });

  test('creates rect for each usecase with data-type="usecase"', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'usecase', id: 'Login', line: 4 },
      ],
      relations: [],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var ucs = ov.querySelectorAll('rect[data-type="usecase"]');
    expect(ucs.length).toBe(1);
    expect(ucs[0].getAttribute('data-id')).toBe('Login');
  });

  test('returns matched/unmatched report', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'actor', id: 'User', line: 3 },
        { kind: 'actor', id: 'Missing', line: 99 },
      ],
      relations: [],
      groups: [],
    };
    var report = ucMod.buildOverlay(src, parsed, ov);
    expect(report.matched.actor).toBe(1);
    expect(report.unmatched.actor).toBe(1);
  });
});
```

- [ ] **Step 9.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "buildOverlay" | head -5
```

- [ ] **Step 9.3: src/modules/usecase.js に buildOverlay 実装**

`buildOverlay: function() { /* v0.3.0 では overlay なし */ },` を以下に置換:

```javascript
    buildOverlay: function(svgEl, parsedData, overlayEl) {
      if (!svgEl || !overlayEl) return { matched: {}, unmatched: {} };
      var OB = window.MA.overlayBuilder;
      OB.syncDimensions(svgEl, overlayEl);

      var startUml = (parsedData.meta && parsedData.meta.startUmlLine) || 0;
      var candidates = [];
      function _push(v) { if (candidates.indexOf(v) === -1) candidates.push(v); }
      if (startUml > 0) _push(startUml);
      _push(0);
      _push(1);

      var actors = (parsedData.elements || []).filter(function(e) { return e.kind === 'actor'; });
      var usecases = (parsedData.elements || []).filter(function(e) { return e.kind === 'usecase'; });

      var actorPicked = OB.pickBestOffset(svgEl, actors, 'g.actor', candidates);
      actorPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 4, (bb.width || 40) + 12, (bb.height || 14) + 8, {
          'data-type': 'actor',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });

      var ucPicked = OB.pickBestOffset(svgEl, usecases, 'g.usecase', candidates);
      ucPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 4, (bb.width || 60) + 12, (bb.height || 14) + 8, {
          'data-type': 'usecase',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });

      return {
        matched: {
          actor: actorPicked.matches.length,
          usecase: ucPicked.matches.length,
        },
        unmatched: {
          actor: actors.length - actorPicked.matches.length,
          usecase: usecases.length - ucPicked.matches.length,
        },
      };
    },
```

usecase.js の capabilities を更新:

```javascript
    capabilities: {
      overlaySelection: true,  // ← false から true に
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: false,  // Task 14 で true に
    },
```

- [ ] **Step 9.4: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 290 passed.

- [ ] **Step 9.5: Commit**

```bash
git add src/modules/usecase.js tests/usecase-overlay.test.js
git commit -m "feat(usecase): buildOverlay for actor + usecase

UseCase の overlay-driven 化 step 1。actor / usecase 要素を SVG クリック
選択可能にする。capabilities.overlaySelection を true に切替。

g.actor / g.usecase に data-source-line 経由でマッチし、bbox に
padding を付けた hit-area rect を overlay に配置。

+3 unit tests (290 total)"
```

---

### Task 10: UseCase package + relation の buildOverlay 拡張

**Files:**
- Modify: `src/modules/usecase.js`
- Modify: `tests/usecase-overlay.test.js`

- [ ] **Step 10.1: 失敗テストを書く**

`tests/usecase-overlay.test.js` 末尾に追加:

```javascript
describe('usecase.buildOverlay — package + relation', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
        '<g class="cluster"><rect x="0" y="0" width="200" height="100"/><text x="10" y="15">Pkg</text></g>' +
        '<g class="link"><line x1="10" y1="50" x2="100" y2="50"/></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });

  test('creates package rect with data-type="package"', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [],
      groups: [{ kind: 'package', id: '__pkg_0', label: 'Pkg', startLine: 2, endLine: 5 }],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var pkgs = ov.querySelectorAll('rect[data-type="package"]');
    expect(pkgs.length).toBe(1);
    expect(pkgs[0].getAttribute('data-id')).toBe('__pkg_0');
  });

  test('creates relation rect with data-relation-kind', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [{ id: 'rel_0', kind: 'association', from: 'A', to: 'B', line: 3 }],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var rels = ov.querySelectorAll('rect[data-type="relation"]');
    expect(rels.length).toBe(1);
    expect(rels[0].getAttribute('data-relation-kind')).toBe('association');
  });

  test('relation rect uses extractEdgeBBox padding', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [{ id: 'rel_0', kind: 'association', from: 'A', to: 'B', line: 3 }],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var rect = ov.querySelector('rect[data-type="relation"]');
    var width = parseFloat(rect.getAttribute('width'));
    expect(width).toBeGreaterThan(90);  // line長 90 + 2*8 padding
  });
});
```

- [ ] **Step 10.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "package|relation" | head -10
```

- [ ] **Step 10.3: usecase.js の buildOverlay に package + relation 処理を追加**

`actor/usecase` 処理の後に追加:

```javascript
      // package: <g class="cluster">
      var packages = (parsedData.groups || []).filter(function(g) { return g.kind === 'package'; });
      var pkgGroups = svgEl.querySelectorAll('g.cluster');
      var pkgN = Math.min(packages.length, pkgGroups.length);
      for (var pi = 0; pi < pkgN; pi++) {
        var g = pkgGroups[pi];
        var pkgRect = g.querySelector('rect');
        if (!pkgRect) continue;
        var px = parseFloat(pkgRect.getAttribute('x')) || 0;
        var py = parseFloat(pkgRect.getAttribute('y')) || 0;
        var pw = parseFloat(pkgRect.getAttribute('width')) || 0;
        var ph = parseFloat(pkgRect.getAttribute('height')) || 0;
        OB.addRect(overlayEl, px - 2, py - 2, pw + 4, ph + 4, {
          'data-type': 'package',
          'data-id': packages[pi].id,
          'data-line': packages[pi].startLine,
        });
      }

      // relation: <g class="link"> 内の line / path
      var relations = parsedData.relations || [];
      var linkGroups = svgEl.querySelectorAll('g.link, g[class*="link_"]');
      var relN = Math.min(relations.length, linkGroups.length);
      for (var ri = 0; ri < relN; ri++) {
        var lg = linkGroups[ri];
        var lineEl = lg.querySelector('line, path');
        if (!lineEl) continue;
        var bb = OB.extractEdgeBBox(lineEl, 8);
        if (!bb) continue;
        OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        });
      }

      return {
        matched: {
          actor: actorPicked.matches.length,
          usecase: ucPicked.matches.length,
          package: pkgN,
          relation: relN,
        },
        unmatched: {
          actor: actors.length - actorPicked.matches.length,
          usecase: usecases.length - ucPicked.matches.length,
          package: packages.length - pkgN,
          relation: relations.length - relN,
        },
      };
```

(旧 return を削除して新 return に置換)

- [ ] **Step 10.4: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 293 passed.

- [ ] **Step 10.5: Commit**

```bash
git add src/modules/usecase.js tests/usecase-overlay.test.js
git commit -m "feat(usecase): buildOverlay for package + relation

UseCase overlay step 2。package 境界と relation (edge) を click 選択可能。

package: g.cluster の内側 rect から hit-area を作成
relation: g.link 内の line/path に extractEdgeBBox(8px padding) で hit-area
data-relation-kind 属性で association/generalization/include/extend を保持

+3 unit tests (293 total)"
```

---

### Task 11: UseCase の relation ID 付与 (parser 修正)

**Files:**
- Modify: `src/modules/usecase.js`

- [ ] **Step 11.1: parse 関数で relations に id を付与する確認**

```bash
grep -n "relations.push\|id:" src/modules/usecase.js | head -10
```

`parse` 関数で relations が `id` を持たない場合、付与するよう修正:

```javascript
// relations.push 直前で:
var relId = 'rel_' + (relations.length || 0);
result.relations.push({
  id: relId,  // ← 追加
  kind: kind, from: from, to: to, arrow: arrow, label: lbl, line: lineNum,
});
```

- [ ] **Step 11.2: 既存 usecase テストに id 付与確認テストを追加**

`tests/usecase-parser.test.js` に追加 (ファイルが存在することを確認、なければ usecase.test.js などに):

```javascript
test('parse adds id to each relation', function() {
  var t = '@startuml\nactor User\nusecase Login\nUser --> Login\n@enduml';
  var p = window.MA.modules.plantumlUsecase.parse(t);
  expect(p.relations[0].id).toBeDefined();
  expect(p.relations[0].id).toMatch(/^rel_/);
});
```

- [ ] **Step 11.3: テスト実行**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 294 passed (regression なし)。

- [ ] **Step 11.4: Commit**

```bash
git add src/modules/usecase.js tests/usecase-parser.test.js
git commit -m "feat(usecase): parser assigns id to each relation

overlay の relation hit-area rect に data-id を載せるため、parse() の
relations[i] に id (rel_N) を割り当てる。

renderProps の relation 検索 (renderByDispatch) が id 基準で動く前提を
満たす。"
```

---

### Task 12: UseCase の renderProps を relation 選択対応に拡張

**Files:**
- Modify: `src/modules/usecase.js`

- [ ] **Step 12.1: relation 選択時の form を確認**

`grep -n "onRelation\|relation" src/modules/usecase.js | head -20` で現状のロジックを把握。

`props-renderer.renderByDispatch` の dispatcher case (`onRelation`) は既に v0.3.0 で実装されている。relation の編集 form が以下の機能を含むことを確認:
- kind selector (association / generalization / include / extend)
- from/to (parsed から推定、編集不可で OK)
- swap ボタン (from/to 入れ替え)
- label 編集
- delete

不足機能を追加実装:

```javascript
// onRelation callback 内で
function _renderRelationEdit(rel, parsedData, propsEl, ctx) {
  var P = window.MA.properties;
  propsEl.innerHTML =
    '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase Diagram - Relation</div>' +
    '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
      '<label>Kind</label>' +
      P.selectFieldHtml('Kind', 'uc-rel-kind', [
        { value: 'association', label: 'Association (-->)', selected: rel.kind === 'association' },
        { value: 'generalization', label: 'Generalization (<|--)', selected: rel.kind === 'generalization' },
        { value: 'include', label: 'Include (..>) <<include>>', selected: rel.kind === 'include' },
        { value: 'extend', label: 'Extend (..>) <<extend>>', selected: rel.kind === 'extend' },
      ]) +
      '<div style="margin:8px 0;">From: <strong>' + window.MA.htmlUtils.escHtml(rel.from) + '</strong> ⇄ ' +
      '<button id="uc-rel-swap" type="button">swap</button>' +
      ' To: <strong>' + window.MA.htmlUtils.escHtml(rel.to) + '</strong></div>' +
      P.fieldHtml('Label', 'uc-rel-label', rel.label || '', '任意') +
      P.primaryButtonHtml('uc-rel-update', 'Update') +
      ' ' +
      '<button id="uc-rel-delete" type="button">Delete</button>' +
    '</div>';
  P.bindEvent('uc-rel-update', 'click', function() {
    window.MA.history.pushHistory();
    var newKind = document.getElementById('uc-rel-kind').value;
    var newLabel = document.getElementById('uc-rel-label').value.trim();
    var t = ctx.getMmdText();
    var out = updateRelation(t, rel.line, 'kind', newKind);
    out = updateRelation(out, rel.line, 'label', newLabel);
    ctx.setMmdText(out);
    ctx.onUpdate();
  });
  P.bindEvent('uc-rel-swap', 'click', function() {
    window.MA.history.pushHistory();
    var t = ctx.getMmdText();
    var out = updateRelation(t, rel.line, 'swap');
    ctx.setMmdText(out);
    ctx.onUpdate();
  });
  P.bindEvent('uc-rel-delete', 'click', function() {
    window.MA.history.pushHistory();
    ctx.setMmdText(deleteLine(ctx.getMmdText(), rel.line));
    window.MA.selection.clearSelection();
    ctx.onUpdate();
  });
}
```

renderProps の dispatcher 設定で `onRelation: _renderRelationEdit` を渡す。

`updateRelation` が swap field をサポートしていない場合、追加:

```javascript
// updateRelation 内
if (field === 'swap') {
  var tmp = from; from = to; to = tmp;
}
```

- [ ] **Step 12.2: テスト実行 (regression check)**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 全 PASS (新規テストなし、既存 regression なし)。

- [ ] **Step 12.3: Commit**

```bash
git add src/modules/usecase.js
git commit -m "feat(usecase): relation selection edit form (kind/swap/label/delete)

renderProps の onRelation dispatcher を実装。relation を SVG クリック /
DSL 行クリックで選択した時に property panel に編集 form を表示。

機能:
- Kind 切替 (association/generalization/include/extend)
- From/To swap
- Label 編集
- Delete (selection クリア + 行削除)

updateRelation に 'swap' field を追加 (from/to 入れ替え)。"
```

---

### Task 13: UseCase の multi-select connect (Phase B 主目玉)

**Files:**
- Modify: `src/core/props-renderer.js`
- Modify: `src/modules/usecase.js`
- Modify: `tests/props-renderer.test.js`

- [ ] **Step 13.1: props-renderer に onMultiSelectConnect dispatcher case 追加**

`src/core/props-renderer.js` の renderByDispatch を拡張:

```javascript
function renderByDispatch(selData, parsedData, propsEl, dispatchers) {
  if (!propsEl) return;
  if (!selData || selData.length === 0) {
    if (dispatchers.onNoSelection) dispatchers.onNoSelection(parsedData, propsEl);
    return;
  }
  // 2-element selection (multi-select connect)
  if (selData.length === 2 && dispatchers.onMultiSelectConnect) {
    dispatchers.onMultiSelectConnect(selData, parsedData, propsEl);
    return;
  }
  // 3+ selection (中途半端な状態)
  if (selData.length >= 2 && dispatchers.onMultiSelect) {
    dispatchers.onMultiSelect(selData, parsedData, propsEl);
    return;
  }
  // single selection
  var sel = selData[0];
  // ... (既存ロジック維持)
}
```

- [ ] **Step 13.2: props-renderer のテストに multi-select dispatch 追加**

`tests/props-renderer.test.js` (なければ作成、既存に追加):

```javascript
test('renderByDispatch calls onMultiSelectConnect when 2 elements selected', function() {
  document.body.innerHTML = '<div id="props"></div>';
  var propsEl = document.getElementById('props');
  var called = false;
  var receivedSel = null;
  window.MA.propsRenderer.renderByDispatch(
    [{ type: 'actor', id: 'A' }, { type: 'usecase', id: 'U' }],
    { elements: [], relations: [], groups: [] },
    propsEl,
    {
      onMultiSelectConnect: function(sel) { called = true; receivedSel = sel; }
    }
  );
  expect(called).toBe(true);
  expect(receivedSel.length).toBe(2);
});

test('renderByDispatch calls onMultiSelect when 3+ elements selected', function() {
  document.body.innerHTML = '<div id="props"></div>';
  var propsEl = document.getElementById('props');
  var called = false;
  window.MA.propsRenderer.renderByDispatch(
    [{ type: 'actor', id: 'A' }, { type: 'actor', id: 'B' }, { type: 'actor', id: 'C' }],
    { elements: [], relations: [], groups: [] },
    propsEl,
    {
      onMultiSelect: function() { called = true; }
    }
  );
  expect(called).toBe(true);
});
```

- [ ] **Step 13.3: usecase.js で onMultiSelectConnect callback を実装**

```javascript
function _renderMultiSelectConnect(selData, parsedData, propsEl, ctx) {
  var P = window.MA.properties;
  var allElements = (parsedData.elements || []).filter(function(e) {
    return e.kind === 'actor' || e.kind === 'usecase';
  });
  var nameById = {};
  allElements.forEach(function(e) { nameById[e.id] = e.label || e.id; });

  var fromOpt = nameById[selData[0].id] || selData[0].id;
  var toOpt = nameById[selData[1].id] || selData[1].id;

  propsEl.innerHTML =
    '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase - Connect 2 elements</div>' +
    '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
      '<div style="margin:8px 0;">' +
        'From: <strong id="uc-conn-from">' + window.MA.htmlUtils.escHtml(fromOpt) + '</strong> ' +
        '<button id="uc-conn-swap" type="button">⇄ swap</button> ' +
        'To: <strong id="uc-conn-to">' + window.MA.htmlUtils.escHtml(toOpt) + '</strong>' +
      '</div>' +
      P.selectFieldHtml('Kind', 'uc-conn-kind', [
        { value: 'association', label: 'Association (-->)', selected: true },
        { value: 'generalization', label: 'Generalization (<|--)' },
        { value: 'include', label: 'Include (..>) <<include>>' },
        { value: 'extend', label: 'Extend (..>) <<extend>>' },
      ]) +
      P.fieldHtml('Label', 'uc-conn-label', '', '任意') +
      P.primaryButtonHtml('uc-conn-create', '+ Connect') +
    '</div>';

  var swapped = false;
  P.bindEvent('uc-conn-swap', 'click', function() {
    swapped = !swapped;
    var fromEl = document.getElementById('uc-conn-from');
    var toEl = document.getElementById('uc-conn-to');
    var tmp = fromEl.textContent;
    fromEl.textContent = toEl.textContent;
    toEl.textContent = tmp;
  });

  P.bindEvent('uc-conn-create', 'click', function() {
    window.MA.history.pushHistory();
    var fromId = swapped ? selData[1].id : selData[0].id;
    var toId = swapped ? selData[0].id : selData[1].id;
    var kind = document.getElementById('uc-conn-kind').value;
    var label = document.getElementById('uc-conn-label').value.trim();
    var t = ctx.getMmdText();
    var out = addRelation(t, kind, fromId, toId, label);
    ctx.setMmdText(out);
    window.MA.selection.clearSelection();
    ctx.onUpdate();
  });
}

// 3+ selection 用 (空白プレースホルダ)
function _renderMultiSelect(selData, parsedData, propsEl) {
  propsEl.innerHTML =
    '<div style="padding:12px;color:var(--text-secondary);font-size:11px;">' +
    selData.length + ' elements selected。Connect は 2 elements まで。' +
    'Shift+クリックで解除できます。</div>';
}
```

renderProps の dispatcher 設定:

```javascript
window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
  onNoSelection: function(p, e) { _renderNoSelection(p, e, ctx); },
  onElement: function(el, p, e) { _renderElementEdit(el, p, e, ctx); },
  onRelation: function(r, p, e) { _renderRelationEdit(r, p, e, ctx); },
  onGroup: function(g, p, e) { _renderGroupEdit(g, p, e, ctx); },
  onMultiSelectConnect: function(s, p, e) { _renderMultiSelectConnect(s, p, e, ctx); },
  onMultiSelect: function(s, p, e) { _renderMultiSelect(s, p, e); },
});
```

usecase.js の capabilities を更新:
```javascript
multiSelectConnect: true,  // ← Phase B Task 13 で起動
```

- [ ] **Step 13.4: テスト実行**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 295 passed (props-renderer +2)。

- [ ] **Step 13.5: Commit**

```bash
git add src/core/props-renderer.js src/modules/usecase.js tests/props-renderer.test.js
git commit -m "feat(usecase): multi-select connect (2 elements → relation)

props-renderer の dispatcher に onMultiSelectConnect / onMultiSelect
case を追加。usecase が capabilities.multiSelectConnect を true に切替。

UX:
- 2 elements 選択時: Connect form (kind selector + swap + label + button)
- 3+ elements 選択時: 'Connect は 2 elements まで' メッセージ
- swap ボタンで from/to 入れ替え
- Connect 後は selection クリア + DSL 更新

+2 unit tests (295 total)"
```

---

### Task 14: Component の actor/interface buildOverlay (TDD)

**Files:**
- Create: `tests/component-overlay.test.js`
- Modify: `src/modules/component.js`

- [ ] **Step 14.1: 失敗テストを書く**

`tests/component-overlay.test.js`:

```javascript
'use strict';
var coMod = (typeof window !== 'undefined' && window.MA && window.MA.modules
  && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules
  && global.window.MA.modules.plantumlComponent);

describe('component.buildOverlay — component/interface', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
        '<g class="component" data-source-line="3"><text x="10" y="20" textLength="60">WebApp</text></g>' +
        '<g class="interface" data-source-line="4"><text x="80" y="20" textLength="40">IAuth</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });

  test('creates component rect', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [{ kind: 'component', id: 'WebApp', line: 3 }],
      relations: [], groups: [],
    }, ov);
    var c = ov.querySelectorAll('rect[data-type="component"]');
    expect(c.length).toBe(1);
    expect(c[0].getAttribute('data-id')).toBe('WebApp');
  });

  test('creates interface rect', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [{ kind: 'interface', id: 'IAuth', line: 4 }],
      relations: [], groups: [],
    }, ov);
    var i = ov.querySelectorAll('rect[data-type="interface"]');
    expect(i.length).toBe(1);
    expect(i[0].getAttribute('data-id')).toBe('IAuth');
  });
});
```

- [ ] **Step 14.2: 失敗確認**

```bash
npm run test:unit 2>&1 | grep -E "component.buildOverlay" | head -5
```

- [ ] **Step 14.3: src/modules/component.js に buildOverlay 実装**

`buildOverlay: function() { /* v0.4.0 では overlay なし */ },` を以下に置換:

```javascript
    buildOverlay: function(svgEl, parsedData, overlayEl) {
      if (!svgEl || !overlayEl) return { matched: {}, unmatched: {} };
      var OB = window.MA.overlayBuilder;
      OB.syncDimensions(svgEl, overlayEl);

      var startUml = (parsedData.meta && parsedData.meta.startUmlLine) || 0;
      var candidates = [];
      function _push(v) { if (candidates.indexOf(v) === -1) candidates.push(v); }
      if (startUml > 0) _push(startUml);
      _push(0);
      _push(1);

      var components = (parsedData.elements || []).filter(function(e) { return e.kind === 'component'; });
      var interfaces = (parsedData.elements || []).filter(function(e) { return e.kind === 'interface'; });

      var compPicked = OB.pickBestOffset(svgEl, components, 'g.component', candidates);
      compPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 8, bb.y - 6, (bb.width || 80) + 16, (bb.height || 14) + 12, {
          'data-type': 'component',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });

      var ifPicked = OB.pickBestOffset(svgEl, interfaces, 'g.interface', candidates);
      ifPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 6, (bb.width || 60) + 12, (bb.height || 14) + 12, {
          'data-type': 'interface',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });

      return {
        matched: {
          component: compPicked.matches.length,
          interface: ifPicked.matches.length,
        },
        unmatched: {
          component: components.length - compPicked.matches.length,
          interface: interfaces.length - ifPicked.matches.length,
        },
      };
    },
```

capabilities 更新:
```javascript
overlaySelection: true,
multiSelectConnect: false,  // Task 17 で true に
```

- [ ] **Step 14.4: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 297 passed。

- [ ] **Step 14.5: Commit**

```bash
git add src/modules/component.js tests/component-overlay.test.js
git commit -m "feat(component): buildOverlay for component + interface

Component overlay step 1。component / interface 要素を SVG クリック
選択可能にする。capabilities.overlaySelection を true に切替。

+2 unit tests (297 total)"
```

---

### Task 15: Component の port/package buildOverlay 拡張 (port 階層選択)

**Files:**
- Modify: `src/modules/component.js`
- Modify: `tests/component-overlay.test.js`

- [ ] **Step 15.1: 失敗テストを書く**

```javascript
describe('component.buildOverlay — port + package', function() {
  test('port rect is added AFTER component rect (z-order: child first)', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="component" data-source-line="3"><text x="0" y="0" textLength="60">W</text></g>' +
        '<g class="port" data-source-line="4"><text x="20" y="20" textLength="10">p1</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'component', id: 'W', line: 3 },
        { kind: 'port', id: 'p1', parentComponentId: 'W', line: 4 },
      ],
      relations: [], groups: [],
    }, ov);
    var rects = ov.querySelectorAll('rect.selectable');
    expect(rects[0].getAttribute('data-type')).toBe('component');
    expect(rects[1].getAttribute('data-type')).toBe('port');  // 子要素は後 (= 最前面)
  });

  test('creates package rect via g.cluster', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="cluster"><rect x="0" y="0" width="200" height="100"/><text x="10" y="15">Pkg</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [], relations: [],
      groups: [{ kind: 'package', id: '__pkg_0', label: 'Pkg', startLine: 2, endLine: 5 }],
    }, ov);
    var pkgs = ov.querySelectorAll('rect[data-type="package"]');
    expect(pkgs.length).toBe(1);
  });
});
```

- [ ] **Step 15.2: 実装追加**

component.js の buildOverlay に追加:

```javascript
      // package
      var packages = (parsedData.groups || []).filter(function(g) { return g.kind === 'package'; });
      var pkgGroups = svgEl.querySelectorAll('g.cluster');
      var pkgN = Math.min(packages.length, pkgGroups.length);
      for (var pi = 0; pi < pkgN; pi++) {
        var pg = pkgGroups[pi];
        var pkgRect = pg.querySelector('rect');
        if (!pkgRect) continue;
        OB.addRect(overlayEl,
          (parseFloat(pkgRect.getAttribute('x')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('y')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('width')) || 0) + 4,
          (parseFloat(pkgRect.getAttribute('height')) || 0) + 4, {
            'data-type': 'package',
            'data-id': packages[pi].id,
            'data-line': packages[pi].startLine,
          });
      }

      // port — component の後に追加して z-order 最前面に (子優先)
      var ports = (parsedData.elements || []).filter(function(e) { return e.kind === 'port'; });
      var portPicked = OB.pickBestOffset(svgEl, ports, 'g.port', candidates);
      portPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 4, bb.y - 4, (bb.width || 20) + 8, (bb.height || 14) + 8, {
          'data-type': 'port',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });

      // 既存 return を以下で置換 (port/package 含める)
      return {
        matched: {
          component: compPicked.matches.length,
          interface: ifPicked.matches.length,
          port: portPicked.matches.length,
          package: pkgN,
        },
        unmatched: {
          component: components.length - compPicked.matches.length,
          interface: interfaces.length - ifPicked.matches.length,
          port: ports.length - portPicked.matches.length,
          package: packages.length - pkgN,
        },
      };
```

- [ ] **Step 15.3: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 299 passed。

- [ ] **Step 15.4: Commit**

```bash
git add src/modules/component.js tests/component-overlay.test.js
git commit -m "feat(component): buildOverlay for port + package (port hierarchical)

port rect は component rect の後に addRect で追加し、SVG z-order により
最前面に配置。selection-router の hitTestTopmost と組み合わせて
'port click は port が選択され、port 外側の component 領域 click は
component が選択される' 階層選択を実現。

+2 unit tests (299 total)"
```

---

### Task 16: Component の relation buildOverlay 拡張

**Files:**
- Modify: `src/modules/component.js`
- Modify: `tests/component-overlay.test.js`

- [ ] **Step 16.1: 失敗テストを書く**

```javascript
test('relation rect with data-relation-kind for 4 kinds', function() {
  document.body.innerHTML =
    '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="link"><line x1="0" y1="0" x2="50" y2="0"/></g>' +
      '<g class="link"><line x1="0" y1="20" x2="50" y2="20"/></g>' +
    '</svg>' +
    '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  var src = document.getElementById('src');
  var ov = document.getElementById('ov');
  coMod.buildOverlay(src, {
    meta: { startUmlLine: 1 },
    elements: [],
    relations: [
      { id: 'rel_0', kind: 'association', from: 'A', to: 'B', line: 5 },
      { id: 'rel_1', kind: 'provides', from: 'A', to: 'I', line: 6 },
    ],
    groups: [],
  }, ov);
  var rels = ov.querySelectorAll('rect[data-type="relation"]');
  expect(rels.length).toBe(2);
  expect(rels[0].getAttribute('data-relation-kind')).toBe('association');
  expect(rels[1].getAttribute('data-relation-kind')).toBe('provides');
});
```

- [ ] **Step 16.2: 実装追加**

component.js の buildOverlay に port の前後で:

```javascript
      // relation
      var relations = parsedData.relations || [];
      var linkGroups = svgEl.querySelectorAll('g.link, g[class*="link_"]');
      var relN = Math.min(relations.length, linkGroups.length);
      for (var ri = 0; ri < relN; ri++) {
        var lg = linkGroups[ri];
        var lineEl = lg.querySelector('line, path');
        if (!lineEl) continue;
        var bb = OB.extractEdgeBBox(lineEl, 8);
        if (!bb) continue;
        OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        });
      }
```

return に `relation: relN, ` を追加。

component の parser で `relations` に id を付与する確認 (Task 11 と同様、必要なら修正)。

- [ ] **Step 16.3: 合格確認**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 300 passed。

- [ ] **Step 16.4: Commit**

```bash
git add src/modules/component.js tests/component-overlay.test.js
git commit -m "feat(component): buildOverlay for relation (4 kinds)

association / dependency / provides / requires すべての relation を
SVG クリック選択可能に。data-relation-kind 属性で kind 種別保持。

+1 unit test (300 total)"
```

---

### Task 17: Component の relation 編集 form + multi-select connect

**Files:**
- Modify: `src/modules/component.js`

- [ ] **Step 17.1: relation 編集 form を実装**

UseCase Task 12 と同様、component.js に `_renderRelationEdit` 関数を追加。kind は 4 種類 (association/dependency/provides/requires)。

- [ ] **Step 17.2: multi-select connect を実装**

UseCase Task 13 と同様、component.js に `_renderMultiSelectConnect` を追加。kind は 4 種類。capabilities `multiSelectConnect: true` に切替。

provides/requires の lollipop は from/to の意味が固定 (provides: component → interface, requires: interface → component) なので、kind 選択時に from/to の swap state を強制する処理を追加:

```javascript
P.bindEvent('co-conn-kind', 'change', function() {
  var kind = document.getElementById('co-conn-kind').value;
  // provides: 必ず component → interface (component が from, interface が to)
  if (kind === 'provides' || kind === 'requires') {
    // selData の type を見て swap が必要か判定
    var fromType = (swapped ? selData[1] : selData[0]).type;
    var toType = (swapped ? selData[0] : selData[1]).type;
    if (kind === 'provides' && fromType !== 'component') {
      // swap して component を from に
      document.getElementById('co-conn-swap').click();
    } else if (kind === 'requires' && fromType !== 'interface') {
      document.getElementById('co-conn-swap').click();
    }
  }
});
```

- [ ] **Step 17.3: テスト実行**

```bash
npm run test:unit 2>&1 | tail -3
```
Expected: 全 PASS (regression なし)。

- [ ] **Step 17.4: Commit**

```bash
git add src/modules/component.js
git commit -m "feat(component): relation edit form + multi-select connect

relation 編集 (kind 4 種切替 / swap / label / delete) と
multi-select connect (2 figure 選択 → Connect panel) を実装。
component.capabilities.multiSelectConnect = true。

provides/requires (lollipop) は from/to が型に依存するため
kind 切替時に自動 swap 適用。"
```

---

### Task 18: UseCase E2E (overlay-driven テスト)

**Files:**
- Create: `tests/e2e/usecase-overlay.spec.js`

- [ ] **Step 18.1: E2E spec を書く**

`tests/e2e/usecase-overlay.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UseCase overlay-driven', () => {
  test('clicking actor in SVG selects it', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    // overlay rect が actor 用に出来ているはず
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    await expect(actorRect).toBeVisible();
    await actorRect.click();
    await page.waitForTimeout(200);
    // property panel に actor 編集 form が出る (uc-actor-* 等の field id)
    await expect(page.locator('#props-content')).toContainText('Actor');
  });

  test('clicking same actor twice toggles selection off', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    await actorRect.click();
    await actorRect.click();
    await page.waitForTimeout(200);
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBe(0);
  });

  test('shift+click on second element enters multi-select connect mode', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var ucRect = page.locator('#overlay-layer rect[data-type="usecase"]').first();
    await actorRect.click();
    await ucRect.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(200);
    await expect(page.locator('#props-content')).toContainText('Connect 2 elements');
    await expect(page.locator('#uc-conn-create')).toBeVisible();
  });

  test('multi-select connect creates relation in DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    var lineCountBefore = (await getEditorText(page)).split('\n').length;
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var ucRect = page.locator('#overlay-layer rect[data-type="usecase"]').first();
    await actorRect.click();
    await ucRect.click({ modifiers: ['Shift'] });
    await page.locator('#uc-conn-create').click();
    await page.waitForTimeout(500);
    var lineCountAfter = (await getEditorText(page)).split('\n').length;
    expect(lineCountAfter).toBe(lineCountBefore + 1);  // 1 行追加
  });

  test('clicking relation in SVG selects it and shows kind editor', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    // relation overlay rect は template に最初から含まれる前提
    var relRect = page.locator('#overlay-layer rect[data-type="relation"]').first();
    if ((await relRect.count()) > 0) {
      await relRect.click();
      await page.waitForTimeout(200);
      await expect(page.locator('#uc-rel-kind')).toBeVisible();
    }
  });
});
```

- [ ] **Step 18.2: E2E テスト実行 (server up + heartbeat)**

```bash
curl -sf http://127.0.0.1:8766/ > /dev/null && echo "UP" || (python server.py > /tmp/server.log 2>&1 & sleep 2)
( while sleep 5; do curl -s -X POST -o /dev/null http://127.0.0.1:8766/heartbeat 2>/dev/null || break; done ) &
npx playwright test tests/e2e/usecase-overlay.spec.js --workers=1 --reporter=line 2>&1 | tail -10
```
Expected: 5 passed。

- [ ] **Step 18.3: Commit**

```bash
git add tests/e2e/usecase-overlay.spec.js
git commit -m "test(usecase): E2E for overlay-driven UC (5 tests)

UseCase overlay の click 選択 / toggle / multi-select connect /
relation kind editor を実機 Playwright で検証。

+5 E2E tests"
```

---

### Task 19: Component E2E (overlay-driven テスト)

**Files:**
- Create: `tests/e2e/component-overlay.spec.js`

- [ ] **Step 19.1: E2E spec を書く**

UseCase の Task 18 と同パターン。Component template には `WebApp / IAuth / WebApp -() IAuth` が含まれるので:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('Component overlay-driven', () => {
  test('clicking component in SVG selects it', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    var rect = page.locator('#overlay-layer rect[data-type="component"]').first();
    await expect(rect).toBeVisible();
    await rect.click();
    await expect(page.locator('#props-content')).toContainText('Component');
  });

  test('shift+click 2 elements opens connect panel with 4 kind options', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
    await c.click();
    await i.click({ modifiers: ['Shift'] });
    var options = await page.locator('#co-conn-kind option').allTextContents();
    expect(options.some(o => o.includes('Association'))).toBe(true);
    expect(options.some(o => o.includes('Dependency'))).toBe(true);
    expect(options.some(o => o.includes('Provides'))).toBe(true);
    expect(options.some(o => o.includes('Requires'))).toBe(true);
  });

  test('clicking port (inside component block) selects port not component', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    // port を 1 つ追加
    await page.locator('#co-tail-kind').selectOption('port');
    await page.locator('#co-tail-parent').selectOption('WebApp');
    await page.locator('#co-tail-alias').fill('p1');
    await page.locator('#co-tail-add').click();
    await page.waitForTimeout(500);
    var portRect = page.locator('#overlay-layer rect[data-type="port"]').first();
    if ((await portRect.count()) > 0) {
      await portRect.click();
      var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
      expect(sel[0].type).toBe('port');
    }
  });

  test('relation kind selector switches DSL arrow on update', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    var relRect = page.locator('#overlay-layer rect[data-type="relation"]').first();
    if ((await relRect.count()) > 0) {
      await relRect.click();
      await page.waitForTimeout(200);
      await page.locator('#co-rel-kind').selectOption('dependency');
      await page.locator('#co-rel-update').click();
      await page.waitForTimeout(500);
      var t = await getEditorText(page);
      expect(t).toContain('..>');
    }
  });

  test('console error count is 0 during overlay interactions', async ({ page }) => {
    var errors = [];
    page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    await c.click();
    await page.waitForTimeout(300);
    var jsErrors = errors.filter(e => !e.includes('favicon'));
    expect(jsErrors).toHaveLength(0);
  });
});
```

- [ ] **Step 19.2: E2E 実行**

```bash
npx playwright test tests/e2e/component-overlay.spec.js --workers=1 --reporter=line 2>&1 | tail -10
```
Expected: 5 passed。

- [ ] **Step 19.3: Commit**

```bash
git add tests/e2e/component-overlay.spec.js
git commit -m "test(component): E2E for overlay-driven (5 tests, including port hierarchical)

+5 E2E tests"
```

---

### Task 20: Visual sweep (Evaluator dispatch + hotfix loop)

**Files:** none (検証のみ + 必要に応じ hotfix)

- [ ] **Step 20.1: server up + heartbeat keepalive**

```bash
curl -sf http://127.0.0.1:8766/ > /dev/null && echo "UP" || (python server.py > /tmp/server.log 2>&1 & sleep 2)
( while sleep 5; do curl -s -X POST -o /dev/null http://127.0.0.1:8766/heartbeat 2>/dev/null || break; done ) &
```

- [ ] **Step 20.2: Evaluator subagent dispatch**

```
Agent(subagent_type=evaluator, prompt="
Project: 06_PlantUMLAssist
Branch: feat/tier1-overlay-driven
Sprint: v0.5.0 — UseCase + Component overlay-driven 化
Spec: docs/superpowers/specs/2026-04-26-tier1-overlay-driven-design.md
Plan: docs/superpowers/plans/2026-04-26-tier1-overlay-driven-v0.5.0.md
Dev server: http://127.0.0.1:8766/

Verify 18-cell α/γ-form/γ-overlay matrix:
- 6 UC × UseCase × 3 axes (α DSL / γ-form / γ-overlay)  → 18 cells
- 6 UC × Component × 3 axes                              → 18 cells

総 36 cells (UseCase 18 + Component 18)。各 cell はスクリーンショット
証拠付きで PASS/FAIL を判定。

PASS criteria: 全 cell PASS、console error 0 (excl favicon)、観点
A/B/C/J が全て満たされている。

Don't flag: WinError 10053 (pre-existing), sequence-side UC-1/UC-6/UC-7/
UC-8 (pre-existing from Sprint 1 actor auto-detection).

Output: .eval/sprint-3/report.md。FAIL があれば controller に round 1
report として戻す。
")
```

- [ ] **Step 20.3: FAIL があれば hotfix → 再 dispatch**

v0.4.0 と同様、Evaluator round 1 で発見されたバグは sprint 内で修正:
1. FAIL 内容を読み、root cause 特定
2. 該当 module / app.js を修正、commit
3. Evaluator round 2 で再評価

- [ ] **Step 20.4: PASS 確認後、 git log で sprint commit 数確認**

```bash
git log --oneline feat/tier1-overlay-driven ^feat/tier1-component | wc -l
```
Expected: ~25 (Phase 0: 2, Phase A: 6, Phase B: 11, Phase C: 2, hotfix: 0-4)。

---

## Phase C: Documentation + PR (2 commits)

### Task 21: README + CHANGELOG v0.5.0

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 21.1: README に Overlay-Driven セクションを追加**

`README.md` の `## Component Diagram (v0.4.0)` セクションの後、`## 設計ドキュメント` の前に追加:

```markdown
## Overlay-Driven Editing (v0.5.0)

Sequence / UseCase / Component の 3 図形は、SVG プレビュー上の図形を
直接クリックして編集できます (overlay-driven)。

### 共通操作

- **クリック**: 図形を単一選択 → property panel が編集モードに
- **再クリック**: 選択解除
- **Shift+クリック**: 複数選択 (2 つまで)
- **空白クリック**: 選択解除

### Multi-Select Connect (UseCase / Component)

2 つの図形を Shift+クリックで選択 → property panel に Connect panel が
出ます。Kind を選んで `+ Connect` で関係を作成:

- UseCase: association / generalization / include / extend
- Component: association / dependency / provides (lollipop) / requires (lollipop)

Provides/Requires (lollipop) は方向が固定: component → interface (provides) /
interface → component (requires)。Connect panel は kind 切替時に自動で
from/to を入れ替えます。

### v0.5.0 制約 (v0.6.0+ で対応予定)

- drag-to-connect (SVG 上で線を drag して関係作成)
- package 範囲選択 → wrap (既存要素を package で囲む)
- 要素を別 package へ drag 移動
- Sequence の multi-select connect (現状 Sequence は form-based のみ)
```

- [ ] **Step 21.2: CHANGELOG v0.5.0 entry**

`CHANGELOG.md` の `## [0.4.0]` の前に prepend:

```markdown
## [0.5.0] - 2026-04-26

### Added
- **Overlay-driven editing** for UseCase + Component (`src/modules/{usecase,component}.js` の buildOverlay 実装)
- `src/core/overlay-builder.js` 抽出 — 図形非依存な SVG/DOM プリミティブ (addRect / extractBBox / extractEdgeBBox / pickBestOffset / hitTestTopmost / dedupById)
- `src/core/selection-router.js` 抽出 — overlay click / shift+click / multi-toggle / 空白解除 / highlight 適用
- **Module capability contract** — 各 DiagramModule v2 が overlaySelection / hoverInsert / participantDrag / showInsertForm / multiSelectConnect を明示宣言
- **Multi-select connect** — UseCase + Component で 2 figure を Shift+クリック → Connect panel で関係作成
- **Relation click selection** — UseCase + Component の relation (edge) を SVG クリックで選択 → kind 切替 / swap / label 編集 / delete
- E2E coverage: usecase-overlay (5 tests) + component-overlay (5 tests)
- 18-cell α/γ-form/γ-overlay matrix (UseCase 18 + Component 18 = 36 cells) Evaluator visual sweep PASS

### Changed
- `src/app.js` のハードコード `currentModule === modules['plantuml-sequence']` 比較を `moduleHas('cap')` 経由に全廃 (5 箇所)
- `src/ui/sequence-overlay.js` を core/overlay-builder + core/selection-router へ delegate (sequence 固有のレイアウト知識のみ残存)
- CSS class `.seq-overlay-target` → `.selectable` に統一

### Notes
- v0.6.0 へ繰越: drag-to-connect / package 範囲 wrap / 要素を別 package へ drag / Sequence の multi-select connect / Class diagram (Tier1 残り)

```

- [ ] **Step 21.3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README + CHANGELOG for v0.5.0 Overlay-Driven Editing"
```

---

### Task 22: PR description 草案

**Files:**
- Create: `.git/PR_DESCRIPTION_v0.5.0.md` (commit せず、後で gh pr create で使う)

- [ ] **Step 22.1: PR_DESCRIPTION 草案を書く**

```bash
mkdir -p .git
cat > .git/PR_DESCRIPTION_v0.5.0.md << 'EOF'
## v0.5.0 — Tier1 Overlay-Driven (UseCase + Component)

Spec: `docs/superpowers/specs/2026-04-26-tier1-overlay-driven-design.md`
Plan: `docs/superpowers/plans/2026-04-26-tier1-overlay-driven-v0.5.0.md`

### Summary
- Phase 0: Module capability 契約導入 (master spec § 8.5 を実装)。app.js のハードコード sequence 比較を全廃
- Phase A: `core/overlay-builder.js` + `core/selection-router.js` 抽出 (Rule of Three: sequence + UseCase + Component の 3 実証)
- Phase B: UseCase + Component に overlay-driven UI を実装。relation を click 選択可能、2 figure 選択 → Connect panel
- Phase C: docs + Evaluator visual sweep PASS

### Test Plan
- [x] `npm run test:unit` — 300+ passed
- [x] `npx playwright test --workers=1` — Sprint 0/1/2 + 新規 overlay E2E 10+ pass
- [x] Evaluator 18×2 cell α/γ-form/γ-overlay matrix all PASS
- [x] 観点 A (全要素選択可能) / B (toggle/multi-select) / C (選択中ガイド抑制) / J (id-based dedup) 適用確認

### Out of Scope (v0.6.0+ deferred)
- drag-to-connect (lollipop / port を drag で作成)
- package 範囲 wrap
- 要素を別 package へ drag 移動
- Sequence の multi-select connect

### Acceptance
36-cell pass matrix (UseCase 6 UC × 3 axes + Component 6 UC × 3 axes) all PASS per `.eval/sprint-3/report.md`
EOF
```

- [ ] **Step 22.2: 最終 git status / log 確認**

```bash
git status --short
git log --oneline feat/tier1-overlay-driven ^feat/tier1-component | head -30
```
Expected: 約 22 commits (Task 1 〜 Task 22)。

- [ ] **Step 22.3: Commit (PR description は .git/ 配下なので gitignored、別 commit 不要)**

最終 commit は Task 21 で済んでいるので、ここでは何もしない。

---

## Self-Review Checklist (実装者が plan 完了後に確認)

- [ ] **Spec coverage**: spec § 4 (capability) → Task 1, 2 / § 5 (overlay-builder) → Task 3-6 / § 6 (selection-router) → Task 7 / § 7 (UseCase + Component overlay) → Task 9-17 / § 8 (テスト) → Task 18, 19, 20
- [ ] **Placeholder scan**: 実 code が全 step に含まれている (TBD なし)
- [ ] **Type consistency**:
  - `OB.addRect(overlayEl, x, y, w, h, attrs)` は全 task で同シグネチャ
  - `OB.pickBestOffset(svgEl, items, selector, candidates)` 同
  - `selectionRouter.bind(overlayEl, opts)` / `applyHighlight(overlayEl, selData)` 同
  - DiagramModule の `capabilities` フラグ 5 件は全 module で同じ key set
  - `data-type` 値は全 module で documented set (`actor` / `usecase` / `component` / `interface` / `port` / `package` / `relation` + sequence 既存)

---

## Risk Mitigations

| リスク | task で対策済 |
|---|---|
| sequence regression (Phase 0/A 中) | Task 2.7-2.8, Task 8.5-8.6 で必須 GREEN ゲート |
| UseCase の `g.usecase` セレクタが PlantUML 版で異なる | Task 9.3 で `pickBestOffset` の matchByOrder fallback で吸収 |
| port click が parent component を選択 | Task 15 で port を component の後に addRect (z-order) + spec § 7.3 |
| relation edge bbox が斜め線で hit area が大きい | Task 4 で `extractEdgeBBox(padding=8)`、Visual Sweep で観察して調整 |
| 3+ multi-select で UI 空白 | Task 13.3 の `_renderMultiSelect` で「Connect は 2 まで」メッセージ表示 + Task 18 で E2E 検証 |
| Evaluator round 1 で UC FAIL | Task 20.3 の hotfix → round 2 ループ運用 |
