'use strict';
// BLK-reviewer-20260923-2012-wish: 呼び先未宣言のメソッドに、その名前を挙げて
// 「意図的に割愛」と書いた note が既に付いている組は、
//   - 監査 (method-audit / consistency / audit.js の要約) で「未解消」に数えず、
//     「自由文で応答あり(タグ化待ち)」として別に数える (指摘の一覧からは外さない)
//   - 保存前突合の帯がその note を名指しし、「🚫 意図的に省略」の理由欄に note の本文を入れる
//   - タグ (`'@omit-method`) に直せば、整合の側 (consistency) の件数からも外れる

// 他のテストが global.window を差し替え、require のキャッシュも残すので、
// 新しい window に読み直す (最後に元へ戻す)。
const prevWindow = global.window;
global.window = {};
function fresh(rel) {
  try { delete require.cache[require.resolve(rel)]; } catch (e) {}
  return require(rel);
}
fresh('../src/core/dsl-utils.js');
fresh('../src/core/family-audit.js');
fresh('../src/core/method-audit.js');
const om = fresh('../src/core/omit-method.js');
fresh('../src/core/consistency.js');
const sg = fresh('../src/core/save-guard.js');
const board = fresh('../src/core/audit-board.js');
const report = require('../tools/audit-report');
const MA = global.window.MA;

// primary の driver_common_class.puml と同じ答え方 (note の自由文、タグなし)。
const CLASS_NOTED = {
  name: 'driver_common_class.puml',
  dsl: [
    '@startuml',
    'class Spi_Driver {',
    '  +Spi_Init(cfg): Std_ReturnType',
    '}',
    'class ClockCtrl {',
    '  +Reset(): void',
    '}',
    'class SpiRegs {',
    '  +Reset(): void',
    '}',
    'note top of ClockCtrl : ClockCtrl.EnableClock()\\nは呼び先の詳細を意図的に割愛(reviewer依頼2への回答)',
    '@enduml',
  ].join('\n'),
};

const CLASS_PLAIN = { name: 'driver_common_class.puml', dsl: CLASS_NOTED.dsl.split('\n').filter((l) => !/^note/.test(l)).join('\n') };

// EnableClock は note で答えてある。WriteConfig は何も答えていない。
function seq(extra) {
  return {
    name: 'spi_init_sequence.puml',
    dsl: [
      '@startuml',
      'participant Spi_Driver',
      'participant ClockCtrl',
      'participant SpiRegs',
      'Spi_Driver -> ClockCtrl : EnableClock(id)',
      'Spi_Driver -> SpiRegs : WriteConfig(cfg)',
      'App -> Spi_Driver : Spi_Init(cfg)',
    ].concat(extra || []).concat(['@enduml']).join('\n'),
  };
}

describe('method-audit: note で答えた組はタグ化待ちの印を付けて別に数える', () => {
  test('指摘には残し、noteReply に note の図・行・本文を持たせる', () => {
    const r = MA.methodAudit.audit([CLASS_NOTED, seq()]);
    const names = r.issues.map((i) => i.method).sort();
    expect(names).toEqual(['EnableClock', 'WriteConfig']);
    expect(r.noteReplied.map((i) => i.method)).toEqual(['EnableClock']);
    const hit = r.issues.find((i) => i.method === 'EnableClock');
    expect(hit.noteReply.doc).toBe('driver_common_class.puml');
    expect(hit.noteReply.line).toBe(11);
    expect(hit.noteReply.reason).toContain('意図的に割愛');
    expect(r.issues.find((i) => i.method === 'WriteConfig').noteReply).toBe(undefined);
  });

  test('note が無ければ印は付かない (今までどおり未解消)', () => {
    const r = MA.methodAudit.audit([CLASS_PLAIN, seq()]);
    expect(r.noteReplied).toEqual([]);
    expect(r.issues.every((i) => !i.noteReply)).toBe(true);
  });

  test('タグがあればタグが勝つ (突合から外れ、タグ化待ちには入らない)', () => {
    const r = MA.methodAudit.audit([CLASS_NOTED, seq(["'@omit-method ClockCtrl.EnableClock BSW 提供"])]);
    expect(r.issues.map((i) => i.method)).toEqual(['WriteConfig']);
    expect(r.omitted.map((i) => i.method)).toEqual(['EnableClock']);
    expect(r.noteReplied).toEqual([]);
  });
});

