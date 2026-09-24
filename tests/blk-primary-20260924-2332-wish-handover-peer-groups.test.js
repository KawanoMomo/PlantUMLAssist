'use strict';
// BLK-primary-20260924-2332-wish: 引き継ぎチェックリストの 5 列目「相手の同名図」を、図の数ではなく
// 要素 (部品名・子状態) の数で読む。食い違いを「要素名 × 種類 (相手に無い / 自分に無い / 名前の形が違う)」
// の組で数え、1 つの組が何枚の図にまたがるか (`EnableClock ×4`) と、見出しの「食い違い 18/24 枚 · 要素 N 種」を出す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/state-transition.js', '../src/modules/state.js', '../src/core/state-map.js',
  '../src/core/handover-board.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});

var HB = global.window.MA.handoverBoard;
var sm = global.window.MA.stateMap;
var stateMod = global.window.MA.modules.plantumlState;

function mapOf(mine, peer) { return sm.build(stateMod.parse(peer), stateMod.parse(mine)); }
function dsl(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// 自分 (primary) は EnableClock を持ち、相手 (junior) には無い。これが 3 枚で同じ形で起きている。
var MINE_A = dsl(['[*] --> Idle', 'state Idle', 'state EnableClock', 'state Running',
  'Idle --> EnableClock : init', 'EnableClock --> Running : ok']);
var PEER_A = dsl(['[*] --> Idle', 'state Idle', 'state Running', 'Idle --> Running : init']);
// 4 枚目だけは相手に Retrying があって自分に無い (種類が違う)。
var MINE_B = dsl(['[*] --> Idle', 'state Idle', 'state Running', 'Idle --> Running : go']);
var PEER_B = dsl(['[*] --> Idle', 'state Idle', 'state Running', 'state Retrying',
  'Idle --> Running : go', 'Running --> Retrying : fail']);

function board() {
  var names = ['adc_state', 'can_state', 'gpio_state', 'spi_state', 'readme_seq'];
  var texts = { adc_state: MINE_A, can_state: MINE_A, gpio_state: MINE_A, spi_state: MINE_B, readme_seq: MINE_B };
  var svg = {};
  names.forEach(function(n) { svg[n] = 'match'; });
  var cells = {
    adc_state: HB.peerCell(mapOf(MINE_A, PEER_A), true),
    can_state: HB.peerCell(mapOf(MINE_A, PEER_A), true),
    gpio_state: HB.peerCell(mapOf(MINE_A, PEER_A), true),
    spi_state: HB.peerCell(mapOf(MINE_B, PEER_B), true),
    readme_seq: HB.peerCell(null, false),
  };
  return HB.build({ names: names, texts: texts, froms: ['X'], svg: svg, findings: [],
    peer: { label: 'junior', cells: cells } });
}

function groupOf(b, name) {
  return HB.peerGroups(b).filter(function(g) { return g.name === name; })[0];
}

describe('引き継ぎチェックリストの食い違いを要素で読む', function() {
  test('1 枚の図の食い違いは要素名と種類の組で持つ (3 つで切らない)', function() {
    var cell = HB.peerCell(mapOf(MINE_A, PEER_A), true);
    expect(cell.state).toBe('differ');
    var st = cell.items.filter(function(it) { return it.name === 'EnableClock'; });
    expect(st.length).toBe(1);
    expect(st[0].kind).toBe('peer-lacks');
    expect(st[0].kindLabel).toBe('相手に無い');
    var b = HB.peerCell(mapOf(MINE_B, PEER_B), true);
    var r = b.items.filter(function(it) { return it.name === 'Retrying'; })[0];
    expect(r.kind).toBe('mine-lacks');
    expect(r.kindLabel).toBe('自分に無い');
  });

  test('同じ食い違い方をしている図の枚数を数える (EnableClock ×3)', function() {
    var b = board();
    var g = groupOf(b, 'EnableClock');
    expect(g.count).toBe(3);
    expect(g.docs).toEqual(['adc_state', 'can_state', 'gpio_state']);
    expect(groupOf(b, 'Retrying').count).toBe(1);
    // 多い組が先。
    expect(HB.peerGroups(b)[0].count).toBe(3);
  });

  test('見出しは「食い違い 4/5 枚 · 要素 N 種」の形で、図の枚数と種類の数を並べる', function() {
    var b = board();
    var ps = HB.peerSummary(b);
    expect(ps.docs).toBe(4);
    expect(ps.total).toBe(5);
    expect(ps.kinds).toBe(HB.peerGroups(b).length);
    expect(ps.line).toBe('食い違い 4/5 枚 · 要素 ' + ps.kinds + ' 種');
    // 図 3 枚の同じ食い違いは 1 種と数える (種類は図の数より少ない)。
    var perDoc = 0;
    b.rows.forEach(function(r) { perDoc += (r.peer.items || []).length; });
    expect(ps.kinds < perDoc).toBe(true);
  });

  test('チップの組で絞ると、同じ組を持つ行だけが残る (空で戻す)', function() {
    var b = board();
    var g = groupOf(b, 'EnableClock');
    expect(HB.filterRows(b, g.key).map(function(r) { return r.name; }))
      .toEqual(['adc_state', 'can_state', 'gpio_state']);
    expect(HB.filterRows(b, groupOf(b, 'Retrying').key).map(function(r) { return r.name; })).toEqual(['spi_state']);
    expect(HB.filterRows(b, '').length).toBe(5);
  });

  test('名前は同じでも種類が違えば別の組 (相手に無い と 自分に無い を混ぜない)', function() {
    var mine = dsl(['[*] --> Idle', 'state Idle', 'state Busy', 'Idle --> Busy : a']);
    var peer = dsl(['[*] --> Idle', 'state Idle', 'Idle --> Idle : a']);
    var b = HB.build({
      names: ['x', 'y'], texts: { x: mine, y: peer }, froms: ['Q'], svg: { x: 'match', y: 'match' }, findings: [],
      peer: { label: 'junior', cells: {
        x: HB.peerCell(mapOf(mine, peer), true),
        y: HB.peerCell(mapOf(peer, mine), true),
      } },
    });
    var busy = HB.peerGroups(b).filter(function(g) { return g.name === 'Busy'; });
    expect(busy.length).toBe(2);
    expect(busy.map(function(g) { return g.kind; }).sort()).toEqual(['mine-lacks', 'peer-lacks']);
    expect(busy[0].count).toBe(1);
  });

  test('名前の形が違う状態は「名前の形が違う」の組になる', function() {
    var mine = dsl(['[*] --> Idle', 'state Idle', 'state Driving_High', 'Idle --> Driving_High : set']);
    var peer = dsl(['[*] --> Idle', 'state Idle', 'state DrivingHighLevel', 'Idle --> DrivingHighLevel : set']);
    var map = mapOf(mine, peer);
    var partial = (map.states || []).filter(function(r) { return r.match === 'partial'; });
    var cell = HB.peerCell(map, true);
    if (partial.length) {
      var ren = cell.items.filter(function(it) { return it.kind === 'renamed'; });
      expect(ren.length).toBe(1);
      expect(ren[0].kindLabel).toBe('名前の形が違う');
      expect(ren[0].name).toBe(partial[0].mine + ' → ' + partial[0].ref);
    } else {
      // 形が離れすぎて組にならなければ、片方だけの 2 つとして出る。
      expect(cell.items.map(function(it) { return it.kind; }).sort()).toEqual(['mine-lacks', 'peer-lacks']);
    }
    // 遷移の partial (端の名前が違うだけ) は数えない。
    expect(cell.items.filter(function(it) { return /->/.test(it.name) && it.kind === 'renamed'; }).length).toBe(0);
  });

  test('相手を選ばない表では見出しの行を出さない', function() {
    var b = HB.build({ names: ['a'], texts: { a: MINE_A }, froms: ['X'], svg: { a: 'match' }, findings: [] });
    expect(HB.peerSummary(b).line).toBe('');
    expect(HB.peerGroups(b)).toEqual([]);
  });
});
