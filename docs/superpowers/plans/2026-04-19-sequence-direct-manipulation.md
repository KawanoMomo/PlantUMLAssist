# Sequence 直接操作 UX 強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 選択ハイライト / Hover挿入 / Participant drag+color / pulldown新規追加 / StableState互換キーボード / Undo網羅 の 6 capability を追加し、最後に MermaidAssist へ ECN cross-apply する。

**Architecture:** Sprint 1-7 で完成した overlay click → selection → props → updater パイプラインを下地とし、(1) overlay に class ベースの hover/selected 視覚状態、(2) preview container 上に `#hover-layer` SVG 要素を追加して mousemove で水平点線描画、(3) overlay mousedown を閾値判定で click と drag に分岐、(4) 新 updater (`setParticipantColor`, `moveParticipant`) を sequence.js に追加。

**Tech Stack:** ES5 JS (ビルドなし), 既存 `window.MA.*` 名前空間, Node unit runner, Playwright E2E, jsdom 構造テスト。

**関連 spec:** `docs/superpowers/specs/2026-04-19-sequence-direct-manipulation.md`

---

## File Structure

| ファイル | 役割 | Status |
|---|---|---|
| `plantuml-assist.html` | `#hover-layer` SVG + `selected` CSS + color-swatch CSS | 追記 |
| `src/ui/sequence-overlay.js` | `setSelectedHighlight()` (class toggle) + `buildHoverLayer()` | 拡張 |
| `src/modules/sequence.js` | `setParticipantColor` / `moveParticipant` 新 updater + color palette UI + pulldown `__new__` entry | 拡張 |
| `src/ui/rich-label-editor.js` | keydown handler (Tab/Escape) + real-newline → `\n` 変換 | 拡張 |
| `src/app.js` | overlay mousedown → click-vs-drag 判定、hover-layer 配線、history audit | 拡張 |
| `tests/sequence-updater.test.js` | `setParticipantColor` / `moveParticipant` tests | 拡張 |
| `tests/sequence-overlay.test.js` | highlight class / hover-layer rect tests | 拡張 |
| `tests/rich-label.test.js` | Tab/Escape tests | 拡張 |
| `tests/e2e/uc-11..16-*.spec.js` | UC-11 〜 UC-16 E2E (6 ファイル) | **新規** |
| `docs/ecn/ECN-009_direct-manipulation.md` | ECN (Phase 5 起点) | **新規** |
| `05_MermaidAssist/docs/ecn-analysis/ECN-009_analysis.md` | 影響分析 + 差異記録 | **新規** |

---

## Sprint 8: Selection Highlight + Keyboard + Undo audit (Phase 1)

### Task 8.1: selection highlight CSS + overlay class toggle

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/plantuml-assist.html`
- Modify: `E:/00_Git/06_PlantUMLAssist/src/ui/sequence-overlay.js`
- Modify: `E:/00_Git/06_PlantUMLAssist/src/app.js`
- Test: `E:/00_Git/06_PlantUMLAssist/tests/sequence-overlay.test.js`

- [ ] **Step 1: 失敗テスト**

`tests/sequence-overlay.test.js` 末尾に追加:

```javascript
describe('setSelectedHighlight', function() {
  test('adds selected class to matching rect and removes from others', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    // 先頭メッセージ line を取得
    var firstLine = f.parsed.relations[0].line;
    overlay.setSelectedHighlight(overlayEl, [{ type: 'message', line: firstLine }]);
    var selectedRects = overlayEl.querySelectorAll('rect.selected');
    expect(selectedRects.length).toBe(1);
    expect(parseInt(selectedRects[0].getAttribute('data-line'), 10)).toBe(firstLine);
    // 別要素で呼び直すと前の selected は外れる
    overlay.setSelectedHighlight(overlayEl, []);
    expect(overlayEl.querySelectorAll('rect.selected').length).toBe(0);
  });
});
```

- [ ] **Step 2: テスト失敗確認**

Run: `cd E:/00_Git/06_PlantUMLAssist && node tests/run-tests.js`
Expected: FAIL — `overlay.setSelectedHighlight is not a function`

- [ ] **Step 3: 実装**

`src/ui/sequence-overlay.js` の return 直前に追加:

```javascript
  function setSelectedHighlight(overlayEl, selData) {
    if (!overlayEl) return;
    // 全 rect から selected を外す
    var all = overlayEl.querySelectorAll('rect.seq-overlay-target');
    Array.prototype.forEach.call(all, function(r) { r.classList.remove('selected'); });
    if (!selData || selData.length === 0) return;
    // 各 selData に対し type + line (or id) で該当 rect を特定
    selData.forEach(function(s) {
      var selector = 'rect[data-type="' + s.type + '"]';
      if (s.line !== undefined && s.line !== null) selector += '[data-line="' + s.line + '"]';
      var rects = overlayEl.querySelectorAll(selector);
      Array.prototype.forEach.call(rects, function(r) { r.classList.add('selected'); });
    });
  }
```

return オブジェクトに `setSelectedHighlight: setSelectedHighlight,` を追加。

- [ ] **Step 4: CSS を HTML に追加**

`plantuml-assist.html` の `<style>` 内、既存 `#overlay-layer` rules の後に追加:

```css
#overlay-layer rect.seq-overlay-target.selected {
  fill: rgba(124, 140, 248, 0.12);
  stroke: #7c8cf8;
  stroke-width: 2;
  rx: 3;
}
```

- [ ] **Step 5: app.js で selection 変更時に呼ぶ**

`src/app.js` の `renderSvg` 内、`currentModule.buildOverlay(...)` 呼び出しの直後に追加:

```javascript
// 選択状態を SVG に反映
var sel = window.MA.selection.getSelected() || [];
if (window.MA.sequenceOverlay && window.MA.sequenceOverlay.setSelectedHighlight) {
  window.MA.sequenceOverlay.setSelectedHighlight(overlayEl, sel);
}
```

`selection.init` callback にも hook:

```javascript
window.MA.selection.init(function() {
  var overlayEl = document.getElementById('overlay-layer');
  var sel = window.MA.selection.getSelected() || [];
  if (overlayEl && window.MA.sequenceOverlay && window.MA.sequenceOverlay.setSelectedHighlight) {
    window.MA.sequenceOverlay.setSelectedHighlight(overlayEl, sel);
  }
  renderProps();
});
```

- [ ] **Step 6: 確認 + Commit**

```bash
node tests/run-tests.js  # 95 passed (= 94 + 1)
```

```bash
git add plantuml-assist.html src/ui/sequence-overlay.js src/app.js tests/sequence-overlay.test.js
git commit -m "feat(overlay): C14 selection highlight (blue border + tinted fill)"
```

