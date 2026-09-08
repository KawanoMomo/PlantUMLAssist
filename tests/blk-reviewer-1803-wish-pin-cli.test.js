'use strict';
// BLK-reviewer-20260908-1803-wish: 指摘の着手状況を CLI から読む口 (tools/pins.js)。
// ここで固定するのは、(1) 画面と同じ仕分けがブラウザ抜きで出ること、
// (2) 控えがファイルに残り次の run で見送り回数が積まれること、
// (3) 既定は未解消だけで --all で解消も出ること、(4) 引数と終了コードの約束。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA } = require('../tools/audit-runtime');
const pinReport = require('../tools/pin-report');
const cli = require('../tools/pins');

const AT = '2026-09-08T15:03';
const NOW = '2026-09-08T18:03';

const BASE = [
  '@startuml',
  'title Dma state',
  '[*] --> Idle',
  'Idle --> Busy : Dma_Configure',
  'Busy --> Idle : Dma_Ack',
  '@enduml',
].join('\n');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-pins-')); }
function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

// 指摘を 1 件貼った DSL。CLI と同じ経路 (src/core) で作る。
function pinned(MA, dsl, over) {
  return MA.reviewPins.add(dsl || BASE, Object.assign({
    line: 4, text: 'このラベルはシーケンス図のどのメッセージとも対応しない',
    author: 'reviewer', at: AT, id: '1',
  }, over || {}));
}

function capture(argv) {
  const outs = [], errs = [];
  const code = cli.main(argv, { out: (s) => outs.push(String(s)), err: (s) => errs.push(String(s)) });
  return { code, out: outs.join('\n'), err: errs.join('\n') };
}

describe('pin-report.build — ブラウザ抜きの仕分け', () => {
  test('初めて見た指摘は未着手。要約と見出しが付く', () => {
    const MA = loadMA().MA;
    const docs = [{ name: 'dma_state.puml', dsl: pinned(MA) }];
    const r = pinReport.build(MA, docs, {}, { now: NOW });
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].status).toBe('untouched');
    expect(r.entries[0].doc).toBe('dma_state.puml');
    expect(r.entries[0].line).toBe(4);
    expect(r.summary.untouched).toBe(1);
    expect(r.head).toContain('未着手 1');
  });

  test('図が書き換わっていれば着手。控えを渡さないと比べようがない', () => {
    const MA = loadMA().MA;
    const before = [{ name: 'dma_state.puml', dsl: pinned(MA) }];
    const first = pinReport.build(MA, before, {}, { now: NOW });
    const edited = before[0].dsl.replace('Busy --> Idle : Dma_Ack', 'Busy --> Idle : Dma_Done');
    const after = pinReport.build(MA, [{ name: 'dma_state.puml', dsl: edited }], first.memo, { now: NOW });
    expect(after.entries[0].status).toBe('started');
    expect(after.entries[0].passes).toBe(1);
  });

  test('解消は既定で出さない。--all 相当を渡すと出る', () => {
    const MA = loadMA().MA;
    const dsl = MA.reviewPins.setState(pinned(MA), '1', 'done');
    const docs = [{ name: 'dma_state.puml', dsl: dsl }];
    expect(pinReport.build(MA, docs, {}, { now: NOW }).entries.length).toBe(0);
    const all = pinReport.build(MA, docs, {}, { now: NOW, all: true });
    expect(all.entries.length).toBe(1);
    expect(all.entries[0].status).toBe('resolved');
    // 要約は --all を付けなくても全件で数える (反映確認は解消の数で終わる)。
    expect(pinReport.build(MA, docs, {}, { now: NOW }).summary.resolved).toBe(1);
  });

  test('--author 相当でその人が書いた指摘だけに絞れる', () => {
    const MA = loadMA().MA;
    let dsl = pinned(MA);
    dsl = MA.reviewPins.add(dsl, { line: 3, text: '別の人の指摘', author: 'junior', at: AT, id: '2' });
    const docs = [{ name: 'dma_state.puml', dsl: dsl }];
    expect(pinReport.build(MA, docs, {}, { now: NOW }).entries.length).toBe(2);
    const mine = pinReport.build(MA, docs, {}, { now: NOW, author: 'reviewer' });
    expect(mine.entries.length).toBe(1);
    expect(mine.entries[0].author).toBe('reviewer');
  });

  test('要約は札を行頭に置く (grep で状況を絞れる)', () => {
    const MA = loadMA().MA;
    const docs = [{ name: 'dma_state.puml', dsl: pinned(MA) }];
    const text = pinReport.formatSummary(pinReport.build(MA, docs, {}, { now: NOW }), { from: 'x' });
    const rows = text.split('\n').filter((l) => l.indexOf('未着手 ·') === 0);
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain('dma_state.puml L4 #1');
    expect(text).toContain('このラベルはシーケンス図のどのメッセージとも対応しない');
  });
});

