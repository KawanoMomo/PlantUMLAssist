'use strict';
// BLK-builder-20260924-1759-1 (design 9c): 下端の先頭「パース OK」も件数の札と同じ形にする。
// 9c「色は点だけ（緑＝正常、オレンジ＝要確認、赤＝崩れ）で、文字は全部同じ色」。
// 以前は「パース OK」だけが文字ごと緑、「パース NG · …」が文字ごと赤で、下端で文字に色を持つのはここだけだった。

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8');

function rule(selector) {
  var i = html.indexOf(selector + ' {');
  if (i < 0) return null;
  return html.slice(i, html.indexOf('}', i));
}

describe('下端の「パース OK」は点だけに色 (design 9c)', function() {
  test('文字は件数の札・N elements と同じ色 (緑・赤の文字にしない)', function() {
    expect(rule('#status-parse')).toContain('color: var(--text-secondary)');
    expect(html).not.toContain('#status-parse { color: var(--accent-green); }');
    expect(html).not.toContain('#status-parse.error { color: var(--accent-red); }');
  });

  test('点は件数の札と同じ ● で、正常は緑・書き損じは赤', function() {
    var dot = rule('#status-parse[data-dot]::before');
    expect(dot).not.toBeNull();
    expect(dot).toContain("content: '●'");
    expect(html).toContain('#status-parse[data-dot="ok"]::before { color: var(--accent-green); }');
    expect(html).toContain('#status-parse[data-dot="bad"]::before { color: var(--accent-red); }');
  });

  test('点は文字に含めない (「パース OK」の文言はそのまま読める)', function() {
    // ::before の content は textContent に入らないので、読み上げ・台本の文言は変わらない。
    expect(app).toContain("statusParseEl.textContent = 'パース OK';");
    expect(app).toContain("statusParseEl.textContent = 'パース NG · ' + e.message;");
  });

  test('パースの成否で点の色を切り替える', function() {
    var ok = app.indexOf("statusParseEl.textContent = 'パース OK';");
    var ng = app.indexOf("statusParseEl.textContent = 'パース NG · ' + e.message;");
    expect(app.slice(ok, ok + 300)).toContain("statusParseEl.setAttribute('data-dot', 'ok');");
    expect(app.slice(ng, ng + 300)).toContain("statusParseEl.setAttribute('data-dot', 'bad');");
  });
});
