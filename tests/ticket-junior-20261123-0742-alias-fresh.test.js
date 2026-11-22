'use strict';
// TICKET-junior-20261123-0742 (data-loss): 状態チップで日本語の名前を入れて「+ 追加」を描き直し前に続けて押すと、
// 3 つとも `state "…" as S1` になり、2 つ目以降が前の状態を上書きして押していない状態が図から消えていた。
// 追加フォームが持つ解析結果 (parsedData) は描き直しが届くまで古い。別名は今の本文からも数える (idNormalizer の共通部)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
window.alert = function() {};

// 画面と同じ順で src/core・src/ui/properties.js・図種モジュールを読む (app.js と画面の配線は読まない)。
var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var srcs = [];
html.replace(/<script src="(src\/[^"]+)"/g, function(_, s) { srcs.push(s); return _; });
srcs = srcs.filter(function(s) {
  return /^src\/core\//.test(s) || s === 'src/ui/properties.js' || /^src\/modules\/(state|usecase|component|class|sequence)\.js$/.test(s);
});
srcs.forEach(function(s) {
  var p = path.join(__dirname, '..', s);
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  try { require(p); } catch (e) { /* 画面専用の部品は読めなくてよい */ }
});

var IN = window.MA.idNormalizer;
var M = window.MA.modules;

describe('idNormalizer: 今の本文に出ている別名を避ける', function() {
  test('本文を渡すと、解析結果に無くても本文の S1・S2 を飛ばす', function() {
    var text = '@startuml\nstate "待機" as S1\nstate "初期化中" as S2\n@enduml';
    expect(IN.normalize('完了', {}, 'S', text)).toEqual({ id: 'S3', label: '完了', valid: true });
  });
  test('語の一部 (S10 の中の S1・XS2) は使用中に数えない', function() {
    var text = 'state "a" as S10\nstate XS2\nstate S2x';
    expect(IN.normalize('あ', {}, 'S', text).id).toBe('S1');
    expect(Object.keys(IN.usedInText(text, 'S'))).toEqual(['S10']);
  });
  test('本文を渡さなければ従来どおり解析結果だけで決める', function() {
    expect(IN.normalize('あ', { S1: true }, 'S').id).toBe('S2');
  });
});

function ctxFor(text) {
  var c = { text: text, updates: 0 };
  c.getMmdText = function() { return c.text; };
  c.setMmdText = function(t) { c.text = t; };
  c.onUpdate = function() { c.updates++; };
  return c;
}
function aliases(text, re) {
  var out = [];
  text.split('\n').forEach(function(l) { var m = l.match(re); if (m) out.push(m[1]); });
  return out;
}

describe('末尾に追加: 描き直し前に続けて 3 つ足しても別名が重ならない', function() {
  if (window.MA.history && !window.MA.history.pushHistory) window.MA.history.pushHistory = function() {};
  if (!window.MA.history) window.MA.history = { pushHistory: function() {} };

  test('状態遷移図: 状態チップで 待機・初期化中・完了 を続けて足すと S1・S2・S3', function() {
    var ST = M.plantumlState;
    var ctx = ctxFor('@startuml\n@enduml');
    var stale = ST.parse(ctx.text);
    var propsEl = document.getElementById('props');
    ST.renderProps(null, stale, propsEl, ctx);
    ['待機', '初期化中', '完了'].forEach(function(name) {
      document.getElementById('st-tail-id').value = name;
      document.getElementById('st-tail-add').click();
    });
    expect(aliases(ctx.text, /^state ".*" as (\S+)/)).toEqual(['S1', 'S2', 'S3']);
    expect(ST.parse(ctx.text).states.map(function(s) { return s.label; })).toEqual(['待機', '初期化中', '完了']);
  });

  test('ユースケース図: アクター 2 人を続けて足すと A1・A2', function() {
    var UC = M.plantumlUsecase;
    var ctx = ctxFor('@startuml\n@enduml');
    var propsEl = document.getElementById('props');
    UC.renderProps(null, UC.parse(ctx.text), propsEl, ctx);
    var kind = document.getElementById('uc-tail-kind');
    if (kind) { kind.value = 'actor'; kind.dispatchEvent(new window.Event('change')); }
    ['利用者', '管理者'].forEach(function(name) {
      document.getElementById('uc-tail-alias').value = name;
      document.getElementById('uc-tail-add').click();
    });
    expect(aliases(ctx.text, / as (A\d+)/)).toEqual(['A1', 'A2']);
  });
});

// 読んだ部品をキャッシュから外す (後の test が自分の window へ読み直せるように)。
srcs.forEach(function(s) {
  try { delete require.cache[require.resolve(path.join(__dirname, '..', s))]; } catch (e) {}
});
global.window = _prevWindow;
global.document = _prevDocument;
