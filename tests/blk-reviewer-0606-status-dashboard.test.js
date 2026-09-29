'use strict';

// BLK-reviewer-20260915-0606-wish: 整合ダッシュボード (図 1 枚 = 1 行) の畳み方。
// 出口ごとに図名の形が違うこと・見ていない出口と 0 件を分けること・
// 出口同士の食い違いを消さずに残すことを守る。

const assert = require('assert');
const SD = require('../src/core/status-dashboard');

describe('BLK-reviewer-20260915-0606-wish 整合ダッシュボード', () => {

test('図名は dir/x.puml でも x でも同じ 1 行に畳まれる', () => {
  const b = SD.build({
    docs: ['primary/spi_class.puml'],
    findings: [{ id: 'F-01', open: true, docs: ['spi_class.puml'] }],
    pins: [{ doc: 'spi_class', status: 'untouched', label: '未着手' }],
    svg: { rows: [{ name: 'spi_class.svg', content: 'match', status: 'fresh' }] },
    registry: { pending: [] },
  });
  assert.strictEqual(b.rows.length, 1);
  const r = b.rows[0];
  assert.strictEqual(r.doc, 'spi_class');
  assert.strictEqual(r.findings.open, 1);
  assert.strictEqual(r.pins.open, 1);
  assert.strictEqual(r.svg.text, '一致');
});

test('体裁差のみは作り直しに数えない', () => {
  const b = SD.build({
    docs: ['a', 'b'],
    svg: { rows: [
      { name: 'a', content: 'format', status: 'stale' },
      { name: 'b', content: 'differ', status: 'stale', basis: 'rerender' },
    ] },
  });
  assert.strictEqual(b.totals.needsRender, 1);
  assert.strictEqual(b.totals.formatOnly, 1);
  assert.deepStrictEqual(SD.actionable(b).map((r) => r.doc), ['b']);
});

test('指摘は「SVG ずれ」だが内容は体裁差だけ、という食い違いが行に残る', () => {
  const b = SD.build({
    docs: ['adc_init_sequence'],
    findings: [{ id: 'F-09', open: true, docs: ['adc_init_sequence.puml'],
                 cats: ['出力物/SVG 内容ずれ'] }],
    svg: { rows: [{ name: 'adc_init_sequence', content: 'format', status: 'stale', basis: 'rerender' }] },
  });
  const r = b.rows[0];
  assert.strictEqual(r.notes.length, 1);
  assert.ok(/体裁差のみ・作り直し不要/.test(r.notes[0]), r.notes[0]);
  assert.strictEqual(b.totals.notes, 1);
});

test('印だけのずれと未刻印は「要確定」として名指しされる', () => {
  const b = SD.build({
    docs: ['x', 'y'],
    svg: { rows: [
      { name: 'x', content: 'differ', status: 'stale', basis: 'stamp' },
      { name: 'y', content: 'unverified', status: 'fresh' },
    ] },
  });
  assert.ok(/印の突合だけのずれ/.test(b.rows[0].notes.join('')));
  assert.ok(/verify-svg/.test(b.rows[1].notes.join('')));
});

test('見ていない出口の列は 0 件ではなく ? と出る', () => {
  const b = SD.build({ docs: ['a'], svg: { rows: [{ name: 'a', content: 'match' }] } });
  const r = b.rows[0];
  assert.strictEqual(SD.cell(r, 'findings'), '?');
  assert.strictEqual(SD.cell(r, 'pins'), '?');
  assert.strictEqual(SD.cell(r, 'registry'), '?');
  assert.strictEqual(SD.cell(r, 'svg'), '一致');
  // 前回控えと比べていない run は「変化なし」と混ぜない。
  assert.strictEqual(SD.cell(r, 'diff'), '?');
});

test('前回控えと比べた run は、名指しされなかった図を「変化なし」にする', () => {
  const b = SD.build({
    docs: ['a', 'b'],
    fileDiff: { contentComparable: true, changed: [{ name: 'a.puml' }], added: [], removed: [], renamed: [] },
  });
  assert.strictEqual(SD.cell(b.rows[0], 'diff'), '変わった');
  assert.strictEqual(SD.cell(b.rows[1], 'diff'), '—');
  assert.strictEqual(b.totals.changed, 1);
});

test('表記揺れの要決定は、その綴りが出てくる図すべてに数える', () => {
  const b = SD.build({
    docs: ['a', 'b'],
    registry: { pending: [{ suggested: 'Spi_Driver',
      members: [{ name: 'Spi_Driver', docs: ['a.puml'] }, { name: 'SpiDriver', docs: ['b.puml'] }] }] },
  });
  assert.strictEqual(b.rows[0].registry.pending, 1);
  assert.strictEqual(b.rows[1].registry.pending, 1);
  assert.strictEqual(b.totals.registry, 2);
});

test('画面の手動指摘の形 (doc / keep) でも数えられる', () => {
  const b = SD.build({
    docs: ['a'],
    findings: [{ doc: 'a', text: '未使用', keep: false }, { doc: 'a', text: '前回判定', keep: true }],
  });
  assert.strictEqual(b.rows[0].findings.total, 2);
  assert.strictEqual(b.rows[0].findings.open, 1);
});

test('の未解消は pin-progress の status をそのまま読む', () => {
  const b = SD.build({
    docs: ['a'],
    pins: [
      { doc: 'a', status: 'untouched', label: '未着手' },
      { doc: 'a', status: 'resolved', label: '解消' },
      { item: { doc: 'a' }, status: 'started', label: '着手' },
    ],
    pinOpenStatuses: { untouched: true, started: true },
  });
  assert.strictEqual(b.rows[0].pins.total, 3);
  assert.strictEqual(b.rows[0].pins.open, 2);
});

test('表と markdown が同じ列・同じ言葉で出る', () => {
  const b = SD.build({
    docs: ['a'],
    findings: [{ id: 'F-1', open: true, docs: ['a'] }],
    svg: { rows: [{ name: 'a', content: 'format' }] },
  });
  const t = SD.text(b, '整合ダッシュボード');
  assert.ok(t.indexOf('体裁差のみ') >= 0, t);
  assert.ok(t.indexOf('手を入れる図: a') >= 0, t);
  const md = SD.markdown(b, '整合ダッシュボード');
  assert.ok(md.indexOf('| 図 | 指摘(未解消) |') >= 0, md);
  assert.ok(md.indexOf('体裁差のみ') >= 0, md);
});

});
