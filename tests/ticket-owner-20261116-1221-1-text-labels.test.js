'use strict';
// TICKET-owner-20261116-1221-1: 「末尾に追加」の文字を打つ欄 (メッセージの本文・ステレオタイプ、アクティビティの処理、注釈の本文) の
// 見出しが欄に結び付いておらず、見出しの語で欄を引けず、見出しを押しても欄に移らなかった。
// 共通の部品 (src/ui/properties.js の textLabelHtml / linkFieldLabels、本文欄の部品 rich-label-editor) で結び付け、
// 注釈の本文の見出しを図種を問わず「本文」にする (打ち方の案内は見出しの外の 1 行)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var W = dom.window;
var loadErrors = [];
var list = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf-8')
  .match(/'src\/[^']+\.js'/g).map(function(s) { return s.slice(1, -1); });
list.splice(list.indexOf('src/modules/sequence.js'), 0, 'src/ui/rich-label-editor.js');
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
var P = MA.properties;

function host(html) {
  W.document.body.innerHTML = '';
  var el = W.document.createElement('div');
  el.id = 'props-content';
  W.document.body.appendChild(el);
  if (html != null) el.innerHTML = html;
  return el;
}
function ctxOf(dsl) {
  var cur = dsl;
  return { getMmdText: function() { return cur; }, setMmdText: function(t) { cur = t; }, onUpdate: function() {} };
}
// 見えている (display:none の祖先が無い) 文字・選ぶ欄のうち、見出しも aria の名前も無いもの。
function unlabeled(root) {
  return Array.prototype.filter.call(root.querySelectorAll('input, select, textarea'), function(e) {
    if (e.type === 'hidden' || e.type === 'checkbox' || e.type === 'radio') return false;
    for (var n = e; n && n !== root; n = n.parentElement) if (n.style && n.style.display === 'none') return false;
    return !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby');
  }).map(function(e) { return e.tagName + '#' + (e.id || '?'); });
}

