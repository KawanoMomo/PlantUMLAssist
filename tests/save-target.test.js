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

  // BLK-human-20261006-2020-1: 押した直後に保存ボタンの隣へ「いつ・どこへ」を出す。
  test('savedFlash: 時刻と保存先のフォルダ名・ファイル名を 1 行で言い、title に全パスを持つ', () => {
    var at = new Date(2026, 9, 6, 9, 5, 7);
    var f = STG.savedFlash({ mode: 'file', name: 'adc_seq', dir: 'E:/persona-data/junior' }, at);
    expect(f.text).toBe('✓ 09:05:07 junior/adc_seq.puml に保存');
    expect(f.title).toBe('09:05:07 に E:/persona-data/junior/adc_seq.puml へ保存しました');
    var d = STG.savedFlash({ mode: 'download', name: 'adc_seq' }, at);
    expect(d.text).toBe('✓ 09:05:07 adc_seq.puml をダウンロード');
    expect(STG.savedFlash(null, at)).toBeNull();
  });
});