### Task 8.2: StableState 互換 キーボード in rich editor

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/ui/rich-label-editor.js`
- Test: `E:/00_Git/06_PlantUMLAssist/tests/rich-label.test.js`

- [ ] **Step 1: 失敗テスト**

`tests/rich-label.test.js` に追加:

```javascript
describe('keyboard handling', function() {
  test('Tab inserts 2 spaces (workspace ADR-011)', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, 'hello');
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(0, 0);
    ta.focus();
    var ev = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ta.value.substring(0, 2)).toBe('  ');
  });

  test('Shift+Tab removes leading 2 spaces (outdent)', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, '  hello');
    var ta = container.querySelector('.rle-textarea');
    ta.setSelectionRange(4, 4);
    ta.focus();
    var ev = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ta.value).toBe('hello');
  });

  test('Escape dispatches rle-escape custom event', function() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    RLE.mount(container, 'x');
    var ta = container.querySelector('.rle-textarea');
    var fired = false;
    container.addEventListener('rle-escape', function() { fired = true; });
    var ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(fired).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/run-tests.js`
Expected: FAIL (Tab 後も先頭 2 文字が 'he' のまま等)

- [ ] **Step 3: 実装**

`src/ui/rich-label-editor.js` の `mount()` 内、textarea の input/change リスナー追加の後に追加:

```javascript
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Tab' && !e.isComposing) {
        e.preventDefault();
        var s = ta.selectionStart, ed = ta.selectionEnd;
        if (e.shiftKey) {
          // outdent: 行頭の 2空白を除去
          var before = ta.value.substring(0, s);
          var lineStart = before.lastIndexOf('\n') + 1;
          if (ta.value.substring(lineStart, lineStart + 2) === '  ') {
            ta.value = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + 2);
            ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - 2);
          }
        } else {
          // indent: 2空白挿入
          ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(ed);
          ta.selectionStart = ta.selectionEnd = s + 2;
        }
        ta.dispatchEvent(new window.Event('input', { bubbles: true }));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        container.dispatchEvent(new window.CustomEvent('rle-escape', { bubbles: true }));
      }
    });
```

- [ ] **Step 4: 実改行 → `\n` 変換**

`mount()` の return `getValue` を修正:

```javascript
    return {
      getValue: function() {
        // 実改行 (\n) を PlantUML literal の '\n' (2文字) に変換
        return ta.value.replace(/\n/g, '\\n');
      },
      setValue: function(v) { ta.value = (v || '').replace(/\\n/g, '\n'); refreshPreview(); },
      element: ta,
    };
```

`plantumlToHtml` も literal `\n` と実改行の両方を `<br>` に変換:

```javascript
  function plantumlToHtml(s) {
    if (!s) return '';
    var out = escHtml(s);
    out = out.replace(/\\n/g, '<br>'); // literal \n
    out = out.replace(/\n/g, '<br>');   // real newline
    // ...残り同じ
    return out;
  }
```

- [ ] **Step 5: 確認 + Commit**

```bash
node tests/run-tests.js  # 98 passed (= 95 + 3)
```

```bash
git add src/ui/rich-label-editor.js tests/rich-label.test.js
git commit -m "feat(rich-label): C18 StableState-compatible keyboard (Tab/Escape/newline conversion)"
```

### Task 8.3: Undo audit

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/modules/sequence.js`

- [ ] **Step 1: 監査 — 全 change handler に pushHistory があるか**

```bash
cd E:/00_Git/06_PlantUMLAssist
grep -n "addEventListener.*change\|bindEvent.*change\|bindTextField" src/modules/sequence.js | head -40
grep -n "pushHistory" src/modules/sequence.js | head -30
```

各 change listener の前に `window.MA.history.pushHistory();` があることを確認。missing の場合は修正。

- [ ] **Step 2: E2E で undo 動作確認**

`tests/e2e/uc-16-undo-coverage.spec.js` を作成:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-16: Undo coverage', () => {
  test('participant alias edit can be undone', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    // 参加者 User を選択して alias 変更
    await clickOverlayByLine(page, 3);  // actor User (parser line 3)
    await page.waitForTimeout(300);
    var originalText = await getEditorText(page);

    await page.locator('#seq-edit-alias').fill('Customer');
    await page.locator('#seq-edit-alias').blur();
    await page.waitForTimeout(500);
    var changedText = await getEditorText(page);
    expect(changedText).toContain('Customer');
    expect(changedText).not.toBe(originalText);

    // Ctrl+Z で戻す
    await page.locator('#btn-undo').click();
    await page.waitForTimeout(500);
    var undoneText = await getEditorText(page);
    expect(undoneText).toBe(originalText);
  });

  test('message label edit can be undone', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);  // User -> System : Request
    await page.waitForTimeout(300);
    var originalText = await getEditorText(page);

    await page.locator('#seq-edit-msg-label-rle .rle-textarea').fill('AuthRequest');
    await page.locator('#seq-edit-msg-label-rle .rle-textarea').blur();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toContain('AuthRequest');

    await page.locator('#btn-undo').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(originalText);
  });
});
```

- [ ] **Step 3: test 実行 + 不具合修正**

Run: `npx playwright test tests/e2e/uc-16-*`
Expected: PASS (Sprint 1-7 で大半の handler に pushHistory は入っているはず)

FAIL の場合は該当 handler の pushHistory を追加して再実行。

- [ ] **Step 4: Commit**

```bash
git add src/modules/sequence.js tests/e2e/uc-16-undo-coverage.spec.js
git commit -m "feat(sequence): C20 undo coverage + UC-16 E2E"
```

### Task 8.4: Sprint 8 marker

- [ ] **Step 1: 全 unit + E2E pass 確認**

```bash
node tests/run-tests.js   # 98 passed
npx playwright test       # 既存 + UC-16 = 17 pass (3 skipped 維持)
```

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore: Sprint 8 complete (highlight + keyboard + undo: 98 unit + 17 E2E)"
```

---

## Sprint 9: Hover 挿入 + pulldown 新規追加 (Phase 2)

### Task 9.1: hover-layer element + buildHoverLayer()

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/plantuml-assist.html`
- Modify: `E:/00_Git/06_PlantUMLAssist/src/ui/sequence-overlay.js`
- Test: `E:/00_Git/06_PlantUMLAssist/tests/sequence-overlay.test.js`

- [ ] **Step 1: HTML に hover-layer 追加**

`plantuml-assist.html` の `<svg id="overlay-layer" ...>` の直後に:

```html
<svg id="hover-layer" width="0" height="0" style="position:absolute;top:16px;left:16px;pointer-events:none;transform-origin:0 0;"></svg>
```

- [ ] **Step 2: 失敗テスト**

`tests/sequence-overlay.test.js` に追加:

```javascript
describe('resolveInsertLine', function() {
  test('y below first message returns position after line 1 message', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    // firstMsgLine = parsed.relations[0].line
    var firstMsgLine = f.parsed.relations[0].line;
    // 最初のメッセージより下・2 番目のメッセージより上の y で resolve
    var res = overlay.resolveInsertLine(overlayEl, 80);
    expect(res).toBeDefined();
    expect(res.position).toBe('after');
    expect(typeof res.line).toBe('number');
  });

  test('returns null when overlay has no messages', function() {
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(overlay.resolveInsertLine(overlayEl, 100)).toBe(null);
  });
});
```

- [ ] **Step 3: `resolveInsertLine(overlayEl, y)` 実装**

`src/ui/sequence-overlay.js` に追加:

```javascript
  function resolveInsertLine(overlayEl, y) {
    if (!overlayEl) return null;
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    if (msgRects.length === 0) return null;
    // 各 rect の y 中心を取得して昇順に並べる
    var items = Array.prototype.map.call(msgRects, function(r) {
      return {
        line: parseInt(r.getAttribute('data-line'), 10),
        y: parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2,
      };
    }).sort(function(a, b) { return a.y - b.y; });
    // y がどの rect の y より下か判定
    for (var i = items.length - 1; i >= 0; i--) {
      if (y > items[i].y) return { line: items[i].line, position: 'after' };
    }
    // 全 rect より上 → 最上位 rect の before
    return { line: items[0].line, position: 'before' };
  }
