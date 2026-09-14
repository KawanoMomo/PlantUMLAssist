'use strict';
// BLK-primary-20260913-0306-wish: 顧客の前で「直す前はこう → 直したらこう」を
// 1 画面で切り替えて見せる。変更サマリボードの SVG 表示が、何を描き・どちらを
// 見せ・何と書くかを守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/show-before-after.js')]; } catch (e) {}
require('../src/core/show-before-after.js');

var SBA = global.window.MA.showBeforeAfter;

var OLD = '@startuml\nparticipant SpiDrv\n@enduml';
var NEW = '@startuml\nparticipant Spi_Driver\n@enduml';

function entry(over) {
  var e = { name: 'spi_init_sequence', status: 'changed', before: OLD, after: NEW,
            markedAt: '2026-09-13T02:11:07.500Z' };
  for (var k in (over || {})) e[k] = over[k];
  return e;
}

describe('show-before-after 切替', function() {
  test('1 ボタンで 並べる → 変更前だけ → 変更後だけ → 並べる と回る', function() {
    expect(SBA.nextSide(SBA.BOTH)).toBe(SBA.BEFORE);
    expect(SBA.nextSide(SBA.BEFORE)).toBe(SBA.AFTER);
    expect(SBA.nextSide(SBA.AFTER)).toBe(SBA.BOTH);
  });

  test('知らない値からでも回り始められる', function() {
    expect(SBA.nextSide('')).toBe(SBA.BEFORE);
    expect(SBA.nextSide(undefined)).toBe(SBA.BEFORE);
  });

  test('押す先の文言が今の状態を言う', function() {
    expect(SBA.sideLabel(SBA.BOTH)).toBe('並べる');
    expect(SBA.sideLabel(SBA.BEFORE)).toBe('変更前だけ');
    expect(SBA.sideLabel(SBA.AFTER)).toBe('変更後だけ');
  });

  test('並べるときは 2 枚とも、片側のときはその側だけ見せる', function() {
    expect(SBA.shows(SBA.BOTH, SBA.BEFORE)).toBe(true);
    expect(SBA.shows(SBA.BOTH, SBA.AFTER)).toBe(true);
    expect(SBA.shows(SBA.BEFORE, SBA.AFTER)).toBe(false);
    expect(SBA.shows(SBA.AFTER, SBA.AFTER)).toBe(true);
    // 側が決まっていないうちは並べる (顧客の前で空の画面を出さない)
    expect(SBA.shows('', SBA.BEFORE)).toBe(true);
  });
});

describe('show-before-after 見出し', function() {
  test('変更前はいつの版かを言う', function() {
    expect(SBA.paneLabel(entry(), SBA.BEFORE)).toBe('変更前 (2026-09-13 02:11)');
    expect(SBA.paneLabel(entry(), SBA.AFTER)).toBe('変更後 (今)');
  });

  test('基準の無い図は「基準なし」、新規は新規と言う', function() {
    expect(SBA.paneLabel(entry({ markedAt: '' }), SBA.BEFORE)).toBe('変更前 (基準なし)');
    expect(SBA.paneLabel(entry({ status: 'new', before: '' }), SBA.BEFORE))
      .toBe('変更前 (この図は新規です)');
  });
});

describe('show-before-after 描く対象', function() {
  test('1 枚の図から変更前・変更後の 2 面が出る', function() {
    var p = SBA.panes(entry());
    expect(p.map(function(x) { return x.side; })).toEqual([SBA.BEFORE, SBA.AFTER]);
    expect(p[0].dsl).toBe(OLD);
    expect(p[1].dsl).toBe(NEW);
    expect(p[0].empty).toBe(false);
  });

  test('新規の図の変更前は空と分かり、文言を持つ', function() {
    var p = SBA.panes(entry({ status: 'new', before: '' }));
    expect(p[0].empty).toBe(true);
    expect(p[0].emptyText).toContain('新規');
    expect(p[1].empty).toBe(false);
  });

  test('空の側は描画に回さない (エラー画像を顧客に見せない)', function() {
    var plan = SBA.renderPlan({ entries: [entry({ status: 'new', before: '' })] });
    expect(plan.length).toBe(1);
    expect(plan[0].side).toBe(SBA.AFTER);
  });

  test('中身の同じ側は 1 回しか描かない', function() {
    var plan = SBA.renderPlan({ entries: [entry(), entry()] });
    expect(plan.length).toBe(2);
  });

  test('別の図なら同じ DSL でも別に描く (画面の位置が違う)', function() {
    var plan = SBA.renderPlan({ entries: [entry(), entry({ name: 'spi_state' })] });
    expect(plan.length).toBe(4);
    expect(plan[0].name).toBe('spi_init_sequence');
    expect(plan[2].name).toBe('spi_state');
  });

  test('鍵は図・側・中身で決まる', function() {
    expect(SBA.cacheKey('a', 'before', OLD)).toBe(SBA.cacheKey('a', 'before', OLD));
    expect(SBA.cacheKey('a', 'before', OLD)).not.toBe(SBA.cacheKey('a', 'after', OLD));
    expect(SBA.cacheKey('a', 'before', OLD)).not.toBe(SBA.cacheKey('b', 'before', OLD));
  });

  test('board が無くても落ちない', function() {
    expect(SBA.renderPlan(null)).toEqual([]);
    expect(SBA.renderPlan({ entries: [{}] })).toEqual([]);
  });
});

describe('show-before-after 頭の 1 行', function() {
  test('DSL のままなら何も言わない', function() {
    expect(SBA.statusText(SBA.DSL, { entries: [entry()] })).toBe('');
  });

  test('描き終わるまでは進み具合、終われば枚数を言う', function() {
    var board = { entries: [entry(), entry({ name: 'spi_state' })] };
    expect(SBA.statusText(SBA.SVG, board, 1)).toBe('図を描いています 1/4 枚');
    expect(SBA.statusText(SBA.SVG, board, 4)).toContain('2 枚を変更前後で見せられます');
    expect(SBA.statusText(SBA.SVG, board, 4)).toContain('DSL は出ません');
  });

  test('見せる図が無いときはそう言う', function() {
    expect(SBA.statusText(SBA.SVG, { entries: [] })).toBe('見せる図がありません');
  });
});
