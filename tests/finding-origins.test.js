'use strict';
// BLK-reviewer-20260915-2240-wish: audit --board / findings / pins / verify-svg の
// 出力を reviewer が頭の中で突き合わせ、「同じ指摘の別表現か、本当に別物か」を
// 判断していた (F-01 の別図再掲を【新規】と誤読しかけた)。指摘 ID を鍵に 1 行へ
// 畳み、その 1 行に出典 (何を比較して出たか) を並べる畳み方をここで固定する。
const assert = require('assert');
const FO = require('../src/core/finding-origins.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e }); }
}

// 出口 4 本ぶんの、形だけ本物と同じ入力。
const FINDINGS = [
  { id: 'F-01', title: 'ClockCtrl.EnableClock', entity: 'clock/enableclock',
    state: 'carried', label: '継続', open: true, streak: 3,
    cats: ['メソッド', '整合/イベント'],
    docs: ['adc_init_sequence.puml', 'can_init_sequence.puml'] },
  { id: 'F-02', title: 'Spi_Driver.Ack', entity: 'spi/ack',
    state: 'fresh', label: '新規', open: true, cats: ['メソッド'],
    docs: ['spi_init_sequence.puml'] },
  { id: 'F-03', title: 'uart の SVG が古い', entity: 'uart/svg',
    state: 'carried', label: '継続', open: true, cats: ['出力物/SVG 内容ずれ'],
    docs: ['uart_init_sequence.puml'] },
  { id: 'F-04', title: 'Adc_Ack', entity: 'adc/adcack',
    state: 'closed', label: '解消', open: false, cats: ['メソッド'],
    docs: ['adc_state.puml'] },
];

const PINS = [
  { doc: 'adc_init_sequence.puml', line: 6, status: 'untouched', label: '未着手',
    text: 'ClockCtrl.EnableClock がクラス図に無い(F-01継続3tick目)' },
  { doc: 'can_init_sequence.puml', line: 6, status: 'started', label: '着手',
    text: 'F-01 と同じ件。手を入れ始めた' },
  { doc: 'adc_state.puml', line: 3, status: 'untouched', label: '未着手',
    text: 'F-04 は直したはず' },
];

const SVG_SCAN = {
  rows: [
    { name: 'uart_init_sequence.puml', status: 'stale' },
    { name: 'adc_init_sequence.puml', status: 'fresh' },
  ],
  staleReasons: { 'uart_init_sequence.puml': 'same' },   // 中身は一致 (体裁差のみ)
};

const REGISTRY = { pending: [{ names: ['Spi_Driver', 'SPI_Driver'] }] };

function build() {
  return FO.build({ findings: FINDINGS, pins: PINS, svg: SVG_SCAN, registry: REGISTRY,
                    pinOpenStatuses: { untouched: true, started: true } });
}
function row(b, id) { return b.rows.filter((r) => r.id === id)[0]; }

// ── 畳み方 ──────────────────────────────────────────────────────────────
t('指摘 1 件が 1 行になる (図の枚数で行が割れない)', () => {
  const b = build();
  assert.strictEqual(b.rows.length, 4);
  assert.strictEqual(b.totals.findings, 4);
  assert.strictEqual(b.totals.open, 3);
});

t('別図の再掲は「新規ではない」と言う (F-01 の誤読を止める)', () => {
  const f1 = row(build(), 'F-01');
  assert.strictEqual(f1.restated, true);
  assert.deepStrictEqual(f1.docs.map(FO.docKey), ['adc_init_sequence', 'can_init_sequence']);
  assert.ok(f1.note.indexOf('別図の再掲') >= 0, f1.note);
  assert.ok(f1.note.indexOf('2 枚') >= 0, f1.note);
  // 1 枚しか出ていない指摘には再掲の断りを付けない。
  assert.strictEqual(row(build(), 'F-02').restated, false);
  assert.strictEqual(row(build(), 'F-02').note, '');
});

