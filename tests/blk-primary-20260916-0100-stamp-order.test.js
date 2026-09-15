'use strict';
// BLK-primary-20260916-0100: 同じ秒に 2 回以上保存すると刻印に `.2` `.18` のような
// 連番が付く。これを文字列のまま並べると `.2` が `.18` より新しいことになり、
// 一覧の「新しい順」が嘘になるだけでなく、上限を超えた分を捨てるときに
// **どれが古いのかを取り違えて、まだ中身のある版を先に捨てる**。連番は数として読む。
const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, tempfile, pathlib',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'H = srv.Handler',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], { encoding: 'utf-8', cwd: projectRoot });
}

describe('BLK-primary-20260916-0100 版の刻印の並び', function() {
  test('連番つきの刻印が、数として新しい順に並ぶ', function() {
    const out = runPython([
      'stamps = ["20260914-001159", "20260914-001159.2", "20260914-001159.9",',
      '          "20260914-001159.10", "20260914-001159.18", "20260914-001159.20"]',
      'stamps.sort(key=H._stamp_key, reverse=True)',
      'print(json.dumps(stamps))',
    ]);
    assert.deepStrictEqual(JSON.parse(out.trim()), [
      '20260914-001159.20', '20260914-001159.18', '20260914-001159.10',
      '20260914-001159.9', '20260914-001159.2', '20260914-001159',
    ]);
  });

  test('日付をまたぐ刻印の順は変わらない', function() {
    const out = runPython([
      'stamps = ["20260914-201005", "20260915-140335", "20260915-140335.1", "20260914-001159.9"]',
      'stamps.sort(key=H._stamp_key, reverse=True)',
      'print(json.dumps(stamps))',
    ]);
    assert.deepStrictEqual(JSON.parse(out.trim()), [
      '20260915-140335.1', '20260915-140335', '20260914-201005', '20260914-001159.9',
    ]);
  });

  test('読めない連番が混ざっても落ちない', function() {
    const out = runPython([
      'stamps = ["20260914-001159.x", "20260914-001159.2", "20260914-001159"]',
      'stamps.sort(key=H._stamp_key, reverse=True)',
      'print(json.dumps(stamps))',
    ]);
    const got = JSON.parse(out.trim());
    assert.strictEqual(got.length, 3);
    assert.strictEqual(got[0], '20260914-001159.2');
  });

  test('上限を超えた版を捨てるとき、捨てられるのは数として一番古いもの', function() {
    // 連番 1..25 の控えを作り、20 件に落ちたあと何が残るかを見る。
    // 文字列順だと .1 .10 .11 … が先に消え、.9 が生き残っていた。
    const out = runPython([
      'tmp = pathlib.Path(tempfile.mkdtemp())',
      'vdir = tmp / "_versions"',
      'vdir.mkdir()',
      'name = "driver_common_class"',
      'for n in range(1, 26):',
      '    (vdir / ("%s--20260914-001159.%d.puml" % (name, n))).write_text("x", encoding="utf-8")',
      'inst = H.__new__(H)',
      'stamps = inst._version_stamps(tmp, name)',
      'for old in stamps[H.VERSIONS_KEEP:]:',
      '    inst._version_path(tmp, name, old).unlink()',
      'left = sorted(int(s.split(".")[1]) for s in inst._version_stamps(tmp, name))',
      'print(json.dumps(left))',
    ]);
    const left = JSON.parse(out.trim());
    assert.strictEqual(left.length, 20);
    // 残るのは 6..25 (新しい 20 件)。1..5 が捨てられる。
    assert.strictEqual(left[0], 6);
    assert.strictEqual(left[left.length - 1], 25);
  });
});
