'use strict';
// BLK-reviewer-20260907-1703 (wish) メソッド突合の戻りメッセージ誤検出。
//
// `npm run audit` のメソッド突合 (consistency.methods) は Ack / Ready のような
// 「呼び出しへの応答」を毎回「クラスに無いメソッド」として拾い、17 枚中 12 件が
// 全てこの種類の過検出だった。どれが本物かはレビュー担当が矢印の向きと対応する
// 呼び出しを目で辿って毎回ふるい分けていた。
//
// ここでは「呼び出し (実線) とその応答 (破線) の対」を検出して、応答側のラベルを
// 突合の対象から外すことを固定する。外した分は methodReplies に残す
// (0 件が「見ていない」ではなく「応答だった」と読めるように)。
var prevWindow = global.window;
global.window = {};
// consistency は図 1 枚の DSL を取り出すのに dsl-utils.docDsl を使う
// (BLK-reviewer-20260907-0803-2)。先に読んでおかないと呼び出し時に落ちる。
try { delete require.cache[require.resolve('../src/core/dsl-utils.js')]; } catch (e) {}
require('../src/core/dsl-utils.js');
try { delete require.cache[require.resolve('../src/core/consistency.js')]; } catch (e) {}
require('../src/core/consistency.js');
var ck = global.window.MA.consistency;

var CLS = [
  '@startuml',
  'class App {', '+ Handle()', '}',
  'class Adc_Drv {', '+ Adc_Init()', '+ Adc_Start()', '}',
  '@enduml',
].join('\n');

function seq(lines) {
  return { name: 'Seq', dsl: ['@startuml', 'participant App', 'participant Adc_Drv']
    .concat(lines).concat(['@enduml']).join('\n') };
}
var cls = { name: 'Cls', dsl: CLS };

describe('consistency — 呼び出しへの応答をメソッド突合から外す (BLK-reviewer-20260907-1703)', function() {

  test('呼び出しの後の破線の戻り (Ack) は突合に掛けず、methodReplies に残す', function() {
    var r = ck.check([seq(['App -> Adc_Drv : Adc_Init()', 'Adc_Drv --> App : Ack']), cls]);
    expect(r.methods.length).toBe(0);
    expect(r.methodReplies.length).toBe(1);
    expect(r.methodReplies[0].method).toBe('Ack');
    // 外した分は警告の数に入れない (この図は「指摘なし」で通る)
    expect(r.count).toBe(0);
  });

  test('本物の欠落は今までどおり残る (応答と一緒に消さない)', function() {
    var r = ck.check([seq([
      'App -> Adc_Drv : Adc_Init()',
      'Adc_Drv --> App : Ready',
      'App -> Adc_Drv : Adc_Reset()',
    ]), cls]);
    expect(r.methods.length).toBe(1);
    expect(r.methods[0].method).toBe('Adc_Reset');
    expect(r.methodReplies.length).toBe(1);
  });

  test('対になる呼び出しが無い破線は応答とみなさない (破線で呼ぶ書き方を潰さない)', function() {
    var r = ck.check([seq(['Adc_Drv --> App : Notify']), cls]);
    expect(r.methods.length).toBe(1);
    expect(r.methods[0].method).toBe('Notify');
    expect(r.methodReplies.length).toBe(0);
  });

  test('呼び出しより前に出てくる破線は応答ではない (順序を見る)', function() {
    var r = ck.check([seq(['Adc_Drv --> App : Ack', 'App -> Adc_Drv : Adc_Init()']), cls]);
    expect(r.methods.length).toBe(1);
    expect(r.methods[0].method).toBe('Ack');
  });

  test('別の相手への破線は応答にしない', function() {
    var r = ck.check([{ name: 'Seq', dsl: [
      '@startuml', 'participant App', 'participant Adc_Drv', 'participant Log',
      'App -> Adc_Drv : Adc_Init()',
      'Log --> App : Ack',
      '@enduml'].join('\n') }, cls]);
    expect(r.methods.length).toBe(1);
    expect(r.methods[0].method).toBe('Ack');
  });

  test('左向きの応答 (`App <-- Adc_Drv : Ack`) も同じ対として外す', function() {
    var r = ck.check([seq(['App -> Adc_Drv : Adc_Init()', 'App <-- Adc_Drv : Ack']), cls]);
    expect(r.methods.length).toBe(0);
    expect(r.methodReplies.length).toBe(1);
  });

  test('点線の応答 (`..>`) も戻りとして扱う', function() {
    var r = ck.check([seq(['App -> Adc_Drv : Adc_Init()', 'Adc_Drv ..> App : Ack']), cls]);
    expect(r.methods.length).toBe(0);
    expect(r.methodReplies.length).toBe(1);
  });

  test('scanDoc は矢印と向きを揃えた src / dst を持つ', function() {
    var s = ck.scanDoc(seq(['App -> Adc_Drv : Adc_Init()', 'App <-- Adc_Drv : Ack']));
    expect(s.messages[0].dashed).toBe(false);
    expect(s.messages[0].src).toBe('App');
    expect(s.messages[1].dashed).toBe(true);
    // 左向きなので送り手は右側 (Adc_Drv)
    expect(s.messages[1].src).toBe('Adc_Drv');
    expect(s.messages[1].dst).toBe('App');
  });

  test('17 枚のうち 12 件が応答だった日でも、読むのは本物の 1 件だけになる', function() {
    var lines = [];
    for (var i = 0; i < 12; i++) {
      lines.push('App -> Adc_Drv : Adc_Init()');
      lines.push('Adc_Drv --> App : Ack' + i);
    }
    lines.push('App -> Adc_Drv : Adc_Reset()');
    var r = ck.check([seq(lines), cls]);
    expect(r.methods.length).toBe(1);
    expect(r.methodReplies.length).toBe(12);
  });
});

global.window = prevWindow;
