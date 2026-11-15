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

describe('Ctrl+K の「前回保存版と比べる」は 1 行', function() {
  test('旧 livediff の行は無く、compare-before が「前回保存版と比較」を名乗りレビューに入る', function() {
    expect(/\{ id: 'livediff'/.test(app)).toBe(false);
    var m = /\{ id: 'compare-before', title: '([^']*)'[^\n]*/.exec(app);
    expect(m).not.toBe(null);
    expect(m[1]).toBe('前回保存版と比較 / Compare with last save');
    expect(m[0].indexOf("group: 'review'") >= 0).toBe(true);
    ['並べて比較 (この図の前回保存版)', '前回保存版との比較', '差分', '前回保存', 'レビュー'].forEach(function(w) {
      expect(m[0].indexOf("'" + w + "'") >= 0).toBe(true);
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
