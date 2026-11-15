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

