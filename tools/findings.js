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

// 控えの名前。置き場所は既定では「監査した対象フォルダの中」。
//
// BLK-reviewer-20260915-0007: 控えを CLI を打つ場所 (リポジトリ直下) に置くと、
// (a) 対象フォルダが違っても同じ 1 枚を読み書きするので、別のペルソナを見た回の
// 指摘が混ざる。(b) 成果物リポジトリの直下に作業データが残る。
// 対象がフォルダ 1 つなら、その中に置く (見ている物と控えが 1 対 1 になる)。
const STATE_NAME = '.findings-state.json';
const STATE_FILE = '.assist-findings-state.json';   // フォルダを特定できないときの置き場

// 既定の控えの場所。フォルダ 1 つを見ているならその中、それ以外は打った場所。
function defaultStateFile(targets) {
  const dirs = (targets || []).filter((t) => {
    try { return fs.statSync(t).isDirectory(); } catch (e) { return false; }
  });
  if (dirs.length === 1) return path.join(dirs[0], STATE_NAME);
  return STATE_FILE;
}

// 対象のうちフォルダだけを絶対パスで。控えの「どこを見た記録か」はこれで残す。
function targetDirs(targets) {
  return (targets || []).filter((t) => {
    try { return fs.statSync(t).isDirectory(); } catch (e) { return false; }
  }).map((t) => path.resolve(t));
}

// BLK-reviewer-20260917-0223: `.findings-state.json` は persona ごとに同じ名前で
// 存在するので、`--state` に別の persona の控えを渡しても文法エラーにならず、
// 「その persona の分だけが出る」結果が黙って返る。控えが記録している対象と
// 今回の対象を突き合わせ、食い違えば名指しで言う。対象を出さない読み出し
// (--sections など) でも、控えがどこを見た記録かを必ず 1 行で見せる。
function stateNotes(statePath, store, targets) {
  const notes = [];
  const dirs = targetDirs(targets);
  const chk = tracker.originCheck(store, dirs);
  if (!chk.ok) {
    notes.push('警告: 控えと今回の対象が違います。控えの置き場所 (--state) を確かめてください。');
    notes.push('  控えが見た対象: ' + chk.origin.join(' / '));
    notes.push('  今回の対象    : ' + chk.targets.join(' / '));
  }
  if (dirs.length === 1) {
    const def = path.resolve(defaultStateFile(targets));
    if (path.resolve(statePath) !== def) {
      notes.push('注意: 対象フォルダの中の控えではなく ' + statePath + ' を読み書きしています'
        + ' (既定は ' + def + ')。');
    }
  }
  return notes;
}

// 控えが「どの対象を見た記録か」。対象を渡さない読み出しでも取り違えに気付けるようにする。
function originLine(store) {
  const org = tracker.originOf(store);
  return org.length ? '  この控えが見た対象: ' + org.join(' / ') : '';
}

const USAGE = [
  '使い方: node tools/findings.js <フォルダ|.puml|監査JSON> ... [オプション]',
  '',
  '  --tick ラベル  この回の名前 (既定は現在時刻。同じラベルで 2 度叩いても tick は増えない)',
  '  --set ID=状態  指摘 1 行の判断を貼り替える (状態: partial / resolved / wontfix / open)',
  '  --note 文言    --set に添える覚え書き (「svg 再エクスポートのみ継続」等)',
  '  --all          解消・対象外の行も出す (既定は未解消のみ)',
  '  --undeclared   図に意図の明記が無い指摘だけ出す (まだ答えが返っていないもの)',
  '  --declared     意図明記済み (@omit-method タグ / note) の指摘だけ出す',
  '  --json         JSON を出す',
  '  --md [FILE]    指摘.md に貼れる表を出す (FILE を書けばそこへ書き出す)',
  '  --sections     指摘.md に貼れる `## ID 見出し` を 1 件 1 節で出す',
  '  --state FILE   控えの置き場所を変える (既定は対象フォルダの中の ' + STATE_NAME + '。',
  '                 persona ごとに同名の控えがあるので、渡した控えが別の対象の記録なら警告を出す)',
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
  '意図の意味 (図の側に「意図して省略する」と書いてあるか):',
  '  意図明記済み(タグ) — `\'@omit-method Cls.Method 理由` が図にある',
  '  意図明記済み(note) — note の自由文が意図的な省略/割愛としてその名前を挙げている',
  '  未対応             — 図に何も書かれていない',
  '',
  '判断を貼った行 (部分解消 / 解消 / 対象外) は、以後の監査の出欠で上書きしない。',
  '監査がカテゴリを移しただけの回に「再発」へ戻るのを防ぐため。--set ID=open で剥がす。',
].join('\n');

