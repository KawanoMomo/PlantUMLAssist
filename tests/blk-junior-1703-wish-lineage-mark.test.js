'use strict';
// BLK-junior-20260908-1703-wish — 継承元の差分を「自分の図のどの図形か」に翻訳する。
//
// 「⇡ 継承元」で更新の有無と差分行数は出るようになったが、増えた行が画面の
// どこかは自分で探すしかなかった。GpioDrv から 5 本伸びる矢印は見た目が同じで、
// 目的の 1 本 (IrqCtrl への依存) は 1 本ずつクリックしないと分からない。

var W = (typeof window !== 'undefined' && window) || global.window;
var LM = W.MA.lineageMark;
var D = new (require('jsdom').JSDOM)('<!DOCTYPE html><html><body></body></html>').window.document;

// junior の図。GpioDrv から 5 本出ていて、見た目は実線/点線の違いしかない。
var CHILD = [
  '@startuml',
  'component "GPIO Driver" as GpioDrv',
  'component IrqCtrl',
  'component Power_Ctrl',
  'GpioDrv --> Power_Ctrl',
  'GpioDrv ..> IrqCtrl',
  'GpioDrv --> Timer',
  'GpioDrv ..> Clock',
  'GpioDrv --> Uart',
  '@enduml',
].join('\n');

describe('行が名指している相手を鍵にする', function() {
  test('ラベルの有無で鍵は変わらない (先輩がラベルを足しただけの行が当たる)', function() {
    expect(LM.keyOf('GpioDrv ..> IrqCtrl : uses')).toBe(LM.keyOf('GpioDrv ..> IrqCtrl'));
  });

  test('矢印の種類が変わっても両端が同じなら同じ鍵', function() {
    expect(LM.keyOf('GpioDrv --> IrqCtrl')).toBe('GpioDrv|IrqCtrl');
    expect(LM.keyOf('GpioDrv ..> IrqCtrl')).toBe('GpioDrv|IrqCtrl');
  });

  test('矢印の色指定は鍵に混ざらない', function() {
    expect(LM.keyOf('GpioDrv -[#red]-> IrqCtrl')).toBe('GpioDrv|IrqCtrl');
  });

  test('宣言キーワードとステレオタイプは名前として数えない', function() {
    expect(LM.keyOf('component "GPIO Driver" as GpioDrv <<driver>>')).toBe('GPIO Driver|GpioDrv');
  });

  test('コメント・ディレクティブは鍵にならない', function() {
    expect(LM.keyOf("' 覚え書き")).toBe('');
    expect(LM.keyOf('@startuml')).toBe('');
    expect(LM.keyOf('skinparam monochrome true')).toBe('');
  });

  test('向きが逆の関係には逆順の鍵が付く', function() {
    expect(LM.altKeyOf('IrqCtrl <.. GpioDrv')).toBe('GpioDrv|IrqCtrl');
  });
});

describe('差分から色を付ける行を決める', function() {
  test('ラベルが足された 1 行だけが当たる (5 本のうち 1 本)', function() {
    var plan = LM.plan({ added: ['GpioDrv ..> IrqCtrl : uses'], removed: ['GpioDrv ..> IrqCtrl'] }, CHILD);
    expect(plan.lines).toEqual([6]);
    expect(plan.missing.length).toBe(0);
  });

  test('自分の図に無い相手は missing に落ちる (探し続けさせない)', function() {
    var plan = LM.plan({ added: ['GpioDrv --> Watchdog : reset'], removed: [] }, CHILD);
    expect(plan.lines).toEqual([]);
    expect(plan.missing.length).toBe(1);
    expect(plan.missing[0].kind).toBe('add');
  });

  test('向きが逆でも同じ関係として当たる', function() {
    var plan = LM.plan({ added: ['IrqCtrl <.. GpioDrv : uses'], removed: [] }, CHILD);
    expect(plan.lines).toEqual([6]);
  });

  test('宣言の変更は宣言の行に当たる', function() {
    var plan = LM.plan({ added: ['component "GPIO Driver" as GpioDrv <<driver>>'], removed: [] }, CHILD);
    expect(plan.lines).toEqual([2]);
  });

  test('減った行も色を付ける (自分の図では消す候補)', function() {
    var plan = LM.plan({ added: [], removed: ['GpioDrv --> Uart'] }, CHILD);
    expect(plan.lines).toEqual([9]);
    expect(plan.matched[0].kind).toBe('del');
  });

  test('差分が空なら何も当たらない', function() {
    var plan = LM.plan({ added: [], removed: [] }, CHILD);
    expect(plan.lines).toEqual([]);
    expect(LM.summaryLine(plan)).toContain('差分がありません');
  });
});

describe('overlay への色付け', function() {
  function overlay(lines) {
    var svg = D.createElement('svg');
    lines.forEach(function(n) {
      var r = D.createElement('rect');
      r.setAttribute('class', 'selectable');
      r.setAttribute('data-line', String(n));
      svg.appendChild(r);
    });
    return svg;
  }

  test('指定した行の rect にだけ印が付く', function() {
    var ov = overlay([5, 6, 7]);
    expect(LM.apply(ov, [6])).toBe(1);
    expect(ov.querySelectorAll('rect.lg-mark').length).toBe(1);
    expect(ov.querySelectorAll('rect[data-line="6"].lg-mark').length).toBe(1);
  });

  test('付け直すと前の印は消える', function() {
    var ov = overlay([5, 6, 7]);
    LM.apply(ov, [6]);
    LM.apply(ov, [5, 7]);
    expect(ov.querySelectorAll('rect[data-line="6"].lg-mark').length).toBe(0);
    expect(ov.querySelectorAll('rect.lg-mark').length).toBe(2);
  });

  test('clear で全部消える', function() {
    var ov = overlay([5, 6]);
    LM.apply(ov, [5, 6]);
    expect(LM.clear(ov)).toBe(2);
    expect(ov.querySelectorAll('rect.lg-mark').length).toBe(0);
  });

  test('対応する rect が無い行を渡しても落ちない', function() {
    var ov = overlay([5]);
    expect(LM.apply(ov, [99, null, 'x'])).toBe(0);
  });
});
