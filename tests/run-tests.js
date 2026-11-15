'use strict';
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
// server.py を読み込む test (python -c) が設定・控えの置き場 (DATA_ROOT) を利用者のものと共有しないよう、
// test-results/ の下を渡す (子プロセスは環境変数を引き継ぐ)。TICKET-owner-20261115-1827-1。
if (!process.env.PUA_DATA_ROOT) {
  process.env.PUA_DATA_ROOT = path.join(projectRoot, 'test-results', 'unit-data');
}
const sourceFiles = [
  'src/core/html-utils.js',
  'src/core/svg-export.js',
  'src/core/saved-kind.js',
  'src/core/folder-export.js',
  'src/core/diagram-kind.js',
  'src/core/kind-mismatch.js',
  'src/core/dsl-utils.js',
  'src/core/preproc-live.js',
  'src/core/preproc-expand.js',
  'src/core/generated-part.js',
  'src/core/regex-parts.js',
  'src/core/id-normalizer.js',
  'src/core/alias-hint.js',
  'src/core/auto-save.js',
  'src/core/workspace.js',
  'src/core/review-watch.js',
  'src/core/review-diff.js',
  'src/core/selected-endpoints.js',
  'src/core/scaffold-notice.js',
  'src/core/state-branch.js',
  'src/core/state-transition.js',
  'src/core/state-insert.js',
  'src/core/state-tx-entry.js',
  'src/core/state-svg-map.js',
  'src/core/state-child.js',
  'src/core/class-scaffold.js',
  'src/core/sequence-scaffold.js',
  'src/core/name-audit.js',
  'src/core/template-new.js',
  'src/core/template-map.js',
  'src/core/family-audit.js',
  'src/core/note-block.js',
  'src/core/note-edit.js',
  'src/core/note-intent.js',
  'src/core/family-clone.js',
  'src/core/subject-preset.js',
  'src/core/driver-usecase-starter.js',
  'src/core/activity-insert.js',
  'src/core/sequence-group-range.js',
  'src/core/app-bridge.js',
  'src/core/blank-doc.js',
  'src/core/text-sync.js',
  'src/core/save-diff.js',
  'src/core/version-timeline.js',
  'src/core/svg-freshness.js',
  'src/core/svg-compare-row.js',
  'src/core/svg-cross.js',
  'src/core/finding-variant.js',
  'src/core/file-role.js',
  'src/core/audit-scope.js',
  'src/core/command-palette.js',
  'src/core/diagram-rail.js',
  'src/core/tool-menu.js',
  'src/core/status-counters.js',
  'src/core/status-badges.js',
  'src/core/file-tree.js',
  'src/core/git-panel.js',
  'src/core/file-menu.js',
  'src/core/zoom-hud.js',
  'src/core/outline.js',
  'src/core/select-at-line.js',
  'src/core/line-peek.js',
  'src/core/tail-memory.js',
  'src/core/tail-kind-chips.js',
  'src/core/compare-view.js',
  'src/core/folder-filter.js',
  'src/core/target-set.js',
  'src/core/line-resolver.js',
  'src/core/formatter-interface.js',
  'src/core/dsl-updater.js',
  'src/core/props-renderer.js',
  'src/core/props-tab-label.js',
  'src/core/tab-reveal.js',
  'src/core/text-updater.js',
  'src/core/parser-utils.js',
  'src/core/history.js',
  'src/core/undo-route.js',
  'src/core/selection.js',
  'src/core/connection-mode.js',
  'src/core/overlay-builder.js',
  'src/core/selection-router.js',
  'src/core/line-edit.js',
  'src/core/reuse-picker.js',
  'src/core/relation-kind-cards.js',
  'src/core/svg-diff-summary.js',
  'src/core/relation-options.js',
  'src/core/group-notation.js',
  'src/core/group-place.js',
  'src/core/seq-place.js',
  'src/core/sequence-marks.js',
  'src/core/sequence-autonumber.js',
  'src/core/sequence-participant-zone.js',
  'src/core/insert-marker.js',
  'src/core/label-colors.js',
  'src/core/scope-decl.js',
  'src/core/trace-coverage.js',
  'src/core/component-deps.js',
  'src/core/usecase-source.js',
  'src/core/material-verify.js',
  'src/core/material-readback.js',
  'src/ui/properties.js',
  'src/ui/reuse-modal.js',
  'src/modules/sequence.js',
  'src/modules/usecase.js',
  'src/modules/component.js',
  'src/modules/class.js',
  'src/modules/activity.js',
  'src/modules/state.js',
];

let fns = {};
const sandbox = {
  document: { addEventListener: () => {}, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, addEventListener: () => {} }) },
  window: { addEventListener: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: { clipboard: { write: async () => {} } },
  requestAnimationFrame: (cb) => cb(),
  setTimeout: (cb) => cb(),
  clearTimeout: () => {},
  alert: () => {},
  confirm: () => true,
  Blob: class { constructor() {} },
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  File: class { constructor() {} },
  FileReader: class { readAsText() {} },
  ClipboardItem: class { constructor() {} },
  HTMLElement: class {},
  Image: class { set onload(fn) { fn && fn(); } set src(v) {} get width() { return 100; } get height() { return 100; } },
  __exportForTest: (obj) => { fns = obj; },
};

