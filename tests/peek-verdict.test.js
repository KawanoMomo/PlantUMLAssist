'use strict';
// BLK-junior-20260914-1706-wish: 先輩にアクティビティ図が 1 枚も無いと分かっても、
// 「この図種は相手に実体が無いので今回は対応不要だった」は本人の記憶と run ログにしか
// 残らず、次に同じ図を担当するたびに 👀他フォルダ → 図種バッジの確認をやり直していた。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/peek-verdict.js')]; } catch (e) {}
require('../src/core/peek-verdict.js');
var PV = global.window.MA.peekVerdict;

var DOC = ['@startuml', 'title GPIO 状態遷移', '[*] --> Idle', '@enduml'].join('\n');
var REC = { kind: 'アクティビティ図', dir: 'primary', count: 0, at: '2026-09-14T17:06' };

describe('peekVerdict — 確認の結論を図の中に残す', function() {
  test('控えは PlantUML のコメント 1 行 (図には出ない)', function() {
    expect(PV.format(REC).indexOf("' @peek ")).toBe(0);
    expect(PV.format(REC)).toContain('アクティビティ図|primary|0|2026-09-14T17:06');
  });

  test('@startuml の次の行に書き足す', function() {
    var out = PV.write(DOC, REC).split('\n');
    expect(out[0]).toBe('@startuml');
    expect(PV.isVerdictLine(out[1])).toBe(true);
    expect(out[2]).toBe('title GPIO 状態遷移');
  });

  test('書いた控えはそのまま読み戻せる', function() {
    var r = PV.find(PV.write(DOC, REC), 'アクティビティ図', 'primary');
    expect(r.count).toBe(0);
    expect(r.at).toBe('2026-09-14T17:06');
    expect(r.note).toBe('対応不要（相手に実体なし）');
  });

  test('同じ図種・同じ相手に書き直しても行は増えない', function() {
    var once = PV.write(DOC, REC);
    var twice = PV.write(once, { kind: 'アクティビティ図', dir: 'primary', count: 0, at: '2026-09-14T18:00' });
    expect(PV.parse(twice).length).toBe(1);
    expect(PV.find(twice, 'アクティビティ図').at).toBe('2026-09-14T18:00');
  });

  test('相手が違えば別の控えとして並ぶ', function() {
    var s = PV.write(PV.write(DOC, REC), { kind: 'アクティビティ図', dir: 'reviewer', count: 0, at: 'x' });
    expect(PV.parse(s).length).toBe(2);
  });

  test('控えを外せる (確かめ直した後)', function() {
    var s = PV.write(DOC, REC);
    expect(PV.parse(PV.remove(s, 'アクティビティ図', 'primary'))).toEqual([]);
  });

  test('控えの無い図からは何も読まない', function() {
    expect(PV.parse(DOC)).toEqual([]);
    expect(PV.find(DOC, 'アクティビティ図')).toBe(null);
    expect(PV.parse(null)).toEqual([]);
  });
});

describe('peekVerdict — 相手に図が増えたら控えは古い', function() {
  test('0 枚のままなら控えはそのまま使える', function() {
    expect(PV.isStale(REC, 0)).toBe(false);
    expect(PV.badge(REC, 0).mark).toBe('👀手本なし');
    expect(PV.badge(REC, 0).title).toContain('0 枚でした');
  });

  test('1 枚でも増えたら確かめ直すと言う', function() {
    expect(PV.isStale(REC, 1)).toBe(true);
    var b = PV.badge(REC, 1);
    expect(b.mark).toBe('👀要確認');
    expect(b.stale).toBe(true);
    expect(b.title).toContain('増えました');
  });

  test('控えが無ければ印も出さない', function() {
    expect(PV.badge(null, 0)).toBe(null);
  });

  test('相手に 1 枚でもあるうちは控えを勧めない (取り込む変更がある)', function() {
    expect(PV.offerText('アクティビティ図', 'primary', 1)).toBe('');
    expect(PV.offerText('アクティビティ図', 'primary', 0)).toContain('0 枚です');
  });
});
