'use strict';
// BLK-reviewer-20260916-0326-wish: 表記揺れはグループ単位でしか出ないので、
// Clock_Ctrl ⇔ ClockCtrl が junior の中だけの揺れなのか primary の図とぶつかって
// いるのかは、グループの図を 1 枚ずつ開くまで分からなかった。前回の run はそれを
// 取り違えて「junior 内部だけの揺れ」と書いた (実際は primary と junior が混在)。
// 図ごとに「他 persona と衝突 / 自分の中の揺れ」を出し、誤判定を構造的に防ぐ。
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

function seq(names) {
  return '@startuml\n' + names.map(function(n) { return 'participant ' + n; }).join('\n')
    + '\n' + names[0] + ' -> ' + names[0] + ': ping\n@enduml\n';
}

// 起票の場面: Clock_Ctrl ⇔ ClockCtrl は primary 側にも junior 側にも出ていた。
var MIXED = [
  { name: 'primary/spi_init_sequence', persona: 'primary', dsl: seq(['ClockCtrl', 'SpiDrv']) },
  { name: 'primary/spi_state', persona: 'primary', dsl: seq(['ClockCtrl']) },
  { name: 'junior/clock_init_sequence', persona: 'junior', dsl: seq(['Clock_Ctrl']) },
  { name: 'junior/clock_state', persona: 'junior', dsl: seq(['Clock_Ctrl']) },
];

// junior の中だけで割れている場合 (相手に断らずに揃えられる)。
var INTERNAL = [
  { name: 'junior/a', persona: 'junior', dsl: seq(['Irq_Ctrl']) },
  { name: 'junior/b', persona: 'junior', dsl: seq(['IrqCtrl']) },
  { name: 'primary/c', persona: 'primary', dsl: seq(['SpiDrv']) },
];

describe('name-clash: 表記揺れを persona をまたぐかどうかで分ける', function() {

  test('違う綴りが違う persona の図に出ていれば衝突として出す', function() {
    var g = NC.groups(MIXED);
    var clock = g.filter(function(r) { return r.key === 'clockctrl'; })[0];
    expect(!!clock).toBe(true);
    expect(clock.cross).toBe(true);
    expect(clock.personas.sort()).toEqual(['junior', 'primary']);
    expect(clock.spellings.map(function(s) { return s.name; }).sort())
      .toEqual(['ClockCtrl', 'Clock_Ctrl']);
  });

  test('綴りの持ち主が 1 人なら、persona が 2 人いても衝突にしない', function() {
    // 同じ綴りを 2 人が使っているだけ (揺れていない) なら断る相手はいない。
    var g = NC.groups([
      { name: 'primary/a', persona: 'primary', dsl: seq(['SpiDrv']) },
      { name: 'junior/b', persona: 'junior', dsl: seq(['SpiDrv']) },
    ]);
    expect(g.filter(function(r) { return r.cross; })).toEqual([]);
  });

  test('自分の図の中だけで割れていれば internal として出す', function() {
    var g = NC.groups(INTERNAL);
    var irq = g.filter(function(r) { return r.key === 'irqctrl'; })[0];
    expect(!!irq).toBe(true);
    expect(irq.cross).toBe(false);
    expect(irq.personas).toEqual(['junior']);
  });

  test('byDoc は図ごとに判定を出し、衝突なら相手の persona を名指しする', function() {
    var rows = NC.byDoc(MIXED);
    expect(rows['primary/spi_init_sequence'].verdict).toBe('cross');
    expect(rows['primary/spi_init_sequence'].others).toEqual(['junior']);
    expect(rows['junior/clock_state'].verdict).toBe('cross');
    expect(rows['junior/clock_state'].others).toEqual(['primary']);
  });

  test('揺れに関わらない図には印を付けない (探す目の手数を増やさない)', function() {
    var rows = NC.byDoc(INTERNAL);
    expect(rows['primary/c'].verdict).toBe('clean');
    expect(NC.badge(rows['primary/c'])).toBeNull();
    expect(rows['junior/a'].verdict).toBe('internal');
  });

  test('持ち主が分からない図では衝突と言わない (誤判定を増やさない)', function() {
    var rows = NC.byDoc([
      { name: 'a', dsl: seq(['Clock_Ctrl']) },
      { name: 'b', dsl: seq(['ClockCtrl']) },
    ]);
    expect(rows['a'].verdict).toBe('internal');
    expect(rows['b'].verdict).toBe('internal');
  });

  test('badge は衝突なら相手の名前と揃える先を文言に載せる', function() {
    var b = NC.badge(NC.byDoc(MIXED)['junior/clock_state']);
    expect(b.severity).toBe('cross');
    expect(b.label).toBe('primaryと衝突');
    expect(b.title).toContain('ClockCtrl');
  });

  test('audit は図数・persona・衝突図を数え上げる', function() {
    var res = NC.audit(MIXED);
    expect(res.checked).toBe(4);
    expect(res.personas).toEqual(['junior', 'primary']);
    expect(res.crossDocs.length).toBe(4);
    expect(res.internalDocs).toEqual([]);
    expect(res.clean).toBe(false);
  });

  test('audit は割れが無ければ clean で返す', function() {
    var res = NC.audit([
      { name: 'primary/a', persona: 'primary', dsl: seq(['SpiDrv']) },
      { name: 'junior/b', persona: 'junior', dsl: seq(['SpiDrv']) },
    ]);
    expect(res.clean).toBe(true);
    expect(NC.summaryClass(res)).toBe('nc-clean');
    expect(NC.summaryLine(res)).toContain('表記の割れなし');
  });

  test('summaryLine は何枚を照合しての結果かを必ず言う', function() {
    expect(NC.summaryLine(null)).toBe('他の persona の図と照合していません');
    var line = NC.summaryLine(NC.audit(MIXED));
    expect(line).toContain('4 枚を照合');
    expect(line).toContain('junior・primary');
    expect(line).toContain('他 persona と衝突 4 図');
    expect(NC.summaryClass(NC.audit(MIXED))).toBe('nc-cross');
    expect(NC.summaryClass(NC.audit(INTERNAL))).toBe('nc-internal');
  });

  test('crossLines は相手側の図を名指しする (全文を読み直させない)', function() {
    var lines = NC.crossLines(NC.audit(MIXED));
    expect(lines[0]).toContain('⇔');
    expect(lines.join('\n')).toContain('junior/clock_state');
    expect(lines.join('\n')).toContain('（primary）');
  });
});