```

return オブジェクトに `resolveInsertLine: resolveInsertLine,` 追加。

- [ ] **Step 4: 確認 + Commit**

```bash
node tests/run-tests.js  # 100 passed (= 98 + 2)
```

```bash
git add plantuml-assist.html src/ui/sequence-overlay.js tests/sequence-overlay.test.js
git commit -m "feat(overlay): C16 resolveInsertLine helper (y -> line + position)"
```

### Task 9.2: hover guide 描画 + click で挿入

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/app.js`
- Modify: `E:/00_Git/06_PlantUMLAssist/plantuml-assist.html`

- [ ] **Step 1: CSS 追加**

`plantuml-assist.html` の `<style>` 内:

```css
#hover-layer .hover-guide {
  stroke: #7c8cf8;
  stroke-width: 1.5;
  stroke-dasharray: 3,3;
  pointer-events: none;
}
#hover-layer .hover-label {
  fill: #7c8cf8;
  font-size: 10px;
  font-family: 'IBM Plex Mono', monospace;
  font-weight: bold;
  pointer-events: none;
}
```

- [ ] **Step 2: app.js の mousemove/click 配線**

`init()` 内に追加:

```javascript
  // Hover layer — preview container 内の空白部分で水平ガイド
  var previewContainer = document.getElementById('preview-container');
  var hoverEl = document.getElementById('hover-layer');
  var overlayElForHover = document.getElementById('overlay-layer');

  function clearHoverGuide() {
    while (hoverEl.firstChild) hoverEl.removeChild(hoverEl.firstChild);
  }

  function drawHoverGuide(y, label) {
    clearHoverGuide();
    var w = parseFloat(overlayElForHover.getAttribute('width')) || 800;
    var lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('x1', 0);
    lineEl.setAttribute('y1', y);
    lineEl.setAttribute('x2', w);
    lineEl.setAttribute('y2', y);
    lineEl.setAttribute('class', 'hover-guide');
    hoverEl.appendChild(lineEl);
    var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', 10);
    text.setAttribute('y', y - 3);
    text.setAttribute('class', 'hover-label');
    text.textContent = label;
    hoverEl.appendChild(text);
    // overlay と hover を同サイズに同期
    hoverEl.setAttribute('width', overlayElForHover.getAttribute('width'));
    hoverEl.setAttribute('height', overlayElForHover.getAttribute('height'));
    hoverEl.setAttribute('viewBox', overlayElForHover.getAttribute('viewBox'));
    hoverEl.style.transform = overlayElForHover.style.transform;
  }

  previewContainer.addEventListener('mousemove', function(e) {
    // overlay rect 上にある場合は guide 非表示 (click 時は rect の click を優先)
    var target = e.target;
    if (target.getAttribute && target.getAttribute('data-type')) {
      clearHoverGuide();
      return;
    }
    // preview container 内相対座標
    var svg = document.getElementById('preview-svg');
    if (!svg || !overlayElForHover) { clearHoverGuide(); return; }
    var rect = overlayElForHover.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      clearHoverGuide();
      return;
    }
    // zoom 反映
    var z = zoom || 1;
    var y = (e.clientY - rect.top) / z;
    drawHoverGuide(y, '+ ここに挿入');
  });

  previewContainer.addEventListener('mouseleave', clearHoverGuide);

  previewContainer.addEventListener('click', function(e) {
    // rect 上の click は既存 overlay click ハンドラが処理。ここは空白部分のみ
    var target = e.target;
    if (target.getAttribute && target.getAttribute('data-type')) return;
    if (!overlayElForHover || !currentModule) return;
    var rect = overlayElForHover.getBoundingClientRect();
    var z = zoom || 1;
    var y = (e.clientY - rect.top) / z;
    if (!window.MA.sequenceOverlay || !window.MA.sequenceOverlay.resolveInsertLine) return;
    var res = window.MA.sequenceOverlay.resolveInsertLine(overlayElForHover, y);
    if (!res) return;
    // 既存 modal をトリガ (message 挿入)
    if (currentModule.showInsertForm) {
      currentModule.showInsertForm({
        getMmdText: function() { return mmdText; },
        setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; },
        onUpdate: function() { scheduleRefresh(); },
      }, res.line, res.position, 'message');
    }
    clearHoverGuide();
  });
```

- [ ] **Step 3: sequence.js の `_showInsertForm` を外部 API として公開**

現状 private な `_showInsertForm` をモジュール return に追加 (名前は `showInsertForm` で公開):

```javascript
    showInsertForm: function(ctx, line, position, kind) {
      _showInsertForm(ctx, line, position, kind);
    },
```

- [ ] **Step 4: 手動確認**

サーバ起動 → online モード → preview の空白部分にマウス → 水平点線 + 「+ ここに挿入」表示 → クリック → modal 出現

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/modules/sequence.js plantuml-assist.html
git commit -m "feat(overlay): C15 hover-to-insert guide + click opens insert modal"
```

### Task 9.3: pulldown `+ 新規追加` entry

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/modules/sequence.js`
- Modify: `E:/00_Git/06_PlantUMLAssist/src/ui/properties.js` (可能なら拡張)
- Test: `E:/00_Git/06_PlantUMLAssist/tests/sequence-updater.test.js`

- [ ] **Step 1: tail-add メニューの from/to select に `__new__` 追加**

`src/modules/sequence.js` の `renderTailDetail` 内 message 分岐、partOpts 生成後に追加:

```javascript
          var partOptsWithNew = partOpts.slice();
          partOptsWithNew.push({ value: '__new__', label: '+ 新規追加…' });
```

selectFieldHtml 呼び出しを `partOptsWithNew` に変更:
- `P.selectFieldHtml('From', 'seq-tail-from', partOptsWithNew)`
- `P.selectFieldHtml('To', 'seq-tail-to', partOptsWithNew)`

- [ ] **Step 2: change で `__new__` 選択 → inline input 展開**

