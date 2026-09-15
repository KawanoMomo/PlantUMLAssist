'use strict';
// BLK-primary-20260916-0100-wish: 資料セットは登録して zip で書き出すところまでは
// GUI で完結するが、実際に提案書やレビュー資料へ貼るときの「どの順で並べるか」
// 「各図にどんな見出し・1 行説明を添えるか」は zip を開いた後に資料側の道具で
// 手作業だった。順序を入れ替えたい・説明を足したいと気付くのが貼り込んだ後なので、
// 毎回そこで手戻りが出る。体裁は図の中身ではなく資料セットの持ち物として持ち、
// 貼る前に 1 枚物 (目次付き) で確かめてから書き出せるようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/doc-set.js', '../src/core/doc-layout.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var DS = global.window.MA.docSet;
var DL = global.window.MA.docLayout;

// 今日の場面: 顧客向け資料に 3 枚を貼る。
var SET = {
  name: '顧客資料',
  docs: ['spi_init_sequence', 'spi_state', 'driver_common_class'],
  items: [
    { name: 'spi_state', heading: 'SPI の状態遷移', note: '受信待ちからの復帰を示す' },
    { name: 'spi_init_sequence', heading: 'SPI 初期化', note: '' },
  ],
};
var FOLDER = ['spi_init_sequence', 'spi_state', 'driver_common_class', 'can_state'];

