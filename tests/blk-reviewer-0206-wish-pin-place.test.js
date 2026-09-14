'use strict';
// BLK-reviewer-20260915-0206-wish: 指摘を「対象の名前」で図に貼る (src/core/pin-place.js
// と tools/pins.js --add)。ここで固定するのは、(1) 名前から貼り先の行が決まること、
// (2) 宣言があれば宣言行、無ければ最初の出現が選ばれること、(3) 迷ったときも 1 つ選んだ
// うえで候補を返すこと、(4) CLI がファイルに書き、既存の読む口がそれを拾うこと。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA } = require('../tools/audit-runtime');
const pinReport = require('../tools/pin-report');
const cli = require('../tools/pins');

const AT = '2026-09-15T02:06';

const SEQ = [
  '@startuml',
  'title Gpio init',
  'participant Gpio_Driver',
  'participant IRQCtrl',
  'participant DmaCtrl',
  'Gpio_Driver -> IRQCtrl : Gpio_Init',
  'IRQCtrl --> Gpio_Driver : Gpio_Ack',
  '@enduml',
].join('\n');

const STATE = [
  '@startuml',
  'title Gpio state',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Gpio_Ack',
  '@enduml',
].join('\n');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-pinplace-')); }

function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

function capture(argv) {
  const outs = [], errs = [];
  const code = cli.main(argv, { out: (s) => outs.push(String(s)), err: (s) => errs.push(String(s)) });
  return { code, out: outs.join('\n'), err: errs.join('\n') };
}

describe('pin-place.resolve — 名前から貼り先の行を決める', () => {
  test('participant は宣言行に貼る (矢印での参照ではなく)', () => {
    const PP = loadMA().MA.pinPlace;
    const r = PP.resolve(SEQ, 'Gpio_Driver');
    expect(r.ok).toBe(true);
    expect(r.line).toBe(3);
    expect(r.role).toBe('decl');
    expect(r.text).toBe('participant Gpio_Driver');
    // 宣言が 1 本あるので迷わない (参照は何本あっても候補止まり)。
    expect(r.ambiguous).toBe(false);
  });

  test('宣言の無い状態は最初の出現に貼り、残りを候補として返す', () => {
    const PP = loadMA().MA.pinPlace;
    const r = PP.resolve(STATE, 'Idle');
    expect(r.ok).toBe(true);
    expect(r.line).toBe(3);
    expect(r.role).toBe('stateNode');
    // 同じ近さの出現が他にもあることは黙らない。
    expect(r.ambiguous).toBe(true);
    expect(r.candidates.length).toBe(3);
  });

  test('遷移ラベル名でも貼れる (その行の遷移が指摘の相手)', () => {
    const PP = loadMA().MA.pinPlace;
    const r = PP.resolve(STATE, 'Timer_StartConv');
    expect(r.ok).toBe(true);
    expect(r.line).toBe(4);
    expect(r.role).toBe('event');
    expect(r.ambiguous).toBe(false);
  });

  test('--line で候補の中から選び直せる。無い行は断る', () => {
    const PP = loadMA().MA.pinPlace;
    expect(PP.resolve(STATE, 'Idle', { line: 5 }).line).toBe(5);
    const bad = PP.resolve(STATE, 'Idle', { line: 2 });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('no-line');
    expect(bad.candidates.length).toBe(3);
  });

  test('図に無い名前は断る。理由は人が読める文で返す', () => {
    const PP = loadMA().MA.pinPlace;
    const r = PP.resolve(SEQ, 'SpiDrv');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-found');
    expect(PP.reasonText(r.reason, 'SpiDrv')).toContain('SpiDrv');
  });

  test('既にある指摘コメントは貼り先にならない (指摘に指摘を貼らない)', () => {
    const MA = loadMA().MA;
    const pinned = MA.reviewPins.add(STATE, {
      id: '1', line: 4, text: 'Timer_StartConv はシーケンスに実在しない',
      author: 'reviewer', at: AT,
    });
    const r = MA.pinPlace.resolve(pinned, 'Timer_StartConv');
    expect(r.ok).toBe(true);
    expect(r.line).toBe(4);
    expect(r.candidates.length).toBe(1);
  });
});

