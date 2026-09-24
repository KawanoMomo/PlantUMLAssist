'use strict';
// BLK-human-20260923-1702 (design 10c): 保存先が Git のとき、FILES ツリーの下端に GIT 欄と
// 「この図の履歴」を出し、過去のコミットを比較相手に選べるようにする。

var W = (typeof window !== 'undefined' && window) || global.window;
var GP = W.MA.gitPanel;

var STATUS = {
  repo: true, branch: 'main', ahead: 1, behind: 0,
  changes: [
    { code: 'A', path: 'junior/spi_new.puml', file: 'spi_new.puml', name: 'spi_new' },
    { code: 'M', path: 'junior/spi_init_sequence.puml', file: 'spi_init_sequence.puml', name: 'spi_init_sequence' },
    { code: 'D', path: 'junior/old.puml', file: 'old.puml', name: 'old' },
  ],
};

var COMMITS = [
  { hash: 'a3f91c2aaaa', short: 'a3f91c2', author: 'junior', date: '2026-09-23T06:30:00+09:00', message: 'Fault 通知の応答を追記', tags: [], head: true, added: 2, removed: 0 },
  { hash: '7be04d1bbbb', short: '7be04d1', author: 'junior', date: '2026-09-21T18:02:00+09:00', message: 'CR1 書き込みを追加', tags: [], head: false, added: 3, removed: 1 },
  { hash: '01de5a9cccc', short: '01de5a9', author: 'senior', date: '2026-09-10T09:15:00+09:00', message: '初版', tags: ['v1.2'], head: false, added: 12, removed: 0 },
];

describe('GIT 欄を出すか (design 10c)', function() {
  test('作業木でない・git が無い保存先では出さない', function() {
    expect(GP.visible({ repo: false })).toBe(false);
    expect(GP.visible({ available: false, repo: false })).toBe(false);
    expect(GP.visible(null)).toBe(false);
    expect(GP.visible(STATUS)).toBe(true);
  });

  test('見出しは ⎇ ブランチ ↑ ↓', function() {
    expect(GP.headLabel(STATUS)).toBe('⎇ main ↑1 ↓0');
    expect(GP.headLabel({ repo: false })).toBe('');
  });

  test('畳んだ件数は file-tree の main · M 3 ↑1 の形に渡す', function() {
    expect(W.MA.fileTree.gitCountLabel(GP.countSource(STATUS))).toBe('main · M 3 ↑1');
    expect(W.MA.fileTree.gitCountLabel(GP.countSource({ repo: false }))).toBe('');
  });
});

describe('変更とツリーの M / A', function() {
  test('変更は M → A → D の順', function() {
    expect(GP.changes(STATUS).map(function(c) { return c.code; })).toEqual(['M', 'A', 'D']);
    expect(GP.changesLabel(STATUS)).toBe('変更 3');
  });

  test('ツリーのファイル名に付ける印は拡張子の有無を問わない', function() {
    var m = GP.marksByName(STATUS);
    expect(GP.markOf(m, 'spi_init_sequence')).toBe('M');
    expect(GP.markOf(m, 'spi_new.puml')).toBe('A');
    expect(GP.markOf(m, 'other')).toBe('');
  });

  test('変更が無いかメッセージが空ならコミットを押せない', function() {
    expect(GP.canCommit(STATUS, '')).toBe(false);
    expect(GP.canCommit(STATUS, '  ')).toBe(false);
    expect(GP.canCommit(STATUS, 'CR1 を追加')).toBe(true);
    expect(GP.canCommit({ repo: true, branch: 'main', changes: [] }, 'x')).toBe(false);
  });
});

