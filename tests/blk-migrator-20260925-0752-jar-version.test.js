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

describe('PlantUML の既定版 (lib/fetch-plantuml)', function() {
  var ps1 = fs.readFileSync(path.join(LIB, 'fetch-plantuml.ps1'), 'utf8').match(/else \{ '(\d+\.\d+\.\d+)' \}/);
  var sh = fs.readFileSync(path.join(LIB, 'fetch-plantuml.sh'), 'utf8').match(/PLANTUML_VERSION:-(\d+\.\d+\.\d+)/);
  test('ps1 と sh の既定版がそろっている', function() {
    expect(!!ps1 && !!sh).toBe(true);
    expect(ps1[1]).toBe(sh[1]);
  });
  test('既定版は +package を読める 1.2026.3 以上', function() {
    expect(atLeast(ps1[1], '1.2026.3')).toBe(true);
  });
});
