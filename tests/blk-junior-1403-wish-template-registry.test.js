'use strict';
// BLK-junior-20260908-1403-wish: 「雛形との差分」は出せるが、雛形そのものを
// 登録して残す口が無く、毎回相手フォルダの絶対パスを打ち直していた。
//
// 見たいこと:
//   - 図を 1 回登録すれば、以降は呼び名で引ける
//   - 同じ呼び名で登録し直すと差し替わる (雛形が 2 つに割れない)
//   - 呼び名は図の名前から下書きでき、保存名の飾り (TYPO / interim) は落ちる
//   - 図の名前から近い登録を出せ、1 語も重ならなければ「無い」と言う
//   - 壊れた保存値を読んでも落ちない
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/template-registry.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const assert = require('assert');
const tr = global.window.MA.templateRegistry;

const UART = [
  '@startuml',
  'start',
  ':UARTクロックを有効化;',
  ':UART_Configureを呼ぶ;',
  'stop',
  '@enduml',
].join('\n');

const CAN = UART.split('UART').join('CAN');

// ── 登録して呼び名で引く ────────────────────────────────────────────────
{
  let list = tr.add([], { label: 'GPIO系初期化アクティビティ', source: 'uart_activity.puml', dsl: UART });
  assert.strictEqual(list.length, 1, '1 件登録できる');
  const hit = tr.byLabel(list, 'GPIO系初期化アクティビティ');
  assert.ok(hit, '呼び名で引ける');
  assert.strictEqual(hit.dsl, UART, '登録した中身がそのまま返る');
  assert.strictEqual(hit.source, 'uart_activity.puml', 'どの図から採ったかを残す');
  assert.ok(tr.get(list, hit.id), 'id でも引ける');
  // 呼び名の前後空白と大小は同じ雛形
  assert.ok(tr.byLabel(list, '  gpio系初期化アクティビティ '), '前後空白と大小は無視する');
}

// ── 同じ呼び名は差し替え。位置は変わらない ─────────────────────────────
{
  let list = tr.add([], { label: 'A', source: 'a.puml', dsl: UART });
  list = tr.add(list, { label: 'B', source: 'b.puml', dsl: CAN });
  assert.deepStrictEqual(list.map(function(e) { return e.label; }), ['B', 'A'], '新しい登録が先頭');
  list = tr.add(list, { label: 'A', source: 'a2.puml', dsl: CAN });
  assert.strictEqual(list.length, 2, '同じ呼び名で 2 件にならない');
  assert.deepStrictEqual(list.map(function(e) { return e.label; }), ['B', 'A'], '差し替えでも並びは動かない');
  assert.strictEqual(tr.byLabel(list, 'A').dsl, CAN, '中身が新しい方に入れ替わる');
}

// ── 中身も呼び名も無い登録は作らない ────────────────────────────────────
{
  assert.strictEqual(tr.add([], { label: 'X', dsl: '   ' }).length, 0, '空の図は雛形にしない');
  assert.strictEqual(tr.add([], { label: '', source: '', dsl: UART }).length, 0, '呼び名を作れなければ登録しない');
  // 呼び名が空でも source があれば下書きされる
  assert.strictEqual(tr.add([], { source: 'uart_activity.puml', dsl: UART })[0].label, 'uart activity',
    '呼び名が空なら図の名前から下書きする');
}

// ── 呼び名の下書き ──────────────────────────────────────────────────────
{
  assert.strictEqual(tr.suggestLabel('uart_activity_TYPO_interim.puml'), 'uart activity',
    '保存名の飾りは呼び名に入れない');
  assert.strictEqual(tr.suggestLabel('can_activity.puml'), 'can activity');
  assert.strictEqual(tr.suggestLabel('gpio_init'), 'gpio init');
  assert.strictEqual(tr.suggestLabel(''), '', '名前が無ければ下書きも空');
  assert.strictEqual(tr.suggestLabel('interim'), 'interim', '飾りしか無いときは元の名前を残す');
}

// ── 削除 ────────────────────────────────────────────────────────────────
{
  let list = tr.add(tr.add([], { label: 'A', dsl: UART }), { label: 'B', dsl: CAN });
  const id = tr.byLabel(list, 'A').id;
  list = tr.remove(list, id);
  assert.strictEqual(list.length, 1, '1 件消える');
  assert.strictEqual(tr.byLabel(list, 'A'), null, '消したものは引けない');
  assert.strictEqual(tr.remove(list, 'no-such').length, 1, '無い id を消しても減らない');
}

// ── 図の名前から近い雛形を出す ──────────────────────────────────────────
{
  let list = tr.add([], { label: 'uart activity', dsl: UART });
  list = tr.add(list, { label: 'can state', dsl: CAN });
  assert.strictEqual(tr.suggestFor(list, 'can_state_TYPO_interim.puml').label, 'can state',
    '名前の語が重なる登録を出す');
  assert.strictEqual(tr.suggestFor(list, 'uart_activity2.puml').label, 'uart activity');
  assert.strictEqual(tr.suggestFor(list, 'spi_sequence.puml'), null,
    '1 語も重ならなければ当てずっぽうを出さない');
  assert.strictEqual(tr.suggestFor(list, ''), null, '名前が無ければ出さない');
}

// ── 保存と読み戻し ──────────────────────────────────────────────────────
{
  const list = tr.add([], { label: 'A', source: 'a.puml', dsl: UART });
  const back = tr.parse(tr.serialize(list));
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].dsl, UART, '読み戻しても中身が変わらない');
  assert.deepStrictEqual(tr.parse('壊れた値'), [], '壊れた保存値は空として読む');
  assert.deepStrictEqual(tr.parse(null), []);
  assert.deepStrictEqual(tr.parse('{"a":1}'), [], '配列でない保存値も空として読む');
  assert.deepStrictEqual(tr.normalize([null, 3, { label: '', dsl: UART }, { label: 'A', dsl: '' }]), [],
    '欠けた要素は読み飛ばす');
  assert.strictEqual(tr.normalize([{ label: 'A', dsl: UART }, { label: 'a', dsl: CAN }]).length, 1,
    '同じ呼び名は 1 件に畳む');
}

// ── 見出し ──────────────────────────────────────────────────────────────
{
  assert.ok(/まだ登録されていません/.test(tr.summary([])), '登録 0 件は次にすることが分かる文');
  assert.ok(/2 件/.test(tr.summary(tr.add(tr.add([], { label: 'A', dsl: UART }), { label: 'B', dsl: CAN }))));
  const e = tr.add([], { label: 'A', source: 'a.puml', dsl: UART, savedAt: '2026-09-08T14:30:00Z' })[0];
  const note = tr.originNote(e);
  assert.ok(note.indexOf('A') >= 0 && note.indexOf('a.puml') >= 0 && note.indexOf('2026-09-08 14:30') >= 0,
    '差分の根拠がどの図のいつの登録かを言う: ' + note);
  assert.strictEqual(tr.originNote(null), '');
}

// ── 上限 ────────────────────────────────────────────────────────────────
{
  let list = [];
  for (let i = 0; i < tr.MAX + 5; i++) list = tr.add(list, { label: 'L' + i, dsl: UART });
  assert.strictEqual(list.length, tr.MAX, '呼び名で選べる件数に収める');
  assert.strictEqual(list[0].label, 'L' + (tr.MAX + 4), '新しい登録が残る');
}

console.log('blk-junior-1403-wish-template-registry: ok');