describe('consistency: タグを読んで外し、note で答えた組は件数に数えない', () => {
  test('note で答えた組は methods に残るが count には数えない', () => {
    const r = MA.consistency.check([CLASS_NOTED, seq()]);
    const m = r.methods.map((x) => x.method).sort();
    expect(m).toEqual(['EnableClock', 'WriteConfig']);
    expect(r.methodNoteReplied.map((x) => x.method)).toEqual(['EnableClock']);
    const plain = MA.consistency.check([CLASS_PLAIN, seq()]);
    expect(r.count).toBe(plain.count - 1);
  });

  test('タグに直した組は methods から外れ methodOmitted に残る', () => {
    const r = MA.consistency.check([CLASS_NOTED, seq(["'@omit-method ClockCtrl.EnableClock BSW 提供"])]);
    expect(r.methods.map((x) => x.method)).toEqual(['WriteConfig']);
    expect(r.methodOmitted.map((x) => x.method)).toEqual(['EnableClock']);
    expect(r.methodNoteReplied).toEqual([]);
  });
});

describe('audit.js の要約: 未解消とタグ化待ちを分けて書く', () => {
  test('summarize / formatSummary', () => {
    const docs = [CLASS_NOTED, seq()];
    const audits = {
      method: { status: 'ok', result: MA.methodAudit.audit(docs) },
      consistency: { status: 'ok', result: MA.consistency.check(docs) },
    };
    const s = report.summarize(audits);
    expect(s.method.issues).toBe(1);
    expect(s.method.noteReplied).toBe(1);
    expect(s.method.noteRepliedLines[0]).toContain('ClockCtrl.EnableClock');
    expect(s.method.noteRepliedLines[0]).toContain('driver_common_class.puml 11 行 の note');
    expect(s.consistency.methods).toBe(1);
    expect(s.consistency.methodNoteReplied).toBe(1);
    const text = report.formatSummary({ docs: docs, targets: ['x'], summary: s, audits: audits, totalIssues: 0 }, null, {});
    expect(text).toContain('メソッド突合: 指摘 1 件 / 自由文で応答あり(タグ化待ち) 1 件');
    expect(text).toContain('自由文で応答あり(タグ化待ち) 1 件)');
    expect(text).toContain('タグ化待ち: ClockCtrl.EnableClock');
    // 固定形の要約にも同じキーが出る (無い監査は null)。
    expect(report.SUMMARY_FIELDS.method).toContain('noteReplied');
    expect(report.SUMMARY_FIELDS.consistency).toContain('methodNoteReplied');
  });

  test('一覧 (--board) の行は、どの note で答えたかを理由の後ろに書く', () => {
    const docs = [CLASS_NOTED, seq()];
    const b = board.build({ audits: { method: { status: 'ok', result: MA.methodAudit.audit(docs) } } });
    const rows = b.rows.filter((r) => r.kind === 'method.issues');
    const noted = rows.find((r) => /EnableClock/.test(r.target || r.subject || JSON.stringify(r)));
    expect(JSON.stringify(noted)).toContain('自由文で応答あり(タグ化待ち)');
    const plain = rows.find((r) => /WriteConfig/.test(JSON.stringify(r)));
    expect(JSON.stringify(plain)).not.toContain('タグ化待ち');
  });
});

describe('保存前突合の帯: note を名指しし、理由欄に note の本文を入れる', () => {
  function guard(dsl) {
    return sg.check({ doc: { name: 'spi_init_sequence.puml', dsl: dsl }, folderDocs: [CLASS_NOTED] });
  }

  test('帯の行と要約が note を名指しする', () => {
    const res = guard(seq().dsl);
    expect(sg.shouldBlock(res)).toBe(true);
    const lines = sg.lines(res);
    const ec = lines.find((l) => l.method === 'EnableClock');
    expect(ec.note).toContain('自由文で応答あり（タグ化待ち）');
    expect(ec.note).toContain('driver_common_class.puml 11 行 の note');
    expect(ec.note).toContain('意図的に割愛');
    expect(lines.find((l) => l.method === 'WriteConfig').note).toBe('');
    expect(sg.summaryLine(res)).toContain('うち 1 件は note の自由文で応答済み（タグ化待ち）');
  });

  test('理由欄に入れる文は note の本文。note が無ければ空', () => {
    expect(sg.notePrefill(guard(seq().dsl))).toContain('ClockCtrl.EnableClock()');
    const plain = sg.check({ doc: { name: 'spi_init_sequence.puml', dsl: seq().dsl }, folderDocs: [CLASS_PLAIN] });
    expect(sg.notePrefill(plain)).toBe('');
  });

  test('note の本文で書いたタグは、次の突合で指摘を外す (note は消さない)', () => {
    const res = guard(seq().dsl);
    const ec = res.issues.find((i) => i.method === 'EnableClock');
    const tagged = om.apply(seq().dsl, [om.tagLine(ec, ec.noteReply.reason)]);
    expect(tagged).toContain("'@omit-method ClockCtrl.EnableClock ClockCtrl.EnableClock() は呼び先の詳細を意図的に割愛");
    const again = guard(tagged);
    expect(again.issues.map((i) => i.method)).toEqual(['WriteConfig']);
    expect(CLASS_NOTED.dsl).toContain('note top of ClockCtrl');
  });
});

global.window = prevWindow;
