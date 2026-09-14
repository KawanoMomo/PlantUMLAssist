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
//
// BLK-reviewer-20260915-0206-wish: 読む口はあっても書く口が画面にしか無く、
// ブラウザを開かない reviewer は指摘を `指摘.md` に「[図名] 行N 内容」と
// 書き写すしかなかった。--add は同じ CLI から指摘を図そのものに貼る。
// 貼り先は行番号ではなく対象の名前 (participant / class / state) で指定する。
//
//   node tools/pins.js dma_state.puml --add "対応する method が無い" --on Timer_StartConv

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
  '        node tools/pins.js <ファイル.puml> --add 内容 --on 対象の名前 [オプション]',
  '',
  '  --add 内容    指摘を 1 件、その図に貼る (書き込み)',
  '  --on 名前     貼る相手。participant / class / state などの名前 (行番号は要らない)',
  '  --as 名前     指摘した人 (既定 reviewer)',
  '  --at 日時     指摘の日時 (既定 いまの時刻)',
  '  --line N      --on の名前が何度も出る図で、貼る行を選び直す',
  '  --dry-run     貼らずに、貼り先だけ出す',
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
  const opts = {
    targets: [], json: false, all: false, author: null, out: null,
    state: STATE_FILE, useState: true, help: false,
    add: null, on: null, as: null, at: null, line: 0, dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--add') opts.add = argv[++i];
    else if (a.indexOf('--add=') === 0) opts.add = a.slice(6);
    else if (a === '--on') opts.on = argv[++i];
    else if (a.indexOf('--on=') === 0) opts.on = a.slice(5);
    else if (a === '--as') opts.as = argv[++i];
    else if (a.indexOf('--as=') === 0) opts.as = a.slice(5);
    else if (a === '--at') opts.at = argv[++i];
    else if (a.indexOf('--at=') === 0) opts.at = a.slice(5);
    else if (a === '--line') opts.line = parseInt(argv[++i], 10) || 0;
    else if (a.indexOf('--line=') === 0) opts.line = parseInt(a.slice(7), 10) || 0;
    else if (a === '--dry-run') opts.dryRun = true;
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

// 指摘の日時。画面が書くのと同じ「分まで」の形 (秒は指摘の同定に効かない)。
function nowStamp(d) {
  return (d || new Date()).toISOString().slice(0, 16);
}

// --add: 指摘を 1 件、対象の名前を頼りに図へ貼る。
// 対象は .puml 1 枚だけ。フォルダを許すと「どの図に貼ったのか」が
// 打った側から見えなくなる (読む側の --json と違い、こちらは書き込み)。
function runAdd(opts, io) {
  const out = (io && io.out) || console.log;
  const err = (io && io.err) || console.error;

  if (opts.targets.length !== 1) {
    err('--add は図 1 枚を指定してください: node tools/pins.js <ファイル.puml> --add 内容 --on 名前');
    return 1;
  }
  if (!opts.on) {
    err('--on がありません。指摘を貼る相手 (participant / class / state の名前) を指定してください');
    return 1;
  }
  if (!String(opts.add).trim()) {
    err('--add の内容が空です');
    return 1;
  }
  const file = path.resolve(opts.targets[0]);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    err('図が読めません: ' + file);
    return 1;
  }

  const rt = loadMA();
  const PP = rt.MA.pinPlace;
  if (!PP) {
    err('pin-place が読めません (src/core/pin-place.js)');
    for (const e of rt.errors) err('読み込み失敗: ' + e.file + ' — ' + e.message);
    return 1;
  }

  const dsl = fs.readFileSync(file, 'utf-8');
  const res = PP.place(dsl, {
    name: opts.on,
    text: String(opts.add).trim(),
    author: opts.as || 'reviewer',
    at: opts.at || nowStamp(),
    line: opts.line,
  });

  if (!res.ok) {
    err(PP.reasonText(res.reason, opts.on));
    const cands = (res.resolved && res.resolved.candidates) || [];
    if (cands.length) {
      err('その名前が出てくる行:');
      for (const c of cands) err('  --line ' + c.line + '  (' + c.label + ') ' + c.text);
    }
    return 1;
  }

  if (!opts.dryRun) fs.writeFileSync(file, res.dsl, 'utf-8');

  const r = res.resolved;
  const head = opts.dryRun ? '貼り先 (--dry-run なので書いていない)' : '指摘 #' + res.pin.id + ' を貼った';
  out(head + ': ' + path.basename(file) + ' ' + PP.describe(r));
  out('  内容: ' + res.pin.text);
  if (r.ambiguous) {
    out('  ※ 同じ近さの行が他にもある。貼り直すなら --line で選ぶ:');
    for (const c of r.candidates) {
      if (c.line === r.line) continue;
      out('    --line ' + c.line + '  (' + c.label + ') ' + c.text);
    }
  }
  return 0;
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

  if (opts.add != null) return runAdd(opts, io);

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
module.exports = { main, parseArgs, runAdd, nowStamp, USAGE, STATE_FILE };