`renderTailDetail` の message 分岐 html の末尾 (`P.primaryButtonHtml('seq-tail-add', ...)` の前) に inline container 追加:

```javascript
html += '<div id="seq-tail-new-inline" style="display:none;margin-top:6px;padding:8px;background:var(--bg-tertiary);border-left:3px solid var(--accent-green);border-radius:3px;">' +
  '<label style="display:block;font-size:10px;color:var(--accent-green);margin-bottom:4px;">新しい参加者を作成</label>' +
  '<input id="seq-tail-new-alias" type="text" placeholder="Alias (必須)" style="width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;margin-bottom:4px;">' +
  '<select id="seq-tail-new-ptype" style="width:100%;background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;">' +
    PARTICIPANT_TYPES.map(function(pt) { return '<option value="' + pt + '">' + pt + '</option>'; }).join('') +
  '</select>' +
  '</div>';
```

After `detailEl.innerHTML = html;`:

```javascript
          // from/to の __new__ 選択を監視
          var inline = document.getElementById('seq-tail-new-inline');
          function maybeShowInline() {
            var fr = document.getElementById('seq-tail-from').value;
            var to = document.getElementById('seq-tail-to').value;
            inline.style.display = (fr === '__new__' || to === '__new__') ? 'block' : 'none';
          }
          document.getElementById('seq-tail-from').addEventListener('change', maybeShowInline);
          document.getElementById('seq-tail-to').addEventListener('change', maybeShowInline);
```

- [ ] **Step 3: `seq-tail-add` クリックで先に participant 作成**

既存 click handler の message 分岐を修正:

```javascript
            if (kind === 'message') {
              var fr = document.getElementById('seq-tail-from').value;
              var to = document.getElementById('seq-tail-to').value;
              // __new__ なら先に participant を作成してから使う
              if (fr === '__new__' || to === '__new__') {
                var al = document.getElementById('seq-tail-new-alias').value.trim();
                if (!al) { alert('新しい参加者の Alias は必須です'); return; }
                var ptype = document.getElementById('seq-tail-new-ptype').value;
                window.MA.history.pushHistory();
                t = addParticipant(t, ptype, al, al);
                if (fr === '__new__') fr = al;
                if (to === '__new__') to = al;
              } else {
                window.MA.history.pushHistory();
              }
              out = addMessage(t, fr, to, document.getElementById('seq-tail-arrow').value,
                (rleObj ? rleObj.getValue() : '').trim());
            }
```

(既存の pushHistory 呼び出しを重複させないよう注意: new participant 分岐で pushHistory 1 回、else で pushHistory 1 回)

- [ ] **Step 4: 手動確認**

サーバ起動 → 末尾追加 menu → From pulldown → 「+ 新規追加…」選択 → inline 入力欄が緑帯で出現 → Alias 'Cache' 入力 → 本文入力 → 追加 → editor に `participant Cache` と `User -> Cache : ...` の 2 行が挿入される

- [ ] **Step 5: Commit**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): C17 pulldown +新規追加 for on-the-fly participant creation"
```

### Task 9.4: Sprint 9 marker

- [ ] **Step 1: unit + E2E 確認**

```bash
node tests/run-tests.js   # 100 passed 維持
npx playwright test       # 17 passed 維持
```

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore: Sprint 9 complete (hover-insert + pulldown-new)"
```

---

## Sprint 10: Drag 並び替え + Color (Phase 3)

### Task 10.1: `setParticipantColor` updater

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/modules/sequence.js`
- Test: `E:/00_Git/06_PlantUMLAssist/tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗テスト**

```javascript
describe('setParticipantColor', function() {
  test('appends #HEX to participant line', function() {
    var text = '@startuml\nparticipant System\n@enduml';
    var out = seq.setParticipantColor(text, 'System', '#FFAAAA');
    expect(out).toContain('participant System #FFAAAA');
  });

  test('replaces existing #HEX', function() {
    var text = '@startuml\nparticipant System #FFAAAA\n@enduml';
    var out = seq.setParticipantColor(text, 'System', '#AAEEAA');
    expect(out).toContain('participant System #AAEEAA');
    expect(out).not.toContain('#FFAAAA');
  });

  test('removes color when hex is null', function() {
    var text = '@startuml\nparticipant System #FFAAAA\n@enduml';
    var out = seq.setParticipantColor(text, 'System', null);
    expect(out).toContain('participant System');
    expect(out).not.toContain('#FFAAAA');
  });

  test('handles quoted alias', function() {
    var text = '@startuml\nparticipant "My Server" as MS\n@enduml';
    var out = seq.setParticipantColor(text, 'MS', '#FFAAAA');
    expect(out).toContain('participant "My Server" as MS #FFAAAA');
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `seq.setParticipantColor is not a function`

- [ ] **Step 3: 実装**

`src/modules/sequence.js` に追加:

```javascript
  function setParticipantColor(text, alias, hex) {
    if (!alias) return text;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var trimmed = ln.trim();
      var m = trimmed.match(PART_RE);
      if (!m) continue;
      var aliasInLine = (m[2] !== undefined) ? m[3] : m[4];
      if (aliasInLine !== alias) continue;
      // 既存の末尾 #HEX を除去
      var base = ln.replace(/\s+#[0-9A-Fa-f]{6}\s*$/, '').replace(/\s+$/, '');
      if (hex) {
        lines[i] = base + ' ' + hex;
      } else {
        lines[i] = base;
      }
      break;
    }
    return lines.join('\n');
  }
```

return に `setParticipantColor: setParticipantColor,` 追加。

NOTE: PART_RE は `participant Foo #HEX` 形式に match しないため、色付き行は parser 側でもサポートが必要な場合があるが、parseSequence は `\s*$` で尻部を許容しているか要確認。もし parser が色付き行を認識しない場合、このタスクで PART_RE と parseSequence の match を調整。

- [ ] **Step 4: PASS + Commit**

