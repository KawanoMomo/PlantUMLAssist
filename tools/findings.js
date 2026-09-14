#!/usr/bin/env node
'use strict';

// findings.js — 指摘トラッカー。指摘 1 件を id つきの 1 行にして、tick をまたいだ
// 状態 (新規 / 継続 N tick / 部分解消 / 再発 / 解消) を控えに持ち越す入口。
//
//   node tools/findings.js <フォルダ|.puml|監査JSON> ... [オプション]
//   npm run findings -- E:\01_Loop\persona-data\primary --tick runs/20260914-2206
//   npm run findings -- --set F-03=partial --note "puml 側は解消。svg 再エクスポートのみ継続"
//
// BLK-reviewer-20260914-2206-wish: 指摘.md は毎 tick 全文を上書きする 1 枚なので、
// 「puml 側は解消・svg の再エクスポートだけ継続」のような複合の判断はその回の文面に
// しか残らない。次の tick で監査が同じ論点を別カテゴリ (svg-stale 等) で拾うと、
// 過去の判断が失われて「再発」に見える。ここは判断を行に貼り付けて持ち越すので、
// 手順7〜8 は全文の書き直しではなく「該当行の状態を 1 つ更新する」で済む。
//
// 判定そのものは src/core/finding-tracker.js の純関数。
//
// 終了コードは、走れば指摘の有無に関わらず 0 (CI ゲートではなく観測の口。
// audit.js / requests.js と同じ約束)。引数不正・対象なしだけが 1。

const fs = require('fs');
const path = require('path');
const report = require('./audit-report');
const tracker = require('../src/core/finding-tracker');
const { loadMA } = require('./audit-runtime');

// 控え。CLI を打つ場所 (リポジトリ直下) に置く。
const STATE_FILE = '.assist-findings-state.json';

const USAGE = [
  '使い方: node tools/findings.js <フォルダ|.puml|監査JSON> ... [オプション]',
  '',
  '  --tick ラベル  この回の名前 (既定は現在時刻。同じラベルで 2 度叩いても tick は増えない)',
  '  --set ID=状態  指摘 1 行の判断を貼り替える (状態: partial / resolved / wontfix / open)',
  '  --note 文言    --set に添える覚え書き (「svg 再エクスポートのみ継続」等)',
  '  --all          解消・対象外の行も出す (既定は未解消のみ)',
  '  --json         JSON を出す',
  '  --md [FILE]    指摘.md に貼れる表を出す (FILE を書けばそこへ書き出す)',
  '  --state FILE   控えの置き場所を変える (既定 ' + STATE_FILE + ')',
  '  --no-state     控えを読み書きしない',
  '  --help         この説明',
  '',
  '状態の意味:',
  '  新規     — この tick で初めて出た指摘',
  '  継続 N   — N tick 続けて出ている',
  '  再発     — 一度消えたのに、また出た (退行)',
  '  部分解消 — 人が貼った判断。監査から消えても解消にはせず、この行のまま持ち越す',
  '  解消     — 今回の監査に出ていない (または解消の判断を貼った)',
  '',
  '判断を貼った行 (部分解消 / 解消 / 対象外) は、以後の監査の出欠で上書きしない。',
  '監査がカテゴリを移しただけの回に「再発」へ戻るのを防ぐため。--set ID=open で剥がす。',
].join('\n');

function parseArgs(argv) {
  const opts = { targets: [], tick: null, set: null, note: null, all: false, json: false,
                 md: false, mdFile: null, state: STATE_FILE, useState: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--no-state') opts.useState = false;
    else if (a === '--tick') opts.tick = argv[++i];
    else if (a.indexOf('--tick=') === 0) opts.tick = a.slice(7);
    else if (a === '--set') opts.set = argv[++i];
    else if (a.indexOf('--set=') === 0) opts.set = a.slice(6);
    else if (a === '--note') opts.note = argv[++i];
    else if (a.indexOf('--note=') === 0) opts.note = a.slice(7);
    else if (a === '--state') opts.state = argv[++i];
    else if (a.indexOf('--state=') === 0) opts.state = a.slice(8);
    // --md は引数を任意で取る。次が別のオプションなら書き出し先なし。
    else if (a === '--md') {
      opts.md = true;
      const next = argv[i + 1];
      if (next && next.indexOf('--') !== 0 && /\.(md|markdown)$/i.test(next)) opts.mdFile = argv[++i];
    }
    else if (a.indexOf('--md=') === 0) { opts.md = true; opts.mdFile = a.slice(5); }
    else if (a.indexOf('--') === 0) throw new Error('未知のオプション: ' + a);
    else opts.targets.push(a);
  }
  return opts;
}

