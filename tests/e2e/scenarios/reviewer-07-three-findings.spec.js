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

// BLK-reviewer-20260915-0307-wish: まとめには「同じ no-method 系でも、図の側で
// 意図的な省略と明記済みのもの」と「まだ何も答えていないもの」が混ざる。その区別は
// 監査のカテゴリには出ないので、reviewer は puml の note を人力で読み直し、
// 指摘.md に手書きの表を作っていた。findings.js が図から意図を読んで仕分ける。
const findingsCli = require('../../../tools/findings');

test('手順7 意図明記済みと未対応が、note を読み直さずに分かれてまとまる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-reviewer-07-intent-'));
  fs.writeFileSync(path.join(dir, 'drv_class.puml'), [
    '@startuml',
    'class Spi_Driver {',
    '  +Spi_Init(cfg): Std_ReturnType',
    '}',
    'class ClockCtrl {',
    '  +Reset(): void',
    '}',
    'note top of ClockCtrl : ClockCtrl.EnableClock() は呼び先の詳細を意図的に割愛(依頼2への回答)',
    '@enduml',
  ].join('\n'), 'utf-8');
  fs.writeFileSync(path.join(dir, 'spi_init_sequence.puml'), [
    '@startuml',
    'participant Spi_Driver',
    'participant ClockCtrl',
    'participant SpiRegs',
    'Spi_Driver -> ClockCtrl : EnableClock(id)',
    'Spi_Driver -> SpiRegs : WriteConfig(cfg)',
    '@enduml',
  ].join('\n'), 'utf-8');

  const state = path.join(dir, 'st.json');
  const out = [];
  expect(findingsCli.main([dir, '--tick', 't1', '--state', state], { out: (s) => out.push(s), err: () => {} })).toBe(0);

  // 到達条件: まとめが「未解消のうち何件が意図明記済みで、何件が未対応か」を言う。
  const text = out.join('\n');
  expect(text).toContain('未解消の内訳: 意図明記済み 1 件 / 未対応 ');
  expect(text).toContain('意図明記済み(note) — drv_class.puml');

  // 指摘.md に貼る表にも、その区別が列として出る (手書きの表を作り直さない)。
  const md = [];
  expect(findingsCli.main([dir, '--tick', 't1', '--state', state, '--md'], { out: (s) => md.push(s), err: () => {} })).toBe(0);
  expect(md.join('\n')).toContain('| id | 状態 | 意図 | 初出 | 対象 | 分類 | 備考 |');
  expect(md.join('\n')).toContain('意図的に割愛');

  // 未対応だけに絞れば、primary へ返す「まだ答えが要る」分がそのまま出る。
  const only = [];
  expect(findingsCli.main([dir, '--tick', 't1', '--state', state, '--undeclared'], { out: (s) => only.push(s), err: () => {} })).toBe(0);
  expect(only.join('\n')).toContain('SpiRegs.WriteConfig');
  expect(only.join('\n')).not.toContain('意図明記済み(note) — drv_class.puml');
});

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

test('手順7 mtime だけが古い SVG が、裏取りなしで作り直し要と分かれる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-reviewer-07-stale-'));
  // 中身は追いついている図 — puml を保存し直しただけで、コメント 1 行しか違わない。
  const settled = ['@startuml', 'class Spi_Driver', '@enduml'].join('\n');
  // 中身まで古い図 — 書き出した後にクラスが 1 つ増えている。
  const oldDsl = ['@startuml', 'class Can_Driver', '@enduml'].join('\n');
  const newDsl = ['@startuml', 'class Can_Driver', 'class Can_Regs', '@enduml'].join('\n');

  fs.writeFileSync(path.join(dir, 'spi_class.puml'), settled + "\n' 保存し直しただけ\n", 'utf-8');
  fs.writeFileSync(path.join(dir, 'spi_class.svg'), foldSrc(settled), 'utf-8');
  fs.writeFileSync(path.join(dir, 'can_class.puml'), newDsl, 'utf-8');
  fs.writeFileSync(path.join(dir, 'can_class.svg'), foldSrc(oldDsl), 'utf-8');
  // どちらも svg の方が古い。mtime だけ見れば 2 枚とも「SVG 古」。
  const past = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(path.join(dir, 'spi_class.svg'), past, past);
  fs.utimesSync(path.join(dir, 'can_class.svg'), past, past);

  const state = path.join(dir, 'st.json');
  const out = [];
  expect(findingsCli.main([dir, '--tick', 't1', '--state', state],
    { out: (s) => out.push(s), err: () => {} })).toBe(0);
  const text = out.join('\n');

  // 到達条件 1: 未解消に残るのは作り直しが要る 1 枚だけ。
  // (裏取りの render + バイト比較をしなくても、指摘.md に写す枠がそのまま決まる)
  expect(text).toContain('can_class.puml');
  expect(text).toMatch(/\[新規\][^\n]*can_class\.puml[^\n]*出力物\/SVG 古/);

  // 到達条件 2: mtime だけが古い図は「古い」の枠から外れ、理由が箱の名前に出る。
  expect(text).not.toMatch(/\[新規\][^\n]*spi_class\.puml/);
  const all = [];
  expect(findingsCli.main([dir, '--tick', 't1', '--state', state, '--all'],
    { out: (s) => all.push(s), err: () => {} })).toBe(0);
  expect(all.join('\n')).toMatch(/\[除外\][^\n]*spi_class\.puml[^\n]*出力物\/SVG 古\(内容一致\)/);

  // 到達条件 3: 行は消えないので、次の tick で中身が変わっても「再発」ではなく
  // 同じ id の続きとして出る (指摘.md を書き直さずに 1 行を追える)。
  fs.writeFileSync(path.join(dir, 'spi_class.puml'), newDsl, 'utf-8');
  fs.utimesSync(path.join(dir, 'spi_class.svg'), past, past);
  const t2 = [];
  expect(findingsCli.main([dir, '--tick', 't2', '--state', state],
    { out: (s) => t2.push(s), err: () => {} })).toBe(0);
  expect(t2.join('\n')).toMatch(/spi_class\.puml[^\n]*出力物\/SVG 古/);
});

