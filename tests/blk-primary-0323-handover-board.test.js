'use strict';
// BLK-primary-20260917-0323-wish: 引き継ぎチェックリスト (14 枚 × 4 列)。
// 「置換済み / note最新 / SVG最新 / 指摘と符合する欠落」が 1 行で揃い、
// 揃わない行だけが「渡す前に見る図」として残ることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/handover-board.js')]; } catch (e) {}
require('../src/core/handover-board.js');
var HB = global.window.MA.handoverBoard;

var FROMS = ['SpiDrv'];

var CLEAN = [
  '@startuml', 'title SPI 初期化', 'participant Spi_Driver', 'participant Hal',
  'Spi_Driver -> Hal : init',
  'note over Spi_Driver : Spi_Driver に統一済み', '@enduml',
].join('\n');

var OLD_BODY = [
  '@startuml', 'participant SpiDrv', 'SpiDrv -> Hal : init', '@enduml',
].join('\n');

var OLD_NOTE = [
  '@startuml', 'participant Spi_Driver', 'Spi_Driver -> Hal : init',
  'note over Spi_Driver : SpiDrv の初期化手順', '@enduml',
].join('\n');

var NO_NOTE = [
  '@startuml', 'participant Spi_Driver', 'Spi_Driver -> Hal : init', '@enduml',
].join('\n');

describe('列ごとの判定', () => {
  test('置換済み: 旧称が 1 つも無ければ「置換済み」、残れば件数を出す', () => {
    expect(HB.renameCell(CLEAN, FROMS).state).toBe('done');
    var left = HB.renameCell(OLD_BODY, FROMS);
    expect(left.state).toBe('left');
    expect(left.count).toBe(2);
    expect(left.label).toContain('2 件');
  });

  test('置換後の名前を「旧称が残っている」と数えない (Spi_Driver の中の SpiDrv)', () => {
    expect(HB.countName('participant Spi_Driver', 'SpiDrv')).toBe(0);
    expect(HB.countName('SpiDrv_Start() : void', 'SpiDrv')).toBe(0);
    expect(HB.countName('participant SpiDrv', 'SpiDrv')).toBe(1);
  });

  test('置換列は note の散文を数えない (⇄ 一括置換が当たらない範囲だから)', () => {
    // 宣言も呼び出しも Spi_Driver に直っていて、note の文だけ SpiDrv のまま。
    // 「置換は済んだが note が古い」を 2 つの列が別々に言い切る。
    var r = HB.row('driver_common_class', OLD_NOTE, FROMS, 'match', []);
    expect(r.rename.state).toBe('done');
    expect(r.note.state).toBe('stale');
    expect(r.blockers).toEqual(['note が統一前のまま']);
  });

  test('note最新: note の中だけを見る。本文が古くても note が新しければ note 列は最新', () => {
    expect(HB.noteCell(CLEAN, FROMS).state).toBe('fresh');
    expect(HB.noteCell(OLD_NOTE, FROMS).state).toBe('stale');
    expect(HB.noteCell(OLD_BODY, FROMS).state).toBe('none');
  });

  test('複数行 note の中身も note として読む', () => {
    var dsl = ['@startuml', 'note left', '  SpiDrv を使う', 'end note', '@enduml'].join('\n');
    expect(HB.noteCell(dsl, FROMS).state).toBe('stale');
  });

  test('note が無い図は赤にしない (note 無は未確認でも古くもない)', () => {
    var c = HB.noteCell(NO_NOTE, FROMS);
    expect(c.state).toBe('none');
    expect(HB.row('x', NO_NOTE, FROMS, 'match', []).ready).toBe(true);
  });

  test('SVG最新: 内容一致と体裁差だけが可。未刻印は「未確認」で可にしない', () => {
    expect(HB.svgCell('match').state).toBe('ok');
    expect(HB.svgCell('format').state).toBe('ok');
    expect(HB.svgCell('differ').state).toBe('ng');
    expect(HB.svgCell('missing').state).toBe('ng');
    expect(HB.svgCell('unverified').state).toBe('unknown');
    expect(HB.svgCell(undefined).label).toBe('未確認');
  });

  test('指摘: この図を名指しした指摘だけを数え、前置きは数えない', () => {
    var f = [
      { id: 'a', heading: '名前の不一致', docs: [{ name: 'spi_state' }] },
      { id: 'b', heading: 'primary への依頼', preamble: true, docs: [{ name: 'spi_state' }] },
      { id: 'c', heading: '別件', docs: [{ name: 'can_state' }] },
    ];
    var hit = HB.gapCell('spi_state', f);
    expect(hit.state).toBe('hit');
    expect(hit.count).toBe(1);
    expect(hit.titles).toEqual(['名前の不一致']);
    expect(HB.gapCell('adc_state', f).state).toBe('clear');
  });
});

