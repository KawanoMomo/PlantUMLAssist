'use strict';
// TICKET-owner-20261122-0720-1: 右パネルで 1 つの値 (きっかけ・メッセージの文言 …) だけを直すと、
// 同じ行の矢印の前後の空白 (手で揃えた桁 `Busy  --> Slow`) が 1 つに詰まっていた。
// 行を組み直す共通の口 (src/core/dsl-utils.js の keepSpacing / keepLineSpacing) で、直した値の字だけを置き換え、
// 名指ししていない部分の空白は元の行の字のまま残す。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var W = dom.window;
var loadErrors = [];
var list = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf-8')
  .match(/'src\/[^']+\.js'/g).map(function(s) { return s.slice(1, -1); });
list.forEach(function(rel) {
  var p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', fs.readFileSync(p, 'utf-8'));
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var MA = W.MA;
var DU = MA.dslUtils;

function doc(lines) { return ['@startuml'].concat(lines).concat(['@enduml']).join('\n'); }
function only(before, after) {
  // 動いた行の番号 (1-based) の一覧
  var a = before.split('\n'), b = after.split('\n'), out = [];
  for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.push(i + 1);
  return out;
}

describe('TICKET-owner-20261122-0720-1 直した値の字だけを置き換える', function() {
  test('読み込み', function() {
    expect(loadErrors.length === 0 ? '' : loadErrors.join(' | ')).toBe('');
  });

  test('keepSpacing: 揃えた桁・詰めた書き方を残し、直した値の字だけ変わる', function() {
    expect(DU.keepSpacing('Busy  --> Slow : Throttle', 'Busy --> Slow : Throttle2')).toBe('Busy  --> Slow : Throttle2');
    expect(DU.keepSpacing('Bus  -->  Drv : ready', 'Bus --> Drv : ready(ok)')).toBe('Bus  -->  Drv : ready(ok)');
    expect(DU.keepSpacing('A->B:hi', 'A -> B : hello')).toBe('A->B:hello');
    expect(DU.keepSpacing('A -> B : x', 'A -> B : x')).toBe('A -> B : x');
  });

  test('keepSpacing: 直した値に打った空白は利用者のもの (元の行の幅に戻さない)', function() {
    expect(DU.keepSpacing('A -> B : foo  bar', 'A -> B : foo bar', ['foo bar'])).toBe('A -> B : foo bar');
    expect(DU.keepSpacing('A -> B : foobar', 'A -> B : foo bar', ['foo bar'])).toBe('A -> B : foo bar');
    // 詰めた値 (空白を消した) は開かない
    expect(DU.keepSpacing('A -> B : foo bar', 'A -> B : foobar', ['foobar'])).toBe('A -> B : foobar');
  });

  test('keepLineSpacing: 字下げは新しい行、行末の空白は元の行', function() {
    expect(DU.keepLineSpacing('    Bus  --> Drv : ready  ', '    Bus --> Drv : go')).toBe('    Bus  --> Drv : go  ');
  });

  test('状態遷移: きっかけだけを直すと `Busy  --> Slow : Throttle2` (バイト一致)、他の行は動かない', function() {
    var S = MA.modules.plantumlState;
    var t = doc(['[*] --> Idle', 'Idle -> Busy : Start', 'Busy  --> Slow : Throttle', 'Slow --> Idle']);
    var out = S.updateTransition(t, 4, { trigger: 'Throttle2' });
    expect(out.split('\n')[3]).toBe('Busy  --> Slow : Throttle2');
    expect(only(t, out)).toEqual([4]);
    // 字下げ付き・ガードと動作も同じ
    var t2 = doc(['state Run {', '  A  -->  B : ev [ok] / act()', '}']);
    var o2 = S.updateTransition(t2, 3, { guard: 'ready' });
    expect(o2.split('\n')[2]).toBe('  A  -->  B : ev [ready] / act()');
  });

  test('シーケンス: 文言だけを直すと `Bus  -->  Drv : ready(ok)` (バイト一致)', function() {
    var Q = MA.modules.plantumlSequence;
    var t = doc(['participant Bus', 'participant Drv', 'Bus  -->  Drv : ready', 'Drv -> Bus : ack']);
    var out = Q.updateMessage(t, 4, 'label', 'ready(ok)');
    expect(out.split('\n')[3]).toBe('Bus  -->  Drv : ready(ok)');
    expect(only(t, out)).toEqual([4]);
    // 矢印を替えたときも、替えた部分以外の空白は保つ
    var o2 = Q.updateMessage(t, 4, 'arrow', '->');
    expect(o2.split('\n')[3]).toBe('Bus  ->  Drv : ready');
  });

  test('クラス: 関係のラベル・属性の型だけを直しても桁は保つ', function() {
    var C = MA.modules.plantumlClass;
    var t = doc(['class A {', '  - baud   : uint16', '}', 'class B', 'A  -->  B : uses']);
    var o1 = C.updateRelation(t, 6, 'label', 'owns');
    expect(o1.split('\n')[5]).toBe('A  -->  B : owns');
    var o2 = C.updateAttribute(t, 3, 'type', 'uint32');
    expect(o2.split('\n')[2]).toBe('  - baud   : uint32');
  });

  test('ユースケース・コンポーネント: 関係のラベルだけを直しても桁は保つ', function() {
    var U = MA.modules.plantumlUsecase;
    var t = doc(['actor App', 'usecase UC1', 'App  -->  UC1 : uses']);
    expect(U.updateRelation(t, 4, 'label', 'runs').split('\n')[3]).toBe('App  -->  UC1 : runs');
    var K = MA.modules.plantumlComponent;
    var t2 = doc(['component A', 'component B', 'A  -->  B : calls']);
    expect(K.updateRelation(t2, 4, 'label', 'uses').split('\n')[3]).toBe('A  -->  B : uses');
  });
});
