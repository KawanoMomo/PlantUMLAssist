'use strict';
// BLK-builder-20260924-1351-4 (design 10a / 9a): 「📂 一覧」は FILES ツリーの「保存先」に吸収され、
// 9a は 📂 の絵文字をやめた。利用者に見える文字 (ボタン・title・案内の文字列) が
// 今は無い「📂 一覧」を名指ししないことを守る。コメントの中の旧名 (経緯) は数えない。
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var FOLDER = '📂';   // 📂

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function jsFiles(dir) {
  var out = [];
  fs.readdirSync(path.join(ROOT, dir)).forEach(function(n) {
    var rel = dir + '/' + n;
    var st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) out = out.concat(jsFiles(rel));
    else if (/\.js$/.test(n)) out.push(rel);
  });
  return out;
}

// 1 行の文字列リテラル ('...' / "...") のうち 📂 を含むもの。行コメントの後ろは見ない。
function literalHits(src, rel) {
  var hits = [];
  src.split('\n').forEach(function(line, i) {
    var t = line.trim();
    if (/^(\/\/|\*|\/\*)/.test(t)) return;
    var code = line.replace(/\s\/\/\s.*$/, '');
    var re = /'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g;
    var m;
    while ((m = re.exec(code))) {
      if (m[0].indexOf(FOLDER) >= 0) hits.push(rel + ':' + (i + 1) + ' ' + m[0]);
    }
  });
  return hits;
}

describe('今は無い「📂 一覧」を画面の文字で名指ししない', () => {
  test('src の文字列リテラルに 📂 が無い', () => {
    var hits = [];
    jsFiles('src').forEach(function(rel) { hits = hits.concat(literalHits(read(rel), rel)); });
    expect(hits).toEqual([]);
  });

  test('HTML のボタンの文字と title に 📂 が無い (コメントは除く)', () => {
    var html = read('plantuml-assist.html').replace(/<!--[\s\S]*?-->/g, '');
    var hits = [];
    var re = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
    var m;
    while ((m = re.exec(html))) {
      if (m[0].indexOf(FOLDER) >= 0) hits.push(m[0].slice(0, 120));
    }
    var reT = /title="([^"]*)"/g;
    while ((m = reT.exec(html))) {
      if (m[1].indexOf(FOLDER) >= 0) hits.push(m[0]);
    }
    expect(hits).toEqual([]);
  });

  // 1 枚を資料化の窓 (mexp) は TICKET-owner-20261116-0140-prune で外した。
  test('資料化の書き出し結果の窓は無い', () => {
    var html = read('plantuml-assist.html');
    expect(html.indexOf('id="mexp-result-open"')).toBe(-1);
  });
});
