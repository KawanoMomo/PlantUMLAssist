'use strict';
// BLK-builder-20260924-1716-4 (design 9c / 10a): 下端の「並べて比較」は、相手が決まるまで出さない。
// 出すときは他の件数表示と同じ「● 名前」の 1 種類の形 (枠なし)。入口は FILES「読むだけ」の ⇔。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var SB = W.MA.statusBadges;
var SP = require('../src/core/senior-pane.js');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('下端の並べて比較 (design 9c / 10a)', function() {
  test('相手が決まっていない (0 件) なら何も出さない', function() {
    var t = SP.statusText(null, { ready: false });
    expect(SB.namedText(t.label, t.count)).toBe('');
    var none = SP.statusText({ how: 'none', reason: 'x' }, { ready: true });
    expect(SB.namedText(none.label, none.count)).toBe('');
  });

  test('相手が決まれば「● 並べて比較 {図名}」の 1 種類の形で出る', function() {
    var t = SP.statusText({ how: 'same-name', name: 'gpio_state.puml', reason: '同じ名前' }, { ready: true });
    expect(SB.namedText(t.label, t.count)).toBe('● 並べて比較 gpio_state');
  });

  test('起動直後の HTML では札は隠れていて、「並べて比較 −」の文字を持たない', function() {
    var m = /<button[^>]*id="status-senior"[^>]*>([^<]*)<\/button>/.exec(html);
    expect(m).not.toBeNull();
    expect(/\shidden[\s>]/.test(m[0])).toBe(true);
    expect(m[1]).toBe('');
  });

  test('下端の札は枠付きの旧い形 (#status-senior の border) を持たない', function() {
    expect(/#status-senior\s*[,{]/.test(html)).toBe(false);
    expect(/#status-senior\.on/.test(html)).toBe(false);
  });

  test('入口は FILES「読むだけ」の ⇔ に残っている', function() {
    expect(html).toContain('id="btn-tab-senior"');
  });
});
