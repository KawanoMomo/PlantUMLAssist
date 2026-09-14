'use strict';
// BLK-junior-20260914-1406-wish: 先輩の図を読み専用の 2 枠目として据え置く。
// 「いま開いている図に当たる先輩の図はどれか」を、フォルダを跨いだ同名でも
// 自分自身と取り違えずに選べること。継承元がファイル名だけで同名判定して
// 使えなかったのがこの BLK の詰まりなので、その判定をここで固定する。
const assert = require('assert');
const SP = require('../src/core/senior-pane');

const SENIOR = './primary';
const MINE = './junior';
const NAMES = [
  'gpio_init_sequence.puml',
  'gpio_state.puml',
  'driver_common_class.puml',
  'spi_init_sequence.puml',
  'can_state.puml',
];

function pick(mineName, names, seniorDir) {
  return SP.pickCounterpart(
    { name: mineName, dir: MINE }, names === undefined ? NAMES : names,
    seniorDir === undefined ? SENIOR : seniorDir);
}

describe('先輩の図の相手選び', function() {
  test('同じファイル名が先輩のフォルダにあれば、それを相手にする', function() {
    const p = pick('gpio_init_sequence.puml');
    assert.strictEqual(p.name, 'gpio_init_sequence.puml');
    assert.strictEqual(p.how, 'same-name');
  });

  test('フォルダが違えば同名でも「自分自身」とみなさない (継承元が使えなかった所)', function() {
    assert.strictEqual(SP.isSelf(
      { name: 'gpio_state.puml', dir: './junior' },
      { name: 'gpio_state.puml', dir: './primary' }), false);
    assert.strictEqual(SP.isSelf(
      { name: 'gpio_state.puml', dir: './junior' },
      { name: 'gpio_state.puml', dir: './junior/' }), true);
  });

  test('同じフォルダを先輩として選んでしまったら、自分自身は相手にしない', function() {
    const p = pick('gpio_state.puml', NAMES, MINE);
    assert.notStrictEqual(p.name, 'gpio_state.puml');
  });

  test('名前の付け方が違っても、同じドメインの同じ図種なら対にする', function() {
    const p = pick('gpio_seq.puml', ['gpio_init_sequence.puml', 'gpio_state.puml']);
    assert.strictEqual(p.name, 'gpio_init_sequence.puml');
    assert.strictEqual(p.how, 'same-kind');
  });

  test('同じドメインに図種が決まらない図しか無ければ、候補として並べる', function() {
    const p = pick('gpio_class.puml', ['gpio_notes.puml', 'gpio_memo.puml']);
    assert.strictEqual(p.name, '');
    assert.strictEqual(p.how, 'domain');
    assert.deepStrictEqual(p.candidates, ['gpio_notes.puml', 'gpio_memo.puml']);
  });

  test('当たる図が無ければ、先頭の 1 枚を黙って出さずに無いと言う', function() {
    const p = pick('adc_state.puml');
    assert.strictEqual(p.name, '');
    assert.strictEqual(p.how, 'none');
    assert.ok(p.reason.indexOf('adc_state') >= 0, p.reason);
  });

  test('先輩のフォルダが空なら、そう言う', function() {
    const p = pick('gpio_state.puml', []);
    assert.strictEqual(p.how, 'none');
    assert.ok(p.reason.indexOf('図がありません') >= 0, p.reason);
  });

  test('枠の上の 1 行は、誰のどの図がなぜ横にあるかを言う', function() {
    assert.ok(SP.noticeText(pick('gpio_init_sequence.puml'), 'primary')
      .indexOf('primary の gpio_init_sequence') >= 0);
    assert.ok(SP.noticeText(pick('gpio_init_sequence.puml'), 'primary').indexOf('読むだけ') >= 0);
    assert.ok(SP.noticeText(pick('gpio_class.puml', ['gpio_notes.puml', 'gpio_memo.puml']), 'primary')
      .indexOf('2 枚の候補') >= 0);
  });
});

describe('ドメインと図種の読み取り', function() {
  test('ドメインはファイル名の先頭の語', function() {
    assert.strictEqual(SP.domainOf('primary/gpio_init_sequence.puml'), 'gpio');
    assert.strictEqual(SP.domainOf('Spi_State.PUML'), 'spi');
  });

  test('図種は名前に出てくる語から取る', function() {
    assert.strictEqual(SP.kindOf('gpio_init_sequence.puml'), 'sequence');
    assert.strictEqual(SP.kindOf('driver_common_class.puml'), 'class');
    assert.strictEqual(SP.kindOf('gpio_memo.puml'), '');
  });
});

describe('据え置きの記憶', function() {
  function store() {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  }

  test('開いたままと選んだフォルダを覚え、次に開いたときも同じ組で出す', function() {
    const st = store();
    SP.save({ open: true, dir: './primary', name: 'gpio_state.puml' }, st);
    const got = SP.load(st);
    assert.deepStrictEqual(got, { open: true, dir: './primary', name: 'gpio_state.puml' });
  });

  test('壊れた記憶でも画面は開ける (閉じた状態に落とす)', function() {
    const st = store();
    st.setItem(SP.STORE_KEY, '{壊れている');
    assert.deepStrictEqual(SP.load(st), { open: false, dir: '', name: '' });
  });
});
