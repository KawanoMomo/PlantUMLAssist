'use strict';
// BLK-primary-20260907-1403-wish「顧客提出前チェック」。
//
// 願望: 全図の title / note / 部品名を横断して 1 枚に並べ、社内略語辞書に
// 当たった行だけを赤くする。これで手順 4 は「その画面を開いて赤い行だけ直す」で終わる。

var W = (typeof window !== 'undefined' && window) || global.window;
var SC = W.MA.submitCheck;

var SEQ = [
  '@startuml',
  'title UART_Drv 通信シーケンス',
  'actor 開発者',
  'participant "UART ドライバ" as UartDrv',
  'participant Logger',
  'note over UartDrv : 暫定の実装 20260907',
  '開発者 -> UartDrv : send()',
  '@enduml',
].join('\n');

var CLS = [
  '@startuml',
  'title 通信クラス構成',
  'class Transceiver {',
  '  + send() : void',
  '}',
  'note left of Transceiver',
  '  顧客提出用の説明',
  'end note',
  '@enduml',
].join('\n');

var DOCS = [
  { id: '1', name: 'seq.puml', diagramType: 'plantuml-sequence', dsl: SEQ },
  { id: '2', name: 'cls.puml', diagramType: 'plantuml-class', dsl: CLS },
];

describe('顧客の目に入る文字列を抜き出す', function() {
  test('title を拾う', function() {
    var rows = SC.collectDoc(DOCS[0]);
    var t = rows.filter(function(r) { return r.kind === 'title'; });
    expect(t.length).toBe(1);
    expect(t[0].text).toBe('UART_Drv 通信シーケンス');
    expect(t[0].line).toBe(2);
  });

  test('1 行の note を拾う', function() {
    var rows = SC.collectDoc(DOCS[0]);
    var n = rows.filter(function(r) { return r.kind === 'note'; });
    expect(n.length).toBe(1);
    expect(n[0].text).toBe('暫定の実装 20260907');
  });

  test('複数行の note は本文の行だけを拾う (note / end note は入れない)', function() {
    var n = SC.collectDoc(DOCS[1]).filter(function(r) { return r.kind === 'note'; });
    expect(n.length).toBe(1);
    expect(n[0].text).toBe('顧客提出用の説明');
  });

  test('宣言の名前を拾う (表示名つきは丸ごと)', function() {
    var names = SC.collectDoc(DOCS[0])
      .filter(function(r) { return r.kind === 'name'; })
      .map(function(r) { return r.text; });
    expect(names).toContain('開発者');
    expect(names).toContain('Logger');
    expect(names.join(' ')).toContain('UartDrv');
  });

  test('@startuml やコメント行は読む対象に入れない', function() {
    var texts = SC.collectDoc(DOCS[0]).map(function(r) { return r.text; });
    expect(texts.join(' ')).not.toContain('@startuml');
  });

  test('複数枚をまたいで、どの図の何行目かが分かる', function() {
    var rows = SC.collect(DOCS);
    var docs = {};
    rows.forEach(function(r) { docs[r.doc] = true; });
    expect(Object.keys(docs).sort()).toEqual(['cls.puml', 'seq.puml']);
    rows.forEach(function(r) { expect(r.line).toBeGreaterThan(0); });
  });
});

describe('社内略語の当たり判定', function() {
  test('語として現れた略語に当たる', function() {
    expect(SC.hasTerm('UART_Drv 通信シーケンス', 'Drv')).toBe(true);
    expect(SC.hasTerm('UartDrv', 'Drv')).toBe(true);
  });

  test('別の単語の一部には当たらない', function() {
    expect(SC.hasTerm('Driver 構成', 'Drv')).toBe(false);
    expect(SC.hasTerm('Initiative', 'Init')).toBe(false);
  });

  test('日本語の語は包含で見る', function() {
    expect(SC.hasTerm('暫定の実装', '暫定')).toBe(true);
    expect(SC.hasTerm('確定の実装', '暫定')).toBe(false);
  });

  test('日付入りの識別子は辞書に無くても当たる', function() {
    expect(SC.hits('暫定の実装 20260907', [])).toContain('日付');
    expect(SC.hits('rev 2026-09-07', [])).toContain('日付');
    expect(SC.hits('通信クラス構成', [])).toEqual([]);
  });

  test('当たった語は重複せず並ぶ', function() {
    expect(SC.hits('Drv と Drv', ['Drv'])).toEqual(['Drv']);
  });
});

describe('チェック結果', function() {
  test('赤くする行と、そうでない行を分ける', function() {
    var res = SC.check(DOCS, ['Drv', '暫定']);
    expect(res.flagged.length).toBeGreaterThan(0);
    res.flagged.forEach(function(r) { expect(r.hits.length).toBeGreaterThan(0); });
    expect(res.rows.length).toBeGreaterThan(res.flagged.length);
  });

  test('赤くない行も残す (見た行数を言えるようにする)', function() {
    var res = SC.check(DOCS, ['Drv']);
    var clean = res.rows.filter(function(r) { return !r.flagged; });
    expect(clean.length).toBeGreaterThan(0);
  });

  test('当たりが 1 件も無ければ clean', function() {
    var res = SC.check([{ id: '9', name: 'ok.puml', dsl: '@startuml\ntitle 通信構成\nclass Transceiver\n@enduml' }], ['Drv']);
    expect(res.clean).toBe(true);
    expect(res.flagged.length).toBe(0);
  });

  test('辞書を渡さなければ既定の略語で見る', function() {
    var res = SC.check(DOCS, []);
    expect(res.terms).toBe(SC.DEFAULT_TERMS);
    expect(res.flagged.length).toBeGreaterThan(0);
  });

  test('要約は枚数・見た行数・要確認件数を必ず書く', function() {
    var res = SC.check(DOCS, ['Drv']);
    var line = SC.summaryLine(res);
    expect(line).toContain('2 枚');
    expect(line).toContain('見た行 ' + res.rows.length + ' 件');
    expect(line).toContain('要確認 ' + res.flagged.length + ' 件');
  });
});

describe('辞書の読み取り', function() {
  test('1 行 1 語で読む', function() {
    expect(SC.parseDict('Drv\nCtrl')).toEqual(['Drv', 'Ctrl']);
  });

  test('空行と # の行は捨てる', function() {
    expect(SC.parseDict('# 社内向け\nDrv\n\n  \nCtrl')).toEqual(['Drv', 'Ctrl']);
  });

  test('同じ語は 1 つに畳む', function() {
    expect(SC.parseDict('Drv\nDrv')).toEqual(['Drv']);
  });
});