// ── 出典 ────────────────────────────────────────────────────────────────
t('audit の分類がそのまま「何を比較して出たか」になる', () => {
  const f1 = row(build(), 'F-01');
  const o = f1.origins.filter((x) => x.tool === 'audit')[0];
  assert.ok(o, '出典に audit が無い');
  assert.strictEqual(o.label, 'audit --board');
  assert.strictEqual(o.basis, 'メソッド / 整合/イベント');
});

t('📌 は本文に書かれた指摘 ID で結ばれる (reviewer 自身の紐づけを読む)', () => {
  const f1 = row(build(), 'F-01');
  const o = f1.origins.filter((x) => x.tool === 'pins')[0];
  assert.ok(o, '出典に pins が無い');
  assert.strictEqual(f1.pins.length, 2);
  assert.ok(o.basis.indexOf('adc_init_sequence L6 未着手') >= 0, o.basis);
  assert.ok(o.basis.indexOf('can_init_sequence L6 着手') >= 0, o.basis);
  // ID の書かれていない指摘には 📌 を結ばない。
  assert.strictEqual(row(build(), 'F-02').pins.length, 0);
});

t('idsInText: 地の文に混ざった指摘 ID を拾う', () => {
  assert.deepStrictEqual(FO.idsInText('F-01継続3tick目'), ['F-01']);
  assert.deepStrictEqual(FO.idsInText('F-01 と F-12 は同じ件'), ['F-01', 'F-12']);
  assert.deepStrictEqual(FO.idsInText('ID の無い本文'), []);
  assert.deepStrictEqual(FO.idsInText(null), []);
});

t('出力物を見る指摘にだけ verify-svg の判定が付く', () => {
  const f3 = row(build(), 'F-03');
  const o = f3.origins.filter((x) => x.tool === 'svg')[0];
  assert.ok(o, '出典に verify-svg が無い');
  assert.ok(o.basis.indexOf('体裁差のみ') >= 0, o.basis);
  // メソッドの指摘に SVG の判定を混ぜない。
  assert.strictEqual(row(build(), 'F-02').origins.filter((x) => x.tool === 'svg').length, 0);
});

t('登録簿の要決定に挙がっている名前なら、その出典も並ぶ', () => {
  const f2 = row(build(), 'F-02');
  const o = f2.origins.filter((x) => x.tool === 'names')[0];
  assert.ok(o, '出典に登録簿が無い');
  assert.ok(o.basis.indexOf('Spi_Driver') >= 0, o.basis);
});

// ── 食い違い ────────────────────────────────────────────────────────────
t('指摘は「SVG ずれ」でも中身が一致なら、その食い違いを残す', () => {
  const f3 = row(build(), 'F-03');
  assert.strictEqual(f3.conflicts.length, 1);
  assert.ok(f3.conflicts[0].indexOf('体裁差のみ') >= 0, f3.conflicts[0]);
});

t('解消済みの指摘に開いた 📌 が残っていれば、その食い違いを残す', () => {
  const f4 = row(build(), 'F-04');
  assert.ok(f4.conflicts.some((c) => c.indexOf('📌') >= 0), f4.conflicts.join('|'));
  assert.strictEqual(build().totals.conflicts, 2);
});

t('食い違いをどちらかに寄せて消さない (両方の言い分が行に残る)', () => {
  const f3 = row(build(), 'F-03');
  assert.ok(f3.origins.some((o) => o.tool === 'audit'));
  assert.ok(f3.origins.some((o) => o.tool === 'svg'));
});

