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
const auditScope = require('../src/core/audit-scope');
const versionDiff = require('../src/core/version-diff');
// BLK-reviewer-20260914-1206-wish: 突合結果・前回の指摘文書・前回控えとの差分を
// 1 枚に束ねる。束ね方は GUI と共通 (src/core/review-board.js)。
const auditBoard = require('../src/core/audit-board');
const reviewBoard = require('../src/core/review-board');

// 前回比較用の控え。CLI を打つ場所 (リポジトリ直下) に置く。
const STATE_FILE = '.assist-audit-last.json';

// 壊れた控えで CLI を落とさない。読めなければ「前回なし」と同じ扱い。
function readReport(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const r = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return (r && r.audits) ? r : null;
  } catch (e) { return null; }
}

const USAGE = [
  '使い方: node tools/audit.js <ファイル|フォルダ> [...] [オプション]',
  '',
  '  --only a,b    回す監査を絞る (' + report.auditNames().join(', ') + ')',
  '  --cohort      ドメイン突合だけを要約で出す (= --only cohort --summary)。',
  '                フォルダを 2 つ以上渡すと、名前の先頭 1 段がそのフォルダ名になる',
  '  --summary     JSON ではなく人が読む要約を出す',
  '  --summary-json  要約だけを、どの run でも同じ形・同じ順の JSON で出す',
  '                (別名 --summary-only)。totalIssues が先頭付近に固定で出て、',
  '                回らなかった監査も status: skipped/error として必ず並ぶので、',
  '                大きい JSON を grep -n で探し直さずに済む',
  '  --out FILE    JSON をファイルに書く (標準出力にはパスだけ)',
  '  --since FILE  前回の監査 JSON と突き合わせ、増えた指摘・消えた指摘と、',
  '                実データ/テンプレ別のファイル内容の変化を要約に足す',
  '  --since-files DIR  前回の図フォルダ (控え) から指紋を採り直して内容変化を比べる。',
  '                     指紋を持たない古い JSON と比べる run でも 1 回で切り分けられる',
  '  --personas a,b (-p) ペルソナ名だけで保存フォルダを対象にする (長いパスを打たない)。',
  '                 根は PUA_PERSONA_DATA、既定はリポジトリの隣の persona-data',
  '  --pairs-max N 突合の差分行を N 組まで出す (既定 10、0 で全部)。',
  '  --versions    監査は回さず、保存フォルダの各図を `_versions/` の直前版と',
  '                突き合わせて差分を出す。上書きで中身が失われた図を名指しする',
  '  --versions-max N  --versions が 1 枚あたりに出す差分行を N 行まで (既定 6、0 で全部)',
  '  --board [MD]  突合結果・前回の指摘文書 (MD、既定は保存フォルダの 指摘.md)・',
  '                前回控えとの差分を 1 枚に束ねて出す。前回の指摘 1 件ごとに',
  '                解消/継続/新規を振り分け、継続には tick 数を数えて付ける',
  '  --no-state    前回比較用の控え (.assist-audit-last.json) を読み書きしない',
  '  --help        この説明',
].join('\n');

// BLK-reviewer-20260912-2206: 突合の対象は毎回 persona-data の 2 フォルダで、しかも
// フォルダごと渡すと `_vault` / `_versions` の控えを拾って偽の食い違いが出る
// (BLK-reviewer-20260909-0703)。reviewer はその回避として `.puml` を自分で glob し、
// 長いパスを 2 本打ち直していた。ペルソナ名だけで同じ対象になる口を用意する。
function personaRoot() {
  return process.env.PUA_PERSONA_DATA || path.resolve(__dirname, '..', '..', 'persona-data');
}

// フォルダのまま渡す。collectDocs は `_vault` / `_versions` に降りず、フォルダを
// 2 つ以上渡したときだけ名前の先頭 1 段をフォルダ名にする — 突合はその 1 段で
// 「どちらのペルソナの図か」を見るので、.puml を直に並べると (名前が basename だけに
// なり) フォルダをまたぐドメインが 0 件になる。ここは必ずフォルダを渡す。
function personaTargets(names) {
  const root = personaRoot();
  const out = [];
  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;
    const dir = path.join(root, name);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error('ペルソナの保存フォルダが見つかりません: ' + dir);
    }
    out.push(dir);
  }
  if (out.length === 0) throw new Error('--personas にペルソナ名を渡します (例: --personas junior,primary)');
  return out;
}

