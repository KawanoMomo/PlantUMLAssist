'use strict';
// BLK-junior-20260928-2255: 資料セット「1 枚だけ」で PNG を選んで資料化すると、画面は「保存フォルダと提出物庫に
// 入れました」と言うのに、画像の実体はどちらにも無かった (ブラウザのダウンロードに渡すだけ)。
// 画像を書けたバイト数を確かめてから、確かめた所だけを成功と言う。書けなければ理由を言う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js', '../src/core/material-verify.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var ME = global.window.MA.materialExport;
var MV = global.window.MA.materialVerify;

var FILES = ['DMAドライバ初期化シーケンス.puml', 'DMAドライバ状態遷移.puml'];

describe('BLK-junior-20260928-2255 資料化の画像を保存フォルダと庫に書けたことを言う', function() {
  var p = ME.plan(FILES, 'DMAドライバ', 'シーケンス図');

  test('書けた画像の名前・形式・バイト数と、書けた所だけを言う', function() {
    expect(p.filename).toBe('DMAドライバ初期化シーケンス(資料用).png');
    var both = ME.doneMessage(p, { imageSize: 5123, vault: true });
    expect(both).toContain('DMAドライバ初期化シーケンス(資料用).png');
    expect(both).toContain('5123 バイト');
    expect(both).toContain('保存フォルダと提出物庫');
    var folderOnly = ME.doneMessage(p, { imageSize: 5123, vault: false });
    expect(folderOnly).toContain('保存フォルダに書き出しました');
    expect(folderOnly).not.toContain('提出物庫');
  });

  test('書けなかったときは成功と言わず、どこに・なぜを言う', function() {
    var t = ME.imageFailText(p, '保存フォルダ', '書けたのは 0 / 5123 バイト');
    expect(t).toBe('画像 DMAドライバ初期化シーケンス(資料用).png を保存フォルダに書けませんでした（書けたのは 0 / 5123 バイト）');
    expect(t).not.toContain('書き出しました');
    // 失敗の一文は runMaterialExport が failMessage に包んで出す
    expect(ME.failMessage(p, new Error(t))).toContain('資料化できませんでした');
  });

  test('保存先の確かめは、画像の実物の大きさまで言う', function() {
    var info = { dir: 'E:\\data', now: '2026-09-28T13:00:05Z',
      entries: [{ name: 'DMAドライバ初期化シーケンス(資料用)', mtime: '2026-09-28T13:00:00Z', size: 784 }] };
    var v = MV.verdict(info, p, { imageSize: 5123 });
    expect(v.status).toBe('ok');
    expect(v.text).toContain('画像 DMAドライバ初期化シーケンス(資料用).png も置けました（5 KB）');
    // done が無い呼び方 (古い呼び手) はこれまでの文言
    expect(MV.verdict(info, p).text).toContain('画像は DMAドライバ初期化シーケンス(資料用).png で書き出しました');
  });
});
