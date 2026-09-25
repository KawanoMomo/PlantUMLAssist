'use strict';
// BLK-migrator-20260925-1600: 「この図種として読めない行」の帯が正しい PlantUML に出ていた (217 枚中 117 枚)。
// 帯は行ごとの正規表現ではなく「エンジンが読めたか」で決める。理由の無い帯は出さない。
// 行ごとの推定は、行の分からないエラー (落ちた絵) の補助にとどめ、複数行の構文はブロックとして読み飛ばす。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['file-open', 'render-error'].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});
var FO = global.window.MA.fileOpen;
var RE = global.window.MA.renderError;
var SEQ = 'plantuml-sequence';

function lines(a) { return a.join('\n'); }

describe('帯はエンジンの答えで決める', function() {
  var t = lines(['@startuml', 'participant A', 'A -> B : x', '$wobble B ~~ zz', '@enduml']);

  test('エンジンが読めた図・答えの無い本文には、行ごとの推定で当たらない行があっても帯を出さない', function() {
    expect(FO.unsupported(t, SEQ).map(function(r) { return r.line; })).toEqual([4]);
    expect(FO.bannerRows(t, SEQ, { state: 'ok' })).toEqual([]);
    expect(FO.bannerRows(t, SEQ, null)).toEqual([]);
    expect(FO.bannerRows(t, SEQ, { state: 'none' })).toEqual([]);
  });

  test('エンジンのエラー行があれば、その行だけを「エンジンのエラー 行 N: メッセージ」の理由つきで出す', function() {
    var rows = FO.bannerRows(t, SEQ, { state: 'error', line: 4, message: 'Syntax Error? (Assumed diagram type: sequence)' });
    expect(rows).toEqual([{ line: 4, text: '$wobble B ~~ zz', cause: 'engine',
      reason: 'エンジンのエラー 行 4: Syntax Error? (Assumed diagram type: sequence)' }]);
  });

  test('落ちた絵に原因の行があればその行、無ければ行ごとの推定を「補助」として理由つきで添える', function() {
    var withCause = FO.bannerRows(t, SEQ, { state: 'error', crashed: true, causeLine: 3, message: 'PlantUML 1.2026.3 が描画の途中で落ちました' });
    expect(withCause.map(function(r) { return r.line; })).toEqual([3]);
    expect(withCause[0].reason).toContain('エンジンが落ちました');
    var guess = FO.bannerRows(t, SEQ, { state: 'error', crashed: true, message: '落ちました (x)' });
    expect(guess.map(function(r) { return r.line; })).toEqual([4]);
    expect(guess[0].reason).toContain('行ごとの推定');
    guess.concat(withCause).forEach(function(r) { expect(r.reason).toBeTruthy(); });
  });

  test('@enduml の無い本文は、エンジンの「No valid @start/@end found」と @startuml の行を出す。揃っていれば出さない', function() {
    var open = lines(["' c", '@startuml', 'A -> B']);
    var v = { state: 'error', noStartEnd: true, message: 'No valid @start/@end found, please check the version' };
    var rows = FO.bannerRows(open, SEQ, v);
    expect(rows.map(function(r) { return r.line; })).toEqual([2]);
    expect(rows[0].reason).toContain('2 行目の @startuml を閉じる @enduml がありません');
    expect(FO.bannerRows(t, SEQ, v)).toEqual([]);
  });

  test('エンジンが「No valid @start/@end found」の絵を返したことを見分ける (図の SVG は null)', function() {
    var svg = '<svg><?plantuml 1.2026.3?><g><text fill="#33FF02" font-size="14">No valid @start/@end found, please check the version</text></g></svg>';
    expect(RE.noStartEnd(svg)).toEqual({ isError: true, noStartEnd: true, message: 'No valid @start/@end found, please check the version', line: null });
    expect(RE.noStartEnd('<svg><g><text>No valid @start/@end found</text></g></svg>')).toBe(null);
    expect(RE.noStartEnd('<svg><g><text fill="#000">A</text></g></svg>')).toBe(null);
    expect(RE.detect(svg).isError).toBe(false);  // プレビューの扱いは変えない
  });
});

