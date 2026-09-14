'use strict';
// BLK-reviewer-20260914-2206: 症状そのものを CLI で押さえる。
// 「対象 A で 1 回打つ → 対象 B で 1 回打つ → 対象 A で打ち直す」で、A の図を
// 1 バイトも触っていないのに「前回控えから変わった図 N 枚」が出ていた。
// 控えを対象ごとに分けた後は、B を挟んでも A は 0 枚のままでなければならない。
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var AUDIT = path.resolve(__dirname, '..', 'tools', 'audit.js');
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-2206-'));
var A = path.join(root, 'a');
var B = path.join(root, 'b');

function puml(dir, name, body) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), '@startuml\n' + body + '\n@enduml\n', 'utf-8');
}
puml(A, 'cls.puml', 'class Spi_Driver {\n  +Spi_Init()\n}');
puml(A, 'seq.puml', 'participant Spi_Driver\nSpi_Driver -> Spi_Driver : Spi_Init()');
puml(B, 'other.puml', 'class Can_Driver {\n  +Can_Init()\n}');

// 控えは CLI を打つ場所 (cwd) に置かれるので、cwd も一時フォルダにして
// リポジトリ直下の控えを踏まない (踏むと reviewer の次の run を汚す)。
function board(dir) {
  var r = cp.spawnSync(process.execPath, [AUDIT, dir, '--board'], {
    cwd: root, encoding: 'utf-8', env: Object.assign({}, process.env),
  });
  assert.strictEqual(r.status, 0, 'audit.js が落ちた: ' + (r.stderr || ''));
  return r.stdout;
}

function changedCount(out) {
  var m = out.match(/前回控えから変わった図（(\d+) 枚）/);
  assert.ok(m, '「前回控えから変わった図」の行が無い:\n' + out);
  return Number(m[1]);
}

try {
  board(A);                       // 1 回目: A の控えができる
  var first = board(A);           // 2 回目: 触っていないので 0 枚
  assert.strictEqual(changedCount(first), 0, '触っていない回で変わった図が出た');

  board(B);                       // 別の対象を挟む (reviewer の毎 tick の手順)
  var after = board(A);
  assert.strictEqual(changedCount(after), 0,
    '別の対象を挟んだだけで A の図が「変わった」と出た (控えを共有しているのが根)');
  assert.ok(after.indexOf('前回控え:') >= 0, '何と比べた数字かを 1 行で言う');
  assert.ok(after.indexOf(A) >= 0, '控えがどの対象の物かを名指しする');

  // B 側も自分の前回とだけ比べる (A を挟んでも 0 枚)。
  assert.strictEqual(changedCount(board(B)), 0, 'B も自分の前回と比べ続けられる');

  // 実際に 1 枚触れば、ちゃんと 1 枚出る (黙って 0 枚にする実装になっていない)。
  puml(A, 'cls.puml', 'class Spi_Driver {\n  +Spi_Init()\n  +Spi_Reset()\n}');
  var touched = board(A);
  assert.strictEqual(changedCount(touched), 1, '本当に変えた 1 枚は出る');
  assert.ok(touched.indexOf('cls.puml') >= 0, '変わった図を名指しする');
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
}

console.log('blk-reviewer-20260914-2206-board-scope-cli: ok');
