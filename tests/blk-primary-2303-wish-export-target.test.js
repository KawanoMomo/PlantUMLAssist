'use strict';
// BLK-primary-20260908-2303-wish 「書き出す前の対象確認」。
//
// 願望: 📦引き継ぎ は開いているタブだけを対象にするため、保存フォルダに 14 枚
// あってもタブが 2 枚なら 2 枚しか zip に入らず、受け取った新人が開いて初めて
// 欠落に気づく。書き出す前に「対象 2 枚 / 保存フォルダ 14 枚」の差分と、
// 「保存フォルダ全体を対象にする」への切替が画面に要る。
//
// ここでは判定の純関数を検証する (パネルの結線は app.js、E2E は primary-4)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var depPaths = ['../src/core/export-target.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ET = global.window.MA.exportTarget;

function openDocs() {
  return [
    { id: 'd1', name: 'spi_init_sequence', diagramType: 'plantuml-sequence', dsl: '@startuml\n@enduml' },
    { id: 'd2', name: 'plantuml-state', diagramType: 'plantuml-state', dsl: '@startuml\n@enduml' },
  ];
}

// 保存フォルダの 14 枚。うち 2 枚はタブでも開いている。
function folderDocs(n) {
  var out = [
    { name: 'spi_init_sequence', dsl: '@startuml\n@enduml' },
    { name: 'plantuml-state', dsl: '@startuml\n@enduml' },
  ];
  for (var i = 1; i + 2 <= (n || 14); i++) {
    out.push({ name: 'diagram' + i, dsl: '@startuml\n@enduml' });
  }
  return out;
}

describe('export-target — 書き出す前の対象確認 (BLK-primary-20260908-2303-wish)', function() {

  test('保存フォルダが読めていれば既定はフォルダ全体で、14 枚すべてが対象になる', function() {
    var m = ET.model({
      openDocs: openDocs(), folderDocs: folderDocs(14),
      folderAvailable: true, folderDir: 'E:/01_Loop/persona-data/primary',
    });
    expect(m.mode).toBe(ET.MODE_FOLDER);
    expect(m.count).toBe(14);
    expect(m.missing).toBe(0);
    expect(m.warn).toBe(false);
    expect(m.line).toBe('対象 14 枚 / 保存フォルダ 14 枚');
  });

  test('開いているタブだけに切り替えると「対象 2 枚 / 保存フォルダ 14 枚」と 12 枚の欠落が出る', function() {
    var m = ET.model({
      openDocs: openDocs(), folderDocs: folderDocs(14),
      folderAvailable: true, mode: ET.MODE_OPEN,
    });
    expect(m.count).toBe(2);
    expect(m.folderCount).toBe(14);
    expect(m.missing).toBe(12);
    expect(m.missingUnopened).toBe(12);
    expect(m.warn).toBe(true);
    expect(m.line.indexOf('対象 2 枚 / 保存フォルダ 14 枚')).toBe(0);
    expect(m.line.indexOf('12 枚が対象から外れています')).toBeGreaterThan(0);
    // 落ちている図の名前が 5 枚まで並ぶ (枚数を数えずに何が落ちるか読める)。
    expect(m.line.indexOf('diagram1')).toBeGreaterThan(0);
    expect(m.hint.indexOf('保存フォルダ全体')).toBeGreaterThan(-1);
  });

  test('テンプレはどちらの的でも対象外で、欠落としては数えない', function() {
    var m = ET.model({
      openDocs: openDocs(), folderDocs: folderDocs(5),
      roles: { diagram1: 'template', diagram2: { role: 'template' } },
      folderAvailable: true,
    });
    expect(m.template).toBe(2);
    expect(m.count).toBe(3);
    expect(m.missing).toBe(0);
    expect(m.warn).toBe(false);
    expect(m.line.indexOf('テンプレ 2 枚は対象外')).toBeGreaterThan(0);
  });

  test('保存先フォルダが未設定 (localStorage 運用) ならタブが対象のすべてで、警告は出ない', function() {
    var m = ET.model({ openDocs: openDocs(), folderDocs: [], folderAvailable: false });
    expect(m.mode).toBe(ET.MODE_OPEN);
    expect(m.count).toBe(2);
    expect(m.missing).toBe(0);
    expect(m.warn).toBe(false);
    expect(m.line.indexOf('保存先フォルダが未設定')).toBeGreaterThan(0);
    expect(m.hint).toBe('');
  });

  test('フォルダを的にしても読めていなければ、黙ってフォルダ扱いにせずタブに落とす', function() {
    var m = ET.model({ openDocs: openDocs(), folderDocs: [], folderAvailable: false, mode: ET.MODE_FOLDER });
    expect(m.mode).toBe(ET.MODE_OPEN);
    expect(m.canBuild).toBe(true);
  });

  test('同じ名前はタブ側 (編集中の内容) を採り、二重に数えない', function() {
    var open = openDocs();
    open[0].dsl = '@startuml\ntitle 編集中\n@enduml';
    var m = ET.model({ openDocs: open, folderDocs: folderDocs(14), folderAvailable: true });
    var hit = m.targets.filter(function(d) { return d.name === 'spi_init_sequence'; });
    expect(hit.length).toBe(1);
    expect(hit[0].open).toBe(true);
    expect(hit[0].dsl.indexOf('編集中')).toBeGreaterThan(0);
  });

  test('1 枚も対象が無ければ書き出せない', function() {
    var m = ET.model({ openDocs: [], folderDocs: [], folderAvailable: false });
    expect(m.count).toBe(0);
    expect(m.canBuild).toBe(false);
  });

  test('書き出した後の 1 行に、何枚のうち何枚を出したかが残る', function() {
    var m = ET.model({ openDocs: openDocs(), folderDocs: folderDocs(14), folderAvailable: true, mode: ET.MODE_OPEN });
    expect(ET.resultLine(m)).toBe('2 枚 / 保存フォルダ 14 枚 ・ ⚠ 12 枚は対象外');
  });
});

global.window = prevWindow;
global.document = prevDocument;