```bash
node tests/run-tests.js  # 104 passed (= 100 + 4)
```

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): setParticipantColor updater (#HEX suffix)"
```

### Task 10.2: color palette UI in props panel

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/modules/sequence.js`

- [ ] **Step 1: participant 編集 panel に色セクション追加**

`renderProps` の participant 分岐内、`actionBarHtml(pp.line, 'participant')` の前に追加:

```javascript
          var colors = ['#FFAAAA', '#FFD700', '#AAEEAA', '#AACCFF', '#E0AAFF', '#FFB88C', '#D3D3D3'];
          var currentColor = null;
          var pLine = ctx.getMmdText().split('\n')[pp.line - 1];
          var cm = pLine && pLine.match(/#[0-9A-Fa-f]{6}/);
          if (cm) currentColor = cm[0];
          var paletteHtml = '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">色</label>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
              '<button class="seq-color-swatch" data-color="" title="色なし" style="width:22px;height:22px;background:transparent;border:1px dashed var(--text-secondary);border-radius:4px;cursor:pointer;' + (currentColor === null ? 'box-shadow:0 0 0 2px var(--accent);' : '') + '"></button>' +
              colors.map(function(c) {
                var selStyle = (currentColor && currentColor.toLowerCase() === c.toLowerCase()) ? 'box-shadow:0 0 0 2px var(--accent);border-color:#fff;' : '';
                return '<button class="seq-color-swatch" data-color="' + c + '" title="' + c + '" style="width:22px;height:22px;background:' + c + ';border:2px solid var(--bg-secondary);border-radius:4px;cursor:pointer;' + selStyle + '"></button>';
              }).join('') +
            '</div>' +
          '</div>';
```

propsEl.innerHTML の actionBarHtml の前に `paletteHtml` を挿入:

```javascript
          propsEl.innerHTML =
            '<div style="background:...">...</div>' +
            P.selectFieldHtml('Type', ...) +
            P.fieldHtml('Alias', ...) +
            '<div ...>Label...</div>' +
            '<label ...>Alias 変更時...</label>' +
            paletteHtml +
            actionBarHtml(pp.line, 'participant');
```

- [ ] **Step 2: swatch クリック handler 配線**

participant 分岐の既存 handler 設定の最後に追加:

```javascript
          P.bindAllByClass(propsEl, 'seq-color-swatch', function(btn) {
            var c = btn.getAttribute('data-color');
            window.MA.history.pushHistory();
            ctx.setMmdText(setParticipantColor(ctx.getMmdText(), pp.id, c || null));
            ctx.onUpdate();
          });
```

- [ ] **Step 3: 手動確認 + Commit**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): C19 color palette (8 swatches) in participant panel"
```

### Task 10.3: `moveParticipant` updater

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/modules/sequence.js`
- Test: `E:/00_Git/06_PlantUMLAssist/tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗テスト**

```javascript
describe('moveParticipant', function() {
  test('moves participant to new index', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nparticipant C\n@enduml';
    var out = seq.moveParticipant(text, 'C', 0);  // C を先頭に
    var lines = out.split('\n').filter(function(l) { return l.indexOf('participant') === 0; });
    expect(lines[0]).toContain('participant C');
    expect(lines[1]).toContain('participant A');
    expect(lines[2]).toContain('participant B');
  });

  test('moves participant to middle', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nparticipant C\n@enduml';
    var out = seq.moveParticipant(text, 'A', 1);  // A を B と C の間に
    var lines = out.split('\n').filter(function(l) { return l.indexOf('participant') === 0; });
    expect(lines[0]).toContain('participant B');
    expect(lines[1]).toContain('participant A');
    expect(lines[2]).toContain('participant C');
  });

  test('preserves other lines (messages, notes) in original positions relative to their line', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nA -> B : msg\n@enduml';
    var out = seq.moveParticipant(text, 'B', 0);
    expect(out).toContain('participant B');
    expect(out).toContain('A -> B : msg');
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/run-tests.js`
Expected: FAIL

- [ ] **Step 3: 実装**

```javascript
  function moveParticipant(text, alias, newIndex) {
    if (!alias) return text;
    var lines = text.split('\n');
    // participant 行だけ抽出して順序記録
    var partIndexes = [];  // {lineIdx, alias}
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      var m = trimmed.match(PART_RE);
      if (m) {
        var al = (m[2] !== undefined) ? m[3] : m[4];
        partIndexes.push({ lineIdx: i, alias: al });
      }
    }
    // 対象 participant の現在位置
    var from = -1;
    for (var j = 0; j < partIndexes.length; j++) {
      if (partIndexes[j].alias === alias) { from = j; break; }
    }
    if (from < 0) return text;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= partIndexes.length) newIndex = partIndexes.length - 1;
    if (from === newIndex) return text;
    // 該当 line を抜き出して新位置へ splice
    var fromLineIdx = partIndexes[from].lineIdx;
    var lineContent = lines[fromLineIdx];
    lines.splice(fromLineIdx, 1);
    // partIndexes を再計算して挿入先の lineIdx を得る
    var remaining = partIndexes.filter(function(p, idx) { return idx !== from; });
    var toLineIdx;
    if (newIndex >= remaining.length) {
      toLineIdx = remaining[remaining.length - 1].lineIdx + 1;
      if (fromLineIdx < toLineIdx) toLineIdx--;  // 削除でズレた分を調整
    } else {
      toLineIdx = remaining[newIndex].lineIdx;
      if (fromLineIdx < toLineIdx) toLineIdx--;
    }
    lines.splice(toLineIdx, 0, lineContent);
    return lines.join('\n');
  }
```

return に `moveParticipant: moveParticipant,` 追加。

- [ ] **Step 4: PASS + Commit**

```bash
node tests/run-tests.js  # 107 passed (= 104 + 3)
```

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): moveParticipant updater (reorder by new index)"
```

### Task 10.4: drag 判定 + ghost + drop indicator in app.js

**Files:**
- Modify: `E:/00_Git/06_PlantUMLAssist/src/app.js`
- Modify: `E:/00_Git/06_PlantUMLAssist/plantuml-assist.html`

- [ ] **Step 1: CSS 追加**

`plantuml-assist.html` の `<style>`:

```css
.seq-drag-ghost {
  position: fixed;
  pointer-events: none;
  background: rgba(124,140,248,0.25);
  border: 2px dashed #7c8cf8;
  color: #7c8cf8;
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  z-index: 2000;
  transform: translate(-50%, -50%);
}
#hover-layer .drop-indicator {
  stroke: #7c8cf8;
  stroke-width: 2;
  stroke-dasharray: 6,3;
  pointer-events: none;
}
```

- [ ] **Step 2: overlay mousedown ハンドラ拡張**

既存 `overlayEl.addEventListener('click', ...)` の前 (or 代わり) に:

