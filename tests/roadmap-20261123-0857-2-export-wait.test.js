'use strict';
// TICKET-roadmap-20261123-0857-2 (roadmap v8.0 必須 3): 書き出しは押した図の押した時点の本文の図を書く。
// 絵がまだ今の本文の図でなければ待って 1 回だけ書き、タブを替えたら別の図を書かずに理由を言う (MA.exportWait)。
var fs = require('fs');
var path = require('path');
var EW = window.MA.exportWait;

describe('TICKET-roadmap-20261123-0857-2 書き出しの待ち (MA.exportWait)', function() {
  var T = '@startuml\nA -> B\n@enduml';
  var T2 = '@startuml\nA -> B\nB -> C\n@enduml';

  test('decide: 絵が今のタブの今の本文の図ならすぐ書く', function() {
    expect(EW.decide({ hasSvg: true, pic: { key: 'd1', text: T }, key: 'd1', text: T, verdict: { text: T, state: 'ok' } })).toBe('now');
  });
  test('decide: 足した直後 (絵は前の本文) は待つ', function() {
    expect(EW.decide({ hasSvg: true, pic: { key: 'd1', text: T }, key: 'd1', text: T2, verdict: { text: T, state: 'ok' } })).toBe('wait');
  });
  test('decide: 別のタブの絵が残っている (図を開いた直後) は待つ', function() {
    expect(EW.decide({ hasSvg: true, pic: { key: 'd0', text: T }, key: 'd1', text: T, verdict: null })).toBe('wait');
  });
  test('decide: まだ絵が無い (白紙に足した直後) は待つ', function() {
    expect(EW.decide({ hasSvg: false, pic: null, key: 'd1', text: T, verdict: null })).toBe('wait');
  });
  test('decide: 今の本文が描けないと答えが出ていれば書かずに知らせる', function() {
    expect(EW.decide({ hasSvg: true, pic: { key: 'd1', text: T }, key: 'd1', text: T2, verdict: { text: T2, state: 'error' } })).toBe('error');
  });

  test('onRendered: 押した図の今の本文の絵が届いたら書く', function() {
    expect(EW.onRendered({ key: 'd1', text: T2 }, { ok: true, key: 'd1', text: T2, activeKey: 'd1', activeText: T2 })).toBe('run');
  });
  test('onRendered: 待つ間に本文をまた直したら、最新の本文の絵まで待ち、届いたらそれを書く', function() {
    var p = { key: 'd1', text: T };
    expect(EW.onRendered(p, { ok: true, key: 'd1', text: T, activeKey: 'd1', activeText: T2 })).toBe('keep');
    expect(EW.onRendered(p, { ok: true, key: 'd1', text: T2, activeKey: 'd1', activeText: T2 })).toBe('run');
  });
  test('onRendered: 待つ間にタブを替えたら、別の図を押した図の名前で書かない', function() {
    expect(EW.onRendered({ key: 'd1', text: T }, { ok: true, key: 'd2', text: T, activeKey: 'd2', activeText: T })).toBe('cancel');
  });
  test('onRendered: 押した図が描けなかったら書かずに知らせる', function() {
    expect(EW.onRendered({ key: 'd1', text: T }, { ok: false, key: 'd1', text: T, activeKey: 'd1', activeText: T })).toBe('error');
  });

  test('画面 (app.js) の書き出しは MA.exportWait を通り、描き直しの後に待ちを流す', function() {
    var app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');
    expect(app).toContain('function exportSVG() { _exportWhenDrawn(_exportSvgNow); }');
    expect(app).toContain('function exportPNG(transparent) { _exportWhenDrawn(function() { _exportPngNow(transparent); }); }');
    expect(app).toContain('_flushPendingExport(true, renderDocKey, renderText);');
    expect(app).toContain('_flushPendingExport(false, renderDocKey, renderText);');
  });
});
