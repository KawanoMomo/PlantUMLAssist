'use strict';
// TICKET-owner-20261115-2100-1: unit の入口 (tests/run-tests.js) は、describe / test を使わず
// 自前で数える test ファイルの赤 (`process.exitCode = 1` / `process.exit(1)` / 読み込みで投げる) も
// 失敗に数え、終了コードと最後の行に出す。子プロセスで入口を回して確かめる。
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var RUNNER = path.join(__dirname, 'run-tests.js');
var DIR = path.join(ROOT, 'test-results', 'unit-runner-self-red');

function write(name, body) {
  fs.mkdirSync(DIR, { recursive: true });
  var p = path.join(DIR, name);
  fs.writeFileSync(p, body);
  return p;
}

function run(files) {
  var r = cp.spawnSync(process.execPath, [RUNNER].concat(files), { encoding: 'utf8', cwd: ROOT });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// 自前で数える test の形 (tests/sequence-participant-zone.test.js と同じ)。red が真なら 1 件赤を足す。
function selfCounting(red) {
  return [
    "var results = [];",
    "function t(name, fn) { try { fn(); results.push({ ok: true }); } catch (e) { results.push({ ok: false }); } }",
    "t('緑の 1 件', function() {});",
    red ? "t('足した赤', function() { throw new Error('red'); });" : '',
    "var failed = results.filter(function(r) { return !r.ok; });",
    "console.log('  ' + (results.length - failed.length) + '/' + results.length + ' passed');",
    "if (failed.length) process.exitCode = 1;",
  ].join('\n');
}

var GREEN_DT = "describe('d', function() { test('後のファイルも回る', function() { expect(1).toBe(1); }); });";

describe('自前で数える test の赤を unit の入口が数える', function() {
  test('赤を 1 件足すと exit 1 になり、最後の行の failed とファイル名に出る', function() {
    var r = run([write('self-red.test.js', selfCounting(true))]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('0 passed, 1 failed');
    expect(r.out).toContain('赤のファイル: self-red.test.js (process.exitCode = 1)');
  });

  test('足した赤を外すと exit 0 に戻る', function() {
    var r = run([write('self-green.test.js', selfCounting(false))]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 passed, 0 failed');
    expect(r.out).not.toContain('赤のファイル');
  });

  test('process.exit(1) で終えるファイルも 1 件の赤に数え、後のファイルは続けて回す', function() {
    var a = write('exit-red.test.js', "console.log('x'); if (true) process.exit(1);");
    var b = write('after.test.js', GREEN_DT);
    var r = run([a, b]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 passed, 1 failed');
    expect(r.out).toContain('exit-red.test.js (process.exit(1))');
  });

  test('process.exit(0) で終えるファイルは赤にしない', function() {
    var r = run([write('exit-zero.test.js', "process.exit(0);"), write('after2.test.js', GREEN_DT)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 passed, 0 failed');
  });

  test('読み込みで投げたファイルも赤に数え、後のファイルは続けて回す', function() {
    var r = run([write('throw-red.test.js', "require('assert').strictEqual(1, 2);"), write('after3.test.js', GREEN_DT)]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 passed, 1 failed');
    expect(r.out).toContain('throw-red.test.js (読み込みで投げた');
  });

  test('describe / test の赤は今までどおり数える', function() {
    var r = run([write('dt-red.test.js', "describe('d', function() { test('赤', function() { expect(1).toBe(2); }); });")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('0 passed, 1 failed');
    expect(r.out).not.toContain('赤のファイル');
  });
});
