'use strict';
// BLK-junior-20260915-2240-wish: 先輩がまだ書いていない図種を起こすとき、手順1
// 「手本を見て直す」が成立せず、要素構成と依存の粒度を決め打ちするしかなかった。
// 先輩の他図種に実際に書かれている名前だけから仮の手本を組む — 根拠の無い要素は
// 1 つも足さない、どの図から拾ったかを必ず添える、の 2 つを守る。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/method-audit.js',
  '../src/core/part-slice.js',
  '../src/core/part-reference.js',
  '../src/core/part-vocab.js',
  '../src/core/senior-draft.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var SD = global.window.MA.seniorDraft;

// 先輩 (primary) の保存フォルダ。SPI はシーケンス図とクラス図しか無い
// (コンポーネント図・状態遷移図は書かれていない) — 起票時の状況と同じ形。
var SENIOR = [
  {
    name: 'spi_init_sequence.puml',
    text: [
      '@startuml', 'title SPI初期化シーケンス',
      'participant App', 'participant Spi_Driver', 'participant IrqCtrl',
      'App -> Spi_Driver : Spi_Init()',
      'Spi_Driver -> IrqCtrl : Irq_Enable()',
      'Spi_Driver --> App : TransferComplete',
      '@enduml',
    ].join('\n'),
  },
  {
    name: 'spi_class.puml',
    text: [
      '@startuml', 'title SPIクラス',
      'class Spi_Driver {', '  +Spi_Init()', '  +Spi_Transmit()', '}',
      '@enduml',
    ].join('\n'),
  },
];

describe('coverage — 先輩がどの図種を持っていないか', function() {
  test('持っている図種と持っていない図種を分ける', function() {
    var c = SD.coverage('spi', SENIOR);
    expect(c.present.indexOf('sequence') >= 0).toBe(true);
    expect(c.present.indexOf('class') >= 0).toBe(true);
    expect(c.missing.indexOf('component') >= 0).toBe(true);
    expect(c.missing.indexOf('state') >= 0).toBe(true);
  });

  test('どの図が根拠かを図種ごとに残す', function() {
    var c = SD.coverage('spi', SENIOR);
    expect(c.byKind.sequence).toEqual(['spi_init_sequence.puml']);
  });
});

describe('materials — 材料は先輩の綴りのまま', function() {
  test('メソッド・きっかけ・型を役割ごとに拾う', function() {
    var m = SD.materials('spi', SENIOR);
    expect(m.methods.indexOf('Spi_Init') >= 0).toBe(true);
    expect(m.methods.indexOf('Spi_Transmit') >= 0).toBe(true);
    expect(m.types.indexOf('Spi_Driver') >= 0).toBe(true);
    expect(m.sources.length).toBe(2);
  });
});

