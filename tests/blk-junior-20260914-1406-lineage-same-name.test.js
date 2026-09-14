'use strict';
// BLK-junior-20260914-1406: 部品名の付け方を先輩と揃えているので、先輩の図も自分の図も
// `gpio_init_sequence` という同じ名前になる。継承元の判定が名前だけを見ていたため、
// フォルダを先輩の保存先に変えても候補から消え、継承元にできなかった。
// 図の在り処はフォルダと名前の対であり、「自分自身」は同じフォルダの同じ名前だけ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/lineage.js')]; } catch (e) {}
require('../src/core/lineage.js');
var LG = global.window.MA.lineage;

var MINE = './autosave/junior';
var SENPAI = './autosave/primary';
var P1 = '@startuml\nparticipant Gpio\nGpio -> Hw : Init\n@enduml';
var P2 = '@startuml\nparticipant Gpio_Driver\nGpio_Driver -> Hw : Gpio_Init\n@enduml';

describe('lineage.isSelf — 自分自身の判定', function() {
  test('同じフォルダの同じ名前だけが自分自身', function() {
    expect(LG.isSelf('gpio_init_sequence', 'gpio_init_sequence', MINE, MINE)).toBe(true);
    expect(LG.isSelf('gpio_init_sequence', 'gpio_init_sequence', SENPAI, MINE)).toBe(false);
    expect(LG.isSelf('gpio_init_sequence', 'gpio_state', MINE, MINE)).toBe(false);
  });

  test('フォルダが分からないときは名前が一致すれば自分とみなす', function() {
    // 分からないまま登録すると、自分自身との差分を見続けることになる。
    expect(LG.isSelf('a', 'a', '', MINE)).toBe(true);
    expect(LG.isSelf('a', 'a', undefined, undefined)).toBe(true);
  });

  test('区切り文字と末尾のスラッシュの違いで別フォルダと誤らない', function() {
    expect(LG.samePath('E:\\p\\junior', 'E:/p/junior/')).toBe(true);
    expect(LG.samePath('E:\\p\\junior', 'E:\\p\\primary')).toBe(false);
  });
});

describe('lineage.set — 同名の先輩の図を継承元にする', function() {
  beforeEach(function() { LG.reset(); });

  test('フォルダが違えば同名でも登録できる', function() {
    var rec = LG.set('gpio_init_sequence', 'gpio_init_sequence', P2,
      { dir: SENPAI, selfDir: MINE });
    expect(rec).not.toBe(null);
    expect(rec.dir).toBe(SENPAI);
    var s = LG.status('gpio_init_sequence', P2);
    expect(s.has).toBe(true);
    expect(s.updated).toBe(false);
  });

  test('同じフォルダの自分自身は今までどおり断る', function() {
    expect(LG.set('gpio_init_sequence', 'gpio_init_sequence', P1,
      { dir: MINE, selfDir: MINE })).toBe(null);
    expect(LG.get('gpio_init_sequence')).toBe(null);
  });

  test('登録した先輩の図が変われば、差分の行数が出る', function() {
    LG.set('gpio_init_sequence', 'gpio_init_sequence', P1, { dir: SENPAI, selfDir: MINE });
    var s = LG.status('gpio_init_sequence', P2);
    expect(s.updated).toBe(true);
    expect(s.changed).toBe(4);
  });
});

describe('lineage.parentLabel — 同名の継承元を呼び分ける', function() {
  beforeEach(function() { LG.reset(); });

  test('自分と同名の継承元はフォルダまで言う', function() {
    expect(LG.parentLabel('gpio_init_sequence', 'gpio_init_sequence', SENPAI))
      .toBe('gpio_init_sequence (' + SENPAI + ')');
    // 名前が違えばこれまでどおり名前だけ。
    expect(LG.parentLabel('mine', 'gpio_init_sequence', SENPAI)).toBe('gpio_init_sequence');
  });

  test('状況の 1 行にもフォルダが入る (自分自身を指していると読めない)', function() {
    LG.set('gpio_init_sequence', 'gpio_init_sequence', P1, { dir: SENPAI, selfDir: MINE });
    expect(LG.statusLine('gpio_init_sequence', P2))
      .toContain('継承元 gpio_init_sequence (' + SENPAI + ') が更新されています');
  });
});
