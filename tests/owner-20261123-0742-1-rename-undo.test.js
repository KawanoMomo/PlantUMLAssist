'use strict';
// TICKET-owner-20261123-0742-1: ⇄ 一括置換で保存先の木へ当てた 1 回の置換を、「置換前に戻す」1 押しで
// 開いている図も開いていない図も全部戻す。先に Ctrl+Z で戻した図は二重に戻さない。窓の一覧は 1 つ。
// 実マウスの確かめは tests/scenarios/roadmap-20261123-0226-1.spec.js。
// 窓は runner が用意したものを使う (差し替えると、後に走る他の試験が読む window.MA が消える)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/rename-undo.js', '../src/core/folder-impact.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var fs = require('fs');
var path = require('path');
var RU = window.MA.renameUndo;
var FI = window.MA.folderImpact;

var A0 = '@startuml\nparticipant SpiDrv\n@enduml\n';
var A1 = '@startuml\nparticipant SpiCore\n@enduml\n';
var B0 = '@startuml\nSpiDrv -> X\n@enduml\n';
var B1 = '@startuml\nSpiCore -> X\n@enduml\n';

function rows() {
  return RU.openRows({ 1: A0, 2: B0, 3: 'nothing' }, [{ id: 1, dsl: A1 }, { id: 2, dsl: B1 }],
    { 1: 'a', 2: 'hw/b' }, { 1: 'a', 2: 'b' });
}

describe('置換の直後に控える開いている図 (renameUndo.openRows)', function() {
  test('当てた図ごとに前後を控え、名前は窓に出す名前 (道付き)', function() {
    var r = rows();
    expect(r.length).toBe(2);
    expect(r[0]).toEqual({ id: 1, name: 'a', label: 'a', before: A0, after: A1 });
    expect(r[1].label).toBe('hw/b');
  });
  test('前の本文を控えていない図・前後が同じ図は控えない', function() {
    var r = RU.openRows({ 1: A0 }, [{ id: 1, dsl: A0 }, { id: 9, dsl: B1 }], {}, {});
    expect(r).toEqual([]);
  });
});

describe('押した時点の戻し方 (renameUndo.plan)', function() {
  test('開いている図も開いていない図も 1 回で全部戻す (枚数は両方の和)', function() {
    var p = RU.plan(rows(), { 1: A1, 2: B1 }, [{ label: 'hw/a' }, { label: 'hw/spi/b' }]);
    expect(p.open.map(function(r) { return r.id; })).toEqual([1, 2]);
    expect(p.unopened).toBe(2);
    expect(p.total).toBe(4);
    expect(RU.buttonLabel(p)).toBe('置換前に戻す (4 枚)');
  });
  test('先に Ctrl+Z で戻した図 (今の本文が置換前) は二重に戻さず、残りの図だけを数える', function() {
    var p = RU.plan(rows(), { 1: A0, 2: B1 }, [{ label: 'hw/a' }]);
    expect(p.open.map(function(r) { return r.id; })).toEqual([2]);
    expect(p.already).toEqual(['a']);
    expect(p.total).toBe(2);
    expect(RU.buttonLabel(p)).toBe('置換前に戻す (2 枚)');
    expect(RU.buttonTitle(p)).toContain('Ctrl+Z で先に戻した図 (a)');
  });
  test('置換の後に書き換わった図は戻さず名前を返す。閉じたタブの図は戻さない', function() {
    var p = RU.plan(rows(), { 1: A1 + "' more\n" }, []);
    expect(p.open).toEqual([]);
    expect(p.changedAfter).toEqual(['a']);
    expect(p.total).toBe(0);
  });
});

describe('語 (開いている / 開いていない。「未オープン」を使わない)', function() {
  test('戻した後の知らせは戻した枚数と内訳を言う', function() {
    expect(RU.doneText({ open: 1, unopened: 2, skipped: [], failed: 0 }))
      .toBe('3 枚を置換前に戻しました (開いている 1 枚・開いていない 2 枚)');
    expect(RU.doneText({ open: 0, unopened: 2, skipped: ['hw/c'], failed: 1 }))
      .toBe('2 枚を置換前に戻しました (開いていない 2 枚) / 置換の後に書き換わった図は戻していません: hw/c / 1 枚は書き込めませんでした');
  });
  test('ボタン・知らせ・数える窓の要約に「未オープン」が無い', function() {
    var p = RU.plan(rows(), { 1: A1, 2: B1 }, [{}]);
    [RU.buttonLabel(p), RU.buttonTitle(p), RU.doneText({ open: 2, unopened: 1 }),
      FI.summaryText({ files: 5, hitDocs: 3, total: 12, unopenedHitDocs: 2 })].forEach(function(t) {
      expect(t.indexOf('未オープン')).toBe(-1);
    });
    expect(FI.summaryText({ files: 5, hitDocs: 3, total: 12, unopenedHitDocs: 2 })).toContain('開いていない 2 枚を含む');
  });
});

describe('app.js の結線', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
  test('「置換前に戻す」は開いている図も戻す revertRename を呼び、開いていない図だけの戻しを直接呼ばない', function() {
    expect(/revertBtn\.addEventListener\('click'[\s\S]{0,120}revertRename\(\)/.test(src)).toBe(true);
    expect(/revertBtn\.addEventListener\('click'[\s\S]{0,120}revertUnopenedRename\(\)/.test(src)).toBe(false);
  });
  test('置換の直後に開いている図の前後を控える', function() {
    expect(/_renameUndoOpen = window\.MA\.renameUndo\.openRows\(/.test(src)).toBe(true);
  });
  test('保存フォルダの図も数えている間は、ヒットの一覧に開いている図を並べない (一覧は 1 つ)', function() {
    expect(/var oneList = !!allDocs && _fiEnabled\(\);/.test(src)).toBe(true);
    expect(/if \(oneList\) return;/.test(src)).toBe(true);
  });
  test('窓の語に「未オープン」が残らない', function() {
    var from = src.indexOf('function updateRenamePreview');
    var to = src.indexOf('// ── 行編集');
    expect(src.slice(from, to).indexOf('未オープン')).toBe(-1);
    expect(html.indexOf('src/core/rename-undo.js') >= 0).toBe(true);
  });
});