describe('この図の履歴と比較相手', function() {
  // BLK-builder-20260924-2246-1 (design 10c「初版 v1.2 / 01de5a9 · senior · 09-10 09:15 / +12」): タグは副題ではなく
  // メッセージの横の札 (commitTags)。図を作ったコミット (created) の右端は「+12」だけ。
  test('行の副題は ハッシュ · 作成者 · 日付 · HEAD (タグは副題に入れず、メッセージの横の札)', function() {
    expect(GP.commitMeta(COMMITS[0])).toBe('a3f91c2 · junior · 09-23 06:30 · HEAD');
    expect(GP.commitMeta(COMMITS[2])).toBe('01de5a9 · senior · 09-10 09:15');
    expect(GP.commitTags(COMMITS[2])).toEqual(['v1.2']);
    expect(GP.commitTags(COMMITS[0])).toEqual([]);
    expect(GP.commitTags({ tags: ['', 'v2'] })).toEqual(['v2']);
    expect(GP.commitTags(null)).toEqual([]);
    expect(GP.commitStat(COMMITS[1])).toBe('+3 −1');
    expect(GP.commitStat(COMMITS[0])).toBe('+2 −0');
  });

  test('図を作ったコミットの右端は「+12」だけ (削る行がそもそも無い)', function() {
    var first = Object.assign({}, COMMITS[2], { created: true });
    expect(GP.commitStat(first)).toBe('+12');
    // 作ったと同時に別の図を削った等で削除行があれば、今までどおり両方出す。
    expect(GP.commitStat(Object.assign({}, first, { removed: 2 }))).toBe('+12 −2');
    // created を持たない (古い server の返り) なら −0 を出す。
    expect(GP.commitStat(COMMITS[2])).toBe('+12 −0');
  });

  test('メッセージ・作成者・ハッシュ・タグで絞り込める', function() {
    expect(GP.filterCommits(COMMITS, 'cr1').length).toBe(1);
    expect(GP.filterCommits(COMMITS, 'senior')[0].short).toBe('01de5a9');
    expect(GP.filterCommits(COMMITS, '7be0')[0].short).toBe('7be04d1');
    expect(GP.filterCommits(COMMITS, 'v1.2')[0].short).toBe('01de5a9');
    expect(GP.filterCommits(COMMITS, '').length).toBe(3);
  });

  test('◀ は 1 つ古く、▶ は 1 つ新しく。端では動かない', function() {
    expect(GP.step(COMMITS, 'a3f91c2', -1).short).toBe('7be04d1');
    expect(GP.step(COMMITS, '7be04d1', 1).short).toBe('a3f91c2');
    expect(GP.step(COMMITS, 'a3f91c2', 1)).toBe(null);
    expect(GP.step(COMMITS, '01de5a9', -1)).toBe(null);
    expect(GP.step(COMMITS, 'zzz', -1)).toBe(null);
  });

  test('右の枠の見出しと左右の札', function() {
    expect(GP.paneTitle(COMMITS[0])).toBe('a3f91c2 · Fault 通知の応答を追記');
    expect(GP.sidesLabel(COMMITS[0])).toBe('左: 作業中 右: a3f91c2');
  });

  test('相手を選ぶタブは コミット / ブランチ・タグ / 読むだけのフォルダ', function() {
    expect(GP.pickTabs().map(function(t) { return t.id; })).toEqual(['commits', 'refs', 'folder']);
  });

  test('ブランチとタグを 1 本に並べて絞り込める', function() {
    var refs = { branches: [{ name: 'main', short: 'a3f91c2', current: true }, { name: 'feature/x', short: '7be04d1' }],
                 tags: [{ name: 'v1.2', short: '01de5a9' }] };
    expect(GP.refRows(refs, '').map(function(r) { return r.kind + ':' + r.name; }))
      .toEqual(['branch:main', 'branch:feature/x', 'tag:v1.2']);
    expect(GP.refRows(refs, 'v1').length).toBe(1);
  });

  test('扱う範囲の注記はマージと衝突を外部に任せると言う', function() {
    expect(/マージと衝突の解消は外部/.test(GP.SCOPE_NOTE)).toBe(true);
  });
});
