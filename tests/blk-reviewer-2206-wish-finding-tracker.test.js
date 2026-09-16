'use strict';
// BLK-reviewer-20260914-2206-wish: 指摘 1 件に id を与え、tick をまたいだ状態
// (新規 / 継続 N tick / 部分解消 / 再発 / 解消) を控えに持ち越す指摘トラッカー。
// 人が貼った「部分解消」が、次の tick で監査がカテゴリを移しても失われず、
// 「再発」に化けないことを固定する (指摘.md の全文書き直しを不要にする条件)。
const assert = require('assert');
const T = require('../src/core/finding-tracker');
const CLI = require('../tools/findings');

function ok(result) { return { status: 'ok', result: result }; }
function consistency(over) {
  return ok(Object.assign({
    naming: [], unused: [], methods: [], granularity: [], events: [], count: 0,
  }, over || {}));
}
function svg(rows) { return ok({ rows: rows }); }

const GPIO = { kind: 'no-method', owner: 'Gpio_Driver', method: 'Gpio_Ack', docs: ['gpio_init_sequence.puml'] };
const SPI = { kind: 'no-method', owner: 'Spi_Driver', method: 'Spi_Ack', docs: ['spi_init_sequence.puml'] };

function run(store, audits, label) {
  return T.update(store, { audits: audits, label: label, at: label });
}
function byId(list) {
  const m = {};
  list.forEach((r) => { m[r.id] = r; });
  return m;
}
function byTitle(list) {
  const m = {};
  list.forEach((r) => { m[r.title] = r; });
  return m;
}

// ---- id と初出 tick --------------------------------------------------------
{
  let s = T.emptyState();
  s = run(s, { method: ok({ issues: [GPIO] }), consistency: consistency() }, 'runs/20260914-1206');
  s = run(s, { method: ok({ issues: [GPIO, SPI] }), consistency: consistency() }, 'runs/20260914-1306');
  const rows = T.rows(s);
  const t = byTitle(rows);

  // 指摘は id を持ち、初出 tick を憶えている。
  assert.strictEqual(t['Gpio_Driver.Gpio_Ack'].id, 'F-01');
  assert.strictEqual(t['Gpio_Driver.Gpio_Ack'].since, 'runs/20260914-1206');
  assert.strictEqual(t['Spi_Driver.Spi_Ack'].since, 'runs/20260914-1306');

  // 状態は 1 行で読める: 継続 2 tick 目 / 新規。
  assert.strictEqual(T.statusText(t['Gpio_Driver.Gpio_Ack']), '継続 2 tick 目');
  assert.strictEqual(T.statusText(t['Spi_Driver.Spi_Ack']), '新規');

  // 同じ tick ラベルで 2 度叩いても継続 tick 数は水増しされない。
  const again = T.rows(run(s, { method: ok({ issues: [GPIO, SPI] }), consistency: consistency() }, 'runs/20260914-1306'));
  assert.strictEqual(byTitle(again)['Gpio_Driver.Gpio_Ack'].streak, 2);
}

// ---- 解消と再発 ------------------------------------------------------------
{
  let s = T.emptyState();
  s = run(s, { method: ok({ issues: [GPIO] }), consistency: consistency() }, 't1');
  s = run(s, { method: ok({ issues: [] }), consistency: consistency() }, 't2');
  assert.strictEqual(T.rows(s)[0].state, 'resolved');

  s = run(s, { method: ok({ issues: [GPIO] }), consistency: consistency() }, 't3');
  const r = T.rows(s)[0];
  // 一度消えてまた出たものだけが「再発」。出欠も 1 行で読める。
  assert.strictEqual(r.state, 'regressed');
  assert.strictEqual(r.spark, '●○●');
  assert.strictEqual(r.id, 'F-01', '解消しても id は振り直さない');
}

// ---- 部分解消: 人の判断が次の tick で失われない --------------------------
{
  // 「Spi_Driver の SVG が古い」が 1 tick 目に出る。reviewer は中身を見て
  // 「puml 側は解消。svg の再エクスポートだけ継続」と判断する。
  let s = T.emptyState();
  s = run(s, { svg: svg([{ name: 'spi_init_sequence.puml', status: 'stale' }]) }, 't1');
  const id = T.rows(s)[0].id;
  const set = T.setVerdict(s, id, 'partial', 'puml 側は解消。svg 再エクスポートのみ継続', 't1');
  assert.strictEqual(set.ok, true);
  s = set.state;

  // 次の tick で監査がこの指摘を落とす (カテゴリの移動でも、拾い方の変化でも)。
  s = run(s, { svg: svg([]) }, 't2');
  let r = T.rows(s)[0];
  // 判断を貼った行は勝手に「解消」にしない。部分解消のまま持ち越す。
  assert.strictEqual(r.state, 'partial');
  assert.strictEqual(r.label, '部分解消');
  assert.strictEqual(r.note, 'puml 側は解消。svg 再エクスポートのみ継続');
  assert.strictEqual(r.open, true);

  // その次の tick でまた出ても「再発」にはしない (ここが BLK の症状)。
  s = run(s, { svg: svg([{ name: 'spi_init_sequence.puml', status: 'stale' }]) }, 't3');
  r = T.rows(s)[0];
  assert.strictEqual(r.state, 'partial');
  assert.strictEqual(T.statusText(r), '部分解消');

  // 到達条件: 全文を書き直さず、該当行の状態を 1 つ更新するだけで解消にできる。
  s = T.setVerdict(s, id, 'resolved', '再エクスポート確認', 't3').state;
  r = T.rows(s)[0];
  assert.strictEqual(r.state, 'resolved');
  assert.strictEqual(r.open, false);

  // open を貼れば判断は剥がれ、監査の出欠 (●○●) に戻る = 再発として読まれる。
  s = T.setVerdict(s, id, 'open', '', 't3').state;
  assert.strictEqual(T.rows(s)[0].state, 'regressed');
}

