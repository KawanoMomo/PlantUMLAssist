'use strict';
// BLK-reviewer-20260909-0703-wish: 「この図は隣のフォルダの同名ドメインとは別物」
// という判断は DSL のコメント行 (' domain-verdict: ...) にしか残らず、突合はその行を
// 一切読まなかった。reviewer は突合が出した食い違い 1 件ごとに grep で「もう決まって
// いるか」を確かめ直しており、書き忘れ・typo があれば同じ指摘を再起票し続けた。
// 突合が宣言を読み、「これから判断するもの」「決定済み」「宣言と実体の食い違い」の
// 3 つに分けて出すことを固定する。
const assert = require('assert');

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
[
  '../src/core/dsl-utils.js',
  '../src/core/parser-utils.js',
  '../src/core/name-audit.js',
  '../src/core/scope-decl.js',
  '../src/core/family-audit.js',
  '../src/core/audit-scope.js',
  '../src/core/bulk-rename.js',
  '../src/core/domain-cohort.js',
  '../src/core/domain-verdict.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var dc = global.window.MA.domainCohort;
var dv = global.window.MA.domainVerdict;

function seq(lines) { return ['@startuml'].concat(lines).concat(['@enduml']).join('\n'); }

// junior と primary の gpio シーケンス図。部品名もメッセージ名も噛み合っていない。
var JUNIOR = seq(['participant Gpio_Driver', 'participant Hw_Ctrl', 'Gpio_Driver -> Hw_Ctrl : Gpio_Setup']);
var PRIMARY = seq(['participant GpioDrv', 'participant HwCtl', 'GpioDrv -> HwCtl : Gpio_Init']);

function docs(juniorDsl, primaryDsl) {
  return [
    { name: 'junior/gpio_init_sequence.puml', dsl: juniorDsl },
    { name: 'primary/gpio_init_sequence.puml', dsl: primaryDsl },
  ];
}

// ── 宣言が無いとき: 従来どおり「食い違い」として出る ──────────────────────
var plain = dc.audit(docs(JUNIOR, PRIMARY));
assert.strictEqual(plain.groups.length, 1);
assert.strictEqual(plain.groups[0].mismatched, 1, '宣言が無ければ判断すべき食い違い');
assert.strictEqual(plain.declared, 0);
assert.strictEqual(plain.conflicts, 0);
assert.strictEqual(dc.rows(plain)[0].verdict.kind, '', '宣言なしの行に印は付かない');

// ── listMarks / removeMark ──────────────────────────────────────────────
// 図 1 枚が複数の相手について宣言を持てる (相手はフォルダごとに違う)。
var multi = dv.applyMark(dv.applyMark(JUNIOR, 'separate', 'gpio', 'primary'), 'shared', 'gpio', 'reviewer');
var marks = dv.listMarks(multi);
assert.strictEqual(marks.length, 2);
assert.deepStrictEqual(marks.map(function(m) { return m.other + ':' + m.kind; }).sort(),
  ['primary:separate', 'reviewer:shared']);
assert.ok(marks[0].line > 0, '何行目に書いてあるかも返す');
assert.strictEqual(dv.markText(marks.find(function(m) { return m.other === 'primary'; })),
  'primary: 別ドメイン (gpio)');

// 1 本だけ外せる。残りの宣言は消えない。
var removed = dv.removeMark(multi, 'primary');
assert.deepStrictEqual(dv.listMarks(removed).map(function(m) { return m.other; }), ['reviewer']);
// 相手を指定しなければ全部消える。
assert.strictEqual(dv.listMarks(dv.removeMark(multi, '')).length, 0);

// ── 別物と宣言済み: 食い違いに数えない ──────────────────────────────────
var declared = dc.audit(docs(dv.applyMark(JUNIOR, 'separate', 'gpio', 'primary'), PRIMARY));
assert.strictEqual(declared.groups[0].mismatched, 0, '宣言済みは「これから判断するもの」に数えない');
assert.strictEqual(declared.declared, 1);
assert.strictEqual(declared.conflicts, 0);
var row = dc.rows(declared)[0];
assert.strictEqual(row.verdict.kind, 'separate');
assert.deepStrictEqual(row.verdict.by, ['junior'], 'どちらが宣言したかも残る');
assert.ok(row.verdict.text.indexOf('別ドメインと宣言済み') === 0, row.verdict.text);
// 差分そのものは消えない (開けば中身は読める)。
assert.strictEqual(row.matched, false);
// 件数を黙って減らさない。1 行に「除外した」と出る。
assert.ok(dc.summaryLine(declared).indexOf('宣言済み 1 組は除外') >= 0, dc.summaryLine(declared));

// ── 宣言と実体の食い違い ────────────────────────────────────────────────
// (1) 同一と宣言しているのに中身が食い違う。これが reviewer の見るべき本命。
var sharedBad = dc.audit(docs(dv.applyMark(JUNIOR, 'shared', 'gpio', 'primary'), PRIMARY));
assert.strictEqual(sharedBad.conflicts, 1);
assert.strictEqual(sharedBad.groups[0].mismatched, 0, '宣言と実体の食い違いは別枠で数える');
var conf = dc.conflictRows(sharedBad);
assert.strictEqual(conf.length, 1);
assert.strictEqual(conf[0].conflict, 'shared-but-differs');
assert.strictEqual(conf[0].domain, 'gpio');
assert.ok(conf[0].text.indexOf('同一と宣言されているのに中身が食い違う') >= 0, conf[0].text);
assert.ok(dc.summaryLine(sharedBad).indexOf('宣言と実体の食い違い 1 組') >= 0, dc.summaryLine(sharedBad));

// (2) 別物と宣言しているのに中身が揃っている (片方が相手を丸ごと複製した等)。
var same = seq(['participant Gpio_Driver', 'participant Hw_Ctrl', 'Gpio_Driver -> Hw_Ctrl : Gpio_Setup']);
var sepBad = dc.audit(docs(dv.applyMark(JUNIOR, 'separate', 'gpio', 'primary'), same));
assert.strictEqual(sepBad.conflicts, 1);
assert.strictEqual(dc.conflictRows(sepBad)[0].conflict, 'separate-but-same');

// (3) 両者が逆のことを宣言している。どちらが古いかは機械では決まらないので、
//     どちらの宣言にも従わず「宣言が食い違う」として出す。
var bothWays = dc.audit(docs(
  dv.applyMark(JUNIOR, 'separate', 'gpio', 'primary'),
  dv.applyMark(PRIMARY, 'shared', 'gpio', 'junior')));
assert.strictEqual(bothWays.conflicts, 1);
assert.strictEqual(dc.conflictRows(bothWays)[0].conflict, 'declaration');
assert.deepStrictEqual(dc.rows(bothWays)[0].verdict.by.sort(), ['junior', 'primary']);

// 両者が同じことを宣言していれば、ただの宣言済み。
var agree = dc.audit(docs(
  dv.applyMark(JUNIOR, 'separate', 'gpio', 'primary'),
  dv.applyMark(PRIMARY, 'separate', 'gpio', 'junior')));
assert.strictEqual(agree.conflicts, 0);
assert.strictEqual(agree.declared, 1);

// ── 宣言は相手ごと ──────────────────────────────────────────────────────
// reviewer についての宣言は、primary との組には効かない。
var other = dc.audit(docs(dv.applyMark(JUNIOR, 'separate', 'gpio', 'reviewer'), PRIMARY));
assert.strictEqual(other.groups[0].mismatched, 1, '別の相手への宣言は流用しない');
assert.strictEqual(other.declared, 0);

console.log('    ✓ BLK-reviewer-20260909-0703-wish ドメイン宣言を突合が読む');
