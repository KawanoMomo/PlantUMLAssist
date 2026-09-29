'use strict';
// BLK-releaser-20260908-0800 — E2E がリポジトリ直下に残骸を作らないことを、
// 実行しなくても spec のソースから確かめる。ここが赤いまま E2E を回すと、
// 成果物リポジトリの直下に保存フォルダとスクショが溜まり、配布物に混ざる。
var fs = require('fs');
var path = require('path');

var E2E_DIR = path.join(__dirname, 'e2e');

// BLK-releaser-20260908-2030-1: spec は scenarios/ と legacy/ に分かれたので下位も見る
function walk(dir, prefix) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
    var rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(walk(path.join(dir, e.name), rel));
    else if (/\.spec\.js$/.test(e.name)) out.push(rel);
  });
  return out;
}
var SPECS = walk(E2E_DIR, '');

function read(f) { return fs.readFileSync(path.join(E2E_DIR, f), 'utf8'); }

describe('E2E の成果物の置き場 (BLK-releaser-20260908-0800)', () => {
  test('spec は直下に保存フォルダ (./autosave-*) を作らない', () => {
    var bad = SPECS.filter(function(f) { return /'\.\/autosave-/.test(read(f)); });
    expect(bad).toEqual([]);
  });

  test('spec の保存フォルダは test-results/autosave/ 配下だけ', () => {
    var bad = [];
    SPECS.forEach(function(f) {
      var s = read(f);
      var re = /fileDir:\s*'([^']+)'/g;
      var m;
      while ((m = re.exec(s))) {
        // './autosave' はアプリ自身の既定の保存先。backend: 'localStorage' の spec が
        // 「保存先を使わない設定」を示すために置いているだけで、フォルダは作られない。
        if (m[1] === './autosave') continue;
        if (m[1].indexOf('./test-results/autosave/') !== 0) bad.push(f + ': ' + m[1]);
      }
    });
    expect(bad).toEqual([]);
  });

  test('spec は直下に shot*.png を落とさない', () => {
    var bad = SPECS.filter(function(f) {
      return /process\.env\.SHOT_OUT\s*\|\|\s*'[^/'\\]*\.png'/.test(read(f));
    });
    expect(bad).toEqual([]);
  });

  test('スクショの既定の置き場は helpers の shotOut に一本化されている', () => {
    var users = SPECS.filter(function(f) { return /\bshotOut\(/.test(read(f)); });
    expect(users.length).toBeGreaterThan(0);
    users.forEach(function(f) {
      expect(/require\('\.{1,2}\/helpers'\)/.test(read(f))).toBe(true);
    });
  });

  test('保存フォルダは全体実行の後に globalTeardown が消す', () => {
    var cfg = fs.readFileSync(path.join(__dirname, '..', 'playwright.config.js'), 'utf8');
    expect(cfg).toContain('globalTeardown');
    var td = fs.readFileSync(path.join(E2E_DIR, 'global-teardown.js'), 'utf8');
    expect(td).toContain('test-results');
    expect(td).toContain('autosave');
    expect(td).toContain('rmSync');
  });

  // BLK-builder-20260924-2152-3b: Playwright は起動のたびに outputDir を丸ごと消す。既定の test-results/ のままだと、
  // unit のコーパス往復テストが書いた test-results/corpus-roundtrip.json (metrics.py の roundtrip_pass の元) が
  // 全体実行 (unit → E2E) の E2E を始めた時点で消え、メジャー条件の往復テストが「未実行」扱いになる。
  test('E2E の出力先は test-results の下の専用フォルダで、往復テストの結果を消さない', () => {
    var cfg = require('../playwright.config.js');
    var root = path.resolve(__dirname, '..', 'test-results');
    var cfgDir = path.resolve(__dirname, '..');
    var dirs = [cfg.outputDir].concat((cfg.projects || []).map(function(p) { return p.outputDir; }))
      .filter(function(d) { return d != null; })
      .map(function(d) { return path.resolve(cfgDir, d); });
    expect(typeof cfg.outputDir).toBe('string');
    dirs.forEach(function(d) {
      expect(d.indexOf(root + path.sep)).toBe(0);
    });
    var roundtrip = path.join(root, 'corpus-roundtrip.json');
    dirs.forEach(function(d) {
      expect(roundtrip.indexOf(d + path.sep)).toBe(-1);
    });
  });

  test('.gitignore は直下の残骸を握りつぶしていない (残骸は作らないことで消す)', () => {
    var gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    expect(/^autosave-/m.test(gi)).toBe(false);
    expect(/^shot\*?\.png$/m.test(gi)).toBe(false);
  });
});
