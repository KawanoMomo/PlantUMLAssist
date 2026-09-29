'use strict';
// BLK-builder-20260924-1835-1 (design 10c): FILES の GIT 欄「この図の履歴」は 1 行 1 コミット。
//   「CR1 書き込みを追加  09-21」「初版 [v1.2]  09-10」。右端は日付 MM-DD、タグはメッセージの右の札。
//   ハッシュ・作成者・時刻・HEAD は行の title (以前は 2 行目に詰めて幅 190px で「… · …」と切れていた)。
//   「比較」は全部の行に枠で並べず、行に手を置いた・キーで来たときに日付の位置へ出る。

var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var GP = W.MA.gitPanel;

var html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'git-ui.js'), 'utf8');

var HEAD = { hash: 'a3f91c2aaaa', short: 'a3f91c2', author: 'junior', date: '2026-09-23T06:30:00+09:00', message: 'Fault 通知の応答を追記', head: true, tags: [] };
var FIRST = { hash: '01de5a9bbbb', short: '01de5a9', author: 'senior', date: '2026-09-10T09:15:00+09:00', message: '初版', tags: ['v1.2'] };

describe('履歴の行の中身 (design 10c)', function() {
  test('日付は MM-DD だけ (年と時刻は出さない)', function() {
    expect(GP.dayLabel('2026-09-21T18:02:00+09:00')).toBe('09-21');
    expect(GP.dayLabel('')).toBe('');
    expect(GP.dayLabel('yesterday')).toBe('');
  });

  test('メッセージ・タグ・日付に分け、ハッシュ・作成者・時刻・HEAD は title に回す', function() {
    var r = GP.historyRow(HEAD);
    expect(r.message).toBe('Fault 通知の応答を追記');
    expect(r.tags).toEqual([]);
    expect(r.date).toBe('09-23');
    expect(r.title).toContain('a3f91c2');
    expect(r.title).toContain('junior');
    expect(r.title).toContain('09-23 06:30');
    expect(r.title).toContain('HEAD');
  });

  test('タグは札として別に持つ (初版 v1.2)', function() {
    var r = GP.historyRow(FIRST);
    expect(r.message).toBe('初版');
    expect(r.tags).toEqual(['v1.2']);
    expect(r.date).toBe('09-10');
  });

  test('欠けた値でも落ちない', function() {
    expect(GP.historyRow(null)).toEqual({ message: '', tags: [], date: '', title: '' });
    var r = GP.historyRow({ hash: 'abc', tags: [null, ''] });
    expect(r.tags).toEqual([]);
    expect(r.date).toBe('');
  });
});

describe('履歴の行の組み立て (design 10c)', function() {
  var body = ui.slice(ui.indexOf('function renderHistory'), ui.indexOf('function compareWith'));

  test('2 行目のメタ (git-commit-meta) を出さず、行の title に回す', function() {
    expect(body).not.toContain("'git-commit-meta'");
    expect(body).toContain('gp.historyRow(c)');
    expect(body).toContain('row.title = hr.title');
  });

  test('並びはメッセージ → タグの札 → 右端 (日付と比較が同じ位置)', function() {
    var iMsg = body.indexOf("'git-commit-msg'");
    var iTag = body.indexOf("'git-commit-tag'");
    var iDate = body.indexOf("'git-commit-date'");
    var iBtn = body.indexOf("'git-history-compare'");
    expect(iMsg).toBeGreaterThan(0);
    expect(iMsg).toBeLessThan(iTag);
    expect(iTag).toBeLessThan(iDate);
    expect(iDate).toBeLessThan(iBtn);
    expect(body).toContain('end.appendChild(b)');
  });

  test('比較は手を置いた・キーで来た・比較中の行だけに見え、そのとき日付は隠れる', function() {
    expect(/\.git-history-compare \{[^}]*opacity: 0;/.test(html)).toBe(true);
    expect(html).toContain('.git-commit-row:hover .git-history-compare');
    expect(html).toContain('.git-commit-row:focus-within .git-history-compare');
    expect(html).toContain('.git-commit-row.is-compared .git-history-compare');
    expect(html).toContain('.git-commit-row:hover .git-commit-date');
    // 押せないようにはしない (pointer-events を切ると、手を置いてから押す人も Tab で来た人も押せない)
    expect(/\.git-history-compare \{[^}]*pointer-events: none/.test(html)).toBe(false);
  });

  test('メッセージは 1 行で切り詰める (折り返さない)', function() {
    expect(/#files-body-git \.git-commit-msg \{[^}]*white-space: nowrap;/.test(html)).toBe(true);
  });
});
