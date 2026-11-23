'use strict';
// TICKET-roadmap-20261123-0226-3: GIT 節の変更の行と FILES のツリーの M・A の印が、サブフォルダの図でも
// 直下の図と同じに押して開け、印が付く。押した行の道の図を開き (直下の同じ名前の図を開かない)、
// 印は道と名前で引く (直下の同じ名前の図に付けない)。直下の図の今の挙動は変えない。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
// 前の test が global.window を差し替えていても読めるよう、自分の window に git-panel だけを読む。
var GP = (function() {
  var prev = global.window;
  var p = path.join(ROOT, 'src', 'core', 'git-panel.js');
  global.window = { MA: {} };
  try {
    try { delete require.cache[require.resolve(p)]; } catch (e) {}
    require(p);
    return global.window.MA.gitPanel;
  } finally {
    try { delete require.cache[require.resolve(p)]; } catch (e) {}
    global.window = prev;
  }
})();

describe('サブフォルダの図の変更の行を押して開ける (TICKET-roadmap-20261123-0226-3)', function() {
  test('サブフォルダの .puml は道を添えて開く。M は最後のコミットと並べる', function() {
    var op = GP.changeOpen({ code: 'M', file: 'hw/spi/spi_state.puml', name: '' });
    expect(op.name).toBe('spi_state');
    expect(op.rel).toBe('hw/spi');
    expect(op.compare).toBe(true);
    expect(op.title).toBe('hw/spi/spi_state を開いて、最後のコミットと並べる');
    var a = GP.changeOpen({ code: 'A', file: 'design/new_seq.puml', name: '' });
    expect(a.rel).toBe('design');
    expect(a.name).toBe('new_seq');
    expect(a.compare).toBe(false);
  });

  test('直下の図は今と同じ (rel を持たない)。D と図でないファイルは開かない', function() {
    expect(GP.changeOpen({ code: 'M', file: 'spi_state.puml', name: 'spi_state' }))
      .toEqual({ name: 'spi_state', compare: true, title: 'spi_state を開いて、最後のコミットと並べる' });
    expect(GP.changeOpen({ code: 'D', file: 'hw/old.puml', name: '' })).toBe(null);
    expect(GP.changeOpen({ code: 'M', file: 'docs/README.md', name: '' })).toBe(null);
  });

  test('印はサブフォルダの図を道と名前で引き、直下の同じ名前の図には付けない', function() {
    var st = { repo: true, available: true, changes: [
      { code: 'M', file: 'hw/spi_state.puml', name: '' },
      { code: 'A', file: 'hw/spi/new_seq.puml', name: '' },
      { code: 'M', file: 'top.puml', name: 'top' },
    ] };
    expect(GP.marksByPath(st)).toEqual({ 'hw/spi_state': 'M', 'hw/spi/new_seq': 'A' });
    var byName = GP.marksByName(st);
    expect(byName.spi_state).toBe(undefined);
    expect(byName.top).toBe('M');
  });

  test('ツリーのサブフォルダの図の行に印を付け、変更の行はツリーが読んだそのフォルダの図を開く', function() {
    var ui = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'git-ui.js'), 'utf8');
    expect(ui).toContain(".files-sub-file[data-file-name][data-sub-rel]");
    expect(ui).toContain('window.openFromSubFolder(op.name, subDir');
    // 履歴と比較はその図のフォルダで引く (保存先で引くと直下の同じ名前の図の履歴になる)
    var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    expect(app).toContain("'/git-show?dir=' + encodeURIComponent(_gitDocDir())");
    expect(app).toContain('docDir: _gitDocDir');
    var fp = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'files-panel.js'), 'utf8');
    var sub = fp.slice(fp.indexOf('function renderSubTree()'), fp.indexOf('function secOpen('));
    expect(sub).toContain('_gitMarks();');
  });
});
