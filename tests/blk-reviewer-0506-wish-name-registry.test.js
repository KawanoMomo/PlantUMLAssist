'use strict';
// BLK-reviewer-20260915-0506-wish: 表記揺れの「揃える先」を毎 tick reviewer が
// 決め直し、指摘.md 経由で junior/primary に伝える (最短 2 tick) のをやめる。
// ここで固定するのは登録簿そのものの約束:
//   - 揃える先は 1 度決めれば残り、次の run は決め直さない
//   - 引くのは正規化キーなので、登録した綴り以外の書き方も同じ組に当たる
//   - 登録簿に無い名前には何も言わない (新語を邪魔しない)
//   - 壊れた登録簿でも名前を打つ手順は止まらない
//   - 入力欄は登録簿を名前帳より先に言う (揃える先を 2 つ出さない)
// 自前の窓で回す。run-tests.js は 1 プロセスで全部を順に回すので、
// 差し替えた窓は最後に元へ戻す (後続のテストが読み込み済みのモジュールを見失う)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/name-pairing.js',
 '../src/core/dupe-merge.js', '../src/core/method-audit.js', '../src/core/part-reference.js',
 '../src/core/part-vocab.js', '../src/core/name-audit.js', '../src/core/name-registry.js',
 '../src/ui/properties.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var NR = global.window.MA.nameRegistry;
var NA = global.window.MA.nameAudit;
var PV = global.window.MA.partVocab;
var P = global.window.MA.properties;

// 事故の実物。primary は IRQCtrl、junior は Irq_Ctrl。
var DOCS = [
  { name: 'primary/driver_common_class.puml',
    dsl: ['@startuml', 'class IRQCtrl {', '  + Init() : void', '}', 'class ClockCtrl',
      'IRQCtrl --> ClockCtrl', '@enduml'].join('\n') },
  { name: 'junior/diagram1.puml',
    dsl: ['@startuml', 'participant Irq_Ctrl', 'participant Clock_Ctrl',
      'Irq_Ctrl -> Clock_Ctrl : Init()', '@enduml'].join('\n') },
];

function reg(entries) { return NR.parse({ entries: entries }); }

describe('正式表記の登録簿 — 決めて残す', function() {

  test('1 語登録すると、揃える先が名指しで引ける', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl'], { by: 'reviewer' }).registry;
    expect(NR.lookup(r, 'IRQCtrl').status).toBe('ok');
    expect(NR.lookup(r, 'Irq_Ctrl').status).toBe('variant');
    expect(NR.lookup(r, 'Irq_Ctrl').canonical).toBe('IRQCtrl');
  });

  test('登録していない綴りでも、区切りと大小が違うだけなら同じ組に当たる', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry;
    // `IRQ_CTRL` は登録簿に 1 文字も書いていないが、揃える先は同じ。
    expect(NR.lookup(r, 'IRQ_CTRL').canonical).toBe('IRQCtrl');
    expect(NR.lookup(r, 'irq-ctrl').canonical).toBe('IRQCtrl');
  });

  test('登録簿に無い名前には何も言わない (新語を邪魔しない)', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry;
    expect(NR.lookup(r, 'Dma_Driver').status).toBe('unknown');
    expect(NR.checkName(r, 'Dma_Driver')).toBe('');
  });

  test('揃える先そのものを打ったときも何も言わない', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry;
    expect(NR.checkName(r, 'IRQCtrl')).toBe('');
  });

  test('揺れた綴りには、揃える先と登録者が 1 行で出る', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl'], { by: 'reviewer' }).registry;
    var line = NR.checkName(r, 'Irq_Ctrl');
    expect(line).toContain('IRQCtrl');
    expect(line).toContain('登録: reviewer');
  });

  test('揃える先を変えると、前の綴りは寄せる側に降りる (両方が正にならない)', function() {
    var r1 = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry;
    var r2 = NR.register(r1, 'Irq_Ctrl', []).registry;
    expect(NR.lookup(r2, 'Irq_Ctrl').status).toBe('ok');
    expect(NR.lookup(r2, 'IRQCtrl').status).toBe('variant');
    expect(NR.parse(r2).entries.length).toBe(1);
  });

  test('同じ登録をもう一度しても登録簿は変わらない', function() {
    var r1 = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl'], { by: 'reviewer' }).registry;
    var again = NR.register(r1, 'IRQCtrl', ['Irq_Ctrl'], { by: 'reviewer' });
    expect(again.changed).toBe(false);
  });

  test('登録は元の登録簿を書き換えない', function() {
    var r0 = NR.empty();
    NR.register(r0, 'IRQCtrl', ['Irq_Ctrl']);
    expect(r0.entries.length).toBe(0);
  });

  test('消せる', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry;
    expect(NR.parse(NR.remove(r, 'irq_ctrl')).entries.length).toBe(0);
  });
});

