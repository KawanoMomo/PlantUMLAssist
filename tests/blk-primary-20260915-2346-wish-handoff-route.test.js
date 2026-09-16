'use strict';
// BLK-primary-20260915-2346-wish 「引き継ぎパッケージを新人側から辿る受け取り画面」。
//
// 願望: zip は図・SVG・突合結果を詰めただけで、新人が「今日どの図から見ればよいか」
// 「どの変更が今回分か」を辿る順序が付いていない。①この図から見る → ②ここが今回
// 変わった → ③次はこれ の 1 本道と、どこまで辿ったかが渡した側に返る道を検証する。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/handoff-route.js',
  '../src/core/handover-checklist.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

var HR = global.window.MA.handoffRoute;
var HC = global.window.MA.handoverChecklist;

// 1 枚ぶんの材料 (handoff-summary.build の行と同じ形)。
function row(name, o) {
  var v = o || {};
  return {
    name: name,
    diagramType: v.diagramType || 'sequence',
    changed: !!v.changed,
    changeLine: v.changeLine || '',
    reasons: v.reasons || [],
    openPins: v.openPins || [],
    fixCount: v.fixCount || 0,
    diffRows: v.diffRows || [],
  };
}

function snapshot(rows) {
  var changed = rows.filter(function(r) { return r.changed; });
  var rest = rows.filter(function(r) { return !r.changed; });
  return {
    createdAt: '2026-09-15 23:51',
    diagrams: rows.map(function(r) {
      return { id: r.name, name: r.name, diagramType: r.diagramType, filename: 'svg/' + r.name + '.svg', rendered: true, svg: '<svg/>' };
    }),
    summary: { changed: changed, rest: rest, changedCount: changed.length, total: rows.length },
  };
}

