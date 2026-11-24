'use strict';
// TICKET-owner-20261123-0842-1 (data-loss): 「まとめて」で日本語名の要素を足した直後 (描き直し前) にもう一度
// 足すと、addBulk が古い parsed だけで別名を決めて S1・S2 を 2 度書き、前に足した要素が図から消えていた。
// addBulk も今の本文に出ている別名を使用中として避ける (idNormalizer.normalize の第 4 引数)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// 前の test が global.window を差し替えていても動くよう、自分の window に画面と同じ順で読み直す。
var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var srcs = [];
html.replace(/<script src="(src\/[^"]+)"/g, function(_, s) { srcs.push(s); return _; });
srcs = srcs.filter(function(s) {
  return /^src\/core\//.test(s) || s === 'src/ui/properties.js' || /^src\/modules\/(state|usecase|component|sequence)\.js$/.test(s);
});
srcs.forEach(function(s) {
  var p = path.join(__dirname, '..', s);
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  try { require(p); } catch (e) { /* 画面専用の部品は読めなくてよい */ }
});
var M = window.MA.modules;

// 本文の `as <prefix><n>` を数え、同じ別名が 2 回以上宣言されていないか見る。
function aliasCounts(text, prefixes) {
  var re = new RegExp('\\bas\\s+((?:' + prefixes.join('|') + ')\\d+)\\b', 'g');
  var c = {}, m;
  while ((m = re.exec(text)) !== null) c[m[1]] = (c[m[1]] || 0) + 1;
  return c;
}
function dupes(c) { return Object.keys(c).filter(function(k) { return c[k] > 1; }); }

var STALE = null; // 描き直しが届く前の古い解析結果 (= 何も無い) を表す

describe('addBulk avoids aliases already in the current text (TICKET-owner-20261123-0842-1)', function() {
  test('state: S1 S2 in text, stale parsed -> new aliases start at S3', function() {
    var t = '@startuml\nstate "待機" as S1\nstate "初期化中" as S2\n@enduml';
    var out = M.plantumlState.addBulk(t, '完了\n異常', STALE);
    var c = aliasCounts(out, ['S']);
    expect(dupes(c)).toEqual([]);
    expect(out).toContain('as S3');
    expect(out).toContain('as S4');
    expect(out).toContain('state "待機" as S1');
    expect(out).toContain('state "初期化中" as S2');
  });

  test('state: one + 追加 then bulk (scenario A) keeps 待機', function() {
    var t = '@startuml\nstate "待機" as S1\n@enduml';
    var out = M.plantumlState.addBulk(t, '初期化中\n完了', { states: [] });
    expect(dupes(aliasCounts(out, ['S']))).toEqual([]);
    expect(out).toContain('state "待機" as S1');
    expect(out).toContain('as S2');
    expect(out).toContain('as S3');
  });

  test('sequence: P1 P2 in text, stale parsed -> P3 from', function() {
    var t = '@startuml\nparticipant "制御" as P1\nparticipant "監視" as P2\n@enduml';
    var out = M.plantumlSequence.addBulk(t, '記録\n通知', STALE);
    expect(dupes(aliasCounts(out, ['P']))).toEqual([]);
    expect(out).toContain('as P3');
    expect(out).toContain('as P4');
  });

  test('usecase: A1 / U1 in text, stale parsed -> A2 / U2', function() {
    var t = '@startuml\nactor "利用者" as A1\nusecase "ログイン" as U1\n@enduml';
    var out = M.plantumlUsecase.addBulk(t, 'actor 管理者\n検索する', STALE);
    var c = aliasCounts(out, ['A', 'U']);
    expect(dupes(c)).toEqual([]);
    expect(out).toContain('as A2');
    expect(out).toContain('as U2');
  });

  test('component: C1 C2 in text, stale parsed -> C3 from', function() {
    var t = '@startuml\ncomponent "受付" as C1\ncomponent "台帳" as C2\n@enduml';
    var out = M.plantumlComponent.addBulk(t, '集計\n通知', STALE);
    expect(dupes(aliasCounts(out, ['C']))).toEqual([]);
    expect(out).toContain('as C3');
    expect(out).toContain('as C4');
  });

  test('ASCII names and fresh text: output unchanged from before', function() {
    var t = '@startuml\n@enduml';
    var out = M.plantumlState.addBulk(t, 'Idle\nRun\nIdle --> Run', { states: [] });
    expect(out).toContain('Idle --> Run');
    expect(/as S\d/.test(out)).toBe(false);
    var j = M.plantumlState.addBulk(t, '待機\n完了', { states: [] });
    expect(j).toContain('as S1');
    expect(j).toContain('as S2');
  });
});

// 読んだ部品をキャッシュから外し、window を戻す (後の test が自分の window へ読み直せるように)。
srcs.forEach(function(s) {
  try { delete require.cache[require.resolve(path.join(__dirname, '..', s))]; } catch (e) {}
});
global.window = _prevWindow;
global.document = _prevDocument;