```javascript
  // drag / click 判定
  var dragState = null;  // { id, startX, startY, ghostEl, participants } or null
  overlayEl.addEventListener('mousedown', function(e) {
    var target = e.target;
    if (!target.getAttribute) return;
    var type = target.getAttribute('data-type');
    if (type !== 'participant') return;  // drag 対象は participant のみ
    var id = target.getAttribute('data-id');
    dragState = {
      id: id,
      startX: e.clientX,
      startY: e.clientY,
      ghostEl: null,
      dragging: false,
    };
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    var dist = Math.sqrt(dx*dx + dy*dy);
    if (!dragState.dragging && dist > 4) {
      // drag 開始: ghost 作成
      dragState.dragging = true;
      var g = document.createElement('div');
      g.className = 'seq-drag-ghost';
      g.textContent = dragState.id;
      g.style.left = e.clientX + 'px';
      g.style.top = e.clientY + 'px';
      document.body.appendChild(g);
      dragState.ghostEl = g;
    }
    if (dragState.dragging) {
      dragState.ghostEl.style.left = e.clientX + 'px';
      dragState.ghostEl.style.top = e.clientY + 'px';
      // drop indicator: 最寄りの participant 境界に縦点線
      drawDropIndicator(e.clientX);
    }
  });

  document.addEventListener('mouseup', function(e) {
    if (!dragState) return;
    if (dragState.dragging) {
      // drop: 最寄り index を計算して moveParticipant
      var newIndex = computeDropIndex(e.clientX);
      if (newIndex !== null && currentModule) {
        window.MA.history.pushHistory();
        if (currentModule.moveParticipant) {
          mmdText = currentModule.moveParticipant(mmdText, dragState.id, newIndex);
        } else if (window.MA.modules.plantumlSequence && window.MA.modules.plantumlSequence.moveParticipant) {
          mmdText = window.MA.modules.plantumlSequence.moveParticipant(mmdText, dragState.id, newIndex);
        }
        suppressSync = true;
        editorEl.value = mmdText;
        suppressSync = false;
        scheduleRefresh();
      }
      if (dragState.ghostEl) document.body.removeChild(dragState.ghostEl);
      clearDropIndicator();
    }
    dragState = null;
  });

  // Escape で drag cancel
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && dragState && dragState.dragging) {
      if (dragState.ghostEl) document.body.removeChild(dragState.ghostEl);
      clearDropIndicator();
      dragState = null;
    }
  });

  function drawDropIndicator(clientX) {
    var hoverEl = document.getElementById('hover-layer');
    var overlay = document.getElementById('overlay-layer');
    if (!hoverEl || !overlay) return;
    // 既存 indicator を消す
    var old = hoverEl.querySelector('.drop-indicator');
    if (old) old.parentNode.removeChild(old);
    // participant rect を取得して x 境界を計算
    var partRects = overlay.querySelectorAll('rect[data-type="participant"]');
    if (partRects.length === 0) return;
    var rectBBox = overlay.getBoundingClientRect();
    var z = zoom || 1;
    var localX = (clientX - rectBBox.left) / z;
    // 最寄りの境界 x を探す
    var boundaries = [0];
    Array.prototype.forEach.call(partRects, function(r) {
      var x = parseFloat(r.getAttribute('x'));
      var w = parseFloat(r.getAttribute('width'));
      boundaries.push(x + w / 2);
    });
    boundaries.push(parseFloat(overlay.getAttribute('width')));
    var bestX = boundaries[0];
    var bestDist = Infinity;
    for (var i = 0; i < boundaries.length; i++) {
      var d = Math.abs(localX - boundaries[i]);
      if (d < bestDist) { bestDist = d; bestX = boundaries[i]; }
    }
    var h = parseFloat(overlay.getAttribute('height')) || 400;
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', bestX);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', bestX);
    line.setAttribute('y2', h);
    line.setAttribute('class', 'drop-indicator');
    hoverEl.appendChild(line);
  }

  function clearDropIndicator() {
    var hoverEl = document.getElementById('hover-layer');
    if (!hoverEl) return;
    var old = hoverEl.querySelector('.drop-indicator');
    if (old) old.parentNode.removeChild(old);
  }

  function computeDropIndex(clientX) {
    var overlay = document.getElementById('overlay-layer');
    if (!overlay) return null;
    var partRects = overlay.querySelectorAll('rect[data-type="participant"]');
    if (partRects.length === 0) return null;
    var rectBBox = overlay.getBoundingClientRect();
    var z = zoom || 1;
    var localX = (clientX - rectBBox.left) / z;
    // 各 participant rect の中心で sort、localX がどの index に落ちるか判定
    var centers = Array.prototype.map.call(partRects, function(r) {
      return parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
    }).sort(function(a, b) { return a - b; });
    var idx = 0;
    for (var i = 0; i < centers.length; i++) {
      if (localX > centers[i]) idx = i + 1;
    }
    return idx;
  }
```

NOTE: 既存 click handler との競合を避けるため、mousedown で dragState を保持 → mouseup で drag でなければ既存 click flow に任せる。click イベントは dragging 中 `preventDefault` しないので自然に発火する。

- [ ] **Step 3: 手動確認**

- participant ヘッダを mousedown → 4px 動かす → ghost 出現 + 縦点線 → mouseup で順序変わる
- 動かさず release → click = selection 発火 (既存)
- drag 中 Escape → cancel

- [ ] **Step 4: Commit**

```bash
git add src/app.js plantuml-assist.html
git commit -m "feat(app): C19 participant drag-reorder (ghost + drop indicator + Escape cancel)"
```

### Task 10.5: Sprint 10 marker

- [ ] **Step 1: 全 unit + E2E 確認**

```bash
node tests/run-tests.js   # 107 passed
npx playwright test       # 既存 17 passed 維持
```

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore: Sprint 10 complete (drag + color)"
```

---

## Sprint 11: UC-11〜UC-15 E2E (Phase 4)

UC-16 は Sprint 8 で実装済。残り 5 UC を spec files に落とす。

### Task 11.1: UC-11 selection-highlight E2E

**Files:**
- Create: `E:/00_Git/06_PlantUMLAssist/tests/e2e/uc-11-selection-highlight.spec.js`

- [ ] **Step 1: spec**

```javascript
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, clickOverlayByLine } = require('./helpers');

test.describe('UC-11: selection highlight', () => {
  test('clicked message overlay gets selected class', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    // 選択された rect に class "selected" が付く
    var selCount = await page.locator('#overlay-layer rect.selected').count();
    expect(selCount).toBe(1);
    var selLine = await page.locator('#overlay-layer rect.selected').first().getAttribute('data-line');
    expect(selLine).toBe('7');

    // 別 rect を click すると切り替わる
    await clickOverlayByLine(page, 8);
    await page.waitForTimeout(400);
    selCount = await page.locator('#overlay-layer rect.selected').count();
    expect(selCount).toBe(1);
    selLine = await page.locator('#overlay-layer rect.selected').first().getAttribute('data-line');
    expect(selLine).toBe('8');
  });
});
```

- [ ] **Step 2: test 実行 + Commit**

```bash
npx playwright test tests/e2e/uc-11-*
git add tests/e2e/uc-11-selection-highlight.spec.js
git commit -m "test(e2e): UC-11 selection highlight"
```

### Task 11.2: UC-12 hover-insert E2E

**Files:**
- Create: `E:/00_Git/06_PlantUMLAssist/tests/e2e/uc-12-hover-insert.spec.js`

- [ ] **Step 1: spec**

```javascript
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

