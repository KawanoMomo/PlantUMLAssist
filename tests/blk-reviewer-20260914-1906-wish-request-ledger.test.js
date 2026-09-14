'use strict';
// BLK-reviewer-20260914-1906-wish: primary への依頼 (指摘.md) の継続 tick 数・継続日数を
// 自動で追う台帳 (src/core/request-ledger.js) と、その CLI (tools/requests.js)。
//
// 摩擦: 依頼が何 tick 前から未着手か、いつ退行したかはどこにも残らず、手順2・7・8 の
// たびに runs/ の過去ログを手で遡って数えていた。ここで固定するのは
//   (1) 指摘.md から依頼を 1 件ずつ切り出せること (扱いの括弧が変わっても同じ依頼と分かる)
//   (2) 叩くたびに tick が積まれ、連続 tick 数・継続日数が出ること
//   (3) 依頼が名指しする図が動いたかで未着手 / 着手が分かれること
//   (4) 消えた依頼は解消、また書かれたら再発と言うこと
//   (5) CLI が控えをファイルに残し、次の run がそれを読むこと。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA } = require('../tools/audit-runtime');
const cli = require('../tools/requests');

const RL = loadMA().MA.requestLedger;

var MD1 = [
  '# primary への指摘(reviewer runs/20260914-1906 時点)',
  '',
  '## 【未解消・継続】依頼1: plantuml-usecase.puml を実際のユースケース図に',
  '本体はまだ差し替わっていない。',
  '',
  '## primary への依頼(優先順、変化なし)',
  '1. (最優先・継続)`plantuml-usecase-編集中.puml` の内容を `plantuml-usecase.puml` 本体に',
  '   差し替え、`-編集中` ファイルを削除する。',
  '2. (継続)`diagram1.puml` に `\' domain-verdict` のコメント行を復元する。',
  '',
].join('\n');

// 2 回目。依頼の扱いだけが変わり、中身は同じ (同じ依頼として数えたい)。
var MD2 = MD1.replace('(最優先・継続)', '(最優先・3 tick 継続)').replace('(継続)`diagram1', '(未着手)`diagram1');

// 3 回目。依頼 2 が解消して一覧から消えた。
var MD3 = [
  '## primary への依頼',
  '1. `plantuml-usecase-編集中.puml` の内容を `plantuml-usecase.puml` 本体に差し替え、',
  '   `-編集中` ファイルを削除する。',
  '',
].join('\n');

var DOC_A = '@startuml\nactor Primary\n@enduml';
var DOC_B = '@startuml\nclass Foo\n@enduml';

describe('requestLedger.parse — 指摘.md から依頼を切り出す', function() {

  test('依頼の節の番号つき箇条書きを 1 件ずつ拾う (続きの行も本文に含める)', function() {
    var rs = RL.parse(MD1);
    expect(rs.length).toBe(2);
    expect(rs[0].text).toContain('本体に差し替え');
    expect(rs[0].text).toContain('-編集中` ファイルを削除する');
    expect(rs[1].text).toContain('domain-verdict');
  });

  test('扱いを表す括弧は指紋にも表示にも入れない (扱いが変われば別件、にしない)', function() {
    var a = RL.parse(MD1);
    var b = RL.parse(MD2);
    expect(b[0].key).toBe(a[0].key);
    expect(b[1].key).toBe(a[1].key);
    expect(a[0].text.indexOf('最優先')).toBe(-1);
  });

  test('依頼が名指しする図を拾う (着手したかを見る先)', function() {
    var rs = RL.parse(MD1);
    expect(rs[0].docs).toEqual(['plantuml-usecase-編集中', 'plantuml-usecase']);
    expect(rs[1].docs).toEqual(['diagram1']);
  });

  test('一覧の節が無い回は、依頼の見出しそのものを拾う (依頼を落とさない)', function() {
    var rs = RL.parse('# 指摘\n\n## 【未解消】依頼1: plantuml-usecase.puml を差し替える\n本文。\n');
    expect(rs.length).toBe(1);
    expect(rs[0].text).toContain('plantuml-usecase.puml を差し替える');
  });
});

