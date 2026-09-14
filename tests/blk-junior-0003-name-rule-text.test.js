'use strict';
// BLK-junior-20260908-0003: 名前変更ダイアログの説明文が「英数字・_ ・- のみ」
// のままで、実際には通る日本語・空白・括弧を毎回試すまで確信が持てなかった。
// 文言を判定と同じ場所から出し、両者が食い違わないことをここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
if (!global.window.localStorage) {
  var _m = {};
  global.window.localStorage = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_m, k) ? _m[k] : null; },
    setItem: function(k, v) { _m[k] = String(v); },
    removeItem: function(k) { delete _m[k]; },
    clear: function() { _m = {}; },
  };
}
try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
require('../src/core/workspace.js');
var ws = global.window.MA.workspace;

var text = ws.nameRuleText();

// 実際に通る書き方を「使える」と言っている。
assert.ok(/日本語/.test(text), text);
assert.ok(/空白/.test(text), text);
assert.ok(/括弧/.test(text), text);
// 古い文言 (実際より狭い制限) が残っていない。
assert.ok(!/英数字/.test(text), '「英数字のみ」は実際の受理規則ではない');

// 文言が「使えない」と言う文字は、本当に弾かれる。
var UNSAFE = ['<', '>', ':', '"', '|', '?', '*', '/', '\\'];
UNSAFE.forEach(function(ch) {
  assert.ok(text.indexOf(ch) >= 0, '使えない文字 ' + ch + ' が文言に出ている');
  assert.strictEqual(ws.isValidName('図' + ch + '1'), false, ch + ' は弾かれる');
});

// 文言が「使える」と言う書き方は、本当に通る。
// junior が実際に付けた名前をそのまま置く。
[
  'GPIOドライバ派生クラス(レビュー反映)',
  'GPIOドライバ派生クラス（レビュー反映）',
  'ADC 状態遷移 v2',
  'adc_state-1',
].forEach(function(name) {
  assert.strictEqual(ws.isValidName(name), true, name + ' は通る');
});

// 先頭・末尾の空白とドットだけは弾く。これも文言に書いてある。
assert.ok(/先頭・末尾の空白とドット/.test(text), text);
assert.strictEqual(ws.isValidName(' 図'), false);
assert.strictEqual(ws.isValidName('図.'), false);

console.log('blk-junior-0003-name-rule-text: OK');
