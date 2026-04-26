'use strict';
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceFiles = [
  'src/core/html-utils.js',
  'src/core/dsl-utils.js',
  'src/core/regex-parts.js',
  'src/core/line-resolver.js',
  'src/core/formatter-interface.js',
  'src/core/dsl-updater.js',
  'src/core/props-renderer.js',
  'src/core/text-updater.js',
  'src/core/parser-utils.js',
  'src/core/history.js',
  'src/core/selection.js',
  'src/core/connection-mode.js',
  'src/core/overlay-builder.js',
  'src/core/selection-router.js',
  'src/ui/properties.js',
  'src/modules/sequence.js',
  'src/modules/usecase.js',
  'src/modules/component.js',
  'src/modules/class.js',
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

for (const f of files) {
  console.log(`\n── ${path.basename(f)} ──`);
  require(f);
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
