'use strict';
// BLK-builder-20260907-1737-2 / design 4c「State — 遷移を選択」の
// 「この遷移にノートを添える」。
//
// UseCase / Component / Class の関係には 3c の「この線にノートを添える」が
// 入っているのに、状態遷移だけ `note on link` を DSL に手で書くしかなかった。
// ここでは
//   - 遷移の右ペインがノート欄を出すこと (現在のノートを読んで初期値にする)
//   - ノートを添える / 書き換える / 外せること
//   - 遷移を消すとノートも一緒に消えること (行き先を失ったノートを残さない)
//   - state のカスケード削除でも同じこと
// を検証する。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/core/selection.js',
  '../src/core/history.js',
  '../src/ui/properties.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;
var P = global.window.MA.properties;
var RO = global.window.MA.relationOptions;

var SRC = [
  '@startuml',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  '@enduml',
].join('\n');

var NOTED = [
  '@startuml',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'note on link',
  '  リトライ上限を超えた場合のみ',
  'end note',
  'Running --> Idle : stop',
  '@enduml',
].join('\n');

// 右ペインを実際に描いて、その中の要素を見る。
function renderTransition(text, line) {
  var parsed = stMod.parse(text);
  var tr = null;
  parsed.transitions.forEach(function(t) { if (t.line === line) tr = t; });
  if (!tr) throw new Error(line + ' 行目の遷移が見つかりません');
  // 同じ id の要素が複数残ると querySelector('#id') が別の host のものを掴む。
  global.document.body.innerHTML = '';
  var host = global.document.createElement('div');
  global.document.body.appendChild(host);
  var current = text;
  stMod.renderProps(
    [{ type: 'transition', id: tr.id, line: tr.line }],
    parsed, host,
    {
      getMmdText: function() { return current; },
      setMmdText: function(t) { current = t; },
      onUpdate: function() {},
    });
  return { host: host, text: function() { return current; } };
}

describe('properties.linkNoteHtml / bindLinkNote', function() {
  test('ノートが無ければ textarea を畳んで出す', function() {
    global.document.body.innerHTML = '';
    var host = global.document.createElement('div');
    global.document.body.appendChild(host);
    host.innerHTML = P.linkNoteHtml('x-note', { label: 'この遷移にノートを添える' });
    expect(host.textContent).toContain('この遷移にノートを添える');
    expect(host.querySelector('#x-note').hasAttribute('hidden')).toBe(true);
    expect(host.querySelector('#x-note-on').checked).toBe(false);
  });

  test('ノートがあれば開いた状態で本文を入れて出す', function() {
    global.document.body.innerHTML = '';
    var host = global.document.createElement('div');
    global.document.body.appendChild(host);
    host.innerHTML = P.linkNoteHtml('y-note', { note: 'ほげ' });
    expect(host.querySelector('#y-note').hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('#y-note').value).toBe('ほげ');
    expect(host.querySelector('#y-note-on').checked).toBe(true);
  });

  test('チェックを入れただけでは何も書かない (空のノートを作らない)', function() {
    global.document.body.innerHTML = '';
    var host = global.document.createElement('div');
    global.document.body.appendChild(host);
    host.innerHTML = P.linkNoteHtml('z-note', {});
    var calls = [];
    P.bindLinkNote('z-note', function(v) { calls.push(v); });
    var box = global.document.getElementById('z-note-on');
    box.checked = true;
    box.dispatchEvent(new global.window.Event('change'));
    expect(calls).toEqual([]);
    expect(global.document.getElementById('z-note').hasAttribute('hidden')).toBe(false);
  });

  test('チェックを外すと null を投げる (ノートを外す)', function() {
    global.document.body.innerHTML = '';
    var host = global.document.createElement('div');
    global.document.body.appendChild(host);
    host.innerHTML = P.linkNoteHtml('w-note', { note: 'ほげ' });
    var calls = [];
    P.bindLinkNote('w-note', function(v) { calls.push(v); });
    var box = global.document.getElementById('w-note-on');
    box.checked = false;
    box.dispatchEvent(new global.window.Event('change'));
    expect(calls).toEqual([null]);
  });
});