describe('handoff-route — 受け取る側が辿る順', function() {

  test('順番は材料から決まる: 変更+宿題 → 変更のみ → 宿題のみ の順に並ぶ', function() {
    var r = HR.build(snapshot([
      row('A 参考', {}),
      row('B 宿題だけ', { openPins: ['命名を直す'] }),
      row('C 変更のみ', { changed: true, changeLine: '＋2 −1' }),
      row('D 変更と宿題', { changed: true, changeLine: '＋5 −0', openPins: ['粒度が粗い'] }),
    ]));
    expect(r.stops.map(function(s) { return s.name; }))
      .toEqual(['D 変更と宿題', 'C 変更のみ', 'B 宿題だけ']);
    expect(r.stops.map(function(s) { return s.no; })).toEqual([1, 2, 3]);
    // 変更も宿題も無い図は順番を付けず、参考に落ちる。
    expect(r.rest.map(function(s) { return s.name; })).toEqual(['A 参考']);
    expect(r.total).toBe(3);
  });

  test('各停留所が「次はこれ」で次へつながり、最後は終わりと言う', function() {
    var r = HR.build(snapshot([
      row('X', { changed: true, openPins: ['a'] }),
      row('Y', { changed: true }),
    ]));
    expect(r.stops[0].next).toBe('Y');
    expect(r.stops[1].next).toBe('');
  });

  test('停留所が台本の手順番号を持つ (直す手が残っていれば 手順2)', function() {
    var r = HR.build(snapshot([
      row('直す', { changed: true, openPins: ['a'] }),
      row('読むだけ', { changed: true }),
      row('宿題', { openPins: ['b'] }),
    ]));
    expect(r.stops[0].step).toBe('手順2');
    expect(r.stops[1].step).toBe('手順1');
    expect(r.stops[2].step).toBe('手順2');
  });

  test('「ここが今回変わった」に変更行・反映した指摘・要修正の残りが並ぶ', function() {
    var r = HR.build(snapshot([
      row('Z', { changed: true, changeLine: '＋3 −1', reasons: ['名前をそろえた'], fixCount: 2 }),
    ]));
    var pts = r.stops[0].points;
    expect(pts[0]).toBe('＋3 −1');
    expect(pts[1]).toBe('反映した指摘: 名前をそろえた');
    expect(pts[2].indexOf('要修正')).toBeGreaterThan(-1);
  });

  test('1 行が「何枚を順に見るのか」と、手が残っている枚数を言う', function() {
    var r = HR.build(snapshot([
      row('P', { changed: true, openPins: ['a'] }),
      row('Q', { changed: true }),
      row('R', {}),
    ]));
    expect(r.line.indexOf('2 枚')).toBeGreaterThan(-1);
    expect(r.line.indexOf('1 枚は直す手が残っています')).toBeGreaterThan(-1);
    expect(r.line.indexOf('残り 1 枚は参考')).toBeGreaterThan(-1);
  });

  test('辿る図が 1 枚も無ければ、順路を作らずそう言う', function() {
    var r = HR.build(snapshot([row('参考だけの図', {})]));
    expect(r.stops.length).toBe(0);
    expect(r.line.indexOf('参考')).toBeGreaterThan(-1);
    var empty = HR.build(snapshot([]));
    expect(empty.line).toBe('辿る図はありません。');
  });

  test('錨は図一式の見出しと同じものを指し、同名でも別の錨になる', function() {
    var a = HR.anchorId('GPIO 初期化', 0);
    var b = HR.anchorId('GPIO 初期化', 1);
    expect(a).not.toBe(b);
    expect(a.indexOf('d-1')).toBe(0);
    // 記号だけの名前でも錨として成立する。
    expect(HR.anchorId('***', 4)).toBe('d-5');
  });

  test('renderHtml が番号・手順・錨・次はこれ・印の口を出す', function() {
    var r = HR.build(snapshot([
      row('先に見る図', { changed: true, changeLine: '＋1 −0', openPins: ['ここが未対応'] }),
      row('次の図', { changed: true }),
    ]));
    var html = HR.renderHtml(r);
    expect(html.indexOf('id="hr-list"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-total="2"')).toBeGreaterThan(-1);
    expect(html.indexOf('手順2')).toBeGreaterThan(-1);
    expect(html.indexOf('href="#' + r.stops[0].anchor + '"')).toBeGreaterThan(-1);
    expect(html.indexOf('次はこれ → 次の図')).toBeGreaterThan(-1);
    expect(html.indexOf('ここが未対応')).toBeGreaterThan(-1);
    expect(html.indexOf('id="hr-state"')).toBeGreaterThan(-1);
  });

  test('progressLine が「何枚まで辿ったか」を言い、全部なら言い切る', function() {
    expect(HR.progressLine(3, 0)).toBe('順路 0 / 3 枚を辿りました');
    expect(HR.progressLine(3, 3)).toBe('順路 3 枚すべてを辿りました');
    expect(HR.progressLine(0, 0)).toBe('辿る図はありません');
  });

  test('辿った記録は数として読み書きでき、壊れた値は受け取らない', function() {
    expect(HR.parseRoute({ total: 5, seen: 2, at: 'x' })).toEqual({ total: 5, seen: 2, at: 'x' });
    // 見た数が総数を超える記録は総数で止める (数え間違いをそのまま出さない)。
    expect(HR.parseRoute({ total: 2, seen: 9 }).seen).toBe(2);
    expect(HR.parseRoute(null)).toBe(null);
    expect(HR.parseRoute('{')).toBe(null);
    expect(HR.parseRoute({ seen: 1 })).toBe(null);
  });
});

describe('handover-checklist — 返信に「どこまで辿ったか」が相乗りする', function() {

  test('申し送りが 0 件でも、順路の記録だけの返信を読める', function() {
    var r = HC.parseReply(JSON.stringify({
      kind: 'handover-reply', createdAt: '2026-09-15 23:51',
      replies: {}, route: { total: 4, seen: 4, at: 'now' },
    }));
    expect(r).not.toBe(null);
    expect(r.route.seen).toBe(4);
  });

  test('申し送りも順路も無い返信は、今までどおり読めないままにする', function() {
    expect(HC.parseReply(JSON.stringify({ kind: 'handover-reply' }))).toBe(null);
  });

  test('渡した側の 1 行が「新人がどこまで辿ったか」を言う', function() {
    expect(HC.routeLine({ total: 6, seen: 3 })).toBe('新人の順路 3 / 6 枚を辿りました');
    expect(HC.routeLine(null)).toBe('');
  });

  test('index.html の返信スクリプトが順路の枚数を拾う口を持つ', function() {
    var s = HC.scriptHtml();
    expect(s.indexOf('hr-state')).toBeGreaterThan(-1);
    expect(s.indexOf('hr-list')).toBeGreaterThan(-1);
    // 申し送りが 0 件 (hc-list が無い) でも保存ボタンだけで動く。
    expect(s.indexOf('if (!box && !save) return;')).toBeGreaterThan(-1);
  });
});

global.window = prevWindow;
global.document = prevDocument;
