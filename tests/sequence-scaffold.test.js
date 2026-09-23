'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/sequence-scaffold.js')]; } catch (e) {}
require('../src/core/sequence-scaffold.js');
var ss = global.window.MA.sequenceScaffold;

var BASE = ['@startuml', 'actor Dev', '@enduml'].join('\n');
var EMPTY = ['@startuml', '@enduml'].join('\n');

function spec(over) {
  var s = {
    title: 'TIMER ドライバ初期化',
    participants: [
      { name: 'Dev', type: 'actor' },
      { name: 'TimerDrv', type: 'participant' },
    ],
    messages: [
      { from: 'Dev', to: 'TimerDrv', arrow: 'sync', text: 'Timer_Init()' },
      { from: 'TimerDrv', to: 'Dev', arrow: 'reply', text: 'E_OK' },
    ],
  };
  Object.keys(over || {}).forEach(function(k) { s[k] = over[k]; });
  return s;
}

describe('sequence-scaffold existingIds', function() {
  test('宣言済みの参加者を拾う', function() {
    var ids = ss.existingIds('@startuml\nactor Dev\nparticipant Spi\ndatabase Store\n@enduml');
    expect(ids.Dev).toBe(true);
    expect(ids.Spi).toBe(true);
    expect(ids.Store).toBe(true);
  });

  test('メッセージの両端も拾う', function() {
    var ids = ss.existingIds('@startuml\nA -> B : x\nC --> D\n@enduml');
    expect(ids.A).toBe(true);
    expect(ids.B).toBe(true);
    expect(ids.C).toBe(true);
    expect(ids.D).toBe(true);
  });

  test('別名宣言は別名の方を拾う', function() {
    var ids = ss.existingIds('@startuml\nparticipant "TIMER ドライバ" as P1\n@enduml');
    expect(ids.P1).toBe(true);
    expect(ids['TIMER ドライバ']).toBe(undefined);
  });
});

describe('sequence-scaffold normalizeId', function() {
  test('ASCII 名はそのまま使う', function() {
    var n = ss.normalizeId('TimerDrv', EMPTY, null);
    expect(n.id).toBe('TimerDrv');
    expect(n.label).toBe('TimerDrv');
    expect(n.valid).toBe(true);
  });

  test('日本語名は P1 別名に寄せ、表示名を残す', function() {
    var n = ss.normalizeId('タイマドライバ', EMPTY, null);
    expect(n.id).toBe('P1');
    expect(n.label).toBe('タイマドライバ');
  });

  test('既に使われている別名は避ける', function() {
    var n = ss.normalizeId('タイマ', '@startuml\nparticipant "既存" as P1\n@enduml', null);
    expect(n.id).toBe('P2');
  });

  test('空欄は無効', function() {
    expect(ss.normalizeId('  ', EMPTY, null).valid).toBe(false);
  });
});

describe('sequence-scaffold normalizeSpec', function() {
  test('名前の無い参加者行と欠けたメッセージ行は捨てる', function() {
    var s = ss.normalizeSpec({
      participants: [{ name: 'A' }, { name: '' }, { name: '  ' }],
      messages: [{ from: 'A', to: '' }, { from: '', to: 'A' }, { from: 'A', to: 'B', text: 'x' }],
    }, EMPTY);
    expect(s.participants.length).toBe(1);
    expect(s.messages.length).toBe(1);
  });

  test('同じ表示名は 1 つの ID に解決される', function() {
    var s = ss.normalizeSpec({
      participants: [{ name: 'タイマ', type: 'participant' }],
      messages: [{ from: 'タイマ', to: 'Dev', text: 'x' }],
    }, EMPTY);
    expect(s.participants[0].id).toBe('P1');
    expect(s.messages[0].from).toBe('P1');
  });

  test('未知の矢印と種類は既定に落とす', function() {
    var s = ss.normalizeSpec({
      participants: [{ name: 'A', type: 'まほう' }],
      messages: [{ from: 'A', to: 'B', arrow: 'zzz' }],
    }, EMPTY);
    expect(s.participants[0].type).toBe('participant');
    expect(s.messages[0].arrow).toBe('sync');
  });

  test('title は前後の空白を落とす', function() {
    expect(ss.normalizeSpec({ title: '  x  ', participants: [{ name: 'A' }] }, EMPTY).title).toBe('x');
  });
});