describe('State の遷移にノートを添える (design 4c)', function() {
  test('遷移の右ペインにノート欄が出る', function() {
    var r = renderTransition(SRC, 5);
    expect(r.host.textContent).toContain('この遷移にノートを添える');
    expect(r.host.querySelector('#st-tr-note')).not.toBe(null);
  });

  test('既にあるノートを読んで初期値にする', function() {
    var r = renderTransition(NOTED, 5);
    expect(r.host.querySelector('#st-tr-note').value).toBe('リトライ上限を超えた場合のみ');
    expect(r.host.querySelector('#st-tr-note-on').checked).toBe(true);
  });

  test('本文を入れると note on link が遷移行の直後に入る', function() {
    var r = renderTransition(SRC, 5);
    var ta = global.document.getElementById('st-tr-note');
    ta.value = 'リトライ上限を超えた場合のみ';
    ta.dispatchEvent(new global.window.Event('change'));
    var lines = r.text().split('\n');
    expect(lines[4]).toBe('Idle --> Running : start');
    expect(lines[5]).toBe('note on link');
    expect(lines[6].trim()).toBe('リトライ上限を超えた場合のみ');
    expect(lines[7]).toBe('end note');
    // 他の遷移は動かない
    expect(r.text()).toContain('Running --> Idle : stop');
  });

  test('チェックを外すとノートだけが消え、遷移は残る', function() {
    var r = renderTransition(NOTED, 5);
    var box = global.document.getElementById('st-tr-note-on');
    box.checked = false;
    box.dispatchEvent(new global.window.Event('change'));
    expect(r.text()).not.toContain('note on link');
    expect(r.text()).toContain('Idle --> Running : start');
  });

  test('遷移を消すとノートも一緒に消える', function() {
    var r = renderTransition(NOTED, 5);
    global.document.getElementById('st-tr-delete').click();
    var t = r.text();
    expect(t).not.toContain('Idle --> Running : start');
    expect(t).not.toContain('note on link');
    expect(t).not.toContain('リトライ上限を超えた場合のみ');
    expect(t).not.toContain('end note');
    // 関係の無い行は残る
    expect(t).toContain('Running --> Idle : stop');
    expect(t).toContain('[*] --> Idle');
  });

  test('ノートを添えても遷移の解釈は変わらない (パーサが読み飛ばす)', function() {
    var p = stMod.parse(NOTED);
    expect(p.transitions.map(function(t) { return t.from + '->' + t.to; }))
      .toEqual(['[*]->Idle', 'Idle->Running', 'Running->Idle']);
    expect(p.transitions[1].trigger).toBe('start');
  });
});

describe('state を消したときの link ノート', function() {
  test('カスケード削除でも行き先を失ったノートを残さない', function() {
    var out = stMod.deleteStateWithRefs(NOTED, 'Running');
    expect(out).not.toContain('note on link');
    expect(out).not.toContain('end note');
    expect(out).not.toContain('リトライ上限を超えた場合のみ');
    expect(out).not.toContain('Idle --> Running');
    expect(out).toContain('[*] --> Idle');
  });

  test('ノートの無い遷移は今までどおり 1 行だけ消える', function() {
    var out = stMod.deleteStateWithRefs(SRC, 'Running');
    expect(out).not.toContain('Idle --> Running');
    expect(out).not.toContain('Running --> Idle');
    expect(out).toContain('[*] --> Idle');
    expect(out).toContain('state Idle');
  });
});

describe('relationOptions は状態遷移行も線として扱える', function() {
  test('noteAt / setNoteAt が遷移行に効く', function() {
    var out = RO.setNoteAt(SRC, 5, 'ほげ');
    expect(RO.noteAt(out, 5)).toBe('ほげ');
    expect(RO.noteAt(SRC, 5)).toBe(null);
  });
});

// window を差し替えたままにすると、後続のテストファイルが別の window を見る。
global.window = prevWindow;
global.document = prevDocument;
