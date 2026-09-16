'use strict';
// BLK-reviewer-20260917-0323: 手順2 の `--board` は結果を標準出力に出すだけで、
// 控え (指摘.md) を更新するには reviewer が `> 指摘.md` と手でリダイレクトする
// しかなかった。忘れても何も言われないので、次の run が古い指摘文書のまま突合を
// 進めてしまう。しかも手リダイレクトは開いた瞬間にファイルを空にするので、
// --board が「前回の指摘」として読むものが毎回消えていた。
// --save-board で、読んでから同じ本文を書き戻せるようにする。
const fs = require('fs');
const os = require('os');
const path = require('path');
const cli = require('../tools/audit');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-saveboard-')); }
function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

const SEQ = '@startuml\nparticipant Uart_Driver\nUart_Driver -> Uart_Driver : Uart_Init()\n@enduml\n';

// main は console へ書くので、呼び出しの間だけ受け取る。
function run(args) {
  const out = [];
  const err = [];
  const ol = console.log;
  const oe = console.error;
  console.log = function () { out.push(Array.prototype.join.call(arguments, ' ')); };
  console.error = function () { err.push(Array.prototype.join.call(arguments, ' ')); };
  let code;
  try { code = cli.main(args); } finally { console.log = ol; console.error = oe; }
  return { code: code, out: out.join('\n'), err: err.join('\n') };
}

describe('audit --save-board: --board の画面を指摘文書へ書き戻す', function () {
  test('--save-board を付けると、標準出力と同じ本文が指摘文書に残る', function () {
    const dir = tmpdir();
    write(dir, 'uart_init_sequence.puml', SEQ);
    const board = path.join(dir, '指摘.md');
    write(dir, '指摘.md', '# 指摘\n- 前回の指摘 1 件\n');

    const r = run([dir, '--board', board, '--save-board', '--no-state']);
    expect(r.code).toBe(0);
    expect(r.out.length).toBeGreaterThan(0);

    const saved = fs.readFileSync(board, 'utf-8');
    // 画面に出したものがそのまま控えになる (見た内容と控えが食い違わない)。
    expect(saved.replace(/\n*$/, '')).toBe(r.out.replace(/\n*$/, ''));
    expect(r.err).toContain('指摘文書を更新しました');
    expect(r.err).toContain(board);
  });

  test('書き戻す前に前回の指摘文書を読む (手リダイレクトと違い、突合が空にならない)', function () {
    const dir = tmpdir();
    write(dir, 'uart_init_sequence.puml', SEQ);
    const board = path.join(dir, '指摘.md');
    write(dir, '指摘.md', '# 指摘\n- 目印になる前回の指摘\n');

    const r = run([dir, '--board', board, '--save-board', '--no-state']);
    expect(r.code).toBe(0);
    // 読んだ相手を画面が名指しする。書き戻しはこのあとなので、`> 指摘.md` と
    // 違って「読む前に空になっていた」が起こらない。
    expect(r.out).toContain('前回の指摘文書: ' + board);

    // 2 回目も同じものを読める (書き戻しが読み口を壊していない)。
    const r2 = run([dir, '--board', board, '--save-board', '--no-state']);
    expect(r2.code).toBe(0);
    expect(r2.out).toContain('前回の指摘文書: ' + board);
    expect(fs.readFileSync(board, 'utf-8').length).toBeGreaterThan(0);
  });

  test('--save-board を付けない run は、控えを更新していないことを言う', function () {
    const dir = tmpdir();
    write(dir, 'uart_init_sequence.puml', SEQ);
    const board = path.join(dir, '指摘.md');
    write(dir, '指摘.md', '# 指摘\n');
    const before = fs.readFileSync(board, 'utf-8');

    const r = run([dir, '--board', board, '--no-state']);
    expect(r.code).toBe(0);
    expect(fs.readFileSync(board, 'utf-8')).toBe(before);
    expect(r.err).toContain('控えは更新していません');
    expect(r.err).toContain('--save-board');
  });

  test('まだ指摘文書が無くても、名指しすれば初回から書ける', function () {
    const dir = tmpdir();
    write(dir, 'uart_init_sequence.puml', SEQ);
    const board = path.join(dir, 'sub', '指摘.md');

    const r = run([dir, '--board', '--save-board', board, '--no-state']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(board)).toBe(true);
    expect(fs.readFileSync(board, 'utf-8').length).toBeGreaterThan(0);
  });

  test('--save は --save-board の別名', function () {
    const o = cli.parseArgs(['x', '--board', '--save']);
    expect(o.saveBoard).toBe(true);
    const o2 = cli.parseArgs(['x', '--board', '--save-board=指摘.md']);
    expect(o2.saveBoard).toBe(true);
    expect(o2.saveBoardFile).toBe('指摘.md');
  });

  test('--board 無しの --save-board は、書くものが無いと言って止まる', function () {
    const dir = tmpdir();
    write(dir, 'uart_init_sequence.puml', SEQ);
    const r = run([dir, '--summary', '--save-board', '--no-state']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--save-board は --board と一緒に使います');
  });

  test('--help に --save-board が載っている (見つけられなければ無いのと同じ)', function () {
    expect(cli.USAGE).toContain('--save-board');
    expect(cli.USAGE).toContain('--save');
  });
});
