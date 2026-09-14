'use strict';
// BLK-primary-20260914-1006-wish: 指摘.md の 1 件を読んで「⇄一括置換 か、再出力か、
// 別ドメイン宣言か」を人が毎回決めていた。手段は指摘文に書いてあるので、書いてある
// ものだけを読み取る。書いていない指摘は manual にして当てない (勝手に近い操作を
// 当てると、指摘と違うことをした図が黙って増える)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/finding-actions.js')]; } catch (e) {}
require('../src/core/finding-actions.js');
var FA = global.window.MA.findingActions;

function doc(name, folders) {
  return { name: name, folders: folders, docs: folders.map(function(f) {
    return { name: f + '/' + name, _dir: './' + f, _file: name };
  }), shared: folders.length >= 2 };
}

function row(id, title, body, docs) {
  return { id: id, index: 1, title: title, heading: title, marks: [], body: body,
           text: title + '\n' + body, docs: docs || [], pairs: [] };
}

describe('findingActions.planFor — 手段の読み取り', () => {
  test('svg が入れ替わっている指摘は、対象図の再出力になる', () => {
    var r = row('note-1', '【最優先】driver_common_class.svg ⇄ plantuml-class.svg のクロスは未解消',
      '→ 2枚の svg の中身が入れ替わったまま。再エクスポートが必要。',
      [doc('driver_common_class', ['primary']), doc('plantuml-class', ['primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('reexport');
    expect(p.ready).toBe(true);
    expect(p.docs).toEqual(['driver_common_class', 'plantuml-class']);
    expect(p.text).toContain('再出力');
    expect(p.text).toContain('driver_common_class');
  });

  test('「再出力」と書いていなくても、中身の食い違いを言っていれば再出力', () => {
    var r = row('note-2', '【継続】gpio_state.svg が実データと食い違ったまま',
      'render 結果と保存済みが非ヘッダ部で不一致。', [doc('gpio_state', ['primary'])]);
    expect(FA.planFor(r, { mineFolder: 'primary' }).kind).toBe('reexport');
  });

  test('接頭辞の有無で書かれた指摘は、接頭辞のある側へ揃える置換になる', () => {
    var r = row('note-3', '【継続】timer 系統の接頭辞不一致',
      'junior `Timer_Start` 等(接頭辞あり) vs primary `Start` 等(接頭辞なし)。', []);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('rename');
    expect(p.from).toBe('Start');
    expect(p.to).toBe('Timer_Start');
    // 図名が書かれていないので、保存フォルダから当たる図を探す。
    expect(p.scope).toBe('folder');
    expect(p.ready).toBe(true);
  });

  test('「A を B に統一」と書かれていれば、その綴りをそのまま使う', () => {
    var r = row('note-4', '命名', 'spi_init_sequence の `SpiDrv` を `Spi_Driver` に統一すること。',
      [doc('spi_init_sequence', ['primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('rename');
    expect(p.from).toBe('SpiDrv');
    expect(p.to).toBe('Spi_Driver');
    expect(p.scope).toBe('docs');
  });

  test('すり合わせ / 別ドメインの指摘は、印を書く提案になる', () => {
    var r = row('note-5', '【新規】gpio_init_sequence で junior/primary 不一致',
      'すり合わせるか、state 図と同様に「別ドメイン」を明示する。',
      [doc('gpio_init_sequence', ['junior', 'primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('verdict');
    expect(p.otherFolder).toBe('junior');
    expect(p.ready).toBe(true);
    expect(p.text).toContain('junior とは別のドメイン');
  });

  test('手段が書かれていない指摘は当てない (manual)', () => {
    var r = row('note-6', '【継続】インフラ系クラスがクラス図に不在',
      '`ClockCtrl` / `*Regs` / `NVIC` が 1つも定義されていない。',
      [doc('driver_common_class', ['primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('manual');
    expect(p.ready).toBe(false);
    expect(p.reason).toContain('当てる操作が書かれていません');
  });

  test('自分のフォルダに無い図しか挙がっていなければ当てない', () => {
    var r = row('note-7', '再出力', '再エクスポートが必要。', [doc('gpio_state', ['junior'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('reexport');
    expect(p.ready).toBe(false);
    expect(p.docs).toEqual([]);
  });
});

// BLK-primary-20260914-1006-friction: 実物の指摘.md で測ったら 2 つ外していた。
describe('findingActions — 実物の指摘.md で外していたところ', () => {
  test('短い名前の図は、本文の別の語に含まれるだけでは対象にしない', () => {
    // 本文に出るのは Can_Driver / spi_dma_sequence で、`can` / `spi` の図の話ではない。
    var r = row('note-8', '【最優先】driver_common_class.svg のクロス',
      '保存済み svg のラベルは Can_Driver / spi_dma_sequence の内容そのもの。再エクスポートが必要。',
      [doc('driver_common_class', ['primary']), doc('can', ['primary']), doc('spi', ['primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('reexport');
    expect(p.docs).toEqual(['driver_common_class']);
  });

  test('text を持たない行 (reviewNote.rows の形) でも、title + body で絞り込む', () => {
    var r = row('note-8b', '【最優先】driver_common_class.svg のクロス',
      '保存済み svg のラベルは Can_Driver の内容そのもの。再エクスポートが必要。',
      [doc('driver_common_class', ['primary']), doc('can', ['primary'])]);
    delete r.text;
    expect(FA.planFor(r, { mineFolder: 'primary' }).docs).toEqual(['driver_common_class']);
  });

  test('名指しされていれば短い名前でも対象にする', () => {
    var r = row('note-9', '再出力', '`can.svg` を出し直してください。', [doc('can', ['primary'])]);
    expect(FA.planFor(r, { mineFolder: 'primary' }).docs).toEqual(['can']);
  });

  test('再出力を頼まれた件は、本文が印の話に触れていても再出力のまま', () => {
    var r = row('note-10', '【継続】gpio_state.svg が実データと食い違ったまま',
      'render 結果と保存済みが非ヘッダ部で不一致。`domain-verdict` タイトルが未反映。再出力が必要。',
      [doc('gpio_state', ['junior', 'primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('reexport');
    expect(p.ready).toBe(true);
  });

  test('svg の話でない「不一致」は再出力にしない (部品名のすり合わせ依頼)', () => {
    var r = row('note-12', '【新規】gpio_init_sequence で junior/primary 不一致',
      'sequence 図側で新たな部品名不一致を検出。gpio 全体としては sequence 図側は未宣言・未解消。',
      [doc('gpio_init_sequence', ['junior', 'primary'])]);
    var p = FA.planFor(r, { mineFolder: 'primary' });
    expect(p.kind).toBe('verdict');
    expect(p.otherFolder).toBe('junior');
  });

  test('「別ドメインを明示」と書かれていれば、今までどおり印を書く提案になる', () => {
    var r = row('note-11', 'gpio の不一致', '「別ドメイン」を明示する。',
      [doc('gpio_init_sequence', ['junior', 'primary'])]);
    expect(FA.planFor(r, { mineFolder: 'primary' }).kind).toBe('verdict');
  });
});

describe('findingActions — 一覧の見出しと結果の 1 行', () => {
  var rows = [
    row('a', '再出力', 'x.svg の再エクスポートが必要。', [doc('x', ['primary'])]),
    row('b', '命名', 'y の `SpiDrv` を `Spi_Driver` に統一。', [doc('y', ['primary'])]),
    row('c', '不在', 'z のクラスが足りない。', [doc('z', ['primary'])]),
  ];

  test('見出しは、適用だけで済む件数と内訳を先に言う', () => {
    var s = FA.summaryText(FA.plans(rows, { mineFolder: 'primary' }));
    expect(s).toContain('指摘 3 件');
    expect(s).toContain('2 件は [適用]');
    expect(s).toContain('再出力 1 件');
    expect(s).toContain('ラベル統一 1 件');
  });

  test('指摘.md が無いときは、その旨だけを言う', () => {
    expect(FA.summaryText([])).toBe('指摘.md がありません');
  });

  test('当てたあとの 1 行は、何件の図に何が起きたかを言う', () => {
    var plans = FA.plans(rows, { mineFolder: 'primary' });
    expect(FA.resultText(plans[0], { ok: true, done: ['x'] })).toBe('x の SVG を出し直しました');
    expect(FA.resultText(plans[1], { ok: true, done: ['y'], hits: 3 }))
      .toBe('SpiDrv → Spi_Driver を 3 箇所、y に保存しました');
    expect(FA.resultText(plans[0], { ok: false, message: '読めません' })).toContain('読めません');
  });

  test('id で提案を引ける (画面は行ごとに 1 つだけ持つ)', () => {
    var plans = FA.plans(rows, { mineFolder: 'primary' });
    expect(FA.planOf(plans, 'b').kind).toBe('rename');
    expect(FA.planOf(plans, 'zz')).toBe(null);
  });
});
