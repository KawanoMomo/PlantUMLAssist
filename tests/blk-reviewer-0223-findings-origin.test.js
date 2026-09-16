'use strict';
// BLK-reviewer-20260917-0223: `.findings-state.json` は persona ごとに同じ名前で
// 存在するので、`--state` に別の persona の控えを渡しても文法エラーにならず、
// 「その persona の分しか出ない」結果が黙って返る。reviewer はそれを機能の不具合と
// 誤読した。控えに「どの対象を見た記録か」を焼き付け、今回の対象と食い違えば
// 名指しで言う。対象を渡さない読み出しでも、どの控えを見ているかを必ず出す。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tracker = require('../src/core/finding-tracker');
const findings = require('../tools/findings');

function tmpdir(name) {
  const d = path.join(os.tmpdir(), 'pua-origin-' + name + '-' + process.pid);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe('控えが見た対象の記録', function() {
  test('update に origin を渡すと控えに残り、readState で読み戻せる', function() {
    const st = tracker.update(tracker.emptyState(), {
      items: [], label: 't1', at: 't1', origin: ['E:\\data\\primary'],
    });
    assert.deepStrictEqual(st.origin, ['E:\\data\\primary']);
    assert.deepStrictEqual(tracker.originOf(tracker.readState(JSON.parse(JSON.stringify(st)))),
      ['E:\\data\\primary']);
  });

  test('origin を渡さない回は前回の記録を消さない', function() {
    const a = tracker.update(tracker.emptyState(), { items: [], label: 't1', origin: ['E:\\data\\primary'] });
    const b = tracker.update(a, { items: [], label: 't2' });
    assert.deepStrictEqual(b.origin, ['E:\\data\\primary']);
  });

  test('古い控え (origin なし) は空として読む', function() {
    assert.deepStrictEqual(tracker.originOf(tracker.readState(
      { version: tracker.VERSION, seq: 0, ticks: [], findings: {} })), []);
  });
});

describe('控えと対象の突き合わせ', function() {
  const ST = tracker.update(tracker.emptyState(), {
    items: [], label: 't1', origin: ['E:\\persona-data\\reviewer'],
  });

  test('別の persona の控えを渡した回は食い違いとして返る', function() {
    const r = tracker.originCheck(ST, ['E:\\persona-data\\primary']);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.origin, ['E:\\persona-data\\reviewer']);
    assert.deepStrictEqual(r.targets, ['E:\\persona-data\\primary']);
  });

  test('同じ対象なら区切り記号と大文字小文字の違いは食い違いにしない', function() {
    assert.strictEqual(tracker.originCheck(ST, ['e:/persona-data/reviewer/']).ok, true);
  });

  test('判定できない回 (古い控え / 対象なし) は食い違いにしない', function() {
    assert.strictEqual(tracker.originCheck(ST, []).ok, true);
    assert.strictEqual(tracker.originCheck(tracker.emptyState(), ['E:\\x']).ok, true);
  });
});

describe('CLI の警告', function() {
  test('別 persona の控えを --state に渡すと、その旨を名指しで言う', function() {
    const mine = tmpdir('mine');
    const other = tmpdir('other');
    const store = tracker.update(tracker.emptyState(), { items: [], label: 't1', origin: [other] });
    const notes = findings.stateNotes(path.join(other, '.findings-state.json'), store, [mine]);
    const text = notes.join('\n');
    assert.ok(/控えと今回の対象が違います/.test(text), text);
    assert.ok(text.indexOf(other) >= 0 && text.indexOf(mine) >= 0, text);
    // 既定の置き場所 (対象フォルダの中) も併せて示す。
    assert.ok(text.indexOf(path.join(mine, '.findings-state.json')) >= 0, text);
  });

  test('対象フォルダの中の控えを素直に使う回は何も言わない', function() {
    const mine = tmpdir('plain');
    const store = tracker.update(tracker.emptyState(), { items: [], label: 't1', origin: [mine] });
    assert.deepStrictEqual(findings.stateNotes(path.join(mine, '.findings-state.json'), store, [mine]), []);
  });

  test('取り違えた回は出所の記録を塗り潰さない (警告が 1 回で消えない)', function() {
    // 食い違ったまま origin を上書きすると、次の回からは「今回の対象と同じ」に
    // 見えて警告が出なくなる。取り違えの回は origin を渡さない、が CLI 側の約束。
    const kept = tracker.update(
      tracker.update(tracker.emptyState(), { items: [], label: 't1', origin: ['E:\\pd\\reviewer'] }),
      { items: [], label: 't2', origin: [] });
    assert.deepStrictEqual(kept.origin, ['E:\\pd\\reviewer']);
    assert.strictEqual(tracker.originCheck(kept, ['E:\\pd\\primary']).ok, false);
  });

  test('控えがどの対象を見た記録かを 1 行で出せる', function() {
    const store = tracker.update(tracker.emptyState(), { items: [], label: 't1', origin: ['E:\\persona-data\\primary'] });
    assert.ok(/この控えが見た対象: E:\\persona-data\\primary/.test(findings.originLine(store)));
    assert.strictEqual(findings.originLine(tracker.emptyState()), '');
  });
});
