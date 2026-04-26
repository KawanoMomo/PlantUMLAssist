'use strict';
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// run-tests.js が先に sandbox.window.MA に各 core モジュールを登録している。
// jsdom の window に置き換えると regex-parts / parser-utils のテストが落ちるため、
// 既存 window を保存し、本ファイル末尾で復元する。
var prevWindow = global.window;
var prevDocument = global.document;

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../src/core/line-resolver.js');
var LR = global.window.MA.lineResolver;

function makeSvg(groups) {
  // groups: [{ selector: 'g.participant', line: 5 }, ...]
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  groups.forEach(function(g) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    el.setAttribute('class', g.selector.replace('g.', ''));
    if (g.line != null) el.setAttribute('data-source-line', String(g.line));
    svg.appendChild(el);
  });
  return svg;
}

describe('lineResolver.matchByDataSourceLine', function() {
  test('matches parser line = svg line + offset', function() {
    var svg = makeSvg([{ selector: 'g.participant', line: 3 }, { selector: 'g.participant', line: 5 }]);
    var items = [{ line: 4 }, { line: 6 }];
    var matches = LR.matchByDataSourceLine(svg, items, 'g.participant', 1);
    expect(matches.length).toBe(2);
    expect(matches[0].item.line).toBe(4);
  });

  test('skips g without data-source-line', function() {
    var svg = makeSvg([{ selector: 'g.participant' }, { selector: 'g.participant', line: 5 }]);
    var items = [{ line: 6 }];
    var matches = LR.matchByDataSourceLine(svg, items, 'g.participant', 1);
    expect(matches.length).toBe(1);
  });
});

describe('lineResolver.matchByOrder', function() {
  test('pairs by appearance order when data-source-line absent', function() {
    var svg = makeSvg([{ selector: 'g.message' }, { selector: 'g.message' }]);
    var items = [{ id: 'a' }, { id: 'b' }];
    var matches = LR.matchByOrder(svg, items, 'g.message');
    expect(matches.length).toBe(2);
    expect(matches[0].item.id).toBe('a');
    expect(matches[1].item.id).toBe('b');
  });

  test('truncates to shorter length', function() {
    var svg = makeSvg([{ selector: 'g.message' }]);
    var items = [{ id: 'a' }, { id: 'b' }];
    var matches = LR.matchByOrder(svg, items, 'g.message');
    expect(matches.length).toBe(1);
  });
});

describe('lineResolver.pickBestOffset', function() {
  test('returns best offset by max match count, falls back to order match', function() {
    var svg = makeSvg([{ selector: 'g.participant', line: 3 }]);
    var items = [{ line: 4 }];  // matches with offset=1
    var result = LR.pickBestOffset(svg, items, 'g.participant', [0, 1, 5]);
    expect(result.offset).toBe(1);
    expect(result.matches.length).toBe(1);
  });
});

// jsdom window を run-tests.js が用意した sandbox window に戻す。
// これをしないと後続 test ファイル (parser-utils, regex-parts 等) が
// window.MA.* を見失って失敗する。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