describe('1 行の合否', () => {
  test('4 列が揃った行だけが渡せる', () => {
    var r = HB.row('spi_init_sequence', CLEAN, FROMS, 'match', []);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.tone).toBe('ok');
  });

  test('揃わない列が理由として列の順に並ぶ', () => {
    var r = HB.row('driver_common_class', OLD_NOTE, FROMS, 'differ',
      [{ id: 'a', heading: '欠落', docs: [{ name: 'driver_common_class' }] }]);
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual([
      'note が統一前のまま', 'SVG が今の図から作られていない', '指摘と符合する欠落',
    ]);
    expect(r.rename.state).toBe('done');
  });

  test('本文が読めなかった図は「未確認」で、渡せる側に入れない', () => {
    var r = HB.row('adc_state', null, FROMS, 'match', []);
    expect(r.rename.state).toBe('unknown');
    expect(r.ready).toBe(false);
  });
});

describe('build と要約', () => {
  function board() {
    return HB.build({
      names: ['spi_init_sequence', 'spi_state', 'driver_common_class'],
      texts: { spi_init_sequence: CLEAN, spi_state: NO_NOTE, driver_common_class: OLD_NOTE },
      froms: FROMS,
      svg: { spi_init_sequence: 'match', spi_state: 'match', driver_common_class: 'match' },
      findings: [],
    });
  }

  test('名前の並びをそのまま保つ (資料に貼る順を並べ替えない)', () => {
    expect(board().rows.map(function(r) { return r.name; }))
      .toEqual(['spi_init_sequence', 'spi_state', 'driver_common_class']);
  });

  test('要約は渡せる枚数と渡す前に見る枚数を 1 行で言う', () => {
    var s = board().summary;
    expect(s.total).toBe(3);
    expect(s.ready).toBe(2);
    expect(s.blocked).toBe(1);
    expect(s.line).toBe('3 枚中 2 枚が渡せます・渡す前に見る図 1 枚');
    expect(s.tone).toBe('ng');
  });

  test('全部揃えば渡す前に見る図は出ない', () => {
    var b = HB.build({ names: ['a'], texts: { a: CLEAN }, froms: FROMS, svg: { a: 'match' } });
    expect(b.summary.tone).toBe('ok');
    expect(b.summary.line).toBe('1 枚中 1 枚が渡せます');
    expect(HB.blockedNames(b)).toEqual([]);
  });

  test('対象が 0 枚なら空と言う (渡せる 0 枚と混ぜない)', () => {
    expect(HB.build({ names: [] }).summary.line).toBe('対象の図がありません');
  });

  test('旧称を渡していないときは置換列を「済」と言い切らない', () => {
    var b = HB.build({ names: ['a'], texts: { a: CLEAN }, froms: [], svg: { a: 'match' } });
    expect(b.rows[0].rename.state).toBe('unknown');
    expect(b.rows[0].ready).toBe(false);
  });
});

describe('書き出す前の警告', () => {
  var B = HB.build({
    names: ['ok1', 'ng1', 'ng2'],
    texts: { ok1: CLEAN, ng1: OLD_BODY, ng2: OLD_NOTE },
    froms: FROMS,
    svg: { ok1: 'match', ng1: 'match', ng2: 'match' },
  });

  test('渡せない図を押す前に名指しする', () => {
    var w = HB.exportWarning(B);
    expect(w).toContain('未確認のまま渡そうとしています: 2 枚');
    expect(w).toContain('ng1');
    expect(w).toContain('ng2');
  });

  test('書き出す図に絞って数える', () => {
    expect(HB.exportWarning(B, ['ok1'])).toBe('');
    expect(HB.exportWarning(B, ['ok1', 'ng1'])).toContain('1 枚');
  });

  test('コピー用の表は列見出しつきで 1 行 1 図', () => {
    var lines = HB.copyText(B).split('\n');
    expect(lines[0]).toBe('図\t置換済み\tnote最新\tSVG最新\t指摘');
    expect(lines.length).toBe(4);
    expect(lines[1].split('\t')[0]).toBe('ok1');
  });
});
