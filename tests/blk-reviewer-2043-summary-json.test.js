'use strict';
// BLK-reviewer-20260906-2043: summarize() は回った監査のキーだけを生やすので、
// `--only` や監査モジュールの欠落で summary の形が run ごとに変わり、reviewer は
// 毎回 巨大な JSON を grep -n して summary の位置とキー名 (naming か
// consistency.naming か) を探し直す使い捨てスクリプトを書いていた。
// --summary-json / summaryView が「どの run でも同じ形・同じ順・同じキー」を
// 返すことを固定する。
const fs = require('fs');
const os = require('os');
const path = require('path');
const report = require('../tools/audit-report');
const cli = require('../tools/audit');

const SEQ = '@startuml\nparticipant Uart_Driver\nUart_Driver -> Uart_Driver : Uart_Init()\n@enduml\n';
const CLS = '@startuml\nclass Uart_Driver {\n  +Uart_Init()\n}\n@enduml\n';

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-sumjson-')); }
function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

// 標準出力を捕まえる。CLI の出口 (何が出るか) がこの BLK の主題なので、
// main() をそのまま回して出た文字列を読む。
function capture(argv) {
  const lines = [];
  const orig = console.log;
  const origErr = console.error;
  console.log = function(s) { lines.push(String(s)); };
  console.error = function(s) { lines.push(String(s)); };
  let code;
  try { code = cli.main(argv); } finally { console.log = orig; console.error = origErr; }
  return { code: code, out: lines.join('\n') };
}

describe('summaryView — 形が run ごとに変わらない', function() {
  const full = {
    generatedAt: '2026-09-14T00:00:00.000Z',
    targets: ['E:\\x'],
    docs: ['a.puml', 'b.puml'],
    audits: {
      name: { status: 'ok', result: {} },
      consistency: { status: 'ok', result: {} },
    },
    summary: {
      name: { variants: 1, undeclared: 2, clean: false },
      consistency: { naming: 3, unused: 0, methods: 4, methodReplies: 0, granularity: 0, events: 0, count: 7 },
    },
    totalIssues: 10,
  };

  test('監査キーは常に全部・同じ順で並ぶ', function() {
    const v = report.summaryView(full);
    expect(Object.keys(v.audits)).toEqual(report.auditNames());
  });

  test('トップレベルのキーの順も固定で、totalIssues が先頭付近に出る', function() {
    const v = report.summaryView(full);
    expect(Object.keys(v)).toEqual(['generatedAt', 'totalIssues', 'targets', 'docs', 'audits']);
    // JSON の 3 行目に固定で出る (grep -n で位置を探さない、がこの BLK の要点)。
    expect(JSON.stringify(v, null, 2).split('\n')[2]).toContain('"totalIssues"');
  });

  test('回った監査は status: ok で数字がそのまま出る', function() {
    const v = report.summaryView(full);
    expect(v.audits.name.status).toBe('ok');
    expect(v.audits.name.variants).toBe(1);
    expect(v.audits.consistency.naming).toBe(3);
    expect(v.audits.consistency.count).toBe(7);
  });

  test('回らなかった監査も枠ごと残り、数字は 0 ではなく null', function() {
    const v = report.summaryView(full);
    expect(v.audits.trace.status).toBe('skipped');
    // 0 件と「見ていない」を取り違えないために null にする。
    expect(v.audits.trace.missing).toBeNull();
    expect(v.audits.cohort.status).toBe('skipped');
    expect(v.audits.cohort.mismatched).toBeNull();
  });

  test('失敗した監査は status: error と理由を残す', function() {
    const v = report.summaryView(Object.assign({}, full, {
      audits: { name: { status: 'error', message: '未知の監査: name' } },
      summary: {},
    }));
    expect(v.audits.name.status).toBe('error');
    expect(v.audits.name.message).toBe('未知の監査: name');
    expect(v.audits.name.variants).toBeNull();
  });

  test('--only で監査を絞っても、絞らなくてもキーの集合は同じ', function() {
    const narrow = report.summaryView(Object.assign({}, full, {
      audits: { name: { status: 'ok', result: {} } },
      summary: { name: full.summary.name },
    }));
    expect(Object.keys(narrow.audits)).toEqual(Object.keys(report.summaryView(full).audits));
    for (const key of report.auditNames()) {
      expect(Object.keys(narrow.audits[key])).toEqual(Object.keys(report.summaryView(full).audits[key]));
    }
  });

  test('totalIssues が無い古い形の結果でも summary から数え直す', function() {
    const v = report.summaryView(Object.assign({}, full, { totalIssues: undefined }));
    expect(v.totalIssues).toBe(report.totalIssues(full.summary));
  });

  test('docs はファイル名の配列ではなく枚数', function() {
    expect(report.summaryView(full).docs).toBe(2);
  });

  test('空の結果でも同じ形を返す (落ちない)', function() {
    const v = report.summaryView({});
    expect(Object.keys(v.audits)).toEqual(report.auditNames());
    expect(v.totalIssues).toBe(0);
    expect(v.targets).toEqual([]);
  });

  test('フィールドの既定は SUMMARY_FIELDS が持ち、summarize の実際の形と揃う', function() {
    const keys = Object.keys(report.SUMMARY_FIELDS);
    expect(keys).toEqual(report.auditNames());
    for (const key of keys) {
      const slot = report.summaryView(full).audits[key];
      expect(Object.keys(slot)).toEqual(['status', 'message'].concat(report.SUMMARY_FIELDS[key]));
    }
  });
});

