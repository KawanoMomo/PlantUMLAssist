'use strict';
// BLK-junior-20260914-1306-wish: 「先輩の図の変更を自分の図に取り込む」場面で、
// 先輩の 1 枚が前回保存からどこを変えたかを、開く前に一覧の行で言う。
// ここで守るのは「変更のある図だけに絞れること」と「数を言い切ること」——
// 「差分あり」とだけ出すと、どれから開くかを決めるのに結局全部開くことになる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
['../src/core/dsl-utils.js', '../src/core/outline.js', '../src/core/version-history.js',
 '../src/core/peek-changes.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
require('../src/core/dsl-utils.js');
require('../src/core/outline.js');
require('../src/core/version-history.js');
require('../src/core/peek-changes.js');

var PC = window.MA.peekChanges;

function cls(lines) {
  return '@startuml\n' + lines.join('\n') + '\n@enduml\n';
}

var BEFORE = cls([
  'title driver common',
  'class GpioDriver',
  'class Port',
  'GpioDriver --> Port',
]);
// 部品 1 つ追加 (class Pin)、関係 1 つ追加。
var AFTER_ADD = cls([
  'title driver common',
  'class GpioDriver',
  'class Port',
  'class Pin',
  'GpioDriver --> Port',
  'Port --> Pin',
]);
// 関係 1 つ削除。
var AFTER_DEL = cls([
  'title driver common',
  'class GpioDriver',
  'class Port',
]);
// 題だけ変えた (骨組みは「変わった要素」に数えない)。
var AFTER_TITLE = cls([
  'title driver common v2',
  'class GpioDriver',
  'class Port',
  'GpioDriver --> Port',
]);

function entry(name, text, prevText, stamp) {
  return { name: name, text: text, prevText: prevText,
           prevStamp: prevText == null ? null : (stamp || '20260914-120000') };
}

describe('peekChanges.compare — 1 枚の判定', function() {
  test('部品と関係が増えたら changed で、増えた数を部品／関係に分けて数える', function() {
    var row = PC.compare(entry('driver_common_class', AFTER_ADD, BEFORE));
    expect(row.verdict).toBe('changed');
    expect(row.addedParts).toBe(1);
    expect(row.addedRelations).toBe(1);
    expect(row.removedParts).toBe(0);
    expect(row.removedRelations).toBe(0);
  });

  test('関係が消えたら removed に出る', function() {
    var row = PC.compare(entry('driver_common_class', AFTER_DEL, BEFORE));
    expect(row.verdict).toBe('changed');
    expect(row.removedRelations).toBe(1);
    expect(row.added.length).toBe(0);
  });

  test('題だけ変わった図は same (開く必要が無いので「変更あり」と名指ししない)', function() {
    var row = PC.compare(entry('driver_common_class', AFTER_TITLE, BEFORE));
    expect(row.verdict).toBe('same');
  });

  test('控えが無ければ no-prev (比べる前回が無いことを「変更なし」と言わない)', function() {
    var row = PC.compare(entry('new_diagram', BEFORE, null));
    expect(row.verdict).toBe('no-prev');
    expect(row.added.length).toBe(0);
  });

  test('刻印は 履歴 と同じ見え方にする (同じ版を 2 通りの時刻で出さない)', function() {
    var row = PC.compare(entry('a', AFTER_ADD, BEFORE, '20260914-093000'));
    expect(row.stampLabel).toBe(window.MA.versionHistory.label('20260914-093000'));
    expect(row.stampLabel).not.toBe('20260914-093000');
  });
});

describe('peekChanges.report — 一覧ぶんの判定', function() {
  var rep = PC.report([
    entry('z_changed', AFTER_ADD, BEFORE),
    entry('a_same', AFTER_TITLE, BEFORE),
    entry('m_new', BEFORE, null),
    entry('a_changed', AFTER_DEL, BEFORE),
  ]);

  test('変更のある図の名前だけを拾える', function() {
    expect(rep.changed).toEqual(['a_changed', 'z_changed']);
    expect(rep.counts).toEqual({ changed: 2, same: 1, 'no-prev': 1 });
  });

  test('変更のある図が先、次に控えの無い図、最後に変更なし', function() {
    expect(rep.sorted.map(function(r) { return r.name; }))
      .toEqual(['a_changed', 'z_changed', 'm_new', 'a_same']);
  });

  test('find で 1 枚を名前から引ける', function() {
    expect(PC.find(rep, 'z_changed').verdict).toBe('changed');
    expect(PC.find(rep, 'no_such')).toBe(null);
  });

  test('summary は「何枚開けば済むか」を言う', function() {
    expect(PC.summary(rep)).toContain('2 枚が前回保存から変わっています');
    expect(PC.hasChanges(rep)).toBe(true);
  });

  test('変更が 1 枚も無ければ summary がそう言い切る', function() {
    var none = PC.report([entry('a', AFTER_TITLE, BEFORE), entry('b', BEFORE, null)]);
    expect(PC.summary(none)).toContain('変わった図はありません');
    expect(PC.hasChanges(none)).toBe(false);
  });
});

describe('peekChanges — 行の印と絞り込み', function() {
  var rep = PC.report([
    entry('z_changed', AFTER_ADD, BEFORE),
    entry('a_same', AFTER_TITLE, BEFORE),
    entry('m_new', BEFORE, null),
  ]);

  test('changed の印は ＋− の数を出す (「差分あり」で終わらせない)', function() {
    var b = PC.rowBadge(PC.find(rep, 'z_changed'));
    expect(b.changed).toBe(true);
    expect(b.text).toBe('＋2');
    expect(b.title).toContain('部品 ＋1');
    expect(b.title).toContain('関係 ＋1');
  });

  test('same と no-prev にも印を出す (無印は「まだ読めていない」と見分けが付かない)', function() {
    expect(PC.rowBadge(PC.find(rep, 'a_same')).text).toBe('＝');
    expect(PC.rowBadge(PC.find(rep, 'm_new')).text).toBe('初');
    expect(PC.rowBadge(PC.find(rep, 'm_new')).changed).toBe(false);
  });

  test('絞り込むと変更のある図だけが残り、解くと全部戻る', function() {
    expect(PC.visibleNames(rep, true)).toEqual(['z_changed']);
    expect(PC.visibleNames(rep, false)).toEqual(['z_changed', 'm_new', 'a_same']);
  });

  test('判定材料が無いときは null を返し、呼び出し側の順を壊さない', function() {
    expect(PC.visibleNames(PC.report([]), true)).toBe(null);
    expect(PC.visibleNames(null, false)).toBe(null);
  });

  test('絞り込みボタンは押す前に枚数を出し、0 枚なら理由を出す', function() {
    expect(PC.filterLabel(rep, false)).toBe('変更のある図だけ（1 枚）');
    expect(PC.filterLabel(rep, true)).toBe('全部の図を出す（3 枚）');
    expect(PC.filterLabel(PC.report([entry('a', AFTER_TITLE, BEFORE)]), false))
      .toBe('変更のある図はありません');
  });
});

describe('peekChanges.detailLines — 開いた 1 枚の内訳', function() {
  test('＋ と − を行番号付きで出す (本文を読まずに写す先が決まる)', function() {
    var row = PC.compare(entry('a', AFTER_ADD, BEFORE));
    var lines = PC.detailLines(row);
    expect(lines.length).toBe(2);
    expect(lines[0].sign).toBe('+');
    expect(lines.map(function(l) { return l.text; })).toContain('class Pin');
    expect(lines.map(function(l) { return l.text; })).toContain('Port --> Pin');
  });

  test('多すぎる差分は上限で切る', function() {
    var row = PC.compare(entry('a', AFTER_ADD, BEFORE));
    expect(PC.detailLines(row, 1).length).toBe(1);
  });

  test('same / no-prev には内訳を出さず、理由だけ出す', function() {
    var same = PC.compare(entry('a', AFTER_TITLE, BEFORE));
    expect(PC.detailLines(same)).toEqual([]);
    expect(PC.detailNotice(same)).toContain('変わっていません');
    expect(PC.detailNotice(PC.compare(entry('a', BEFORE, null)))).toContain('前回保存なし');
  });
});
