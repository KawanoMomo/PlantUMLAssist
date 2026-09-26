'use strict';
// BLK-owner-20260924-1712-prune: 「前回保存版と比べる」の入口と言い方を 1 つに畳む。
//  - 下端「± 差分 N」は変わった図の数 (「± 変更 2/10」の 2) を出す
//  - Ctrl+K は 変わった図の一覧 と 前回保存版と比較 の 2 行 (旧 livediff は畳む)
//  - 変更サマリボードの「変更前 =」に前回保存 (日時つき) を並べ、見出しに「基準」を重ねない

const fs = require('fs');
const path = require('path');
const BL = require('../src/core/change-baseline');

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

describe('変更サマリボードの「変更前 =」', function() {
  test('既定は前回保存で、日時を名前に添える (見出しで時点を言うのはここだけ)', function() {
    var at = new Date(2026, 8, 23, 21, 51, 0).toISOString();
    var o = BL.options({ savedAt: at, folder: true });
    expect(o[0].key).toBe('saved');
    expect(o[0].label).toBe('前回保存 (09/23 21:51)');
    expect(o[0].disabled).toBe(false);
    expect(o[1].label).toBe('今日 0 時');
    expect(BL.labelOf('bogus')).toBe('前回保存');
  });

  test('前回保存の基準がまだ無くても選べる (日時は出さない)', function() {
    var o = BL.options({ savedAt: '' });
    expect(o[0].disabled).toBe(false);
    expect(o[0].label).toBe('前回保存');
  });

  test('今日 0 時は保存フォルダに書いているときだけ選べる (その時点の中身は版の控えから読む)', function() {
    expect(BL.options({ folder: false })[1].disabled).toBe(true);
    expect(BL.options({ folder: true })[1].disabled).toBe(false);
  });

  test('会議・提出も日時つきで並ぶ', function() {
    var o = BL.options({ meetingAt: new Date(2026, 8, 23, 15, 0).toISOString(), deliveryAt: new Date(2026, 8, 10, 12, 0).toISOString() });
    expect(o[2].label).toBe('前回の会議 (09/23 15:00)');
    expect(o[3].label).toBe('前回提出 (09/10 12:00)');
  });

  test('列見出しは選択と同じ語', function() {
    var at = new Date(2026, 8, 23, 21, 51, 0).toISOString();
    expect(BL.columnLabel('saved', at)).toBe('変更前 (前回保存 09/23 21:51)');
    expect(BL.columnLabel('today', at)).toBe('変更前 (今日 0 時)');
    expect(BL.columnLabel('meeting', at)).toBe('変更前 (前回の会議 09/23 21:51)');
    expect(BL.columnLabel('meeting', at, 'new')).toBe('変更前 (前回の会議 09/23 21:51 には無い図)');
    expect(BL.columnLabel('saved', '', 'new')).toBe('変更前 (前回保存なし)');
  });

  test('± 差分の窓・比較の枠の見出しも「基準」ではなく「変更前 = 前回保存」で言う', function() {
    expect(app.indexOf("' ・ 基準 '")).toBe(-1);
    expect(BL.headLabel('saved', new Date(2026, 8, 23, 21, 51).toISOString())).toBe('変更前 = 前回保存 (09/23 21:51)');
  });

  test('ボードの見出しの 1 行は時点を重ねて言わない', function() {
    var i = app.indexOf('function _cbSummaryText(');
    var body = app.slice(i, app.indexOf('\n}\n', i));
    expect(body.indexOf('headLabel')).toBe(-1);
    expect(body.indexOf('board.markedAt')).toBe(-1);
  });
});
