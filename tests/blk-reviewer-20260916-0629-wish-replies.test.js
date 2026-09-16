'use strict';
// BLK-reviewer-20260916-0629-wish: 指摘.md の各項目と primary の run ログを突き合わせ、
// 「回答済み / 未回答 (N tick 目) / 判定できない」を項目ごとに出す。
// audit.js --board は突合に出ない確認依頼を「解消」と数えるので、そこに頼らない。
var path = require('path');
var fs = require('fs');
var os = require('os');
var RT = require('../src/core/reply-tracker');
var cli = require('../tools/replies');

var MD = [
  '# reviewer 指摘',
  '',
  '## 最優先: diagram1.puml の domain-verdict 切替、意図確認(4tick目)',
  'diagram1.puml 冒頭の `domain-verdict: separate` の意図を primary に確認。`audit.js --board` は解消と出すが未回答。',
  '',
  '## メソッド不一致 F-01〜F-03 (継続)',
  'spi.puml のメソッド呼び出し。',
  '',
  '## SVG',
  'primary 8 枚が古い。',
].join('\n');

function run(ts, reviewer, primary) { return { ts: ts, reviewer: reviewer, primary: primary }; }

describe('reply-tracker: 指摘への回答を run ログから判定する', function() {
  test('見出しの飾りと tick 数を落とした鍵で、図名とキーワードを拾う', function() {
    var items = RT.parseFindings(MD);
    expect(items.length).toBe(3);
    expect(items[0].key).toBe('最優先: diagram1.puml の domain-verdict 切替、意図確認');
    expect(items[0].targets).toEqual(['diagram1']);
    // コマンド (`audit.js --board`) は手掛かりにしない。
    expect(items[0].keywords).toEqual(['domain-verdict']);
    expect(items[1].keywords).toEqual(['F-01', 'F-02', 'F-03']);
    expect(items[2].keywords).toEqual([]);
  });

  test('primary が触れていなければ、続けて触れている reviewer run の数を「N tick 目」で出す', function() {
    var runs = [
      run('20260916-0426', '別件のみ', null),
      run('20260916-0526', 'diagram1.puml の domain-verdict 切替を確認依頼', '関係ない作業'),
      run('20260916-0626', 'diagram1.puml の\ndomain-verdict は未回答', '手順9 docset'),
      run('20260916-2314', 'diagram1.puml の domain-verdict 切替 3tick目', null),
    ];
    var r = RT.judgeAll(MD, runs)[0];
    expect(r.status).toBe('waiting');
    expect(r.firstSeen).toBe('20260916-0526');
    expect(r.waitingTicks).toBe(3);
  });

  test('昔の別件で同じ語が出ていても、途切れた所より前は初出にしない', function() {
    var runs = [
      run('20260914-1006', 'diagram1.puml の domain-verdict 宣言復元', null),
      run('20260915-0406', '別件', null),
      run('20260916-2314', 'diagram1.puml の domain-verdict 確認依頼', null),
    ];
    expect(RT.judgeAll(MD, runs)[0].firstSeen).toBe('20260916-2314');
  });

  test('初出より後の primary.md に図名とキーワードがあれば回答済みで、その行を引用する', function() {
    var runs = [
      run('20260916-0526', 'diagram1.puml の domain-verdict 確認依頼', null),
      run('20260916-0626', 'diagram1.puml の domain-verdict 未回答', '手順5.5: diagram1の\ndomain-verdict: separateは意図的テンプレ切替のまま継続。F-02 は意図明記済み'),
    ];
    var rs = RT.judgeAll(MD, runs);
    expect(rs[0].status).toBe('answered');
    expect(rs[0].answer.ts).toBe('20260916-0626');
    expect(rs[0].answer.line).toContain('意図的テンプレ切替');
    // 番号はそれだけで項目を特定できる。
    runs[0].reviewer += '\nF-01〜F-03 継続';
    runs[1].reviewer += '\nF-01〜F-03 継続';
    expect(RT.judgeAll(MD, runs)[1].status).toBe('answered');
  });

  test('語が拾えない項目は解消にも未回答にも倒さず「判定できない」と名指しする', function() {
    var rs = RT.judgeAll(MD, [run('20260916-2314', 'SVG', null)]);
    expect(rs[2].status).toBe('unknown');
    var text = RT.format(rs);
    expect(text).toContain('判定できない（解消ではない');
    expect(text).toContain('- SVG —');
  });

  test('控えの初出は次回に持ち越され、上書きされない', function() {
    var st = RT.nextState([{ key: 'a', firstSeen: '20260916-0526' }], { a: '20260915-0406' });
    expect(st.a).toBe('20260915-0406');
  });

  test('CLI: 指摘.md と runs を渡すと要約を出し、控えを指摘.md の隣に置く', function() {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'replies-'));
    var rev = path.join(root, 'persona-data', 'reviewer');
    fs.mkdirSync(rev, { recursive: true });
    fs.writeFileSync(path.join(rev, '指摘.md'), MD);
    var r1 = path.join(root, 'loop', 'runs', '20260916-2314');
    fs.mkdirSync(r1, { recursive: true });
    fs.writeFileSync(path.join(r1, 'reviewer.md'), 'diagram1.puml の domain-verdict 確認依頼');
    var res = cli.main([path.join(rev, '指摘.md')], root);
    expect(res.code).toBe(0);
    expect(res.out).toContain('回答待ち 2 件');
    expect(res.out).toContain('1 tick 目');
    expect(fs.existsSync(path.join(rev, '.replies-state.json'))).toBe(true);
    expect(cli.main([path.join(root, 'none.md')], root).code).toBe(1);
  });
});
