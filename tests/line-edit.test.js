'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/line-edit.js')]; } catch (e) {}
require('../src/core/line-edit.js');
var le = global.window.MA.lineEdit;

var SEQ = [
  '@startuml',
  'participant DmaDrv',
  'participant Spi',
  '',
  "' DMA 転送",
  'DmaDrv -> Spi : send',
  'Spi --> DmaDrv : ack',
  'alt 失敗',
  '  Spi --> DmaDrv : nack',
  'end',
  '@enduml',
].join('\n');

var STATE = [
  '@startuml',
  '[*] --> Idle',
  'state Busy',
  'Idle --> Busy : send',
  'Busy --> Idle : done',
  '@enduml',
].join('\n');

describe('lineEdit public API', function() {
  test('exports the documented API', function() {
    ['kindOf', 'entries', 'filter', 'indentOf', 'replaceLine', 'insertAfter',
      'insertBefore', 'removeLine', 'summarize']
      .forEach(function(k) { expect(typeof le[k]).toBe('function'); });
  });
});

describe('kindOf', function() {
  test('classifies arrows, declarations, blocks, meta and notes', function() {
    expect(le.kindOf('DmaDrv -> Spi : send')).toBe('arrow');
    expect(le.kindOf('Idle --> Busy : send')).toBe('arrow');
    expect(le.kindOf('Parent <|-- Child')).toBe('arrow');
    expect(le.kindOf('participant DmaDrv')).toBe('decl');
    expect(le.kindOf('state Busy')).toBe('decl');
    expect(le.kindOf('class SpiDrv {')).toBe('decl');
    expect(le.kindOf('alt 失敗')).toBe('block');
    expect(le.kindOf('end')).toBe('block');
    expect(le.kindOf('@startuml')).toBe('meta');
    expect(le.kindOf('skinparam monochrome true')).toBe('meta');
    expect(le.kindOf('note right of Spi')).toBe('note');
    expect(le.kindOf("' コメント")).toBe('comment');
    expect(le.kindOf('   ')).toBe('blank');
  });
});

describe('entries', function() {
  test('keeps the original line index so filtering never shifts the target', function() {
    var es = le.entries(SEQ);
    var arrow = es.filter(function(e) { return e.kind === 'arrow'; });
    expect(arrow[0].index).toBe(5);
    expect(arrow[0].text).toBe('DmaDrv -> Spi : send');
    expect(SEQ.split('\n')[arrow[0].index]).toBe('DmaDrv -> Spi : send');
  });

  test('drops blank / comment / meta lines by default', function() {
    var kinds = le.entries(SEQ).map(function(e) { return e.kind; });
    expect(kinds.indexOf('blank')).toBe(-1);
    expect(kinds.indexOf('comment')).toBe(-1);
    expect(kinds.indexOf('meta')).toBe(-1);
  });

  test('all:true keeps every line', function() {
    expect(le.entries(SEQ, { all: true }).length).toBe(SEQ.split('\n').length);
  });

  test('handles empty / null input safely', function() {
    expect(le.entries(null)).toEqual([]);
    expect(le.entries('')).toEqual([]);
  });
});

describe('filter', function() {
  test('matches case-insensitive substrings', function() {
    var hits = le.filter(le.entries(SEQ), 'SEND');
    expect(hits.length).toBe(1);
    expect(hits[0].index).toBe(5);
  });

  test('passes everything through for an empty query', function() {
    var es = le.entries(SEQ);
    expect(le.filter(es, '  ').length).toBe(es.length);
  });
});

