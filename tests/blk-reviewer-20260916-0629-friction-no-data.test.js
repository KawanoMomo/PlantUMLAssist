'use strict';
// BLK-reviewer-20260916-0629-friction: 監査ツールの「確認できない」を 3 つに分ける。
//   - blk-check: 語が出ないとき「コマンド失敗 / 比べる対象が無い回 / 対象はあるのに出ない」
//   - audit.js --since-files: 変わった図が 0 枚の回は「対象なし」と言い切る 1 行を出す
//   - audit.js --board: 本文中の確認依頼 (意図確認など) は突合に出なくても「解消」にしない

var digest = require('../src/core/blk-digest');
var rb = require('../src/core/review-board');
var board = require('../src/core/audit-board');
var report = require('../tools/audit-report');

var BLK = digest.parse(['---', 'id: BLK-reviewer-20260916-0526-wish', 'persona: reviewer', 'depth: blocked',
  'status: done / merge: 4c51339', 'task: 全文diff', '---',
  'できるようになったこと:',
  '`node tools/audit.js <保存フォルダ> --summary --since-files <前回の控え>` の「変化の中身」の下に全文 diff が開く。',
].join('\n'));

describe('blk-check の判定 — 語が出ない理由を分ける', function() {
  test('前提: 本文から効き目の語を拾っている', function() {
    expect(BLK.markers.length).toBeGreaterThan(0);
  });

  test('出力に「対象なし」があれば、機能不良ではなく無変化の回 (idle) と言う', function() {
    var out = '図 24 枚\n合計 0 件\n  内容の変化: 対象なし (前回の控えから内容が変わった図は 0 枚)';
    var c = digest.checkOutput(BLK, out);
    expect(c.verdict).toBe('idle');
    expect(c.line).toContain('機能不良ではない');
    expect(c.line).toContain('対象なし');
  });

  test('コマンドが失敗していれば failed (対象なしの語より優先)', function() {
    var c = digest.checkOutput(BLK, '対象なし', { failed: true });
    expect(c.verdict).toBe('failed');
    expect(c.line).toContain('コマンドが失敗');
  });

  test('対象があるのに語が出ないときだけ gone', function() {
    var c = digest.checkOutput(BLK, '図 24 枚\n変わった図: driver_common_class');
    expect(c.verdict).toBe('gone');
    expect(c.line).toContain('対象はあるのに語が出ない');
  });

  test('語が出ていれば、失敗や対象なしの語が混ざっても効いている', function() {
    expect(digest.checkOutput(BLK, '変化の中身: −3 行\n対象なし', { failed: true }).verdict).not.toBe('idle');
  });
});

describe('audit.js --since-files — 変わった図が 0 枚の回', function() {
  test('比べた結果が 0 枚なら「対象なし」の 1 行を出す', function() {
    var lines = report.changedDetailLines({ dataChanged: [], templateChanged: [] },
      { MA: { fileChangeDetail: {} }, prevDocs: [], curDocs: [] });
    expect(lines).toEqual(['  内容の変化: 対象なし (前回の控えから内容が変わった図は 0 枚)']);
  });

  test('控えを渡していない run (比べていない) では何も言わない', function() {
    expect(report.changedDetailLines({ dataChanged: [] }, { MA: { fileChangeDetail: {} } })).toEqual([]);
  });
});

describe('audit.js --board — 確認依頼は突合に出なくても解消にしない', function() {
  var FINDINGS = [
    '# reviewer 指摘',
    '',
    '## 最優先: diagram1.puml の domain-verdict 切替、意図確認は継続保留(4tick目)',
    'diagram1.puml 冒頭の `domain-verdict: separate` コメントは今回も内容変化なし。メソッド/名前突合の対象ではない。',
    '',
    '## 【継続】uart_state.puml の未使用 participant',
    '`uart_state.puml` に宣言だけの participant `Watchdog` がある。',
  ].join('\n');

  var view = rb.build({
    board: board.build({ audits: { consistency: { status: 'ok', result: {
      naming: [], unused: [], methods: [], granularity: [], events: [], methodReplies: [] } } } }),
    findings: FINDINGS,
  });

  test('意図確認の指摘は notAudited、前回の tick のまま', function() {
    var c = view.carried.find(function(x) { return /diagram1/.test(x.finding.title); });
    expect(c.verdict).toBe('notAudited');
    expect(c.tick).toBe(4);
    expect(c.note).toContain('解消を意味しません');
  });

  test('図の中身の指摘は今までどおり、突合に出なければ解消', function() {
    var c = view.carried.find(function(x) { return /uart_state/.test(x.finding.title); });
    expect(c.verdict).toBe('resolved');
  });

  test('要約と 1 枚の画面に「突合の対象外で判定できない」が出て、解消には数えない', function() {
    expect(view.counts.resolved).toBe(1);
    expect(view.counts.notAudited).toBe(1);
    expect(rb.summaryLine(view)).toContain('突合の対象外で判定できない 1 件');
    expect(rb.markdown(view)).toContain('## 前回の指摘 — 突合の対象外で判定できない (本文を読む)（1 件）');
  });
});