describe('draft — 先輩に無い図種の下書き', function() {
  test('コンポーネント図は 本体 + 先輩の図に出てくる相手だけで組む', function() {
    var r = SD.draft('spi', SENIOR, 'component');
    expect(r.ok).toBe(true);
    expect(r.dsl).toContain('component [Spi_Driver]');
    expect(r.dsl).toContain('[Spi_Driver] --> [IrqCtrl]');
    // 根拠の無い定石 (ドライバなら普通ある 6 件) は混ぜない。
    expect(r.dsl.indexOf('Det') < 0).toBe(true);
    expect(r.dsl.indexOf('Mcu') < 0).toBe(true);
  });

  test('クラス図は先輩が書いているメソッドだけを持つ', function() {
    var r = SD.draft('spi', SENIOR, 'class');
    expect(r.ok).toBe(true);
    expect(r.dsl).toContain('class Spi_Driver {');
    expect(r.dsl).toContain('+Spi_Init()');
    expect(r.dsl).toContain('+Spi_Transmit()');
  });

  test('アクティビティ図は start / stop の間にメソッドを並べる', function() {
    var r = SD.draft('spi', SENIOR, 'activity');
    expect(r.ok).toBe(true);
    expect(r.dsl).toContain('start');
    expect(r.dsl).toContain(':Spi_Init();');
    expect(r.dsl).toContain('stop');
  });

  test('ユースケース図はメソッド 1 つを 1 ユースケースにする', function() {
    var r = SD.draft('spi', SENIOR, 'usecase');
    expect(r.ok).toBe(true);
    expect(r.dsl).toContain('usecase "Spi_Init" as UC1');
  });

  test('材料が無い図種は下書きを出さず、何が足りないかを言う', function() {
    // 先輩の図に状態名が 1 つも無いので、状態遷移図は組めない。
    var r = SD.draft('spi', SENIOR, 'state');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('状態名');
    expect(r.dsl).toBe('');
  });

  test('先輩が状態遷移図を持っていれば状態名から組める', function() {
    var withState = SENIOR.concat([{
      name: 'spi_state.puml',
      text: ['@startuml', 'state Uninit', 'state Idle', 'state Busy',
        '[*] --> Uninit', 'Uninit --> Idle : Spi_Init', '@enduml'].join('\n'),
    }]);
    var r = SD.draft('spi', withState, 'state');
    expect(r.ok).toBe(true);
    expect(r.dsl).toContain('state Uninit');
    expect(r.dsl).toContain('[*] --> Uninit');
  });

  test('図種が分からなければ下書きを出さない', function() {
    expect(SD.draft('spi', SENIOR, 'nope').ok).toBe(false);
  });

  test('下書きには「どの名前をどの図から拾ったか」が付く', function() {
    var r = SD.draft('spi', SENIOR, 'component');
    expect(r.sources).toEqual(['spi_init_sequence.puml', 'spi_class.puml']);
    var roles = r.basis.map(function(b) { return b.role; });
    expect(roles.indexOf('types') >= 0).toBe(true);
    expect(roles.indexOf('methods') >= 0).toBe(true);
  });

  test('題は「仮の手本」と名乗る (先輩本人の図と取り違えない)', function() {
    expect(SD.draft('spi', SENIOR, 'component').dsl).toContain('仮の手本');
  });

  test('画面に出す 1 行は出所を並べ、先輩本人の図ではないと言う', function() {
    var note = SD.noticeText(SD.draft('spi', SENIOR, 'component'));
    expect(note).toContain('spi_init_sequence.puml');
    expect(note).toContain('先輩本人の');
  });

  test('作れなかったときの 1 行は理由を言う', function() {
    expect(SD.noticeText(SD.draft('spi', SENIOR, 'state'))).toContain('作れません');
  });

  test('タブ名は下書きと分かる形にする', function() {
    expect(SD.docName('spi', 'component')).toBe('spi_component_draft');
  });
});

describe('compare — 先輩が後から本物を書いたときの差分', function() {
  var draftDsl = SD.draft('spi', SENIOR, 'component').dsl;
  var real = [
    '@startuml', 'component [Spi_Driver]', 'component [IrqCtrl]', 'component [Dma]',
    '[Spi_Driver] --> [IrqCtrl]', '[Spi_Driver] --> [Dma]', '@enduml',
  ].join('\n');

  test('決め打ちが当たっていた要素は一致に入る', function() {
    var r = SD.compare(draftDsl, real);
    expect(r.same.indexOf('Spi_Driver') >= 0).toBe(true);
    expect(r.same.indexOf('IrqCtrl') >= 0).toBe(true);
  });

  test('先輩だけが持つ要素が名指しで出る (気づけなかった所)', function() {
    expect(SD.compare(draftDsl, real).onlyInReal).toEqual(['Dma']);
  });

  test('下書きにしか無い要素も出る (消し忘れ)', function() {
    var thin = '@startuml\ncomponent [Spi_Driver]\n@enduml';
    expect(SD.compare(draftDsl, thin).onlyInDraft.indexOf('IrqCtrl') >= 0).toBe(true);
  });

  test('1 行の要約は件数と名前を並べる', function() {
    var text = SD.compareText(SD.compare(draftDsl, real));
    expect(text).toContain('一致');
    expect(text).toContain('先輩だけ: Dma');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
