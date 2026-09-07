'use strict';
// BLK-reviewer-20260907-1303: 監査を node から公式に呼ぶ口 (tools/audit.js)。
// 本体が src/core に依存を足しても外側が壊れないこと、監査が 1 つ欠けても
// 残りの結果が返ること、docs の集め方が仕様どおりであることを固定する。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA } = require('../tools/audit-runtime');
const report = require('../tools/audit-report');
const cli = require('../tools/audit');

function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-audit-'));
  return d;
}
function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

const SEQ = '@startuml\nparticipant Uart_Driver\nUart_Driver -> Uart_Driver : Uart_Init()\n@enduml\n';
const CLS = '@startuml\nclass Uart_Driver {\n  +Uart_Init()\n}\n@enduml\n';

describe('audit-runtime.loadMA', function() {
  test('src/core を全部読み、監査モジュールが揃う', function() {
    const rt = loadMA();
    expect(typeof rt.MA.nameAudit.audit).toBe('function');
    expect(typeof rt.MA.methodAudit.audit).toBe('function');
    expect(typeof rt.MA.consistency.check).toBe('function');
    expect(typeof rt.MA.familyAudit.audit).toBe('function');
  });
  test('window モックを外側で組まなくても読み込みエラーが出ない', function() {
    const rt = loadMA();
    expect(rt.errors.length).toBe(0);
    expect(rt.loaded.length).toBeGreaterThan(10);
  });
  test('新しい依存 (dsl-utils) も列挙で自動的に読まれる', function() {
    const rt = loadMA();
    expect(rt.loaded).toContain('src/core/dsl-utils.js');
    expect(typeof rt.MA.dslUtils.splitLines).toBe('function');
  });
});

describe('audit-report.collectDocs', function() {
  test('フォルダを再帰して .puml を name+dsl で集める', function() {
    const d = tmpdir();
    write(d, 'a/seq.puml', SEQ);
    write(d, 'b/cls.puml', CLS);
    write(d, 'b/notes.txt', 'ignored');
    const docs = report.collectDocs(d);
    expect(docs.length).toBe(2);
    expect(docs[0].name).toBe('a/seq.puml');
    expect(docs[1].name).toBe('b/cls.puml');
    expect(docs[0].dsl).toContain('Uart_Init()');
  });
  test('ファイルを直接渡せる。重複指定は 1 枚に畳む', function() {
    const d = tmpdir();
    const p = write(d, 'seq.puml', SEQ);
    const docs = report.collectDocs([p, p]);
    expect(docs.length).toBe(1);
    expect(docs[0].name).toBe('seq.puml');
  });
  test('存在しないパスは理由の分かるエラーで落ちる', function() {
    expect(function() { report.collectDocs(path.join(tmpdir(), 'nope')); }).toThrow('見つかりません');
  });
});

