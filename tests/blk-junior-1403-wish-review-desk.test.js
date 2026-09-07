'use strict';
// BLK-junior-20260907-1403-wish: 型の基準にした図と突き合わせて、
// 書いている間ずっとレビューしてもらう。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/outline.js')]; } catch (e) {}
require('../src/core/outline.js');
try { delete require.cache[require.resolve('../src/core/consistency-check.js')]; } catch (e) {}
require('../src/core/consistency-check.js');
try { delete require.cache[require.resolve('../src/core/review-desk.js')]; } catch (e) {}
require('../src/core/review-desk.js');
var RD = global.window.MA.reviewDesk;

// 先輩の SPI 状態遷移。型はこれ。
var REF = [
  '@startuml',
  'title SpiDrv',
  '[*] --> Spi_Idle',
  'Spi_Idle --> Spi_Busy : 送信を開始',
  'Spi_Busy --> Spi_Idle : 送信を完了',
  'Spi_Busy --> Spi_Error : 異常を検知',
  'Spi_Error --> Spi_Idle : 異常を通知',
  '@enduml',
].join('\n');

// 同じ型で部品名だけ替えた CAN の図。
var CAN = [
  '@startuml',
  'title CanDrv',
  '[*] --> Can_Idle',
  'Can_Idle --> Can_Busy : 送信を開始',
  'Can_Busy --> Can_Idle : 送信を完了',
  'Can_Busy --> Can_Error : 異常を検知',
  'Can_Error --> Can_Idle : 異常を通知',
  '@enduml',
].join('\n');

describe('review-desk — 基準の図を覚える', () => {
  test('図ごとに基準を覚え、読み直せる', () => {
    RD.clearBaseline('CanDrv');
    expect(RD.baselineOf('CanDrv')).toBe(null);
    RD.setBaseline('CanDrv', 'SpiDrv', REF, '2026-09-07T14:00:00');
    var b = RD.baselineOf('CanDrv');
    expect(b.ref).toBe('SpiDrv');
    expect(b.dsl).toBe(REF);
    RD.clearBaseline('CanDrv');
    expect(RD.baselineOf('CanDrv')).toBe(null);
  });

  test('図の名前が変わっても基準は持ち越す', () => {
    RD.setBaseline('CanDrv', 'SpiDrv', REF, '');
    RD.renameBaseline('CanDrv', 'CanDrv-v2');
    expect(RD.baselineOf('CanDrv')).toBe(null);
    expect(RD.baselineOf('CanDrv-v2').ref).toBe('SpiDrv');
    RD.clearBaseline('CanDrv-v2');
  });
});

describe('review-desk — 遷移の読み取り', () => {
  test('遷移の端点と行番号を拾い、骨組み行は数えない', () => {
    var tr = RD.transitions(CAN);
    expect(tr.length).toBe(5);
    expect(tr[0]).toEqual({ from: '[*]', to: 'Can_Idle', label: '', line: 2 });
    expect(tr[1].from).toBe('Can_Idle');
    expect(tr[1].to).toBe('Can_Busy');
    expect(tr[1].label).toBe('送信を開始');
  });

  test('逆向き表記は向きをそろえる', () => {
    var tr = RD.transitions('@startuml\nB <-- A : 戻る\n@enduml');
    expect(tr.length).toBe(1);
    expect(tr[0].from).toBe('A');
    expect(tr[0].to).toBe('B');
  });

  test('choice の宣言だけを choice として拾う (fork / join は別)', () => {
    var dsl = [
      '@startuml',
      'state C <<choice>>',
      'state F <<fork>>',
      '@enduml',
    ].join('\n');
    var c = RD.choiceStates(dsl);
    expect(Object.keys(c)).toEqual(['C']);
  });
});

