'use strict';
// BLK-reviewer-20260908-0823-wish: 「.puml はあるが .svg が書き出されていない」を
// 仕組みとして検知する。GUI の一覧では名前まで出し、CLI (audit.js) では監査 1 種として
// 回して run 間で追えるようにする。
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!global.window) global.window = {};
try { delete require.cache[require.resolve('../src/core/svg-freshness.js')]; } catch (e) {}
require('../src/core/svg-freshness.js');
const SF = global.window.MA.svgFreshness;

const report = require('../tools/audit-report');
const { loadMA } = require('../tools/audit-runtime');

const OLD = '2026-09-08T00:00:00.000Z';
const NEW = '2026-09-08T01:00:00.000Z';

describe('svgFreshness.shortfall', () => {
  test('無い図と古い図を、直し方ごとに名前でまとめる', () => {
    const scanned = SF.scan([
      { name: 'adc_state', mtime: OLD, svgMtime: NEW },
      { name: 'timer_state', mtime: OLD, svgMtime: null },
      { name: 'dma_state', mtime: NEW, svgMtime: OLD },
      { name: 'spi_state', mtime: OLD, svgMtime: null },
    ]);
    const s = SF.shortfall(scanned);
    expect(s.map((g) => g.status)).toEqual(['missing', 'stale']);
    expect(s[0].names).toEqual(['timer_state', 'spi_state']);
    expect(s[0].label).toBe('SVG が無い');
    expect(s[1].names).toEqual(['dma_state']);
  });

  test('全部追いついていれば 1 行も出さない', () => {
    const scanned = SF.scan([{ name: 'adc_state', mtime: OLD, svgMtime: NEW }]);
    expect(SF.shortfall(scanned)).toEqual([]);
  });

  test('時刻が取れない図は名前に出さない (何をすればよいか決まらないため)', () => {
    const scanned = SF.scan([{ name: 'adc_state', mtime: null, svgMtime: NEW }]);
    expect(scanned.counts.unknown).toBe(1);
    expect(SF.shortfall(scanned)).toEqual([]);
  });

  test('scan していない値を渡しても落ちない', () => {
    expect(SF.shortfall(null)).toEqual([]);
    expect(SF.shortfall({})).toEqual([]);
  });
});

// 実フォルダを作って CLI 側の監査を回す。出力物の有無はフォルダにしか書いていない。
function makeFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-svg-'));
  const puml = (name) => {
    const p = path.join(dir, name + '.puml');
    fs.writeFileSync(p, '@startuml\nclass ' + name + ' {\n}\n@enduml\n', 'utf-8');
    return p;
  };
  puml('adc_state');
  puml('timer_state');
  const dma = puml('dma_state');
  // adc は追いついている、dma は puml の方が新しい、timer は svg そのものが無い。
  fs.writeFileSync(path.join(dir, 'adc_state.svg'), '<svg/>', 'utf-8');
  fs.writeFileSync(path.join(dir, 'dma_state.svg'), '<svg/>', 'utf-8');
  const past = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(path.join(dir, 'dma_state.svg'), past, past);
  fs.utimesSync(dma, new Date(), new Date());
  return dir;
}

function runSvgAudit(dir) {
  const rt = loadMA();
  const docs = report.collectDocs([dir]);
  return report.buildReport(rt.MA, docs, { targets: [dir], only: ['svg'] });
}

describe('audit.js の出力物監査', () => {
  test('SVG が無い図・古い図を名前で出す', () => {
    const dir = makeFolder();
    const r = runSvgAudit(dir);
    expect(r.summary.svg.missing).toBe(1);
    expect(r.summary.svg.missingNames).toEqual(['timer_state.puml']);
    expect(r.summary.svg.stale).toBe(1);
    expect(r.summary.svg.staleNames).toEqual(['dma_state.puml']);
    expect(r.summary.svg.files).toBe(3);
  });

  test('出力物の欠落は指摘の合計には足さない (直し方が違うため)', () => {
    const dir = makeFolder();
    const r = runSvgAudit(dir);
    expect(r.totalIssues).toBe(0);
  });

  test('--summary の要約に「出力物」の 1 行が出る', () => {
    const dir = makeFolder();
    const text = report.formatSummary(runSvgAudit(dir));
    expect(text).toContain('出力物: SVG が無い 1 枚 (timer_state.puml)');
    expect(text).toContain('SVG が古い 1 枚 (dma_state.puml)');
  });

  test('全部書き出してあれば追いついている旨を出す', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-svg-ok-'));
    fs.writeFileSync(path.join(dir, 'adc_state.puml'), '@startuml\nclass A {\n}\n@enduml\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'adc_state.svg'), '<svg/>', 'utf-8');
    const text = report.formatSummary(runSvgAudit(dir));
    expect(text).toContain('出力物: SVG は 1 枚とも puml に追いついている');
  });

  test('svg は監査の一覧に載り、--only で単独で回せる', () => {
    expect(report.auditNames()).toContain('svg');
    const dir = makeFolder();
    expect(Object.keys(runSvgAudit(dir).audits)).toEqual(['svg']);
  });
});

describe('監査履歴での出力物の追跡', () => {
  const timeline = require('../src/core/audit-timeline');

  function auditsWith(rows) {
    return { svg: { status: 'ok', result: { rows: rows } } };
  }

  test('SVG が無い図が run 間の増減として並ぶ', () => {
    const items = timeline.itemsOf(auditsWith([
      { name: 'timer_state', status: 'missing' },
      { name: 'dma_state', status: 'stale' },
      { name: 'adc_state', status: 'fresh' },
    ]));
    expect(items.map((i) => i.category)).toEqual(['出力物/SVG 無', '出力物/SVG 古']);
    expect(items[0].id).toBe('timer_state');
    expect(items[0].title).toBe('timer_state.SVG 無');
  });

  test('見た run では 0 件でもカテゴリとして載る (見ていないと区別する)', () => {
    expect(timeline.categoriesOf(auditsWith([])))
      .toEqual(['出力物/SVG 無', '出力物/SVG 古']);
    expect(timeline.categoriesOf({})).toEqual([]);
  });
});
