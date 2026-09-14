'use strict';
// BLK-primary-20260908-1803-wish: 引き継ぎに添える申し送りチェックリスト。
// 渡す時点で項目が固定され (差分が消えても残る)、新人の返信 JSON を読み込むと
// 「未読 N 件・要フォロー M 件」が出ることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

var _store = {};
Object.defineProperty(global.window, 'localStorage', {
  configurable: true,
  value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
  },
});

try { delete require.cache[require.resolve('../src/core/handover-checklist.js')]; } catch (e) {}
require('../src/core/handover-checklist.js');
try { delete require.cache[require.resolve('../src/core/handoff-package.js')]; } catch (e) {}
require('../src/core/handoff-package.js');
var HC = global.window.MA.handoverChecklist;
var HP = global.window.MA.handoffPackage;

var NOTES = [
  { name: 'dma_state', text: 'Done→Configured を足した', at: '2026-09-08T10:00:00Z' },
  { name: 'adc_state', text: 'Adc_Ack() を足した', at: '2026-09-08T09:00:00Z' },
];

function fresh() {
  for (var k in _store) { if (Object.prototype.hasOwnProperty.call(_store, k)) delete _store[k]; }
  HC._reset();
}

describe('handoverChecklist.build', () => {
  test('申し送りを項目として固定する (差分の有無を見ない)', () => {
    var c = HC.build(NOTES, '2026-09-08T18:03:00Z');
    expect(c.createdAt).toBe('2026-09-08T18:03:00Z');
    expect(c.items.map(function(i) { return i.id; })).toEqual(['dma_state', 'adc_state']);
    expect(c.items[0].text).toBe('Done→Configured を足した');
  });

  test('文が空の申し送りは項目にしない', () => {
    expect(HC.build([{ name: 'a', text: '  ' }]).items).toEqual([]);
  });

  test('同じ図名が 2 件あっても id は衝突しない', () => {
    var c = HC.build([{ name: 'a', text: 'x' }, { name: 'a', text: 'y' }]);
    expect(c.items.map(function(i) { return i.id; })).toEqual(['a', 'a-2']);
  });
});

describe('handoverChecklist の往復', () => {
  test('返信を重ねると未読・要フォローが数えられる', () => {
    var c = HC.build(NOTES, 'T0');
    var raw = HC.serializeReply('T0', { dma_state: HC.UNCLEAR }, 'T1');
    var merged = HC.merge(c, HC.parseReply(raw));
    expect(merged[0].status).toBe(HC.UNCLEAR);
    expect(merged[0].statusLabel).toBe('分からなかった');
    expect(merged[1].status).toBe('');
    var sum = HC.summary(merged);
    expect(sum.total).toBe(2);
    expect(sum.unread).toBe(1);
    expect(sum.follow).toBe(1);
    expect(sum.line).toBe('申し送り 2 件: 未読 1 件・要フォロー 1 件');
  });

  test('「分からなかった」の項目だけを取り出せる (次回の教育内容)', () => {
    var c = HC.build(NOTES, 'T0');
    var merged = HC.merge(c, HC.parseReply(HC.serializeReply('T0', { adc_state: HC.UNCLEAR })));
    expect(HC.followUps(merged).map(function(i) { return i.name; })).toEqual(['adc_state']);
  });

  test('知らない status の返信は無視する', () => {
    var r = HC.parseReply('{"kind":"handover-reply","replies":{"a":"maybe","b":"done"}}');
    expect(r.replies).toEqual({ b: 'done' });
  });

  test('壊れた返信は null', () => {
    expect(HC.parseReply('{')).toBe(null);
    expect(HC.parseReply('{"kind":"handover-reply"}')).toBe(null);
    expect(HC.parseReply('')).toBe(null);
  });

  test('チェックリストは JSON で往復できる', () => {
    var c = HC.build(NOTES, 'T0');
    var back = HC.parse(HC.serialize(c));
    expect(back.items).toEqual(c.items);
  });

  test('返信ファイル名は日時入り', () => {
    expect(HC.replyFileName(new Date(2026, 8, 8, 18, 3))).toBe('handover-reply-20260908-1803.json');
  });
});

describe('handoverChecklist の控え', () => {
  test('渡した控えと返信から現在の状態を出す', () => {
    fresh();
    expect(HC.current().summary.total).toBe(0);
    HC.issue(HC.build(NOTES, 'T0'));
    expect(HC.current().summary.line).toBe('申し送り 2 件: 未読 2 件・要フォロー 0 件');
    HC.receive(HC.serializeReply('T0', { dma_state: HC.DONE, adc_state: HC.UNCLEAR }, 'T1'));
    var cur = HC.current();
    expect(cur.summary.unread).toBe(0);
    expect(cur.summary.follow).toBe(1);
    expect(cur.summary.done).toBe(1);
    expect(cur.repliedAt).toBe('T1');
  });

  test('控えは読み直しても残る (次回起動時に見える)', () => {
    fresh();
    HC.issue(HC.build(NOTES, 'T0'));
    HC.receive(HC.serializeReply('T0', { dma_state: HC.DONE }, 'T1'));
    HC._reset();
    expect(HC.current().summary.line).toBe('申し送り 2 件: 未読 1 件・要フォロー 0 件');
  });

  test('渡し直すと古い返信は捨てる', () => {
    fresh();
    HC.issue(HC.build(NOTES, 'T0'));
    HC.receive(HC.serializeReply('T0', { dma_state: HC.DONE }, 'T1'));
    HC.issue(HC.build(NOTES, 'T2'));
    expect(HC.current().summary.unread).toBe(2);
  });

  test('読めない返信は控えを変えない', () => {
    fresh();
    HC.issue(HC.build(NOTES, 'T0'));
    expect(HC.receive('こわれている')).toBe(null);
    expect(HC.current().summary.unread).toBe(2);
  });
});

describe('引き継ぎパッケージへの差し込み', () => {
  test('index.html に 3 択のボタンと返信の保存が入る', () => {
    var snap = HP.buildSnapshot({
      docs: [{ id: '1', name: 'dma_state', dsl: '@startuml\n@enduml' }],
      notes: NOTES, svgs: {}, checklistAt: 'T0',
    });
    expect(snap.checklist.items.length).toBe(2);
    var html = HP.renderIndexHtml(snap);
    expect(html).toContain('申し送りチェックリスト');
    expect(html).toContain('data-item-id="dma_state"');
    expect(html).toContain('読んだ');
    expect(html).toContain('対応した');
    expect(html).toContain('分からなかった');
    expect(html).toContain('id="hc-save"');
  });

  test('申し送りが 0 件なら節はそのまま「ありません」', () => {
    var snap = HP.buildSnapshot({ docs: [], notes: [], svgs: {} });
    expect(HP.checklistLine(snap)).toBe('申し送りはありません。');
    expect(HP.files(snap).map(function(f) { return f.name; })).toEqual(['index.html']);
  });

  test('zip に控えの JSON も入る', () => {
    var snap = HP.buildSnapshot({ docs: [], notes: NOTES, svgs: {}, checklistAt: 'T0' });
    var names = HP.files(snap).map(function(f) { return f.name; });
    expect(names).toContain('handover-checklist.json');
    var back = HC.parse(HP.files(snap)[1].content);
    expect(back.items.length).toBe(2);
  });
});
