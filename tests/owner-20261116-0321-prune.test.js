'use strict';
// TICKET-owner-20261116-0321-prune: 「部品」「系統」を前提にした図の起こし方を外し、新しい図は「新しい図」1 つにする。
// 1 段目 (この票の途中 1): 「既存の図や雛形から新しい図を起こす」の窓 (部品名だけ / 既存の図 1 枚 /
// 同じ系統の図ぜんぶ / 組み込みの骨格・部品名の対応表・題材プリセット)、フォルダの右クリック「6 図種をまとめて作る」、
// ツール ▾「図をつくる」分類、Ctrl+K の「シーケンス図からアクティビティ図を起こす」を外した。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
var W = (typeof window !== 'undefined' && window) || global.window;

var GONE_MODULES = ['template-new', 'template-map', 'template-audit', 'skeleton-new', 'family-clone',
  'subject-preset', 'method-audit', 'family-audit', 'trace-coverage', 'scope-decl'];

describe('既存の図や雛形から起こす窓を外した (TICKET-owner-20261116-0321-prune)', function() {
  test('外したモジュールはファイルも読み込みも無い', function() {
    GONE_MODULES.forEach(function(m) {
      expect(fs.existsSync(path.join(ROOT, 'src', 'core', m + '.js'))).toBe(false);
      expect(HTML).not.toContain('src/core/' + m + '.js');
    });
  });

  test('窓・入口・結線が残っていない', function() {
    ['btn-tab-template', 'tpl-modal', 'fc-modal', 'part-subject'].forEach(function(w) {
      expect(HTML).not.toContain(w);
      expect(APP).not.toContain(w);
    });
    ['setupTemplateNew', 'setupFamilyClone', 'openNewFrom', 'makeActivityFromSequence',
     "id: 'tab-template'", "id: 'seq-to-activity'"].forEach(function(w) {
      expect(APP).not.toContain(w);
    });
  });

  test('ツール ▾ に「図をつくる」の分類が無く、フォルダの右クリックに「6 図種をまとめて作る」が無い', function() {
    var TM = W.MA.toolMenu;
    var FM = W.MA.fileMenu;
    expect(TM.groups().filter(function(g) { return g.key === 'make'; }).length).toBe(0);
    ['target', 'part', 'readonly'].forEach(function(kind) {
      var ids = FM.folderItems({ kind: kind }).map(function(it) { return it.id; });
      expect(ids.indexOf('new-part')).toBe(-1);
    });
  });

  test('残す: 新しい図 (タブ列の ＋・フォルダの右クリック) とテンプレ宣言の自動保存の守り', function() {
    expect(HTML).toContain('id="btn-tab-new"');
    expect(W.MA.fileMenu.folderItems({ kind: 'target' })[0].id).toBe('new-doc');
    expect(APP).toContain('function setupTemplateAutosaveGuard');
  });
});
