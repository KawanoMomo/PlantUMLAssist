'use strict';
// BLK-owner-20260926-1628-1: 選択枠の当たりの基準 (tests/e2e/hit-baseline.js) の読み方と比べ方。
// 測るのは E2E (migrator-04 の「当て方の回帰」)。ここでは基準に入れる図の選び方と、赤にする条件を守る。
var HB = require('./e2e/hit-baseline.js');

describe('hit-baseline: progress.md から基準に入れる図を選ぶ', function() {
  test('ファイルごとに最後の行で読み、描画 ok かつ枠 ok の図だけを返す', function() {
    var text = [
      '# 進捗',
      'a.puml | 描画 ok | 枠 NG(3/5) | 無変更 ok | 編集 ok | 初回',
      'b.puml | 描画 ok | 枠 ok(25/25) | 無変更 ok | 編集 ok |',
      'c.puml | 描画 NG(欠落) | 枠 ok(4/4) | 無変更 ok | 編集 ok |',
      '進捗: 3 枚 | 自由文の行は | 数えない',
      'a.puml | 描画 ok | 枠 ok(5/5) | 無変更 ok | 編集 ok | 再確認で解消',
      'b.puml | 描画 ok | 枠 NG(24/25、枠なし1) | 無変更 ok | 編集 ok | 退行',
    ].join('\r\n');
    expect(HB.okNamesFromProgress(text)).toEqual(['a.puml']);
  });
});

describe('hit-baseline: 基準と今回を比べる', function() {
  var base = {
    'corpus/x.puml': { 'text@1,1 A': 'participant:2', 'path@5,5': 'message:4', 'rect@9,9': '-', 'text@3,3 B': 'note:6' },
    'web/y.puml': { 'rect@1,1': 'state:3' },
  };

  test('同じ答えなら赤にしない', function() {
    var r = HB.compare(base, {
      'corpus/x.puml': { points: { 'text@1,1 A': 'participant:2', 'path@5,5': 'message:4', 'rect@9,9': '-', 'text@3,3 B': 'note:6' } },
      'web/y.puml': { points: { 'rect@1,1': 'state:3' } },
    });
    expect(r.failed).toBe(0);
    expect(HB.formatReport(r)).toEqual([]);
    expect(r.perFile['corpus/x.puml']).toEqual({ base: 3, now: 3, missing: 0 });
  });

  test('枠が出ていた点の枠なし・別の行の枠は赤、枠なしだった点に枠が出たのは報告だけ', function() {
    var r = HB.compare(base, {
      'corpus/x.puml': { points: { 'text@1,1 A': '-', 'path@5,5': 'participant:2', 'rect@9,9': 'group:7', 'text@3,3 B': 'note:6' } },
      'web/y.puml': { points: { 'rect@1,1': 'state:3' } },
    });
    expect(r.lost.length).toBe(1);
    expect(r.changed.length).toBe(1);
    expect(r.changed[0].now).toBe('participant:2');
    expect(r.gained.length).toBe(1);
    expect(r.failed).toBe(2);
    var lines = HB.formatReport(r);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('枠なし corpus/x.puml text@1,1 A');
    expect(lines[1]).toContain('基準 message:4 → participant:2');
  });

  test('描けなくなった図は赤。点が 1 つ消えただけ (%date の揺れ) は赤にせず、2 つ以上は赤', function() {
    var r1 = HB.compare(base, {
      'corpus/x.puml': { points: { 'path@5,5': 'message:4', 'rect@9,9': '-', 'text@3,3 B': 'note:6' } },
      'web/y.puml': { error: 'ERROR' },
    });
    expect(r1.unrendered.length).toBe(1);
    expect(r1.missing.length).toBe(1);
    expect(r1.failed).toBe(1);
    var r2 = HB.compare(base, {
      'corpus/x.puml': { points: { 'rect@9,9': '-', 'text@3,3 B': 'note:6' } },
      'web/y.puml': { points: { 'rect@1,1': 'state:3' } },
    });
    expect(r2.failed).toBe(2);
    expect(HB.formatReport(r2)[0]).toContain('点が消えた corpus/x.puml 2 点');
  });
});

describe('hit-baseline: 版ごとの基準', function() {
  test('今の jar の版 (1.2026.8) の基準がリポジトリにあり、1 点 1 行で読める', function() {
    var b = HB.readBaseline('1.2026.8');
    expect(b).not.toBeNull();
    expect(b.plantuml).toBe('1.2026.8');
    expect(Object.keys(b.files).length).toBeGreaterThan(100);
  });
});
