'use strict';
// TICKET-owner-20261115-1827-prune: 旧ループの運用の道具 (他 persona 衝突・仕様突合・継続依頼・
// 前回指摘の複製・保存時/保存前の突合と omit タグ・監査履歴・CLI) を外した。
// 守るもの: 外した機能の印 (`'@omit-method` の行) を持つ既存の図も普通のコメントとして読めて、
// 監査は止まらずに動く。画面と src/ に旧ループの語が残らない。
var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var SEQ = W.MA.modules.plantumlSequence;
var ROOT = path.join(__dirname, '..');

var OMIT_DSL = [
  '@startuml',
  "'@omit-method ClockCtrl.EnableClock 呼び先は BSW 提供。本設計では宣言しない",
  'participant Spi_Driver',
  'participant ClockCtrl',
  'Spi_Driver -> ClockCtrl : EnableClock(id)',
  '@enduml',
].join('\n');

describe('omit タグを持つ既存の図', function() {
  test('タグの行は普通のコメントとして読まれ、参加者とメッセージはそのまま', function() {
    var p = SEQ.parse(OMIT_DSL);
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return e.id; });
    expect(parts).toEqual(['Spi_Driver', 'ClockCtrl']);
    expect(p.relations.length).toBe(1);
    expect(p.relations[0].line).toBe(5);
  });

  // メソッド突合 (method-audit) そのものは TICKET-owner-20261116-0321-prune で外した。
  test('省略として外す仕組みは無い', function() {
    var MA = require('./load-ma').loadMA().MA;
    expect(MA.methodAudit).toBe(undefined);
    expect(MA.omitMethod).toBe(undefined);
  });
});

describe('外した入口が残っていない', function() {
  var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8');
  var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf-8');

  test('画面に外した道具の入口・帯・札が無い', function() {
    ['btn-tab-design', 'btn-tab-audit-timeline', 'status-requests', 'save-clash-overlay',
      'save-check-overlay', 'save-guard-overlay', 'dc-modal', 'at-modal'].forEach(function(id) {
      expect(html.indexOf('id="' + id + '"')).toBe(-1);
    });
    expect(app.indexOf('他personaと突合')).toBe(-1);
    expect(app.indexOf('前回の指摘をそのまま今回の指摘にする')).toBe(-1);
  });

  test('保存は突合を掛けず、保存の 1 行に結果を足さない', function() {
    ['runSaveGuard(', 'runSaveCheck(', 'runSaveClash('].forEach(function(f) {
      expect(app.indexOf(f)).toBe(-1);
    });
  });

  test('tools/ はアイコンを起こす 2 本だけ、npm の scripts に CLI が無い', function() {
    var tools = fs.readdirSync(path.join(ROOT, 'tools')).sort();
    expect(tools).toEqual(['ico.js', 'make-icon.js']);
    var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    ['audit', 'pins', 'requests', 'findings', 'replies', 'blk-triage'].forEach(function(k) {
      expect(pkg.scripts[k]).toBe(undefined);
    });
  });

  test('画面と src/ に旧ループの語 (persona / BLK / 運用の tick) が残らない', function() {
    var files = [path.join(ROOT, 'plantuml-assist.html')];
    ['src', 'src/core', 'src/ui', 'src/modules'].forEach(function(d) {
      fs.readdirSync(path.join(ROOT, d)).filter(function(f) { return f.endsWith('.js'); })
        .forEach(function(f) { files.push(path.join(ROOT, d, f)); });
    });
    var hits = [];
    files.forEach(function(f) {
      var text = fs.readFileSync(f, 'utf-8');
      // UML のイベント名の例 `Tick` は図の語なので数えない (小文字の tick だけを見る)。
      if (/persona|ペルソナ|BLK|\btick\b/.test(text)) hits.push(path.relative(ROOT, f));
    });
    expect(hits).toEqual([]);
  });
});
