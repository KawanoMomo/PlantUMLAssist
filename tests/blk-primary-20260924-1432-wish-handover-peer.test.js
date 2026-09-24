'use strict';
// BLK-primary-20260924-1432-wish: 引き継ぎチェックリストで「渡す相手 =」のフォルダを選ぶと、
// 5 列目「相手の同名図」に対応表 (state-map / class-map) と同じ判定で片方にしか無い要素を数え、
// 1 件以上なら行を赤くして名前を 3 つまで並べる。相手を選ばない間は今の 4 列のまま。
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

// primary (自分) の TIMER 状態遷移。
var MINE = [
  '@startuml', '[*] --> Idle', 'state Idle', 'state Configured', 'state Running',
  'Idle --> Configured : config', 'Configured --> Running : start', 'Running --> Idle : stop', '@enduml',
].join('\n');
// junior (相手) の同名図。Configured の中に primary に無い子状態 Sub / Sub2 / Sub3 / Sub4 が入っている。
var PEER = [
  '@startuml', '[*] --> Idle', 'state Idle', 'state Configured {', '  state Sub', '  state Sub2', '  state Sub3', '  state Sub4',
  '}', 'state Running',
  'Idle --> Configured : config', 'Configured --> Running : start', 'Running --> Idle : stop', '@enduml',
].join('\n');

function mapOf(mine, peer) { return sm.build(stateMod.parse(peer), stateMod.parse(mine)); }

describe('引き継ぎチェックリストの 5 列目「相手の同名図」', function() {
  test('相手にだけある子状態を数え、名前を 3 つまで並べて赤くする', function() {
    var cell = HB.peerCell(mapOf(MINE, PEER), true);
    expect(cell.state).toBe('differ');
    expect(cell.count >= 4).toBe(true);
    expect(cell.names.slice(0, 3)).toEqual(['Sub', 'Sub2', 'Sub3']);
    expect(cell.label.indexOf('Sub, Sub2, Sub3') >= 0).toBe(true);
    expect(cell.label.indexOf('ほか') >= 0).toBe(true);
  });

  test('相手に同名図が無ければ「相手に無い」で、赤にしない', function() {
    var b = HB.build({
      names: ['timer_state'], texts: { timer_state: MINE }, froms: ['X'], svg: { timer_state: 'match' }, findings: [],
      peer: { label: 'junior', cells: {} },
    });
    expect(b.rows[0].peer.state).toBe('missing');
    expect(b.rows[0].peer.label).toBe('相手に無い');
    expect(b.rows[0].ready).toBe(true);
    expect(b.peer.label).toBe('junior');
  });

  test('食い違いがあれば行は渡す前に見る側に回り、理由に名が出る', function() {
    var cell = HB.peerCell(mapOf(MINE, PEER), true);
    var b = HB.build({
      names: ['timer_state'], texts: { timer_state: MINE }, froms: ['X'], svg: { timer_state: 'match' }, findings: [],
      peer: { label: 'junior', cells: { timer_state: cell } },
    });
    expect(b.rows[0].ready).toBe(false);
    expect(b.rows[0].blockers).toEqual(['相手の同名図と食い違い']);
    expect(b.summary.blocked).toBe(1);
    expect(HB.copyText(b).split('\n')[0].split('\t').pop()).toBe('相手の同名図');
  });

  test('同じ中身・食い違いなし・状態遷移でない図は赤にしない', function() {
    expect(HB.peerCell(null, true, true).state).toBe('same');
    expect(HB.peerCell(mapOf(MINE, MINE), true).state).toBe('match');
    expect(HB.peerCell({ states: [], transitions: [] }, true).state).toBe('na');
    expect(HB.peerCell(null, true).state).toBe('unknown');
  });

  test('相手を選ばない間は 4 列のまま (peer を持たない)', function() {
    var b = HB.build({ names: ['a'], texts: { a: MINE }, froms: ['X'], svg: { a: 'match' }, findings: [] });
    expect(b.peer).toBe(undefined);
    expect(b.rows[0].peer).toBe(undefined);
    expect(HB.copyText(b).split('\n')[0].split('\t').length).toBe(5);
  });
});
