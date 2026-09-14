'use strict';
// BLK-primary-20260914-1406: 💾 保存を押しても本体の中身が変わらない (書かれていたのは
// `{名前}-編集中.puml`)。ここで守るのは「逸れたら必ず言うこと」と「言うときに
// 書いた先と、変わっていないファイルを両方名指しすること」。
// どちらかが欠けると、200 が返る保存を「効いた」と読んでしまう。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/save-redirect.js')]; } catch (e) {}
require('../src/core/save-redirect.js');

var SR = window.MA.saveRedirect;

describe('saveRedirect.isRedirected', function() {
  test('書いた先が開いている図と違えば逸れている', function() {
    expect(SR.isRedirected('driver_common_class', 'driver_common_class-編集中')).toBe(true);
  });

  test('同じ名前・名前が無いときは逸れていない (黙る)', function() {
    expect(SR.isRedirected('diagram1', 'diagram1')).toBe(false);
    expect(SR.isRedirected('', 'diagram1')).toBe(false);
    expect(SR.isRedirected('diagram1', '')).toBe(false);
  });
});

describe('saveRedirect.notice', function() {
  var n = SR.notice('plantuml-usecase', 'plantuml-usecase-編集中', 'lock-copy', 'E:/persona-data/primary');

  test('書いた先と、変わっていない本体の両方を名指しする', function() {
    expect(n.text).toContain('plantuml-usecase-編集中.puml に書きました');
    expect(n.text).toContain('plantuml-usecase.puml は変更前のままです');
  });

  test('なぜ逸れたかを言う (「保存できなかった」と読ませない)', function() {
    expect(n.text).toContain('元ファイルは変更前のまま保つ');
    expect(n.detail).toBe('書いた先: E:/persona-data/primary/plantuml-usecase-編集中.puml');
  });

  test('1 押しで本体へ入れる側のボタン文言が本体の名前を持つ', function() {
    expect(n.overwriteLabel).toBe('plantuml-usecase.puml に書く');
    expect(n.overwriteTitle).toContain('次からその都度確認します');
    expect(n.keepLabel).toBe('このままにする');
  });

  test('図種で別ファイルへ回された保存も同じ帯で言える', function() {
    var k = SR.notice('diagram1', 'diagram1_state', 'kind-split', '');
    expect(k.text).toContain('図種が違うため');
    expect(k.detail).toBe('');
  });

  test('逸れていなければ null (帯を出さない)', function() {
    expect(SR.notice('diagram1', 'diagram1', 'lock-copy', './autosave')).toBe(null);
  });

  test('理由が分からなくても書いた先だけは言う', function() {
    expect(SR.notice('a', 'b', '', '').text).toBe('⚠ b.puml に書きました。a.puml は変更前のままです');
  });
});

describe('saveRedirect の後始末', function() {
  test('書き直したあとの 1 行は本体の名前を言う', function() {
    expect(SR.doneText('Fig1')).toContain('Fig1.puml に書きました');
  });

  test('同じ組は同じ鍵になる (帯を積み上げない)', function() {
    expect(SR.key('a', 'a-編集中')).toBe(SR.key('a', 'a-編集中'));
    expect(SR.key('a', 'a-編集中')).not.toBe(SR.key('b', 'b-編集中'));
  });
});
