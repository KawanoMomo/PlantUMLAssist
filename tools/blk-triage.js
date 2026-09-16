#!/usr/bin/env node
'use strict';

// blk-triage.js — BLK を起票する前に、同種カテゴリの件数と類似の過去 BLK を先に見る。
//
//   node tools/blk-triage.js <BLKフォルダ> --text "詰まった内容" [--kind friction]
//   node tools/blk-triage.js <BLKフォルダ> --file draft.md
//   node tools/blk-triage.js <BLKフォルダ> --id BLK-reviewer-...-friction   (起票済みを見直す)
//
// BLK-reviewer-20260917-0223: 起票してよいか (同じ操作種別の friction が open/done に
// 3 件以上あるか、過去の BLK と同じ現象か) を毎回 grep で目で数えていた。
// ここは下書きを corpus に突き合わせ、カテゴリ・件数・しきい値への到達・類似候補を
// 1 コマンドで出し、「新規起票してよい」「追記せよ」まで言い切る。
//
// 終了コードは走れば判定に関わらず 0 (観測の口。audit.js / blk-check.js と同じ約束)。

const fs = require('fs');
const path = require('path');
const triage = require('../src/core/blk-triage');

const USAGE = [
  'usage: node tools/blk-triage.js <BLKフォルダ> (--text T | --file F | --id ID) [options]',
  '  --text T         起票しようとしている本文',
  '  --file F         本文をファイルから読む (- で標準入力)',
  '  --id ID          既に起票した BLK の id を下書きとして使う (自分は corpus から外す)',
  '  --kind K         friction / wish / blocked (既定 friction)',
  '  --threshold N    同カテゴリ件数のしきい値 (既定 3)',
  '  --top N          類似候補の件数 (既定 5)',
  '  --same S         同一現象と言い切る類似度 (既定 0.45)',
  '  --json           機械可読で出す',
].join('\n');

function parseArgs(argv) {
  const opts = { dir: '', text: '', file: '', id: '', kind: '', threshold: 0, top: 0, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--text') { i += 1; opts.text = argv[i] || ''; }
    else if (a === '--file') { i += 1; opts.file = argv[i] || ''; }
    else if (a === '--id') { i += 1; opts.id = argv[i] || ''; }
    else if (a === '--kind') { i += 1; opts.kind = argv[i] || ''; }
    else if (a === '--threshold') { i += 1; opts.threshold = Number(argv[i]) || 0; }
    else if (a === '--top') { i += 1; opts.top = Number(argv[i]) || 0; }
    else if (a === '--same') { i += 1; opts.same = Number(argv[i]) || 0; }
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!opts.dir) opts.dir = a;
  }
  return opts;
}

function readDir(dir) {
  return fs.readdirSync(dir)
    .filter(function (n) { return /\.md$/.test(n) && /^BLK/i.test(n); })
    .map(function (n) {
      const full = path.join(dir, n);
      let text = '';
      try { text = fs.readFileSync(full, 'utf8'); } catch (e) { return null; }
      return triage.parse(text, { name: n.replace(/\.md$/, '') });
    })
    .filter(Boolean);
}

function readDraft(opts, blks) {
  if (opts.text) return { text: opts.text, kind: opts.kind || 'friction', id: '' };
  if (opts.file) {
    const raw = opts.file === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(opts.file, 'utf8');
    const parsed = triage.parse(raw, { name: 'draft' });
    // frontmatter 付きの下書きなら種別はそこから取る (--kind が優先)。
    return { text: parsed.text.trim() ? parsed.text : raw, kind: opts.kind || parsed.kindName, id: '' };
  }
  if (opts.id) {
    const hit = blks.filter(function (b) { return b.id === opts.id; })[0];
    if (!hit) return null;
    return { text: hit.text, kind: opts.kind || hit.kindName, id: hit.id };
  }
  return null;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.dir) { console.log(USAGE); return 0; }
  if (!fs.existsSync(opts.dir)) {
    console.log('BLK フォルダが無い: ' + opts.dir);
    return 0;
  }
  const blks = readDir(opts.dir);
  const draft = readDraft(opts, blks);
  if (!draft) {
    console.log(opts.id ? ('その id の BLK が無い: ' + opts.id) : USAGE);
    return 0;
  }
  const result = triage.triage(draft, blks, { threshold: opts.threshold, top: opts.top, sameThreshold: opts.same });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 1));
    return 0;
  }
  console.log('BLK ' + blks.length + ' 件と突き合わせた (' + opts.dir + ')');
  console.log('');
  triage.report(result).forEach(function (line) { console.log(line); });
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main: main, parseArgs: parseArgs };
