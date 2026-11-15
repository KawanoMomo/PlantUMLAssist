'use strict';
// TICKET-roadmap-20261115-2114-1: 整理表 docs/spec/feature-triage.md (roadmap v5.0 クライテリア 1)。
// 表を読み、行数・判定の値・根拠の空欄・配布の行・束と状態の書き方・「済」の行の痕跡 0 件を確かめる。
// 「未」の行の痕跡 0 件 (クライテリア 2) は締めの TICKET-roadmap-20261115-2114-2 が足す。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var TRIAGE = path.join(ROOT, 'docs', 'spec', 'feature-triage.md');
var VERDICTS = ['残す', '統合', '消す'];
var GROUNDS = ['台本', '設計書', '価値'];
var COLS = ['#', '機能', '節', '判定', '統合先', '根拠', '束', '状態', '痕跡の語'];

// 表の行 (先頭の列が番号のもの) を { no, feature, section, verdict, into, ground, bundle, state, traces } にする。
// 列の数が違う行は cells の長さで分かるよう、そのまま返す。
function parseTriage(text) {
  var rows = [];
  text.split(/\r?\n/).forEach(function(line) {
    if (!/^\|\s*\d+\s*\|/.test(line)) return;
    var cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) { return c.trim(); });
    var traces = [];
    var m, re = /`([^`]+)`/g;
    var traceCell = cells[8] || '';
    while ((m = re.exec(traceCell))) traces.push(m[1]);
    rows.push({
      cells: cells, no: Number(cells[0]), feature: cells[1], section: cells[2], verdict: cells[3],
      into: cells[4], ground: cells[5], bundle: cells[6], state: cells[7], traces: traces,
    });
  });
  return rows;
}

// 判定の規則。違反を 1 行ずつの文で返す (空なら表は正しい)。
function problems(rows) {
  var out = [];
  rows.forEach(function(r, i) {
    var at = '#' + r.no + ' ' + r.feature;
    if (r.cells.length !== COLS.length) { out.push(at + ': 列が ' + r.cells.length + ' 個'); return; }
    if (r.no !== i + 1) out.push(at + ': 番号が通しでない (' + (i + 1) + ' のはず)');
    if (!r.feature || r.feature === '—') out.push(at + ': 機能が空');
    if (VERDICTS.indexOf(r.verdict) < 0) out.push(at + ': 判定が 残す / 統合 / 消す 以外 (' + r.verdict + ')');
    if (!r.ground || r.ground === '—') out.push(at + ': 根拠が空');
    else if (!GROUNDS.some(function(g) { return r.ground.indexOf(g) >= 0; })) out.push(at + ': 根拠が 台本 / 設計書 / 価値 のどれも言わない');
    if (r.verdict === '残す') {
      if (r.state !== '—') out.push(at + ': 残す行の状態は —');
    } else if (VERDICTS.indexOf(r.verdict) >= 0) {
      if (r.state !== '済' && r.state !== '未') out.push(at + ': 状態が 済 / 未 以外 (' + r.state + ')');
      if (!r.bundle || r.bundle === '—') out.push(at + ': 束が空');
      if (r.traces.length === 0) out.push(at + ': 痕跡の語が無い');
      if (r.verdict === '統合' && (!r.into || r.into === '—')) out.push(at + ': 統合先が空');
    }
  });
  return out;
}

function productText() {
  var files = [path.join(ROOT, 'plantuml-assist.html')];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function(f) {
      var p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else files.push(p);
    });
  })(path.join(ROOT, 'src'));
  return files.map(function(p) { return { file: path.relative(ROOT, p), text: fs.readFileSync(p, 'utf8') }; });
}

// 「済」の行の痕跡の語が html と src/ に残っている所を返す。
function leftovers(rows, texts) {
  var out = [];
  rows.forEach(function(r) {
    if (r.state !== '済') return;
    r.traces.forEach(function(w) {
      texts.forEach(function(t) { if (t.text.indexOf(w) >= 0) out.push('#' + r.no + ' `' + w + '` が ' + t.file + ' に残る'); });
    });
  });
  return out;
}

var TEXT = fs.readFileSync(TRIAGE, 'utf8');
var ROWS = parseTriage(TEXT);

describe('整理表 docs/spec/feature-triage.md', function() {
  test('行は v4.2.0 の台帳の機能行 148 以上', function() {
    expect(ROWS.length).toBeGreaterThanOrEqual(148);
  });

  test('全行が 9 列で、判定は 残す / 統合 / 消す、根拠に空欄が無く、束・状態・痕跡の書き方が揃う', function() {
    expect(problems(ROWS)).toEqual([]);
  });

  test('配布 (packaging/) を製品として出すかの判定行がある', function() {
    var dist = ROWS.filter(function(r) { return r.feature.indexOf('packaging/') >= 0; });
    expect(dist.length).toBe(1);
    expect(VERDICTS.indexOf(dist[0].verdict) >= 0).toBe(true);
  });

  test('TICKET-owner-20261115-1827-prune で外した機能は 消す・済 で載る', function() {
    var p1827 = ROWS.filter(function(r) { return r.bundle.indexOf('TICKET-owner-20261115-1827-prune') >= 0; });
    expect(p1827.length).toBeGreaterThanOrEqual(10);
    p1827.forEach(function(r) {
      expect(r.verdict + '・' + r.state + ' #' + r.no).toBe('消す・済 #' + r.no);
    });
  });

  test('台帳の 18 節と、配布・道具の節が全部ある', function() {
    ['基盤・画面の骨格', '作図(共通)', 'シーケンス図', '状態遷移図', 'クラス図', 'アクティビティ図', 'コンポーネント図',
      'ユースケース図', '保存・保存先', '保存フォルダの一覧・棚卸し', '読むだけのフォルダ・参照ペイン', '⇄ 一括置換・影響範囲',
      '探す・症状検索', '確かめる(突合・整合チェック)', 'レビュー・指摘', '変更サマリボード・会議', 'Export・資料化・納品',
      'サーバ・API', '配布・道具'].forEach(function(sec) {
      var n = ROWS.filter(function(r) { return r.section === sec; }).length;
      expect(sec + ':' + (n > 0)).toBe(sec + ':true');
    });
  });

  test('「済」の行の痕跡の語は plantuml-assist.html と src/ に 0 件', function() {
    var done = ROWS.filter(function(r) { return r.state === '済'; });
    expect(done.length).toBeGreaterThan(0);
    expect(leftovers(ROWS, productText())).toEqual([]);
  });
});

describe('整理表の読み方 (規則が変異で落ちる)', function() {
  var HEAD = '| # | 機能 | 節 | 判定 | 統合先 | 根拠 | 束 | 状態 | 痕跡の語 |\n|---|---|---|---|---|---|---|---|---|\n';
  var OK_DROP = '| 1 | A | X | 消す | — | 台本: 場面なし | TICKET-x | 済 | `foo` |';
  var OK_KEEP = '| 2 | B | X | 残す | — | 価値: 守り | — | — | — |';

  test('正しい 2 行は違反 0', function() {
    expect(problems(parseTriage(HEAD + OK_DROP + '\n' + OK_KEEP))).toEqual([]);
  });

  test('判定が 3 値以外・空なら落ちる', function() {
    expect(problems(parseTriage(HEAD + OK_DROP.replace('消す', '保留'))).length).toBe(1);
    expect(problems(parseTriage(HEAD + OK_KEEP.replace('残す', '').replace('| 2 |', '| 1 |'))).length).toBeGreaterThan(0);
  });

  test('根拠が空欄・3 つの根拠のどれも言わないなら落ちる', function() {
    expect(problems(parseTriage(HEAD + OK_DROP.replace('台本: 場面なし', '—'))).length).toBe(1);
    expect(problems(parseTriage(HEAD + OK_DROP.replace('台本: 場面なし', '作るのが大変だった'))).length).toBe(1);
  });

  test('消す行の状態・束・痕跡が欠けると落ちる。統合は統合先も要る', function() {
    expect(problems(parseTriage(HEAD + OK_DROP.replace('| 済 |', '| — |'))).length).toBe(1);
    expect(problems(parseTriage(HEAD + OK_DROP.replace('TICKET-x', '—'))).length).toBe(1);
    expect(problems(parseTriage(HEAD + OK_DROP.replace('`foo`', '—'))).length).toBe(1);
    expect(problems(parseTriage(HEAD + OK_DROP.replace('消す', '統合'))).length).toBe(1);
  });

  test('「済」の痕跡の語が src に残れば名指しする', function() {
    var rows = parseTriage(HEAD + OK_DROP);
    expect(leftovers(rows, [{ file: 'src/a.js', text: 'var foo = 1;' }])).toEqual(['#1 `foo` が src/a.js に残る']);
    expect(leftovers(rows, [{ file: 'src/a.js', text: 'var bar = 1;' }])).toEqual([]);
  });
});
