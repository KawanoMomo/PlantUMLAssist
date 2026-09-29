'use strict';
// BLK-builder-20260924-1836-2 (design 10c): コミットと並べている比較の枠の見出しは
// 「差分だけ / 並べて比較」の 2 択 (据え置く / 1 回だけ と同じ形)。既定は並べて比較。
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8');
var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf-8');

describe('差分だけ / 並べて比較 (plantuml-assist.html)', function() {
  var m = /<span id="senior-git-view"[^>]*>([\s\S]*?)<\/span>/.exec(html);
  test('2 つの押しボタンが 1 つの組に並ぶ (差分だけ → 並べて比較)', function() {
    expect(!!m).toBe(true);
    var labels = [];
    m[1].replace(/<button[^>]*>([^<]*)<\/button>/g, function(_, t) { labels.push(t); return _; });
    expect(labels).toEqual(['差分だけ', '並べて比較']);
  });
  test('既定は並べて比較が押されている', function() {
    expect(/id="senior-git-sbs"[^>]*aria-pressed="true"/.test(m[1])).toBe(true);
    expect(/id="senior-git-diffonly"[^>]*aria-pressed="false"/.test(m[1])).toBe(true);
  });
  test('組は Git の見出し (#senior-git) の中にある', function() {
    expect(/id="senior-git"[\s\S]*?id="senior-git-view"[\s\S]*?<\/div>/.test(html)).toBe(true);
  });
  test('見た目は据え置く / 1 回だけと同じ (押している方だけ地色、隣と枠線を共有)', function() {
    expect(/#senior-git #senior-git-view button\[aria-pressed="true"\]\s*\{[^}]*background: var\(--bg-primary\)/.test(html)).toBe(true);
    expect(/#senior-git #senior-git-view button \+ button\s*\{[^}]*border-left: none/.test(html)).toBe(true);
  });
});

describe('切り替え (src/app.js)', function() {
  test('押した方にする (裏返さない)', function() {
    expect(/g\.diffOnly\.addEventListener\('click', function\(\) \{ setSeniorGitView\(true\); \}\)/.test(app)).toBe(true);
    expect(/g\.sbs\.addEventListener\('click', function\(\) \{ setSeniorGitView\(false\); \}\)/.test(app)).toBe(true);
    expect(app).not.toContain('_seniorGit.diffOnly = !_seniorGit.diffOnly');
  });
  test('2 つの印はいつも片方だけ', function() {
    var f = /function _paintSeniorGitView\(\) \{([\s\S]*?)\n\}/.exec(app);
    expect(!!f).toBe(true);
    expect(f[1]).toContain("g.diffOnly.setAttribute('aria-pressed', on ? 'true' : 'false')");
    expect(f[1]).toContain("g.sbs.setAttribute('aria-pressed', on ? 'false' : 'true')");
  });
});
