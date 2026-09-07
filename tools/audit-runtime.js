'use strict';

// audit-runtime — src/core/*.js をブラウザ無しで読み込み、`MA` 名前空間を返す。
//
// BLK-reviewer-20260907-1303: 監査モジュールは `window.MA` 前提で書かれているため、
// node から使うには毎回 `global.window = global` を仕込み、必要なファイルを
// 手で require し直す必要があった。本体が新しい依存 (dsl-utils.js) を足しただけで
// 外側のスクリプトが落ちる。ここが「読み込み方」を 1 箇所に閉じ込める唯一の入口で、
// src/core を列挙して全部読むので、モジュールが増減しても呼ぶ側は書き換え不要。

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// 読み込み中に DOM を触るモジュールがあっても止まらないだけの最小のダミー。
// 監査ロジック本体は純関数なので、呼び出し時にはこれらに触れない。
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

// src/core を丸ごと読む。IIFE は互いを「呼び出し時」にしか参照しないので
// 読み込み順は問わない。読めなかったファイルは errors に積むだけで止めない
// (監査に無関係なモジュールの読み込み失敗で監査全体を落とさない)。
function loadMA(options) {
  const opts = options || {};
  const root = opts.projectRoot || PROJECT_ROOT;
  const coreDir = path.join(root, 'src', 'core');
  const sandbox = makeSandbox();
  const keys = Object.keys(sandbox);
  const vals = keys.map((k) => sandbox[k]);
  const errors = [];
  const loaded = [];

  if (!fs.existsSync(coreDir)) {
    throw new Error('src/core が見つかりません: ' + coreDir);
  }

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

  // 各ファイルは `window` を引数に取る形で評価しているので、実行時に
  // window.MA を引くモジュール (template-audit など) も自然にこの sandbox を見る。
  // global.window には触らない — 触ると、同じプロセスで動く他のテストが
  // 組んだ window.MA を上書きしてしまう。
  return { MA: sandbox.window.MA || {}, window: sandbox.window, loaded, errors };
}

module.exports = { loadMA, PROJECT_ROOT };
