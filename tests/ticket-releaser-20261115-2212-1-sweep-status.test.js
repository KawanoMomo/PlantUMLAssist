'use strict';
// TICKET-releaser-20261115-2212-1: 図名を変えた直後に Ctrl+S すると、付け替え (前の自動保存を書き切ってから
// 前の名前のファイルを消す) の知らせが保存の「…に保存しました」より後に届き、下端の 1 行を上書きしていた。
// 付け替えの知らせは後ろに足す (appendSaveStatus)。保存したことの文言を消さない。

var fs = require('fs');
var path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

// _sweepRenamedFile(...).then(function(text) { ... }) の本体 (次の `});` まで) を全部取る。
function sweepHandlers() {
  var out = [];
  var re = /_sweepRenamedFile\([^)]*\)\.then\(function\(text\) \{([\s\S]*?)\n\s*\}\);/g;
  var m;
  while ((m = re.exec(SRC))) out.push(m[1]);
  return out;
}

describe('付け替えの知らせは保存の文言を上書きしない (TICKET-releaser-20261115-2212-1)', function() {
  test('付け替えの結果を受ける所は 2 か所 (タブ名・図の設定の図名欄)', function() {
    expect(sweepHandlers().length).toBe(2);
  });

  test('どちらも appendSaveStatus で後ろに足し、setSaveStatus で置き換えない', function() {
    sweepHandlers().forEach(function(body) {
      expect(/appendSaveStatus\(text\)/.test(body)).toBe(true);
      expect(/[^d]setSaveStatus\(text\)/.test(body)).toBe(false);
    });
  });

  test('appendSaveStatus は今の文言の後ろに ／ でつなぐ', function() {
    var m = /function appendSaveStatus\(msg\) \{([\s\S]*?)\n\}/.exec(SRC);
    expect(!!m).toBe(true);
    expect(m[1]).toContain("cur + ' ／ ' + msg");
  });
});
