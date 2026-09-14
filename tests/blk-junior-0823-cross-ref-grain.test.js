'use strict';
// BLK-junior-20260908-0823 — 名前が 1 つも対応しない 2 枚の見比べ。
// 先輩版 (電気的な出力状態) と自分版 (Uninit/Busy/Error + 選択擬似状態) のように
// 抽象度が違うと、要素単位の突き合わせは全行を「相手にしかない」に落とす。
// それを「先輩が後から足した差分」として出さず、土俵が違うと言い切る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
require('../src/core/outline.js');
try { delete require.cache[require.resolve('../src/core/cross-ref-diff.js')]; } catch (e) {}
require('../src/core/cross-ref-diff.js');
var CRD = global.window.MA.crossRefDiff;

// 先輩 (primary) の GPIO 状態遷移図: 電気的な出力状態で描いてある
var REF = [
  '@startuml',
  'title GPIO 状態遷移',
  '[*] --> Idle',
  'state Idle',
  'state Configured',
  'state Driving_High',
  'state Driving_Low',
  'state Fault',
  'Idle --> Configured : Gpio_SetPinDirection',
  'Configured --> Driving_High : Gpio_WriteChannel(HIGH)',
  'Configured --> Driving_Low : Gpio_WriteChannel(LOW)',
  'Driving_High --> Fault : OverCurrent',
  'Fault --> Idle : Gpio_Init',
  '@enduml',
].join('\n');

// 自分 (junior) の版: ドライバの生死で描いてあり、選択擬似状態を持つ
var SELF = [
  '@startuml',
  'title GPIO ドライバ状態遷移 (レビュー反映)',
  '[*] --> Uninit',
  'state Uninit',
  'state Ready',
  'state Busy',
  'state Error',
  'state AnomalyCheck <<choice>>',
  'Uninit --> Ready : init',
  'Ready --> Busy : request',
  'Busy --> AnomalyCheck : done',
  'AnomalyCheck --> Ready : [ok]',
  'AnomalyCheck --> Error : [ng]',
  '@enduml',
].join('\n');

describe('抽象度の違う 2 枚の見比べ (BLK-junior-20260908-0823)', () => {
  var result = CRD.diff(SELF, REF, null);

  test('名前が 1 つも一致しないので、共通は 0 件になる', () => {
    expect(result.common).toBe(0);
    expect(result.onlyRef.length).toBeGreaterThan(0);
    expect(result.onlySelf.length).toBeGreaterThan(0);
  });

  test('comparability: 共通 0 件・両側ありなら disjoint', () => {
    var c = CRD.comparability(result);
    expect(c.level).toBe('disjoint');
    expect(c.ratio).toBe(0);
  });

  test('summary: 「相手が足した差分」ではなく「対応が無い」と言い切る', () => {
    var s = CRD.summary(result);
    expect(s).toContain('対応する要素が 1 つもありません');
    expect(s).toContain('別の粒度');
    // 取り込む 1 個を選べるかのような言い方をしない
    expect(s.indexOf('相手にしかない')).toBe(-1);
  });

  test('comparability: 共通が多ければ aligned (従来の差分として読める)', () => {
    var near = SELF.replace('Ready --> Busy : request', 'Ready --> Busy : request2');
    var c = CRD.comparability(CRD.diff(SELF, near, null));
    expect(c.level).toBe('aligned');
  });

  test('comparability: 相手が空なら disjoint ではなく片寄りとして扱う', () => {
    var c = CRD.comparability(CRD.diff(SELF, '@startuml\n@enduml', null));
    expect(c.level).not.toBe('disjoint');
  });

  test('comparability: 差が無ければ aligned', () => {
    expect(CRD.comparability(CRD.diff(SELF, SELF, null)).level).toBe('aligned');
  });

  test('summary: 共通が少しだけなら「揃っていない可能性」を添える', () => {
    // 1 行だけ揃っていて残りが総取っ替えの 2 枚
    var half = REF.replace('[*] --> Idle', '[*] --> Uninit');
    var c = CRD.comparability(CRD.diff(SELF, half, null));
    expect(c.level).toBe('partial');
    expect(CRD.summary(CRD.diff(SELF, half, null))).toContain('揃っていない可能性');
  });
});

describe('形での見比べ (BLK-junior-20260908-0823)', () => {
  test('shape: 種別ごとの件数と擬似状態の数を返す', () => {
    var a = CRD.shape(SELF);
    expect(a.counts.state).toBeGreaterThan(0);
    expect(a.counts.relation).toBeGreaterThan(0);
    // 自分版は [*] 1 つと <<choice>> 1 つを持つ
    expect(a.pseudo).toBe(2);
    // 先輩版は [*] だけ
    expect(CRD.shape(REF).pseudo).toBe(1);
  });

  test('shapeRows: 自分と相手の件数を並べ、差の大きい種別から出す', () => {
    var rows = CRD.shapeRows(SELF, REF);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(function(r) {
      expect(typeof r.self).toBe('number');
      expect(typeof r.ref).toBe('number');
      expect(r.label).not.toBe('');
    });
    for (var i = 1; i < rows.length; i++) {
      var prev = Math.abs(rows[i - 1].self - rows[i - 1].ref);
      var cur = Math.abs(rows[i].self - rows[i].ref);
      expect(prev >= cur).toBe(true);
    }
  });

  test('shapeRows: 擬似状態の行が出る (名前が違っても数は比べられる)', () => {
    var row = CRD.shapeRows(SELF, REF).filter(function(r) { return r.kind === 'pseudo'; })[0];
    expect(row.self).toBe(2);
    expect(row.ref).toBe(1);
  });

  test('kindLabel: 種別を日本語で言う', () => {
    expect(CRD.kindLabel('state')).toBe('状態');
    expect(CRD.kindLabel('relation')).toBe('遷移・関係');
    expect(CRD.kindLabel('nope')).toBe('nope');
  });

  test('shapeSummary: どちらが細かく描いてあるかを言い切る', () => {
    var s = CRD.shapeSummary(SELF, REF);
    expect(s === '' ).toBe(false);
    expect(/相手|自分|同じ/.test(s)).toBe(true);
  });

  test('shapeSummary: 同じ図どうしなら「数は同じ」と言う', () => {
    expect(CRD.shapeSummary(SELF, SELF)).toContain('同じ');
  });
});
