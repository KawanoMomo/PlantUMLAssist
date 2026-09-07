#!/usr/bin/env node
'use strict';

// audit.js — 監査ロジックを DSL 一式に対して実行して JSON を返す公式の入口。
//
//   node tools/audit.js <ファイル|フォルダ> [...] [--only name,method] [--summary] [--out FILE]
//   npm run audit -- E:\01_Loop\persona-data
//
// 終了コードは、監査が回れば指摘の有無に関わらず 0 (指摘件数は JSON で読む)。
// 引数不正・対象なし・監査モジュールの読み込み失敗だけが 1。
// 「指摘があると落ちる」にしないのは、これが CI ゲートではなく観測の口だから。

const fs = require('fs');
const path = require('path');
const { loadMA } = require('./audit-runtime');
const report = require('./audit-report');

const USAGE = [
  '使い方: node tools/audit.js <ファイル|フォルダ> [...] [オプション]',
  '',
  '  --only a,b    回す監査を絞る (' + report.auditNames().join(', ') + ')',
  '  --summary     JSON ではなく人が読む要約を出す',
  '  --out FILE    JSON をファイルに書く (標準出力にはパスだけ)',
  '  --help        この説明',
].join('\n');

function parseArgs(argv) {
  const opts = { targets: [], only: null, summary: false, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--summary') opts.summary = true;
    else if (a === '--only') opts.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.indexOf('--only=') === 0) opts.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') opts.out = argv[++i];
    else if (a.indexOf('--out=') === 0) opts.out = a.slice(6);
    else if (a.indexOf('--') === 0) throw new Error('未知のオプション: ' + a);
    else opts.targets.push(a);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(e.message + '\n\n' + USAGE);
    return 1;
  }
  if (opts.help || opts.targets.length === 0) {
    console.log(USAGE);
    return opts.help ? 0 : 1;
  }

  const rt = loadMA();
  const docs = report.collectDocs(opts.targets);
  if (docs.length === 0) {
    console.error('対象の .puml が 1 枚もありません: ' + opts.targets.join(', '));
    return 1;
  }

  const result = report.buildReport(rt.MA, docs, { targets: opts.targets, only: opts.only });
  // 読み込みに失敗したモジュールは黙って落とさない。監査結果が「0 件」でも
  // それが「問題なし」なのか「見ていない」なのかを読む側が区別できるようにする。
  if (rt.errors.length) result.loadErrors = rt.errors;

  const json = JSON.stringify(result, null, 2);
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json, 'utf-8');
    console.log(path.resolve(opts.out));
    if (opts.summary) console.log(report.formatSummary(result));
  } else if (opts.summary) {
    console.log(report.formatSummary(result));
  } else {
    console.log(json);
  }
  if (rt.errors.length) {
    for (const e of rt.errors) console.error('読み込み失敗: ' + e.file + ' — ' + e.message);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, USAGE };
