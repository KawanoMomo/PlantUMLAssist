'use strict';
// BLK-junior-20260917-0023-wish: 指摘.md の「表記揺れ」欄の語の組を、開いている図の
// 本文に自動で突き合わせる。ここで固定するのは、欄から組が拾えること、欄の外の
// ⇔ を拾わないこと、該当行と該当位置が出ること、該当が無ければ「該当なし」と
// 言い切ること、そして数え方が ⇄ 一括置換 (bulkRename) と一致すること。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/vocab-match.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
require('../src/core/vocab-match.js');
const VM = global.window.MA.vocabMatch;
const BR = global.window.MA.bulkRename;

const NOTE = [
  '# junior への指摘',
  '',
  '## 前提',
  'Base⇔Basis は前提の話で、表記揺れ欄ではない。',
  '',
  '## 表記揺れ(primary単独: 0組 / primary×junior: 4組、継続)',
  '- primary 単独: 0 組(変化なし)。',
  '- primary×junior 通し(`-p primary,junior --names`): IRQCtrl⇔Irq_Ctrl、Clock_Ctrl⇔ClockCtrl、',
  '  Timer_Driver⇔TIMER Driver、Spi_Driver⇔SPI Driver の 4 組。件数・対象ファイルとも前回から変化なし。',
  '',
  '## SVG',
  'primary 8枚が古い。Foo⇔Bar は SVG の話。',
].join('\n');

// ── 欄の切り出しと組 ──────────────────────────────────────────────────────
const ps = VM.pairs(NOTE);
const labels = ps.map(function(p) { return p.label; });
assert.ok(labels.indexOf('IRQCtrl⇔Irq_Ctrl') >= 0, 'IRQCtrl の組を拾う');
assert.ok(labels.indexOf('Clock_Ctrl⇔ClockCtrl') >= 0, 'Clock_Ctrl の組を拾う');
assert.ok(labels.indexOf('Timer_Driver⇔TIMER Driver') >= 0, '空白を含む綴りも組として拾う');
assert.ok(labels.indexOf('Spi_Driver⇔SPI Driver') >= 0, 'Spi_Driver の組を拾う');
assert.strictEqual(ps.length, 4, '表記揺れ欄の 4 組だけを拾う');
assert.ok(labels.indexOf('Base⇔Basis') < 0, '欄の外 (前提) の ⇔ は拾わない');
assert.ok(labels.indexOf('Foo⇔Bar') < 0, '次の見出し以降の ⇔ は拾わない');
assert.strictEqual(VM.pairs('# 題\n本文だけ').length, 0, '表記揺れ欄が無ければ 0 組');

// ── 突合: 該当あり ────────────────────────────────────────────────────────
const DSL = [
  '@startuml',
  'participant Irq_Ctrl as irq',
  'participant ClockCtrl',
  'irq -> ClockCtrl : enable()',
  'note right: Irq_CtrlTest は別の語なので数えない',
  '@enduml',
].join('\n');

const res = VM.scan(NOTE, DSL);
assert.strictEqual(res.lines.length, 3, '該当行は 3 行 (2,3,4 行目)');
assert.deepStrictEqual(res.lines.map(function(l) { return l.line; }), [2, 3, 4],
  '行番号は 1 始まりで昇順');
assert.strictEqual(res.total, 3, 'Irq_Ctrl 1 + ClockCtrl 2 = 3 件');

const hit = VM.hitPairs(res).map(function(p) { return p.label; });
assert.deepStrictEqual(hit, ['IRQCtrl⇔Irq_Ctrl', 'Clock_Ctrl⇔ClockCtrl'],
  '該当した組だけを該当として出す');

// 該当位置 — 行の中のどこが該当かが出る (目でスキャンし直さないための肝)。
const line2 = res.lines[0];
assert.deepStrictEqual(line2.ranges.map(function(r) { return r.term; }), ['Irq_Ctrl']);
assert.strictEqual(line2.text.slice(line2.ranges[0].start, line2.ranges[0].end), 'Irq_Ctrl',
  '該当位置が語をちょうど指す');

// 描画用の断片。該当だけに印が付き、つなげると元の行に戻る。
const segs = VM.segments(line2);
assert.strictEqual(segs.map(function(s) { return s.text; }).join(''), line2.text,
  '断片をつなげると元の行に戻る');
assert.deepStrictEqual(segs.filter(function(s) { return s.hit; }).map(function(s) { return s.text; }),
  ['Irq_Ctrl'], '該当部分だけが印になる');

// 識別子単位: IrqCtrlTest は巻き込まない。
const noteLine = res.lines.filter(function(l) { return l.line === 5; });
assert.strictEqual(noteLine.length, 0, 'Irq_CtrlTest の行は該当にしない');

// ── 突合: 該当なし ────────────────────────────────────────────────────────
const CLEAN = '@startuml\nparticipant Gpio\nGpio -> Gpio : init()\n@enduml';
const none = VM.scan(NOTE, CLEAN);
assert.strictEqual(none.total, 0, '該当が無ければ 0 件');
assert.strictEqual(none.lines.length, 0, '該当行も 0 行');
assert.ok(/該当なし/.test(VM.summaryText(none)), '該当が無ければ「該当なし」と言い切る');
assert.ok(/4組/.test(VM.summaryText(none)), '突合した組数を添えて言い切る');
assert.ok(/該当/.test(VM.summaryText(res)) && /行/.test(VM.summaryText(res)),
  '該当があれば組数・行数・件数を出す');
assert.ok(/ありません/.test(VM.summaryText(VM.scan('# 題\n本文', DSL))),
  '組が 1 つも無い指摘では、その旨を出す');

// ── 数え方が ⇄ 一括置換と一致する ────────────────────────────────────────
['Irq_Ctrl', 'ClockCtrl', 'Gpio', 'TIMER Driver'].forEach(function(term) {
  const mine = VM.scan(NOTE, DSL).pairs.reduce(function(a, p) {
    return a + p.terms.reduce(function(b, t) { return b + (t.term === term ? t.count : 0); }, 0);
  }, 0);
  if (mine === 0) return;
  assert.strictEqual(mine, BR.countIn(DSL, term),
    term + ' の件数が ⇄ 一括置換と一致する');
});

// 空入力で落ちない。
assert.strictEqual(VM.scan('', '').total, 0);
assert.deepStrictEqual(VM.segments(null), []);
assert.deepStrictEqual(VM.ranges('abc', ''), []);

console.log('blk-junior-20260917-0023-wish-vocab-match: ok');
