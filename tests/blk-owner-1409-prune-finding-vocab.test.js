'use strict';
// BLK-owner-20260923-1409-prune: 「指摘を集め、1 件ごとに札を付けて一覧する」機能が
// 4 か所にあり、札の語彙がばらばらで、同じ 1 件が画面ごとに違う状態に見えた。
// 残す入口は 📥 指摘箱 と ▦ 突合ボード。他の 2 つが持っていた札は正本の 4 つ
// (未対応 / SVG 未反映 / 反映済み / 確かめられず) への対応付けにする。

var W = (typeof window !== 'undefined' && window) || global.window;
var FV = W.MA.findingVocab;
var PI = W.MA.pinInbox;
var MF = W.MA.manualFindings;
var NB = W.MA.noteBoard;
var PV = W.MA.pinVerify;

describe('札の語彙は 1 つ', function() {
  test('正本は 📥 指摘箱の 4 つ', function() {
    expect(FV.order()).toEqual(['open', 'puml-only', 'unknown', 'reflected']);
    expect(FV.order().map(FV.label)).toEqual(['未対応', 'SVG 未反映', '確かめられず', '反映済み']);
  });

  test('pin-verify の判定と同じ語彙 (2 か所で別々に決めない)', function() {
    Object.keys(PV.VERDICT).forEach(function(k) {
      expect(FV.label(k)).toBe(PV.VERDICT[k].label);
      expect(FV.isDone(k)).toBe(!!PV.VERDICT[k].done);
    });
  });

  test('終わっているのは 反映済み だけ', function() {
    expect(FV.isDone('reflected')).toBe(true);
    ['open', 'puml-only', 'unknown'].forEach(function(k) {
      expect(FV.isDone(k)).toBe(false);
    });
  });
});

describe('🔖 手動指摘の札 → 正本', function() {
  function row(o) {
    return Object.assign({ keep: true, verdict: '', status: 'unchanged', title: '' }, o);
  }

  test('要再確認 (指摘した行が書き換わった) は「確かめられず」', function() {
    expect(FV.fromManual(row({ keep: false, status: 'changed' })).key).toBe('unknown');
  });

  test('図が消えていても「反映済み」とは言わない', function() {
    expect(FV.fromManual(row({ keep: false, status: 'missing-doc' })).key).toBe('unknown');
  });

  test('未変更のため前回判定を維持 — 前回が未解消なら「未対応」', function() {
    expect(FV.fromManual(row({ keep: true, verdict: '未解消' })).key).toBe('open');
  });

  test('未変更のため前回判定を維持 — 前回が解消なら「反映済み」', function() {
    expect(FV.fromManual(row({ keep: true, verdict: '解消' })).key).toBe('reflected');
  });

  test('判定の根拠 (前回判定を維持) は札ではなく why に残る', function() {
    var v = FV.fromManual(row({ keep: true, verdict: '未解消', title: '前回見た版から行が変わっていません' }));
    expect(v.why).toContain('前回見た版から行が変わっていません');
    expect(v.why).toContain('未解消');
  });
});

describe('📂 一覧の反映状況 → 正本', function() {
  test('⚠未確認 は 確かめられず、✅対応済み は 反映済み', function() {
    expect(FV.fromNote('todo')).toBe('unknown');
    expect(FV.fromNote('done')).toBe('reflected');
  });

  test('対象外 は札ではなく絞り込み条件なので札を持たない', function() {
    expect(FV.fromNote('off')).toBe(null);
    expect(FV.noteMark('off')).toBe('対象外');
  });

  test('📂 一覧のバッジも同じ語彙で出る', function() {
    expect(NB.badge('todo').mark).toBe('⚠確かめられず');
    expect(NB.badge('done').mark).toBe('✅反映済み');
    expect(NB.badge('off').mark).toBe('対象外');
  });
});

describe('出典は札ではなく列', function() {
  test('監査が出した / 手で書いた の 2 つ', function() {
    expect(FV.source('audit').label).toBe('監査が出した');
    expect(FV.source('manual').label).toBe('手で書いた');
  });

  test('手で書いた指摘も指摘箱の項目になる', function() {
    var rows = MF.review([
      { doc: 'a.puml', line: 1, lineText: 'participant Gpio', text: '名前が揃っていない', verdict: '未解消' },
    ], { 'a.puml': 'participant Gpio\n' });
    var items = PI.fromManual(rows);
    expect(items.length).toBe(1);
    expect(items[0].source).toBe('manual');
    expect(items[0].doc).toBe('a.puml');
    expect(items[0].verdictKey).toBe('open');
    expect(PI.sourceLabel(items[0])).toBe('手で書いた');
  });

  test('出典で絞り込める (🔖 のタブが無くても同じものが出せる)', function() {
    var items = [
      { doc: 'a', id: '1', text: 'x', source: 'audit' },
      { doc: 'a', id: '2', text: 'y', source: 'manual' },
    ];
    expect(PI.filter(items, { source: 'manual' }).map(function(p) { return p.id; })).toEqual(['2']);
    expect(PI.filter(items, { source: 'audit' }).map(function(p) { return p.id; })).toEqual(['1']);
    expect(PI.filter(items, {}).length).toBe(2);
  });
});

describe('同じ 1 件を二重に数えない', function() {
  test('同じ図の同じ行の同じ文面は、出典が違っても 1 件', function() {
    var items = [
      { doc: 'a.puml', id: '1', line: 3, text: '名前が揃っていない', source: 'audit' },
      { doc: 'a.puml', id: 'mf:x', line: 3, text: '名前が揃っていない', source: 'manual' },
    ];
    expect(PI.dedupe(items).length).toBe(1);
    expect(FV.totalCount(items)).toBe(1);
  });

  test('畳むときは監査が出した側を残す (根拠の機械確認が付いている)', function() {
    var items = [
      { doc: 'a.puml', id: 'mf:x', line: 3, text: '同じ文面', source: 'manual' },
      { doc: 'a.puml', id: '1', line: 3, text: '同じ文面', source: 'audit' },
    ];
    expect(PI.dedupe(items)[0].source).toBe('audit');
  });

  test('別の行・別の文面は別の件', function() {
    var items = [
      { doc: 'a.puml', id: '1', line: 3, text: 'x', source: 'audit' },
      { doc: 'a.puml', id: '2', line: 4, text: 'x', source: 'audit' },
      { doc: 'b.puml', id: '3', line: 3, text: 'x', source: 'manual' },
    ];
    expect(PI.dedupe(items).length).toBe(3);
  });

  test('未対応の数は 反映済み を除いて畳んで数える', function() {
    var items = [
      { doc: 'a', id: '1', line: 1, text: 'x', verdictKey: 'open' },
      { doc: 'a', id: '2', line: 1, text: 'x', verdictKey: 'unknown' },   // 同じ 1 件
      { doc: 'b', id: '3', line: 2, text: 'y', verdictKey: 'reflected' },
    ];
    expect(FV.pendingCount(items)).toBe(1);
    expect(FV.totalCount(items)).toBe(2);
  });
});