function readState(file) {
  try {
    if (!fs.existsSync(file)) return tracker.emptyState();
    return tracker.readState(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e) { return tracker.emptyState(); }
}

function writeState(file, state) {
  // 控えが残らなくても今回の仕分けは出る。書けない場所でも CLI 自体は成功させる。
  try { fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8'); } catch (e) { /* noop */ }
}

// 対象が監査 JSON なら読むだけ。図なら監査を回す (reviewer が 2 回叩かなくて済む)。
function auditsFrom(targets) {
  const json = targets.filter((t) => /\.json$/i.test(t));
  if (json.length) {
    if (json.length !== targets.length) throw new Error('監査JSON と図は混ぜて指定できません');
    const v = JSON.parse(fs.readFileSync(path.resolve(json[0]), 'utf-8'));
    // audit.js --out は全体の報告書を書く。監査そのものは中の audits。
    return (v && v.audits) || v;
  }
  const rt = loadMA();
  const docs = report.collectDocs(targets);
  if (docs.length === 0) throw new Error('対象の .puml が 1 枚もありません: ' + targets.join(', '));
  return report.buildReport(rt.MA, docs, { targets: targets }).audits;
}

// `F-03=partial` / `F-03:partial` / `F-03 partial` のどれでも受ける。
function parseSet(text) {
  const m = String(text || '').match(/^\s*([^\s=:]+)\s*[=:\s]\s*([a-z]+)\s*$/i);
  if (!m) return null;
  return { id: m[1], state: m[2].toLowerCase() };
}

function formatSummary(list, ctx) {
  const lines = [];
  lines.push('指摘トラッカー: ' + ctx.stateFile);
  lines.push('  ' + tracker.summaryText(list));
  if (ctx.tick) lines.push('  この回: ' + ctx.tick);
  if (ctx.ticks) lines.push('  記録した tick: ' + ctx.ticks);
  lines.push('');
  const shown = ctx.all ? list : list.filter((r) => r.open);
  if (shown.length === 0) {
    lines.push('  出ている指摘はありません。');
  } else {
    shown.forEach((r) => lines.push('  ' + tracker.rowText(r)));
  }
  if (!ctx.all && list.length !== shown.length) {
    lines.push('');
    lines.push('  （解消・対象外 ' + (list.length - shown.length) + ' 件は --all で出ます）');
  }
  return lines.join('\n');
}

function main(argv, io) {
  const out = (io && io.out) || console.log;
  const err = (io && io.err) || console.error;
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err(e.message + '\n\n' + USAGE);
    return 1;
  }
  if (opts.help || (!opts.targets.length && !opts.set)) {
    (opts.help ? out : err)(USAGE);
    return opts.help ? 0 : 1;
  }

  const statePath = path.resolve(opts.state);
  let store = opts.useState ? readState(statePath) : tracker.emptyState();

  // --set だけなら監査は回さない。「該当行の状態を更新するだけ」がこの口。
  if (opts.set) {
    const parsed = parseSet(opts.set);
    if (!parsed) {
      err('--set は ID=状態 の形で指定します (例 --set F-03=partial)');
      return 1;
    }
    const r = tracker.setVerdict(store, parsed.id, parsed.state, opts.note, opts.tick);
    if (!r.ok) {
      err(r.reason === 'no-such-verdict'
        ? '知らない状態です: ' + parsed.state + ' (partial / resolved / wontfix / open)'
        : 'その id の指摘は控えにありません: ' + parsed.id);
      return 1;
    }
    store = r.state;
    out(r.id + ' を ' + (tracker.VERDICT[parsed.state] || {}).label + ' にしました'
      + (opts.note ? '（' + opts.note + '）' : ''));
  }

  if (opts.targets.length) {
    let audits;
    try {
      audits = auditsFrom(opts.targets);
    } catch (e) {
      err('対象が読めません: ' + opts.targets.join(', ') + ' — ' + e.message);
      return 1;
    }
    store = tracker.update(store, {
      audits: audits, label: opts.tick, at: new Date().toISOString(),
    });
  }

  if (opts.useState) writeState(statePath, store);

  const list = tracker.rows(store);
  if (opts.md) {
    const md = tracker.markdown(store, '指摘トラッカー');
    if (opts.mdFile) {
      const p = path.resolve(opts.mdFile);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, md, 'utf-8');
      out(p);
    } else {
      out(md);
    }
    return 0;
  }
  if (opts.json) {
    out(JSON.stringify({
      generatedAt: new Date().toISOString(),
      state: statePath,
      ticks: store.ticks,
      summary: tracker.summaryText(list),
      findings: list,
    }, null, 2));
    return 0;
  }
  out(formatSummary(list, {
    stateFile: statePath, all: opts.all, tick: opts.tick,
    ticks: store.ticks.map((t) => t.label).join(' → '),
  }));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, parseSet, USAGE, STATE_FILE, formatSummary };
