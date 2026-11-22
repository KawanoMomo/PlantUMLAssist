'use strict';
// BLK-owner-20260924-1712-prune: 「前回保存版と比べる」の入口と言い方を 1 つに畳む。
//  - 下端「± 差分 N」は変わった図の数 (「± 変更 2/10」の 2) を出す
//  - Ctrl+K は 変わった図の一覧 と 前回保存版と比較 の 2 行 (旧 livediff は畳む)
//  - ± 差分の窓・比較の枠の見出しは「変更前 = 前回保存 (日時)」で言い、「基準」を重ねない
// (変更サマリボードと「変更前 =」の選択は TICKET-owner-20261115-1828-prune で外した)

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
if (!W.MA.statusCounters) require('../src/core/status-counters.js');
var SC = W.MA.statusCounters;

const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8');

describe('下端の差分の件数は変わった図の数', function() {
  test('「± 変更 2/10」は 2 (末尾の総数 10 を拾わない)', function() {
    expect(SC.countToken('± 変更 2/10')).toBe('2');
    expect(SC.countToken('± 変更 12 / 30')).toBe('12');
  });

  test('ほかの札の読み方は今のまま', function() {
    expect(SC.countToken('指摘 3')).toBe('3');
    expect(SC.countToken('± 差分 −')).toBe('−');
    expect(SC.countToken('± 変更なし')).toBe('−');
    expect(SC.isActive('± 変更 2/10')).toBe(true);
    expect(SC.isActive('± 変更 0/10')).toBe(false);
  });

  test('ツール ▾ の件数も同じ読み方をする', function() {
    expect(app.indexOf('SC.countToken(t)') >= 0).toBe(true);
  });
});

// TICKET-owner-20261115-2141-prune: 前回保存版と比べるのは「この図の履歴」の行から。
// Ctrl+K の「前回保存版と比較」「並べて比較 (別タブの図)」「読むだけの図と並べて比較」の行は外した。
describe('Ctrl+K に「前回保存版と比較」「並べて比較」の行は無い', function() {
  test('livediff / compare-before / tab-compare / tab-senior の行はコマンド表に無い', function() {
    ['livediff', 'compare-before', 'tab-compare', 'tab-senior'].forEach(function(id) {
      expect(app.indexOf("{ id: '" + id + "'")).toBe(-1);
    });
  });
});

describe('± 差分の窓・比較の枠の見出し', function() {
  test('「基準」ではなく「変更前 = 前回保存 (日時)」で言う', function() {
    expect(app.indexOf("' ・ 基準 '")).toBe(-1);
    var i = app.indexOf('function _savedHeadLabel(');
    expect(i >= 0).toBe(true);
    var body = app.slice(i, app.indexOf('\n}\n', i));
    expect(body.indexOf("'変更前 = 前回保存 ('")).toBeGreaterThan(-1);
  });
});
