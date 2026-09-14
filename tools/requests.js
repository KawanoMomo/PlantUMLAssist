#!/usr/bin/env node
'use strict';

// requests.js — primary への依頼 (指摘.md) の継続 tick 数・継続日数・着手状況を読む入口。
//
//   node tools/requests.js <指摘.md> [--docs <フォルダ|ファイル> ...] [--tick ラベル] [--json]
//   npm run requests -- E:\01_Loop\persona-data\reviewer\指摘.md --docs E:\01_Loop\persona-data\primary
//
// BLK-reviewer-20260914-1906-wish: 依頼が何 tick 前から未着手か、いつ退行したかは
// どこにも残らず、手順2・7・8 のたびに runs/ の過去ログを手で遡って数えていた。
// 1 回叩くごとに 1 tick を控えに足し、依頼ごとに
//   初出 tick / 連続 tick 数 / 継続日数 / 新規・未着手・着手・再発・解消
// を出す。判定そのものは src/core/request-ledger.js の純関数。
//
// 終了コードは、走れば依頼の有無に関わらず 0 (CI ゲートではなく観測の口。
// audit.js / pins.js と同じ約束)。引数不正・対象なしだけが 1。

const fs = require('fs');
const path = require('path');
const { loadMA, docsFrom } = require('./audit-runtime');

// 控え。CLI を打つ場所 (リポジトリ直下) に置く。指摘.md ごとに分けて憶える。
const STATE_FILE = '.assist-requests-state.json';

const USAGE = [
  '使い方: node tools/requests.js <指摘.md> [オプション]',
  '',
  '  --docs PATH   依頼が名指しする図の置き場所 (フォルダでもファイルでも可。複数指定可)',
  '  --tick ラベル この回の名前 (既定は現在時刻。同じラベルで 2 度叩いても tick は増えない)',
  '  --json        人が読む要約ではなく JSON を出す',
  '  --out FILE    JSON をファイルに書く (標準出力にはパスだけ)',
  '  --all         解消した依頼も一覧に出す (既定は未解消のみ)',
  '  --state FILE  控えの置き場所を変える (既定 ' + STATE_FILE + ')',
  '  --no-state    控えを読み書きしない (継続 tick 数は 1 のまま)',
  '  --help        この説明',
  '',
  '状況の意味:',
  '  新規   — この tick で初めて出た依頼',
  '  未着手 — 依頼は残っていて、名指しされた図も前回 tick から動いていない',
  '  着手   — 依頼は残っているが、名指しされた図は前回 tick から書き換わっている',
  '  再発   — 一度 指摘.md から消えたのに、また書かれた (退行)',
  '  解消   — 今回の 指摘.md にはもう無い',
].join('\n');

function parseArgs(argv) {
  const opts = { file: null, docs: [], tick: null, json: false, out: null, all: false,
                 state: STATE_FILE, useState: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--no-state') opts.useState = false;
    else if (a === '--docs') opts.docs.push(argv[++i]);
    else if (a.indexOf('--docs=') === 0) opts.docs.push(a.slice(7));
    else if (a === '--tick') opts.tick = argv[++i];
    else if (a.indexOf('--tick=') === 0) opts.tick = a.slice(7);
    else if (a === '--out') opts.out = argv[++i];
    else if (a.indexOf('--out=') === 0) opts.out = a.slice(6);
    else if (a === '--state') opts.state = argv[++i];
    else if (a.indexOf('--state=') === 0) opts.state = a.slice(8);
    else if (a.indexOf('--') === 0) throw new Error('未知のオプション: ' + a);
    else if (!opts.file) opts.file = a;
    else throw new Error('指摘.md は 1 つだけ指定してください: ' + a);
  }
  return opts;
}

function readState(file) {
  try {
    if (!fs.existsSync(file)) return { files: {} };
    const v = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!v || typeof v !== 'object' || !v.files || typeof v.files !== 'object') return { files: {} };
    return v;
  } catch (e) { return { files: {} }; }
}

