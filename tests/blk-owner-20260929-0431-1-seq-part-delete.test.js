'use strict';
// BLK-owner-20260929-0431-1: シーケンス図で宣言の行が無い参加者 (暗黙の参加者・create で作った参加者) を
// 図で選んで右パネルの「✕ 削除」を押すと、参加者ではなく、その名が最初に出るメッセージの行が 1 行だけ消えた。
// create の直後のメッセージが消えると PlantUML が描けない図になる。create し直した 2 回目の頭を選ぶと、
// 見出しは 1 回目の行 (L6) を指し、「✕ 削除」は 1 回目のメッセージを消していた。
// 直し方: パネルの見出し・↑↓・✕ 削除は選んで光らせた行 (sel.line) を指し、その行がその参加者を図に出す行
// (宣言・create) でなければ理由を言って本文を変えない。宣言の行なら今までどおりその行だけを消す。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>');
var W = dom.window;
var loadErrors = [];
[
  'src/core/html-utils.js', 'src/core/dsl-utils.js', 'src/core/note-edit.js', 'src/core/regex-parts.js',
  'src/core/id-normalizer.js', 'src/core/line-resolver.js', 'src/core/formatter-interface.js',
  'src/core/dsl-updater.js', 'src/core/props-renderer.js', 'src/core/text-updater.js',
  'src/core/parser-utils.js', 'src/core/history.js', 'src/core/selection.js', 'src/core/element-delete.js',
  'src/core/label-colors.js',
  'src/ui/terms.js', 'src/ui/properties.js', 'src/ui/rich-label-editor.js', 'src/core/sequence-participant-zone.js', 'src/modules/sequence.js',
].forEach(function(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', code);
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var SEQ = W.MA && W.MA.modules && W.MA.modules.plantumlSequence;

var IMPLICIT = ['@startuml', 'A -> B : x', 'B --> A : y', '@enduml'].join('\n');
var CREATED = ['@startuml', 'participant Main', 'Main -> Main : start', 'create Worker',
  'Main -> Worker : run', 'Worker --> Main : done', '@enduml'].join('\n');
var RECREATED = ['@startuml', 'participant Main', 'create Worker', 'Main -> Worker : run(job1)',
  'Worker --> Main : done1', 'destroy Worker', 'create Worker', 'Main -> Worker : run(job2)',
  'Worker --> Main : done2', '@enduml'].join('\n');
var DECLARED = ['@startuml', 'participant Alice', 'participant Bob', 'Alice -> Bob : hi', '@enduml'].join('\n');
var CREATE_DECL = ['@startuml', 'participant Main', 'create participant Worker',
  'Main -> Worker : run', '@enduml'].join('\n');

var text = '';
var ctx = {
  getMmdText: function() { return text; },
  setMmdText: function(t) { text = t; },
  onUpdate: function() {},
};

function start(dsl) {
  text = dsl;
  W.MA.history.init(ctx);
  while (W.MA.history.canUndo()) W.MA.history.undo();
  text = dsl;
  var t = W.document.getElementById('seq-range-toast');
  if (t) { t.textContent = ''; t.style.display = 'none'; }
}

// 図で参加者の頭を押したときと同じ選択 (type / id / line) でパネルを描く。
function selectPart(id, line) {
  var propsEl = W.document.getElementById('props');
  var parsed = SEQ.parseSequence(text);
  SEQ.renderProps([{ type: 'participant', id: id, line: line }], parsed, propsEl, ctx);
  return propsEl;
}
function btn(propsEl, cls) {
  var b = propsEl.querySelector('.' + cls);
  if (!b) throw new Error(cls + ' not rendered');
  return b;
}
function toastText() {
  var t = W.document.getElementById('seq-range-toast');
  return t && t.style.display !== 'none' ? t.textContent : '';
}

// PlantUML は `create X` の直後に X へのメッセージが無いと描けない
// ("After create command, you have to send a message to X")。
function createFollowedByMessage(dsl) {
  var lines = dsl.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].trim().match(/^create\s+(?:participant\s+)?(\S+)$/);
    if (!m) continue;
    var next = '';
    for (var j = i + 1; j < lines.length; j++) { if (lines[j].trim()) { next = lines[j].trim(); break; } }
    if (!new RegExp('->\\s*' + m[1] + '\\b').test(next)) return false;
  }
  return true;
}

