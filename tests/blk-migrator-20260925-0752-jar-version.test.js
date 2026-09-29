'use strict';
// BLK-migrator-20260925-0752: 同梱・取得する PlantUML の既定版。1.2026.2 は `+package` (可視性付きの package 宣言、
// PlantUML 公式 issue #2846) を Syntax Error で拒むので、読める 1.2026.3 以上を既定にする (1.2026.8 は sequence・state の SVG の形が変わり、ホバー枠の spec が 10 件落ちるので上げすぎない)。ps1 と sh の既定はそろえる。
var fs = require('fs');
var path = require('path');
var LIB = path.join(__dirname, '..', 'lib');

function ver(s) { return s.split('.').map(Number); }
function atLeast(a, b) {
  var x = ver(a), y = ver(b);
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return true;
}

// BLK-human-20260925-1500: 既定版 (推奨版) は lib/PLANTUML_VERSION の 1 か所に置き、ps1 と sh はそこを読む。
// 1.2026.3〜.6 は並行領域を描かないので 1.2026.7 以上 (今は 1.2026.8)。
describe('PlantUML の既定版 (lib/fetch-plantuml)', function() {
  var pinned = fs.readFileSync(path.join(LIB, 'PLANTUML_VERSION'), 'utf8').trim();
  var ps1 = fs.readFileSync(path.join(LIB, 'fetch-plantuml.ps1'), 'utf8');
  var sh = fs.readFileSync(path.join(LIB, 'fetch-plantuml.sh'), 'utf8');
  test('ps1 と sh の既定版がそろっている (どちらも PLANTUML_VERSION を読む)', function() {
    expect(ps1.indexOf("'PLANTUML_VERSION'") >= 0).toBe(true);
    expect(sh.indexOf('/PLANTUML_VERSION"') >= 0).toBe(true);
  });
  test('既定版は +package を読め、並行領域も描ける 1.2026.7 以上', function() {
    expect(atLeast(pinned, '1.2026.3')).toBe(true);
    expect(atLeast(pinned, '1.2026.7')).toBe(true);
  });
});
