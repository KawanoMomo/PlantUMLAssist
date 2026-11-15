'use strict';
// scripts/verify.ps1 から呼ぶ集計。Playwright の JSON レポートを summary.json にまとめる。
//   node scripts/verify-summary.js <outDir> scenarios=<report.json> [e2e=<report.json>]
// summary.json:
//   passed / failed / skipped / total   … 回した全部 (scenario + e2e)。flaky (再試行で緑) は passed に数える
//   scenarios: { passed, failed, skipped, total }
//   e2e:       { passed, failed, skipped, total } か null (回していない)
//   failedNames: ["tests/scenarios/x.spec.js:12 › タイトル", …]
//   failedFiles: ["tests/e2e/legacy/x.spec.js", …] (赤のあった spec ファイル。重複なし)
//   tests: scenario は全件、e2e は赤と flaky (再試行で緑。負荷の疑い) だけ。
//          { kind, file, line, title, status, ms, renderMs, diffLines, error }
//          renderMs = 操作から描画までの ms、diffLines = 1 操作で PlantUML 本文の動いた行数
//          (scenario が testInfo.annotations に積んだ値。複数あれば最大)
//   renderMsMax / diffLinesMax … scenario 全体の最大
// レポートが無い・読めない (Playwright が起動しなかった) ときはその種別を failed 1 として数える。
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const outDir = process.argv[2];
const reports = {};
for (const a of process.argv.slice(3)) {
  const i = a.indexOf('=');
  if (i > 0) reports[a.slice(0, i)] = a.slice(i + 1);
}

function walkSuites(suites, file, out) {
  for (const s of suites || []) {
    const f = s.file || file;
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) out.push({ spec, test: t, file: spec.file || f });
    }
    walkSuites(s.suites, f, out);
  }
  return out;
}

function numAnn(anns, type) {
  let v = null;
  for (const a of anns || []) {
    if (a && a.type === type && a.description !== undefined && a.description !== '') {
      const n = Number(a.description);
      if (!Number.isNaN(n)) v = v === null ? n : Math.max(v, n);
    }
  }
  return v;
}

function collect(kind, reportPath) {
  const c = { passed: 0, failed: 0, skipped: 0, total: 0, tests: [], error: null };
  let j;
  try {
    j = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (e) {
    c.failed = 1; c.total = 1;
    c.error = 'report unreadable: ' + String(e.message || e).split('\n')[0];
    c.tests.push({ kind, file: reportPath, line: 0, title: '(Playwright report missing)', status: 'failed', error: c.error });
    return c;
  }
  for (const e of j.errors || []) {
    // 読み込み時の例外 (spec の構文エラー・globalSetup の失敗等) はテストに数えられないので赤として足す
    c.failed++; c.total++;
    c.tests.push({ kind, file: (e.location && e.location.file) || '', line: (e.location && e.location.line) || 0,
      title: '(load error)', status: 'failed', error: String(e.message || '').replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 300) });
  }
  // spec.file は config の rootDir (= config の testDir) からの相対。リポジトリからの相対 (tests/scenarios/x.spec.js) に直す
  const rootDir = (j.config && j.config.rootDir) || '';
  for (const { spec, test, file: specFile } of walkSuites(j.suites, '', [])) {
    const file = rootDir && specFile ? path.relative(REPO, path.resolve(rootDir, specFile)) : String(specFile || '');
    const results = test.results || [];
    const last = results[results.length - 1] || {};
    let status;
    if (test.status === 'skipped') status = 'skipped';
    else if (test.status === 'expected' || test.status === 'flaky') status = 'passed';
    else status = 'failed';
    c.total++;
    c[status]++;
    const anns = [].concat(test.annotations || [], ...results.map((r) => r.annotations || []));
    const err = (last.errors && last.errors[0]) || last.error;
    const entry = {
      kind,
      file: file.split(path.sep).join('/'),
      line: spec.line || 0,
      title: spec.title,
      status,
      flaky: test.status === 'flaky' || undefined,
      ms: last.duration === undefined ? null : last.duration,
      renderMs: numAnn(anns, 'renderMs'),
      diffLines: numAnn(anns, 'diffLines'),
      error: err ? String(err.message || err.value || '').replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 3).join(' ').slice(0, 300) : undefined,
    };
    if (kind === 'scenario' || status === 'failed' || entry.flaky) c.tests.push(entry);
  }
  return c;
}

const sc = reports.scenarios ? collect('scenario', reports.scenarios) : null;
const e2 = reports.e2e ? collect('e2e', reports.e2e) : null;
const parts = [sc, e2].filter(Boolean);
const sum = (k) => parts.reduce((n, p) => n + p[k], 0);
const tests = [].concat(...parts.map((p) => p.tests));
const pick = (p) => p ? { passed: p.passed, failed: p.failed, skipped: p.skipped, total: p.total } : null;
const maxOf = (k) => tests.filter((t) => t.kind === 'scenario' && typeof t[k] === 'number')
  .reduce((m, t) => (m === null ? t[k] : Math.max(m, t[k])), null);
const failed = tests.filter((t) => t.status === 'failed');

const summary = {
  generatedAt: new Date().toISOString(),
  passed: sum('passed'),
  failed: sum('failed'),
  skipped: sum('skipped'),
  total: sum('total'),
  scenarios: pick(sc),
  e2e: pick(e2),
  renderMsMax: maxOf('renderMs'),
  diffLinesMax: maxOf('diffLines'),
  failedNames: failed.map((t) => t.file + ':' + t.line + ' › ' + t.title),
  failedFiles: Array.from(new Set(failed.map((t) => t.file))),
  tests,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('verify: total ' + summary.total + ', passed ' + summary.passed + ', failed ' + summary.failed +
  (summary.skipped ? ', skipped ' + summary.skipped : '') +
  ' (scenarios ' + (sc ? sc.passed + '/' + sc.total : '-') + ', e2e ' + (e2 ? e2.passed + '/' + e2.total : '-') + ')');
for (const n of summary.failedNames) console.log('  FAILED ' + n);
process.exit(summary.failed > 0 || summary.total === 0 ? 1 : 0);