describe('BLK-owner-20260929-0431-1 sources load', function() {
  test('no source eval errors', function() { expect(loadErrors.join(' | ')).toBe(''); });
  test('sequence module is available', function() { expect(!!SEQ).toBe(true); });
});

describe('BLK-owner-20260929-0431-1: participantOwnsLine / participantLineGuard', function() {
  test('宣言・create participant・create の行はその参加者の行', function() {
    expect(SEQ.participantOwnsLine(DECLARED, 'Alice', 2)).toBe(true);
    expect(SEQ.participantOwnsLine(CREATE_DECL, 'Worker', 3)).toBe(true);
    expect(SEQ.participantOwnsLine(RECREATED, 'Worker', 3)).toBe(true);
    expect(SEQ.participantOwnsLine(RECREATED, 'Worker', 7)).toBe(true);
    expect(SEQ.participantOwnsLine('@startuml\nparticipant "表示" as P1\n@enduml', 'P1', 2)).toBe(true);
  });
  test('メッセージの行・別の参加者の宣言・destroy の行は違う', function() {
    expect(SEQ.participantOwnsLine(IMPLICIT, 'B', 2)).toBe(false);
    expect(SEQ.participantOwnsLine(CREATED, 'Worker', 5)).toBe(false);
    expect(SEQ.participantOwnsLine(DECLARED, 'Bob', 2)).toBe(false);
    expect(SEQ.participantOwnsLine(RECREATED, 'Worker', 6)).toBe(false);
  });
  test('効かない行は理由を返し、効く行は空', function() {
    expect(/宣言の行がありません/.test(SEQ.participantLineGuard(IMPLICIT, 'B', 2, 'delete'))).toBe(true);
    expect(/動かしません/.test(SEQ.participantLineGuard(IMPLICIT, 'B', 2, 'move'))).toBe(true);
    expect(SEQ.participantLineGuard(DECLARED, 'Alice', 2, 'delete')).toBe('');
  });
});

// TICKET-owner-20261124-0422-3: 参加者の ✕ 削除は、宣言の行だけでなくメッセージ・note・activate 等の付いた行も
// 6 図種共通の窓 (#seq-del-modal) で本数を言ってから一緒に消す。宣言の行が無い参加者も黙って別の行を消さない
// (窓が消える本数を言い、「削除する」まで本文を変えない)。
function modalText() {
  var m = W.document.getElementById('seq-del-message');
  return m ? m.textContent : '';
}
function confirmModal() {
  var ok = W.document.getElementById('seq-del-confirm');
  if (!ok) throw new Error('seq-del-confirm not shown');
  ok.click();
}
function cancelModal() {
  var c = W.document.getElementById('seq-del-cancel');
  if (c) c.click();
}

describe('BLK-owner-20260929-0431-1 / TICKET-owner-20261124-0422-3: 宣言の行が無い参加者の ✕ 削除は窓が本数を言う', function() {
  test('暗黙の参加者: 押しただけでは本文を変えず、窓がメッセージの本数を言う。削除するで参加者の行が全部消える', function() {
    start(IMPLICIT);
    var p = selectPart('B', 2);
    btn(p, 'seq-delete-line').click();
    expect(text).toBe(IMPLICIT);
    expect(modalText()).toBe('参加者 B を削除します。メッセージ 2 本も消えます。');
    confirmModal();
    expect(text).toBe(['@startuml', '@enduml'].join('\n'));
  });

  test('取り消しなら何も変えない', function() {
    start(IMPLICIT);
    btn(selectPart('B', 2), 'seq-delete-line').click();
    cancelModal();
    expect(text).toBe(IMPLICIT);
    expect(W.document.getElementById('seq-del-modal')).toBe(null);
  });

  test('create で作った参加者: create の行とメッセージを一緒に消し、描ける本文のまま', function() {
    start(CREATED);
    var p = selectPart('Worker', 5);
    btn(p, 'seq-delete-line').click();
    expect(text).toBe(CREATED);
    expect(modalText()).toBe('参加者 Worker を削除します。メッセージ 2 本も消えます。');
    confirmModal();
    expect(text).toBe(['@startuml', 'participant Main', 'Main -> Main : start', '@enduml'].join('\n'));
    expect(createFollowedByMessage(text)).toBe(true);
  });

  test('暗黙の参加者の ↑↓ もメッセージの行を動かさない', function() {
    start(IMPLICIT);
    var p = selectPart('B', 2);
    btn(p, 'seq-move-down').click();
    expect(text).toBe(IMPLICIT);
    p = selectPart('B', 2);
    btn(p, 'seq-move-up').click();
    expect(text).toBe(IMPLICIT);
  });
});

