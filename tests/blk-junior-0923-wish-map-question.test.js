'use strict';
// BLK-junior-20260908-0923-wish: 対応表の不一致行を先輩・reviewer に預ける。
//
// 名前も抽象度も違う 2 枚を機械的に突き合わせても「先輩が後から足した 1 要素」は
// 自分では選べない。不一致行 1 つを質問 1 件にして自分の図に残し、答えを待たずに
// 次へ進めること、同じ行を二重に聞かないことを見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/review-pins.js', '../src/core/pin-inbox.js',
  '../src/core/state-transition.js', '../src/modules/state.js',
  '../src/core/state-map.js', '../src/core/map-question.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const MQ = global.window.MA.mapQuestion;
const RP = global.window.MA.reviewPins;
const sm = global.window.MA.stateMap;
const stateMod = global.window.MA.modules.plantumlState;

const SENIOR_DSL = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Disabled',
  'Idle --> Ready : init',
  'Idle --> Disabled : disable',
  '@enduml',
].join('\n');

const MINE_DSL = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state AnomalyCheck',
  'Idle --> Ready : init',
  '@enduml',
].join('\n');

function buildMap() {
  return sm.build(stateMod.parse(SENIOR_DSL), stateMod.parse(MINE_DSL));
}

function rowsOf(map) {
  return map.states.concat(map.transitions);
}

function firstRow(map, match) {
  return rowsOf(map).filter(function(r) { return r.match === match; })[0];
}

describe('聞ける行の見分け', function() {
  test('一致した行は聞くことが無い', function() {
    expect(MQ.askable({ match: 'exact', type: 'state', ref: 'Idle', mine: 'Idle' })).toBe(false);
  });

  test('片方だけ・部分一致は聞ける', function() {
    ['ref-only', 'mine-only', 'partial'].forEach(function(m) {
      expect(MQ.askable({ match: m, type: 'state', ref: 'A', mine: 'B' })).toBe(true);
    });
  });

  test('行が無ければ聞けない', function() {
    expect(MQ.askable(null)).toBe(false);
    expect(MQ.askable({})).toBe(false);
  });
});

describe('質問文', function() {
  const row = { match: 'ref-only', type: 'state', ref: 'Disabled', mine: '' };

  test('参照図と自分の両方を書き、なぜ決められないかを添える', function() {
    const b = MQ.body(row);
    expect(b.indexOf('状態')).toBe(0);
    expect(b.indexOf('Disabled')).toBeGreaterThan(0);
    expect(b.indexOf('／ 自分: —')).toBeGreaterThan(0);
    expect(b.indexOf(MQ.ASK)).toBeGreaterThan(0);
    expect(b.indexOf('参照図にだけあり')).toBeGreaterThan(0);
  });

  test('同じ行からは何度作っても同じ文になる (二重に聞いたか判る)', function() {
    expect(MQ.body(row)).toBe(MQ.body({ match: 'ref-only', type: 'state', ref: 'Disabled', mine: '' }));
  });

  test('宛先は本文の頭に書き、読み返せる', function() {
    const t = MQ.questionText(row, null);
    expect(t.indexOf('[?→ primary, reviewer] ')).toBe(0);
    const q = MQ.parse(t);
    expect(q.to).toEqual(['primary', 'reviewer']);
    expect(q.body).toBe(MQ.body(row));
  });

  test('ふつうの指摘は質問ではない', function() {
    expect(MQ.isQuestion('対応する method が無い')).toBe(false);
    expect(MQ.parse('対応する method が無い')).toBe(null);
  });

  test('宛先は空・重複を落とし、空になったら既定に戻す', function() {
    expect(MQ.normalizeTo(['primary', ' primary ', ''])).toEqual(['primary']);
    expect(MQ.normalizeTo([])).toEqual(MQ.defaultTo());
    expect(MQ.normalizeTo(['re]viewer'])).toEqual(['reviewer']);
  });
});

