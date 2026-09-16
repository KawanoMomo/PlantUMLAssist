'use strict';
// BLK-primary-20260916-0426-wish: 資料セットから 24 枚を zip に書き出した後、
// 「客先に見せてよい状態か」を資料の完成物 (表紙・目次・図番号・注記込み) で
// 見返す場が無い。差し戻しがあれば zip を解凍して 1 枚ずつ開き直すことになる。
// 書き出した結果そのもの (zip に入った紙) を資料の体裁で組み直し、出す前に
// 判定まで言い切る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/doc-set.js', '../src/core/doc-layout.js', '../src/core/doc-proof.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var DL = global.window.MA.docLayout;
var DP = global.window.MA.docProof;

var SET = {
  name: '顧客資料',
  docs: ['spi_init_sequence', 'spi_state', 'can_state'],
  items: [
    { name: 'spi_init_sequence', heading: 'SPI 初期化', note: '起動直後の手順' },
    { name: 'spi_state', heading: 'SPI の状態遷移', note: '受信待ちからの復帰' },
    { name: 'can_state', heading: 'CAN の状態遷移', note: 'バスオフからの復帰' },
  ],
};
var FOLDER = ['spi_init_sequence', 'spi_state', 'can_state'];
var SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';

function filesFor(names) {
  var sh = DL.sheet(SET, FOLDER);
  var out = [];
  sh.entries.forEach(function(e) {
    if (names.indexOf(e.name) >= 0) out.push({ name: DL.fileNameOf(e) + '.svg', content: SVG });
  });
  out.push({ name: '資料の体裁.md', content: DL.sheetText(sh) });
  return out;
}

describe('doc-proof: 書き出した資料を客先の体裁で見返す', function() {

  test('zip に入った紙から、表紙・目次・図番号・注記・図の本体を持つページが組める', function() {
    var sh = DL.sheet(SET, FOLDER);
    var proof = DP.build(sh, filesFor(FOLDER),
      { zipFile: 'diagrams.zip', at: '2026-09-16 04:30' });
    expect(proof.total).toBe(3);
    expect(proof.title).toBe('顧客資料');
    // 表紙は資料の顔。枚数と出どころを言い切る。
    expect(DP.coverLines(proof)).toEqual(['顧客資料', '全 3 図', 'diagrams.zip', '2026-09-16 04:30']);
    // 目次は貼った後の見え方そのまま。
    expect(DP.tocLine(proof.pages[0])).toBe('図1 SPI 初期化 — 起動直後の手順');
    // ページは図番号順で、図の本体 (SVG) を持つ。
    expect(proof.pages.map(function(p) { return p.no; })).toEqual([1, 2, 3]);
    expect(proof.pages[0].file).toBe('01_spi_init_sequence.svg');
    expect(proof.pages[0].svg).toContain('<svg');
    expect(proof.pages.every(function(p) { return p.inZip; })).toBe(true);
    // 図以外の紙も資料の一部として名前が残る。
    expect(proof.papers).toContain('資料の体裁.md');
  });

  test('揃っていれば「このまま客先に出せます」と言い切る', function() {
    var proof = DP.build(DL.sheet(SET, FOLDER), filesFor(FOLDER), { zipFile: 'z.zip' });
    expect(DP.checks(proof)).toEqual([]);
    var v = DP.verdict(proof);
    expect(v.ok).toBe(true);
    expect(v.cls).toBe('dp-ok');
    expect(v.text).toContain('客先に出せます');
  });

  test('zip に図が入らなかったページは出す前に名指しし、出せないと判定する', function() {
    // 体裁の上では 3 枚だが、zip には 2 枚しか入らなかった回。
    var proof = DP.build(DL.sheet(SET, FOLDER),
      filesFor(['spi_init_sequence', 'can_state']), { zipFile: 'z.zip' });
    var page = proof.pages[1];
    expect(page.inZip).toBe(false);
    expect(page.svg).toBe('');
    var bad = DP.checks(proof).filter(function(c) { return c.level === 'bad'; });
    expect(bad.length).toBe(1);
    expect(bad[0].text).toContain('図2 spi_state');
    var v = DP.verdict(proof);
    expect(v.ok).toBe(false);
    expect(v.cls).toBe('dp-bad');
    expect(v.text).toContain('客先に出せません');
  });

  test('中身が SVG でない紙は、入っていても図としては数えない', function() {
    var files = filesFor(FOLDER);
    files[0].content = 'Error: java not found';
    var proof = DP.build(DL.sheet(SET, FOLDER), files, {});
    expect(proof.pages[0].inZip).toBe(false);
    expect(DP.verdict(proof).ok).toBe(false);
  });

  test('見出しが図の名前のまま・注記が空なら、出せるが直す所として挙がる', function() {
    var set = { name: '顧客資料', docs: ['spi_state', 'can_state'],
                items: [{ name: 'spi_state', heading: 'SPI の状態遷移', note: '' }] };
    var sh = DL.sheet(set, FOLDER);
    var files = sh.entries.map(function(e) {
      return { name: DL.fileNameOf(e) + '.svg', content: SVG };
    });
    var proof = DP.build(sh, files, {});
    var keys = DP.checks(proof).map(function(c) { return c.key; });
    expect(keys).toContain('untitled');
    expect(keys).toContain('blank');
    expect(DP.checks(proof).every(function(c) { return c.level === 'warn'; })).toBe(true);
    var v = DP.verdict(proof);
    expect(v.ok).toBe(true);
    expect(v.cls).toBe('dp-warn');
    expect(v.text).toContain('直すなら');
  });

  test('図番号を付ける前に書き出した zip も、同じ資料として読める', function() {
    var sh = DL.sheet(SET, FOLDER);
    var files = FOLDER.map(function(n) { return { name: n + '.svg', content: SVG }; });
    var proof = DP.build(sh, files, {});
    expect(proof.pages.every(function(p) { return p.inZip; })).toBe(true);
    expect(proof.pages[0].file).toBe('spi_init_sequence.svg');
  });

  test('差し戻しは図番号でも図名でも引ける (直すページへ戻る口)', function() {
    var proof = DP.build(DL.sheet(SET, FOLDER), filesFor(FOLDER), {});
    expect(DP.findPage(proof, '図2').name).toBe('spi_state');
    expect(DP.findPage(proof, 'can_state').no).toBe(3);
    expect(DP.findPage(proof, 'なにか')).toBe(null);
  });

  test('図が 1 枚も無ければ資料として成立しないと言う', function() {
    var proof = DP.build({ title: '空', entries: [] }, [], {});
    expect(DP.verdict(proof).ok).toBe(false);
    expect(DP.verdict(proof).text).toContain('空');
  });
});