// BLK-reviewer-20260915-0606-wish: まとめを書く前に `audit.js --board` / `findings.js` /
// `pins.js --all` / `audit.js --names` / `audit.js --registry` / `POST /verify-svg` の
// 6 つを別々に叩き、結果を頭の中で突き合わせていた (--board の「SVG 内容ずれ」が
// verify-svg では体裁差に過ぎない、といった食い違いも目で見比べて初めて気づけた)。
// 図 1 枚 = 1 行の表に畳めば、突き合わせは表の列を読むだけで済む。
const dashboardCli = require('../../../tools/dashboard');

test('手順7 整合状態が 1 枚の表に並び、CLI 同士の食い違いも同じ行に出る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-reviewer-07-dash-'));
  // 中身は追いついていて mtime だけ古い図 (体裁差のみ) と、本当に古い図。
  const settled = ['@startuml', 'class Spi_Driver', '@enduml'].join('\n');
  const oldDsl = ['@startuml', 'class Can_Driver', '@enduml'].join('\n');
  const newDsl = ['@startuml', 'class Can_Driver', 'class Can_Regs', '@enduml'].join('\n');
  fs.writeFileSync(path.join(dir, 'spi_class.puml'), settled + "\n' 保存し直しただけ\n", 'utf-8');
  fs.writeFileSync(path.join(dir, 'spi_class.svg'), foldSrc(settled), 'utf-8');
  fs.writeFileSync(path.join(dir, 'can_class.puml'), newDsl, 'utf-8');
  fs.writeFileSync(path.join(dir, 'can_class.svg'), foldSrc(oldDsl), 'utf-8');
  const past = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(path.join(dir, 'spi_class.svg'), past, past);
  fs.utimesSync(path.join(dir, 'can_class.svg'), past, past);

  const out = [];
  const code = dashboardCli.main([dir, '--state', path.join(dir, 'st.json'),
    '--pins-state', path.join(dir, 'pins.json'), '--audit-state', path.join(dir, 'audit.json'),
    '--registry', path.join(dir, '_names.json')], { out: (s) => out.push(s), err: () => {} });
  expect(code).toBe(0);
  const text = out.join('\n');

  // 到達条件 1: 図・指摘・📌・SVG・表記・前回控えが 1 行に並ぶ (6 本を叩き直さない)。
  expect(text).toContain('指摘(未解消)');
  expect(text).toContain('表記(要決定)');
  // 印は無いが svg に畳まれた DSL で中身が言える図は「体裁差のみ」に落ちる
  // (/verify-svg を 1 枚ずつ叩き直さない)。
  expect(text).toMatch(/spi_class[^\n]*体裁差のみ/);

  // 到達条件 2: 作り直しが要る図だけが「手を入れる図」に残る
  // (体裁差・mtime だけの古さで指摘.md の枠を書き始めない)。
  expect(text).toMatch(/can_class[^\n]*内容ずれ/);
  expect(text).toMatch(/手を入れる図: [^\n]*can_class/);
  expect(text).not.toMatch(/手を入れる図: [^\n]*spi_class/);

  // 到達条件 3: 同じ表がそのまま指摘.md に貼れる。
  const md = [];
  expect(dashboardCli.main([dir, '--md', '--state', path.join(dir, 'st.json'),
    '--pins-state', path.join(dir, 'pins.json'), '--audit-state', path.join(dir, 'audit.json')],
    { out: (s) => md.push(s), err: () => {} })).toBe(0);
  expect(md.join('\n')).toContain('| 図 | 指摘(未解消) |');
});

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