// ---- カテゴリが移っただけの回は増減として数えない ------------------------
{
  // 同じ実体 (Spi_Driver.Spi_Ack) がメソッドから整合/メソッドへ移る。
  let s = T.emptyState();
  s = run(s, { method: ok({ issues: [SPI] }), consistency: consistency() }, 't1');
  s = run(s, { method: ok({ issues: [] }), consistency: consistency({
    methods: [{ method: 'Spi_Ack', target: 'Spi_Driver', doc: 'spi_init_sequence.puml' }],
  }) }, 't2');
  const rows = T.rows(s);
  assert.strictEqual(rows.length, 1, '再分類で行が 2 つに割れない');
  assert.strictEqual(rows[0].state, 'carried');
  assert.deepStrictEqual(rows[0].cats, ['整合/メソッド']);
}

// ---- 知らない id / 知らない状態は黙って作らない --------------------------
{
  const s = run(T.emptyState(), { method: ok({ issues: [GPIO] }), consistency: consistency() }, 't1');
  assert.strictEqual(T.setVerdict(s, 'F-99', 'partial').ok, false);
  assert.strictEqual(T.setVerdict(s, 'F-01', 'maybe').reason, 'no-such-verdict');
}

// ---- 指摘.md に貼れる表 ----------------------------------------------------
{
  let s = T.emptyState();
  s = run(s, { method: ok({ issues: [GPIO, SPI] }), consistency: consistency() }, 't1');
  s = run(s, { method: ok({ issues: [SPI] }), consistency: consistency() }, 't2');
  s = T.setVerdict(s, 'F-02', 'partial', 'クラス図側のみ未反映', 't2').state;
  const md = T.markdown(s, '指摘トラッカー');
  // BLK-reviewer-20260915-0307-wish で「意図」列が 状態 の次に入った。
  assert.ok(md.indexOf('| id | 状態 | 意図 | 初出 | 対象 | 分類 | 備考 |') >= 0);
  assert.ok(md.indexOf('| F-01 | 解消 | 未対応 | t1 |') >= 0);
  assert.ok(md.indexOf('部分解消') >= 0 && md.indexOf('クラス図側のみ未反映') >= 0);
  assert.ok(md.indexOf('記録した tick: t1 → t2') >= 0);
  assert.ok(T.summaryText(T.rows(s)).indexOf('部分解消 1') >= 0);
}

// ---- CLI の引数 ------------------------------------------------------------
{
  assert.deepStrictEqual(CLI.parseSet('F-03=partial'), { id: 'F-03', state: 'partial' });
  assert.deepStrictEqual(CLI.parseSet('F-03:resolved'), { id: 'F-03', state: 'resolved' });
  assert.strictEqual(CLI.parseSet('F-03'), null);

  const o = CLI.parseArgs(['E:\\dir', '--tick', 'runs/x', '--set', 'F-01=partial', '--note', 'メモ', '--md', 'out.md']);
  assert.deepStrictEqual(o.targets, ['E:\\dir']);
  assert.strictEqual(o.tick, 'runs/x');
  assert.strictEqual(o.set, 'F-01=partial');
  assert.strictEqual(o.note, 'メモ');
  assert.strictEqual(o.mdFile, 'out.md');

  // 対象も --set も無ければ使い方を出して 1。
  const errs = [];
  assert.strictEqual(CLI.main([], { out: () => {}, err: (m) => errs.push(m) }), 1);
  assert.ok(errs.join('\n').indexOf('使い方') >= 0);

  // --set だけなら監査を回さない (控えが無ければ「その id は無い」で 1)。
  const errs2 = [];
  assert.strictEqual(
    CLI.main(['--set', 'F-01=partial', '--no-state'], { out: () => {}, err: (m) => errs2.push(m) }), 1);
  assert.ok(errs2.join('\n').indexOf('控えにありません') >= 0);
}

console.log('blk-reviewer-2206-wish-finding-tracker: ok');
