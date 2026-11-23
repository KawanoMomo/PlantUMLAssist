'use strict';
// TICKET-owner-20261122-1023-prune: ツール ▾ の「複数クラスに一括適用する」(⊞ 一括適用) を外した。
// 開いている別のクラス図へも書き込む「図をまたぐ操作」の 2 本目で、製品仕様書に場面の行が無かった。
// 図をまたぐ操作は ⇄ 一括置換の 1 本。入口・コード・CSS・<script> 行が残っていないことを固定する。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var TM = W.MA.toolMenu;

const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (/\.(js|css|html)$/.test(e.name)) out.push(p);
  });
  return out;
}

const FILES = [path.join(ROOT, 'plantuml-assist.html')].concat(walk(path.join(ROOT, 'src')));

describe('一括適用の痕跡が製品に残っていない', function() {
  ['bulk-apply', 'bulkApply', 'btn-tab-apply', '一括適用', 'apply-panel', 'setupBulkApply'].forEach(function(word) {
    test('「' + word + '」は plantuml-assist.html と src/ に 0 件', function() {
      var hits = FILES.filter(function(f) { return fs.readFileSync(f, 'utf8').indexOf(word) >= 0; })
        .map(function(f) { return path.relative(ROOT, f); });
      expect(hits).toEqual([]);
    });
  });

  test('src/core/bulk-apply.js が無い', function() {
    expect(fs.existsSync(path.join(ROOT, 'src', 'core', 'bulk-apply.js'))).toBe(false);
  });
});

describe('ツール ▾ に残るのは 2 行', function() {
  test('行を書き換える・部品名を一括置換する だけ', function() {
    expect(TM.menuIds()).toEqual(['tool-lines', 'tool-rename']);
    expect(TM.labelOf('btn-tab-apply')).toBe(null);
  });

  test('Ctrl+K の「一括適用」の行も無い', function() {
    var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    expect(app.indexOf("{ id: 'tab-apply'")).toBe(-1);
    // 図をまたぐ操作の 1 本 (⇄ 一括置換) と行編集の行は残る。
    expect(app.indexOf("{ id: 'tab-rename'")).toBeGreaterThan(-1);
    expect(app.indexOf("{ id: 'tab-lines'")).toBeGreaterThan(-1);
  });
});