describe('requestLedger.update / rows — tick を積んで継続を数える', function() {

  function tick(state, md, docs, label, at) {
    return RL.update(state, { markdown: md, docs: docs, label: label, at: at });
  }

  test('初回は全件が新規で、連続 1 tick', function() {
    var st = tick(null, MD1, {}, '1906', '2026-09-14T19:06:00Z');
    var rows = RL.rows(st);
    expect(rows.length).toBe(2);
    rows.forEach(function(r) {
      expect(r.status).toBe('new');
      expect(r.streak).toBe(1);
      expect(r.firstTick).toBe('1906');
    });
  });

  test('図が動いていなければ未着手のまま連続 tick 数が伸び、継続日数も出る', function() {
    var st = tick(null, MD1, { 'plantuml-usecase': DOC_A, diagram1: DOC_B }, '1906', '2026-09-14T19:06:00Z');
    st = tick(st, MD2, { 'plantuml-usecase': DOC_A, diagram1: DOC_B }, '2006', '2026-09-16T20:06:00Z');
    var rows = RL.rows(st);
    expect(rows.length).toBe(2);
    rows.forEach(function(r) {
      expect(r.status).toBe('stalled');
      expect(r.streak).toBe(2);
      expect(r.days).toBe(2);
    });
    expect(RL.rowText(rows[0])).toContain('[未着手]');
    expect(RL.rowText(rows[0])).toContain('連続 2 tick');
  });

  test('名指しされた図が前回から書き換わっていれば着手と言う', function() {
    var st = tick(null, MD1, { 'plantuml-usecase': DOC_A, diagram1: DOC_B }, '1906', '2026-09-14T19:06:00Z');
    st = tick(st, MD1, { 'plantuml-usecase': DOC_A + '\n' , diagram1: DOC_B + '\nclass Bar\n' }, '2006', '2026-09-14T20:06:00Z');
    var rows = RL.rows(st);
    var d1 = rows.filter(function(r) { return r.docs.indexOf('diagram1') >= 0; })[0];
    var uc = rows.filter(function(r) { return r.docs.indexOf('plantuml-usecase') >= 0; })[0];
    expect(d1.status).toBe('working');
    expect(uc.status).toBe('stalled');
  });

  test('同じ tick ラベルで 2 度叩いても tick は増えない (数え直しで日数が伸びない)', function() {
    var st = tick(null, MD1, {}, '1906', '2026-09-14T19:06:00Z');
    st = tick(st, MD1, {}, '1906', '2026-09-14T19:07:00Z');
    expect(st.ticks.length).toBe(1);
    expect(RL.rows(st)[0].streak).toBe(1);
  });

  test('今回の 指摘.md から消えた依頼は解消として残る (消滅させない)', function() {
    var st = tick(null, MD1, {}, '1906', '2026-09-14T19:06:00Z');
    st = tick(st, MD3, {}, '2006', '2026-09-14T20:06:00Z');
    var rows = RL.rows(st);
    var gone = rows.filter(function(r) { return !r.open; });
    expect(gone.length).toBe(1);
    expect(gone[0].status).toBe('resolved');
    expect(gone[0].text).toContain('domain-verdict');
        // 最後に出たのは 1906。そこを最後に消えた、と言う。
    expect(RL.rowText(gone[0])).toContain('1906 を最後に消えた');
  });

  test('いちど消えた依頼がまた書かれたら再発と言う (いつ退行したかが分かる)', function() {
    var st = tick(null, MD1, {}, '1906', '2026-09-14T19:06:00Z');
    st = tick(st, MD3, {}, '2006', '2026-09-14T20:06:00Z');
    st = tick(st, MD1, {}, '2106', '2026-09-14T21:06:00Z');
    var rows = RL.rows(st);
    var back = rows.filter(function(r) { return r.text.indexOf('domain-verdict') >= 0; })[0];
    expect(back.status).toBe('regressed');
    expect(back.regressed).toBe(true);
    expect(back.streak).toBe(1);
    expect(back.firstTick).toBe('1906');
    expect(RL.rowText(back)).toContain('再発');
  });

  test('1 行見出しが未解消件数と最長の継続 tick を言う', function() {
    var st = tick(null, MD1, {}, '1906', '2026-09-14T19:06:00Z');
    st = tick(st, MD2, {}, '2006', '2026-09-14T20:06:00Z');
    var line = RL.summaryText(RL.rows(st));
    expect(line).toContain('未解消 2 件');
    expect(line).toContain('最長 2 tick 継続');
  });

  test('壊れた控えは「前回なし」として読む (CLI を落とさない)', function() {
    expect(RL.readState('{壊れ').ticks).toEqual([]);
    expect(RL.readState(null).requests).toEqual({});
  });
});