describe('replaceLine', function() {
  // レビュー指摘の「メッセージ名 1 語だけ直す」。図全体を打ち直さずに済むこと。
  test('replaces exactly one line and leaves the rest byte-identical', function() {
    var out = le.replaceLine(SEQ, 5, 'DmaDrv -> Spi : Spi_Transmit');
    var a = SEQ.split('\n');
    var b = out.split('\n');
    expect(b.length).toBe(a.length);
    b.forEach(function(line, i) {
      if (i === 5) expect(line).toBe('DmaDrv -> Spi : Spi_Transmit');
      else expect(line).toBe(a[i]);
    });
  });

  test('inherits the original indentation when the new text has none', function() {
    var out = le.replaceLine(SEQ, 8, 'Spi --> DmaDrv : Spi_Nack');
    expect(out.split('\n')[8]).toBe('  Spi --> DmaDrv : Spi_Nack');
  });

  test('keeps the indentation the caller typed', function() {
    var out = le.replaceLine(SEQ, 8, '    Spi --> DmaDrv : x');
    expect(out.split('\n')[8]).toBe('    Spi --> DmaDrv : x');
  });

  test('collapses embedded newlines so one line stays one line', function() {
    var out = le.replaceLine(STATE, 3, 'Idle --> Busy : a\nBusy --> Idle : b');
    expect(out.split('\n').length).toBe(STATE.split('\n').length);
    expect(out.split('\n')[3]).toBe('Idle --> Busy : a Busy --> Idle : b');
  });

  test('returns the DSL unchanged for an out-of-range index or blank text', function() {
    expect(le.replaceLine(SEQ, 99, 'x')).toBe(SEQ);
    expect(le.replaceLine(SEQ, -1, 'x')).toBe(SEQ);
    expect(le.replaceLine(SEQ, 1.5, 'x')).toBe(SEQ);
    expect(le.replaceLine(SEQ, 5, '   ')).toBe(SEQ);
    expect(le.replaceLine(SEQ, 5, null)).toBe(SEQ);
  });

  test('strips a CRLF carriage return instead of doubling it', function() {
    var crlf = 'a\r\nb\r\nc';
    expect(le.replaceLine(crlf, 1, 'B')).toBe('a\r\nB\r\nc');
  });
});

describe('insertAfter / insertBefore', function() {
  // レビュー指摘の「3 本目と 4 本目の間にメッセージを 1 本挿す」。
  test('inserts a line after the given index', function() {
    var out = le.insertAfter(SEQ, 5, 'Spi -> Spi : Spi_Prepare');
    var b = out.split('\n');
    expect(b.length).toBe(SEQ.split('\n').length + 1);
    expect(b[5]).toBe('DmaDrv -> Spi : send');
    expect(b[6]).toBe('Spi -> Spi : Spi_Prepare');
    expect(b[7]).toBe('Spi --> DmaDrv : ack');
  });

  test('inserts a line before the given index', function() {
    var b = le.insertBefore(SEQ, 5, 'DmaDrv -> DmaDrv : arm').split('\n');
    expect(b[5]).toBe('DmaDrv -> DmaDrv : arm');
    expect(b[6]).toBe('DmaDrv -> Spi : send');
  });

  test('matches the indentation of the anchor line', function() {
    var b = le.insertAfter(SEQ, 8, 'Spi --> DmaDrv : retry').split('\n');
    expect(b[9]).toBe('  Spi --> DmaDrv : retry');
  });

  test('returns the DSL unchanged for an invalid anchor or blank text', function() {
    expect(le.insertAfter(SEQ, 99, 'x')).toBe(SEQ);
    expect(le.insertBefore(SEQ, 5, '')).toBe(SEQ);
  });
});

describe('removeLine', function() {
  test('removes exactly one line', function() {
    var b = le.removeLine(SEQ, 5).split('\n');
    expect(b.length).toBe(SEQ.split('\n').length - 1);
    expect(b.indexOf('DmaDrv -> Spi : send')).toBe(-1);
    expect(b[5]).toBe('Spi --> DmaDrv : ack');
  });

  test('returns the DSL unchanged for an out-of-range index', function() {
    expect(le.removeLine(SEQ, 99)).toBe(SEQ);
  });
});

describe('summarize', function() {
  test('truncates long lines and trims', function() {
    expect(le.summarize('  a -> b : x  ')).toBe('a -> b : x');
    expect(le.summarize('abcdefghij', 5)).toBe('abcd…');
    expect(le.summarize('abcde', 5)).toBe('abcde');
  });
});
