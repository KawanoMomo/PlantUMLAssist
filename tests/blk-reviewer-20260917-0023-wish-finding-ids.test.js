'use strict';
// BLK-reviewer-20260917-0023-wish: findings.js の ID 台帳を、メソッド不一致以外の
// 全カテゴリ (表記揺れ / SVG / 命名規約 / 未使用participant / 章立て対応) にも広げる。
//
// これまで id は全部 `F-nn` の通し番号で、指摘.md に ID を書いていたのは
// 「メソッド不一致 F-01〜F-06」だけだった。他カテゴリは自由文のままなので
// replies.js が語を拾えず「判定できない」に落ちていた。
//   ・id にカテゴリの頭文字 (F/N/U/S/T/C) を付け、カテゴリごとに採番する
//   ・findings.js --sections が 指摘.md に貼れる `## ID 見出し` を出す
//   ・replies.js は見出しだけでなく本文の ID も拾う
var FT = require('../src/core/finding-tracker');
var RT = require('../src/core/reply-tracker');
var cli = require('../tools/findings');

function ok(result) { return { status: 'ok', result: result }; }

// 全カテゴリを 1 件ずつ含む監査結果。
function audits() {
  return {
    name: ok({
      variants: [{ key: 'Irq_Ctrl', suggested: 'Irq_Ctrl',
                   members: [{ name: 'IRQCtrl', docs: ['timer'] }, { name: 'Irq_Ctrl', docs: ['can'] }] }],
      undeclared: [],
    }),
    method: ok({ issues: [{ kind: 'no-method', owner: 'ClockCtrl', method: 'EnableClock', docs: ['spi'] }] }),
    consistency: ok({
      naming: [{ name: 'timerDriver', expected: 'Timer_Driver', doc: 'timer' }],
      unused: [{ name: 'Logger', doc: 'seq1' }],
      methods: [],
      granularity: [{ family: 'adc', label: 'Adc_Ack', onlyIn: 'adc_seq' }],
      events: [],
      methodReplies: [],
    }),
    trace: ok([{ family: 'timer', missing: [{ from: 'A', to: 'B', label: 'start' }], outOfScope: [] }]),
    svg: ok({ rows: [{ name: 'diagram1', status: 'missing' }], staleReasons: {} }),
  };
}

function idsByTitle(state) {
  var out = {};
  FT.rows(state).forEach(function(r) { out[r.title] = r.id; });
  return out;
}

describe('finding-tracker: カテゴリごとの ID 台帳', function() {
  test('メソッド以外のカテゴリにもカテゴリ頭文字つきの id が振られる', function() {
    var st = FT.update(FT.emptyState(), { audits: audits(), label: 't1' });
    var ids = idsByTitle(st);
    // メソッド不一致 = F、表記揺れ / 命名規約 = N、未使用participant = U、
    // SVG = S、章立て対応 (トレース) = T、粒度など残りの整合 = C。
    expect(ids['ClockCtrl.EnableClock']).toBe('F-01');
    expect(ids['Irq_Ctrl']).toBe('N-01');
    expect(ids['timerDriver']).toBe('N-02');
    expect(ids['seq1.Logger']).toBe('U-01');
    expect(ids['diagram1.SVG 無']).toBe('S-01');
    expect(ids['timer.start']).toBe('T-01');
    expect(ids['adc.Adc_Ack']).toBe('C-01');
  });

  test('カテゴリごとに独立して採番する (1 つ増えても他の番号が動かない)', function() {
    var a = audits();
    var st = FT.update(FT.emptyState(), { audits: a, label: 't1' });
    var before = idsByTitle(st);
    a.svg.result.rows.push({ name: 'diagram2', status: 'missing' });
    st = FT.update(st, { audits: a, label: 't2' });
    var after = idsByTitle(st);
    expect(after['diagram2.SVG 無']).toBe('S-02');
    // 既に振った id は動かない。
    Object.keys(before).forEach(function(k) { expect(after[k]).toBe(before[k]); });
  });

  test('同じ指摘は tick をまたいでも同じ id のまま', function() {
    var st = FT.update(FT.emptyState(), { audits: audits(), label: 't1' });
    st = FT.update(st, { audits: audits(), label: 't2' });
    expect(idsByTitle(st)['Irq_Ctrl']).toBe('N-01');
  });

  test('既存の控えの F-nn は書き換えず、新しい指摘だけが接頭辞つきになる', function() {
    // 旧版が付けた通し番号の控え (全部 F-)。
    var legacy = {
      version: FT.VERSION, seq: 2, ticks: [{ label: 't0', at: 't0' }],
      findings: {
        'clockctrl/enableclock': { id: 'F-01', entity: 'clockctrl/enableclock',
          title: 'ClockCtrl.EnableClock', since: 't0', sinceIndex: 0, marks: [1],
          verdict: null, cats: ['メソッド'], docs: ['spi'] },
        'diagram1/svg': { id: 'F-02', entity: 'diagram1/svg', title: 'diagram1.SVG 無',
          since: 't0', sinceIndex: 0, marks: [1], verdict: null,
          cats: ['出力物/SVG 無'], docs: ['diagram1'] },
      },
    };
    var st = FT.update(legacy, { audits: audits(), label: 't1' });
    var ids = idsByTitle(st);
    expect(ids['ClockCtrl.EnableClock']).toBe('F-01');   // 既存の id は温存
    expect(ids['Irq_Ctrl']).toBe('N-01');                // 新しい指摘は接頭辞つき
    // 既に F-01/F-02 が居るので、新しい F はぶつからない番号から始まる。
    expect(ids['diagram1.SVG 無']).toBe('F-02');
  });

  test('setVerdict は接頭辞つきの id でも引ける', function() {
    var st = FT.update(FT.emptyState(), { audits: audits(), label: 't1' });
    var r = FT.setVerdict(st, 'S-01', 'wontfix', '書き出し待ち', 't1');
    expect(r.ok).toBe(true);
    var row = FT.rows(r.state).filter(function(x) { return x.id === 'S-01'; })[0];
    expect(row.state).toBe('wontfix');
  });

  test('sections() は 指摘.md に貼れる `## ID 見出し` を全カテゴリ分出す', function() {
    var st = FT.update(FT.emptyState(), { audits: audits(), label: 't1' });
    var md = FT.sections(st);
    expect(md).toContain('## N-01 Irq_Ctrl');
    expect(md).toContain('## S-01 diagram1.SVG 無');
    expect(md).toContain('## T-01 timer.start');
    // 節には ID がバッククォートでも出る (replies.js が語として拾える形)。
    expect(md).toContain('`N-01`');
  });
});

