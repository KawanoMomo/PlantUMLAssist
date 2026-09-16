'use strict';
// BLK-junior-20260917-0123-wish: 表記揺れの組の「統一先」(どちらが正式表記か) を、
// 先輩フォルダ全体の実績から言い切る。ここで固定するのは、数え方が突合 (vocabMatch)
// および ⇄ 一括置換 (bulkRename) と一致すること、多数決 → 同数なら最新 → 登録簿が
// あればそれが最優先、という根拠の順、根拠が無いときは言い切らないこと、そして
// 「どの図を見れば裏が取れるか」が出ること。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/bulk-rename.js', '../src/core/name-registry.js',
 '../src/core/vocab-match.js', '../src/core/vocab-canon.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
const VM = global.window.MA.vocabMatch;
const VC = global.window.MA.vocabCanon;
const NR = global.window.MA.nameRegistry;
const BR = global.window.MA.bulkRename;

// 先輩 (primary) のフォルダ。Timer_Driver が多数派、Clock_Ctrl と ClockCtrl は同数。
const DOCS = [
  { folder: 'primary', name: 'driver_common_class', mtime: '2026-09-10T00:00:00Z',
    text: ['@startuml', 'class Timer_Driver', 'class Spi_Driver',
           'Timer_Driver --> Spi_Driver', 'class Clock_Ctrl', '@enduml'].join('\n') },
  { folder: 'primary', name: 'timer_sequence', mtime: '2026-09-11T00:00:00Z',
    text: ['@startuml', 'participant Timer_Driver',
           'Timer_Driver -> Timer_DriverTest : ng', '@enduml'].join('\n') },
  { folder: 'primary', name: 'clock_state', mtime: '2026-09-16T00:00:00Z',
    text: ['@startuml', 'state ClockCtrl', '@enduml'].join('\n') },
  { folder: 'primary', name: 'usecase_old', mtime: '2026-09-01T00:00:00Z',
    text: ['@startuml', 'usecase "TIMER Driver を使う" as UC1', '@enduml'].join('\n') },
];

// ── 数え方は突合 / 一括置換と同じ ────────────────────────────────────────
const tTimer = VC.tally('Timer_Driver', DOCS);
assert.strictEqual(tTimer.count, 4, 'Timer_Driver は 4 件 (Timer_DriverTest は別の語)');
assert.strictEqual(tTimer.files.length, 2, '該当した図は 2 枚');
assert.strictEqual(tTimer.files[0].name, 'driver_common_class', '件数の多い図が先頭');
assert.strictEqual(tTimer.files[0].line, 2, '最初に出てくる行番号まで出す');
assert.strictEqual(tTimer.latest, '2026-09-11T00:00:00Z', '該当図のうち最新の刻印');
// bulkRename が同じ本文を同じ件数で数えることを縛る (規則を 2 つ持たない)。
const byBulk = DOCS.reduce(function(n, d) { return n + BR.countIn(d.text, 'Timer_Driver'); }, 0);
assert.strictEqual(tTimer.count, byBulk, '⇄ 一括置換のヒット数と一致する');
assert.strictEqual(VC.tally('TIMER Driver', DOCS).count, 1, '空白入りの綴りも数える');
assert.strictEqual(VC.tally('', DOCS).count, 0, '空の語は数えない');

// ── 多数決 ────────────────────────────────────────────────────────────────
const pairs = VM.pairs(['## 表記揺れ',
  '- Timer_Driver⇔TIMER Driver、Clock_Ctrl⇔ClockCtrl、Gpio_Drv⇔GpioDrv の 3 組。'].join('\n'));
assert.strictEqual(pairs.length, 3, '3 組を拾う');

const vs = VC.decideAll(pairs, DOCS, null);
const timer = vs[0];
assert.strictEqual(timer.canonical, 'Timer_Driver', '多数派の綴りを統一先にする');
assert.strictEqual(timer.other, 'TIMER Driver', '寄せる側も言う');
assert.strictEqual(timer.source, 'count', '根拠は出現数');
assert.ok(VC.verdictText(timer).indexOf('統一先: Timer_Driver') >= 0, '統一先を言い切る');
assert.ok(VC.verdictText(timer).indexOf('4件') >= 0, '根拠の件数が同じ行に出る');
assert.ok(VC.verdictText(timer).indexOf('TIMER Driver 1件') >= 0, '相手側の件数も出る');
// 裏を取りに行く先が出る (先輩フォルダを grep し直さないための肝)。
assert.strictEqual(VC.fileText(timer.files[0]), 'primary/driver_common_class 2行目 (2件)');

// ── 同数なら最後に書かれた方 ──────────────────────────────────────────────
const clock = vs[1];
assert.strictEqual(clock.tally.a.count, 1, 'Clock_Ctrl は 1 件');
assert.strictEqual(clock.tally.b.count, 1, 'ClockCtrl も 1 件');
assert.strictEqual(clock.canonical, 'ClockCtrl', '同数なら更新の新しい図の綴り');
assert.strictEqual(clock.source, 'latest', '根拠は更新時刻');
assert.ok(VC.reasonText(clock).indexOf('同数につき更新が新しい方') >= 0, '同数だったことを隠さない');

// ── 根拠が無ければ言い切らない ────────────────────────────────────────────
const gpio = vs[2];
assert.strictEqual(gpio.source, 'unknown', '先輩がどちらも使っていなければ決めない');
assert.strictEqual(gpio.canonical, '', '当てずっぽうの統一先を出さない');
assert.ok(VC.verdictText(gpio).indexOf('どちらの綴りもありません') >= 0, '決められない理由を出す');
assert.strictEqual(VC.decided(vs).length, 2, '決まったのは 2 組');

// ── 登録簿があればそれが最優先 ────────────────────────────────────────────
// 人が「TIMER Driver が正」と決めているなら、先輩の多数決より人の決定が勝つ。
const reg = NR.parse({ entries: [{ canonical: 'TIMER Driver', variants: ['Timer_Driver'],
                                   by: 'reviewer' }] });
const byReg = VC.decide(pairs[0], DOCS, reg);
assert.strictEqual(byReg.canonical, 'TIMER Driver', '登録簿の正式表記が多数決に勝つ');
assert.strictEqual(byReg.source, 'registry', '根拠は登録簿');
assert.ok(VC.reasonText(byReg).indexOf('登録簿の正式表記') >= 0, '登録簿だと分かる');
assert.ok(VC.reasonText(byReg).indexOf('reviewer') >= 0, '誰が決めたかも出す');
// 登録簿に無い組は、登録簿があっても数で決める (登録簿が空欄を作らない)。
assert.strictEqual(VC.decide(pairs[1], DOCS, reg).source, 'latest', '登録簿に無い組は実績で決める');

// ── まとめの 1 行 ────────────────────────────────────────────────────────
assert.ok(VC.summaryText(vs, DOCS.length).indexOf('3組中 2組') >= 0, '決まった組数を言う');
assert.ok(VC.summaryText(vs, DOCS.length).indexOf('先輩 4図') >= 0, '何図を根拠にしたかを言う');
assert.ok(VC.summaryText(vs, 0).indexOf('読めていません') >= 0,
  '先輩フォルダを読めていないときは「決められない」と区別する');
assert.strictEqual(VC.summaryText([], 4), '', '組が無ければ何も言わない');

console.log('blk-junior-20260917-0123-wish-vocab-canon: ok');