describe('TICKET-owner-20261116-1221-1 文字を打つ欄の見出し', function() {
  test('読み込み', function() {
    expect(loadErrors.length === 0 ? '' : loadErrors.join(' | ')).toBe('');
  });

  test('textLabelHtml: 見出しは語だけで for が欄を指し、Enter の案内は見出しの外', function() {
    var el = host(P.textLabelHtml(P.NOTE_BODY, 'st-tail-ntext', { enterHint: true }) + '<textarea id="st-tail-ntext"></textarea>');
    var ta = W.document.getElementById('st-tail-ntext');
    expect(ta.labels.length).toBe(1);
    expect(ta.labels[0].textContent).toBe('本文');
    expect(el.querySelector('label').getAttribute('for')).toBe('st-tail-ntext');
    expect(el.textContent).toContain('Enter で追加 / Shift+Enter で改行');
    expect(el.querySelector('label').textContent).not.toContain('Enter');
  });

  test('textLabelHtml: 案内を頼まなければ見出しだけ', function() {
    var el = host(P.textLabelHtml('本文', 'x'));
    expect(el.querySelectorAll('.field-hint').length).toBe(0);
    expect(el.textContent).toBe('本文');
  });

  test('linkFieldLabels: 手で組んだ見出しの直後の欄に for を張る (id が無ければ振る)', function() {
    var el = host('<label>処理</label><textarea></textarea>' +
      '<label>ステレオタイプ</label><input id="seq-tail-stereotype" type="text">');
    expect(P.linkFieldLabels(el)).toBe(2);
    var tas = el.querySelectorAll('textarea');
    expect(tas[0].id).not.toBe('');
    expect(tas[0].labels[0].textContent).toBe('処理');
    expect(W.document.getElementById('seq-tail-stereotype').labels[0].textContent).toBe('ステレオタイプ');
    expect(unlabeled(el)).toEqual([]);
  });

  test('linkFieldLabels: 区切りの見出し・for 付き・aria の名前付き・中に欄を持つ見出しは触らない', function() {
    var el = host('<label id="h">末尾に追加</label><div><input id="a" type="text"></div>' +
      '<label for="b">B</label><input id="b" type="text">' +
      '<label>新しい参加者を作成</label><input id="c" type="text" aria-label="新しい参加者の名前">' +
      '<label>D <input id="d" type="checkbox"></label><input id="e" type="text">' +
      '<label>F</label><input id="f" type="checkbox">');
    expect(P.linkFieldLabels(el)).toBe(0);
    expect(W.document.getElementById('a').labels.length).toBe(0);
    expect(W.document.getElementById('c').labels.length).toBe(0);
    expect(W.document.getElementById('e').labels.length).toBe(0);
    expect(W.document.getElementById('f').labels.length).toBe(0);
  });

  test('本文欄の部品: 入れ物に id があれば欄は {入れ物}-text、直前の見出しがそこを指す', function() {
    var el = host('<label>本文</label><div id="seq-tail-label-rle"></div>');
    MA.richLabelEditor.mount(W.document.getElementById('seq-tail-label-rle'), '');
    var ta = el.querySelector('.rle-textarea');
    expect(ta.id).toBe('seq-tail-label-rle-text');
    expect(ta.labels.length).toBe(1);
    expect(ta.labels[0].textContent).toBe('本文');
  });

  test('watchFieldLabels: 今の中身を張り、描き直しを見張る (1 つの入れ物に 1 回だけ)', function() {
    var el = host('<label>処理</label><textarea id="ac-tail-text"></textarea>');
    P.watchFieldLabels(el);
    expect(W.document.getElementById('ac-tail-text').labels.length).toBe(1);
    expect(el.__puaLabelWatch).toBe(true);
    // 描き直しで張り直す動きは実ブラウザ (scenario owner-20261116-1221-1) で見る (jsdom の MutationObserver は非同期)。
  });

  test('アクティビティの末尾に追加: 処理の欄は「処理」で引け、案内は見出しの外', function() {
    var dsl = '@startuml\nstart\n:A;\nstop\n@enduml';
    var el = host();
    var m = MA.modules.plantumlActivity;
    m.renderProps([], m.parse(dsl), el, ctxOf(dsl));
    var ta = W.document.getElementById('ac-tail-text');
    expect(ta.labels.length).toBe(1);
    expect(ta.labels[0].textContent).toBe('処理');
    expect(el.textContent).toContain('Enter で追加 / Shift+Enter で改行');
  });

  test('シーケンスの末尾に追加: メッセージの本文・ステレオタイプが見出しに結び付き、見出しの無い欄が無い', function() {
    var dsl = '@startuml\nparticipant A\nparticipant B\nA -> B : hi\n@enduml';
    var el = host();
    var m = MA.modules.plantumlSequence;
    m.renderProps([], m.parse(dsl), el, ctxOf(dsl));
    P.linkFieldLabels(el);
    var st = W.document.getElementById('seq-tail-stereotype');
    expect(st.labels.length).toBe(1);
    var body = W.document.getElementById('seq-tail-label-rle-text');
    expect(body && body.labels.length).toBe(1);
    expect(body.labels[0].textContent).toBe('本文');
    expect(unlabeled(el)).toEqual([]);
  });

  test('注釈の本文の見出しは図種を問わず「本文」(案内は見出しの外)', function() {
    var src = ['activity', 'state', 'class', 'usecase', 'sequence'].map(function(n) {
      return fs.readFileSync(path.join(ROOT, 'src/modules/' + n + '.js'), 'utf-8');
    }).join('\n');
    expect(/本文 \(Enter で追加/.test(src)).toBe(false);
    expect(src.indexOf('注釈の本文 (')).toBe(-1);
    ['ac-tail-ntext', 'st-tail-ntext', 'cl-tail-ntext', 'uc-tail-ntext', 'seq-tail-ntext-rle-text'].forEach(function(id) {
      expect(src.indexOf("P.textLabelHtml(P.NOTE_BODY, '" + id + "', { enterHint: true })") >= 0 ? id : 'missing ' + id).toBe(id);
    });
  });
});
