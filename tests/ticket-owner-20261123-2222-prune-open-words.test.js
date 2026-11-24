'use strict';
// TICKET-owner-20261123-2222-prune: 手元の .puml を開く入口の重なりを外し、語をそろえる。
//   - 保存先の一覧の頭の開くボタン (#folder-open-file) を外す
//   - Ctrl+K の「開く」「クリップボードから開く」「クリップボードにコピー」の行の字を Import ▾ / Export ▾ の項目と同じにし、
//     前の語と英語は検索語に残す (今どおり引ける)
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf-8');
var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8');

function cmd(id) {
  var re = new RegExp("\\{ id: '" + id + "', title: '([^']*)'[^\\n]*keywords: \\[([^\\]]*)\\]");
  var m = re.exec(app);
  if (!m) throw new Error('no command ' + id);
  var kws = m[2].split(',').map(function(s) { return s.trim().replace(/^'|'$/g, ''); });
  return { title: m[1], keywords: kws };
}
function menuText(id) {
  var m = new RegExp('<button id="' + id + '">([^<]*)').exec(html);
  if (!m) throw new Error('no menu item ' + id);
  return m[1].trim();
}

describe('TICKET-owner-20261123-2222-prune 開く入口の語', function() {
  test('Ctrl+K の行の字は Import ▾ / Export ▾ の項目と同じ', function() {
    expect(cmd('open').title).toBe(menuText('imp-file'));
    expect(cmd('open').title).toBe('ファイルを開く…');
    expect(cmd('import-clipboard').title).toBe(menuText('imp-clipboard'));
    expect(cmd('export-clip').title).toBe(menuText('exp-clipboard'));
  });

  test('前の語と英語は検索語に残る (今どおり引ける)', function() {
    expect(cmd('open').keywords).toContain('ファイルを開く');
    expect(cmd('open').keywords).toContain('open');
    expect(cmd('open').keywords).toContain('Open');
    expect(cmd('import-clipboard').keywords).toContain('クリップボードの DSL から開く');
    expect(cmd('import-clipboard').keywords).toContain('clipboard');
    expect(cmd('export-clip').keywords).toContain('Copy image');
  });

  test('保存先の一覧は開くボタンを組まない', function() {
    expect(app.indexOf('folder-open-file')).toBe(-1);
    expect(app.indexOf('appendOpenHead(')).toBe(-1);
  });

  test('空の画面のボタンも同じ語', function() {
    expect(app).toContain("b.id = 'btn-open-file-empty';");
    var at = app.indexOf("b.id = 'btn-open-file-empty';");
    expect(app.slice(at, at + 200)).toContain("'ファイルを開く…'");
  });
});
