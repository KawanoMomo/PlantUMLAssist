#!/usr/bin/env node
'use strict';

// dashboard.js — 整合状態を 1 枚の表にする入口。
//
//   node tools/dashboard.js <フォルダ|.puml> ... [--md [FILE]] [--json] [--all]
//   node tools/audit.js -p primary --dashboard        (同じ表)
//
// BLK-reviewer-20260915-0606-wish: 1 回の run で `audit.js --board` /
// `findings.js` / `pins.js --all` / `audit.js --names` / `audit.js --registry` /
// `POST /verify-svg` の 6 つを別々に叩き、結果を頭の中で突き合わせて指摘.md に
// まとめていた。CLI 同士が食い違う場合 (--board が「SVG 内容ずれ」と言い、
// verify-svg は体裁差だけと言う) も、別々の出力を目で見比べて初めて気づける。
//
// ここは 6 つの出口を 1 回で回し、図名を鍵に 1 行へ畳む (畳み方は GUI と共通の
// src/core/status-dashboard.js)。判定はやり直さない。食い違いは消さずに
// 同じ行の「気づき」列に残す。
//
// 控えは読むだけで書かない。表を見るために叩いた回が findings の tick を
// 増やしたり pins の見送り回数を進めたりすると、数字が「見た回数」で動く。
//
// 終了コードは、走れば指摘の有無に関わらず 0 (観測の口。audit.js と同じ約束)。

const fs = require('fs');
const path = require('path');
const { loadMA } = require('./audit-runtime');
const report = require('./audit-report');
const pinReport = require('./pin-report');
const findingsCli = require('./findings');
const pinsCli = require('./pins');
const tracker = require('../src/core/finding-tracker');
const nameRegistry = require('../src/core/name-registry');
const auditScope = require('../src/core/audit-scope');
const auditState = require('../src/core/audit-state');
const dashboard = require('../src/core/status-dashboard');

const AUDIT_STATE_FILE = '.assist-audit-last.json';

const USAGE = [
  '使い方: node tools/dashboard.js <フォルダ|.puml> ... [オプション]',
  '',
  '  --md [FILE]   指摘.md に貼れる表を出す (FILE を書けばそこへ書き出す)',
  '  --json        JSON を出す',
  '  --all         手を入れる必要が無い図も表に残す (既定でも表には出るが、',
  '                --json のときだけ actionable を別に持つ)',
  '  --state FILE  指摘トラッカーの控え (既定は対象フォルダの中)',
  '  --pins-state FILE  📌 の控え (既定 ' + pinsCli.STATE_FILE + ')',
  '  --audit-state FILE 前回控え (既定 ' + AUDIT_STATE_FILE + ')',
  '  --registry FILE    正式表記の登録簿 (既定は対象フォルダの親の _names.json)',
  '  --help        この説明',
  '',
  '列の意味:',
  '  指摘(未解消) — findings.js が追っている未解消の件数',
  '  📌           — pins.js の未解消 (未着手 + 着手)',
  '  SVG          — 一致 / 体裁差のみ / 内容ずれ / SVG 無 / 未刻印',
  '                 (体裁差のみは作り直し不要。verify-svg と同じ区別)',
  '  表記(要決定) — 登録簿に揃える先が無い表記揺れの組',
  '  前回控え     — 前回の監査控えから変わったか',
  '  気づき       — 出口同士が食い違っている箇所 (どちらかに寄せずに両方出す)',
].join('\n');

function parseArgs(argv) {
  const opts = { targets: [], md: false, mdFile: null, json: false, all: false,
                 state: null, pinsState: null, auditState: null, registry: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--md') {
      opts.md = true;
      const next = argv[i + 1];
      if (next && next.indexOf('--') !== 0 && /\.(md|markdown)$/i.test(next)) opts.mdFile = argv[++i];
    }
    else if (a.indexOf('--md=') === 0) { opts.md = true; opts.mdFile = a.slice(5); }
    else if (a === '--state') opts.state = argv[++i];
    else if (a.indexOf('--state=') === 0) opts.state = a.slice(8);
    else if (a === '--pins-state') opts.pinsState = argv[++i];
    else if (a.indexOf('--pins-state=') === 0) opts.pinsState = a.slice(13);
    else if (a === '--audit-state') opts.auditState = argv[++i];
    else if (a.indexOf('--audit-state=') === 0) opts.auditState = a.slice(14);
    else if (a === '--registry') opts.registry = argv[++i];
    else if (a.indexOf('--registry=') === 0) opts.registry = a.slice(11);
    else if (a.indexOf('--') === 0) throw new Error('未知のオプション: ' + a);
    else opts.targets.push(a);
  }
  return opts;
}

