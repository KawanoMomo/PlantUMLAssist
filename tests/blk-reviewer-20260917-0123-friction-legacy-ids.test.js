'use strict';
// BLK-reviewer-20260917-0123: 0023 より前の控え (全カテゴリ F-nn) の既存行にも、
// 読んだ時点でカテゴリ頭文字の id を遡って振る。旧 id は formerIds で引ける。
var FT = require('../src/core/finding-tracker');

function legacy() {
  function row(id, entity, title, kinds, extra) {
    var r = { id: id, entity: entity, title: title, since: 't0', sinceIndex: 0, marks: [1],
              verdict: null, cats: [], kinds: kinds, docs: [] };
    Object.keys(extra || {}).forEach(function(k) { r[k] = extra[k]; });
    return r;
  }
  return {
    version: FT.VERSION, seq: 5, ticks: [{ label: 't0', at: 't0' }],
    findings: {
      'a/m': row('F-01', 'a/m', 'A.m', ['method.issues', 'consistency.methods']),
      'x/svg': row('F-04', 'x/svg', 'x.puml.SVG 古', ['svg.staleSettled'], { excluded: true }),
      '/init': row('F-02', '/init', 'Init', ['trace.outOfScope'], { excluded: true }),
      '/reset': row('F-03', '/reset', 'Reset', ['trace.outOfScope'], { excluded: true }),
      'irq': row('F-05', 'irq', 'Irq_Ctrl', ['name.variants']),
      'old': row('F-06', 'old', 'old', undefined),
    },
  };
}
function ids(st) { var o = {}; FT.rows(st).forEach(function(r) { o[r.title] = r; }); return o; }

test('既存の F-nn 行がカテゴリ頭文字へ旧番号順に振り直される', function() {
  var r = ids(FT.readState(legacy()));
  expect(r['A.m'].id).toBe('F-01');
  expect(r['Init'].id).toBe('T-01');
  expect(r['Reset'].id).toBe('T-02');
  expect(r['x.puml.SVG 古'].id).toBe('S-01');
  expect(r['Irq_Ctrl'].id).toBe('N-01');
  expect(r['Irq_Ctrl'].formerIds).toEqual(['F-05']);
  expect(r['old'].id).toBe('F-06');   // kinds の無い行は触らない
});

test('振り直しは何度読んでも同じ、更新後も持ち越す', function() {
  var st = FT.readState(FT.readState(legacy()));
  st = FT.update(JSON.parse(JSON.stringify(st)), { audits: {}, label: 't1' });
  st = FT.readState(JSON.parse(JSON.stringify(st)));
  expect(ids(st)['Reset'].id).toBe('T-02');
  expect(ids(st)['Reset'].formerIds).toEqual(['F-03']);
});

test('旧 id でも --set 相当の判断を貼れる', function() {
  var r = FT.setVerdict(legacy(), 'F-05', 'wontfix', '別名', 't0');
  expect(r.ok).toBe(true);
  expect(r.id).toBe('N-01');
});

test('sections は対象外でも今回出ている行を旧 id つきで出す', function() {
  var md = FT.sections(legacy());
  expect(md).toContain('## S-01 x.puml.SVG 古');
  expect(md).toContain('## T-01 Init');
  expect(md).toContain('旧 F-02');
  expect(md).toContain('## N-01 Irq_Ctrl');
});
