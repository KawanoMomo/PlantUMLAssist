#!/usr/bin/env node
'use strict';

// pins.js — 指摘の着手状況 (未着手 / 着手 / 解消) を CLI から読む公式の入口。
//
//   node tools/pins.js <ファイル|フォルダ> [...] [--json] [--all] [--author 名前]
//   npm run pins -- E:\01_Loop\persona-data
//
// BLK-reviewer-20260908-1803-wish: 📥 指摘箱の着手状況は GUI にしかなく、
// ブラウザを開かない運用の reviewer は、前回の依頼が着手されたかを
// `audit.js --since-files` で 17 枚全部の指紋を控えと突き合わせて読んでいた。
// 判定そのもの (src/core/pin-progress.js) は純関数なので、控えの置き場所を
// localStorage からファイルへ替えるだけで同じ結果が 1 コマンドで出る。
//
// 終了コードは、走れば指摘の有無に関わらず 0 (件数は要約か JSON で読む)。
// 引数不正・対象なしだけが 1。「未解消があると落ちる」にしないのは、
// これが CI ゲートではなく観測の口だから (audit.js と同じ約束)。

const fs = require('fs');
const path = require('path');
const { loadMA, docsFrom } = require('./audit-runtime');
const pinReport = require('./pin-report');

// 控え。CLI を打つ場所 (リポジトリ直下) に置く。図フォルダごとに分けて憶える
// (画面が保存フォルダごとに localStorage の鍵を分けているのと同じ理由:
//  別のフォルダを見た run が、前に見ていたフォルダの見送り回数を消さない)。
const STATE_FILE = '.assist-pins-state.json';

const USAGE = [
  '使い方: node tools/pins.js <ファイル|フォルダ> [...] [オプション]',
  '',
  '  --json        人が読む要約ではなく JSON を出す',
  '  --all         解消も出す (既定は未解消 = 未着手 + 着手 のみ)',
  '  --author 名前 その名前が書いた指摘だけに絞る',
  '  --out FILE    JSON をファイルに書く (標準出力にはパスだけ)',
  '  --state FILE  控えの置き場所を変える (既定 ' + STATE_FILE + ')',
  '  --no-state    控えを読み書きしない (見送り回数は 0 のまま)',
  '  --help        この説明',
  '',
  '状況の意味:',
  '  未着手 — 指摘のあと、その図はまだ 1 度も書き換わっていない',
  '  着手   — 図は書き換わったのに指摘した行はそのまま (または応答が返っている)',
  '  解消   — 指摘した行が図から無くなった / 対応済みの印が付いた',
].join('\n');

function parseArgs(argv) {
  const opts = { targets: [], json: false, all: false, author: null, out: null, state: STATE_FILE, useState: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--no-state') opts.useState = false;
    else if (a === '--author') opts.author = argv[++i];
    else if (a.indexOf('--author=') === 0) opts.author = a.slice(9);
    else if (a === '--out') opts.out = argv[++i];
    else if (a.indexOf('--out=') === 0) opts.out = a.slice(6);
    else if (a === '--state') opts.state = argv[++i];
    else if (a.indexOf('--state=') === 0) opts.state = a.slice(8);
    else if (a.indexOf('--') === 0) throw new Error('未知のオプション: ' + a);
    else opts.targets.push(a);
  }
  return opts;
}

// 控えの鍵。対象の指定をそのまま絶対パスにして並べる。
function stateKey(targets) {
  return targets.map((t) => path.resolve(t)).sort().join(path.delimiter);
}

// 壊れた控えで CLI を落とさない。読めなければ「前回なし」と同じ扱い。
function readState(file) {
  try {
    if (!fs.existsSync(file)) return { dirs: {} };
    const v = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!v || typeof v !== 'object' || !v.dirs || typeof v.dirs !== 'object') return { dirs: {} };
    return v;
  } catch (e) { return { dirs: {} }; }
}

function writeState(file, state) {
  // 控えが残らなくても仕分けは出る。書けない場所でも CLI 自体は成功させる。
  try { fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8'); } catch (e) { /* noop */ }
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
  if (opts.help || opts.targets.length === 0) {
    (opts.help ? out : err)(USAGE);
    return opts.help ? 0 : 1;
  }

  let docs;
  try {
    docs = docsFrom(opts.targets);
  } catch (e) {
    err('対象が読めません: ' + opts.targets.join(', ') + ' — ' + e.message);
    return 1;
  }
  if (docs.length === 0) {
    err('対象の .puml が 1 枚もありません: ' + opts.targets.join(', '));
    return 1;
  }

  const rt = loadMA();
  const statePath = path.resolve(opts.state);
  const key = stateKey(opts.targets);
  const state = opts.useState ? readState(statePath) : { dirs: {} };
  const slot = state.dirs[key] || null;

  const result = pinReport.build(rt.MA, docs, slot ? slot.memo : {}, {
    all: opts.all,
    author: opts.author,
  });
  if (rt.errors.length) result.loadErrors = rt.errors;

  if (opts.useState) {
    state.dirs[key] = { at: result.generatedAt, memo: result.memo };
    writeState(statePath, state);
  }

  // memo は控えの中身であって観測結果ではない。JSON の読み手 (次の tick の
  // reviewer) が見るのは entries と summary なので、出力からは外す。
  const payload = Object.assign({}, result);
  delete payload.memo;

  const json = JSON.stringify(payload, null, 2);
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json, 'utf-8');
    out(path.resolve(opts.out));
  } else if (opts.json) {
    out(json);
  } else {
    out(pinReport.formatSummary(result, {
      from: opts.targets.join(', '),
      stateFile: opts.useState ? statePath : null,
      stateAt: slot ? slot.at : '',
    }));
  }
  if (rt.errors.length) {
    for (const e of rt.errors) err('読み込み失敗: ' + e.file + ' — ' + e.message);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, USAGE, STATE_FILE };
