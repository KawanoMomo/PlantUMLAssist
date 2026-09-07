'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/outline.js')]; } catch (e) {}
require('../src/core/outline.js');
try { delete require.cache[require.resolve('../src/core/consistency-check.js')]; } catch (e) {}
require('../src/core/consistency-check.js');
var cc = global.window.MA.consistencyCheck;

// 先輩の図。GPIO の雛形をそのまま持つ。
var REF = [
  '@startuml',
  'title GpioDrv',
  'actor App',
  'participant GpioDrv',
  'App -> GpioDrv : ポートを設定',
  'App -> GpioDrv : 割り込みを設定',
  'GpioDrv --> App : 結果を通知',
  '@enduml',
].join('\n');

function kinds(r) { return r.findings.map(function(f) { return f.kind; }); }
function msgs(r) { return r.findings.map(function(f) { return f.message; }).join(' | '); }

describe('consistency-check — 参照図との突き合わせ (BLK-junior-20260907-0843-wish)', () => {

  test('部品名を替えただけの写しは何も指摘しない', () => {
    const cur = REF.replace(/GpioDrv/g, 'UartDrv').replace('title UartDrv', 'title UartDrv');
    const r = cc.check(REF, cur);
    expect(r.findings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.summary).toBe('食い違いなし');
  });

  test('行が 1 本抜けていれば「参照図の N 番目がこちらにありません」と言う', () => {
    const cur = REF.replace('App -> GpioDrv : 割り込みを設定\n', '');
    const r = cc.check(REF, cur);
    expect(kinds(r)).toContain('order');
    expect(msgs(r)).toContain('こちらにありません');
  });

  test('参照図に無い要素が余っていれば指摘する', () => {
    const cur = REF.replace('@enduml', 'App -> GpioDrv : 余分\n@enduml');
    const r = cc.check(REF, cur);
    expect(kinds(r)).toContain('order');
    expect(msgs(r)).toContain('余分にあります');
  });

  test('並びが入れ違っていれば N 番目として指摘する', () => {
    const cur = [
      '@startuml', 'title GpioDrv',
      'App -> GpioDrv : ポートを設定',
      'actor App', 'participant GpioDrv',
      'App -> GpioDrv : 割り込みを設定',
      'GpioDrv --> App : 結果を通知',
      '@enduml',
    ].join('\n');
    const r = cc.check(REF, cur);
    expect(kinds(r)).toContain('order');
  });

  test('語尾が参照図の形から外れたラベルを指摘する', () => {
    const cur = REF.replace('割り込みを設定', '割り込みを有効にする');
    const r = cc.check(REF, cur);
    expect(kinds(r)).toContain('suffix');
    expect(msgs(r)).toContain('有効にする');
  });

  test('参照図の名前と 1 文字だけ違う名前は打ち間違いとして指摘する', () => {
    const cur = REF.replace('participant GpioDrv', 'participant GpioDvr')
                   .replace('App -> GpioDrv : ポートを設定', 'App -> GpioDvr : ポートを設定');
    const r = cc.check(REF, cur);
    expect(kinds(r)).toContain('typo');
    expect(msgs(r)).toContain('1 文字だけ違います');
  });

  test('まるごと別名に替えた部品は打ち間違いにしない (置換した結果なので)', () => {
    const cur = REF.replace(/GpioDrv/g, 'CanController');
    const r = cc.check(REF, cur);
    expect(kinds(r)).not.toContain('typo');
  });

  test('指摘は編集中の図の行の順に並ぶ', () => {
    const cur = REF.replace('割り込みを設定', '割り込みを有効にする')
                   .replace('結果を通知', '結果をしらせる');
    const r = cc.check(REF, cur);
    const lines = r.findings.map(function(f) { return f.line == null ? 1e9 : f.line; });
    expect(lines.slice().sort(function(a, b) { return a - b; })).toEqual(lines);
  });

  test('suffixOf: 最後の「を」より後ろを語尾とする', () => {
    expect(cc.suffixOf('ポートを設定')).toBe('設定');
    expect(cc.suffixOf('割り込みを有効化')).toBe('有効化');
    expect(cc.suffixOf('Gpio_Init()')).toBe('Gpio_Init');
    expect(cc.suffixOf('')).toBe('');
  });

  test('suffixVocabulary: 参照図で 2 回以上出た語尾だけを「揃っている形」とする', () => {
    const v = cc.suffixVocabulary(global.window.MA.outline.build(REF).nodes);
    expect(v).toContain('設定');
    expect(v).not.toContain('通知');
  });

  test('isNearMiss: 1 回の置換・挿入・削除・隣接入れ替えだけを真とする', () => {
    expect(cc.isNearMiss('GpioDrv', 'GpioDvr')).toBe(true);    // 隣り合う入れ替え
    expect(cc.isNearMiss('GpioDrv', 'GpioDrx')).toBe(true);
    expect(cc.isNearMiss('GpioDrv', 'GpioDrvv')).toBe(true);
    expect(cc.isNearMiss('GpioDrv', 'GpioDr')).toBe(true);
    expect(cc.isNearMiss('GpioDrv', 'GpioDrv')).toBe(false);
    expect(cc.isNearMiss('GpioDrv', 'UartDrv')).toBe(false);
    expect(cc.isNearMiss('GpioDrv', 'GpivDro')).toBe(false);   // 離れた 2 箇所は別物
    expect(cc.isNearMiss('App', 'Api')).toBe(false);           // 3 文字以下は見ない
  });

  test('部品名を替えた図でも、置換し損ねた 1 文字違いは図の中だけで見つける', () => {
    const cur = REF.replace(/GpioDrv/g, 'UartDrv')
                   .replace('participant UartDrv', 'participant UartDvr');
    const r = cc.check(REF, cur);
    expect(kinds(r)).toContain('typo');
    expect(msgs(r)).toContain('この図の中で');
    expect(msgs(r)).toContain('UartDvr');
  });

  test('namesUsed: 宣言と関係の両端から名前を集める', () => {
    const nodes = global.window.MA.outline.build(REF).nodes;
    const used = cc.namesUsed(nodes);
    expect(used).toContain('App');
    expect(used).toContain('GpioDrv');
    expect(used).not.toContain('App -> GpioDrv');
  });

  test('summary: 種類ごとの件数を出す', () => {
    expect(cc.summary([])).toBe('食い違いなし');
    expect(cc.summary([{ kind: 'order' }, { kind: 'typo' }, { kind: 'typo' }]))
      .toBe('3 件 (並び 1 / 打ち間違い 2)');
  });

  test('参照図が空でも落ちない', () => {
    const r = cc.check('', REF);
    expect(Array.isArray(r.findings)).toBe(true);
  });
});
