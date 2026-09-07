'use strict';
// BLK-primary-20260907-0923-design: design「1a 設定と網羅」5a の
// 設定「レンダリング」— local / online を速度と外部送信の 2 点で比べ、
// Java の検出結果をその場に出す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/render-modes.js')]; } catch (e) {}
require('../src/core/render-modes.js');
var RM = global.window.MA.renderModes;

var ENV_OK = { java: { found: true, version: '21.0.2', major: 21 }, jar: true };
var ENV_NO_JAVA = { java: { found: false, version: null, major: null }, jar: true };

describe('javaBadge', function() {
  test('検出できたらバージョンつきで出す', function() {
    expect(RM.javaBadge(ENV_OK)).toEqual({ text: 'Java 21 検出', tone: 'ok' });
  });

  test('無ければ「未検出」を警告色で出す', function() {
    expect(RM.javaBadge(ENV_NO_JAVA)).toEqual({ text: 'Java 未検出', tone: 'warn' });
  });

  test('まだ聞けていない間は「判定中」', function() {
    expect(RM.javaBadge(null).text).toBe('Java 判定中…');
    expect(RM.javaBadge(null).tone).toBe('muted');
  });

  test('バージョンが読めなくても検出済みとして出す', function() {
    expect(RM.javaBadge({ java: { found: true, version: null, major: null } }))
      .toEqual({ text: 'Java 検出', tone: 'ok' });
  });
});

describe('speedText', function() {
  test('実測が無ければ目安だけ', function() {
    expect(RM.speedText('local', null)).toBe('常駐 JVM で 10〜30ms');
    expect(RM.speedText('online', {})).toBe('往復するので 200ms〜');
  });

  test('実測があればこの環境の値を並べる (どちらが速いか設定画面で比べられる)', function() {
    expect(RM.speedText('local', { local: 23.6 })).toBe('常駐 JVM で 10〜30ms（この環境の前回: 24ms）');
    expect(RM.speedText('online', { local: 24, online: 410 }))
      .toBe('往復するので 200ms〜（この環境の前回: 410ms）');
  });

  test('0 や不正値は実測として扱わない', function() {
    expect(RM.speedText('local', { local: 0 })).toBe('常駐 JVM で 10〜30ms');
    expect(RM.speedText('local', { local: 'x' })).toBe('常駐 JVM で 10〜30ms');
  });

  test('知らないモードなら空', function() {
    expect(RM.speedText('zzz', {})).toBe('');
  });
});

describe('normalizeMode', function() {
  test('選べるのは local と online だけ', function() {
    expect(RM.normalizeMode('online')).toBe('online');
    expect(RM.normalizeMode('local')).toBe('local');
  });

  test('同梱エンジンはまだ選べないので local に落ちる', function() {
    expect(RM.normalizeMode('bundled')).toBe('local');
    expect(RM.normalizeMode(null)).toBe('local');
  });
});

describe('normalizeDebounce', function() {
  test('選択肢はそのまま', function() {
    expect(RM.normalizeDebounce(0)).toBe(0);
    expect(RM.normalizeDebounce(300)).toBe(300);
    expect(RM.normalizeDebounce('1000')).toBe(1000);
  });

  test('外れた値は一番近い選択肢に寄せる', function() {
    expect(RM.normalizeDebounce(900)).toBe(1000);
    expect(RM.normalizeDebounce(250)).toBe(300);
    expect(RM.normalizeDebounce(20)).toBe(0);
  });

  test('数でなければ既定', function() {
    expect(RM.normalizeDebounce('abc')).toBe(RM.DEBOUNCE_DEFAULT);
    expect(RM.normalizeDebounce(null)).toBe(RM.DEBOUNCE_DEFAULT);
  });
});

describe('warningFor', function() {
  test('local を選んでいて Java が無ければ警告する', function() {
    expect(RM.warningFor('local', ENV_NO_JAVA)).toContain('Java が見つかりません');
  });

  test('online を選んでいるなら Java の有無は関係ない', function() {
    expect(RM.warningFor('online', ENV_NO_JAVA)).toBe('');
  });

  test('Java があれば警告しない', function() {
    expect(RM.warningFor('local', ENV_OK)).toBe('');
  });

  test('jar が無ければその旨を出す', function() {
    expect(RM.warningFor('local', { java: { found: true, major: 21 }, jar: false }))
      .toContain('plantuml.jar');
  });

  test('env がまだ無ければ何も言わない', function() {
    expect(RM.warningFor('local', null)).toBe('');
  });
});

describe('cards', function() {
  test('3 枚ぶん出る。3 枚目は選べない「将来対応」', function() {
    var c = RM.cards(ENV_OK, {}, 'local');
    expect(c.length).toBe(3);
    expect(c.map(function(x) { return x.id; })).toEqual(['local', 'online', 'bundled']);
    expect(c[2].selectable).toBe(false);
    expect(c[2].badge).toEqual({ text: '将来対応', tone: 'muted' });
    expect(c[2].note).toContain('枠だけ先に確保');
  });

  test('各カードが速度と外部送信の 2 行を持つ', function() {
    var c = RM.cards(ENV_OK, { local: 24 }, 'local');
    expect(c[0].speed).toBe('常駐 JVM で 10〜30ms（この環境の前回: 24ms）');
    expect(c[0].privacy).toBe('DSL は外部に出ません。');
    expect(c[1].privacy).toContain('外部サーバに送信されます');
  });

  test('Java のバッジは local カードにだけ付く', function() {
    var c = RM.cards(ENV_OK, {}, 'local');
    expect(c[0].badge.text).toBe('Java 21 検出');
    expect(c[1].badge).toBeNull();
  });

  test('選択中の 1 枚だけ checked', function() {
    var c = RM.cards(ENV_OK, {}, 'online');
    expect(c.map(function(x) { return x.checked; })).toEqual([false, true, false]);
  });

  test('選べないモードを渡されても local が checked になる', function() {
    var c = RM.cards(ENV_OK, {}, 'bundled');
    expect(c[0].checked).toBe(true);
    expect(c[2].checked).toBe(false);
  });
});