describe('audit-report.buildReport', function() {
  test('全監査が ok で返り、docs は名前だけ (全文を積まない)', function() {
    const rt = loadMA();
    const d = tmpdir();
    write(d, 'seq.puml', SEQ);
    write(d, 'cls.puml', CLS);
    const r = report.buildReport(rt.MA, report.collectDocs(d), { targets: [d] });
    expect(Object.keys(r.audits).length).toBe(report.auditNames().length);
    expect(r.audits.name.status).toBe('ok');
    expect(r.audits.method.status).toBe('ok');
    expect(r.audits.consistency.status).toBe('ok');
    expect(r.audits.family.status).toBe('ok');
    expect(r.audits.trace.status).toBe('ok');
    expect(r.docs).toEqual(['cls.puml', 'seq.puml']);
  });
  test('宣言済みの呼び出しはメソッド突合で指摘されない', function() {
    const rt = loadMA();
    const d = tmpdir();
    write(d, 'seq.puml', SEQ);
    write(d, 'cls.puml', CLS);
    const r = report.buildReport(rt.MA, report.collectDocs(d), {});
    expect(r.summary.method.issues).toBe(0);
  });
  test('クラス図に無い呼び出しは指摘として数え上がる', function() {
    const rt = loadMA();
    const d = tmpdir();
    write(d, 'seq.puml', '@startuml\nparticipant Uart_Driver\nUart_Driver -> Uart_Driver : Uart_Missing()\n@enduml\n');
    write(d, 'cls.puml', CLS);
    const r = report.buildReport(rt.MA, report.collectDocs(d), {});
    expect(r.summary.method.issues).toBeGreaterThan(0);
    expect(r.totalIssues).toBeGreaterThan(0);
  });
  test('only で監査を絞れる', function() {
    const rt = loadMA();
    const d = tmpdir();
    write(d, 'seq.puml', SEQ);
    const r = report.buildReport(rt.MA, report.collectDocs(d), { only: ['name'] });
    expect(Object.keys(r.audits)).toEqual(['name']);
  });
  test('監査モジュールが欠けても他は返る (skipped と区別できる)', function() {
    const audits = report.runAudits({ nameAudit: null, methodAudit: null, consistency: null, familyAudit: null }, []);
    expect(audits.name.status).toBe('skipped');
    expect(audits.method.status).toBe('skipped');
  });
  test('監査が投げても error として残り、全体は止まらない', function() {
    const rt = loadMA();
    const broken = Object.assign({}, rt.MA, { nameAudit: { audit: function() { throw new Error('boom'); } } });
    const audits = report.runAudits(broken, [{ name: 'a.puml', dsl: SEQ }]);
    expect(audits.name.status).toBe('error');
    expect(audits.name.message).toBe('boom');
    expect(audits.method.status).toBe('ok');
  });
  test('CRLF の図でも指摘を取りこぼさない', function() {
    const rt = loadMA();
    const d = tmpdir();
    write(d, 'seq.puml', SEQ.replace(/\n/g, '\r\n'));
    write(d, 'cls.puml', CLS.replace(/\n/g, '\r\n'));
    const r = report.buildReport(rt.MA, report.collectDocs(d), {});
    expect(r.audits.method.result.calls.length).toBeGreaterThan(0);
  });
});

describe('audit.js CLI', function() {
  test('--out に JSON を書き、終了コード 0 を返す', function() {
    const d = tmpdir();
    write(d, 'seq.puml', SEQ);
    write(d, 'cls.puml', CLS);
    const out = path.join(d, 'report', 'audit.json');
    const logs = [];
    const orig = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    let code;
    try { code = cli.main([d, '--out', out]); } finally { console.log = orig; }
    expect(code).toBe(0);
    const parsed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(parsed.docs.length).toBe(2);
    expect(parsed.summary.name.clean).toBe(true);
  });
  test('引数なしは使い方を出して 1', function() {
    const orig = console.log;
    console.log = () => {};
    let code;
    try { code = cli.main([]); } finally { console.log = orig; }
    expect(code).toBe(1);
  });
  test('未知のオプションは 1 で、使い方を添える', function() {
    const origErr = console.error;
    let msg = '';
    console.error = (m) => { msg = String(m); };
    let code;
    try { code = cli.main(['x', '--nope']); } finally { console.error = origErr; }
    expect(code).toBe(1);
    expect(msg).toContain('未知のオプション');
  });
  test('parseArgs は --only=a,b / --out=FILE 形式も受ける', function() {
    const o = cli.parseArgs(['dir', '--only=name,method', '--out=r.json', '--summary']);
    expect(o.targets).toEqual(['dir']);
    expect(o.only).toEqual(['name', 'method']);
    expect(o.out).toBe('r.json');
    expect(o.summary).toBe(true);
  });
  test('対象に .puml が 1 枚も無ければ 1 (0 件を「問題なし」にしない)', function() {
    const d = tmpdir();
    write(d, 'readme.txt', 'x');
    const origErr = console.error;
    console.error = () => {};
    let code;
    try { code = cli.main([d]); } finally { console.error = origErr; }
    expect(code).toBe(1);
  });
});

describe('audit-report.formatSummary', function() {
  test('件数を 1 行ずつ日本語で並べる', function() {
    const rt = loadMA();
    const d = tmpdir();
    write(d, 'seq.puml', SEQ);
    write(d, 'cls.puml', CLS);
    const r = report.buildReport(rt.MA, report.collectDocs(d), { targets: [d] });
    const text = report.formatSummary(r);
    expect(text).toContain('図 2 枚');
    expect(text).toContain('名前突合');
    expect(text).toContain('メソッド突合');
    expect(text).toContain('合計 ');
  });
});
