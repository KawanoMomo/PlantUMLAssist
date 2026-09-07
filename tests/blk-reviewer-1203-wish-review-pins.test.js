'use strict';
// BLK-reviewer-20260907-1203-wish: 指摘を図の該当行にピン留めする。

const RP = () => window.MA.reviewPins;

const DSL = [
  '@startuml',
  'title Timer state',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Timer_Ack',
  '@enduml',
].join('\n');

describe('review-pins — 指摘を DSL の行に結び付ける', () => {

  test('指摘を足すと @enduml の直前にコメント行として入る', () => {
    var lines = RP().add(DSL, { line: 4, text: '対応する method が無い', author: 'reviewer' }).split('\n');
    expect(lines[lines.length - 2].indexOf("' @pin ")).toBe(0);
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(lines[3]).toBe('Idle --> Busy : Timer_StartConv');   // 図の行は動かない
  });

  test('指摘はコメントなので描画対象の行を 1 行も増やさない', () => {
    var out = RP().add(DSL, { line: 4, text: 'x' });
    var body = out.split('\n').filter((l) => !RP().isPinLine(l));
    expect(body.join('\n')).toBe(DSL);
  });

  test('付けた指摘は id・未読・作者・本文を保って読み戻せる', () => {
    var out = RP().add(DSL, { line: 4, text: '対応する method が無い', author: 'reviewer', at: '2026-09-07T12:03' });
    var pins = RP().list(out);
    expect(pins.length).toBe(1);
    expect(pins[0].id).toBe('1');
    expect(pins[0].state).toBe('open');
    expect(pins[0].author).toBe('reviewer');
    expect(pins[0].at).toBe('2026-09-07T12:03');
    expect(pins[0].text).toBe('対応する method が無い');
    expect(pins[0].line).toBe(4);
    expect(pins[0].stale).toBe(false);
  });

  test('本文に | や \\ が入っていても壊れない', () => {
    var msg = 'guard [a|b] は \\ を含む';
    expect(RP().list(RP().add(DSL, { line: 4, text: msg }))[0].text).toBe(msg);
  });

  test('上に行が増えても指摘は同じ行に付いて回る (行番号ではなく行の内容で結ぶ)', () => {
    var out = RP().add(DSL, { line: 4, text: 'x' });
    var moved = out.replace('title Timer state', 'title Timer state\nnote "追記" as N1');
    expect(RP().list(moved)[0].line).toBe(5);
    expect(RP().list(moved)[0].stale).toBe(false);
  });

  test('指摘先の行が書き換わったら stale として残り、消えはしない', () => {
    var out = RP().add(DSL, { line: 4, text: 'x' });
    var edited = out.replace('Idle --> Busy : Timer_StartConv', 'Idle --> Busy : Timer_Start');
    var pins = RP().list(edited);
    expect(pins.length).toBe(1);
    expect(pins[0].stale).toBe(true);
    expect(pins[0].line).toBe(0);
    expect(pins[0].anchor).toBe('Idle --> Busy : Timer_StartConv');
  });

  test('既読にすると DSL に残り、未読へ戻せる', () => {
    var read = RP().setState(RP().add(DSL, { line: 4, text: 'x' }), '1', 'read');
    expect(RP().list(read)[0].state).toBe('read');
    expect(RP().list(RP().toggleState(read, '1'))[0].state).toBe('open');
  });

  test('複数の指摘は id が続き番号になり、行の順に並ぶ', () => {
    var out = RP().add(RP().add(DSL, { line: 5, text: 'b' }), { line: 4, text: 'a' });
    var pins = RP().list(out);
    expect(pins.map((p) => p.id)).toEqual(['2', '1']);
    expect(pins.map((p) => p.line)).toEqual([4, 5]);
  });

  test('迷子の指摘は一覧の末尾に回る (直せる指摘が先に並ぶ)', () => {
    var out = RP().add(RP().add(DSL, { line: 4, text: 'a' }), { line: 5, text: 'b' });
    out = out.replace('Idle --> Busy : Timer_StartConv', 'Idle --> Busy : Timer_Start');
    var pins = RP().list(out);
    expect(pins[0].id).toBe('2');
    expect(pins[1].stale).toBe(true);
  });

  test('指摘を消すとその行だけが消える', () => {
    var out = RP().add(RP().add(DSL, { line: 4, text: 'a' }), { line: 5, text: 'b' });
    var removed = RP().remove(out, '1');
    expect(RP().list(removed).length).toBe(1);
    expect(RP().list(removed)[0].id).toBe('2');
    expect(removed).toContain('Busy --> Idle : Timer_Ack');
  });

  test('CRLF で保存された DSL でも改行が壊れない', () => {
    var out = RP().add(DSL.replace(/\n/g, '\r\n'), { line: 4, text: 'a' });
    expect(out).toContain('\r\n');
    expect(out).not.toContain('\n\n');
    expect(RP().list(out)[0].line).toBe(4);
  });

  test('指摘行そのものには指摘を付けない (入れ子を作らない)', () => {
    var out = RP().add(DSL, { line: 4, text: 'a' });
    var pinLine = out.split('\n').findIndex((l) => RP().isPinLine(l)) + 1;
    expect(RP().list(RP().add(out, { line: pinLine, text: 'b' })).length).toBe(1);
  });

  test('byLine は行番号から指摘を引ける (図の上に印を置くため)', () => {
    var out = RP().add(RP().add(DSL, { line: 4, text: 'a' }), { line: 4, text: 'a2' });
    var map = RP().byLine(out);
    expect(map[4].length).toBe(2);
    expect(map[5]).toBe(undefined);
  });

  test('summary は未読・既読・迷子の件数を数える', () => {
    var out = RP().add(RP().add(DSL, { line: 4, text: 'a' }), { line: 5, text: 'b' });
    out = RP().setState(out, '1', 'read');
    expect(RP().summary(RP().list(out))).toEqual({ total: 2, open: 1, read: 1, stale: 0 });
  });

  test('badgeText は未読件数を先に出す', () => {
    expect(RP().badgeText({ total: 3, open: 2, read: 1, stale: 0 })).toBe('📌 指摘 2/3');
    expect(RP().badgeText({ total: 0, open: 0, read: 0, stale: 0 })).toBe('📌 指摘 −');
  });

  test('図の上の印は未読なら番号、既読ならチェックになる', () => {
    expect(RP().markerLabel({ id: '2', state: 'open' })).toBe('2');
    expect(RP().markerLabel({ id: '2', state: 'read' })).toBe('✓');
    expect(RP().markerColor({ state: 'open' })).not.toBe(RP().markerColor({ state: 'read' }));
  });

  test('一覧の 1 行に行番号・未読既読・本文が揃う', () => {
    var row = RP().rowText({ id: '1', line: 4, state: 'open', text: 'method が無い', stale: false });
    expect(row).toContain('L4');
    expect(row).toContain('未読');
    expect(row).toContain('method が無い');
  });

  test('指摘の無い DSL では一覧が空で、元の文字列を壊さない', () => {
    expect(RP().list(DSL)).toEqual([]);
    expect(RP().setState(DSL, '9', 'read')).toBe(DSL);
    expect(RP().remove(DSL, '9')).toBe(DSL);
    expect(RP().add(DSL, { line: 99, text: 'a' })).toBe(DSL);
  });
});
