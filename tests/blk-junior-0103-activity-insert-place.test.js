'use strict';
// BLK-junior-20260908-0103: Activity の「＋この位置に挿入」の位置候補が、行番号と
// DSL の生コードでしか出ていなかった。どちらが異常側の行かを PlantUML の構文から
// 読み解く必要がある。候補を「どの分岐のどちら側か」で言い直し、図で選んだ要素の
// 位置を既定にする。

const AI = () => window.MA.activityInsert;

const DSL = [
  '@startuml',
  'start',
  ':初期化;',
  'if (初期化失敗時?) then (正常)',
  ':処理を続ける;',
  'else (異常)',
  ':何もしない;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

function labelAt(dsl, line) {
  return AI().pointLabel(dsl, line, 'after');
}

describe('activity-insert — 位置を分岐のどちら側かで言う', () => {

  test('if の行は then 側のはじめとして読める', () => {
    expect(labelAt(DSL, 4)).toBe('分岐「初期化失敗時?」の 正常 側のはじめ (L4)');
  });

  test('else の行は else 側のはじめとして読める (異常側がどれか分かる)', () => {
    expect(labelAt(DSL, 6)).toBe('分岐「初期化失敗時?」の 異常 側のはじめ (L6)');
  });

  test('分岐の中のアクションは、どちら側の中かを先に言う', () => {
    expect(labelAt(DSL, 7)).toBe('分岐「初期化失敗時?」の 異常 側 ・ アクション「何もしない」の後 (L7)');
    expect(labelAt(DSL, 5)).toBe('分岐「初期化失敗時?」の 正常 側 ・ アクション「処理を続ける」の後 (L5)');
  });

  test('endif は分岐を閉じた後として読める', () => {
    expect(labelAt(DSL, 8)).toBe('分岐「初期化失敗時?」を閉じた後 (L8)');
  });

  test('分岐の外のアクションに側の説明は付かない', () => {
    expect(labelAt(DSL, 3)).toBe('アクション「初期化」の後 (L3)');
  });

  test('入れ子の分岐でも内側の側が出る', () => {
    var dsl = [
      '@startuml', 'start',
      'if (A?) then (外1)',
      'if (B?) then (内1)',
      ':x;',
      'else (内2)',
      ':y;',
      'endif',
      'else (外2)',
      ':z;',
      'endif',
      'stop', '@enduml',
    ].join('\n');
    expect(labelAt(dsl, 6)).toBe('分岐「B?」の 内2 側のはじめ (L6)');
    expect(labelAt(dsl, 7)).toBe('分岐「B?」の 内2 側 ・ アクション「y」の後 (L7)');
    expect(labelAt(dsl, 9)).toBe('分岐「A?」の 外2 側のはじめ (L9)');
    expect(labelAt(dsl, 10)).toBe('分岐「A?」の 外2 側 ・ アクション「z」の後 (L10)');
  });

  test('繰り返し・並行処理・レーンも構造の言葉で出る', () => {
    var dsl = [
      '@startuml', '|受信|', 'start',
      'while (残りあり?) is (yes)',
      ':1件読む;',
      'endwhile',
      'fork',
      ':A;',
      'fork again',
      ':B;',
      'end fork',
      'stop', '@enduml',
    ].join('\n');
    expect(labelAt(dsl, 2)).toBe('レーン「受信」のはじめ (L2)');
    expect(labelAt(dsl, 4)).toBe('繰り返し「残りあり?」の中のはじめ (L4)');
    expect(labelAt(dsl, 5)).toBe('繰り返し「残りあり?」の中 ・ アクション「1件読む」の後 (L5)');
    expect(labelAt(dsl, 6)).toBe('繰り返しを閉じた後 (L6)');
    expect(labelAt(dsl, 7)).toBe('並行処理 1 本目のはじめ (L7)');
    expect(labelAt(dsl, 9)).toBe('並行処理 2 本目のはじめ (L9)');
    expect(labelAt(dsl, 11)).toBe('並行処理を閉じた後 (L11)');
  });

  test('insertPoints の label は生コードではなく構造になり、入れ子の深さを持つ', () => {
    var pts = AI().insertPoints(DSL);
    var byLine = {};
    pts.forEach(function(p) { if (p.position === 'after') byLine[p.line] = p; });
    expect(byLine[6].label).toBe('分岐「初期化失敗時?」の 異常 側のはじめ (L6)');
    expect(byLine[6].depth).toBe(0);
    expect(byLine[7].depth).toBe(1);
    // DSL を読む人のために生の候補も残す
    expect(byLine[6].raw).toBe('6: else (異常) の後');
  });
});

describe('activity-insert — 図で選んだ要素の位置を既定にする', () => {

  test('選んだ行に当たる候補が既定になる', () => {
    var pts = AI().insertPoints(DSL);
    var i = AI().defaultPointIndex(DSL, 6);
    expect(pts[i].line).toBe(6);
    expect(pts[i].label).toBe('分岐「初期化失敗時?」の 異常 側のはじめ (L6)');
  });

  test('何も選んでいなければ本体の最後が既定 (今までと同じ)', () => {
    var pts = AI().insertPoints(DSL);
    var i = AI().defaultPointIndex(DSL, 0);
    var last = 0;
    for (var d = 0; d < pts.length; d++) if (pts[d].inFlow) last = d;
    expect(i).toBe(last);
  });

  test('候補に無い行 (@enduml など) を選んでも既定に落ちる', () => {
    expect(AI().defaultPointIndex(DSL, 10)).toBe(AI().defaultPointIndex(DSL, 0));
    expect(AI().pointIndexForLine(DSL, 10)).toBe(-1);
  });

  test('合わせた位置を画面で言う 1 行', () => {
    expect(AI().pickedNote(DSL, 6)).toBe('図で選んだ 分岐「初期化失敗時?」の 異常 側のはじめ に合わせました');
    expect(AI().pickedNote(DSL, 10)).toBe('');
  });
});
