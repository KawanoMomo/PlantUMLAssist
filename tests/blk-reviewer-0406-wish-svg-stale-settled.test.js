'use strict';
// BLK-reviewer-20260915-0406-wish: 「SVG 古」は mtime だけを見た答えなので、
// 保存し直しただけで中身は今の puml と一致している図も同じ箱に入っていた。
// reviewer は指摘.md を書く前に、その 9 枚を render API で 1 枚ずつ描き直して
// バイト比較する裏取りを毎回やり直していた。機械の側で「作り直しが要る古さ」と
// 「mtime だけの古さ」を分ける。ここでその分け方を固定する。
const assert = require('assert');
const TL = require('../src/core/audit-timeline');

function svgAudit(rows, staleReasons) {
  return {
    svg: {
      status: 'ok',
      result: {
        rows: rows,
        counts: { fresh: 0, stale: 0, missing: 0, unknown: 0 },
        staleReasons: staleReasons || {},
      },
    },
  };
}

function kindOf(items, name) {
  const it = items.find((i) => i.id === name);
  return it ? it.kind : null;
}

describe('SVG 古の第三状態 (mtime だけが古い)', function() {
  test('畳まれた DSL の可視行が一致した図は、作り直しの箱に入らない', function() {
    const items = TL.itemsOf(svgAudit(
      [{ name: 'a.puml', status: 'stale', content: '' },
       { name: 'b.puml', status: 'stale', content: '' }],
      { 'a.puml': 'same', 'b.puml': 'differ' }));
    assert.strictEqual(kindOf(items, 'a.puml'), 'svg.staleSettled');
    assert.strictEqual(kindOf(items, 'b.puml'), 'svg.stale');
  });

  test('印 / 控えで内容が一致した図 (content) も第三状態になる', function() {
    const items = TL.itemsOf(svgAudit([
      { name: 'match.puml', status: 'stale', content: 'match' },
      { name: 'format.puml', status: 'stale', content: 'format' },
      { name: 'differ.puml', status: 'stale', content: 'differ' },
      { name: 'unknown.puml', status: 'stale', content: 'unverified' },
    ]));
    assert.strictEqual(kindOf(items, 'match.puml'), 'svg.staleSettled');
    assert.strictEqual(kindOf(items, 'format.puml'), 'svg.staleSettled');
    assert.strictEqual(kindOf(items, 'differ.puml'), 'svg.stale');
    // 中身では言えない図は、従来どおり作り直しの箱に残す
    // (分からないことを「読める」と言わない)。
    assert.strictEqual(kindOf(items, 'unknown.puml'), 'svg.stale');
  });

  test('第三状態は除外バケツ — 既定の一覧から外れるが、行は消えない', function() {
    const items = TL.itemsOf(svgAudit([{ name: 'a.puml', status: 'stale' }], { 'a.puml': 'same' }));
    const it = items.find((i) => i.id === 'a.puml');
    assert.strictEqual(it.excluded, true);
    assert.strictEqual(it.category, '出力物/SVG 古(内容一致)');
    assert.deepStrictEqual(it.docs, ['a.puml']);
  });

  test('箱が移っても実体 id は変わらない (解消 + 新規 に見えない)', function() {
    assert.strictEqual(
      TL.entityId('svg.stale', { name: 'a.puml' }),
      TL.entityId('svg.staleSettled', { name: 'a.puml' }));
  });

  test('SVG 無・追いついている図はこれまでどおり', function() {
    const items = TL.itemsOf(svgAudit([
      { name: 'x.puml', status: 'missing' },
      { name: 'y.puml', status: 'fresh' },
    ]));
    assert.strictEqual(kindOf(items, 'x.puml'), 'svg.missing');
    assert.strictEqual(kindOf(items, 'y.puml'), null);
  });

  test('その run で見たカテゴリに第三状態が入る (0 件でも載る)', function() {
    const cats = TL.categoriesOf(svgAudit([]));
    assert.ok(cats.indexOf('出力物/SVG 古(内容一致)') >= 0);
  });
});