function _readJson(file, fallback) {
  try {
    if (!file || !fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { return fallback; }
}

// 指摘トラッカーの行。控えは読むだけ (書くと tick が「表を見た回数」で増える)。
// 控えが無い run でも、今回の監査だけで「今日の未解消」は出る。
function findingRows(audits, docs, MA, stateFile) {
  let store = tracker.emptyState();
  const raw = _readJson(stateFile, null);
  if (raw) {
    try { store = tracker.readState(raw); } catch (e) { store = tracker.emptyState(); }
  }
  const updated = tracker.update(store, {
    audits: findingsCli.markIntent(audits, docs, MA),
    label: 'dashboard', at: new Date().toISOString(),
  });
  return tracker.rows(updated);
}

// 📌 の行。控えは読むだけ (書くと見送り回数が進む)。
function pinRows(MA, docs, targets, stateFile) {
  const state = _readJson(stateFile, { dirs: {} });
  const key = (targets || []).map((t) => path.resolve(t)).sort().join(path.delimiter);
  const slot = (state && state.dirs && state.dirs[key]) || null;
  const res = pinReport.build(MA, docs, slot ? slot.memo : {}, { all: true });
  return res.entries;
}

// 「未解消」と数える 📌 の状況。仕分けの規則は pin-progress が持っているので、
// 名前を写さずにそこから引く (状況が増えた日に数え落とさない)。
function openPinStatuses(MA) {
  const PP = MA && MA.pinProgress;
  if (!PP || !PP.STATUS) return null;
  const out = {};
  Object.keys(PP.STATUS).forEach((k) => { if (PP.STATUS[k].open) out[k] = true; });
  return out;
}

// 表記揺れの要決定。登録簿の置き場は audit.js --registry と同じ規則。
function registryPending(MA, docs, targets, file) {
  const NA = MA && MA.nameAudit;
  if (!NA) return null;
  let p = file ? path.resolve(file) : null;
  if (!p) {
    for (const t of targets) {
      try {
        if (fs.statSync(t).isDirectory()) { p = path.join(path.dirname(path.resolve(t)), nameRegistry.FILENAME); break; }
      } catch (e) { /* 次の対象 */ }
    }
  }
  let reg = nameRegistry.empty();
  try { if (p && fs.existsSync(p)) reg = nameRegistry.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { /* 空の登録簿 */ }
  return { file: p, pending: nameRegistry.pending(reg, NA.variants(docs)), registry: reg };
}

// 前回控えとの差分。控えの対象が今回と違えば比べない (全枚が「変わった」に出る)。
function fileDiff(targets, files, stateFile) {
  const raw = _readJson(stateFile, null);
  if (!raw) return null;
  let store;
  try { store = auditState.readStore(JSON.stringify(raw)); } catch (e) { return null; }
  const entry = auditState.pick(store, targets);
  const prev = entry && entry.report ? entry.report : null;
  if (!prev || !prev.files || !prev.files.length) return null;
  return auditScope.diffFiles(prev.files, files);
}

// 対象一式から表を組み立てる。ファイルを読むのはここまでで、以降は純関数。
function build(targets, opts) {
  const o = opts || {};
  const rt = loadMA();
  const docs = report.collectDocs(targets);
  if (docs.length === 0) throw new Error('対象の .puml が 1 枚もありません: ' + targets.join(', '));

  const result = report.buildReport(rt.MA, docs, { targets: targets });
  const audits = result.audits || {};
  const svg = audits.svg && audits.svg.status === 'ok' ? audits.svg.result : null;

  const stateFile = path.resolve(o.state || findingsCli.defaultStateFile(targets));
  const pinsState = path.resolve(o.pinsState || pinsCli.STATE_FILE);
  const auditStateFile = path.resolve(o.auditState || AUDIT_STATE_FILE);
  const reg = registryPending(rt.MA, docs, targets, o.registry);

  const board = dashboard.build({
    docs: docs.map((d) => d.name),
    findings: findingRows(audits, docs, rt.MA, stateFile),
    pins: pinRows(rt.MA, docs, targets, pinsState),
    svg: svg,
    registry: reg,
    fileDiff: fileDiff(targets, result.files, auditStateFile),
    pinOpenStatuses: openPinStatuses(rt.MA),
  });
  return { board: board, sources: {
    findings: stateFile, pins: pinsState, audit: auditStateFile,
    registry: reg ? reg.file : null,
  } };
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

  let built;
  try {
    built = build(opts.targets, opts);
  } catch (e) {
    err('対象が読めません: ' + opts.targets.join(', ') + ' — ' + e.message);
    return 1;
  }
  const board = built.board;

  if (opts.md) {
    const md = dashboard.markdown(board, '整合ダッシュボード — ' + opts.targets.join(' / '));
    if (opts.mdFile) {
      const p = path.resolve(opts.mdFile);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, md, 'utf-8');
      out(p);
    } else out(md);
    return 0;
  }
  if (opts.json) {
    out(JSON.stringify({
      generatedAt: new Date().toISOString(),
      sources: built.sources,
      totals: board.totals,
      seen: board.seen,
      rows: board.rows,
      actionable: dashboard.actionable(board).map((r) => r.doc),
    }, null, 2));
    return 0;
  }
  out(dashboard.text(board, '整合ダッシュボード — ' + opts.targets.join(' / ')));
  out('控え: 指摘 ' + built.sources.findings + ' / 📌 ' + built.sources.pins
    + ' / 前回 ' + built.sources.audit
    + (built.sources.registry ? ' / 登録簿 ' + built.sources.registry : ''));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, build, USAGE };
