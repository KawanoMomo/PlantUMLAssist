'use strict';
// BLK-owner-20260929-2131-1: !while で 3 人作った参加者の 1 人の名前を右パネルで直すと、ひな形の行
// `participant "サービス$i" as S$i` が書き換わって 3 人とも同じ名前になり、Alias を直すとメッセージの参照だけが
// 替わって宣言の無い参加者が増えた。!procedure の呼び出し RETRY(B) の矢印は本文を直しても何も書かれなかった。
// 直し方: 選んだ部品の行が 1 部品 1 行の行でない (!while・!foreach の中、手続きの中身・呼び出し、$変数・%関数で
// 名前が決まる行、展開後の行から読んだ部品) ときは、右パネルの欄とボタンを読むだけにし、どの行が作っているかを
// 1 行で言う (src/core/generated-part.js。app.js の renderProps・キー操作・参加者のドラッグが使う)。
// 1 部品 1 行の普通の行は今までどおり直せる (migrator のコーパスで確かめる)。
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
  'src/core/parser-utils.js', 'src/core/history.js', 'src/core/selection.js',
  'src/core/label-colors.js', 'src/core/preproc-live.js', 'src/core/preproc-expand.js', 'src/core/generated-part.js',
  'src/ui/properties.js', 'src/ui/rich-label-editor.js', 'src/core/sequence-participant-zone.js', 'src/modules/sequence.js',
].forEach(function(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', code);
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var GP = W.MA.generatedPart;
var PE = W.MA.preprocExpand;
var SEQ = W.MA.modules && W.MA.modules.plantumlSequence;

function read(dir, name, ext) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', dir, name + ext), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
}
function jarLines(name) { return JSON.parse(read('preproc', name, '.json')); }

var WHILE3 = ['@startuml', '!$i = 1', '!while $i <= 3', '  participant "サービス$i" as S$i', '  !$i = $i + 1',
  '!endwhile', 'S1 -> S2 : a', 'S2 -> S3 : b', '@enduml'].join('\n');
// 上の本文を plantuml のプリプロセッサに通したときの応答 (目印つき。seq-while-participants.json と同じ形)
var WHILE3_JAR = ['@startuml', '§pua7f3§2§', '§pua7f3§3§',
  '§pua7f3§4§', '  participant "サービス1" as S1', '§pua7f3§5§', '§pua7f3§6§',
  '§pua7f3§4§', '  participant "サービス2" as S2', '§pua7f3§5§', '§pua7f3§6§',
  '§pua7f3§4§', '  participant "サービス3" as S3', '§pua7f3§5§', '§pua7f3§6§',
  '§pua7f3§7§', 'S1 -> S2 : a', '§pua7f3§8§', 'S2 -> S3 : b', '§pua7f3§9§', '@enduml'];
var PROC = ['@startuml', '!procedure RETRY($to)', 'A -> $to : retry', '!endprocedure', 'participant A',
  'participant B', 'A -> B : go', 'RETRY(B)', '@enduml'].join('\n');
var PROC_JAR = ['@startuml', '§pua7f3§2§', '§pua7f3§5§', 'participant A', '§pua7f3§6§', 'participant B',
  '§pua7f3§7§', 'A -> B : go', '§pua7f3§8§', 'A -> B : retry', '§pua7f3§9§', '@enduml'];

function kindAt(text, line, el, withExp) {
  var g = GP.of(text, line, el, withExp ? { callLines: PE.changedLines(text) } : null);
  return g ? g.kind : null;
}

var text = '';
var ctx = {
  getMmdText: function() { return text; },
  setMmdText: function(t) { text = t; },
  onUpdate: function() {},
};
var refused = [];
function panel(dsl, jar, selItem) {
  text = dsl;
  PE.forget();
  PE.remember(dsl, jar);
  var parsed = PE.parseWith(SEQ.parseSequence, dsl);
  var el = null;
  (parsed.elements || []).concat(parsed.relations || []).forEach(function(o) {
    if (o.id === selItem.id && (!el || o.line === selItem.line)) el = o;
  });
  var gen = GP.of(dsl, selItem.line, el, { callLines: PE.changedLines(dsl) });
  var propsEl = W.document.getElementById('props');
  propsEl.innerHTML = '';
  refused = [];
  SEQ.renderProps([selItem], parsed, propsEl,
    gen ? GP.guard(ctx, gen, function(g) { refused.push(g); }) : ctx);
  if (gen) GP.lock(propsEl, gen);
  return { propsEl: propsEl, gen: gen, parsed: parsed };
}
function fire(el, type) { el.dispatchEvent(new W.Event(type, { bubbles: true })); }

describe('BLK-owner-20260929-2131-1 読み込み', function() {
  test('sources load', function() {
    expect(loadErrors).toEqual([]);
    expect(typeof GP.of).toBe('function');
    expect(!!SEQ).toBe(true);
  });
});

describe('BLK-owner-20260929-2131-1 1 部品 1 行でない行を見分ける', function() {
  test('!while の中の参加者はその繰り返しが作る。後ろの普通のメッセージは直せる', function() {
    var g = GP.of(WHILE3, 4, null, null);
    expect(g.kind).toBe('loop');
    expect(g.at).toBe(3);
    expect(g.message).toContain('L3 の繰り返し (!while)');
    expect(g.message).toContain('L4 を直す');
    expect(GP.of(WHILE3, 7, null, null)).toBeNull();
    expect(GP.of(WHILE3, 8, null, null)).toBeNull();
  });

  test('!procedure を呼んだ行は、その手続きが作る。手続きの中身の行も読むだけ', function() {
    var g = GP.of(PROC, 8, null, null);
    expect(g.kind).toBe('call');
    expect(g.name).toBe('RETRY');
    expect(g.message).toContain('L8 で呼んだ手続き RETRY');
    expect(g.message).toContain('L2〜L4');
    expect(kindAt(PROC, 3)).toBe('body');
    expect(GP.of(PROC, 7, null, null)).toBeNull();
    expect(GP.of(PROC, 5, null, null)).toBeNull();
  });

  test('!foreach・入れ子の繰り返し・引数つき !define・1 行の !function も同じ見分け方', function() {
    var t = ['@startuml', '!foreach $n in ["X", "Y"]', '  !foreach $m in ["1"]', '  participant $n$m', '  !endfor',
      '!endfor', '!define PING(a,b) a -> b : ping', '!function $who($x) !return $x + "!"', 'PING(X1, Y1)',
      'X1 -> Y1 : $who("hi")', 'X1 -> Y1 : plain', '@enduml'].join('\n');
    var g = GP.of(t, 4, null, null);
    expect(g.kind).toBe('loop');
    expect(g.at).toBe(2);          // 入れ子は外側の繰り返しで言う
    expect(kindAt(t, 9)).toBe('call');
    expect(kindAt(t, 10)).toBe('call');
    expect(GP.of(t, 11, null, null)).toBeNull();
  });

  test('$変数・%関数で名前・文言が決まる行は読むだけ。$ を含んでも変数でない文言 (料金 $5) は直せる', function() {
    var t = ['@startuml', '!$sys = "決済"', 'participant "$sys 画面" as A', 'A -> A : %upper("req")',
      'A -> A : 料金 $5', 'A -> A : $undefined のまま', '@enduml'].join('\n');
    expect(kindAt(t, 3)).toBe('var');
    expect(GP.of(t, 3, null, null).message).toContain('L2');
    expect(kindAt(t, 4)).toBe('var');
    expect(GP.of(t, 5, null, null)).toBeNull();
    expect(GP.of(t, 6, null, null)).toBeNull();
  });

  test('展開後の行から読んだ部品 (element.expanded) は、本文の字面に手掛かりが無くても読むだけ', function() {
    var t = ['@startuml', '!include retry.iuml', 'participant A', 'RETRY_IN_FILE(A)', '@enduml'].join('\n');
    expect(GP.of(t, 4, null, null)).toBeNull();
    var g = GP.of(t, 4, { kind: 'message', line: 4, expanded: true }, null);
    expect(g.kind).toBe('macro');
    expect(g.message).toContain('呼び出し RETRY_IN_FILE');
    expect(GP.of(t, 3, { kind: 'participant', line: 3 }, null)).toBeNull();
  });

  test('corpus fixture (実際の jar の展開): 呼び出し・変数・繰り返しの行だけが読むだけになる', function() {
    function flagged(name, mod) {
      var dsl = read('dsl', name, '.puml');
      PE.forget();
      PE.remember(dsl, jarLines(name));
      var parsed = PE.parseWith(SEQ.parseSequence, dsl);
      var out = {};
      (parsed.elements || []).concat(parsed.relations || []).forEach(function(o) {
        if (typeof o.line !== 'number') return;
        var g = GP.of(dsl, o.line, o, { callLines: PE.changedLines(dsl) });
        out[o.line] = g ? g.kind : 'edit';
      });
      return out;
    }
    expect(flagged('seq-definelong-retry')).toEqual({ 5: 'edit', 6: 'edit', 7: 'edit', 8: 'call', 9: 'edit' });
    var s36 = flagged('seq-36-definelong-variables-strfunc');
    expect(s36).toEqual({ 8: 'var', 9: 'var', 10: 'var', 12: 'var', 14: 'call', 15: 'var' });
    var w = flagged('seq-while-participants');
    expect(w[4]).toBe('loop');
    expect(w[7]).toBe('edit');
    var c22 = flagged('common-22-preproc-variables-conditions');
    expect(c22[15]).toBe('loop');
    expect(c22[18]).toBe('var');
    expect(c22[19]).toBe('edit');
    expect(c22[21]).toBe('edit');
  });
});

describe('BLK-owner-20260929-2131-1 右パネルは読むだけ', function() {
  test('!while の参加者: 欄とボタンが全部押せず、Label・Alias を変えても本文は 1 字も変わらない', function() {
    var r = panel(WHILE3, WHILE3_JAR, { type: 'participant', id: 'S2', line: 4 });
    expect(r.gen.kind).toBe('loop');
    var note = r.propsEl.querySelector('#generated-part-note');
    expect(!!note).toBe(true);
    expect(note.textContent).toContain('L3 の繰り返し');
    // 見出しのすぐ下に出る
    expect(r.propsEl.firstElementChild.nextElementSibling).toBe(note);
    var ctrls = r.propsEl.querySelectorAll('input, select, textarea, button');
    expect(ctrls.length).toBeGreaterThan(5);
    expect(Array.prototype.filter.call(ctrls, function(c) { return !c.disabled; }).length).toBe(0);
    var alias = r.propsEl.querySelector('#seq-edit-alias');
    alias.value = 'SV';
    fire(alias, 'change'); fire(alias, 'blur');
    var ta = r.propsEl.querySelector('textarea');
    if (ta) { ta.value = '受付'; fire(ta, 'input'); fire(ta, 'change'); fire(ta, 'blur'); }
    Array.prototype.forEach.call(r.propsEl.querySelectorAll('.seq-delete-line, .seq-move-up, .seq-move-down'), function(b) {
      fire(b, 'click');
    });
    expect(text).toBe(WHILE3);
  });

  test('!procedure の呼び出しの矢印: 本文・矢印の種類・線の色・削除を触っても本文は変わらず、断った理由が残る', function() {
    var r = panel(PROC, PROC_JAR, { type: 'message', id: '__m_1', line: 8 });
    expect(r.gen.kind).toBe('call');
    expect(r.propsEl.querySelector('#generated-part-note').textContent).toContain('手続き RETRY');
    // 押しても図を書き換えるボタン: 矢印の種類のカード・線の色の見本・上へ / 下へ / 削除
    var clicks = r.propsEl.querySelectorAll('button[data-value], button[data-color], .seq-delete-line, .seq-move-up, .seq-move-down');
    expect(clicks.length).toBeGreaterThan(5);
    Array.prototype.forEach.call(clicks, function(b) { fire(b, 'click'); });
    Array.prototype.forEach.call(r.propsEl.querySelectorAll('input, textarea, select'), function(c) {
      if (c.tagName === 'SELECT') { if (c.options.length > 1) c.selectedIndex = (c.selectedIndex + 1) % c.options.length; }
      else if (c.type !== 'checkbox' && c.type !== 'hidden') c.value = '再送';
      fire(c, 'input'); fire(c, 'change'); fire(c, 'blur');
    });
    expect(text).toBe(PROC);
  });

  test('1 部品 1 行の普通の行 (A -> B : go) は今までどおり欄から直せる', function() {
    var r = panel(PROC, PROC_JAR, { type: 'message', id: '__m_0', line: 7 });
    expect(r.gen).toBeNull();
    expect(r.propsEl.querySelector('#generated-part-note')).toBeNull();
    var enabled = Array.prototype.filter.call(r.propsEl.querySelectorAll('button'), function(b) { return !b.disabled; });
    expect(enabled.length).toBeGreaterThan(5);
  });

  test('guard: 同じ本文を書くのは断らない (空振り)、違う本文は断って onRefuse に理由を渡す', function() {
    text = 'x';
    var got = [];
    var g = GP.guard(ctx, { kind: 'loop', message: 'm' }, function(v) { got.push(v.message); });
    g.setMmdText('x');
    g.setMmdText('y');
    expect(text).toBe('x');
    expect(got).toEqual(['m']);
    expect(GP.guard(ctx, null, null)).toBe(ctx);
  });
});

// migrator のコーパス (persona-data) で、今直せる部品が読むだけにならない: プリプロセッサを使っていない図では
// どの行も読むだけにならず、読むだけになる行は必ず繰り返し・手続き・変数・%関数のどれかに当たる。
describe('BLK-owner-20260929-2131-1 コーパスの普通の行は読むだけにならない', function() {
  var CORPUS_DIR = process.env.PUA_CORPUS_DIR || 'E:\\01_Loop\\persona-data\\migrator';
  function listPuml(dir, recurse) {
    var out = [];
    if (!fs.existsSync(dir)) return out;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
      var p = path.join(dir, e.name);
      if (e.isDirectory()) { if (recurse) out = out.concat(listPuml(p, true)); return; }
      if (/\.puml$/i.test(e.name)) out.push(p);
    });
    return out;
  }
  var files = listPuml(path.join(CORPUS_DIR, 'web'), true)
    .concat(listPuml(path.join(CORPUS_DIR, 'corpus'), false))
    .concat(listPuml(path.join(__dirname, 'fixtures', 'dsl'), false));
  var PRE_RE = /^\s*!(?!(?:theme|pragma|include\w*|import|startsub|endsub)\b)/im;

  test('コーパスと fixture の全枚 (' + files.length + ' 枚)', function() {
    expect(files.length).toBeGreaterThan(50);
    var plainBad = [], reasonBad = [], plainFiles = 0, flaggedLines = 0;
    files.forEach(function(f) {
      var dsl = fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
      var lines = dsl.split('\n');
      var usesPre = PRE_RE.test(dsl);
      if (!usesPre) plainFiles++;
      var sc = GP.scan(dsl);
      for (var L = 1; L <= lines.length; L++) {
        var g = GP.of(dsl, L, null, null);
        if (!g) continue;
        flaggedLines++;
        if (!usesPre && g.kind !== 'var') plainBad.push(path.basename(f) + ':' + L + ' ' + g.kind);
        var t = lines[L - 1];
        var ok = (g.kind === 'loop' && sc.loopOf[L]) || (g.kind === 'body' && sc.bodyOf[L]) ||
          (g.kind === 'call' && t.indexOf(g.name) >= 0) ||
          (g.kind === 'var' && /[$%][A-Za-z_]/.test(t));
        if (!ok) reasonBad.push(path.basename(f) + ':' + L + ' ' + g.kind);
      }
    });
    expect(plainFiles).toBeGreaterThan(20);
    expect(plainBad).toEqual([]);
    expect(reasonBad).toEqual([]);
  });
});
