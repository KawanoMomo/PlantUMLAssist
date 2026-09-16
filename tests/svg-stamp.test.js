'use strict';
// BLK-reviewer-20260915-0406: svg 末尾の印 `<!-- @pua-source-sha1 ... -->` を
// CLI 側でも読む。server.py の _read_svg_stamp と同じ答えを返す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/svg-stamp.js')]; } catch (e) {}
require('../src/core/svg-stamp.js');
var st = global.window.MA.svgStamp;

var SHA = '74ec7291084f26f443460b2a664a4428d499ec3c';

describe('svgStamp.readStamp', function() {
  test('末尾に刻まれた sha1 を読む', function() {
    var svg = '<svg><text>x</text></svg>\n<!-- @pua-source-sha1 ' + SHA + ' -->\n';
    expect(st.readStamp(svg)).toBe(SHA);
  });

  test('印の無い svg は空文字 (印があると言わない)', function() {
    expect(st.readStamp('<svg><text>x</text></svg>')).toBe('');
    expect(st.readStamp('')).toBe('');
    expect(st.readStamp(null)).toBe('');
  });

  test('sha1 の形をしていない中身は読まない', function() {
    expect(st.readStamp('<!-- @pua-source-sha1 not-a-hash -->')).toBe('');
    expect(st.readStamp('<!-- @pua-source-sha1 ' + SHA.slice(0, 20) + ' -->')).toBe('');
  });

  test('閉じていない印は読まない', function() {
    expect(st.readStamp('<!-- @pua-source-sha1 ' + SHA)).toBe('');
  });

  test('server と同じく末尾 200 バイトだけを見る (前の方に残った印は拾わない)', function() {
    expect(st.tailBytes()).toBe(200);
    var head = '<!-- @pua-source-sha1 ' + SHA + ' -->';
    var svg = head + new Array(400).join('x');
    expect(st.readStamp(svg)).toBe('');
  });

  test('末尾に空白や改行が続いていても読める', function() {
    var svg = '<svg/>\n<!-- @pua-source-sha1 ' + SHA + ' -->\n\n  ';
    expect(st.readStamp(svg)).toBe(SHA);
  });
});
