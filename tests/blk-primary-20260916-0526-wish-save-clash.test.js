'use strict';
// BLK-primary-20260916-0526-wish: 隣の persona と部品名が表記違いで衝突している
// ことは、reviewer が audit を通しで走らせて指摘.md に書くまで分からなかった
// (ClockCtrl ⇔ Clock_Ctrl の継続 3 tick 目)。保存したその場で言い切れれば、
// 手順 5.5 は「保存する → 衝突が無いと分かって次へ進む」で閉じる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/name-audit.js', '../src/core/name-clash.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var NC = global.window.MA.nameClash;
var SC = require('../src/core/save-clash.js');

function seq(names) {
  return '@startuml\n' + names.map(function(n) { return 'participant ' + n; }).join('\n')
    + '\n' + names[0] + ' -> ' + names[0] + ': ping\n@enduml\n';
}

// 隣のフォルダを読んだ時点の控え (junior 側)。
var THEIRS = [
  { name: 'junior/clock_state', persona: 'junior', dsl: seq(['Clock_Ctrl']) },
  { name: 'junior/irq_sequence', persona: 'junior', dsl: seq(['Irq_Ctrl']) },
];

// いま保存した図を含む自分のフォルダ。
function mine(dsl) {
  return [
    { name: 'primary/driver_common_class', persona: 'primary', dsl: dsl },
    { name: 'primary/spi_state', persona: 'primary', dsl: seq(['SpiDrv']) },
  ];
}

function evalSaved(dsl) {
  var docs = SC.merge(THEIRS, mine(dsl));
  return SC.evaluate(NC.audit(docs), { doc: 'primary/driver_common_class' });
}

describe('save-clash: 保存したその場で、隣の persona との部品名衝突を言う', function() {

  test('保存した図の綴りが隣の persona と割れていれば、帯を出して相手を名指しする', function() {
    var ev = evalSaved(seq(['ClockCtrl']));
    expect(ev.verdict).toBe('cross');
    expect(SC.shouldWarn(ev)).toBe(true);
    expect(ev.others).toEqual(['junior']);
    // どちらが自分の綴りかを言い切る (言わないと揃える向きを決めるためにまた開く)。
    expect(ev.pairs.length).toBe(1);
    expect(ev.pairs[0].mine).toBe('ClockCtrl');
    expect(ev.pairs[0].theirs.map(function(t) { return t.name; })).toEqual(['Clock_Ctrl']);
    var sum = SC.summaryLine(ev);
    expect(sum).toContain('junior');
    expect(sum).toContain('ClockCtrl');
    expect(sum).toContain('Clock_Ctrl');
  });

  test('相手側の図まで名指しするので、1 枚ずつ開かずに誰に断ればよいかが分かる', function() {
    var rows = SC.lines(evalSaved(seq(['ClockCtrl'])));
    expect(rows.length).toBe(1);
    expect(rows[0].docs).toEqual(['junior/clock_state']);
    expect(rows[0].personas).toEqual(['junior']);
    expect(rows[0].text).toContain('junior/clock_state');
    expect(rows[0].text).toContain('揃える先');
  });

  test('揃える操作は、自分の綴りを揃える先へ置き換える 1 回分だけを出す', function() {
    // 相手側が多数派なので、揃える先は相手の綴り = 動かすのはこちら。
    var docs = SC.merge([
      { name: 'junior/clock_state', persona: 'junior', dsl: seq(['Clock_Ctrl']) },
      { name: 'junior/clock_sequence', persona: 'junior', dsl: seq(['Clock_Ctrl']) },
    ], [{ name: 'primary/driver_common_class', persona: 'primary', dsl: seq(['ClockCtrl']) }]);
    var ev = SC.evaluate(NC.audit(docs), { doc: 'primary/driver_common_class' });
    expect(ev.pairs[0].suggested).toBe('Clock_Ctrl');
    var plans = SC.fixPlan(ev);
    expect(plans.length).toBe(1);
    expect(plans[0].from).toBe('ClockCtrl');
    expect(plans[0].to).toBe(ev.pairs[0].suggested);
    expect(SC.fixLabel(plans[0])).toContain('ClockCtrl');
  });

  test('揃える先が自分の綴りなら、動かすのは相手側なので揃えるボタンを出さない', function() {
    // 自分の綴りが揃える先そのものになる形を作る。
    var docs = SC.merge(
      [{ name: 'junior/clock_state', persona: 'junior', dsl: seq(['Clock_Ctrl']) }],
      [{ name: 'primary/a', persona: 'primary', dsl: seq(['ClockCtrl']) }]);
    var ev = SC.evaluate(NC.audit(docs), { doc: 'primary/a' });
    var plans = SC.fixPlan(ev);
    plans.forEach(function(p) { expect(p.from).not.toBe(p.to); });
  });

  test('衝突が無ければ帯を出さず、何枚と照合しての結果かを言う', function() {
    var ev = evalSaved(seq(['Clock_Ctrl']));   // 隣と同じ綴りに揃っている
    expect(ev.verdict).toBe('clean');
    expect(SC.shouldWarn(ev)).toBe(false);
    var line = SC.statusLine(ev);
    expect(line).toContain('衝突なし');
    expect(line).toContain('4 枚');
    expect(line).toContain('junior');
  });

  test('自分の中だけの揺れは帯を出さない (相手に断らずに揃えられる)', function() {
    var docs = SC.merge(THEIRS, [
      { name: 'primary/a', persona: 'primary', dsl: seq(['SpiDrv']) },
      { name: 'primary/b', persona: 'primary', dsl: seq(['Spi_Drv']) },
    ]);
    var ev = SC.evaluate(NC.audit(docs), { doc: 'primary/a' });
    expect(ev.verdict).toBe('internal');
    expect(SC.shouldWarn(ev)).toBe(false);
    expect(SC.statusLine(ev)).toContain('自分の中');
  });

  test('照合できていないときは「衝突なし」と言わない', function() {
    expect(SC.statusLine(SC.evaluate(null, { doc: 'primary/a' })))
      .toContain('照合していません');
    // 突合には入ったが、その図が拾えなかったとき (保存直後に読み直せなかった等)。
    var ev = SC.evaluate(NC.audit(THEIRS), { doc: 'primary/not_scanned' });
    expect(ev.verdict).toBe('unchecked');
    expect(SC.statusLine(ev)).toContain('照合していません');
  });

  test('いま保存した本文が、隣のフォルダを読んだ時点の控えより優先される', function() {
    var stale = [{ name: 'primary/a', persona: 'primary', dsl: seq(['ClockCtrl']) }];
    var fresh = [{ name: 'primary/a', persona: 'primary', dsl: seq(['Clock_Ctrl']) }];
    var docs = SC.merge(THEIRS.concat(stale), fresh);
    expect(docs.length).toBe(3);
    expect(SC.evaluate(NC.audit(docs), { doc: 'primary/a' }).verdict).toBe('clean');
  });
});
