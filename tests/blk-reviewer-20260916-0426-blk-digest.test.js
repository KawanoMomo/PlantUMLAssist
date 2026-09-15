'use strict';
// BLK-reviewer-20260916-0426: 直前の tick で done になった BLK が効いているかを
// 確かめるのに、100 行前後の実装ログを 1 件ずつ全文読み、本文のどこかに書かれた
// コマンドを目で拾って打ち直していた。DSL に変化が無い tick でも確認自体は省けず、
// 同じ数件を毎 tick 読み直すことになる。BLK を数行のカードに畳み、本文のコマンドと
// 「効き目の語」を機械が拾えれば、読み直しは要らなくなる。

var digest = require('../src/core/blk-digest');

// 実物 (BLK-reviewer-20260916-0046) の書式をそのまま縮めたもの。
var DONE = ['---',
  'id: BLK-reviewer-20260916-0046',
  'persona: reviewer',
  'depth: friction',
  'status: done / merge: d9f5dce',
  'builder: builder-1 run=20260916-0326',
  'task: 4.10/5 audit.jsは「可視内容の食い違い」を図名だけ列挙し、消えた具体的な行を出さない',
  '---',
  '`node tools/audit.js -p primary --since-files <prev>` は driver_common_class.puml',
  'を名指しするが、何行目のどのクラスが消えたかは出さない。',
  '',
  '実装 (builder-1 run=20260916-0326):',
  '- 変更: src/core/file-change-detail.js (新規)、tools/audit-report.js、tools/audit.js、',
  '  tests/blk-reviewer-20260916-0046-file-change-detail.test.js (新規)',
  '- unit: 5456 passed / 0 failed',
  '- merge: d9f5dce',
  '',
  '実測 (friction、画面を持たない CLI の手順):',
  '手順4.10/5 で打つコマンドは `node tools/audit.js <保存フォルダ> --summary --since-files <控え> --no-state`',
  'のまま変わらない (打鍵 83)。',
  '',
  'できるようになったこと:',
  '`--since-files` を付けた監査の出力に「変化の中身:」の行が増えます。描かれる行が',
  '動いていない図は「描かれる行に差なし」と 1 行で片付きます。',
].join('\n');

var OPEN = ['---', 'id: BLK-reviewer-20260916-0426', 'persona: reviewer',
  'depth: friction', 'status: open', 'task: 8 解消確認に実装ログを全文読む', '---',
  '本文。'].join('\n');