describe('doc-layout: 貼る前に資料の体裁を組む', function() {

  test('items は docs の並び順で揃い、体裁の無い図も空欄で並ぶ (体裁だけ消えない)', function() {
    var rows = DL.items(SET);
    expect(rows.map(function(r) { return r.name; }))
      .toEqual(['spi_init_sequence', 'spi_state', 'driver_common_class']);
    expect(rows[0].heading).toBe('SPI 初期化');
    expect(rows[1].note).toBe('受信待ちからの復帰を示す');
    expect(rows[2]).toEqual({ name: 'driver_common_class', heading: '', note: '' });
  });

  test('docs に無い item は落とす (消した図の体裁が資料に残らない)', function() {
    var rows = DL.items({ docs: ['a'], items: [{ name: 'b', heading: '消えた図' }] });
    expect(rows.map(function(r) { return r.name; })).toEqual(['a']);
  });

  test('見出しと 1 行説明の改行は畳んで 1 行に保つ (資料の目次が崩れない)', function() {
    var it = DL.normalizeItem({ name: ' a ', heading: '上\n下', note: 'x\r\ny' });
    expect(it).toEqual({ name: 'a', heading: '上 下', note: 'x y' });
  });

  test('move は 1 つ上/下へ動かし、端では動かない', function() {
    var rows = DL.items(SET);
    expect(DL.move(rows, 2, -1).map(function(r) { return r.name; }))
      .toEqual(['spi_init_sequence', 'driver_common_class', 'spi_state']);
    expect(DL.move(rows, 0, -1).map(function(r) { return r.name; }))
      .toEqual(rows.map(function(r) { return r.name; }));
    expect(DL.move(rows, 2, 1).map(function(r) { return r.name; }))
      .toEqual(rows.map(function(r) { return r.name; }));
  });

  test('setField は指定の行だけを書き換え、改行を畳む', function() {
    var rows = DL.setField(DL.items(SET), 2, 'note', '共通ドライバ\nの構造');
    expect(rows[2].note).toBe('共通ドライバ の構造');
    expect(rows[0].heading).toBe('SPI 初期化');
  });

  test('toSaved は今の並びを docs の正本にし、空の体裁は items に残さない', function() {
    var rows = DL.move(DL.items(SET), 2, -2);
    var saved = DL.toSaved(rows);
    expect(saved.docs).toEqual(['driver_common_class', 'spi_init_sequence', 'spi_state']);
    expect(saved.items.map(function(i) { return i.name; }))
      .toEqual(['spi_init_sequence', 'spi_state']);
  });

  test('sheet は貼る順で図番号を 1 から振り直す (資料に貼る番号そのもの)', function() {
    var sh = DL.sheet(SET, FOLDER);
    expect(sh.entries.map(function(e) { return e.no; })).toEqual([1, 2, 3]);
    expect(sh.total).toBe(3);
    expect(sh.present).toBe(3);
  });

  test('見出しが空の図は図の名前で代用する (資料に「無題」を並べない)', function() {
    var sh = DL.sheet(SET, FOLDER);
    expect(sh.entries[2].heading).toBe('driver_common_class');
    expect(sh.entries[2].titled).toBe(false);
    expect(sh.entries[0].titled).toBe(true);
  });

  test('保存フォルダに無い図も目次から落とさず、欠けとして名指しする', function() {
    var sh = DL.sheet(SET, ['spi_state']);
    expect(sh.total).toBe(3);
    expect(sh.missing.map(function(e) { return e.name; }))
      .toEqual(['spi_init_sequence', 'driver_common_class']);
    expect(sh.entries[1].present).toBe(true);
  });

  test('sheetSummary は欠けと、1 行説明が空の図を書き出す前に名指しする', function() {
    var sh = DL.sheet(SET, FOLDER);
    var msg = DL.sheetSummary(sh);
    expect(msg).toContain('全 3 枚');
    expect(msg).toContain('1 行説明が空の図 2 枚');

    var done = DL.sheet({ name: 'x', docs: ['a'], items: [{ name: 'a', heading: 'A', note: 'せつめい' }] }, ['a']);
    expect(DL.sheetSummary(done)).toContain('見出しと 1 行説明は全部そろっています');
    expect(DL.sheetClass(done)).toBe('dl-ready');
    expect(DL.sheetSummary(DL.sheet({ docs: [] }, []))).toBe('図が登録されていません');
  });

  test('sheetClass は欠けを最優先で知らせる', function() {
    expect(DL.sheetClass(DL.sheet(SET, ['spi_state']))).toBe('dl-short');
    expect(DL.sheetClass(DL.sheet(SET, FOLDER))).toBe('dl-blank');
  });

  test('tocLine は目次にそのまま貼れる 1 行を返す', function() {
    var sh = DL.sheet(SET, FOLDER);
    expect(DL.tocLine(sh.entries[1])).toBe('図2 SPI の状態遷移 — 受信待ちからの復帰を示す');
    expect(DL.tocLine(sh.entries[0])).toBe('図1 SPI 初期化');
  });

  test('sheetText は目次と図の見出し・説明・ファイル名を 1 枚に組む', function() {
    var text = DL.sheetText(DL.sheet(SET, ['spi_init_sequence', 'spi_state']));
    expect(text).toContain('# 顧客資料');
    expect(text).toContain('## 目次');
    expect(text).toContain('2. SPI の状態遷移 — 受信待ちからの復帰を示す');
    expect(text).toContain('### 図1 SPI 初期化');
    expect(text).toContain('ファイル: driver_common_class.svg（欠け）');
  });

  test('fileNameOf は図番号を前に付ける (名前順のフォルダでも貼る順に並ぶ)', function() {
    var sh = DL.sheet(SET, FOLDER);
    expect(sh.entries.map(DL.fileNameOf))
      .toEqual(['01_spi_init_sequence', '02_spi_state', '03_driver_common_class']);
  });

  test('doc-set は体裁を素通しし、登録し直しても書いた文が消えない', function() {
    var sets = DS.normalize([SET]);
    expect(sets[0].items.map(function(i) { return i.name; }))
      .toEqual(['spi_state', 'spi_init_sequence']);
    // 図を 1 枚足して登録し直す (体裁は渡さない)。
    var after = DS.upsert(sets, '顧客資料', SET.docs.concat(['can_state']));
    expect(after[0].docs).toContain('can_state');
    expect(after[0].items.map(function(i) { return i.name; }))
      .toEqual(['spi_state', 'spi_init_sequence']);
  });

  test('組から外した図の体裁は登録時に落ちる', function() {
    var after = DS.upsert(DS.normalize([SET]), '顧客資料', ['spi_state']);
    expect(after[0].items.map(function(i) { return i.name; })).toEqual(['spi_state']);
  });
});
