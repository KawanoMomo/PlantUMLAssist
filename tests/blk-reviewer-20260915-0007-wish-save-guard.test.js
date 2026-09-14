'use strict';
// BLK-reviewer-20260915-0007-wish: 保存を書き込む前に、同じ保存フォルダのクラス図と
// 突き合わせて宣言の無い呼び出しを止める。ここでは「相手はフォルダのクラス図だけ」
// 「止める種別」「承知の印 (signature)」「足す 1 行の提案」を固定する。

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
require('../src/core/dsl-utils.js');
require('../src/core/method-audit.js');
const sg = require('../src/core/save-guard.js');

const CLASS_DOC = {
  name: 'driver_common_class',
  dsl: [
    '@startuml',
    'class Spi_Driver {',
    '  +Spi_Init(cfg): Std_ReturnType',
    '}',
    'class ClockCtrl {',
    '  +Reset(): void',
    '}',
    '@enduml',
  ].join('\n'),
};

// 依頼2 の実例。ClockCtrl.EnableClock はどのクラス図にも宣言が無い。
const SEQ_DOC = {
  name: 'irq_init_sequence',
  dsl: [
    '@startuml',
    'participant Spi_Driver',
    'participant ClockCtrl',
    'Spi_Driver -> ClockCtrl : EnableClock(id)',
    'Spi_Driver -> Spi_Driver : Spi_Init(cfg)',
    '@enduml',
  ].join('\n'),
};

const CLEAN_SEQ = {
  name: 'spi_init_sequence',
  dsl: [
    '@startuml',
    'participant Spi_Driver',
    'App -> Spi_Driver : Spi_Init(cfg)',
    '@enduml',
  ].join('\n'),
};

describe('save-guard — 保存前のメソッド突合', function() {
  test('宣言の無い呼び出しを保存前に拾う', function() {
    const res = sg.check({ doc: SEQ_DOC, folderDocs: [CLASS_DOC, CLEAN_SEQ] });
    expect(res.noPeers).toBe(false);
    expect(res.count).toBe(1);
    expect(res.issues[0].method).toBe('EnableClock');
    expect(res.issues[0].cls).toBe('ClockCtrl');
    expect(sg.shouldBlock(res)).toBe(true);
  });

  test('宣言が揃っていれば止めない', function() {
    const res = sg.check({ doc: CLEAN_SEQ, folderDocs: [CLASS_DOC] });
    expect(res.count).toBe(0);
    expect(sg.shouldBlock(res)).toBe(false);
  });

  test('フォルダにクラス図が無ければ止めない', function() {
    // 📂 一覧をまだ読んでいない保存を、全部堰き止めないため。
    const res = sg.check({ doc: SEQ_DOC, folderDocs: [CLEAN_SEQ] });
    expect(res.noPeers).toBe(true);
    expect(sg.shouldBlock(res)).toBe(false);
  });

  test('自分自身は突合の相手にしない', function() {
    expect(sg.peers(CLASS_DOC, [CLASS_DOC, CLEAN_SEQ]).length).toBe(0);
    expect(sg.peers(SEQ_DOC, [CLASS_DOC, CLEAN_SEQ]).length).toBe(1);
  });

  test('引数の個数違いも止める', function() {
    const doc = {
      name: 'spi_arity_sequence',
      dsl: '@startuml\nApp -> Spi_Driver : Spi_Init(cfg, mode)\n@enduml',
    };
    const res = sg.check({ doc: doc, folderDocs: [CLASS_DOC] });
    expect(res.count).toBe(1);
    expect(res.issues[0].kind).toBe('arity');
  });

  test('同じ顔ぶれなら同じ signature (二度は止めない)', function() {
    const a = sg.check({ doc: SEQ_DOC, folderDocs: [CLASS_DOC] });
    const b = sg.check({ doc: SEQ_DOC, folderDocs: [CLASS_DOC, CLEAN_SEQ] });
    expect(sg.signature(a)).toBe(sg.signature(b));
    expect(sg.signature(a).length).toBeGreaterThan(0);
    expect(sg.signature(sg.check({ doc: CLEAN_SEQ, folderDocs: [CLASS_DOC] }))).toBe('');
  });

  test('クラス図に足す 1 行をそのまま貼れる形で出す', function() {
    const res = sg.check({ doc: SEQ_DOC, folderDocs: [CLASS_DOC] });
    expect(sg.declSuggestion(res.issues[0])).toBe('ClockCtrl : +EnableClock(arg1)');
    expect(sg.declSuggestion({ cls: '', method: 'X' })).toBe('');
  });

  test('一覧の行に文面と提案が入る', function() {
    const lines = sg.lines(sg.check({ doc: SEQ_DOC, folderDocs: [CLASS_DOC] }));
    expect(lines.length).toBe(1);
    expect(lines[0].text).toContain('EnableClock');
    expect(lines[0].decl).toContain('ClockCtrl');
  });

  test('見出しに件数と突合した相手が出る', function() {
    const s = sg.summaryLine(sg.check({ doc: SEQ_DOC, folderDocs: [CLASS_DOC] }));
    expect(s).toContain('driver_common_class');
    expect(s).toContain('1 件');
  });

  test('相手が無いときは「不一致なし」と言わない', function() {
    const s = sg.summaryLine(sg.check({ doc: SEQ_DOC, folderDocs: [] }));
    expect(s).toContain('突合はしていません');
  });
});