describe('正式表記の登録簿 — 保存の形', function() {

  test('書いて読み直しても同じ (並びは canonical 順で固定)', function() {
    var r = NR.registerAll(NR.empty(), [
      { canonical: 'Spi_Driver', variants: ['SpiDrv'] },
      { canonical: 'IRQCtrl', variants: ['Irq_Ctrl'] },
    ], { by: 'reviewer' }).registry;
    var text = NR.format(r);
    expect(NR.format(NR.parse(text))).toBe(text);
    expect(NR.parse(text).entries.map(function(e) { return e.canonical; }))
      .toEqual(['IRQCtrl', 'Spi_Driver']);
  });

  test('壊れた登録簿は「未登録」として読む (名前を打つ手順を止めない)', function() {
    expect(NR.parse('{ こわれ').entries).toEqual([]);
    expect(NR.parse('').entries).toEqual([]);
    expect(NR.parse(null).entries).toEqual([]);
    expect(NR.checkName(NR.parse('{ こわれ'), 'Irq_Ctrl')).toBe('');
  });

  test('揃える先が 2 つ書かれていたら 1 つにまとめる', function() {
    var r = NR.parse({ entries: [
      { canonical: 'IRQCtrl', variants: ['Irq_Ctrl'] },
      { canonical: 'Irq_Ctrl', variants: [] },
    ] });
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].canonical).toBe('Irq_Ctrl');
    expect(r.entries[0].variants).toContain('IRQCtrl');
  });

  test('揃える先そのものは寄せる綴りに入らない', function() {
    var r = reg([{ canonical: 'IRQCtrl', variants: ['IRQCtrl', 'Irq_Ctrl', 'Irq_Ctrl'] }]);
    expect(r.entries[0].variants).toEqual(['Irq_Ctrl']);
  });
});

describe('正式表記の登録簿 — 突合との噛み合い', function() {

  test('決めていない組だけが「要決定」で残る', function() {
    var groups = NA.variants(DOCS);
    expect(groups.length).toBe(2);
    expect(NR.pending(NR.empty(), groups).length).toBe(2);

    var r = NR.registerAll(NR.empty(), NR.fromVariants(groups, { by: 'reviewer' })).registry;
    // 次の tick: 同じ揺れを見ても、決め直す組は無い。
    expect(NR.pending(r, NA.variants(DOCS)).length).toBe(0);
    expect(NR.covered(r, NA.variants(DOCS)).length).toBe(2);
  });

  test('新しい略語が 1 組増えたら、その 1 組だけが要決定になる', function() {
    var groups = NA.variants(DOCS);
    var r = NR.registerAll(NR.empty(), NR.fromVariants(groups)).registry;
    var more = DOCS.concat([{ name: 'junior/spi_state.puml',
      dsl: ['@startuml', 'state Spi_Driver', 'state SpiDriver', 'Spi_Driver --> SpiDriver', '@enduml'].join('\n') }]);
    var pend = NR.pending(r, NA.variants(more));
    expect(pend.length).toBe(1);
    expect(pend[0].members.map(function(m) { return m.name; }).sort())
      .toEqual(['SpiDriver', 'Spi_Driver']);
  });

  test('揃える先の推しは突合の多数派をそのまま使う', function() {
    var e = NR.fromVariants(NA.variants(DOCS))[0];
    expect(['ClockCtrl', 'Clock_Ctrl']).toContain(e.canonical);
    expect(e.variants.length).toBe(1);
  });
});

