'use strict';
// BLK-owner-20260924-2157-prune: 保存先が Git のとき「この図の履歴」が 2 つあった
// (FILES の GIT 節 = コミット、窓 #vt-modal = server の _versions の控え)。
// Git の保存先では GIT 節の 1 つに寄せ、控えは同じ一覧に時刻順で混ぜて「控え」の札を付ける
// (VS Code の Timeline と同じ形)。窓は開かない。Git でない保存先は今までどおり窓。

var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var GP = W.MA.gitPanel;

var ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'git-ui.js'), 'utf8');
var app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8');
var html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

function p(n) { return (n < 10 ? '0' : '') + n; }
// 刻印は UTC。期待値は読み手の時計 (ローカル時間) に直して作る。
function localOf(stamp) {
  var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(stamp);
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return { d: d, day: p(d.getMonth() + 1) + '-' + p(d.getDate()) };
}

var NEW = { hash: 'a3f91c2aaaa', short: 'a3f91c2', author: 'junior', date: '2026-09-23T06:30:00+09:00', message: 'Fault 通知の応答を追記', tags: [] };
var OLD = { hash: '01de5a9bbbb', short: '01de5a9', author: 'senior', date: '2026-09-10T09:15:00+09:00', message: '初版', tags: ['v1.2'] };
// 2026-09-15 と 2026-09-24 の控え (UTC の刻印)。
var V_MID = { stamp: '20260915-010000', label: '09/15 10:00', lines: 12, revisit: false };
var V_TOP = { stamp: '20260924-120000', label: '09/24 21:00', lines: 4, revisit: true, revisitOf: '09/15 10:00' };

describe('GIT 節の「この図の履歴」にコミットと控えを時刻順で混ぜる', function() {
  test('新しい順に 1 本に並び、コミットはそのままの形で残る', function() {
    var rows = GP.timeline([NEW, OLD], [V_TOP, V_MID]);
    expect(rows.length).toBe(4);
    expect(rows[0].version).toBe('20260924-120000');
    expect(rows[1]).toBe(NEW);
    expect(rows[2].version).toBe('20260915-010000');
    expect(rows[3]).toBe(OLD);
  });

  test('控えの行は「控え」の札を持ち、日付は読み手の時計の MM-DD、往復した版は「往復」の札も付く', function() {
    var rows = GP.timeline([], [V_TOP, V_MID]);
    var top = GP.historyRow(rows[0]);
    expect(top.tags).toEqual(['控え', '往復']);
    expect(top.date).toBe(localOf(V_TOP.stamp).day);
    expect(top.message).toContain('09/24 21:00');
    expect(top.message).toContain('4 行');
    expect(top.title).toContain('控え');
    expect(top.title).toContain('コミットではない');
    expect(GP.historyRow(rows[1]).tags).toEqual(['控え']);
  });

  test('控えの行はコミットのハッシュと混ざらない印を持ち、右の枠の ◀ ▶ はコミットだけを送る', function() {
    var rows = GP.timeline([NEW, OLD], [V_TOP, V_MID]);
    expect(rows[0].hash).toBe('v:20260924-120000');
    expect(GP.indexOf(rows, 'v:20260915-010000')).toBe(2);
    // design 10c「◀ ▶ で 1 コミットずつ送れる」: 送る並びはコミットだけ (控えは送り先にしない)。
    expect(GP.step([NEW, OLD], OLD.hash, 1)).toBe(NEW);
    expect(GP.step([NEW, OLD], 'v:20260915-010000', 1)).toBe(null);
    expect(ui).toContain('a.compare(c, history)');
    expect(app).toContain('_seniorGit.row && _seniorGit.row.hash === _seniorGit.hash');
  });

  test('右の枠の見出しは控えだと言う (コミットと読み違えない)', function() {
    var v = GP.timeline([], [V_TOP])[0];
    expect(GP.paneTitle(v)).toContain('控え');
    expect(GP.paneTitle(v)).toContain('09/24 21:00');
    expect(GP.sidesLabel(v)).toBe('左: 作業中 右: 控え 09/24 21:00');
    expect(GP.sidesLabel(NEW)).toBe('左: 作業中 右: a3f91c2');
  });

  test('控えが無ければコミットだけ、コミットが無ければ控えだけ', function() {
    expect(GP.timeline([NEW, OLD], [])).toEqual([NEW, OLD]);
    expect(GP.timeline(null, null)).toEqual([]);
    expect(GP.timeline([], [V_MID]).length).toBe(1);
  });

  test('刻印が読めない控えは末尾に置く (行は消さない)', function() {
    var rows = GP.timeline([NEW], [{ stamp: 'broken', label: 'broken', lines: null }]);
    expect(rows[0]).toBe(NEW);
    expect(rows[1].version).toBe('broken');
  });
});

describe('Git の保存先では窓 #vt-modal を開かず GIT 節へ寄せる (結線)', function() {
  test('GIT 節は控えも読み、行に 比較 と 戻す を出す', function() {
    expect(ui).toContain('gp.timeline(history, sv)');
    expect(ui).toContain('git-history-restore');
    expect(ui).toContain('data-version-restore');
  });

  test('保存先一覧の [履歴 N] は Git の保存先では GIT 節の履歴へ移る', function() {
    var i = app.indexOf("b.setAttribute('data-versions-name', name);");
    expect(i).toBeGreaterThan(0);
    var body = app.slice(i, i + 1400);
    expect(body).toContain('isRepo()');
    expect(body).toContain("runFile('history', name)");
  });

  test('右の枠は控えの中身を /autosave-versions から読む', function() {
    expect(app).toContain('c.version');
    expect(/autosave-versions\?dir=[^\n]*stamp=' \+ encodeURIComponent\(c\.version\)/.test(app)).toBe(true);
  });

  test('戻す のボタンは手を置いた行だけに出る (比較と同じ出方)', function() {
    expect(html).toContain('.git-history-acts');
  });
});
