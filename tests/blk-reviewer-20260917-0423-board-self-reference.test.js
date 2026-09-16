'use strict';
// BLK-reviewer-20260917-0423-friction: `--board --save` は markdown() の本文を
// そのまま指摘.md へ上書きしていた。次の run はその指摘.md を「reviewer が手で
// 書いた指摘」として読むので、
//   ・`## 前回の指摘 — 継続（1 件）` という自分の見出しが 1 件の指摘の題名になり、
//     継続の箇条書きに別の見出し文言が本文として並ぶ (自己参照的な入れ子)
//   ・手で書いた指摘と、そこにしか無い継続 tick 数 (13 tick 目) が消える
// ここで守るのは「自分が書いた節を指摘として読み返さない」ことと、
// 「書き戻しが手で書いた指摘を消さない」ことの 2 つ。
const fs = require('fs');
const os = require('os');
const path = require('path');
const rb = require('../src/core/review-board.js');
const cli = require('../tools/audit');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-selfref-')); }
function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}
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

const SEQ = '@startuml\nparticipant Uart_Driver\nUart_Driver -> Uart_Driver : Uart_Init()\n@enduml\n';

// reviewer が手で書いた指摘。継続 tick 数はここにしか無い。
const HAND = [
  '# 指摘',
  '',
  '## 【継続】timer_state.puml の遷移ラベルに戻り値が無い',
  '初出: runs/20260916-0626。継続 13 tick 目。',
  '',
].join('\n');

// 上書きで壊れたあとの指摘.md (印が付く前に保存された物)。
const BROKEN = [
  '# レビュー結果 — C:\\somewhere\\primary',
  '',
  '## 前回の指摘 — 継続（2 件）',
  '- 前回の指摘 — 継続（1 件）（2 tick 目）（SVG 再エクスポート待ち）',
  '  - [timer_class.puml] 出力物/SVG 無 timer_class.puml',
  '',
  '## 前回の指摘 — 同じ図に別の指摘（1 件）',
  '- 前回控えから変わった図（0 枚）',
  '',
  '## 【継続】timer_state.puml の遷移ラベルに戻り値が無い',
  '初出: runs/20260916-0626。継続 13 tick 目。',
  '',
  '## 前回控えから変わった図（0 枚）',
  '- なし',
].join('\n');

describe('reviewBoard.isGeneratedHeading — 自分が書いた見出しを見分ける', function () {
  test('markdown() が出す節の見出しに当たる', function () {
    expect(rb.isGeneratedHeading('前回の指摘 — 継続（2 件）')).toBe(true);
    expect(rb.isGeneratedHeading('前回の指摘 — 同じ図に別の指摘（1 件）')).toBe(true);
    expect(rb.isGeneratedHeading('今回の新規（3 件）')).toBe(true);
    expect(rb.isGeneratedHeading('前回控えから変わった図（0 枚）')).toBe(true);
  });

  test('reviewer が手で書く見出しには当たらない (過去の指摘文書を落とさない)', function () {
    expect(rb.isGeneratedHeading('【継続】timer_state.puml の遷移ラベルに戻り値が無い')).toBe(false);
    expect(rb.isGeneratedHeading('【新規】メソッド粒度')).toBe(false);
    // 件数の括弧が無ければ手書きとして読む。
    expect(rb.isGeneratedHeading('前回の指摘 — 継続')).toBe(false);
  });
});

describe('reviewBoard.parseFindings — 自動生成を指摘として数えない', function () {
  test('壊れた指摘.md からでも、手で書いた指摘だけを tick 数ごと読み直せる', function () {
    const found = rb.parseFindings(BROKEN);
    expect(found.length).toBe(1);
    expect(found[0].title).toContain('timer_state.puml の遷移ラベル');
    // 13 tick 目が消えない (これが「継続 13→リセット」の芯)。
    expect(found[0].tick).toBe(13);
    expect(found[0].status).toBe('carried');
  });

  test('印で囲まれた塊も読み飛ばす', function () {
    const md = HAND + '\n' + rb.GEN_BEGIN + '\n## 前回の指摘 — 継続（9 件）\n- なにか\n'
      + rb.GEN_END + '\n';
    const found = rb.parseFindings(md);
    expect(found.length).toBe(1);
    expect(found[0].tick).toBe(13);
  });

  test('印が閉じていなくても、印から後ろは指摘にしない', function () {
    const md = HAND + '\n' + rb.GEN_BEGIN + '\n## 前回の指摘 — 継続（9 件）\n- 切れた書き込み';
    expect(rb.parseFindings(md).length).toBe(1);
  });
});

describe('reviewBoard.mergeIntoDoc — 手で書いた指摘を消さずに差し替える', function () {
  test('1 回目は手書きの後ろに塊を足す', function () {
    const merged = rb.mergeIntoDoc(HAND, '## 前回の指摘 — 継続（1 件）\n- なにか');
    expect(merged).toContain('継続 13 tick 目');
    expect(merged).toContain(rb.GEN_BEGIN);
    expect(merged).toContain(rb.GEN_END);
  });

  test('繰り返し差し替えても塊は 1 つだけ (入れ子に積み上がらない)', function () {
    let md = HAND;
    for (let i = 0; i < 3; i++) md = rb.mergeIntoDoc(md, '## 今回の新規（' + i + ' 件）\n- 行');
    expect(md.split(rb.GEN_BEGIN).length - 1).toBe(1);
    expect(md).toContain('## 今回の新規（2 件）');
    expect(md).not.toContain('## 今回の新規（0 件）');
    // 手で書いた指摘は 3 回書き戻しても残る。
    expect(rb.parseFindings(md).length).toBe(1);
    expect(rb.parseFindings(md)[0].tick).toBe(13);
  });
});

describe('audit --board --save: 繰り返しても自己参照で壊れない', function () {
  test('2 回書き戻しても、手で書いた指摘と継続 tick 数が残る', function () {
    const dir = tmpdir();
    write(dir, 'uart_init_sequence.puml', SEQ);
    const board = path.join(dir, '指摘.md');
    write(dir, '指摘.md', HAND);

    const r1 = run([dir, '--board', board, '--save-board', '--no-state']);
    expect(r1.code).toBe(0);
    const r2 = run([dir, '--board', board, '--save-board', '--no-state']);
    expect(r2.code).toBe(0);

    const saved = fs.readFileSync(board, 'utf-8');
    // 自動生成の塊は 1 つだけ。
    expect(saved.split(rb.GEN_BEGIN).length - 1).toBe(1);
    // 手で書いた指摘は 2 回の書き戻しを越えて残る。
    const found = rb.parseFindings(saved);
    expect(found.length).toBe(1);
    expect(found[0].tick).toBe(13);
    // 自分の見出しが指摘の題名として画面に出ない (入れ子が消えた)。
    expect(r2.out).not.toContain('- 前回の指摘 — ');
    expect(r2.err).toContain('手で書いた 1 件はそのまま残し');
  });
});