describe('正式表記の登録簿 — 引く / 読ませる', function() {

  test('前方一致で候補が出る。区切りを打つ前でも当たる', function() {
    var r = NR.registerAll(NR.empty(), [
      { canonical: 'IRQCtrl', variants: ['Irq_Ctrl'] },
      { canonical: 'Spi_Driver', variants: ['SpiDrv'] },
    ]).registry;
    expect(NR.suggest(r, 'irq', 0).map(function(e) { return e.canonical; })).toEqual(['IRQCtrl']);
    // `spid` は綴りに無い (Spi_Driver の `_` を打つ前) が、正規化キーで当たる。
    expect(NR.suggest(r, 'spid', 0).map(function(e) { return e.canonical; })).toEqual(['Spi_Driver']);
    expect(NR.suggest(r, '', 1).length).toBe(1);
  });

  test('見出しは語数を数で言う', function() {
    expect(NR.summary(NR.empty())).toContain('未登録');
    expect(NR.summary(NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry)).toContain('1 語');
  });

  test('1 件は「揃える先 ← 寄せる綴り」の 1 行で読める', function() {
    var r = NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl'], { by: 'reviewer', at: '2026-09-15' }).registry;
    var line = NR.lines(r)[0];
    expect(line).toContain('IRQCtrl ← Irq_Ctrl');
    expect(line).toContain('reviewer');
  });
});

describe('入力欄 (junior / primary が名前を打つ場所)', function() {
  var field;

  beforeEach(function() {
    document.body.innerHTML = '<input id="nm">';
    field = document.getElementById('nm');
    PV.setCurrent(null);
    NR.setCurrent(null);
  });

  function mount(opts) {
    document.body.insertAdjacentHTML('beforeend', P.vocabPickerHtml('nm-vocab', opts || { roles: ['type'] }));
    P.bindVocabPicker('nm-vocab', 'nm');
    return document.getElementById('nm-vocab');
  }

  test('登録簿だけでも欄の下にチップが出る (名前帳が空でも)', function() {
    NR.setCurrent(NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry);
    var box = mount();
    expect(!!box).toBe(true);
    expect(box.getAttribute('data-registry')).toBe('1');
    expect(box.querySelector('.registry-chip').textContent).toContain('IRQCtrl');
    expect(box.querySelector('.vocab-head').textContent).toContain('正式表記 1 語');
  });

  test('チップを押すと欄が正式表記で埋まる', function() {
    NR.setCurrent(NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry);
    var box = mount();
    box.querySelector('.registry-chip').click();
    expect(field.value).toBe('IRQCtrl');
    expect(box.querySelector('.vocab-warn').textContent).toBe('');
  });

  test('揺れた綴りを打つと、その場で揃える先が出る', function() {
    NR.setCurrent(NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl'], { by: 'reviewer' }).registry);
    var box = mount();
    field.value = 'Irq_Ctrl';
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(box.querySelector('.vocab-warn').textContent).toContain('IRQCtrl');
  });

  test('登録簿は名前帳より先に言う (揃える先を 2 つ出さない)', function() {
    // 名前帳は図にある綴り `Irq_Ctrl` を知っていて、登録簿は `IRQCtrl` が正と言う。
    PV.setCurrent(PV.collect('irq', [{ name: 'irq_state.puml', kind: 'state',
      text: '@startuml\nstate Irq_Ctrl\n@enduml' }]));
    NR.setCurrent(NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry);
    var box = mount();
    field.value = 'IrqCtrl';
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    var warn = box.querySelector('.vocab-warn').textContent;
    expect(warn).toContain('登録簿の正式表記は IRQCtrl');
    expect(warn).not.toContain('表記が揺れています');
  });

  test('登録簿が空なら今までどおり名前帳だけが言う', function() {
    PV.setCurrent(PV.collect('spi', [{ name: 'spi_state.puml', kind: 'state',
      text: '@startuml\nstate Spi_Init\n@enduml' }]));
    var box = mount({ roles: ['state'] });
    field.value = 'SpiInit';
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(box.querySelector('.vocab-warn').textContent).toContain('表記が揺れています');
  });

  test('メソッド名の欄には登録簿を出さない (部品名の揃える先だから)', function() {
    NR.setCurrent(NR.register(NR.empty(), 'IRQCtrl', ['Irq_Ctrl']).registry);
    PV.setCurrent(PV.collect('spi', [{ name: 'spi_state.puml', kind: 'state',
      text: '@startuml\nIdle --> Busy : Spi_Init\n@enduml' }]));
    var box = mount({ roles: ['method', 'event'] });
    expect(box.getAttribute('data-registry')).toBe('0');
    expect(box.querySelector('.registry-chip')).toBe(null);
  });
});

// 窓を元に戻す (describe / test はここまでに同期で走り終えている)。
global.window = prevWindow;
global.document = prevDocument;
