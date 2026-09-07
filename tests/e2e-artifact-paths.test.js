'use strict';
// BLK-releaser-20260908-0800 — E2E がリポジトリ直下に残骸を作らないことを、
// 実行しなくても spec のソースから確かめる。ここが赤いまま E2E を回すと、
// 成果物リポジトリの直下に保存フォルダとスクショが溜まり、配布物に混ざる。
var fs = require('fs');
var path = require('path');

var E2E_DIR = path.join(__dirname, 'e2e');
var SPECS = fs.readdirSync(E2E_DIR).filter(function(f) { return /\.spec\.js$/.test(f); });

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
      expect(read(f).indexOf("require('./helpers')") >= 0).toBe(true);
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

  test('.gitignore は直下の残骸を握りつぶしていない (残骸は作らないことで消す)', () => {
    var gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    expect(/^autosave-/m.test(gi)).toBe(false);
    expect(/^shot\*?\.png$/m.test(gi)).toBe(false);
  });
});
