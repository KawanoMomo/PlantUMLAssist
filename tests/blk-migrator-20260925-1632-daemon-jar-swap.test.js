'use strict';
// BLK-migrator-20260925-1632: 走っている描画 daemon (常駐 JVM) が掴んでいる plantuml.jar を同じ場所で置き換えると
// (「公式から取得」・手での差し替え・版上げ)、daemon はまだ読んでいないクラスを新しい中身から読めず
// 「NoClassDefFoundError: .../CrashReportHandler」のような答えを返し、図が描けなくなっていた (seq-15 の par/else)。
//   1. 描画のたびに jar の実体 (パス・更新時刻・サイズ) を見て、daemon を起こした時と違えば捨てて起こし直す
//   2. daemon の答えがクラスの読み込み失敗 (NoClassDefFoundError / ClassNotFoundException / ZipException) なら
//      daemon を捨てて 1 回だけ -pipe で描き直す。ふつうの PlantUML のエラー (構文) は描き直さない
// を、実際に server.py を読み込み、本物の jar と Java で確かめる。一時の jar は test-results/ 配下に置く。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcJar = path.join(projectRoot, 'lib', 'plantuml.jar');
const work = path.join(projectRoot, 'test-results', 'blk-migrator-20260925-1632');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, shutil, zipfile',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    `SRC = r"${srcJar}"`,
    `WORK = r"${work}"`,
    'os.makedirs(WORK, exist_ok=True)',
    'PAR = "@startuml\\nparticipant Core\\nparticipant TaskA\\nparticipant TaskB\\npar p\\n  Core -> TaskA : A()\\nelse\\n  Core -> TaskB : B()\\nend\\n@enduml\\n"',
    'SIMPLE = "@startuml\\nAlice -> Bob : hi\\n@enduml\\n"',
    'def txt(r):',
    '    svg, err = r',
    '    return {"svg": bool(svg) and b"<svg" in svg, "err": err or "", "A": bool(svg) and b"A()" in svg, "B": bool(svg) and b"B()" in svg}',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot, encoding: 'utf8', timeout: 180000,
  }).trim().split('\n').pop().trim();  // server.py が stdout に書く診断の行は読み飛ばし、最後の JSON だけを読む
}

const haveJava = (() => {
  try { execFileSync('java', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
})();
const haveJar = fs.existsSync(srcJar);

describe('描画中の daemon の jar を置き換えても次の描画が落ちない (BLK-migrator-20260925-1632)', () => {
  if (!haveJava || !haveJar) {
    test('Java と lib/plantuml.jar が無い環境では実物の確認を省く', () => { expect(true).toBe(true); });
    return;
  }

  test('走っている daemon の jar を別の中身に置き換えても、par/else の最小再現が SVG で返る', () => {
    const out = JSON.parse(runPython([
      'jar = os.path.join(WORK, "swap.jar")',
      'shutil.copyfile(SRC, jar)',
      'srv.jar_path = lambda: srv.Path(jar)',
      // 1 回目は簡単な図だけ描かせる (par/else のクラスはまだ読んでいない daemon を作る)。
      'first = txt(srv.render_local(SIMPLE))',
      'pid1 = srv._daemon_proc.pid if srv._daemon_proc else None',
      // 同じ中身の項目を逆順に詰め直した jar = 版上げと同じく「中の位置が全部ずれた」別の jar。同じ場所に上書きする。
      'other = os.path.join(WORK, "swap-other.jar")',
      'with zipfile.ZipFile(SRC) as zin, zipfile.ZipFile(other, "w") as zout:',
      '    for info in reversed(zin.infolist()):',
      '        zout.writestr(info, zin.read(info.filename))',
      'with open(other, "rb") as f_in, open(jar, "r+b") as f_out:',
      '    f_out.truncate(0); shutil.copyfileobj(f_in, f_out)',
      'second = txt(srv.render_local(PAR))',
      'pid2 = srv._daemon_proc.pid if srv._daemon_proc else None',
      'srv._shutdown_daemon()',
      'print(json.dumps({"first": first, "second": second, "pid1": pid1, "pid2": pid2}))',
    ]));
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* 残っても test-results 配下 */ }
    expect(out.first.svg).toBe(true);
    expect(out.pid1).not.toBe(null);
    expect(out.second.err).toBe('');
    expect(out.second.svg).toBe(true);
    expect(out.second.A && out.second.B).toBe(true);
    // jar の実体が変わったので、古い jar を掴んだ daemon は捨てて起こし直している。
    expect(out.pid2).not.toBe(null);
    expect(out.pid2).not.toBe(out.pid1);
  });

  test('daemon がクラスを読めない答えを返したら、daemon を捨てて 1 回だけ描き直す', () => {
    const out = JSON.parse(runPython([
      'srv.jar_path = lambda: srv.Path(SRC)',
      'calls = {"pipe": 0}',
      'real_pipe = srv._render_via_pipe',
      'def counting_pipe(text, base_dir=None):',
      '    calls["pipe"] += 1',
      '    return real_pipe(text, base_dir)',
      'srv._render_via_pipe = counting_pipe',
      'res = {}',
      'for name, msg in [("ncdfe", "PlantUML error: java.lang.NoClassDefFoundError: net/sourceforge/plantuml/crash/CrashReportHandler"),',
      '                  ("cnfe", "PlantUML error: java.lang.ClassNotFoundException: net.sourceforge.plantuml.X"),',
      '                  ("zip", "PlantUML error: java.util.zip.ZipException: invalid LOC header (bad signature)")]:',
      '    srv._render_via_daemon = lambda text, base_dir=None, m=msg: (None, m)',
      '    before = calls["pipe"]',
      '    r = txt(srv.render_local(PAR))',
      '    r["pipe"] = calls["pipe"] - before',
      '    res[name] = r',
      // ふつうの PlantUML のエラー (構文) は描き直さず、そのまま返す。
      'srv._render_via_daemon = lambda text, base_dir=None: (None, "PlantUML error: Syntax Error? (line 3)")',
      'before = calls["pipe"]',
      'r = txt(srv.render_local(PAR))',
      'r["pipe"] = calls["pipe"] - before',
      'res["syntax"] = r',
      'srv._shutdown_daemon()',
      'print(json.dumps(res))',
    ]));
    ['ncdfe', 'cnfe', 'zip'].forEach((k) => {
      expect(out[k].pipe).toBe(1);
      expect(out[k].err).toBe('');
      expect(out[k].svg && out[k].A && out[k].B).toBe(true);
    });
    expect(out.syntax.pipe).toBe(0);
    expect(out.syntax.err).toContain('Syntax Error');
  });
});
