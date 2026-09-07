'use strict';
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/id-normalizer.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/sequence-marks.js',
  '../src/modules/sequence.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var seqMod = global.window.MA.modules.plantumlSequence;

var BASE = ['@startuml', '@enduml'].join('\n');
var EMPTY = { elements: [] };

describe('sequence parseBulkLines', function() {
  test('a bare word is a participant, keywords set the type', function() {
    expect(seqMod.parseBulkLines('SpiDrv\nactor Dev\ndatabase Cfg')).toEqual([
      { op: 'participant', ptype: 'participant', id: 'SpiDrv', label: '' },
      { op: 'participant', ptype: 'actor', id: 'Dev', label: '' },
      { op: 'participant', ptype: 'database', id: 'Cfg', label: '' },
    ]);
  });
  test('both `as Alias` and `: label` give the display label', function() {
    expect(seqMod.parseBulkLines('participant "SPI ドライバ" as SpiDrv\nHal : HAL 層')).toEqual([
      { op: 'participant', ptype: 'participant', id: 'SpiDrv', label: 'SPI ドライバ' },
      { op: 'participant', ptype: 'participant', id: 'Hal', label: 'HAL 層' },
    ]);
  });
  test('arrow lines become messages and keep the arrow shape', function() {
    expect(seqMod.parseBulkLines([
      'Dev -> SpiDrv : Spi_Init()',
      'SpiDrv --> Dev : E_OK',
      'SpiDrv ->> Hal',
    ].join('\n'))).toEqual([
      { op: 'message', from: 'Dev', to: 'SpiDrv', arrow: '->', label: 'Spi_Init()' },
      { op: 'message', from: 'SpiDrv', to: 'Dev', arrow: '-->', label: 'E_OK' },
      { op: 'message', from: 'SpiDrv', to: 'Hal', arrow: '->>', label: '' },
    ]);
  });
  test('blank lines, comments and @startuml/@enduml are ignored', function() {
    expect(seqMod.parseBulkLines("\n  \n' note\n# note\n@startuml\n@enduml")).toEqual([]);
  });
});

describe('sequence addBulk', function() {
  test('participants come first, messages after, regardless of input order', function() {
    var block = [
      'Dev -> SpiDrv : Spi_Init()',
      'actor Dev',
      'SpiDrv',
    ].join('\n');
    expect(seqMod.addBulk(BASE, block, EMPTY).split('\n')).toEqual([
      '@startuml',
      'actor Dev',
      'participant SpiDrv',
      'Dev -> SpiDrv : Spi_Init()',
      '@enduml',
    ]);
  });
  test('a message may reference a participant declared later in the block', function() {
    var out = seqMod.addBulk(BASE, 'A -> B : ping\nA\nB', EMPTY);
    expect(out).toContain('participant A\nparticipant B\nA -> B : ping');
  });
  test('japanese names become ASCII aliases and messages follow them', function() {
    var out = seqMod.addBulk(BASE, 'actor 開発者\n通信\n開発者 -> 通信 : 初期化', EMPTY);
    var decl = out.split('\n').filter(function(l) { return /\bas\b/.test(l); });
    expect(decl.length).toBe(2);
    var acId = decl[0].match(/as (\w+)$/)[1];
    var pId = decl[1].match(/as (\w+)$/)[1];
    expect(out).toContain(acId + ' -> ' + pId + ' : 初期化');
    expect(out).toContain('"開発者"');
  });
  test('nothing addable leaves the text untouched', function() {
    expect(seqMod.addBulk(BASE, '   \n\n', EMPTY)).toBe(BASE);
  });
  test('appends after existing content', function() {
    var t = ['@startuml', 'participant Dev', '@enduml'].join('\n');
    expect(seqMod.addBulk(t, 'Hal', { elements: [{ kind: 'participant', id: 'Dev' }] }))
      .toContain('participant Dev\nparticipant Hal');
  });
  test('an already declared participant is referenced, not redeclared', function() {
    var t = ['@startuml', 'participant Dev', '@enduml'].join('\n');
    var parsed = { elements: [{ kind: 'participant', id: 'Dev' }] };
    var out = seqMod.addBulk(t, 'Dev\nHal\nDev -> Hal : ping', parsed);
    expect(out.split('\n').filter(function(l) { return l === 'participant Dev'; }).length).toBe(1);
    expect(out).toContain('Dev -> Hal : ping');
  });
  test('the GPIO script (5 participants + 6 messages) lands in one call', function() {
    var block = [
      'actor Dev',
      'participant "GPIO ドライバ" as GpioDrv',
      'participant Port',
      'participant Pin',
      'participant Hal',
      'Dev -> GpioDrv : Gpio_Init()',
      'GpioDrv -> Port : Port_Config()',
      'Port --> GpioDrv : E_OK',
      'GpioDrv -> Pin : Pin_SetMode()',
      'Pin --> GpioDrv : E_OK',
      'GpioDrv --> Dev : E_OK',
    ].join('\n');
    var out = seqMod.addBulk(BASE, block, EMPTY);
    var body = out.split('\n').slice(1, -1);
    expect(body.length).toBe(11);
    expect(body[1]).toBe('participant "GPIO ドライバ" as GpioDrv');
    expect(body[5]).toBe('Dev -> GpioDrv : Gpio_Init()');
    expect(body[10]).toBe('GpioDrv --> Dev : E_OK');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