const keys = Object.keys(sandbox);
const vals = keys.map(k => sandbox[k]);

for (const relPath of sourceFiles) {
  const filePath = path.join(projectRoot, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`${relPath} not found yet — skipping`);
    continue;
  }
  const code = fs.readFileSync(filePath, 'utf-8');
  try {
    const fn = new Function(...keys, code);
    fn(...vals);
  } catch (e) {
    console.error(`Script eval error in ${relPath}:`, e.message);
  }
}

global.fns = fns;
global.window = sandbox.window;

let passed = 0, failed = 0, currentDescribe = '';
let beforeEachStack = [];

global.describe = function(name, fn) {
  currentDescribe = name;
  console.log(`\n  ${name}`);
  beforeEachStack.push([]);
  fn();
  beforeEachStack.pop();
  currentDescribe = '';
};

global.beforeEach = function(fn) {
  if (beforeEachStack.length === 0) beforeEachStack.push([]);
  beforeEachStack[beforeEachStack.length - 1].push(fn);
};

global.test = function(name, fn) {
  try {
    for (const frame of beforeEachStack) {
      for (const be of frame) be();
    }
    fn();
    passed++;
    console.log(`    ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`    ✗ ${name}`);
    console.log(`      ${e.message}`);
  }
};

global.expect = function(actual) {
  const assert = {
    toBe(expected) { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
    toEqual(expected) { const a = JSON.stringify(actual), b = JSON.stringify(expected); if (a !== b) throw new Error(`Expected ${b}, got ${a}`); },
    toBeNull() { if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`); },
    toBeDefined() { if (actual === undefined) throw new Error('Expected defined'); },
    toBeGreaterThan(n) { if (!(actual > n)) throw new Error(`Expected ${actual} > ${n}`); },
    toBeLessThan(n) { if (!(actual < n)) throw new Error(`Expected ${actual} < ${n}`); },
    // BLK-migrator-20260923-1409: 枠の寸法は「同じか、それ以上」で守りたいので境界込みを足す。
    toBeGreaterThanOrEqual(n) { if (!(actual >= n)) throw new Error(`Expected ${actual} >= ${n}`); },
    toBeLessThanOrEqual(n) { if (!(actual <= n)) throw new Error(`Expected ${actual} <= ${n}`); },
    toBeTruthy() { if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
    toBeFalsy() { if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
    toContain(item) {
      if (Array.isArray(actual)) { if (!actual.includes(item)) throw new Error(`Array does not contain ${JSON.stringify(item)}`); }
      else if (typeof actual === 'string') { if (!actual.includes(item)) throw new Error(`String does not contain "${item}"`); }
    },
    toThrow(expectedMsg) {
      if (typeof actual !== 'function') throw new Error('Expected a function to check toThrow');
      var threw = false, msg = '';
      try { actual(); } catch (e) { threw = true; msg = e.message; }
      if (!threw) throw new Error('Expected function to throw, but it did not');
      if (expectedMsg != null && msg.indexOf(expectedMsg) < 0) {
        throw new Error('Expected error message to contain "' + expectedMsg + '", got "' + msg + '"');
      }
    },
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
  };
  return assert;
};

const testFiles = process.argv.slice(2);
const files = testFiles.length > 0
  ? testFiles.map(f => path.resolve(f))
  : fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).map(f => path.join(__dirname, f));

// describe / test を使わず自前で数える test ファイルは、赤を `process.exitCode = 1` か
// `process.exit(1)` で返す。ここが自分の数だけで終えるとその赤が消えるので、ファイルごとに
// 終了コードを見て 1 件の失敗に数える。読み込みで投げたファイルも同じ (残りのファイルは続けて回す)。
// TICKET-owner-20261115-2100-1。
class FileExit extends Error {
  constructor(code) { super('process.exit(' + code + ')'); this.code = code; }
}
const redFiles = [];
const realExit = process.exit;
for (const f of files) {
  const name = path.basename(f);
  console.log(`\n── ${name} ──`);
  process.exitCode = 0;
  process.exit = function(code) { throw new FileExit(code == null ? 0 : code); };
  let why = '';
  try {
    require(f);
  } catch (e) {
    if (e instanceof FileExit) why = e.code ? e.message : '';
    else why = '読み込みで投げた: ' + (e && e.message);
  } finally {
    process.exit = realExit;
  }
  if (!why && process.exitCode) why = 'process.exitCode = ' + process.exitCode;
  process.exitCode = 0;
  if (why) {
    failed++;
    redFiles.push(name + ' (' + why + ')');
    console.log(`    ✗ ${name}: ${why}`);
  }
}

if (redFiles.length) console.log(`\n  赤のファイル: ${redFiles.join(', ')}`);
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
