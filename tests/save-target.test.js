'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
require('../src/core/workspace.js');
try { delete require.cache[require.resolve('../src/core/save-target.js')]; } catch (e) {}
require('../src/core/save-target.js');
var STG = global.window.MA.saveTarget;

describe('save-target — 「保存」の行き先 (BLK-primary-20260907-0823)', () => {
  test('保存先ディレクトリ運用なら、保存はフォルダへ書く', () => {
    var t = STG.decide({ backend: 'file', fileDir: 'E:/persona/primary' }, { name: 'timer_state' });
    expect(t).toEqual({ mode: 'file', name: 'timer_state', dir: 'E:/persona/primary' });
  });

  test('fileDir 未設定でも既定の ./autosave に落ちる (行き先が無い状態を作らない)', () => {
    expect(STG.decide({ backend: 'file' }, { name: 'timer_state' }).dir).toBe('./autosave');
  });

  test('localStorage 運用ならダウンロード', () => {
    var t = STG.decide({ backend: 'localStorage' }, { name: 'timer_state' });
    expect(t).toEqual({ mode: 'download', name: 'timer_state' });
  });

  test('フォルダのファイル名にできない名前はダウンロードに落とす', () => {
    expect(STG.decide({ backend: 'file' }, { name: 'a b/c' }).mode).toBe('download');
    expect(STG.decide({ backend: 'file' }, { name: '' }).mode).toBe('download');
    expect(STG.decide({ backend: 'file' }, null).mode).toBe('download');
  });

  test('設定もドキュメントも無ければ、渡された題名でダウンロードする', () => {
    expect(STG.decide(null, null, 'untitled')).toEqual({ mode: 'download', name: 'untitled' });
    expect(STG.decide(null, null, null).name).toBe('untitled');
  });

  test('messageFor: どこに書いたかを必ず言い、失敗も黙らない', () => {
    var f = { mode: 'file', name: 'timer_state', dir: 'E:/persona/primary' };
    expect(STG.messageFor(f, true)).toBe('E:/persona/primary/timer_state.puml に保存しました');
    expect(STG.messageFor(f, false)).toBe('⚠ E:/persona/primary/timer_state.puml に保存できませんでした');
    expect(STG.messageFor({ mode: 'download', name: 'timer_state' }, true))
      .toBe('⬇ timer_state.puml をダウンロードしました');
    expect(STG.messageFor(null, true)).toBe('');
  });
});