describe('audit.js --summary-json', function() {
  test('--summary-json / --summary-only のどちらでも受ける', function() {
    expect(cli.parseArgs(['--summary-json']).summaryJson).toBe(true);
    expect(cli.parseArgs(['--summary-only']).summaryJson).toBe(true);
    expect(cli.parseArgs([]).summaryJson).toBe(false);
    // 人向けの --summary とは別の口 (片方を立てても他方は立たない)。
    expect(cli.parseArgs(['--summary-json']).summary).toBe(false);
    expect(cli.parseArgs(['--summary']).summaryJson).toBe(false);
  });

  test('--help に載る', function() {
    expect(cli.USAGE).toContain('--summary-json');
    expect(cli.USAGE).toContain('--summary-only');
  });

  test('標準出力は要約だけの JSON で、全部の JSON は出さない', function() {
    const dir = tmpdir();
    write(dir, 'uart_seq.puml', SEQ);
    write(dir, 'uart_class.puml', CLS);
    const r = capture([dir, '--summary-json', '--no-state']);
    expect(r.code).toBe(0);
    const v = JSON.parse(r.out);
    expect(Object.keys(v)).toEqual(['generatedAt', 'totalIssues', 'targets', 'docs', 'audits']);
    expect(Object.keys(v.audits)).toEqual(report.auditNames());
    expect(v.docs).toBe(2);
    // 全部の JSON にしかないもの (指紋つきファイル一覧・監査の生の結果) は出ない。
    // これが混ざると JSON がまた数千行になり、grep -n に逆戻りする。
    expect(v.files === undefined).toBe(true);
    expect(v.audits.name.result === undefined).toBe(true);
    expect(r.out.split('\n').length).toBeLessThan(120);
  });

  test('--only で絞っても出るキーの集合は変わらない', function() {
    const dir = tmpdir();
    write(dir, 'uart_seq.puml', SEQ);
    const a = JSON.parse(capture([dir, '--summary-json', '--only', 'name', '--no-state']).out);
    const b = JSON.parse(capture([dir, '--summary-json', '--no-state']).out);
    expect(Object.keys(a.audits)).toEqual(Object.keys(b.audits));
    expect(a.audits.name.status).toBe('ok');
    expect(a.audits.cohort.status).toBe('skipped');
    expect(b.audits.cohort.status).toBe('ok');
  });

  test('--out と併せると全部の JSON はファイルへ、要約は標準出力へ', function() {
    const dir = tmpdir();
    write(dir, 'uart_seq.puml', SEQ);
    const outFile = path.join(dir, 'out', 'audit.json');
    const r = capture([dir, '--summary-json', '--out', outFile, '--no-state']);
    expect(r.code).toBe(0);
    const saved = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(typeof saved.audits).toBe('object');
    expect(Array.isArray(saved.files)).toBe(true);
    // 標準出力は 1 行目がパス、その後ろが要約の JSON。
    const lines = r.out.split('\n');
    expect(lines[0]).toBe(path.resolve(outFile));
    const v = JSON.parse(lines.slice(1).join('\n'));
    expect(Object.keys(v.audits)).toEqual(report.auditNames());
  });
});
