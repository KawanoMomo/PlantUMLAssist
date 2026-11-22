'use strict';

// load-ma — unit から src/core/*.js をブラウザ無しで読み込み、`MA` 名前空間を返す。
// モジュールは `window.MA` 前提で書かれているので、ダミーの window を引数に評価する。
// src/core を列挙して全部読むので、モジュールが増減しても呼ぶ側は書き換え不要。

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// 読み込み中に DOM を触るモジュールがあっても止まらないだけの最小のダミー。
function makeSandbox() {
  const win = { addEventListener: () => {} };
  const doc = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener: () => {}, appendChild: () => {} }),
    body: { appendChild: () => {} },
  };
  return {
    window: win,
    document: doc,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { clipboard: { write: async () => {} } },
    requestAnimationFrame: (cb) => cb(),
    setTimeout: (cb) => cb(),
    clearTimeout: () => {},
    alert: () => {},
    confirm: () => true,
    prompt: () => null,
    Blob: class { constructor() {} },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    File: class { constructor() {} },
    FileReader: class { readAsText() {} },
    ClipboardItem: class { constructor() {} },
    HTMLElement: class {},
    Image: class { set onload(fn) { fn && fn(); } set src(v) {} get width() { return 100; } get height() { return 100; } },
    __exportForTest: () => {},
  };
}

// 読めなかったファイルは errors に積むだけで止めない。global.window には触らない
// (同じプロセスで動く他のテストが組んだ window.MA を上書きしないため)。
function loadMA(options) {
  const opts = options || {};
  const root = opts.projectRoot || PROJECT_ROOT;
  const coreDir = path.join(root, 'src', 'core');
  const sandbox = makeSandbox();
  const keys = Object.keys(sandbox);
  const vals = keys.map((k) => sandbox[k]);
  const errors = [];
  const loaded = [];
  if (!fs.existsSync(coreDir)) throw new Error('src/core が見つかりません: ' + coreDir);
  const files = fs.readdirSync(coreDir).filter((f) => f.endsWith('.js')).sort();
  for (const f of files) {
    const code = fs.readFileSync(path.join(coreDir, f), 'utf-8');
    try {
      new Function(...keys, code)(...vals);
      loaded.push('src/core/' + f);
    } catch (e) {
      errors.push({ file: 'src/core/' + f, message: e.message });
    }
  }
  return { MA: sandbox.window.MA || {}, window: sandbox.window, loaded, errors };
}

module.exports = { loadMA, PROJECT_ROOT };
