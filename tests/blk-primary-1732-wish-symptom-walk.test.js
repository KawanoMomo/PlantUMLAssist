'use strict';
// BLK-primary-20260925-1732-wish: 症状検索の当たり図を、影響を見るの「ここから順に直す」と同じ
// 手当ての帯 (1 本を共用) で関連度順に 1 枚ずつ送る。開いた図では当たった語と「流れ」で対応の無い名前の
// 行を、DSL と図の相互ジャンプと同じ光らせ方で示す。ここでは光らせる行の選び方と、帯の列が
// 症状検索から始めたことを覚えていることを固定する。
if (!global.window) global.window = global;
['../src/core/impact-scan.js', '../src/core/symptom-search.js', '../src/core/symptom-flow.js', '../src/core/fix-walk.js']
  .forEach(function(p) {
    try { delete require.cache[require.resolve(p)]; } catch (e) {}
    require(p);
  });
const fs = require('fs');
const path = require('path');
var ss = global.window.MA.symptomSearch;
var sf = global.window.MA.symptomFlow;
var FW = global.window.MA.fixWalk;
const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

var SYMPTOM = 'Can_Driver のバスオフ復帰後に EnableIrq が再発火しない';
var SEQ = [
  '@startuml',
  'title CAN 送信',
  'participant App',
  'participant Can_Driver',
  'App -> Can_Driver : Can_Transmit()',
  "' Can_Driver はここでは扱わない",
  'Can_Driver -> Can_Driver : Can_Reset()',
  'Can_Driver -> App : EnableIrq()',
  '@enduml',
].join('\n');
var STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> BusOff : Can_Driver_BusOff',
  'BusOff --> Idle : Can_Driver_Recover',
  '@enduml',
].join('\n');
var DOCS = [
  { id: 1, name: 'can_seq', dsl: SEQ },
  { id: 2, name: 'can_state', dsl: STATE },
];

describe('症状検索の図で光らせる行 markLines', function() {
  test('症状の語が当たる行を全部 (語ごとの 1 行だけでなく) 返す。コメント・@ 行は光らせない', function() {
    var lines = ss.markLines(SEQ, SYMPTOM, []);
    // participant Can_Driver / 3 本のメッセージ (Can_Driver が端点)
    expect(lines).toEqual([4, 5, 7, 8]);
  });

  test('流れで対応の無い名前 (末尾の () の有無を問わない) の行も足す', function() {
    var lines = ss.markLines(SEQ, 'EnableIrq', ['Can_Transmit()']);
    expect(lines).toEqual([5, 8]);
  });

  test('当たらない症状・空の本文では何も光らせない', function() {
    expect(ss.markLines(SEQ, '', [])).toEqual([]);
    expect(ss.markLines('', SYMPTOM, ['Can_Reset'])).toEqual([]);
  });

  test('行は今の本文から引き直す (開いた後に行を足しても光る場所が付いていく)', function() {
    var edited = SEQ.replace('participant App\n', 'participant App\nparticipant Hal\n');
    expect(ss.markLines(edited, SYMPTOM, [])).toEqual([5, 6, 8, 9]);
  });
});

describe('手当ての帯を症状検索から始める', function() {
  var rows = ss.search(DOCS, SYMPTOM);
  var gaps = {};
  sf.cross(DOCS, SYMPTOM).rows.forEach(function(x) {
    if (x.status === 'gap') gaps[x.name] = x.gaps.map(function(g) { return g.name; });
  });
  var list = rows.map(function(r) {
    return { doc: r.name, hop: 0, via: r.matched, note: '関連度 ' + r.score };
  });

  test('当たった図が関連度順に列になり、押した図から始まる', function() {
    var w = FW.start('症状', list, { startDoc: 'can_state', title: '症状「Can_Driver…」の当たり図', origin: 'symptom', query: SYMPTOM });
    expect(w.items.map(function(it) { return it.doc; })).toEqual(['can_seq', 'can_state']);
    expect(FW.current(w).doc).toBe('can_state');
    expect(w.origin).toBe('symptom');
    expect(w.query).toBe(SYMPTOM);
  });

  test('「次へ」「直した · 次へ」で送っても、症状検索の列であることと症状文を覚えている', function() {
    var w = FW.start('症状', list, { origin: 'symptom', query: SYMPTOM });
    var n = FW.go(w, 1);
    expect(n.origin).toBe('symptom');
    expect(n.query).toBe(SYMPTOM);
    var d = FW.doneNext(w);
    expect(d.origin).toBe('symptom');
  });

  test('帯は届き方の代わりに関連度を言う。影響を見るの列は今までどおり「直接 / 連鎖」', function() {
    var w = FW.start('症状', list, { title: '症状「Can_Driver…」の当たり図', origin: 'symptom', query: SYMPTOM });
    expect(FW.labelText(w)).toContain('can_seq (関連度 ');
    var dep = FW.start('Spi_Driver', [{ doc: 'spi_state', hop: 1, via: ['X'] }], {});
    expect(FW.labelText(dep)).toContain('spi_state (連鎖 1 段)');
    expect(dep.origin).toBe('');
  });

  test('流れで対応の無い名前は図ごとに持てる (光らせる材料)', function() {
    expect(gaps.can_seq).toEqual(['EnableIrq()']);
  });
});

describe('画面 (app.js / html)', function() {
  test('症状検索の結果の各図に、影響を見ると同じ「ここから順に直す」があり、帯を共用する', function() {
    expect(app).toContain("walk.textContent = 'ここから順に直す'");
    expect(app).toContain("startFixWalk(title, list, { startDoc: startName, title: title, origin: 'symptom', query: text })");
  });

  test('開いた図の行を相互ジャンプと同じ琥珀の破線で光らせ、描画のたびに引き直す', function() {
    expect(app).toContain('try { applySymptomMarks(); } catch (e) {}');
    expect(html).toContain('#overlay-layer rect.selectable.sym-mark:not(.selected)');
  });

  test('症状検索の中に並べる入口は足さない (新しい枠・調査セットは作らない)', function() {
    expect(app).not.toContain('調査セット');
  });
});