describe('BLK-owner-20260929-0431-1: 見出し・削除は選んで光らせた行を指す', function() {
  test('create し直した 2 回目の頭: 見出しは 2 回目の create の行 (L7)', function() {
    start(RECREATED);
    var p = selectPart('Worker', 7);
    expect(/participant · 7 行目/.test(p.textContent)).toBe(true);
    expect(btn(p, 'seq-delete-line').getAttribute('data-line')).toBe('7');
    expect(btn(p, 'seq-move-up').getAttribute('data-line')).toBe('7');
  });

  test('create し直した参加者の ✕ 削除は、2 回の create・destroy・メッセージを一緒に消し、描ける本文になる', function() {
    start(RECREATED);
    var p = selectPart('Worker', 7);
    btn(p, 'seq-delete-line').click();
    expect(modalText()).toBe('参加者 Worker を削除します。メッセージ 4 本とactivate 等 1 行も消えます。');
    confirmModal();
    expect(text).toBe(['@startuml', 'participant Main', '@enduml'].join('\n'));
    expect(createFollowedByMessage(text)).toBe(true);
  });

  test('宣言のある参加者: 宣言とメッセージを一緒に消し、Ctrl+Z 1 回で全部戻る', function() {
    start(DECLARED);
    var p = selectPart('Alice', 2);
    expect(/participant · 2 行目/.test(p.textContent)).toBe(true);
    btn(p, 'seq-delete-line').click();
    expect(modalText()).toBe('参加者 Alice を削除します。メッセージ 1 本も消えます。');
    confirmModal();
    expect(text).toBe(['@startuml', 'participant Bob', '@enduml'].join('\n'));
    W.MA.history.undo();
    expect(text).toBe(DECLARED);
  });

  test('create participant で宣言した参加者も、宣言とメッセージを一緒に消す', function() {
    start(CREATE_DECL);
    var p = selectPart('Worker', 3);
    btn(p, 'seq-delete-line').click();
    confirmModal();
    expect(text).toBe(['@startuml', 'participant Main', '@enduml'].join('\n'));
    expect(createFollowedByMessage(text)).toBe(true);
  });

  test('note over の対象と activate の行も一緒に消える。線の無い参加者は窓を出さず 1 行だけ消す', function() {
    var T = ['@startuml', 'participant Ctl', 'participant Sub', 'participant Solo', 'Ctl -> Sub : req', 'activate Sub',
      'note over Ctl, Sub : both', 'note over Sub', '  long', 'end note', 'deactivate Sub', '@enduml'].join('\n');
    start(T);
    btn(selectPart('Sub', 3), 'seq-delete-line').click();
    expect(modalText()).toBe('参加者 Sub を削除します。メッセージ 1 本とnote 2 つとactivate 等 2 行も消えます。');
    confirmModal();
    expect(text).toBe(['@startuml', 'participant Ctl', 'participant Solo', '@enduml'].join('\n'));
    start(T);
    btn(selectPart('Solo', 4), 'seq-delete-line').click();
    expect(W.document.getElementById('seq-del-modal')).toBe(null);
    expect(text.split('\n').indexOf('participant Solo')).toBe(-1);
    expect(text.split('\n').length).toBe(T.split('\n').length - 1);
  });

  test('選択に行が無いときは参加者の行で描く (従来の見え方を保つ)', function() {
    start(DECLARED);
    var propsEl = W.document.getElementById('props');
    SEQ.renderProps([{ type: 'participant', id: 'Bob' }], SEQ.parseSequence(text), propsEl, ctx);
    expect(/participant · 3 行目/.test(propsEl.textContent)).toBe(true);
  });
});