function parseArgs(argv) {
  const opts = { targets: [], tick: null, set: null, note: null, all: false, json: false,
                 md: false, mdFile: null, sections: false, state: null, useState: true, help: false,
                 intent: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--undeclared') opts.intent = 'undeclared';
    else if (a === '--declared') opts.intent = 'declared';
    else if (a === '--json') opts.json = true;
    else if (a === '--sections') opts.sections = true;
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
// 読み飛ばした残骸のフォルダ名 (auditsFrom が埋め、main が読み上げる)。
const skippedDirs = [];

function auditsFrom(targets) {
  const json = targets.filter((t) => /\.json$/i.test(t));
  if (json.length) {
    if (json.length !== targets.length) throw new Error('監査JSON と図は混ぜて指定できません');
    const v = JSON.parse(fs.readFileSync(path.resolve(json[0]), 'utf-8'));
    // audit.js --out は全体の報告書を書く。監査そのものは中の audits。
    // JSON からは図の本文が読めないので、意図の仕分けは付かない (印は空のまま)。
    return { audits: (v && v.audits) || v, docs: [] };
  }
  const rt = loadMA();
  const docs = report.collectDocs(targets, { skipped: skippedDirs });
  if (docs.length === 0) throw new Error('対象の .puml が 1 枚もありません: ' + targets.join(', '));
  return { audits: report.buildReport(rt.MA, docs, { targets: targets }).audits, docs: docs, MA: rt.MA };
}

// BLK-reviewer-20260915-0307-wish: 同じ「宣言の無い呼び出し」でも、図の側に
// 「意図して省略する」と書いてあるものと、まだ何も答えていないものがある。
// その区別は監査のカテゴリには出ず、reviewer は puml の note を人力で読み直して
// 指摘.md に手書きの表を作っていた。ここで図から意図の宣言 (`@omit-method`
// タグと note の自由文) を読み、指摘 1 件ずつに印を付ける。
function markIntent(audits, docs, MA) {
  const OM = (MA && MA.omitMethod) || null;
  if (!OM || !docs.length) return audits;
  return OM.annotateAudits(audits, OM.collect(docs, { notes: true }));
}

// `F-03=partial` / `F-03:partial` / `F-03 partial` のどれでも受ける。
function parseSet(text) {
  const m = String(text || '').match(/^\s*([^\s=:]+)\s*[=:\s]\s*([a-z]+)\s*$/i);
  if (!m) return null;
  return { id: m[1], state: m[2].toLowerCase() };
}

// 意図の明記で絞る。--all と違い、これは「未解消のうち、どちらを見るか」。
function filterIntent(list, intent) {
  if (intent === 'declared') return list.filter((r) => r.declared);
  if (intent === 'undeclared') return list.filter((r) => !r.declared);
  return list;
}

function formatSummary(list, ctx) {
  const lines = [];
  lines.push('指摘トラッカー: ' + ctx.stateFile);
  if (ctx.origin) lines.push(ctx.origin);
  lines.push('  ' + tracker.summaryText(list));
  const isum = tracker.intentSummaryText(list);
  if (isum) lines.push('  ' + isum);
  if (ctx.tick) lines.push('  この回: ' + ctx.tick);
  if (ctx.ticks) lines.push('  記録した tick: ' + ctx.ticks);
  lines.push('');
  const base = ctx.all ? list : list.filter((r) => r.open);
  const shown = filterIntent(base, ctx.intent);
  if (shown.length === 0) {
    lines.push('  出ている指摘はありません。');
  } else {
    shown.forEach((r) => lines.push('  ' + tracker.rowText(r)));
  }
  if (base.length !== shown.length) {
    lines.push('');
    lines.push('  （意図の明記で ' + (base.length - shown.length) + ' 件を伏せています）');
  }
  if (!ctx.all && list.length !== base.length) {
    lines.push('');
    lines.push('  （解消・対象外 ' + (list.length - base.length) + ' 件は --all で出ます）');
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
  // --sections は控えを読むだけの口。監査を回さずに ID 台帳を貼り出せる
  // (reviewer は手順7で「今の台帳を 指摘.md に写す」だけのことが多い)。
  if (opts.help || (!opts.targets.length && !opts.set && !opts.sections)) {
    (opts.help ? out : err)(USAGE);
    return opts.help ? 0 : 1;
  }

  const statePath = path.resolve(opts.state || defaultStateFile(opts.targets));
  let store = opts.useState ? readState(statePath) : tracker.emptyState();
  // 控えに残っている「事故で出来た名前の図」だけの行を、読んだ時点で一度落とす
  // (読み飛ばすようにしても、既に入った行は黙って残り続けるため)。
  const pruned = tracker.pruneBroken(store);
  store = pruned.state;
  if (pruned.dropped.length) {
    out('壊れた控えを ' + pruned.dropped.length + ' 件落としました'
      + ' (シェルの事故で出来たフォルダ名だけを指していた行): '
      + pruned.dropped.map((d) => d.id + ' ' + d.title).join(', '));
  }

  // 控えの取り違えは黙って「薄い結果」に化けるので、仕分けの前に言う。
  stateNotes(statePath, store, opts.targets).forEach((n) => err(n));
  // 食い違ったまま書き込むと控えの出所が今回の対象で塗り潰され、次の回から
  // 警告が出なくなる。取り違えた回は出所の記録に触らない (警告は残り続ける)。
  const originOk = tracker.originCheck(store, targetDirs(opts.targets)).ok;
  // 対象を渡さない読み出し (--sections / --md / --set) は控えの中身しか出ないので、
  // どの控えを見ているかを stdout の貼り付け内容を汚さずに添える。
  // (古い控えには見た対象の記録が無いので、置き場所そのものは必ず言う。
  //  persona 名はパスに出るため、それだけでも取り違えに気付ける。)
  if (!opts.targets.length) {
    err('指摘トラッカー: ' + statePath);
    const ol = originLine(store);
    if (ol) err(ol);
  }

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
    let built;
    try {
      built = auditsFrom(opts.targets);
    } catch (e) {
      err('対象が読めません: ' + opts.targets.join(', ') + ' — ' + e.message);
      return 1;
    }
    store = tracker.update(store, {
      audits: markIntent(built.audits, built.docs, built.MA),
      label: opts.tick, at: new Date().toISOString(),
      origin: originOk ? targetDirs(opts.targets) : [],
    });
    // 読み飛ばした残骸は名指しで言う (黙って落とすと「図が減った」と読める)。
    if (skippedDirs.length) {
      out('読み飛ばしたフォルダ ' + skippedDirs.length + ' 件'
        + ' (シェルの事故で出来た名前。中身は写しなので消してよい): '
        + skippedDirs.join(' / '));
    }
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
  // 指摘.md の見出しに ID を載せる口。replies.js は `## ` 見出し 1 つを 1 項目として
  // 読むので、表 (--md) ではなくこちらを貼ると全カテゴリが回答の突合に乗る。
  if (opts.sections) {
    out(tracker.sections(store, { all: opts.all }));
    return 0;
  }
  if (opts.json) {
    out(JSON.stringify({
      generatedAt: new Date().toISOString(),
      state: statePath,
      origin: tracker.originOf(store),
      ticks: store.ticks,
      summary: tracker.summaryText(list),
      intentSummary: tracker.intentSummaryText(list),
      findings: filterIntent(list, opts.intent),
    }, null, 2));
    return 0;
  }
  out(formatSummary(list, {
    stateFile: statePath, origin: originLine(store), all: opts.all, tick: opts.tick, intent: opts.intent,
    ticks: store.ticks.map((t) => t.label).join(' → '),
  }));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, parseSet, USAGE, STATE_FILE, STATE_NAME, defaultStateFile,
                   formatSummary, filterIntent, markIntent, targetDirs, stateNotes, originLine };
