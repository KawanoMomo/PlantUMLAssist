'use strict';
// TICKET-owner-20261115-1841-prune: 図をまたぐ監査 (▦ 突合ボード・⇉ 系統チェック・系統マップ・
// ◎ トレース漏れ・観点一括・🔤 表記統一・要求 ID 対応・下端の整合 / イベント整合の札・
// 依存チェックの「実際の呼び出し」枠) を外した。入口が残っていないことと、
// 依存チェックの画面だけが実績 (他の図の呼び出し) を見なくなったことを固定する。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
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

// 依存チェックの本体 (component-deps) も TICKET-owner-20261116-0921-prune で外した。
describe('依存チェックは残っていない', function() {
  test('component.js に依存チェックの枠も呼び出しも無く、html は component-deps を読み込まない', function() {
    expect(W.MA.componentDeps).toBe(undefined);
    ['co-deps-summary', 'co-deps-body', 'componentDeps', '依存チェック'].forEach(function(w) {
      expect(comp.indexOf(w)).toBe(-1);
    });
    expect(html.indexOf('component-deps.js')).toBe(-1);
    expect(comp.indexOf("usage: '実際の呼び出し'")).toBe(-1);
  });
});