// BLK-primary-20260916-0626-wish: 書き出しの指摘を、資料を開いたままその場で埋める。
describe('doc-proof: 指摘をその場で埋める', function() {
  var BARE = { name: '顧客資料', docs: ['spi_init_sequence', 'spi_state'], items: [] };
  var NAMES = ['spi_init_sequence', 'spi_state'];
  function bare() {
    var sh = DL.sheet(BARE, NAMES);
    var files = sh.entries.map(function(e) { return { name: DL.fileNameOf(e) + '.svg', content: SVG }; });
    return DP.build(sh, files, {});
  }

  test('空の資料は見出し・注記の指摘が全ページに出て、最初に埋めるページが引ける', function() {
    var p = bare();
    var keys = DP.checks(p).map(function(c) { return c.key; });
    expect(keys).toEqual(['untitled', 'blank']);
    expect(DP.firstPageFor(p, 'blank').no).toBe(1);
    expect(DP.rawHeading(p.pages[0])).toBe('');
  });

  test('applyEdit で見出し・注記を埋めると、判定がその場で「このまま出せる」に変わる', function() {
    var p = bare();
    NAMES.forEach(function(n, i) {
      p = DP.applyEdit(p, n, 'heading', '見出し' + i);
      p = DP.applyEdit(p, n, 'note', '注記' + i);
    });
    expect(DP.checks(p)).toEqual([]);
    expect(DP.verdict(p).cls).toBe('dp-ok');
    expect(DP.tocLine(p.pages[1])).toBe('図2 見出し1 — 注記1');
    expect(DP.firstPageFor(p, 'blank')).toBe(null);
  });

  test('見出しを空に戻すと図名で代用され、指摘に戻る。元の proof は書き換えない', function() {
    var p0 = bare();
    var p1 = DP.applyEdit(p0, 'spi_state', 'heading', 'SPI 状態');
    var p2 = DP.applyEdit(p1, 'spi_state', 'heading', '  ');
    expect(p0.pages[1].titled).toBe(false);
    expect(p1.pages[1].heading).toBe('SPI 状態');
    expect(p2.pages[1].heading).toBe('spi_state');
    expect(p2.pages[1].titled).toBe(false);
  });

  test('rowsFor は並び順をセットのまま、書いた見出し・注記で保存行を作る', function() {
    var p = DP.applyEdit(bare(), 'spi_state', 'note', '受信待ちからの復帰');
    var saved = DL.toSaved(DP.rowsFor(BARE, p));
    expect(saved.docs).toEqual(NAMES);
    expect(saved.items).toEqual([{ name: 'spi_state', heading: '', note: '受信待ちからの復帰' }]);
  });
});