// ── 畳み目 (出典の組み合わせ) ───────────────────────────────────────────
t('出典の組み合わせが同じ指摘が 1 つの塊になる', () => {
  const b = build();
  const keys = b.groups.map((g) => g.key);
  assert.ok(keys.indexOf('audit+pins') >= 0, keys.join('|'));
  assert.ok(keys.indexOf('audit+svg') >= 0, keys.join('|'));
  assert.ok(keys.indexOf('audit+names') >= 0, keys.join('|'));
  assert.strictEqual(b.totals.groups, b.groups.length);
  // 塊の中身の合計は指摘の総数と合う (どの指摘も必ず 1 つの塊に入る)。
  assert.strictEqual(b.groups.reduce((n, g) => n + g.rows.length, 0), b.rows.length);
});

t('塊は件数の多い順。呼び名は出口の正式な名前で出す', () => {
  const b = build();
  for (let i = 1; i < b.groups.length; i++) {
    assert.ok(b.groups[i - 1].rows.length >= b.groups[i].rows.length);
  }
  assert.ok(b.groups.every((g) => g.label.indexOf('audit --board') >= 0));
});

// ── 出し方 ──────────────────────────────────────────────────────────────
t('summaryLine が 1 点確認の材料 (件数・再掲・食い違い) を並べる', () => {
  const line = FO.summaryLine(build());
  assert.ok(line.indexOf('指摘 4 件') >= 0, line);
  assert.ok(line.indexOf('未解消 3') >= 0, line);
  assert.ok(line.indexOf('別図の再掲 1') >= 0, line);
  assert.ok(line.indexOf('食い違い 2') >= 0, line);
});

t('text: 塊ごとに見出しが立ち、各指摘の下に出典が並ぶ', () => {
  const out = FO.text(build(), '見出し');
  assert.ok(out.indexOf('見出し') === 0, out.slice(0, 40));
  assert.ok(out.indexOf('── 出典: ') >= 0);
  assert.ok(out.indexOf('F-01') >= 0);
  assert.ok(out.indexOf('別図の再掲') >= 0);
  assert.ok(out.indexOf('⚠') >= 0);
});

t('markdown: 指摘.md にそのまま貼れる 6 列の表', () => {
  const md = FO.markdown(build(), '見出し');
  assert.ok(md.indexOf('| 指摘 | 見出し | 状態 | 図 | 出典 (何を比較して出たか) | 気づき |') >= 0);
  assert.strictEqual(md.split('\n').filter((l) => l.indexOf('| F-') === 0).length, 4);
});

// ── 壊れた入力 ──────────────────────────────────────────────────────────
t('出口が 1 つも無い回でも落ちない (見ていないことと 0 件を混ぜない)', () => {
  const b = FO.build({});
  assert.deepStrictEqual(b.rows, []);
  assert.strictEqual(b.totals.findings, 0);
  assert.strictEqual(b.groups.length, 0);
  assert.ok(FO.text(b, 'x').indexOf('指摘 0 件') >= 0);
});

t('📌 だけ取れなかった回でも、audit の出典は出る', () => {
  const b = FO.build({ findings: FINDINGS, pins: null, svg: null, registry: null });
  assert.strictEqual(row(b, 'F-01').pins.length, 0);
  assert.ok(row(b, 'F-01').origins.some((o) => o.tool === 'audit'));
  assert.strictEqual(b.totals.conflicts, 0);
});

t('docKey: 出口ごとに違う図名の形を 1 つに揃える', () => {
  assert.strictEqual(FO.docKey('dir/adc_state.puml'), 'adc_state');
  assert.strictEqual(FO.docKey('dir\\adc_state.svg'), 'adc_state');
  assert.strictEqual(FO.docKey('adc_state'), 'adc_state');
  assert.strictEqual(FO.docKey(null), '');
});

// ── 出力 ────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('\n  finding-origins — 指摘を出典ごとに畳む (BLK-reviewer-20260915-2240-wish)');
results.forEach((r) => {
  console.log('    ' + (r.ok ? '✓' : '✗') + ' ' + r.name);
  if (!r.ok) console.log('        ' + (r.err && r.err.message));
});
console.log('  ' + (results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) process.exitCode = 1;
