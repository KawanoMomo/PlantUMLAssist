'use strict';
// BLK-junior-20260907-2203-wish: 図をまたいだ指摘の受信箱。

const PI = () => window.MA.pinInbox;
const RP = () => window.MA.reviewPins;

function doc(lines) {
  return ['@startuml'].concat(lines).concat(['@enduml']).join('\n');
}

// adc: reviewer の未読 1 + primary の既読 1、spi: primary の未読 2、
// uart: 自分 (junior) の未読 1 だけ。
function docs() {
  var adc = doc(['[*] --> Idle', 'Idle --> Busy : Adc_Start']);
  adc = RP().add(adc, { line: 3, text: 'method が無い', author: 'reviewer', at: '2026-09-07T12:03' });
  adc = RP().add(adc, { line: 2, text: '初期状態の名前', author: 'primary' });
  adc = RP().setState(adc, '2', 'read');

  var spi = doc(['[*] --> Ready', 'Ready --> Send : Spi_Tx', 'Send --> Ready : Spi_Ack']);
  spi = RP().add(spi, { line: 3, text: 'Fault 遷移が無い', author: 'primary' });
  spi = RP().add(spi, { line: 4, text: 'Ack の綴り', author: 'primary' });

  var uart = doc(['[*] --> Off', 'Off --> On : Uart_Open']);
  uart = RP().add(uart, { line: 3, text: '自分のメモ', author: 'junior' });

  return [
    { name: 'adc_state', dsl: adc },
    { name: 'spi_state', dsl: spi },
    { name: 'uart_state', dsl: uart },
  ];
}

describe('pin-inbox — 図をまたいで未対応の指摘を集める', () => {

  test('複数の図の指摘を 1 つの並びに集め、どの図のものかを持たせる', () => {
    var items = PI().collect(docs());
    expect(items.length).toBe(5);
    var names = {};
    items.forEach((p) => { names[p.doc] = (names[p.doc] || 0) + 1; });
    expect(names).toEqual({ adc_state: 2, spi_state: 2, uart_state: 1 });
    expect(items.every((p) => typeof p.line === 'number')).toBe(true);
  });

  test('読めなかった図があっても残りの図の指摘は出る', () => {
    var list = docs();
    list[0] = { name: 'adc_state', dsl: null };
    expect(PI().collect(list).length).toBe(3);
  });

  test('既読と自分が書いた指摘を落とすと、見ていない他人の指摘だけが残る', () => {
    var items = PI().filter(PI().collect(docs()), { unreadOnly: true, excludeAuthor: 'junior' });
    expect(items.length).toBe(3);
    expect(items.every((p) => p.state === 'open')).toBe(true);
    expect(items.every((p) => p.author !== 'junior')).toBe(true);
  });

  test('作者の絞り込みは大小を問わない', () => {
    var items = PI().filter(PI().collect(docs()), { excludeAuthor: ' Junior ' });
    expect(items.every((p) => p.author !== 'junior')).toBe(true);
  });

  test('図ごとにまとまり、未対応の多い図が先に来る', () => {
    var groups = PI().groupByDoc(PI().filter(PI().collect(docs()), { unreadOnly: true, excludeAuthor: 'junior' }));
    expect(groups.map((g) => g.doc)).toEqual(['spi_state', 'adc_state']);
    expect(groups[0].open).toBe(2);
    expect(groups[1].open).toBe(1);
  });

  test('同じ図の中は行の順、行が見つからない指摘は最後', () => {
    var d = doc(['[*] --> Idle', 'Idle --> Busy : Adc_Start']);
    d = RP().add(d, { line: 3, text: 'b', author: 'reviewer' });
    d = RP().add(d, { line: 2, text: 'a', author: 'reviewer' });
    d = d.replace('Idle --> Busy : Adc_Start', 'Idle --> Busy : Adc_Begin');
    var g = PI().groupByDoc(PI().collect([{ name: 'x', dsl: d }]))[0];
    expect(g.items.map((p) => p.text)).toEqual(['a', 'b']);
    expect(g.items[1].stale).toBe(true);
    expect(g.stale).toBe(1);
  });

  test('要約は未対応の件数と、未対応が残っている図の枚数を数える', () => {
    var sum = PI().summary(PI().filter(PI().collect(docs()), { excludeAuthor: 'junior' }));
    expect(sum.total).toBe(4);
    expect(sum.open).toBe(3);
    expect(sum.read).toBe(1);
    expect(sum.docs).toBe(2);
    expect(sum.openDocs).toBe(2);
    expect(PI().headText(sum)).toBe('未対応 3 件 / 全 4 件 ・ 2 図');
    expect(PI().badgeText(sum)).toBe('📥 指摘箱 3/4');
  });

  test('指摘が 1 件も無ければ、見出しもバッジもそう言う', () => {
    var sum = PI().summary([]);
    expect(PI().headText(sum)).toBe('未対応の指摘はありません');
    expect(PI().badgeText(sum)).toBe('📥 指摘箱 −');
  });

  test('行には図名・行番号・作者・本文が入る', () => {
    var items = PI().collect(docs()).filter((p) => p.doc === 'spi_state');
    var t = PI().rowText(items[0]);
    expect(t.indexOf('spi_state')).toBeGreaterThan(-1);
    expect(t.indexOf('L3')).toBeGreaterThan(-1);
    expect(t.indexOf('primary')).toBeGreaterThan(-1);
    expect(t.indexOf('Fault 遷移が無い')).toBeGreaterThan(-1);
  });

  test('図の見出しは未対応と全件を出す', () => {
    var g = PI().groupByDoc(PI().collect(docs())).filter((x) => x.doc === 'adc_state')[0];
    expect(PI().groupText(g)).toBe('adc_state — 未対応 1 / 2 件');
  });
});
