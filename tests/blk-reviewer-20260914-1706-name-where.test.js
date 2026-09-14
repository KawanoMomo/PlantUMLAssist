'use strict';
// BLK-reviewer-20260914-1706: 名前突合が「表記揺れ 3 組」と正規化キーだけを出し、
// どのファイルのどの宣言行が該当するかを出さないので、毎回ソースを grep し直していた。
// 出現位置 (図名:行) を持ち、綴りの対応を 1 行で読めることをここで守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/name-audit.js')]; } catch (e) {}
require('../src/core/name-audit.js');
var na = global.window.MA.nameAudit;

var PRIMARY = [
  '@startuml',
  'class IRQCtrl {',
  '  + Init() : void',
  '}',
  'class ClockCtrl',
  'IRQCtrl --> ClockCtrl',
  '@enduml',
].join('\n');

var JUNIOR = [
  '@startuml',
  'participant Irq_Ctrl',
  'participant Clock_Ctrl',
  'Irq_Ctrl -> Clock_Ctrl : Init()',
  '@enduml',
].join('\n');

var DOCS = [
  { name: 'primary/driver_common_class.puml', dsl: PRIMARY },
  { name: 'junior/diagram1.puml', dsl: JUNIOR },
];

function row(name) {
  return na.collect(DOCS).filter(function(r) { return r.name === name; })[0];
}

describe('nameAudit.collect の出現位置', () => {
  test('宣言は図名・行・本文を持つ', () => {
    var irq = row('IRQCtrl');
    expect(irq.at[0].doc).toBe('primary/driver_common_class.puml');
    expect(irq.at[0].line).toBe(2);
    expect(irq.at[0].declared).toBe(true);
    expect(irq.at[0].text).toBe('class IRQCtrl {');
  });

  test('矢印だけの出現も位置を持ち、宣言と区別できる', () => {
    var refs = row('IRQCtrl').at.filter(function(o) { return !o.declared; });
    expect(refs.length).toBe(1);
    expect(refs[0].line).toBe(6);
  });
});

describe('nameAudit.variantLines', () => {
  test('どの綴りがどの綴りと対応し、どこで揺れているかが読める', () => {
    var lines = na.variantLines(DOCS);
    var head = lines.filter(function(l) { return l.indexOf('IRQCtrl') !== -1 && l.indexOf('⇔') !== -1; })[0];
    expect(head).toContain('Irq_Ctrl');
    expect(head).toContain('揃える先:');
    var where = lines.join('\n');
    expect(where).toContain('primary/driver_common_class.puml:2 宣言');
    expect(where).toContain('junior/diagram1.puml:2 宣言');
    expect(where).toContain('ClockCtrl');
  });

  test('出現は既定 3 件まで、0 を渡すと全部', () => {
    var irq = row('IRQCtrl');
    expect(na.occurrences(irq, 0).length).toBe(irq.at.length);
    expect(na.occurrences(irq).length).toBeLessThan(4);
  });

  test('揺れが無ければ 1 行も出ない', () => {
    expect(na.variantLines([{ name: 'a.puml', dsl: PRIMARY }]).length).toBe(0);
  });

  test('audit() からも同じ文面が取れる (CLI はここを読む)', () => {
    expect(na.audit(DOCS).variantLines).toEqual(na.variantLines(DOCS));
  });
});