describe('pin-place.place — 貼った結果が既存の指摘の仕組みに乗る', () => {
  test('貼った指摘は review-pins が未対応として読み返せる', () => {
    const MA = loadMA().MA;
    const res = MA.pinPlace.place(SEQ, {
      name: 'IRQCtrl', text: 'クラス図では IrqCtrl。略語の大文字化が揃っていない',
      author: 'reviewer', at: AT,
    });
    expect(res.ok).toBe(true);
    const pins = MA.reviewPins.list(res.dsl);
    expect(pins.length).toBe(1);
    expect(pins[0].line).toBe(4);
    expect(pins[0].state).toBe('open');
    expect(pins[0].stale).toBe(false);
    expect(pins[0].author).toBe('reviewer');
    expect(pins[0].text).toContain('略語の大文字化');
  });

  test('2 件目は id が続き、1 件目を消さない', () => {
    const MA = loadMA().MA;
    const one = MA.pinPlace.place(SEQ, { name: 'IRQCtrl', text: 'A', at: AT }).dsl;
    const two = MA.pinPlace.place(one, { name: 'DmaCtrl', text: 'B', at: AT });
    expect(two.ok).toBe(true);
    const pins = MA.reviewPins.list(two.dsl);
    expect(pins.length).toBe(2);
    expect(pins.map((p) => p.id).sort().join(',')).toBe('1,2');
  });
});

describe('tools/pins.js --add — ブラウザを開かずに指摘を貼る', () => {
  test('名前だけで貼れて、ファイルに残り、読む口が未着手として拾う', () => {
    const dir = tmpdir();
    const file = write(dir, 'gpio_state.puml', STATE);
    const r = capture([file, '--add', 'Timer_StartConv はシーケンスに実在しない',
      '--on', 'Timer_StartConv', '--at', AT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('gpio_state.puml');
    expect(r.out).toContain('4 行目');

    const saved = fs.readFileSync(file, 'utf-8');
    const MA = loadMA().MA;
    const pins = MA.reviewPins.list(saved);
    expect(pins.length).toBe(1);
    expect(pins[0].line).toBe(4);

    const rep = pinReport.build(MA, [{ name: 'gpio_state.puml', dsl: saved }], {}, { now: AT });
    expect(rep.entries.length).toBe(1);
    expect(rep.entries[0].status).toBe('untouched');
  });

  test('--dry-run は貼り先だけ出してファイルを書き換えない', () => {
    const dir = tmpdir();
    const file = write(dir, 'seq.puml', SEQ);
    const r = capture([file, '--add', 'x', '--on', 'Gpio_Driver', '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--dry-run');
    expect(fs.readFileSync(file, 'utf-8')).toBe(SEQ);
  });

  test('迷う名前では貼ったうえで、選び直す --line を並べる', () => {
    const dir = tmpdir();
    const file = write(dir, 'gpio_state.puml', STATE);
    const r = capture([file, '--add', 'Idle の出口が 1 本足りない', '--on', 'Idle', '--at', AT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--line 4');
    expect(r.out).toContain('--line 5');
  });

  test('図に無い名前は 1 で落ち、書き換えない', () => {
    const dir = tmpdir();
    const file = write(dir, 'seq.puml', SEQ);
    const r = capture([file, '--add', 'x', '--on', 'NoSuchPart']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('NoSuchPart');
    expect(fs.readFileSync(file, 'utf-8')).toBe(SEQ);
  });

  test('--on 無し・図 2 枚は引数不正として断る', () => {
    const dir = tmpdir();
    const a = write(dir, 'a.puml', SEQ);
    const b = write(dir, 'b.puml', STATE);
    expect(capture([a, '--add', 'x']).code).toBe(1);
    expect(capture([a, b, '--add', 'x', '--on', 'Gpio_Driver']).code).toBe(1);
    expect(fs.readFileSync(a, 'utf-8')).toBe(SEQ);
  });

  test('--as で指摘した人を変えられる (既定は reviewer)', () => {
    const dir = tmpdir();
    const file = write(dir, 'seq.puml', SEQ);
    capture([file, '--add', 'y', '--on', 'DmaCtrl', '--as', 'junior', '--at', AT]);
    const MA = loadMA().MA;
    expect(MA.reviewPins.list(fs.readFileSync(file, 'utf-8'))[0].author).toBe('junior');
  });
});
