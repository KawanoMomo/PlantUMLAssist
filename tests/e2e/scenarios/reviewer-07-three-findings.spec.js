// @ts-check
// reviewer 台本 手順7: 指摘 3 件を primary に返す形式(図名・行・内容)でまとめる。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

function collectFindings() {
  const out = [];
  // 1. 部品名の不一致
  Object.entries(R.DOCS).forEach(([doc, dsl]) => {
    dsl.split('\n').forEach((line, i) => {
      if (/\bGpioDrv\b/.test(line) && /^participant/.test(line)) {
        out.push({ doc, line: i + 1, content: 'GpioDrv は他図の Gpio_Driver と揃っていない' });
      }
    });
  });
  // 2. 未使用 participant
  const seq = R.DOCS.gpio_init_sequence;
  const used = new Set(R.arrowEnds(seq));
  R.participants(seq).forEach((p) => {
    if (!used.has(p)) {
      const line = seq.split('\n').findIndex((l) => l.trim() === 'participant ' + p) + 1;
      out.push({ doc: 'gpio_init_sequence', line, content: p + ' は宣言だけで使われていない' });
    }
  });
  // 3. 架空の遷移ラベル
  const msgs = new Set(R.messages(seq));
  R.DOCS.gpio_state.split('\n').forEach((line, i) => {
    const m = /-->\s+\S+\s*:\s*(.+)$/.exec(line);
    if (m && !msgs.has(m[1].trim())) {
      out.push({ doc: 'gpio_state', line: i + 1, content: m[1].trim() + ' はシーケンスに実在しない' });
    }
  });
  return out;
}

test('手順7 指摘 3 件が図名・行・内容の揃った形でまとまる', () => {
  const findings = collectFindings();
  // 到達条件: 3 件そろい、どれも 3 要素を持つ。
  expect(findings.length).toBe(3);
  for (const f of findings) {
    expect(typeof f.doc).toBe('string');
    expect(f.line).toBeGreaterThan(0);
    expect(f.content.length).toBeGreaterThan(0);
  }
  expect(findings.map((f) => f.doc)).toEqual(['gpio_init_sequence', 'gpio_init_sequence', 'gpio_state']);
});

// BLK-reviewer-20260915-0206-wish: まとめの「行」は reviewer が数えて書き、primary が
// puml を開いて探し直していた。指摘を図そのものに貼れば、書く側は対象の名前だけを言えばよく、
// 読む側は図を開いた時点で該当の箱に印が刺さっている。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA } = require('../../load-ma');

// BLK-reviewer-20260914-1806-wish: 依頼のまとめには「前回の依頼が下書きとして
// 着手済みで、本体への差し替えを待っている」が毎回混ざる。これまでは `-編集中` を
// ls して目で拾い、本体と diff を取って初めてそう言えた。
const SQ = require('../../../src/core/swap-queue.js');

test('手順7 下書きの反映待ちを、ファイル名の推測なしに言い切れる', () => {
  const entries = [
    { name: 'plantuml-usecase', mtime: '2026-09-14T10:00:00', hash: 'a' },
    { name: 'plantuml-usecase-編集中', mtime: '2026-09-14T12:00:00', hash: 'b' },
    { name: 'diagram1', mtime: '2026-09-14T10:00:00', hash: 'c' },
    { name: 'diagram1-編集中', mtime: '2026-09-14T09:00:00', hash: 'c' },
  ];
  const q = SQ.build(entries, {});
  const lines = SQ.report(q);
  // 到達条件: まとめの各行が「どの下書きが・どの本体へ・どういう状態か」を持つ。
  expect(lines[0]).toContain('本体へ差し替え待ち 1 枚');
  expect(lines.join('\n')).toContain('plantuml-usecase-編集中.puml → plantuml-usecase.puml');
  // 反映済みの下書きは依頼ではなく片付け対象として分かれる (依頼件数を水増ししない)。
  expect(SQ.pending(q).map((r) => r.name)).toEqual(['plantuml-usecase']);
});

// BLK-reviewer-20260915-0307-wish: まとめには「同じ no-method 系でも、図の側で
// 意図的な省略と明記済みのもの」と「まだ何も答えていないもの」が混ざる。その区別は
// 監査のカテゴリには出ないので、reviewer は puml の note を人力で読み直し、
// 指摘.md に手書きの表を作っていた。findings.js が図から意図を読んで仕分ける。

// BLK-reviewer-20260915-0406-wish: 「SVG 古」は mtime だけを見た答えなので、保存し直した
// だけで中身は今の puml と一致している図も同じ箱に入っていた。指摘.md に「作り直し要」の
// 枠を書く前に、reviewer は 9 枚を render API で 1 枚ずつ描き直してバイト比較する裏取りを
// 毎回やり直していた (実データでは 9 枚とも中身は一致し、ずれていたのは mtime だけ)。
// findings.js が読む継続追跡が内容判定まで使い、作り直しが要る図だけを未解消に残す。
const zlib = require('zlib');

