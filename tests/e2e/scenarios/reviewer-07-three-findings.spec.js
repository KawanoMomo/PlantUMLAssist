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
const { loadMA } = require('../../../tools/audit-runtime');
const pinsCli = require('../../../tools/pins');

test('手順7 指摘 3 件を、行番号を書かずに対象の名前だけで図に貼れる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-reviewer-07-'));
  const files = {};
  ['gpio_init_sequence', 'gpio_state'].forEach((name) => {
    files[name] = path.join(dir, name + '.puml');
    fs.writeFileSync(files[name], R.DOCS[name], 'utf-8');
  });

  // reviewer が打つのは「どの図の・何に・何を」だけ。行は 1 つも書かない。
  const findings = [
    { doc: 'gpio_init_sequence', on: 'GpioDrv', text: 'GpioDrv は他図の Gpio_Driver と揃っていない' },
    { doc: 'gpio_init_sequence', on: 'Dbg_Trace', text: 'Dbg_Trace は宣言だけで使われていない' },
    { doc: 'gpio_state', on: 'Gpio_Reset', text: 'Gpio_Reset はシーケンスに実在しない' },
  ];
  for (const f of findings) {
    const code = pinsCli.main([files[f.doc], '--add', f.text, '--on', f.on, '--at', '2026-09-15T02:06'],
      { out: () => {}, err: () => {} });
    expect(code).toBe(0);
  }

  // 到達条件: 3 件とも図に残り、どれも「図・対象の行・内容」が図の中で揃っている。
  const MA = loadMA().MA;
  const placed = [];
  for (const name of Object.keys(files)) {
    const dsl = fs.readFileSync(files[name], 'utf-8');
    MA.reviewPins.list(dsl).forEach((p) => placed.push({ doc: name, line: p.line, anchor: p.anchor, text: p.text, stale: p.stale }));
  }
  expect(placed.length).toBe(3);
  for (const p of placed) {
    expect(p.stale).toBe(false);
    expect(p.line).toBeGreaterThan(0);
    expect(p.text.length).toBeGreaterThan(0);
  }
  // 貼り先は「その名前が書かれている行」そのもの。primary は探し直さずに済む。
  expect(placed.find((p) => p.text.includes('Gpio_Driver')).anchor).toBe('participant GpioDrv');
  expect(placed.find((p) => p.text.includes('使われていない')).anchor).toBe('participant Dbg_Trace');
  expect(placed.find((p) => p.text.includes('実在しない')).anchor).toBe('Ready --> Uninit : Gpio_Reset');
});

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