// 0 は「全部出す」。数でない値は黙って既定に落とさず、打ち直せるように落とす。
function _num(v, flag) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(flag + ' には 0 以上の数を渡します: ' + v);
  return n === 0 ? Infinity : n;
}

// --versions の行数上限。こちらは 0 を「全部」の合図としてそのまま下へ渡す
// (formatSummary が 0 を全部と読む)。
function _vnum(v, flag) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(flag + ' には 0 以上の数を渡します: ' + v);
  return n;
}

// 保存フォルダ 1 つ分の「いまの中身」と「直前の退避版」を読む。
// `_versions/` に降りるのはここだけで、判定は src/core/version-diff.js が持つ。
// 読めないファイルは「控えなし」と同じ扱いにする (1 枚のせいで全部を落とさない)。
function versionEntries(dir) {
  const vdir = path.join(dir, versionDiff.DIRNAME);
  let vfiles = [];
  try { vfiles = fs.readdirSync(vdir); } catch (e) { vfiles = []; }
  const latest = versionDiff.latestByName(vfiles);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => /\.puml$/i.test(f));
  } catch (e) {
    throw new Error('保存フォルダが読めません: ' + dir + ' — ' + e.message);
  }
  return names.sort().map((f) => {
    const stem = f.slice(0, -5);
    const pick = latest[stem] || null;
    let current = '';
    try { current = fs.readFileSync(path.join(dir, f), 'utf-8'); } catch (e) { current = ''; }
    let previous = null;
    if (pick) {
      try { previous = fs.readFileSync(path.join(vdir, pick.file), 'utf-8'); } catch (e) { previous = null; }
    }
    return { name: f, current, previous, stamp: pick ? pick.stamp : '' };
  });
}

// --versions の本体。監査モジュールを 1 つも読まないので、GUI が壊れていても
// 保存フォルダさえ読めれば動く (事故の直後に打つのはこの口)。
function runVersions(targets, max) {
  for (const dir of targets) {
    const rep = versionDiff.report(versionEntries(dir));
    console.log(path.resolve(dir));
    console.log(versionDiff.formatSummary(rep, max));
  }
  return 0;
}

// --board の指摘文書。名指しが無ければ最初の対象フォルダの `指摘.md` を見る
// (reviewer はそこに上書き保存しているので、既定で当たる)。
function findingsPath(opts) {
  if (opts.boardFile) return path.resolve(opts.boardFile);
  for (const t of opts.targets) {
    try {
      if (!fs.statSync(t).isDirectory()) continue;
    } catch (e) { continue; }
    const p = path.join(t, '指摘.md');
    if (fs.existsSync(p)) return p;
  }
  // 指摘文書を書くのは reviewer なので、見られる側 (primary / junior) の
  // フォルダには無い。書いた側のフォルダを既定の置き場として最後に見る。
  try {
    const p = path.join(personaRoot(), 'reviewer', '指摘.md');
    if (fs.existsSync(p)) return p;
  } catch (e) {}
  return null;
}