// PlantUML が svg に畳む形 (`<?plantuml-src …?>`) を作る。tools/svg-embedded-src の逆。
function foldSrc(dsl) {
  const PL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  const ST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b64 = zlib.deflateRawSync(Buffer.from(dsl, 'utf-8')).toString('base64').replace(/=+$/, '');
  let tok = '';
  for (const ch of b64) { const i = ST.indexOf(ch); tok += i < 0 ? ch : PL[i]; }
  return '<svg xmlns="http://www.w3.org/2000/svg"></svg><?plantuml-src ' + tok + '?>';
}

// BLK-reviewer-20260915-0606-wish: まとめを書く前に `audit.js --board` / `findings.js` /
// `pins.js --all` / `audit.js --names` / `audit.js --registry` / `POST /verify-svg` の
// 6 つを別々に叩き、結果を頭の中で突き合わせていた (--board の「SVG 内容ずれ」が
// verify-svg では体裁差に過ぎない、といった食い違いも目で見比べて初めて気づけた)。
// 図 1 枚 = 1 行の表に畳めば、突き合わせは表の列を読むだけで済む。

// 出口同士が食い違う行は、どちらかに寄せずに「気づき」列に両方残す
// (今回 reviewer が --board と verify-svg を手で見比べて気づいた食い違い)。
const SDB = require('../../../src/core/status-dashboard.js');

test('手順7 --board と verify-svg の食い違いが、同じ行の気づき列に出る', () => {
  const board = SDB.build({
    docs: ['adc_init_sequence'],
    // --board は「出力物/SVG 内容ずれ」として挙げている
    findings: [{ id: 'F-09', open: true, docs: ['adc_init_sequence.puml'], cats: ['出力物/SVG 内容ずれ'] }],
    // verify-svg は体裁差だけ (contentMatch: true) と答えている
    svg: { rows: [{ name: 'adc_init_sequence', content: 'format', status: 'stale', basis: 'rerender' }] },
  });
  const row = board.rows[0];
  expect(row.notes.length).toBe(1);
  expect(row.notes[0]).toContain('体裁差のみ・作り直し不要');
  // 食い違いを潰して片方に寄せない (作り直し要の枚数には数えない)。
  expect(board.totals.needsRender).toBe(0);
  expect(SDB.text(board, 'x')).toContain('気づき');
});

// BLK-reviewer-20260915-2240-wish: 図ごとの表ができても、手順 2・7・8 の突合は
// 「この行とあの行は同じ指摘の別表現か、本当に別物か」を頭の中でやっていた
// (F-01 の別図再掲を【新規】と誤読しかけた)。指摘 ID を鍵に 1 行へ畳み、
// その 1 行に出典 (どの出口の、どの根拠から来たか) を並べれば、
// 裏取りは「新しい行が増えたか」の 1 点確認で済む。
const FOM = require('../../../src/core/finding-origins.js');

test('手順2/7/8 指摘が出典ごとに畳まれ、別図の再掲と食い違いがその行で分かる', () => {
  const b = FOM.build({
    // audit --board が挙げた 2 件。F-01 は 2 枚に出ている (別図の再掲)。
    findings: [
      { id: 'F-01', title: 'ClockCtrl.EnableClock', open: true, label: '継続',
        cats: ['メソッド'], docs: ['adc_init_sequence.puml', 'can_init_sequence.puml'] },
      { id: 'F-09', title: 'adc の SVG が古い', open: true, label: '継続',
        cats: ['出力物/SVG 内容ずれ'], docs: ['adc_init_sequence.puml'] },
    ],
    // 📌 は本文に指摘 ID を書いてある (reviewer 自身の紐づけ)。
    pins: [{ doc: 'adc_init_sequence.puml', line: 6, status: 'untouched', label: '未着手',
             text: 'ClockCtrl.EnableClock がクラス図に無い(F-01継続3tick目)' }],
    // verify-svg は体裁差だけだと言っている。
    svg: { rows: [{ name: 'adc_init_sequence.puml', status: 'stale' }],
           staleReasons: { 'adc_init_sequence.puml': 'same' } },
    pinOpenStatuses: { untouched: true, started: true },
  });

  // 到達条件 1: 図の枚数で行が割れず、指摘 1 件が 1 行。
  expect(b.rows.length).toBe(2);

  // 到達条件 2: 別図の再掲が「新しい指摘ではない」とその行に書いてある。
  const f1 = b.rows.filter((r) => r.id === 'F-01')[0];
  expect(f1.restated).toBe(true);
  expect(f1.note).toContain('別図の再掲');

  // 到達条件 3: どの出口のどの根拠から来たかが 1 行に並ぶ (出口を叩き直さない)。
  expect(f1.origins.map((o) => o.tool).sort()).toEqual(['audit', 'pins']);
  expect(f1.origins.filter((o) => o.tool === 'pins')[0].basis).toContain('adc_init_sequence L6');

  // 到達条件 4: --board と verify-svg の食い違いは、寄せずにその行に残る。
  const f9 = b.rows.filter((r) => r.id === 'F-09')[0];
  expect(f9.conflicts.length).toBe(1);
  expect(f9.conflicts[0]).toContain('体裁差のみ');

  // 到達条件 5: 裏取りは「出典の組み合わせごとの件数」の 1 点確認で済む。
  expect(FOM.summaryLine(b)).toContain('出典の組み合わせ 2 通り');
  expect(FOM.summaryLine(b)).toContain('別図の再掲 1');
  expect(FOM.summaryLine(b)).toContain('食い違い 1');
});
