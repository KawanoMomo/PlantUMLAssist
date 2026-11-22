'use strict';
// TICKET-owner-20261122-2322-3: 保存先の直下 seq-1 と spi/seq-1 を開くと、タブも「開いている図」の行も
// 「seq-1.puml」が 2 つで見分けが付かなかった。同じ名前が 2 枚以上開いているときだけフォルダの道を添える。
var fs = require('fs');
var path = require('path');

var FT = function() { return window.MA.fileTree; };

var ROOT = 'C:/proj';
function rel(d) {
  if (!d.sub || !d.dir) return '';
  var seg = FT().relSegments(ROOT, d.dir);
  return seg && seg.length ? seg.join('/') : '';
}

describe('sameNameHints — 同じ名前の図だけにフォルダの道を添える (TICKET-owner-20261122-2322-3)', function() {
  test('直下と spi/ の seq-1 は「(直下)」と「spi/」、名前の重ならない図は空', function() {
    var docs = [
      { id: 1, name: 'seq-1' },
      { id: 2, name: 'seq-1', sub: true, dir: 'C:\\proj\\spi' },
      { id: 3, name: 'class-1' },
    ];
    var h = FT().sameNameHints(docs, rel);
    expect(h[1]).toBe('(直下)');
    expect(h[2]).toBe('spi/');
    expect(h[3]).toBe('');
  });

  test('2 階層下は道のまま (docs/api/)、名前の大文字小文字が違っても同じ名前とみなす', function() {
    var docs = [
      { id: 1, name: 'St', sub: true, dir: 'C:/proj/docs/api' },
      { id: 2, name: 'st', sub: true, dir: 'C:/proj/spi' },
    ];
    var h = FT().sameNameHints(docs, rel);
    expect(h[1]).toBe('docs/api/');
    expect(h[2]).toBe('spi/');
  });

  test('1 枚だけ開いているサブフォルダの図には何も添えない (今の見た目のまま)', function() {
    var h = FT().sameNameHints([{ id: 1, name: 'seq-1', sub: true, dir: 'C:/proj/spi' }, { id: 2, name: 'seq-2' }], rel);
    expect(h[1]).toBe('');
    expect(h[2]).toBe('');
  });

  test('道が測れないサブフォルダの図を「直下」と言わず、フォルダ名で言う', function() {
    var docs = [
      { id: 1, name: 'seq-1' },
      { id: 2, name: 'seq-1', sub: true, dir: 'D:\\other\\spi' },
    ];
    var h = FT().sameNameHints(docs, rel);
    expect(h[1]).toBe('(直下)');
    expect(h[2]).toBe('spi/');
  });

  test('タブ (app.js) と「開いている図」の行 (files-panel.js) が同じ関数から語を引く', function() {
    var app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');
    var fp = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'files-panel.js'), 'utf-8');
    expect(app.indexOf('sameNameHints(docs, _docSubRel)') >= 0).toBe(true);
    expect(app.indexOf("hint.className = 'tab-dir'") >= 0).toBe(true);
    expect(fp.indexOf('sameNameHints(docs, _openDocRel)') >= 0).toBe(true);
  });
});