describe('review-desk — 図種特有の間違い', () => {
  // junior が今日踏んだ間違い: 分岐を足したのに元の直接遷移が残って二重になる。
  var WITH_CHOICE = [
    '@startuml',
    'state Can_Judge <<choice>>',
    'Can_Idle --> Can_Busy : 送信を開始',
    'Can_Busy --> Can_Judge : 異常を検知',
    'Can_Judge --> Can_Error : 重大',
    'Can_Judge --> Can_Idle : 軽微',
    'Can_Busy --> Can_Error : 異常を検知',
    '@enduml',
  ].join('\n');

  test('choice を通る道があるのに直接の遷移も残っていれば指摘する', () => {
    var f = RD.redundantChoicePaths(WITH_CHOICE);
    expect(f.length).toBe(1);
    expect(f[0].kind).toBe('dup');
    expect(f[0].line).toBe(6);                      // 直接の遷移の行 (0 始まり)
    expect(f[0].message).toContain('Can_Judge');
    expect(f[0].message).toContain('二重');
  });

  test('直接の遷移を消せば指摘は消える', () => {
    var fixed = WITH_CHOICE.split('\n').filter(function(l) {
      return l !== 'Can_Busy --> Can_Error : 異常を検知';
    }).join('\n');
    expect(RD.redundantChoicePaths(fixed)).toEqual([]);
  });

  test('choice が無い図では指摘しない (素直な分岐は二重ではない)', () => {
    expect(RD.redundantChoicePaths(CAN)).toEqual([]);
  });

  test('同じ端点・同じ文言の遷移が 2 本あれば指摘する', () => {
    var dsl = CAN.replace('@enduml', 'Can_Idle --> Can_Busy : 送信を開始\n@enduml');
    var f = RD.duplicateTransitions(dsl);
    expect(f.length).toBe(1);
    expect(f[0].message).toContain('2 本');
    expect(RD.duplicateTransitions(CAN)).toEqual([]);
  });

  test('端点が同じでも文言が違えば別の遷移として扱う', () => {
    var dsl = CAN.replace('@enduml', 'Can_Idle --> Can_Busy : 受信を開始\n@enduml');
    expect(RD.duplicateTransitions(dsl)).toEqual([]);
  });
});

describe('review-desk — レビュー', () => {
  test('型どおりに写せていれば指摘なし', () => {
    var r = RD.review(CAN, REF);
    expect(r.ok).toBe(true);
    expect(r.summary).toBe('指摘なし');
  });

  test('型からのずれ (consistency-check) と図種特有の間違いを 1 つの一覧にまとめる', () => {
    var broken = [
      '@startuml',
      'title CanDrv',
      '[*] --> Can_Idle',
      'Can_Idle --> Can_Busy : 送信を開始',
      'Can_Busy --> Can_Idle : 送信を完了',
      'state Can_Judge <<choice>>',
      'Can_Busy --> Can_Judge : 異常を検知',
      'Can_Judge --> Can_Error : 重大',
      'Can_Busy --> Can_Error : 異常を検知',
      'Can_Error --> Can_Idle : 異常を通知',
      '@enduml',
    ].join('\n');
    var r = RD.review(broken, REF);
    expect(r.ok).toBe(false);
    var kinds = r.findings.map(function(f) { return f.kind; });
    expect(kinds.indexOf('dup')).toBeGreaterThan(-1);
    // 行番号の順に並ぶ (上から直せる)
    var lines = r.findings.filter(function(f) { return f.line != null; }).map(function(f) { return f.line; });
    var sorted = lines.slice().sort(function(a, b) { return a - b; });
    expect(lines).toEqual(sorted);
  });

  test('基準の図が無くても、図種特有の間違いだけは見る', () => {
    var dsl = [
      '@startuml',
      'state C <<choice>>',
      'A --> C : 判定',
      'C --> B : 重大',
      'A --> B : 異常',
      '@enduml',
    ].join('\n');
    var r = RD.review(dsl, '');
    expect(r.findings.length).toBe(1);
    expect(r.findings[0].kind).toBe('dup');
  });

  test('summary / badgeText: 件数と種類を言い切る', () => {
    expect(RD.summary([])).toBe('指摘なし');
    expect(RD.summary([{ kind: 'dup' }, { kind: 'dup' }, { kind: 'order' }])).toBe('3 件 (二重 2 / 並び 1)');
    expect(RD.badgeText([])).toBe('👁 レビュー −');
    expect(RD.badgeText([{ kind: 'dup' }])).toBe('👁 レビュー 1');
    expect(RD.kindLabel('typo')).toBe('打ち間違い');
  });
});
