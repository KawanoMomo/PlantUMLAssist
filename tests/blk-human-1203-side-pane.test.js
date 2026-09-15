'use strict';
// BLK-human-20260915-1203: 「先輩の図」の枠が既定で出ていて × でも隠れず、幅も変えられなかった。
// 既定は閉じ・閉じた状態は覚える・幅は丸めて覚える、を固定する。参照ペインも同じ規則を通す。
const assert = require('assert');
const SD = require('../src/core/side-pane');
const SP = require('../src/core/senior-pane');

function store() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
  };
}

describe('BLK-human-1203 枠の幅', function() {
  test('狭くしすぎても図が読める下限で止まる', function() {
    assert.strictEqual(SD.clampWidth(10, 1200), SD.MIN_WIDTH);
    assert.strictEqual(SD.clampWidth(-500, 1200), SD.MIN_WIDTH);
  });

  test('主プレビューを潰すほど広くはできない', function() {
    assert.strictEqual(SD.clampWidth(1150, 1000), 700);
  });

  test('間の値はそのまま (整数に丸める)', function() {
    assert.strictEqual(SD.clampWidth(360.4, 1200), 360);
  });

  test('親の幅が分からなければ上限を掛けない (下限だけ守る)', function() {
    assert.strictEqual(SD.clampWidth(900, NaN), 900);
  });

  test('数でない幅は既定に落とす (壊れた記憶で枠が消えない)', function() {
    assert.strictEqual(SD.clampWidth('ひろい', 1200), SD.DEFAULT_WIDTH);
  });
});

describe('BLK-human-1203 枠の記憶 (side-pane)', function() {
  test('既定は閉じている', function() {
    assert.strictEqual(SD.normalize(null).open, false);
    assert.strictEqual(SD.load('pua.compare.pane', store()).open, false);
  });

  test('開閉と幅を覚え、読み直しても同じ', function() {
    const st = store();
    SD.save('pua.compare.pane', { open: true, width: 420 }, st);
    assert.deepStrictEqual(SD.load('pua.compare.pane', st), { open: true, width: 420, seen: false });
  });

  test('壊れた記憶は閉じた既定に落とす', function() {
    const st = store();
    st.setItem('pua.compare.pane', '{壊れている');
    assert.deepStrictEqual(SD.load('pua.compare.pane', st),
      { open: false, width: SD.DEFAULT_WIDTH, seen: false });
  });
});

describe('BLK-human-1203 先輩の枠の記憶', function() {
  test('既定は閉じていて、幅の既定を持つ', function() {
    const got = SP.load(store());
    assert.strictEqual(got.open, false);
    assert.strictEqual(got.width, SP.DEFAULT_WIDTH);
    assert.strictEqual(got.seen, false);
  });

  test('閉じた状態・フォルダ・幅を一緒に覚える', function() {
    const st = store();
    SP.save({ open: false, dir: './primary', name: 'gpio_state.puml', width: 500, seen: true }, st);
    assert.deepStrictEqual(SP.load(st),
      { open: false, dir: './primary', name: 'gpio_state.puml', width: 500, seen: true });
  });

  test('幅は先輩の枠でも同じ下限で丸める', function() {
    const st = store();
    SP.save({ open: true, width: 10 }, st);
    assert.strictEqual(SP.load(st).width, SP.MIN_WIDTH);
  });

  test('初めて開いたときだけ「この枠は何か」を 1 行返す', function() {
    const first = SP.firstOpenNote({ open: true, seen: false });
    assert.ok(first.indexOf('読むだけ') >= 0, first);
    assert.ok(first.indexOf('×') >= 0, first);
    assert.strictEqual(SP.firstOpenNote({ open: true, seen: true }), '');
  });
});
