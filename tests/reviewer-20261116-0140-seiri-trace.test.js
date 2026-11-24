'use strict';
// TICKET-reviewer-20261116-0140: v5.0 の整理で機能を外し振る舞いを変えたのに、対応する ECN / ADR ドラフトが無かった。
// 整理の判断は ADR ドラフト docs/adr/drafts/v5-seiri-core-path.md、v4.0 以降の変更は docs/ecn/ECN-010_v5.0.0-seiri.md。
// ここでは CHANGELOG の v5.0.0 の節で「外し」を含む行の票 id が、ECN か ADR ドラフトのどちらかに書かれていることを見張る。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ECN = 'docs/ecn/ECN-010_v5.0.0-seiri.md';
const ADR = 'docs/adr/drafts/v5-seiri-core-path.md';

function v5Section() {
  const lines = read('CHANGELOG.md').split(/\r?\n/);
  const s = lines.findIndex((l) => /^## v5\.0\.0\b/.test(l));
  const e = lines.findIndex((l, i) => i > s && /^## v4\.0\b/.test(l));
  return lines.slice(s + 1, e);
}

// `- TICKET-owner-20261116-0321-prune (途中 1): …` → `TICKET-owner-20261116-0321-prune`
function idOf(line) {
  const m = /^- ([^:：]+)[:：]/.exec(line);
  if (!m) return null;
  return m[1].replace(/\s*\(.*\)\s*$/, '').trim();
}

describe('整理の版の ECN と ADR ドラフトがある', () => {
  test('ECN-010 と ADR ドラフトが実在し、互いを指す', () => {
    const ecn = read(ECN);
    const adr = read(ADR);
    expect(ecn).toContain('v5-seiri-core-path.md');
    expect(adr).toContain('ECN-010_v5.0.0-seiri.md');
    expect(adr).toContain('docs/spec/feature-triage.md');
  });
  test('ECN はテンプレートの見出しを持つ', () => {
    const ecn = read(ECN);
    ['## コンテキスト', '## 対策', '## 結果', '## 教訓', '**関連 ADR**'].forEach((h) => expect(ecn).toContain(h));
  });
  test('ADR ドラフトは採番しない (drafts の中で、番号の付いた名前でない)', () => {
    expect(/^ADR-\d+/.test(path.basename(ADR))).toBe(false);
    expect(read(ADR)).toContain('採番は人間');
  });
  test('ADR ドラフトは整理の 4 つの判断を書く', () => {
    const adr = read(ADR);
    ['中核の経路', '.puml` だけを書く', '保存を止める・逸らす仕組みを外す', '監査・レビュー・部品の仕組みを外す', '守りは消さない'].forEach((w) => expect(adr).toContain(w));
  });
  test('ECN の一覧に 010 の行がある', () => {
    expect(read('docs/ecn/README.md')).toContain('(ECN-010_v5.0.0-seiri.md)');
  });
});

describe('CHANGELOG の外した行は ECN か ADR ドラフトから辿れる', () => {
  const sec = v5Section();
  const removed = sec.filter((l) => /外し/.test(l)).map(idOf).filter(Boolean);
  test('v5.0.0 の節に外した行がある (節を読めている)', () => {
    expect(removed.length >= 20).toBe(true);
  });
  test('外した行の票 id がどれも ECN か ADR ドラフトに書かれている', () => {
    const docs = read(ECN) + '\n' + read(ADR);
    const missing = Array.from(new Set(removed)).filter((id) => docs.indexOf(id) < 0);
    expect(missing).toEqual([]);
  });
  test('ECN の表の行はハッシュを持つ', () => {
    const rows = read(ECN).split(/\r?\n/).filter((l) => /^\| (TICKET-|releaser)/.test(l));
    expect(rows.length >= 20).toBe(true);
    rows.forEach((r) => expect(/\| [0-9a-f]{7}( [0-9a-f]{7})* \|$/.test(r)).toBe(true));
  });
});
