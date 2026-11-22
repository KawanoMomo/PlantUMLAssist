'use strict';
// TICKET-releaser-20261115-2020-3
// primary 手順 7 の scenario は手数 (clicks / keys / hands) を testInfo.annotations に積む。
// scripts/verify-summary.js がそれを summary.json の tests[] に写すことを、偽の Playwright レポートで確かめる。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'test-results', 'unit-verify-summary-hands');

function runSummary(report) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const rp = path.join(outDir, 'scenarios.report.json');
  fs.writeFileSync(rp, JSON.stringify(report));
  try {
    execFileSync('node', [path.join(projectRoot, 'scripts', 'verify-summary.js'), outDir, 'scenarios=' + rp],
      { cwd: projectRoot, encoding: 'utf8', timeout: 30000 });
  } catch (e) { /* 赤があれば exit 1。summary.json は書かれている */ }
  return JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8'));
}

function spec(title, annotations) {
  return {
    title, file: 'primary-7-s1.spec.js', line: 1,
    tests: [{ status: 'expected', annotations: [], results: [{ duration: 10, annotations }] }],
  };
}

const report = {
  config: { rootDir: path.join(projectRoot, 'tests', 'scenarios') },
  suites: [{
    file: 'primary-7-s1.spec.js',
    specs: [
      spec('with hands', [
        { type: 'renderMs', description: '420' },
        { type: 'renderMs', description: '880' },
        { type: 'clicks', description: '12' },
        { type: 'keys', description: '31' },
        { type: 'hands', description: '43' },
        { type: 'exportMs', description: '130' },
        { type: 'exportMs', description: '250' },
      ]),
      spec('without hands', [{ type: 'diffLines', description: '1' }]),
    ],
  }],
};

describe('TICKET-releaser-20261115-2020-3 summary.json carries hand counts', () => {
  const s = runSummary(report);
  const withH = s.tests.find((t) => t.title === 'with hands');
  const without = s.tests.find((t) => t.title === 'without hands');

  test('clicks / keys / hands are copied from annotations', () => {
    expect(withH.clicks).toBe(12);
    expect(withH.keys).toBe(31);
    expect(withH.hands).toBe(43);
  });

  test('renderMs keeps the largest of several operations', () => {
    expect(withH.renderMs).toBe(880);
  });

  // TICKET-releaser-20261122-1200-3: primary 手順 6 (場面 4) は書き出し 1 回の時間を exportMs に積む。
  test('exportMs keeps the slowest export', () => {
    expect(withH.exportMs).toBe(250);
  });

  test('a scenario that does not count hands reports null', () => {
    expect(without.exportMs).toBeNull();
    expect(without.clicks).toBeNull();
    expect(without.keys).toBeNull();
    expect(without.hands).toBeNull();
    expect(without.diffLines).toBe(1);
  });

  test('both scenarios pass', () => {
    expect(s.scenarios.passed).toBe(2);
    expect(s.failed).toBe(0);
  });
});