// 突合結果・前回の指摘文書・前回控えとの差分を 1 枚にする。
// 指摘文書が無ければ「前回の指摘なし」として今回の突合だけを出す
// (初回の run でも同じ 1 本のコマンドで済むようにする)。
function runBoard(result, opts, prev, fmtOpts) {
  const audits = result.audits || {};
  const b = auditBoard.build({
    audits: audits,
    svg: audits.svg && audits.svg.status === 'ok' ? audits.svg.result : null,
  });
  const fpath = findingsPath(opts);
  let md = '';
  if (fpath) {
    try { md = fs.readFileSync(fpath, 'utf-8'); } catch (e) { md = ''; }
  }
  const base = fmtOpts.prevFiles && fmtOpts.prevFiles.length
    ? fmtOpts.prevFiles
    : (prev && prev.files && prev.files.length ? prev.files : null);
  const fd = base ? auditScope.diffFiles(base, result.files) : null;
  const changed = fd && fd.contentComparable
    ? fd.changed.map((f) => f.name).concat(fd.added.map((f) => f.name))
    : [];

  const view = reviewBoard.build({ board: b, findings: md, changedFiles: changed });
  const lines = [reviewBoard.markdown(view, 'レビュー結果 — ' + opts.targets.join(' / '))];
  lines.push('前回の指摘文書: ' + (fpath || '(無し。今回の突合だけを出しています)'));
  lines.push('前回控えとの比較: ' + (base
    ? (fd && fd.contentComparable ? '内容まで比較' : '名前だけ比較 (前回に指紋が無い)')
    : '(控えが無いため比較なし)'));
  lines.push('今回の突合: ' + auditBoard.summaryLine(b));
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { targets: [], only: null, summary: false, summaryJson: false, out: null, help: false, since: null, sinceFiles: null, state: true, pairsMax: 0, personas: null, versions: false, versionsMax: 6, board: false, boardFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--summary') opts.summary = true;
    // BLK-reviewer-20260906-2043: 要約だけを固定の形で出す。--summary の人向け
    // テキストは目で読む用、こちらは jq / node -e から位置を探さずに読む用。
    else if (a === '--summary-json' || a === '--summary-only') opts.summaryJson = true;
    // BLK-reviewer-20260909-0703: 手順 4.7 は毎 tick これだけを打つ。
    // `--only cohort --summary` の 24 打鍵を 8 打鍵にする。
    else if (a === '--cohort') { opts.only = ['cohort']; opts.summary = true; }
    else if (a === '--only') opts.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.indexOf('--only=') === 0) opts.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--since') opts.since = argv[++i];
    else if (a.indexOf('--since=') === 0) opts.since = a.slice(8);
    else if (a === '--since-files') opts.sinceFiles = argv[++i];
    else if (a.indexOf('--since-files=') === 0) opts.sinceFiles = a.slice(14);
    // 手順 4 の突合は毎 tick これを打つので 1 文字の別名を持たせる (--cohort と同じ理由)。
    else if (a === '--personas' || a === '-p') opts.personas = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.indexOf('--personas=') === 0) opts.personas = a.slice(11).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--pairs-max') opts.pairsMax = _num(argv[++i], a);
    else if (a.indexOf('--pairs-max=') === 0) opts.pairsMax = _num(a.slice(12), '--pairs-max');
    else if (a === '--versions') opts.versions = true;
    else if (a === '--versions-max') opts.versionsMax = _vnum(argv[++i], a);
    else if (a.indexOf('--versions-max=') === 0) opts.versionsMax = _vnum(a.slice(15), '--versions-max');
    // --board は引数を任意で取る。次が別のオプションか対象パスのときは
    // 「既定の 指摘.md」の合図として食べない (ここで食べると対象が 1 つ消える)。
    else if (a === '--board') {
      opts.board = true;
      const next = argv[i + 1];
      if (next && next.indexOf('--') !== 0 && /\.(md|markdown)$/i.test(next)) opts.boardFile = argv[++i];
    }
    else if (a.indexOf('--board=') === 0) { opts.board = true; opts.boardFile = a.slice(8); }
    else if (a === '--no-state') opts.state = false;
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
  // ペルソナ名は対象の書き方の 1 つ。先に実パスへ開いてから、以降は
  // 今までどおりフォルダを渡されたのと同じ道を通す。
  if (opts.personas) {
    try {
      opts.targets = personaTargets(opts.personas).concat(opts.targets);
    } catch (e) {
      console.error(e.message);
      return 1;
    }
  }
  if (opts.help || opts.targets.length === 0) {
    console.log(USAGE);
    return opts.help ? 0 : 1;
  }

  // --versions は監査ではなく「保存フォルダの版の突き合わせ」なので、
  // 監査モジュールの読み込みより前にここで終える。
  if (opts.versions) {
    try {
      return runVersions(opts.targets, opts.versionsMax);
    } catch (e) {
      console.error(e.message);
      return 1;
    }
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

  // BLK-reviewer-20260907-2203: 件数表だけでは「同じ 5 件」の中身が入れ替わった
  // ことも、監査側にカテゴリが新設されたことも読めない。前回の控えを既定で
  // 読み書きし、--summary に差分を足す。--since で控え以外の JSON とも比べられる。
  const statePath = path.resolve(STATE_FILE);
  let prev = null;
  // BLK-reviewer-20260908-0203 (0723 追記): 指紋を載せる前に採った JSON と比べる run は
  // 「追えない」で終わり、その 1 回だけは 22 枚の手 diff に戻っていた。前回の図が
  // フォルダで残っているなら、そこから指紋を採り直して同じ 1 回で内容変化を出す。
  const fmtOpts = {};
  // --board も前回との比較を使う (前回控えから変わった図を同じ画面に並べる)。
  if (opts.summary || opts.board) {
    const from = opts.since ? path.resolve(opts.since) : (opts.state ? statePath : null);
    if (from) prev = readReport(from);
    if (opts.since && !prev) {
      console.error('前回の監査 JSON が読めません: ' + opts.since);
      return 1;
    }
    if (opts.pairsMax) fmtOpts.pairsMax = opts.pairsMax;
    if (opts.sinceFiles) {
      let prevDocs;
      try {
        prevDocs = report.collectDocs([opts.sinceFiles]);
      } catch (e) {
        console.error('前回の図フォルダが読めません: ' + opts.sinceFiles + ' — ' + e.message);
        return 1;
      }
      if (prevDocs.length === 0) {
        console.error('前回の図フォルダに .puml が 1 枚もありません: ' + opts.sinceFiles);
        return 1;
      }
      fmtOpts.prevFiles = auditScope.fileEntries(prevDocs);
      fmtOpts.prevFilesFrom = path.resolve(opts.sinceFiles);
    }
  } else if (opts.sinceFiles) {
    console.error('--since-files は --summary か --board と一緒に使います');
    return 1;
  }

  const json = JSON.stringify(result, null, 2);
  // BLK-reviewer-20260906-2043: --summary-json は「要約だけ」を返す口なので、
  // 標準出力へ出すのは要約に差し替える。--out は今までどおり全部の JSON を
  // 書く (控えとして残すのも、次回の --since で読むのも全部の JSON)。
  const viewJson = opts.summaryJson ? JSON.stringify(report.summaryView(result), null, 2) : null;
  // --board は「読む画面」なので、JSON の代わりに出す (--summary と併記は可)。
  if (opts.board) {
    if (opts.out) {
      fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
      fs.writeFileSync(opts.out, json, 'utf-8');
      console.log(path.resolve(opts.out));
    }
    console.log(runBoard(result, opts, prev, fmtOpts));
    if (opts.summary) console.log('\n' + report.formatSummary(result, prev, fmtOpts));
    // --summary-json と併記されたら、画面の後ろに要約 JSON も出す
    // (読む口と機械で読む口を 1 回の実行で両方取れるようにする)。
    if (viewJson) console.log('\n' + viewJson);
    if (opts.state) {
      try { fs.writeFileSync(statePath, json, 'utf-8'); } catch (e) {}
    }
    if (rt.errors.length) {
      for (const e of rt.errors) console.error('読み込み失敗: ' + e.file + ' — ' + e.message);
    }
    return 0;
  }
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json, 'utf-8');
    console.log(path.resolve(opts.out));
    if (viewJson) console.log(viewJson);
    if (opts.summary) console.log(report.formatSummary(result, prev, fmtOpts));
  } else if (viewJson) {
    console.log(viewJson);
    if (opts.summary) console.log(report.formatSummary(result, prev, fmtOpts));
  } else if (opts.summary) {
    console.log(report.formatSummary(result, prev, fmtOpts));
  } else {
    console.log(json);
  }
  // 次回の比較のために控えを置く。書けない場所でも監査自体は成功させる。
  if (opts.state) {
    try { fs.writeFileSync(statePath, json, 'utf-8'); } catch (e) {}
  }
  if (rt.errors.length) {
    for (const e of rt.errors) console.error('読み込み失敗: ' + e.file + ' — ' + e.message);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, USAGE };
