'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/top-status.js')]; } catch (e) {}
require('../src/core/top-status.js');
var ts = global.window.MA.topStatus;

describe('top-status — 上部バーに残す状態表示 (design 1a)', () => {
  test('fileName: タブ名に .puml を付ける (保存先ファイル名と同じ形)', () => {
    expect(ts.fileName('sample-sequence')).toBe('sample-sequence.puml');
  });

  test('fileName: 既に .puml が付いていれば二重に付けない', () => {
    expect(ts.fileName('diagram1.puml')).toBe('diagram1.puml');
    expect(ts.fileName('diagram1.PUML')).toBe('diagram1.PUML');
  });

  test('fileName: 名前が無い/空白だけなら (無題).puml', () => {
    expect(ts.fileName('')).toBe('(無題).puml');
    expect(ts.fileName('   ')).toBe('(無題).puml');
    expect(ts.fileName(null)).toBe('(無題).puml');
    expect(ts.fileName(undefined)).toBe('(無題).puml');
  });

  test('formatDuration: 1 秒未満は ms に丸める', () => {
    expect(ts.formatDuration(24)).toBe('24ms');
    expect(ts.formatDuration(23.6)).toBe('24ms');
    expect(ts.formatDuration(0)).toBe('0ms');
    expect(ts.formatDuration(999)).toBe('999ms');
  });

  test('formatDuration: 1 秒以上は秒に切り替える', () => {
    expect(ts.formatDuration(1000)).toBe('1s');
    expect(ts.formatDuration(1240)).toBe('1.2s');
    expect(ts.formatDuration(12345)).toBe('12.3s');
  });

  test('formatDuration: 数字にならない値は空文字', () => {
    expect(ts.formatDuration(NaN)).toBe('');
    expect(ts.formatDuration(-1)).toBe('');
    expect(ts.formatDuration('abc')).toBe('');
  });

  test('render: 成功したら design のとおり `online · 24ms`', () => {
    expect(ts.render({ mode: 'online', phase: 'ok', ms: 24 })).toBe('online · 24ms');
    expect(ts.render({ mode: 'local', phase: 'ok', ms: 1500 })).toBe('local · 1.5s');
  });

  test('render: 実行中・未実行・失敗はモード名と相だけを出す', () => {
    expect(ts.render({ mode: 'local', phase: 'rendering' })).toBe('local · …');
    expect(ts.render({ mode: 'local', phase: 'idle' })).toBe('local · —');
    expect(ts.render({ mode: 'online', phase: 'error' })).toBe('online · error');
  });

  test('render: 所要時間が測れなかった成功は数字を作らない', () => {
    expect(ts.render({ mode: 'local', phase: 'ok' })).toBe('local · —');
  });

  test('render: モードが無ければ local を既定にし、引数が無くても落ちない', () => {
    expect(ts.render({ phase: 'idle' })).toBe('local · —');
    expect(ts.render()).toBe('local · —');
  });

  test('isError: 失敗のときだけ真', () => {
    expect(ts.isError('error')).toBe(true);
    expect(ts.isError('ok')).toBe(false);
    expect(ts.isError('rendering')).toBe(false);
    expect(ts.isError('idle')).toBe(false);
  });
});
