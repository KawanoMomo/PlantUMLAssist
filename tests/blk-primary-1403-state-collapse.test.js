'use strict';
// BLK-primary-20260908-1403: レビュー指摘「dma_state.puml だけ 1 メッセージが
// 4 遷移に分解されている」を当てる口が GUI に無く、state 3 行 + 遷移 4 行を
// DSL エディタで打ち直していた。
//
// 見たいこと:
//   - 1 本道の連なりを 1 本の遷移に畳める (途中の状態の宣言も消える)
//   - 分かれ道・別の入口がある所では止まる (畳んで行けない枝を作らない)
//   - 他からも使われている途中の状態は宣言を残す
//   - 押す前に「何遷移をまとめ、何個消えるか」が言える
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/state-transition.js',
  '../src/core/state-collapse.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const assert = require('assert');
const sc = global.window.MA.stateCollapse;

// 指摘そのものの図 (dma_state.puml の粒度)
const DMA = [
  '@startuml',
  'state Idle',
  'state Configured',
  'state SrcDstSet',
  'state DmaReqEnabled',
  'state Transferring_Active',
  'Idle --> Configured : Dma_Init',
  'Configured --> SrcDstSet : Dma_SetSrcDst',
  'SrcDstSet --> DmaReqEnabled : Dma_EnableReq',
  'DmaReqEnabled --> Transferring_Active : Dma_Start',
  'Transferring_Active --> Idle : Dma_Stop',
  '@enduml',
].join('\n');

