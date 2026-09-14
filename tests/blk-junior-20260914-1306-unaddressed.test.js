'use strict';
// BLK-junior-20260914-1306: 図名も図種も書かれていない指摘は、どの図にも割り当てられない。
// 一覧は件数だけを言っていたので、その件が自分宛かどうかは指摘.md を GUI の外で開いて
// 全文を読むまで分からなかった。宛先は本文に書かれていることが多いので、そこまでは言う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/component-pack.js', '../src/core/review-note.js',
 '../src/core/finding-actions.js', '../src/core/finding-variant.js',
 '../src/core/note-board.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var NB = global.window.MA.noteBoard;
var RN = global.window.MA.reviewNote;

var NAMES = ['gpio_init_sequence', 'gpio_state'];

// 宛先の書かれていない 3 件 (junior が 9 周目に実際に受け取った形)。
var NOTE = [
  '# 指摘',
  '',
  '## 【継続】gpio_init_sequence の部品名不一致',
  '`Gpio` を `Gpio_Driver` に統一してください。',
  '',
  '## 命名の略語の大文字化が揃っていない',
  'junior は IRQCtrl、他は Irq_Ctrl。どちらかに寄せてください。',
  '',
  '## 編集中ファイルの整理',
  'primary の保存先に `-編集中` が 3 つ残っています。',
  '',
  '## 粒度の目安について',
  '1 操作 1 メッセージを基本にしたいという話です。',
].join('\n');

var OPTS = { mineFolder: 'junior', otherFolders: ['primary'] };

function board() {
  var rows = RN.rows(RN.parse(NOTE), RN.index([
    { name: 'junior/gpio_init_sequence.puml' },
    { name: 'primary/gpio_init_sequence.puml' },
  ]));
  return NB.scan({ rows: rows, names: NAMES, kindOf: function() { return ''; } });
}

describe('noteBoard.addresseeOf — 宛先を本文から言う', function() {
  test('自分の名前が出ていれば自分宛', function() {
    var r = NB.unaddressedRows(board(), OPTS);
    var irq = r.filter(function(x) { return /略語/.test(x.head); })[0];
    expect(irq.to).toBe('mine');
    expect(irq.toMark).toBe('自分宛');
  });

  test('相手の名前しか出ていなければ他の人宛', function() {
    var r = NB.unaddressedRows(board(), OPTS);
    var edit = r.filter(function(x) { return /編集中/.test(x.head); })[0];
    expect(edit.to).toBe('other');
  });

  test('誰の名前も出ていなければ宛先不明のまま (勝手に外さない)', function() {
    var r = NB.unaddressedRows(board(), OPTS);
    var g = r.filter(function(x) { return /粒度/.test(x.head); })[0];
    expect(g.to).toBe('unknown');
    expect(g.why).toContain('誰宛か');
  });

  test('自分と相手の両方が出ていれば自分宛として読む', function() {
    var row = { id: 'x', title: '綴りの揺れ', body: 'junior 側 `Gpio` / primary 側 `Gpio_Driver`' };
    expect(NB.addresseeOf(row, OPTS).key).toBe('mine');
  });

  test('名前の一部に含まれるだけの語では宛先にしない', function() {
    var row = { id: 'x', title: 'メモ', body: 'juniors_note.md を見てください' };
    expect(NB.addresseeOf(row, OPTS).key).toBe('unknown');
  });
});

describe('noteBoard の一覧と見出し', function() {
  test('割り当てられなかった件だけが並び、本文も持つ', function() {
    var rows = NB.unaddressedRows(board(), OPTS);
    // 図名の綴られた 1 件は図に割り当てられるので、ここには出ない。
    expect(rows.length).toBe(3);
    expect(rows.map(function(r) { return r.to; }).sort()).toEqual(['mine', 'other', 'unknown']);
    expect(rows[0].body.length).toBeGreaterThan(0);
  });

  test('見出しが宛先の内訳まで言う (全文を読ませない)', function() {
    expect(NB.unaddressedSummary(board(), OPTS))
      .toBe('図名も図種も書かれていない指摘 3 件（自分宛 1 件・他の人宛 1 件・宛先不明 1 件）');
  });

  test('一覧の 1 行にも内訳が乗る', function() {
    var b = board();
    var s = NB.summaryText({ board: b, names: NAMES, hasNote: true,
      statusByName: NB.statusMap({ board: b, names: NAMES, dslByName: {} }),
      mineFolder: 'junior', otherFolders: ['primary'] });
    expect(s).toContain('自分宛 1 件');
  });

  test('割り当てられない件が無ければ何も言わない (押す所を増やさない)', function() {
    var rows = RN.rows(RN.parse('# 指摘\n\n## gpio_state の件\n直してください。'),
      RN.index([{ name: 'junior/gpio_state.puml' }]));
    var b = NB.scan({ rows: rows, names: NAMES, kindOf: function() { return ''; } });
    expect(NB.unaddressedRows(b, OPTS)).toEqual([]);
    expect(NB.unaddressedSummary(b, OPTS)).toBe('');
  });
});
