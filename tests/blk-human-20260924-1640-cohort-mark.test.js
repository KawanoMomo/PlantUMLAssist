'use strict';
// BLK-human-20260924-1640: `-p junior,primary --cohort` のように絞った回だけで回される対象の組は、
// 無変化 tick の印 (unchangedStreak の mark) が一度も保存されず、毎回「今回が最初の控えです」に戻っていた。
// 印は図のファイル構成の指紋で指摘の中身とは独立しているので、絞った回でも印だけは書き戻す。
// 控えの report は今まで通り絞った回では書き替えない (BLK-reviewer-20260914-2206 の 3 件目の守り)。
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var AUDIT = path.resolve(__dirname, '..', 'tools', 'audit.js');
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-1640-'));
var A = path.join(root, 'junior');
var B = path.join(root, 'primary');
var STATE = path.join(root, '.assist-audit-last.json');

function puml(dir, name, body) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), '@startuml\n' + body + '\n@enduml\n', 'utf-8');
}
puml(A, 'cls.puml', 'class Spi_Driver {\n  +Spi_Init()\n}');
puml(A, 'seq.puml', 'participant Spi_Driver\nSpi_Driver -> Spi_Driver : Spi_Init()');
puml(B, 'cls.puml', 'class SpiDriver {\n  +Spi_Init()\n}');

// 控えは cwd に置かれるので、cwd を一時フォルダにしてリポジトリ直下の控えを踏まない。
// tick を名乗らない回にする (PUA_TICK が環境に残っていると同じ tick 扱いで数が進まない)。
function run(args) {
  var env = Object.assign({}, process.env);
  delete env.PUA_TICK;
  var r = cp.spawnSync(process.execPath, [AUDIT, A, B].concat(args), { cwd: root, encoding: 'utf-8', env: env });
  assert.strictEqual(r.status, 0, 'audit.js が落ちた: ' + (r.stderr || ''));
  return r.stdout;
}
function entry() {
  var store = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
  var keys = Object.keys(store.scopes || {});
  assert.strictEqual(keys.length, 1, '対象の組は 1 つ');
  return store.scopes[keys[0]];
}

try {
  // 1) 絞った回だけを 2 回続ける (reviewer の手順 4 の毎 tick)。
  var first = run(['--cohort']);
  assert.ok(first.indexOf('今回が最初の控え') >= 0, '1 回目は最初の控え:\n' + first);
  assert.ok(fs.existsSync(STATE), '絞った回でも印は書き戻す');
  assert.strictEqual(entry().report, null, '絞った回は控えの report を作らない');
  var second = run(['--cohort']);
  assert.ok(second.indexOf('変化の追跡: 今回が最初の控え') < 0, '2 回目が「最初の控え」に戻った:\n' + second);
  assert.ok(second.indexOf('1 回連続') >= 0, '2 回目は「1 回連続」で無変化を言う:\n' + second);

  // 2) 素の回で控えの report ができ、印は続きから数える。
  run(['--summary']);
  var full = entry();
  assert.ok(full.report && full.report.audits, '素の回は控えの report を書く');
  assert.strictEqual(full.mark.streak, 2, '素の回も絞った回の印の続きから数える');
  var savedAt = full.savedAt;
  var generatedAt = full.report.generatedAt;

  // 3) 絞った回を挟んでも、素の回の控え (report) は書き替わらず、印だけ進む。
  run(['--cohort']);
  var after = entry();
  assert.strictEqual(after.savedAt, savedAt, '絞った回で控えの時刻が書き替わった');
  assert.strictEqual(after.report.generatedAt, generatedAt, '絞った回で控えの report が書き替わった (2206 の守り)');
  assert.deepStrictEqual(Object.keys(after.report.audits).sort(), Object.keys(full.report.audits).sort(),
    '絞った回で控えの監査の範囲が狭まった (次の素の回で指摘が全件新規に出直す)');
  assert.strictEqual(after.mark.streak, 3, '絞った回でも印は進む');

  // 4) 次の素の回は、素の回の控えと比べる (指摘が全件「新規」に出直さない)。
  var plain = run(['--summary']);
  assert.ok(plain.indexOf('この対象の控えはありません') < 0, '素の回が控えを見失った:\n' + plain);

  // 5) 図を 1 枚触れば、絞った回でも 0 に戻る (黙って数え続けない)。
  puml(B, 'cls.puml', 'class SpiDriver {\n  +Spi_Init()\n  +Spi_Reset()\n}');
  var touched = run(['--cohort']);
  assert.ok(touched.indexOf('変化あり') >= 0, '図を触った回は「変化あり」と言う:\n' + touched);
  assert.strictEqual(entry().mark.streak, 0, '図を触った回は印が 0 に戻る');
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
}

console.log('blk-human-20260924-1640-cohort-mark: ok');