describe('findings.js --sections', function() {
  test('監査を回さず、控えだけから 指摘.md 用の節を出せる', function() {
    var fs = require('fs');
    var os = require('os');
    var path = require('path');
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'findings-sections-'));
    var file = path.join(dir, 'state.json');
    fs.writeFileSync(file, JSON.stringify(FT.update(FT.emptyState(), { audits: audits(), label: 't1' })), 'utf-8');

    var out = [];
    var code = cli.main(['--sections', '--state', file], { out: function(s) { out.push(String(s)); } });
    expect(code).toBe(0);
    var text = out.join('\n');
    expect(text).toContain('## N-01 Irq_Ctrl');
    expect(text).toContain('## S-01 diagram1.SVG 無');
    expect(text).toContain('## U-01 seq1.Logger');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('reply-tracker: 全カテゴリの ID で回答を突き合わせる', function() {
  var MD = [
    '# reviewer 指摘',
    '',
    '## 表記揺れ(primary×junior: 4組、継続)',
    '`N-01` IRQCtrl⇔Irq_Ctrl の組。primary に意図を確認。',
    '',
    '## SVG',
    'primary 8 枚が古い (`S-01`)。',
    '',
    '## 命名規約 / 未使用participant / 章立て対応',
    'U-01 と T-01 は該当設計書なし。',
  ].join('\n');

  test('本文の ID も項目の手掛かりにする (見出しだけでなく)', function() {
    var items = RT.parseFindings(MD);
    expect(items[0].keywords).toContain('N-01');
    expect(items[1].keywords).toContain('S-01');
    // バッククォートが無い本文の ID も拾う。
    expect(items[2].keywords).toContain('U-01');
    expect(items[2].keywords).toContain('T-01');
  });

  test('primary が ID で答えていれば「回答済み」になる', function() {
    var runs = [
      { ts: '20260916-0400', reviewer: '表記揺れ `N-01` を確認中', primary: null },
      { ts: '20260916-0600', reviewer: null, primary: 'N-01 は意図的な別名。統一しない' },
    ];
    var res = RT.judgeAll(MD, runs, {});
    var hen = res[0];
    expect(hen.status).toBe('answered');
    expect(hen.answer.ts).toBe('20260916-0600');
  });

  test('ID の無いカテゴリ見出しは、これまで通り「判定できない」に落ちる', function() {
    var res = RT.judgeAll('# x\n\n## SVG\n古い図がある。\n', [
      { ts: '20260916-0400', reviewer: 'SVG', primary: null },
    ], {});
    expect(res[0].status).toBe('unknown');
  });
});
