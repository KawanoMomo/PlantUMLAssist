'use strict';
// BLK-junior-20260915-0606: 活動図 (手順2) のアクション本文に打つのは、先輩の
// クラス図にしかない実在メソッド名 (Spi_Init / Spi_Reset / Spi_Transmit / Notify)。
// 名前帳 (BLK-junior-20260915-0406-wish) は状態遷移図・シーケンス・クラスの欄にしか
// 出ていなかったので、活動図タブを開いたまま名前を引く手段が無く、
// 「別タブでクラス図を開く → 絞る → 控える → 活動図タブに戻る」の往復が要った。
// 活動図の本文欄にも同じ名前帳を出す。ただし本文は自由文 (複数行を一括で打つ欄でもある)
// なので、チップは欄を置き換えずカーソル位置に差し込む。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/name-pairing.js',
 '../src/core/dupe-merge.js', '../src/core/method-audit.js', '../src/core/part-reference.js',
 '../src/core/regex-parts.js', '../src/core/part-slice.js',
 '../src/core/part-vocab.js', '../src/ui/properties.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var PV = global.window.MA.partVocab;
var P = global.window.MA.properties;

// 先輩の 8 部品相乗りクラス図 (driver_common_class)。junior が名前を拾いに行っていた図。
var SENIOR_CLASS = [
  '@startuml',
  'class Spi_Driver {',
  '  +Spi_Init()',
  '  +Spi_Reset()',
  '  +Spi_Transmit(buf, len)',
  '  +Notify()',
  '}',
  'class Uart_Driver {',
  '  +Uart_Send()',
  '}',
  '@enduml',
].join('\n');

// junior が打ちかけの活動図。
var MY_ACT = [
  '@startuml',
  'start',
  ':Spi_Init();',
  'stop',
  '@enduml',
].join('\n');

var DOCS = [
  { name: 'driver_common_class.puml', kind: 'class', text: SENIOR_CLASS, folder: 'primary' },
  { name: 'spi_activity.puml', kind: 'activity', text: MY_ACT, folder: '' },
];

function names(items) { return items.map(function(i) { return i.name; }); }

function chip(name) {
  return global.document.querySelector('#pk .vocab-chip[data-name="' + name + '"]');
}

describe('活動図のアクション本文から名前帳を引く', function() {
  beforeEach(function() {
    PV.setCurrent(PV.collect('spi', DOCS));
    global.document.body.innerHTML = '<textarea id="t"></textarea>'
      + P.vocabPickerHtml('pk', { roles: ['method'], callSuffix: true });
    P.bindVocabPicker('pk', 't', null, { insert: 'caret' });
  });

  test('先輩のクラス図にある実在メソッドが、活動図の欄の下に並ぶ', function() {
    var got = Array.prototype.map.call(
      global.document.querySelectorAll('#pk .vocab-chip'),
      function(c) { return c.getAttribute('data-name'); });
    expect(got).toContain('Spi_Init');
    expect(got).toContain('Spi_Reset');
    expect(got).toContain('Spi_Transmit');
    expect(got).toContain('Notify');
    // 別部品のメソッドは混ざらない (相乗り図でも部品で絞れている)。
    expect(got).not.toContain('Uart_Send');
  });

  test('チップは括弧まで入る (アクション本文はそのまま呼び出しの形)', function() {
    chip('Spi_Init').click();
    expect(global.document.getElementById('t').value).toBe('Spi_Init()');
  });

  test('打ちかけの本文を消さず、カーソル位置に差し込む', function() {
    var t = global.document.getElementById('t');
    t.value = 'if ';
    t.setSelectionRange(3, 3);
    chip('Spi_Reset').click();
    expect(t.value).toBe('if Spi_Reset()');
    // 続きを打てるように、カーソルは差し込んだ直後に置く。
    expect(t.selectionStart).toBe('if Spi_Reset()'.length);
  });

  test('一括追加の欄でも、既に書いた行を巻き込まない', function() {
    var t = global.document.getElementById('t');
    t.value = 'Spi_Init()\n';
    t.setSelectionRange(t.value.length, t.value.length);
    chip('Spi_Transmit').click();
    expect(t.value).toBe('Spi_Init()\nSpi_Transmit()');
  });

  test('揺れた綴りは、いまカーソルが居る行だけを見て言う', function() {
    var t = global.document.getElementById('t');
    var warn = global.document.querySelector('#pk .vocab-warn');
    t.value = 'Spi_Init()\nSpiReset';
    t.setSelectionRange(t.value.length, t.value.length);
    t.dispatchEvent(new global.window.Event('input', { bubbles: true }));
    expect(warn.textContent).toContain('Spi_Reset');
    // 1 行目に戻れば、その行は揺れていないので何も言わない。
    t.setSelectionRange(2, 2);
    t.dispatchEvent(new global.window.Event('input', { bubbles: true }));
    expect(warn.textContent).toBe('');
  });

  test('置き換えの欄 (既定) の振る舞いは変えない', function() {
    global.document.body.innerHTML = '<input id="f">'
      + P.vocabPickerHtml('pk', { roles: ['method'] });
    P.bindVocabPicker('pk', 'f');
    var f = global.document.getElementById('f');
    f.value = 'Spi_';
    chip('Spi_Init').click();
    expect(f.value).toBe('Spi_Init');
  });
});

// 名前を持っているのは、ファイル名に部品名の無い相乗り図の方だった。
// ファイル名だけで図を選ぶと、この 1 枚が丸ごと名前帳の外に落ちる。
describe('名前帳 — 相乗り図の中に居る部品も読む', function() {
  // 他部品の図。この部品を参照しているだけなので、今までどおり読まない。
  var OTHER_STATE = [
    '@startuml',
    'state Idle',
    'Idle --> Busy : Uart_Send',
    '@enduml',
  ].join('\n');

  test('ファイル名に部品名が無くても、中に居ればその部品ぶんだけ入る', function() {
    var v = PV.collect('spi', DOCS);
    expect(v.docs.map(function(d) { return d.name; })).toContain('driver_common_class.puml');
    expect(names(v.items)).toContain('Spi_Reset');
    expect(names(v.items)).not.toContain('Uart_Send');
  });

  test('相乗りでない他部品の図は、今までどおり読まない', function() {
    var v = PV.collect('spi', [{ name: 'uart_state.puml', kind: 'state', text: OTHER_STATE, folder: '' }]);
    expect(v.items.length).toBe(0);
  });

  test('どの図から来た名前かは 1 件ごとに言える (先輩の図を開かない根拠)', function() {
    var v = PV.collect('spi', DOCS);
    expect(PV.sourceText(v.byName['Spi_Reset'])).toContain('primary/driver_common_class');
  });
});

// window を差し替えたままにすると、後続のテストファイルが別の window を見る。
PV.setCurrent(null);
global.window = prevWindow;
global.document = prevDocument;