describe('質問を貼る行', function() {
  test('自分の図に対応する行があればその行', function() {
    const map = buildMap();
    const row = firstRow(map, 'mine-only');
    expect(!!row).toBe(true);
    expect(MQ.anchorLine(row, MINE_DSL)).toBe(row.mineLine);
  });

  test('自分の図に無い要素は図の頭 (@startuml) に貼る', function() {
    const row = { match: 'ref-only', type: 'state', ref: 'Disabled', mine: '', mineLine: null };
    expect(MQ.anchorLine(row, MINE_DSL)).toBe(1);
  });

  test('指摘行そのものには貼らない', function() {
    const withPin = RP.add(MINE_DSL, { line: 3, text: 'ここを見て', author: 'reviewer' });
    const pinAt = withPin.split('\n').findIndex(function(l) { return RP.isPinLine(l); }) + 1;
    const row = { match: 'ref-only', type: 'state', ref: 'X', mine: '', mineLine: pinAt };
    expect(MQ.anchorLine(row, withPin)).toBe(1);
  });
});

describe('預ける', function() {
  test('質問 1 件が自分の図に残り、指摘として読める', function() {
    const map = buildMap();
    const row = firstRow(map, 'ref-only');
    const out = MQ.ask(MINE_DSL, row, { author: 'junior', at: '2026-09-08T13:40' });
    expect(out).not.toBe(null);
    expect(out.to).toEqual(['primary', 'reviewer']);

    const pins = RP.list(out.text);
    expect(pins.length).toBe(1);
    expect(pins[0].author).toBe('junior');
    expect(pins[0].state).toBe('open');
    expect(pins[0].stale).toBe(false);
    expect(MQ.isQuestion(pins[0].text)).toBe(true);
  });

  test('質問はコメント行なので図の中身は変わらない', function() {
    const map = buildMap();
    const out = MQ.ask(MINE_DSL, firstRow(map, 'ref-only'), {});
    const kept = out.text.split('\n').filter(function(l) { return !RP.isPinLine(l); }).join('\n');
    expect(kept).toBe(MINE_DSL);
  });

  test('同じ行を 2 回聞かない', function() {
    const map = buildMap();
    const row = firstRow(map, 'ref-only');
    const once = MQ.ask(MINE_DSL, row, {});
    expect(MQ.hasAsked(once.text, row)).toBe(true);
    expect(MQ.ask(once.text, row, {})).toBe(null);
    expect(MQ.buttonLabel(once.text, row)).toBe('✔ 聞き済み');
    expect(MQ.buttonLabel(MINE_DSL, row)).toBe('先輩に聞く');
  });

  test('別の行は別の質問として預けられる', function() {
    const map = buildMap();
    const a = firstRow(map, 'ref-only');
    const b = firstRow(map, 'mine-only');
    const s1 = MQ.ask(MINE_DSL, a, {});
    const s2 = MQ.ask(s1.text, b, {});
    expect(s2).not.toBe(null);
    expect(MQ.asked(s2.text).length).toBe(2);
  });

  test('一致した行は預けられない', function() {
    const map = buildMap();
    const row = firstRow(map, 'exact');
    expect(!!row).toBe(true);
    expect(MQ.ask(MINE_DSL, row, {})).toBe(null);
  });
});

describe('預けた件数', function() {
  test('未回答は対応済みにされるまで残る', function() {
    const map = buildMap();
    expect(MQ.summary(MINE_DSL)).toBe('');
    const out = MQ.ask(MINE_DSL, firstRow(map, 'ref-only'), {});
    expect(MQ.summary(out.text)).toBe('先輩に預けた質問 1 件 (未回答 1)');
    const done = RP.markDone(out.text, RP.list(out.text)[0].id, {});
    expect(MQ.summary(done)).toBe('先輩に預けた質問 1 件 (未回答 0)');
  });
});

describe('相手の指摘箱に並ぶ', function() {
  test('自分が書いた質問は自分の箱には出ず、先輩の箱には出る', function() {
    const map = buildMap();
    const out = MQ.ask(MINE_DSL, firstRow(map, 'ref-only'), { author: 'junior' });
    const docs = [{ name: 'gpio_state_mine.puml', dsl: out.text }];
    const items = global.window.MA.pinInbox.collect(docs);
    expect(global.window.MA.pinInbox.filter(items, { excludeAuthor: 'junior' }).length).toBe(0);
    expect(global.window.MA.pinInbox.filter(items, { excludeAuthor: 'primary' }).length).toBe(1);
  });
});
