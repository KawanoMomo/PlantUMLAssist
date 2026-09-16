#!/usr/bin/env node
'use strict';

// replies.js — 指摘.md の各項目に primary が回答したかを、run ログから機械的に判定する。
//
//   node tools/replies.js [指摘.md] [--runs DIR] [--json] [--no-state]
//   npm run replies -- E:\01_Loop\persona-data\reviewer\指摘.md
//
// BLK-reviewer-20260916-0629-wish: audit.js --board は突合に出ない確認依頼を「解消」と
// 表示するため、未回答の依頼が埋もれていた。ここは監査を回さず、指摘の文面と
// `runs/{ts}/primary.md` だけで「回答済み / 未回答 (N tick 目) / 判定できない」を出す。
//
// 既定: 指摘.md は `{persona-data}\reviewer\指摘.md`、runs は persona-data の隣の `loop\runs`。
// 初出 run の控えは 指摘.md の隣の `.replies-state.json` に持ち越す (--no-state で読み書きしない)。
// 終了コードは走れば 0 (観測の口)。指摘.md や runs が見つからないときだけ 1。

const fs = require('fs');
const path = require('path');
const tracker = require('../src/core/reply-tracker');

const USAGE = [
  'usage: node tools/replies.js [指摘.md] [--runs DIR] [--json] [--no-state]',
  '  指摘.md     reviewer の指摘文書 (既定: ../persona-data/reviewer/指摘.md を上へ探す)',
  '  --runs DIR  run ログのフォルダ (runs/{ts}/primary.md, reviewer.md)。既定は persona-data の隣の loop/runs',
  '  --json      結果を JSON で出す',
  '  --no-state  初出 run の控え (.replies-state.json) を読み書きしない',
].join('\n');

function parseArgs(argv) {
  const o = { md: null, runs: null, json: false, state: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--no-state') o.state = false;
    else if (a === '--runs') o.runs = argv[++i];
    else if (!o.md) o.md = a;
  }
  return o;
}

function findDefaultMd(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, 'persona-data', 'reviewer', '指摘.md');
    if (fs.existsSync(cand)) return cand;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

function defaultRuns(md) {
  // {root}/persona-data/reviewer/指摘.md → {root}/loop/runs
  const root = path.dirname(path.dirname(path.dirname(path.resolve(md))));
  return path.join(root, 'loop', 'runs');
}

function readRuns(dir) {
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
  return fs.readdirSync(dir)
    .filter((n) => /^\d{8}-\d{4}$/.test(n))
    .map((ts) => ({
      ts,
      reviewer: read(path.join(dir, ts, 'reviewer.md')),
      primary: read(path.join(dir, ts, 'primary.md')),
    }))
    .filter((r) => r.reviewer != null || r.primary != null);
}

function main(argv, cwd) {
  const o = parseArgs(argv);
  if (o.help) return { code: 0, out: USAGE };
  const md = o.md ? path.resolve(cwd, o.md) : findDefaultMd(cwd);
  if (!md || !fs.existsSync(md)) return { code: 1, out: '指摘.md が見つかりません\n' + USAGE };
  const runsDir = o.runs ? path.resolve(cwd, o.runs) : defaultRuns(md);
  if (!fs.existsSync(runsDir)) return { code: 1, out: 'runs フォルダが見つかりません: ' + runsDir + '\n' + USAGE };
  const stateFile = path.join(path.dirname(md), '.replies-state.json');
  let state = {};
  if (o.state) {
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {}; } catch (e) { state = {}; }
  }
  const results = tracker.judgeAll(fs.readFileSync(md, 'utf8'), readRuns(runsDir), state);
  if (o.state) {
    try { fs.writeFileSync(stateFile, JSON.stringify(tracker.nextState(results, state), null, 2)); } catch (e) {}
  }
  const out = o.json ? JSON.stringify({ md, runs: runsDir, results }, null, 2) : tracker.format(results);
  return { code: 0, out };
}

if (require.main === module) {
  const r = main(process.argv.slice(2), process.cwd());
  process.stdout.write(r.out + '\n');
  process.exitCode = r.code;
}

module.exports = { main, parseArgs, readRuns, defaultRuns };