function writeState(file, state) {
  // 控えが残らなくても今回の仕分けは出る。書けない場所でも CLI 自体は成功させる。
  try { fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8'); } catch (e) { /* noop */ }
}

function formatSummary(RL, rows, ctx) {
  const lines = [];
  lines.push('依頼の台帳: ' + ctx.file);
  lines.push('  ' + RL.summaryText(rows));
  if (ctx.tick) lines.push('  この回: ' + ctx.tick + (ctx.at ? ' (' + ctx.at + ')' : ''));
  lines.push('');
  const shown = ctx.all ? rows : rows.filter((r) => r.open);
  if (shown.length === 0) {
    lines.push('  出ている依頼はありません。');
  } else {
    shown.forEach((r) => {
      lines.push('  ' + RL.rowText(r));
      if (r.docs.length) lines.push('      対象: ' + r.docs.join(', '));
    });
  }
  if (ctx.stateFile) {
    lines.push('');
    lines.push('控え: ' + ctx.stateFile + (ctx.ticks ? ' (' + ctx.ticks + ' tick 分)' : ''));
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
  if (opts.help || !opts.file) {
    (opts.help ? out : err)(USAGE);
    return opts.help ? 0 : 1;
  }

  let markdown;
  try {
    markdown = fs.readFileSync(path.resolve(opts.file), 'utf-8');
  } catch (e) {
    err('指摘.md が読めません: ' + opts.file + ' — ' + e.message);
    return 1;
  }

  // 図は「着手したか」を見るためだけに読む。渡されなければ着手の判定はせず、
  // 残っている依頼はすべて未着手として数える (嘘の「着手」を作らない)。
  const docs = {};
  if (opts.docs.length) {
    let list;
    try {
      list = docsFrom(opts.docs);
    } catch (e) {
      err('対象が読めません: ' + opts.docs.join(', ') + ' — ' + e.message);
      return 1;
    }
    // 依頼の文面は拡張子付き (`diagram1.puml`) でも名前だけでも書かれる。
    // 台帳が名指しするのは拡張子を落とした名前なので、そちらに揃えて渡す。
    list.forEach((d) => { docs[String(d.name).replace(/\.(puml|plantuml)$/i, '')] = d.dsl; });
  }

  const rt = loadMA();
  const RL = rt.MA.requestLedger;
  if (!RL) {
    err('src/core/request-ledger.js が読み込めませんでした');
    return 1;
  }

  const statePath = path.resolve(opts.state);
  const key = path.resolve(opts.file);
  const store = opts.useState ? readState(statePath) : { files: {} };
  const at = new Date().toISOString();
  const tick = opts.tick || at;

  const next = RL.update(store.files[key] || null, {
    markdown: markdown, docs: docs, label: tick, at: at,
  });
  const rows = RL.rows(next);

  if (opts.useState) {
    // __moved / __tick はこの回だけの覚え書き。控えには残さない。
    const keep = { version: next.version, ticks: next.ticks, requests: next.requests, docs: next.docs };
    store.files[key] = keep;
    writeState(statePath, store);
  }

  const payload = {
    generatedAt: at, file: key, tick: tick,
    ticks: next.ticks.length,
    summary: RL.summaryText(rows),
    requests: rows,
  };
  const json = JSON.stringify(payload, null, 2);
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json, 'utf-8');
    out(path.resolve(opts.out));
  } else if (opts.json) {
    out(json);
  } else {
    out(formatSummary(RL, rows, {
      file: key, tick: tick, at: at, all: opts.all,
      stateFile: opts.useState ? statePath : null, ticks: next.ticks.length,
    }));
  }
  if (rt.errors.length) {
    for (const e of rt.errors) err('読み込み失敗: ' + e.file + ' — ' + e.message);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, USAGE, STATE_FILE, formatSummary };
