'use strict';
// BLK-builder-20260924-2344-3 (design 10c「ブランチ・変更ファイル（M / A / D）・コミットはここで済みます」):
// GIT 欄の「変更 2」の行を押しても何も起きなかった (名前と状態字を出すだけの div)。
// 押すとその図を開き (ツリーの行を押したのと同じ道)、M の図は最後のコミットを右の枠に並べる。
// D (消した図) と保存先の外のファイルは開けないので押せる見た目にしない。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

function load(W, f) {
  global.window = W;
  global.document = W.document;
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
}
function restore() { global.window = prevWindow; global.document = prevDocument; }

// その場で答える thenable (この runner は Promise を待たないので、描いた結果をその場で読む)。
function sync(v) {
  if (v && v.__sync) return v;
  return {
    __sync: true,
    then: function(ok) { var r = ok ? ok(v) : v; return (r && r.__sync) ? r : sync(r); },
    'catch': function() { return this; },
  };
}

var STATUS = {
  repo: true, branch: 'main', ahead: 0, behind: 0,
  changes: [
    { code: 'M', file: 'spi_init_sequence.puml', name: 'spi_init_sequence' },
    { code: 'A', file: 'spi_transfer_sequence.puml' },
    { code: 'D', file: 'old_state.puml', name: 'old_state' },
    { code: 'M', file: 'docs/README.md' },
  ],
};

function boot(opened) {
  var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
  var start = html.indexOf('<section class="files-sec" data-files-section="git">');
  var end = html.indexOf('</section>', start) + '</section>'.length;
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="files-panel">' + html.slice(start, end) +
    '</div><div id="folder-panel"></div></body></html>', { url: 'http://127.0.0.1/' });
  var W = dom.window;
  W.MA = {};
  W.fetch = function(url) {
    var body = /^\/git-status/.test(url) ? STATUS : { commits: [] };
    return sync({ ok: true, json: function() { return sync(body); } });
  };
  var active = 'diagram1';
  W.MA.appGit = {
    activeName: function() { return active; },
    fileDir: function() { return 'D:/pd/junior'; },
    current: function() { return null; },
    compare: function() { return true; },
    versions: function() { return Promise.resolve([]); },
    lineCount: function() { return Promise.resolve(null); },
  };
  ['spi_init_sequence', 'spi_transfer_sequence'].forEach(function(n) {
    var it = W.document.createElement('div');
    it.className = 'folder-item';
    it.setAttribute('data-file-name', n);
    it.addEventListener('click', function() { opened.push(n); active = n; });
    W.document.getElementById('folder-panel').appendChild(it);
  });
  load(W, '../src/core/git-panel.js');
  load(W, '../src/ui/git-ui.js');
  W.MA.gitUi.init();
  return W;
}

describe('変更の行を押して開く図 (design 10c)', function() {
  var GP = (typeof window !== 'undefined' && window.MA && window.MA.gitPanel) || null;
  test('M は開いて最後のコミットと並べる、A は開くだけ、D と保存先の外は開かない', function() {
    expect(GP.changeOpen({ code: 'M', file: 'spi_init_sequence.puml', name: 'spi_init_sequence' }))
      .toEqual({ name: 'spi_init_sequence', compare: true, title: 'spi_init_sequence を開いて、最後のコミットと並べる' });
    var a = GP.changeOpen({ code: 'A', file: 'spi_transfer_sequence.puml' });
    expect(a.name).toBe('spi_transfer_sequence');
    expect(a.compare).toBe(false);
    expect(a.title).toBe('spi_transfer_sequence を開く');
    expect(GP.changeOpen({ code: 'D', file: 'old_state.puml', name: 'old_state' })).toBe(null);
    // 保存先の下の別フォルダ (名前を server が付けない) は、ツリーの図として開けない
    expect(GP.changeOpen({ code: 'M', file: 'docs/README.md' })).toBe(null);
    expect(GP.changeOpen(null)).toBe(null);
  });
});

describe('変更の行を描いて押す (design 10c)', function() {
  test('開ける行だけが button になり、押すとツリーの行と同じ道 (保存先の一覧の行) で開く', function() {
    var opened = [];
    var W = boot(opened);
    try {
      var rows = W.document.querySelectorAll('#git-changes .git-change');
      expect(rows.length).toBe(4);
      var byFile = {};
      Array.prototype.forEach.call(rows, function(r) { byFile[r.getAttribute('data-file')] = r; });
      expect(byFile['spi_init_sequence.puml'].tagName).toBe('BUTTON');
      expect(byFile['spi_init_sequence.puml'].getAttribute('data-open')).toBe('spi_init_sequence');
      expect(byFile['spi_init_sequence.puml'].title).toContain('最後のコミットと並べる');
      expect(byFile['spi_transfer_sequence.puml'].tagName).toBe('BUTTON');
      expect(byFile['old_state.puml'].tagName).toBe('DIV');
      expect(byFile['docs/README.md'].tagName).toBe('DIV');
      // 名前と状態字の並びは今までどおり (名前が先、状態字が右)
      expect(byFile['spi_transfer_sequence.puml'].textContent).toBe('spi_transfer_sequenceA');

      byFile['spi_transfer_sequence.puml'].click();
      expect(opened).toEqual(['spi_transfer_sequence']);
      byFile['spi_init_sequence.puml'].click();
      expect(opened).toEqual(['spi_transfer_sequence', 'spi_init_sequence']);
    } finally { restore(); }
  });

  test('開いている図の行を押しても、開き直さない (一覧の行を押し直さない)', function() {
    var opened = [];
    var W = boot(opened);
    try {
      var row = W.document.querySelector('#git-changes .git-change[data-open="spi_init_sequence"]');
      row.click();
      row = W.document.querySelector('#git-changes .git-change[data-open="spi_init_sequence"]');
      row.click();
      expect(opened).toEqual(['spi_init_sequence']);
    } finally { restore(); }
  });

  test('押せる行はボタンの見た目を消して、手を置くと下地が付く', function() {
    var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
    var i = html.indexOf('#files-body-git button.git-change {');
    expect(i).toBeGreaterThan(0);
    var rule = html.slice(i, html.indexOf('}', i));
    expect(rule).toContain('cursor: pointer');
    expect(rule).toContain('border: none');
    expect(html).toContain('#files-body-git button.git-change:hover');
  });
});
