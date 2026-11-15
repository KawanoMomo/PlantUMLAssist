'use strict';
// TICKET-owner-20261115-1841-prune: 図をまたぐ監査 (▦ 突合ボード・⇉ 系統チェック・系統マップ・
// ◎ トレース漏れ・観点一括・🔤 表記統一・要求 ID 対応・下端の整合 / イベント整合の札・
// 依存チェックの「実際の呼び出し」枠) を外した。入口が残っていないことと、
// 依存チェックの画面だけが実績 (他の図の呼び出し) を見なくなったことを固定する。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var CD = W.MA.componentDeps;
var TM = W.MA.toolMenu;

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
const comp = fs.readFileSync(path.join(ROOT, 'src', 'modules', 'component.js'), 'utf8');

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

describe('外した監査の入口が残っていない', function() {
  test('タブ列・下端・Export ▾ にボタンも窓も無い', function() {
    ['btn-tab-cross', 'btn-tab-family', 'btn-tab-drivermap', 'btn-tab-trace', 'btn-tab-pattern', 'btn-tab-unify',
      'exp-req-trace', 'status-consistency', 'status-eventsync', 'dg-ticket',
      'ab-modal', 'req-modal', 'unify-panel', 'pattern-panel'].forEach(function(id) {
      expect(html.indexOf('id="' + id + '"')).toBe(-1);
    });
  });

  test('ツール ▾ に「確かめる」の分類が無い', function() {
    expect(TM.groups().map(function(g) { return g.key; })).not.toContain('check');
    expect(TM.menuIds().indexOf('btn-tab-unify')).toBe(-1);
  });

  test('Ctrl+K の行も外した (突合ボード・系統チェック・トレース・表記統一・観点一括・整合)', function() {
    ["{ id: 'tab-cross'", "{ id: 'family-audit'", "{ id: 'trace-coverage'", "{ id: 'tab-unify'",
      "{ id: 'tab-pattern'", "{ id: 'consistency'", "{ id: 'eventsync'", "{ id: 'tab-drivermap'"].forEach(function(row) {
      expect(app.indexOf(row)).toBe(-1);
    });
  });

  test('外した道具の結線が app.js に残っていない', function() {
    ['setupAuditBoard', 'setupFamilyAudit', 'setupDriverMap', 'setupTraceCoverage', 'setupConsistencyPanel',
      'setupEventSyncPanel', 'setupNameUnify', 'setupPatternCheck', 'setupReqTrace'].forEach(function(fn) {
      expect(app.indexOf(fn + '(')).toBe(-1);
    });
  });
});

describe('依存チェックは「実際の呼び出し」枠を出さない', function() {
  var MINE = uml(['component GpioDrv', 'component Port_Drv', 'GpioDrv ..> Port_Drv : 依存']);
  var SEQ = uml(['participant GpioDrv', 'participant Logger', 'GpioDrv -> Logger : 初期化完了を記録']);
  var DOCS = [
    { id: 1, name: 'gpio_component', diagramType: 'plantuml-component', dsl: MINE },
    { id: 2, name: 'gpio_init_sequence', diagramType: 'plantuml-sequence', dsl: SEQ },
  ];

  test('noUsage では他の図の呼び出し相手を候補にしない', function() {
    var res = CD.check(MINE, DOCS, 1, 'GpioDrv', { noUsage: true });
    expect(res.rows.filter(function(r) { return r.source === 'usage'; })).toEqual([]);
    expect(res.usageMissing).toBe(0);
    expect(res.rows.some(function(r) { return r.name === 'Logger'; })).toBe(false);
  });

  test('既定 (部品を起こす側) は今までどおり実績を拾う', function() {
    var res = CD.check(MINE, DOCS, 1, 'GpioDrv');
    expect(res.rows.some(function(r) { return r.source === 'usage' && r.name === 'Logger'; })).toBe(true);
  });

  test('依存チェックの画面は noUsage で引き、出所の札に「実際の呼び出し」を持たない', function() {
    expect(comp).toContain('CD.check(dsl, docs, activeId, subject, { noUsage: true })');
    expect(comp.indexOf("usage: '実際の呼び出し'")).toBe(-1);
  });
});