describe('閉じていない alt / loop などの枠 (エンジンは誤りにせず、書いた人の意図と違う図になる)', function() {
  test('入れ子で閉じた枠と else・end note・end box・end ref は数えない', function() {
    var ok = lines(['@startuml', 'box B', 'participant A', 'end box', 'alt x', 'loop y', 'A -> A', 'end', 'else z',
      'note over A', 'end は本文', 'end note', 'ref over A', 'r', 'end ref', 'group g', 'end', 'end', '@enduml']);
    expect(FO.unclosedBlocks(ok, SEQ)).toEqual([]);
  });
  test('end の来ない枠を開いた行で返し、帯は理由つき', function() {
    var bad = lines(['@startuml', 'alt ok', 'A -> B', 'else ng', 'loop 3', 'A -> B', 'end', 'A -> B : close', '@enduml']);
    expect(FO.unclosedBlocks(bad, SEQ).map(function(b) { return b.line; })).toEqual([2]);
    var rows = FO.bannerRows(bad, SEQ, { state: 'ok' });
    expect(rows[0].reason).toContain('2 行目の alt を閉じる end がありません');
  });
  test('前処理 (!procedure / !include) のある図と、シーケンス図以外は数えない', function() {
    expect(FO.unclosedBlocks(lines(['@startuml', '!include x.iuml', 'group g', '@enduml']), SEQ)).toEqual([]);
    expect(FO.unclosedBlocks(lines(['@startuml', 'group g', '@enduml']), 'plantuml-activity')).toEqual([]);
  });
});

describe('行ごとの推定: 複数行の構文はブロックとして読み飛ばす', function() {
  test('|||・||45||・半矢印は正しい記法', function() {
    var s = lines(['@startuml', 'A -> B', '|||', '||45||', 'A -\\ B : half', 'A -/ B', 'A \\\\- B', 'A //-- B', '@enduml']);
    expect(FO.unsupported(s, SEQ)).toEqual([]);
  });
  test('skinparam { } / sprite { } / sprite <svg> … </svg> / <style> / !procedure の本文は判定しない', function() {
    var s = lines(['@startuml',
      'skinparam sequence {', '  ArrowColor Red', '  LifeLineBorderColor<<x>> Blue', '}',
      'sprite $foo [16x16/16] {', '  FFFFFF00', '}',
      'sprite $bar <svg viewBox="0 0 10 10">', '<path d="M0 0"/>', '<g fill="#fff">', '</g>', '</svg>',
      '<style>', 'sequenceDiagram {', '  LineColor red', '}', '</style>',
      '!procedure $P($a)', '  weird $a stuff', '!endprocedure',
      "/' 複数行", 'mystery', "'/",
      'A -> B', '@enduml']);
    expect(FO.unsupported(s, SEQ)).toEqual([]);
  });
  test('ブロックの外の本当に読めない行は、推定としては並ぶ (帯に出すかはエンジン次第)', function() {
    var s = lines(['@startuml', 'skinparam sequence {', '  X Y', '}', 'mystery_syntax 1', '@enduml']);
    expect(FO.unsupported(s, SEQ).map(function(r) { return r.line; })).toEqual([5]);
  });
});

describe('報告用に複製: 帯に出した行を並べる', function() {
  test('rows を渡すとその行で骨格を作る', function() {
    var t = lines(['@startuml', 'A -> B', 'mystery 秘密', '@enduml']);
    var out = FO.report(t, SEQ, [{ line: 2, text: 'A -> B', reason: 'x' }]);
    expect(out).toContain('未対応 1 行');
    expect(out).toContain('L2:');
    expect(out).not.toContain('L3:');
  });
});