// state.js の parse を使わず、この試験に要る形だけを組む
// (parse は modules/state.js にあり、core の試験からは重い依存になる)。
function parse(text) {
  const states = [], transitions = [];
  text.split('\n').forEach(function(raw, i) {
    const line = raw.trim(), n = i + 1;
    let m = line.match(/^state\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    if (m) { states.push({ id: m[1], label: m[1], parentId: null, line: n, endLine: n }); return; }
    m = line.match(/^(\[\*\]|[A-Za-z_][A-Za-z0-9_]*)\s*-->\s*(\[\*\]|[A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(.*))?$/);
    if (m) {
      transitions.push({ id: '__t_' + transitions.length, from: m[1], to: m[2],
        label: m[3] ? m[3].trim() : null, line: n });
    }
  });
  return { states: states, transitions: transitions, notes: [] };
}

// ── 1 本道をたどる ──────────────────────────────────────────────────────
{
  const p = parse(DMA);
  const chain = sc.chainFrom(p, 'Idle');
  assert.deepStrictEqual(chain.map(function(t) { return t.to; }),
    ['Configured', 'SrcDstSet', 'DmaReqEnabled', 'Transferring_Active'],
    'Idle から 4 遷移が 1 本道でつながる');
  // Transferring_Active --> Idle があるので Idle には入口がある → そこで止まる
  assert.strictEqual(chain.length, 4, '輪を回り続けない');
}

// ── まとめる ────────────────────────────────────────────────────────────
{
  const p = parse(DMA);
  const pv = sc.preview(p, 'Idle', 'Transferring_Active', 'Dma_Configure');
  assert.strictEqual(pv.ok, true);
  assert.strictEqual(pv.transitions, 4, '4 遷移をまとめると言う');
  assert.deepStrictEqual(pv.removedStates, ['Configured', 'SrcDstSet', 'DmaReqEnabled'],
    '途中の 3 状態の宣言が消える');
  assert.strictEqual(pv.line, 'Idle --> Transferring_Active : Dma_Configure', '残る 1 行を先に見せる');

  const out = sc.collapse(DMA, p, 'Idle', 'Transferring_Active', 'Dma_Configure');
  const lines = out.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  assert.ok(lines.indexOf('Idle --> Transferring_Active : Dma_Configure') >= 0, '1 本になった遷移が入る');
  ['Configured', 'SrcDstSet', 'DmaReqEnabled'].forEach(function(id) {
    assert.strictEqual(out.indexOf(id), -1, id + ' がどこにも残らない');
  });
  assert.ok(lines.indexOf('Transferring_Active --> Idle : Dma_Stop') >= 0, '道の外の遷移は残る');
  assert.ok(lines.indexOf('state Idle') >= 0 && lines.indexOf('state Transferring_Active') >= 0,
    '始点と終点の宣言は残る');
  // 他系統と同じ 1:1 の粒度になった
  assert.strictEqual(parse(out).transitions.length, 2, '遷移が 5 本から 2 本になる');
}

// ── 途中まででも畳める ──────────────────────────────────────────────────
{
  const p = parse(DMA);
  const out = sc.collapse(DMA, p, 'Idle', 'SrcDstSet', 'Dma_Configure');
  const q = parse(out);
  assert.strictEqual(q.transitions.length, 4, '2 遷移が 1 本になり 5 本から 4 本');
  assert.strictEqual(out.indexOf('Configured'), -1, '間の 1 状態だけ消える');
  assert.ok(out.indexOf('SrcDstSet --> DmaReqEnabled') >= 0, '終点から先はそのまま');
}

// ── 分かれ道では止まる ──────────────────────────────────────────────────
{
  const FORK = [
    '@startuml',
    'state A', 'state B', 'state C', 'state D',
    'A --> B : go',
    'B --> C : ok',
    'B --> D : ng',
    '@enduml',
  ].join('\n');
  const p = parse(FORK);
  assert.strictEqual(sc.chainFrom(p, 'A').length, 1, '出口が 2 本ある状態で打ち切る');
  assert.deepStrictEqual(sc.pathBetween(p, 'A', 'C'), [], '分かれた先までの道は取れない');
  assert.strictEqual(sc.preview(p, 'A', 'C').ok, false, '畳めないと言う');
  assert.strictEqual(sc.collapse(FORK, p, 'A', 'C', 'x'), FORK, '畳めないときは何も変えない');
  assert.deepStrictEqual(sc.startOptions(p), [], 'まとめられる始点が無ければ何も出さない');
}

// ── 別の入口がある状態では止まる ────────────────────────────────────────
{
  const JOIN = [
    '@startuml',
    'state A', 'state B', 'state C', 'state X',
    'A --> B : go',
    'X --> B : also',
    'B --> C : next',
    '@enduml',
  ].join('\n');
  const p = parse(JOIN);
  assert.strictEqual(sc.chainFrom(p, 'A').length, 1, '入口が 2 本ある B の先へは進まない');
}

// ── 他からも使われている途中の状態は宣言を残す ──────────────────────────
{
  const KEEP = [
    '@startuml',
    'state A', 'state B', 'state C', 'state D',
    'A --> B : go',
    'B --> C : next',
    'C --> D : end',
    'D --> B : back',
    '@enduml',
  ].join('\n');
  const p = parse(KEEP);
  // D --> B があるので B には入口が 2 本 → A からは B までしか進めない
  assert.strictEqual(sc.chainFrom(p, 'A').length, 1);
  // B から C, D は 1 本道 (D --> B は D の出口で C の入口ではない)
  const pv = sc.preview(p, 'B', 'D', 'BtoD');
  assert.strictEqual(pv.ok, true);
  assert.deepStrictEqual(pv.removedStates, ['C'], 'C だけ消える');
  const out = sc.collapse(KEEP, p, 'B', 'D', 'BtoD');
  assert.ok(out.indexOf('B --> D : BtoD') >= 0);
  assert.ok(out.indexOf('D --> B : back') >= 0, '道の外の遷移は残る');
  assert.strictEqual(out.indexOf('state C'), -1);
}

// ── 選択肢 ──────────────────────────────────────────────────────────────
{
  const p = parse(DMA);
  // 1 本道が 2 遷移以上続く状態はどれも始点になれる (どこからどこまでを
  // まとめるかは指摘の側が決めるので、こちらで 1 つに絞らない)。
  assert.ok(sc.startOptions(p).map(function(o) { return o.value; }).indexOf('Idle') >= 0,
    '指摘の始点 Idle が並ぶ');
  const ends = sc.endOptions(p, 'Idle');
  assert.deepStrictEqual(ends.map(function(o) { return o.value; }),
    ['SrcDstSet', 'DmaReqEnabled', 'Transferring_Active'], '2 遷移目から先を終点に出す');
  assert.ok(/4 遷移/.test(ends[2].label), 'どこまでで何遷移になるかを見出しに書く');
}

// ── ラベルの下書き ──────────────────────────────────────────────────────
{
  const p = parse(DMA);
  assert.strictEqual(sc.suggestLabel(p, 'Idle', 'Transferring_Active'),
    'Dma_Init / Dma_SetSrcDst / Dma_EnableReq / Dma_Start',
    '畳む前のきっかけを並べて下書きにする');
  const NOLBL = ['@startuml', 'state A', 'state B', 'state C', 'A --> B', 'B --> C', '@enduml'].join('\n');
  assert.strictEqual(sc.suggestLabel(parse(NOLBL), 'A', 'C'), '', 'きっかけが無ければ空');
}

// ── ラベル無しでも畳める ────────────────────────────────────────────────
{
  const NOLBL = ['@startuml', 'state A', 'state B', 'state C', 'A --> B', 'B --> C', '@enduml'].join('\n');
  const out = sc.collapse(NOLBL, parse(NOLBL), 'A', 'C', '');
  assert.ok(out.indexOf('A --> C') >= 0 && out.indexOf('A --> C :') < 0, 'ラベル無しなら : を付けない');
}

// ── 字下げを保つ ────────────────────────────────────────────────────────
{
  const IND = ['@startuml', 'state Big {', '  state A', '  state B', '  state C',
    '  A --> B : go', '  B --> C : next', '}', '@enduml'].join('\n');
  const p = parse(IND);
  const out = sc.collapse(IND, p, 'A', 'C', 'AtoC');
  assert.ok(out.split('\n').indexOf('  A --> C : AtoC') >= 0, '元の行の字下げをそのまま使う');
}

console.log('blk-primary-1403-state-collapse: ok');