describe('sequence-scaffold validate', function() {
  test('埋めた spec は ok', function() {
    expect(ss.validate(spec(), BASE).ok).toBe(true);
  });

  test('空なら足りないと言う', function() {
    var r = ss.validate({ participants: [], messages: [] }, EMPTY);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(1);
  });

  test('参加者名の重複は弾く', function() {
    var r = ss.validate(spec({
      participants: [{ name: 'Dev' }, { name: 'Dev' }],
      messages: [],
    }), EMPTY);
    expect(r.ok).toBe(false);
    expect(r.errors.join('')).toContain('重複');
  });

  // BLK-human-20260923-1330: 自己メッセージ (`Dev -> Dev`) は PlantUML の正当な記法なので
  // 止めない。確かめたい人のために警告だけを出す (旧テストは「弾く」を期待していた)。
  test('From と To が同じメッセージは、警告を出したうえで追加できる', function() {
    var r = ss.validate(spec({
      messages: [{ from: 'Dev', to: 'Dev', text: 'x' }],
    }), EMPTY);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('')).toContain('From と To');
  });

  test('自己メッセージは矢印の形がそのまま出る', function() {
    var lines = ss.preview(EMPTY, spec({ messages: [{ from: 'Dev', to: 'Dev', text: '内部処理' }] }));
    expect(lines.join(String.fromCharCode(10))).toContain('Dev -> Dev : 内部処理');
  });

  test('空ラベル・宣言のない参加者も警告どまりで ok', function() {
    var r = ss.validate(spec({ messages: [{ from: 'A', to: 'B', text: '' }] }), EMPTY);
    expect(r.ok).toBe(true);
    expect(r.warnings.join('')).toContain('ラベルが空');
  });

  test('参加者だけでも ok', function() {
    expect(ss.validate({ participants: [{ name: 'A' }], messages: [] }, EMPTY).ok).toBe(true);
  });
});

describe('sequence-scaffold preview', function() {
  test('宣言とメッセージを一度に出す', function() {
    var lines = ss.preview(EMPTY, spec());
    expect(lines[0]).toBe('title TIMER ドライバ初期化');
    expect(lines[1]).toBe('actor Dev');
    expect(lines[2]).toBe('participant TimerDrv');
    expect(lines[3]).toBe('Dev -> TimerDrv : Timer_Init()');
    expect(lines[4]).toBe('TimerDrv --> Dev : E_OK');
  });

  test('既に宣言済みの参加者は宣言し直さない', function() {
    var lines = ss.preview(BASE, spec());
    expect(lines.indexOf('actor Dev')).toBe(-1);
    expect(lines.indexOf('participant TimerDrv')).toBeGreaterThan(-1);
  });

  test('打ったタイトルは既定テンプレの題名を置き換える', function() {
    var out = ss.apply('@startuml\ntitle Sample Sequence\n@enduml', spec());
    expect(out).toContain('title TIMER ドライバ初期化');
    expect(out).not.toContain('Sample Sequence');
    // title 行は 1 本のまま
    expect(out.split('\n').filter(function(l) { return /^title /.test(l); }).length).toBe(1);
  });

  test('タイトルを打たなければ既存の題名に触らない', function() {
    var out = ss.apply('@startuml\ntitle 既存\n@enduml', spec({ title: '' }));
    expect(out).toContain('title 既存');
  });

  test('日本語名は別名宣言になり、メッセージも別名で書かれる', function() {
    var lines = ss.preview(EMPTY, {
      participants: [{ name: 'タイマドライバ', type: 'participant' }],
      messages: [{ from: 'タイマドライバ', to: 'Dev', arrow: 'sync', text: '通知' }],
    });
    expect(lines).toContain('participant "タイマドライバ" as P1');
    expect(lines).toContain('P1 -> Dev : 通知');
  });

  test('メッセージにだけ出た相手も宣言される', function() {
    var lines = ss.preview(EMPTY, {
      participants: [],
      messages: [{ from: 'A', to: 'B', text: 'x' }],
    });
    expect(lines).toContain('participant A');
    expect(lines).toContain('participant B');
  });

  test('本文が空でも矢印だけの行になる', function() {
    var lines = ss.preview(EMPTY, {
      participants: [{ name: 'A' }, { name: 'B' }],
      messages: [{ from: 'A', to: 'B', arrow: 'async' }],
    });
    expect(lines).toContain('A ->> B');
  });

  test('全部空なら何も出さない', function() {
    expect(ss.preview(EMPTY, { participants: [], messages: [] }).length).toBe(0);
  });
});

describe('sequence-scaffold apply', function() {
  test('@enduml の前に差し込む', function() {
    var out = ss.apply(BASE, spec());
    var lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(out).toContain('Dev -> TimerDrv : Timer_Init()');
  });

  test('preview と同じ行だけが増える', function() {
    var lines = ss.preview(BASE, spec());
    var out = ss.apply(BASE, spec());
    expect(out.split('\n').length).toBe(BASE.split('\n').length + lines.length);
  });

  test('空の spec なら text をそのまま返す', function() {
    expect(ss.apply(BASE, { participants: [], messages: [] })).toBe(BASE);
  });

  test('@startuml が無い text にも枠ごと足す', function() {
    var out = ss.apply('', spec());
    expect(out.split('\n')[0]).toBe('@startuml');
    expect(out.split('\n').pop()).toBe('@enduml');
  });

  test('2 回続けて足しても宣言は二重にならない', function() {
    var once = ss.apply(BASE, spec());
    var twice = ss.apply(once, spec());
    var decls = twice.split('\n').filter(function(l) { return l === 'participant TimerDrv'; });
    expect(decls.length).toBe(1);
  });
});

describe('sequence-scaffold fmtMessage', function() {
  test('矢印表は sequence モジュールと同じ記法', function() {
    expect(ss.ARROWS.sync).toBe('->');
    expect(ss.ARROWS.async).toBe('->>');
    expect(ss.ARROWS.reply).toBe('-->');
  });

  test('ラベル無しなら : を付けない', function() {
    expect(ss.fmtMessage('sync', 'A', 'B', '')).toBe('A -> B');
  });
});