test.describe('UC-12: hover-to-insert', () => {
  test('click on empty preview area opens insert modal', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    // preview container 内の空白部分 (SVG 右下、overlay 外) を click
    var container = await page.locator('#preview-container').boundingBox();
    // メッセージ rects の y より少し下のエリアを click
    await page.mouse.move(container.x + container.width / 2, container.y + 200);
    await page.waitForTimeout(300);
    await page.mouse.click(container.x + container.width / 2, container.y + 200);
    await page.waitForTimeout(500);

    // modal が出ている
    var modalVisible = await page.locator('#seq-modal').isVisible();
    expect(modalVisible).toBe(true);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/uc-12-hover-insert.spec.js
git commit -m "test(e2e): UC-12 hover-insert (click empty area opens modal)"
```

### Task 11.3: UC-13 pulldown-new E2E

**Files:**
- Create: `E:/00_Git/06_PlantUMLAssist/tests/e2e/uc-13-pulldown-new.spec.js`

- [ ] **Step 1: spec**

```javascript
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

test.describe('UC-13: pulldown new participant', () => {
  test('selecting +新規追加 in From and filling alias creates participant + message', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    // 末尾追加 menu で message kind
    await page.locator('#seq-tail-kind').selectOption('message');
    await page.waitForTimeout(300);
    await page.locator('#seq-tail-from').selectOption('__new__');
    await page.waitForTimeout(300);

    // inline input が出る
    var inlineVisible = await page.locator('#seq-tail-new-inline').isVisible();
    expect(inlineVisible).toBe(true);

    await page.locator('#seq-tail-new-alias').fill('Cache');
    await page.locator('#seq-tail-new-ptype').selectOption('participant');
    // To は既存 User
    await page.locator('#seq-tail-to').selectOption('User');
    await page.locator('#seq-tail-label-rle .rle-textarea').fill('probe');

    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(600);

    var t = await getEditorText(page);
    expect(t).toContain('participant Cache');
    expect(t).toContain('Cache -> User : probe');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/uc-13-pulldown-new.spec.js
git commit -m "test(e2e): UC-13 pulldown +新規追加 creates participant + message"
```

### Task 11.4: UC-14 keyboard E2E

**Files:**
- Create: `E:/00_Git/06_PlantUMLAssist/tests/e2e/uc-14-stablestate-keyboard.spec.js`

- [ ] **Step 1: spec**

```javascript
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, clickOverlayByLine } = require('./helpers');

test.describe('UC-14: StableState-compatible keyboard in rich editor', () => {
  test('Tab in rich textarea inserts 2 spaces', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    var ta = page.locator('#seq-edit-msg-label-rle .rle-textarea');
    await ta.fill('hello');
    // カーソルを先頭に
    await ta.evaluate((el) => el.setSelectionRange(0, 0));
    await ta.focus();
    await page.keyboard.press('Tab');
    var val = await ta.inputValue();
    expect(val.substring(0, 2)).toBe('  ');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/uc-14-stablestate-keyboard.spec.js
git commit -m "test(e2e): UC-14 StableState keyboard (Tab=2spc in rich editor)"
```

### Task 11.5: UC-15 drag + color E2E

**Files:**
- Create: `E:/00_Git/06_PlantUMLAssist/tests/e2e/uc-15-drag-color.spec.js`

- [ ] **Step 1: spec**

```javascript
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-15: drag reorder + color', () => {
  test('color palette swatch applies #HEX to participant', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 4);  // participant System (parser line 4)
    await page.waitForTimeout(400);

    await page.locator('.seq-color-swatch[data-color="#FFAAAA"]').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('participant System #FFAAAA');
  });

  test('drag participant (via moveParticipant direct call)', async ({ page }) => {
    // 実 drag は mousedown/move/up の組み合わせで複雑なので API 直接呼び出しでロジック検証
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    var result = await page.evaluate(() => {
      var seq = window.MA.modules.plantumlSequence;
      var ed = document.getElementById('editor');
      var newText = seq.moveParticipant(ed.value, 'DB', 0);
      ed.value = newText;
      ed.dispatchEvent(new Event('input'));
      return newText;
    });
    await page.waitForTimeout(500);

    // DB 行が participant System より前に来る
    var lines = result.split('\n');
    var dbIdx = lines.findIndex(l => l.indexOf('DB') >= 0 && (l.indexOf('database') === 0 || l.indexOf('participant') === 0 || l.indexOf('actor') === 0));
    var sysIdx = lines.findIndex(l => l.indexOf('participant System') === 0);
    expect(dbIdx).toBeGreaterThanOrEqual(0);
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(dbIdx).toBeLessThan(sysIdx);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/uc-15-drag-color.spec.js
git commit -m "test(e2e): UC-15 drag reorder (logic) + color palette"
```

### Task 11.6: Sprint 11 marker

- [ ] **Step 1: 全 UC E2E + 既存 E2E 確認**

```bash
npx playwright test
```

Expected: UC-11..16 (6 新規) + UC-1..10 (10 既存) + sequence-basic (3 skip + 6) = 22 pass + 3 skip 想定

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore: Sprint 11 complete (UC-11..16 E2E)"
```

---

## Sprint 12: MermaidAssist cross-apply (Phase 5)

### Task 12.1: ECN-009 抽出 (PlantUMLAssist Sprint 8-11)

**Files:**
- Create: `E:/00_Git/06_PlantUMLAssist/docs/ecn/ECN-009_direct-manipulation.md`

- [ ] **Step 1: ECN markdown 作成**

```markdown
# ECN-009: Sequence 直接操作 UX 強化 (UC-11..16)

- **ステータス**: 適用済
- **種別**: 改善
- **対象コミット**: Sprint 8-11 の全 commit (selection highlight / hover-insert / pulldown-new / keyboard / drag + color / undo coverage)
- **影響ファイル**: plantuml-assist.html, src/ui/sequence-overlay.js, src/modules/sequence.js, src/ui/rich-label-editor.js, src/app.js

## コンテキスト

Sprint 1-7 で overlay click → selection → props 編集の基盤は完成したが、実運用で 6 つの UX ギャップが残った。

## 対策

詳細は spec `docs/superpowers/specs/2026-04-19-sequence-direct-manipulation.md` 参照。

概略:
- C14: 選択ハイライト (青枠 + 薄青塗り)
- C15/C16: hover 水平点線 + click で modal 挿入 (y 座標 → line resolver)
- C17: pulldown `+ 新規追加` で participant 先行作成
- C18: StableState 互換 keyboard (Tab=2空白 / Escape / 改行 → `\n`)
- C19: participant drag 並び替え + 色パレット
- C20: 全 change handler で pushHistory

## 結果

- 6 UC 全 PASS
- unit +13, E2E +6

## 教訓

- overlay class toggle で視覚状態を表現するパターン (rebuild より安定)
- rich editor の keyboard 契約を明確化したことで textarea UX が StableState 標準に揃った
- drag 実装の閾値判定 (> 4px) は click との競合を避ける鉄板パターン
```

- [ ] **Step 2: Commit**

```bash
git add docs/ecn/ECN-009_direct-manipulation.md
git commit -m "docs(ecn): ECN-009 direct-manipulation UX enhancement"
```

### Task 12.2: MermaidAssist 横展開 — 影響分析

**Files:**
- Create: `E:/00_Git/05_MermaidAssist/docs/ecn-analysis/ECN-009_analysis.md`

- [ ] **Step 1: 分析 markdown 作成**

```markdown
# ECN-009 分析: Sequence 直接操作 UX 強化

- **判定**: 該当あり
- **リスク**: MEDIUM
- **対象ファイル**: `src/modules/sequence.js` / `src/ui/*` / `mermaid-assist.html`

## 元プロジェクトでの問題

PlantUMLAssist Sprint 1-7 完了後に発見された 6 つの UX ギャップ (ECN-009 参照)。

## 対象プロジェクトの現状

MermaidAssist Sequence も同じ UX ギャップを持つ (Sprint 1-7 パターンを `feature/arrow-labels-uml-aware` で共有済)。

主な差異:
1. **SVG 構造**: Mermaid の `<g class="messageText">` / `<g class="actor-man">` は `data-source-line` を持たない可能性あり → 実 SVG 検査必要
2. **色指定構文**: PlantUML `participant X #HEX` に対し Mermaid は style 定義 (`style X fill:#HEX`) で別構文
3. **rich-label-editor**: MermaidAssist には同等モジュールなし。新規コピー or 共通 src に昇格

## 推奨対策

1. **C14, C18, C20 (低リスク)**: 先行移植 — overlay class toggle / rich editor keyboard / undo audit は MermaidAssist でも同 API で動くはず
2. **C15/C16 (中リスク)**: Mermaid SVG 座標系を empirical で確認してから移植
3. **C17 (低リスク)**: MermaidAssist properties.js の select API に `+新規追加` option 拡張
4. **C19 (中リスク)**: color は Mermaid 独自 `style` 構文、drag は共通化可能

## 実装順序

- MermaidAssist でも Sprint 12 を 3 サブステップに分割:
  - 12a: C14 + C18 + C20 移植 (低リスク先行)
  - 12b: C17 pulldown 移植
  - 12c: C15/C16/C19 (SVG 構造調査 → 実装)
```

- [ ] **Step 2: Commit**

```bash
cd E:/00_Git/05_MermaidAssist
git checkout -b feature/direct-manipulation-ecn-009
git add docs/ecn-analysis/ECN-009_analysis.md
git commit -m "docs(ecn-analysis): ECN-009 impact analysis for MermaidAssist Sequence"
```

### Task 12.3: MermaidAssist に C14/C18/C20 移植

**Files:**
- Modify: `E:/00_Git/05_MermaidAssist/src/modules/sequence.js` (C20 undo audit)
- Modify: `E:/00_Git/05_MermaidAssist/mermaid-assist.html` (C14 CSS)
- Modify: `E:/00_Git/05_MermaidAssist/src/app.js` (selection → highlight wiring)
- (C18 は MermaidAssist が rich editor を持たないので SKIP、または別 spec で導入)

- [ ] **Step 1: C14 CSS 追加**

`mermaid-assist.html` の `<style>` に:

```css
#overlay-layer rect.selected {
  fill: rgba(124, 140, 248, 0.12);
  stroke: #7c8cf8;
  stroke-width: 2;
}
```

- [ ] **Step 2: sequence.js の buildOverlay に data-line/data-type 既存確認**

Read し、`data-*` 属性が一貫しているか確認。不足なら追加。

- [ ] **Step 3: app.js で selection → classList toggle**

(PlantUMLAssist Task 8.1 と同じパターンで render 後 `setSelectedHighlight` 相当を呼ぶ)

- [ ] **Step 4: Commit**

```bash
cd E:/00_Git/05_MermaidAssist
git add mermaid-assist.html src/app.js src/modules/sequence.js
git commit -m "feat(sequence): C14 selection highlight (cross-apply from PlantUMLAssist ECN-009)"
```

### Task 12.4: C17 (pulldown 新規追加) 移植

`src/modules/sequence.js` の既存 "メッセージを追加" form の From/To select に `+新規追加` option 追加 + inline 入力欄展開ロジック。PlantUMLAssist Task 9.3 と同パターン。

- [ ] **Step 1: 実装 + 手動確認 + Commit**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): C17 pulldown +新規追加 (cross-apply from ECN-009)"
```

### Task 12.5: C15/C16/C19 移植 (Mermaid SVG 調査後)

- [ ] **Step 1: Mermaid Sequence SVG 構造を調査**

DevTools で実際の mermaid.js 出力を確認:
- `g.messageText` や `text.messageText` の有無
- 座標属性 (x, y, height) の存在
- `data-source-line` 相当の属性

- [ ] **Step 2: PlantUMLAssist の `sequence-overlay.js` を Mermaid 用に調整してコピー**

差分だけ手当てして移植。特に:
- selector 変更 (`g.participant-head` → `g.actor` or `g.actor-man`)
- offset 計算ロジックの empirical 調整 (Mermaid の場合 offset が固定の可能性)

- [ ] **Step 3: C19 color 移植**

Mermaid `style A fill:#HEX` 構文用に `setParticipantColor` を mermaid sequence.js に新規実装。

- [ ] **Step 4: Commit**

```bash
git add src/ui/sequence-overlay.js src/modules/sequence.js
git commit -m "feat(sequence): C15/C16/C19 hover + drag + color (Mermaid SVG adapted)"
```

### Task 12.6: Sprint 12 marker + final integration

- [ ] **Step 1: 両プロジェクトで test + visual 確認**

```bash
cd E:/00_Git/06_PlantUMLAssist
node tests/run-tests.js && npx playwright test

cd E:/00_Git/05_MermaidAssist
node tests/run-tests.js && npx playwright test
```

- [ ] **Step 2: 両プロジェクトで final marker**

```bash
cd E:/00_Git/06_PlantUMLAssist
git commit --allow-empty -m "chore: Sprint 12 complete (MermaidAssist cross-apply ECN-009)"

cd E:/00_Git/05_MermaidAssist
git commit --allow-empty -m "chore: ECN-009 direct-manipulation cross-apply complete"
```

---

## 完了基準 (全 Sprint 通し)

- [ ] 全 unit pass (Sprint 10 までに ~107)
- [ ] 全 E2E pass: UC-1..16 + sequence-basic 6 (3 skip)
- [ ] 視覚検証: selection highlight / hover ガイド / drag preview / color palette が実機確認済
- [ ] Ctrl+Z で全 props 変更が戻る
- [ ] MermaidAssist 側でも 3 sub-ECN 移植済 (C14+C18+C20 → C17 → C15+C16+C19)
- [ ] 既存 regression ゼロ

## Self-Review Notes

**Spec coverage:**
- UC-11..16: Sprint 8-11 で 1 spec/UC 対応 ✓
- C14..C20: 各 task で実装済み ✓
- Phase 5 (MermaidAssist 横展開): Sprint 12 で ECN + 移植 ✓

**Placeholder scan:** "要確認" が 3 箇所 (Mermaid SVG 構造, parser 色対応) あるが、いずれも empirical で決まる性質。task 内で「Read で確認 → 必要なら調整」と具体化済み。

**Type consistency:** `setSelectedHighlight`, `resolveInsertLine`, `setParticipantColor`, `moveParticipant` のシグネチャは Task 内で定義した形を後続で一貫使用 ✓

**Gap:** なし
