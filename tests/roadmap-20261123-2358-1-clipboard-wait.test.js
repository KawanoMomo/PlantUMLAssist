'use strict';
// TICKET-roadmap-20261123-2358-1 (roadmap v9.0 必須 2): 「クリップボードにコピー」も SVG / PNG と同じ判定 (MA.exportWait) を通り、
// 待つ・やめる・描けない・写した・写せなかったを「写す」の語で言う。直しを外す (exportClipboard が待たずに svgToCanvas を
// 直に呼ぶ・語を書き出しのまま) と赤。
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var W = { MA: {} };
new Function('window', fs.readFileSync(path.join(ROOT, 'src/core/export-wait.js'), 'utf-8'))(W);
var EW = W.MA.exportWait;
var APP = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf-8');

function body(name) {
  var i = APP.indexOf('function ' + name + '(');
  if (i < 0) return '';
  var j = APP.indexOf('\nfunction ', i + 10);
  return APP.slice(i, j < 0 ? APP.length : j);
}

describe('TICKET-roadmap-20261123-2358-1 クリップボードにコピーも今の本文の図を待って写す', function() {
  test('messages: clipboard は「写す」の語、それ以外は今までの書き出しの語', function() {
    var c = EW.messages('clipboard');
    expect(c.wait).toBe('描き直しが届いたらクリップボードに写します…');
    expect(c.cancel.indexOf('写しませんでした: 待っている間に別の図に替えました')).toBe(0);
    expect(c.error.indexOf('写しませんでした: 今の本文は描けません')).toBe(0);
    expect(c.error).toContain('クリップボードは前のまま');
    var p = EW.messages('png');
    expect(p.wait).toBe(EW.WAIT_MSG);
    expect(p.cancel).toBe(EW.CANCEL_MSG);
    expect(p.error).toBe(EW.ERROR_MSG);
  });

  test('copiedMsg: 写したことと画素数・バイト数を言う', function() {
    expect(EW.copiedMsg('1420×1540 px (2 倍)', 12345)).toBe('クリップボードに写しました: 1420×1540 px (2 倍) · 12345 バイト');
  });

  test('copyFailedMsg: 許しが切れた (NotAllowedError) ときは押し直しを言い、どの失敗も黙らない', function() {
    var e = new Error('Document is not focused.');
    e.name = 'NotAllowedError';
    var m = EW.copyFailedMsg(e);
    expect(m.indexOf('写しませんでした: ')).toBe(0);
    expect(m).toContain('もう一度押してください');
    expect(m).toContain('クリップボードは前のまま');
    expect(EW.copyFailedMsg(new Error('x'))).toContain('クリップボードに書けませんでした');
  });

  test('app.js: exportClipboard は _exportWhenDrawn (clipboard) を通り、写した後に下端で言う', function() {
    var ec = body('exportClipboard');
    expect(ec).toContain("_exportWhenDrawn(_exportClipboardNow, 'clipboard')");
    expect(ec.indexOf('svgToCanvas(')).toBe(-1);
    var now = body('_exportClipboardNow');
    expect(now).toContain('_rasterSvgEl(');
    expect(now).toContain('copiedMsg');
    expect(now).toContain('copyFailedMsg');
    // 絵が無いときも黙って戻らない
    expect(/if \(!svgEl\) \{ _clipboardResult\(false/.test(now)).toBe(true);
  });
});