describe('tools/pins.js — CLI の約束', () => {
  test('引数なしは使い方を出して 1。--help は 0', () => {
    expect(capture([]).code).toBe(1);
    const h = capture(['--help']);
    expect(h.code).toBe(0);
    expect(h.out).toContain('使い方: node tools/pins.js');
  });

  test('未知のオプションは 1', () => {
    const r = capture(['--nope']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('未知のオプション');
  });

  test('.puml が 1 枚も無ければ 1', () => {
    const d = tmpdir();
    write(d, 'notes.txt', 'x');
    const r = capture([d, '--no-state']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('.puml が 1 枚もありません');
  });

  test('未解消があっても 0 で終わる (CI ゲートではなく観測の口)', () => {
    const MA = loadMA().MA;
    const d = tmpdir();
    write(d, 'dma_state.puml', pinned(MA));
    const r = capture([d, '--no-state']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('未着手 1');
  });

  test('--json は entries と summary を出し、控え (memo) は出さない', () => {
    const MA = loadMA().MA;
    const d = tmpdir();
    write(d, 'dma_state.puml', pinned(MA));
    const r = capture([d, '--json', '--no-state']);
    const v = JSON.parse(r.out);
    expect(v.entries.length).toBe(1);
    expect(v.entries[0].status).toBe('untouched');
    expect(v.summary.untouched).toBe(1);
    expect(v.memo).toBe(undefined);
  });

  test('控えがファイルに残り、次の run で図の書き換えを見送りとして数える', () => {
    const MA = loadMA().MA;
    const d = tmpdir();
    const state = path.join(d, 'state.json');
    const file = write(d, 'dma_state.puml', pinned(MA));

    const first = capture([d, '--json', '--state', state]);
    expect(JSON.parse(first.out).entries[0].status).toBe('untouched');
    expect(fs.existsSync(state)).toBe(true);

    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8')
      .replace('Busy --> Idle : Dma_Ack', 'Busy --> Idle : Dma_Done'), 'utf-8');
    const second = JSON.parse(capture([d, '--json', '--state', state]).out);
    expect(second.entries[0].status).toBe('started');
    expect(second.entries[0].passes).toBe(1);
  });

  test('控えは対象フォルダごとに分けて憶える (別フォルダを見ても消えない)', () => {
    const MA = loadMA().MA;
    const a = tmpdir(), b = tmpdir();
    const state = path.join(a, 'state.json');
    const fa = write(a, 'dma_state.puml', pinned(MA));
    write(b, 'uart_state.puml', pinned(MA));

    capture([a, '--json', '--state', state]);
    capture([b, '--json', '--state', state]);          // 別フォルダを 1 回挟む
    fs.writeFileSync(fa, fs.readFileSync(fa, 'utf-8')
      .replace('Busy --> Idle : Dma_Ack', 'Busy --> Idle : Dma_Done'), 'utf-8');
    const back = JSON.parse(capture([a, '--json', '--state', state]).out);
    expect(back.entries[0].status).toBe('started');
    expect(back.entries[0].passes).toBe(1);
  });

  test('--no-state なら控えを書かない (見送りは積まれない)', () => {
    const MA = loadMA().MA;
    const d = tmpdir();
    const state = path.join(d, 'state.json');
    const file = write(d, 'dma_state.puml', pinned(MA));
    capture([d, '--json', '--state', state, '--no-state']);
    expect(fs.existsSync(state)).toBe(false);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8')
      .replace('Busy --> Idle : Dma_Ack', 'Busy --> Idle : Dma_Done'), 'utf-8');
    const again = JSON.parse(capture([d, '--json', '--state', state, '--no-state']).out);
    expect(again.entries[0].status).toBe('untouched');
  });

  test('壊れた控えでも落とさず「前回なし」として走る', () => {
    const MA = loadMA().MA;
    const d = tmpdir();
    const state = path.join(d, 'state.json');
    fs.writeFileSync(state, '{ broken', 'utf-8');
    write(d, 'dma_state.puml', pinned(MA));
    const r = capture([d, '--json', '--state', state]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).entries[0].status).toBe('untouched');
  });

  test('--out は JSON をファイルに書き、標準出力にはパスだけ', () => {
    const MA = loadMA().MA;
    const d = tmpdir();
    const outFile = path.join(d, 'sub', 'pins.json');
    write(d, 'dma_state.puml', pinned(MA));
    const r = capture([d, '--out', outFile, '--no-state']);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(path.resolve(outFile));
    expect(JSON.parse(fs.readFileSync(outFile, 'utf-8')).entries.length).toBe(1);
  });

  test('parseArgs は --k=v 形も受ける', () => {
    const o = cli.parseArgs(['dir', '--author=reviewer', '--state=s.json', '--out=o.json', '--all']);
    expect(o.targets).toEqual(['dir']);
    expect(o.author).toBe('reviewer');
    expect(o.state).toBe('s.json');
    expect(o.out).toBe('o.json');
    expect(o.all).toBe(true);
  });
});
