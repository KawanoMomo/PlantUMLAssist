'use strict';
// BLK-junior-20260924-1632-wish: 「指摘.md の反映状況」(保存先の一覧の行の 対象外 / ⚠確かめられず / ✅反映済み) は
// 一覧が保存先の右クリックの奥に移ってから、場面 2 の往復の途中で目に入らなかった。
// FILES ツリーの図の行と部品のフォルダの見出しに同じ札を出し、札を押すと図を開いて指摘の語を選ぶ。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div>';

function restore() { global.window = prevWindow; global.document = prevDocument; }

function load(W, f) {
  global.window = W;
  global.document = W.document;
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
}

function fresh() {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
  var W = dom.window;
  W.MA = {};
  ['../src/core/component-pack.js', '../src/core/review-note.js', '../src/core/finding-actions.js',
   '../src/core/finding-variant.js', '../src/core/note-board.js', '../src/core/file-tree.js']
    .forEach(function(f) { load(W, f); });
  return W;
}

var ROW = {
  id: 'n1', index: 1, heading: 'gpio_init_sequence の部品名不一致',
  text: '## 【継続】gpio_init_sequence の部品名不一致\njunior 側 `Gpio`(2行のみ)/ primary 側 `Gpio_Driver` 詳細化、のまますり合わせ未反映。',
};
var MINE = '@startuml\nparticipant Gpio\nparticipant Hw_Ctrl\nGpio -> Hw_Ctrl : Gpio_Init\n@enduml';

describe('反映状況の札が、指摘の見出しと指す語を持つ', function() {
  test('まだ直っていない図は ⚠ で、見出しと本文に残る古い綴りを返す', function() {
    var W = fresh();
    try {
      var NB = W.MA.noteBoard;
      var st = NB.statusOf({ hits: [{ id: 'n1', head: ROW.heading, why: 'name', row: ROW }], dsl: MINE, mineFolder: 'junior' });
      expect(st.key).toBe('todo');
      expect(st.head).toBe('gpio_init_sequence の部品名不一致');
      expect(st.term).toBe('Gpio');
      expect(st.open).toBe(1);
    } finally { restore(); }
  });

  test('直した図は ✓ で、見出し・語を持たない', function() {
    var W = fresh();
    try {
      var fixed = MINE.split('Gpio ').join('Gpio_Driver ').replace('participant Gpio\n', 'participant Gpio_Driver\n');
      var st = W.MA.noteBoard.statusOf({ hits: [{ id: 'n1', head: ROW.heading, why: 'name', row: ROW }], dsl: fixed, mineFolder: 'junior' });
      expect(st.key).toBe('done');
      expect(st.head).toBe('');
      expect(st.term).toBe('');
    } finally { restore(); }
  });

  test('termIn: 括った語のうち本文に語として出る最初の 1 つ。無ければ空', function() {
    var W = fresh();
    try {
      var NB = W.MA.noteBoard;
      expect(NB.termIn('`Uart_Init` と `Gpio` を見てください', MINE)).toBe('Gpio');
      expect(NB.termIn('`Gpio_Driver` に揃えてください', MINE)).toBe('');
      expect(NB.termIn('語の無い指摘', MINE)).toBe('');
      expect(NB.termIn('`Gpio`', '')).toBe('');
    } finally { restore(); }
  });
});

describe('FILES ツリーの図の行と部品のフォルダに札を出す', function() {
  var opened;
  function boot() {
    var W = fresh();
    opened = [];
    W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
    W.MA.openNoteFinding = function(name, term) { opened.push([name, term]); return true; };
    var fp = W.document.getElementById('folder-panel');
    fp.className = 'open';
    function row(name, kind, badge) {
      return '<div class="folder-row"><button class="folder-item" data-file-name="' + name + '" data-content-kind="' + kind + '"></button>'
        + (badge || '') + '</div>';
    }
    fp.innerHTML = row('gpio_init_sequence', 'sequence',
        '<span class="folder-note-badge folder-note-todo" data-note-of="gpio_init_sequence" data-note-status="todo"'
        + ' data-note-head="gpio_init_sequence の部品名不一致" data-note-term="Gpio" data-note-open="2">⚠確かめられず</span>')
      + row('gpio_component', 'component',
        '<span class="folder-note-badge folder-note-off" data-note-status="off">対象外</span>')
      + row('gpio_class', 'class',
        '<span class="folder-note-badge folder-note-done" data-note-status="done">✓反映済み</span>')
      + row('gpio_state', 'state', '')
      + row('can_state', 'state', '');
    // 指摘.md とは別の「未反映」(reviewer の依頼の反映状態) だけが付いた図
    var it = fp.querySelector('.folder-item[data-file-name="gpio_state"]');
    it.innerHTML = '<span class="folder-review-badge" data-review-state="pending">未反映</span>';
    load(W, '../src/ui/files-panel.js');
    W.MA.filesPanel.init();
    W.MA.filesPanel.renderParts();
    return W;
  }
  function fileRow(W, name) { return W.document.querySelector('#files-parts .files-part-file[data-file-name="' + name + '"]'); }

  test('確かめられない指摘がある図だけに ⚠確かめられず を出す (対象外・反映済みには出さない)', function() {
    var W = boot();
    try {
      var note = fileRow(W, 'gpio_init_sequence').querySelector('.files-row-note');
      expect(note.textContent).toBe('⚠確かめられず');
      expect(fileRow(W, 'gpio_component').querySelector('.files-row-note')).toBe(null);
      expect(fileRow(W, 'gpio_class').querySelector('.files-row-note')).toBe(null);
      expect(fileRow(W, 'gpio_state').querySelector('.files-row-note')).toBe(null);
    } finally { restore(); }
  });

  test('札の title に指摘の 1 行目 (見出し) と件数、押すと選ぶ語を出す', function() {
    var W = boot();
    try {
      var t = fileRow(W, 'gpio_init_sequence').querySelector('.files-row-note').title;
      expect(t).toContain('gpio_init_sequence の部品名不一致');
      expect(t).toContain('ほか 1 件');
      expect(t).toContain('「Gpio」');
    } finally { restore(); }
  });

  test('部品のフォルダの見出しに札の付いた図の数を同じ語で出し、図 1 枚は 1 回だけ数える', function() {
    var W = boot();
    try {
      var gpio = W.document.querySelector('#files-parts .files-part-head[data-part="gpio"]');
      expect(gpio.getAttribute('data-part-notes')).toBe('⚠確かめられず 1 · 未反映 1');
      var can = W.document.querySelector('#files-parts .files-part-head[data-part="can"]');
      expect(can.getAttribute('data-part-notes')).toBe(null);
      expect(can.querySelector('.files-part-note')).toBe(null);
    } finally { restore(); }
  });

  test('札を押すと、その図と指摘の語で開きに行く (行のクリックとは別に 1 回だけ)', function() {
    var W = boot();
    try {
      var clicked = 0;
      W.document.querySelector('#folder-panel .folder-item[data-file-name="gpio_init_sequence"]')
        .addEventListener('click', function() { clicked++; });
      fileRow(W, 'gpio_init_sequence').querySelector('.files-row-note')
        .dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
      expect(opened).toEqual([['gpio_init_sequence', 'Gpio']]);
      expect(clicked).toBe(0);
    } finally { restore(); }
  });
});
