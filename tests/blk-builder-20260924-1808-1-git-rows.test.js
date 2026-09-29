'use strict';
// BLK-builder-20260924-1808-1 (design 10c): FILES ツリー下端の GIT 欄を、すぐ上のツリーの行と同じ形にする。
//   - 変更の行は「spi_transfer_sequence  M」(ツリーと同じ拡張子なしの名前、状態字は右)。以前は「M spi_transfer_sequence.puml」
//   - 履歴の見出しは「この図の履歴 spi_init_sequence」(どの図の履歴かを言う)。以前は「この図の履歴（2）」
//   - 中身はツリーの行と同じ字下げ (#files-body-git の padding が .files-sec-body の padding 0 に負けていた)

var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var GP = W.MA.gitPanel;

var html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'git-ui.js'), 'utf8');

describe('変更の行はツリーと同じ名前 (design 10c)', function() {
  test('拡張子を外した図の名前を出す (ツリーの行と同じ)', function() {
    expect(GP.changeName({ code: 'M', file: 'spi_transfer_sequence.puml', name: 'spi_transfer_sequence' }))
      .toBe('spi_transfer_sequence');
    expect(GP.changeName({ code: 'A', file: 'spi_new.PUML' })).toBe('spi_new');
  });

  test('保存先の下のフォルダにある図はフォルダ名を残す (SPI/spi_init_sequence)', function() {
    expect(GP.changeName({ code: 'M', file: 'SPI/spi_init_sequence.puml' })).toBe('SPI/spi_init_sequence');
  });

  test('.puml でないファイルは名前をそのまま出す', function() {
    expect(GP.changeName({ code: 'M', file: 'README.md' })).toBe('README.md');
    expect(GP.changeName(null)).toBe('');
  });

  test('行は名前が先、状態字が後 (ツリーの M と同じく右に出る)', function() {
    var body = ui.slice(ui.indexOf('function renderChanges'), ui.indexOf('function syncCommitBtn'));
    expect(body.indexOf("'git-change-name'")).toBeGreaterThan(0);
    expect(body.indexOf("'git-change-name'")).toBeLessThan(body.indexOf("'git-code git-code-'"));
    expect(body).toContain('gp.changeName(c)');
  });
});

describe('履歴の見出しは図の名前を言う (design 10c)', function() {
  test('「この図の履歴 spi_init_sequence」', function() {
    expect(GP.historyLabel('spi_init_sequence.puml')).toBe('この図の履歴 spi_init_sequence');
    expect(GP.historyLabel('spi_init_sequence')).toBe('この図の履歴 spi_init_sequence');
  });

  test('図を開いていなければ「この図の履歴」だけ', function() {
    expect(GP.historyLabel('')).toBe('この図の履歴');
    expect(GP.historyLabel(null)).toBe('この図の履歴');
  });

  test('git-ui は見出しに historyLabel を使う (件数は見出しに混ぜない)', function() {
    var body = ui.slice(ui.indexOf('function renderHistory'), ui.indexOf('function compareWith'));
    expect(body).toContain('gp.historyLabel(');
    expect(body).not.toContain("'この図の履歴' + (history.length");
  });
});

describe('GIT 欄の字下げ (design 10a / 10c)', function() {
  test('#files-panel .files-sec-body の padding 0 に負けない詳細度で、ツリーの行と同じ 16px 字下げ', function() {
    var i = html.indexOf('#files-panel #files-body-git {');
    expect(i).toBeGreaterThan(0);
    var rule = html.slice(i, html.indexOf('}', i));
    expect(rule).toContain('padding: 2px 8px 6px 16px');
  });

  test('変更の行の状態字は右端に寄せる', function() {
    var i = html.indexOf('#files-body-git .git-code {');
    var rule = html.slice(i, html.indexOf('}', i));
    expect(rule).toContain('margin-left: auto');
  });
});