describe('blk-digest: 完了した BLK を解消確認カードに畳む', function() {

  test('frontmatter と merge hash を読む', function() {
    var blk = digest.parse(DONE);
    expect(blk.id).toBe('BLK-reviewer-20260916-0046');
    expect(blk.status).toBe('done');
    expect(blk.merge).toBe('d9f5dce');
    expect(blk.builder).toBe('builder-1');
    expect(blk.run).toBe('20260916-0326');
    expect(blk.persona).toBe('reviewer');
  });

  test('本文の inline code から、打ち直すコマンドだけを拾う', function() {
    var blk = digest.parse(DONE);
    expect(blk.commands.length).toBe(2);
    expect(blk.commands[0]).toContain('node tools/audit.js -p primary --since-files');
    // `--since-files` のような単なる強調は コマンドとして拾わない。
    blk.commands.forEach(function(c) { expect(c.indexOf('node ')).toBe(0); });
  });

  test('「できるようになったこと」の鉤括弧を、出力に出るはずの語として拾う', function() {
    var blk = digest.parse(DONE);
    expect(blk.markers).toContain('変化の中身:');
    expect(blk.markers).toContain('描かれる行に差なし');
  });

  test('変更ファイルを折り返し行込みで拾い、(新規) の注記は落とす', function() {
    var blk = digest.parse(DONE);
    expect(blk.files).toContain('src/core/file-change-detail.js');
    expect(blk.files).toContain('tools/audit.js');
    expect(blk.files).toContain('tests/blk-reviewer-20260916-0046-file-change-detail.test.js');
    expect(blk.files.indexOf('5456')).toBe(-1);
  });

  test('カードは本文より短く、id・穴・コマンド・効き目の語を含む', function() {
    var blk = digest.parse(DONE);
    var lines = digest.card(blk);
    expect(lines.length).toBeLessThan(blk.bodyLines / 2);
    expect(lines[0]).toContain('BLK-reviewer-20260916-0046');
    expect(lines[0]).toContain('merge d9f5dce');
    expect(lines.join('\n')).toContain('確認コマンド: node tools/audit.js');
    expect(lines.join('\n')).toContain('出力に出るはず');
  });

  test('コマンドの記載が無い BLK でも、カードはその旨を言って落ちない', function() {
    var blk = digest.parse(OPEN);
    var lines = digest.card(blk);
    expect(lines.join('\n')).toContain('(本文に記載なし)');
  });

  test('確認済みの id は出さず、新しく done になった分だけを古い順に返す', function() {
    var a = digest.parse(DONE);
    var b = digest.parse(DONE.replace('20260916-0046', '20260916-0326'));
    var c = digest.parse(OPEN);
    var got = digest.pending([b, a, c], { seen: [] });
    expect(got.map(function(x) { return x.id; }))
      .toEqual(['BLK-reviewer-20260916-0046', 'BLK-reviewer-20260916-0326']);
    expect(digest.pending([b, a, c], { seen: ['BLK-reviewer-20260916-0046'] })
      .map(function(x) { return x.id; })).toEqual(['BLK-reviewer-20260916-0326']);
    // --all は控えを無視して全部出す。
    expect(digest.pending([b, a, c], { seen: ['BLK-reviewer-20260916-0046'], all: true }).length)
      .toBe(2);
  });

  test('直近 N 時間に done になった分 / persona で絞れる', function() {
    var now = Date.UTC(2026, 8, 16, 5, 0, 0);
    var fresh = digest.parse(DONE); fresh.mtime = now - 30 * 60 * 1000;
    var old = digest.parse(DONE.replace('20260916-0046', '20260914-2206'));
    old.mtime = now - 40 * 3600 * 1000;
    var other = digest.parse(DONE.replace('20260916-0046', '20260916-0100')
      .replace('persona: reviewer', 'persona: primary'));
    other.mtime = now - 10 * 60 * 1000;

    expect(digest.within([fresh, old, other], { hours: 6, now: now }).length).toBe(2);
    expect(digest.within([fresh, old, other], { persona: 'reviewer', now: now }).length).toBe(2);
    expect(digest.pending([fresh, old, other], { hours: 6, persona: 'reviewer', now: now })
      .map(function(x) { return x.id; })).toEqual(['BLK-reviewer-20260916-0046']);
    // 絞りを指定しなければ全件 (mtime を持たない BLK も落とさない)。
    expect(digest.within([digest.parse(DONE)], { now: now }).length).toBe(1);
    expect(digest.within([digest.parse(DONE)], { hours: 6, now: now }).length).toBe(0);
  });

  test('<保存フォルダ> と <控え> を実パスに埋め、埋まらない穴は残す', function() {
    var blk = digest.parse(DONE);
    var r = digest.resolveCommand(blk.commands[1], { folder: 'D:/now', prev: 'D:/prev' });
    expect(r.runnable).toBe(true);
    expect(r.command).toContain('D:/now --summary --since-files D:/prev');
    var half = digest.resolveCommand(blk.commands[1], { folder: 'D:/now' });
    expect(half.runnable).toBe(false);
    expect(half.missing).toEqual(['<控え>']);
    // <prev> も控え側と見なす。
    expect(digest.resolveCommand(blk.commands[0], { folder: 'D:/now', prev: 'D:/prev' }).command)
      .toContain('--since-files D:/prev');
  });

  test('出力に効き目の語が出ているかで、効いている/消えたを言い分ける', function() {
    var blk = digest.parse(DONE);
    expect(digest.checkOutput(blk, '変化の中身: −8 行\n描かれる行に差なし').verdict).toBe('effective');
    expect(digest.checkOutput(blk, '変化の中身: −8 行').verdict).toBe('partial');
    expect(digest.checkOutput(blk, '可視内容の食い違い: 2 図').verdict).toBe('gone');
    expect(digest.checkOutput(blk, '変化の中身:').matched).toBe(1);
    // 語を持たない BLK は判定しない (出力を直接見る)。
    expect(digest.checkOutput(digest.parse(OPEN), '何か').verdict).toBe('unknown');
  });

  test('空白の入り方が違っても、語が出ていれば効いていると見る', function() {
    var blk = digest.parse(DONE);
    expect(digest.checkOutput(blk, '変化の中身 :\n描かれる 行に差なし').matched).toBe(2);
    expect(digest.checkOutput(blk, '  変化の中身:  \n 描かれる行に差なし ').verdict).toBe('effective');
  });
});