describe('tools/requests.js — CLI', function() {

  function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-req-')); }

  function capture(argv) {
    const outs = [], errs = [];
    const code = cli.main(argv, { out: (s) => outs.push(String(s)), err: (s) => errs.push(String(s)) });
    return { code, out: outs.join('\n'), err: errs.join('\n') };
  }

  test('引数なしは使い方を出して 1 で終わる', function() {
    const r = capture([]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('使い方');
  });

  test('--help は 0 で終わり、状況の意味まで書いてある', function() {
    const r = capture(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('未着手');
    expect(r.out).toContain('再発');
  });

  test('読めない 指摘.md は 1 で終わる', function() {
    const r = capture([path.join(tmpdir(), 'no-such.md')]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('読めません');
  });

  test('控えがファイルに残り、次の run が連続 tick 数を積む', function() {
    const dir = tmpdir();
    const md = path.join(dir, '指摘.md');
    const state = path.join(dir, 'state.json');
    fs.writeFileSync(md, MD1, 'utf-8');

    const first = capture([md, '--tick', '1906', '--state', state]);
    expect(first.code).toBe(0);
    expect(first.out).toContain('[新規]');
    expect(fs.existsSync(state)).toBe(true);

    fs.writeFileSync(md, MD2, 'utf-8');
    const second = capture([md, '--tick', '2006', '--state', state, '--json']);
    expect(second.code).toBe(0);
    const payload = JSON.parse(second.out);
    expect(payload.ticks).toBe(2);
    expect(payload.requests.length).toBe(2);
    payload.requests.forEach(function(r) { expect(r.streak).toBe(2); });
    // 控えには覚え書き (__moved) を残さない。
    const saved = JSON.parse(fs.readFileSync(state, 'utf-8'));
    expect(Object.keys(saved.files).length).toBe(1);
    expect(JSON.stringify(saved)).not.toContain('__moved');
  });

  test('--no-state なら控えを書かない (見るだけの実行)', function() {
    const dir = tmpdir();
    const md = path.join(dir, '指摘.md');
    const state = path.join(dir, 'state.json');
    fs.writeFileSync(md, MD1, 'utf-8');
    const r = capture([md, '--tick', '1906', '--state', state, '--no-state']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(state)).toBe(false);
  });

  test('既定は未解消だけ、--all で解消した依頼も出る', function() {
    const dir = tmpdir();
    const md = path.join(dir, '指摘.md');
    const state = path.join(dir, 'state.json');
    fs.writeFileSync(md, MD1, 'utf-8');
    capture([md, '--tick', '1906', '--state', state]);
    fs.writeFileSync(md, MD3, 'utf-8');
    const plain = capture([md, '--tick', '2006', '--state', state]);
    expect(plain.out).not.toContain('[解消]');
    const all = capture([md, '--tick', '2006', '--state', state, '--all']);
    expect(all.out).toContain('[解消]');
  });

  test('--docs を渡すと、図が動いたかで未着手と着手が分かれる', function() {
    const dir = tmpdir();
    const md = path.join(dir, '指摘.md');
    const state = path.join(dir, 'state.json');
    const docs = path.join(dir, 'docs');
    fs.mkdirSync(docs);
    fs.writeFileSync(md, MD1, 'utf-8');
    fs.writeFileSync(path.join(docs, 'plantuml-usecase.puml'), DOC_A, 'utf-8');
    fs.writeFileSync(path.join(docs, 'diagram1.puml'), DOC_B, 'utf-8');
    capture([md, '--tick', '1906', '--docs', docs, '--state', state]);
    fs.writeFileSync(path.join(docs, 'diagram1.puml'), DOC_B + '\nclass Bar\n', 'utf-8');
    const r = capture([md, '--tick', '2006', '--docs', docs, '--state', state, '--json']);
    const rows = JSON.parse(r.out).requests;
    const d1 = rows.filter(function(x) { return x.docs.indexOf('diagram1') >= 0; })[0];
    expect(d1.status).toBe('working');
  });

  test('--out は JSON をファイルに書き、標準出力にはパスだけ出す', function() {
    const dir = tmpdir();
    const md = path.join(dir, '指摘.md');
    const outFile = path.join(dir, 'out', 'requests.json');
    fs.writeFileSync(md, MD1, 'utf-8');
    const r = capture([md, '--tick', '1906', '--state', path.join(dir, 's.json'), '--out', outFile]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(path.resolve(outFile));
    expect(JSON.parse(fs.readFileSync(outFile, 'utf-8')).requests.length).toBe(2);
  });

  test('未知のオプションは使い方を出して 1 で終わる', function() {
    const r = capture(['x.md', '--nope']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('未知のオプション');
  });
});
