#!/usr/bin/env node
'use strict';

// blk-check.js — 完了した BLK が効いているかを、本文を読まずに確かめる入口。
//
//   node tools/blk-check.js <BLKフォルダ> [--hours N] [--persona P] [--all] [--run]
//                           [--folder DIR] [--prev DIR] [--no-state] [--json]
//
// BLK-reviewer-20260916-0426: 手順8 で、直前の tick に done になった BLK が実際に
// 効いているかを確かめるのに、100 行前後の実装ログを 1 件ずつ全文読み、本文の
// どこかに書かれたコマンドを目で拾って打ち直していた。DSL に変化が無い tick でも
// この確認は省けないので、同じ数件を毎 tick 読み直すことになる。
//
// ここは done の BLK を数行のカードに畳み (src/core/blk-digest.js)、--run を付け
// れば本文に書かれたコマンドをそのまま走らせて、「できるようになったこと」に
// 鉤括弧で書かれた語が出力に出るかまで見る。確認済みの id は控えに残るので、
// 次の tick は新しく done になった分だけが出る。
//
// 控えは BLK フォルダ側に置く (成果物リポジトリ直下を汚さない)。
// 終了コードは、走れば判定に関わらず 0 (観測の口。audit.js と同じ約束)。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const digest = require('../src/core/blk-digest');

const STATE_FILE = '.assist-blk-last.json';
const SPLIT_RE = /\r?\n/;

const USAGE = [
  'usage: node tools/blk-check.js <BLKフォルダ> [options]',
  '  --hours N        直近 N 時間に done になった分だけ (既定は全部)',
  '  --persona P      その persona の BLK だけ',
  '  --all            確認済みも含めて全部出す',
  '  --run            本文のコマンドを実行し、出力に効き目の語が出るか見る',
  '  --with-tests     unit/E2E を回し直すコマンドも実行する (既定は飛ばす)',
  '  --folder DIR     コマンド中の <保存フォルダ> 等に埋めるパス',
  '  --prev DIR       コマンド中の <控え> <prev> 等に埋めるパス',
  '  --status WORD    done 以外を見る (open / building / stuck)',
  '  --no-state       確認済みの控えを書かない',
  '  --json           機械可読で出す',
].join('\n');

function parseArgs(argv) {
  const opts = { dir: '', hours: 0, withTests: false, persona: '', all: false, run: false, state: true, json: false, status: 'done',
    folder: '', prev: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--run') opts.run = true;
    else if (a === '--with-tests') opts.withTests = true;
    else if (a === '--no-state') opts.state = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--hours') { i += 1; opts.hours = Number(argv[i]) || 0; }
    else if (a === '--persona') { i += 1; opts.persona = argv[i] || ''; }
    else if (a === '--folder') { i += 1; opts.folder = argv[i] || ''; }
    else if (a === '--prev') { i += 1; opts.prev = argv[i] || ''; }
    else if (a === '--status') { i += 1; opts.status = argv[i] || 'done'; }
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!opts.dir) opts.dir = a;
  }
  return opts;
}

function readState(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8'));
    return Array.isArray(raw.seen) ? raw.seen : [];
  } catch (e) { return []; }
}

function writeState(dir, seen) {
  try {
    fs.writeFileSync(path.join(dir, STATE_FILE),
      JSON.stringify({ seen: seen, at: new Date().toISOString() }, null, 1));
  } catch (e) { /* 控えが書けなくても観測は成立する */ }
}

function loadBlks(dir) {
  return fs.readdirSync(dir)
    .filter(function (n) { return /\.md$/.test(n) && /^BLK-/.test(n); })
    .map(function (n) {
      const text = fs.readFileSync(path.join(dir, n), 'utf8');
      const blk = digest.parse(text, { name: n.replace(/\.md$/, '') });
      blk.file = path.join(dir, n);
      try { blk.mtime = fs.statSync(blk.file).mtimeMs; } catch (e) { blk.mtime = 0; }
      return blk;
    });
}

function runCommand(cmd) {
  try {
    const out = execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8',
      timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: String((e && (e.stdout || '')) || '') + String((e && (e.stderr || '')) || ''),
      error: (e && e.message) || 'failed' };
  }
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.dir) { console.log(USAGE); return 0; }
  if (!fs.existsSync(opts.dir)) { console.error('BLK フォルダが無い: ' + opts.dir); return 1; }

  const seen = opts.all ? [] : readState(opts.dir);
  const all = loadBlks(opts.dir);
  const list = digest.pending(all, { seen: seen, all: opts.all, status: opts.status,
    hours: opts.hours, persona: opts.persona });
  const results = [];

  if (!list.length) {
    console.log('新しく ' + opts.status + ' になった BLK は無い (確認済み ' + seen.length + ' 件)。');
    return 0;
  }

  list.forEach(function (blk) {
    const rec = { id: blk.id, task: blk.task, merge: blk.merge, bodyLines: blk.bodyLines,
      runs: [], verdict: 'unread' };
    if (!opts.json) { digest.card(blk).forEach(function (l) { console.log(l); }); }
    if (opts.run) {
      let combined = '';
      let failed = false;
      let ran = 0;
      let elidedAll = [];
      blk.commands.forEach(function (cmd) {
        if (digest.isTestCommand(cmd) && !opts.withTests) {
          if (!opts.json) console.log('  → 検算のコマンドなので回さない: ' + cmd + ' (--with-tests で回す)');
          return;
        }
        const r = digest.resolveCommand(cmd, { folder: opts.folder, prev: opts.prev });
        if (!r.runnable) {
          const elided = r.elided || [];
          elidedAll = elidedAll.concat(elided);
          rec.runs.push({ command: cmd, skipped: r.missing, elided: elided });
          if (!opts.json && elided.length) {
            // 「…」は引数ではなく省略記法。実行すれば必ず失敗し、直っているものが
            // 「コマンドが失敗」に化けるので、実行せず書式の問題として言う。
            console.log('  → 本文の確認コマンドが省略記法のため実行せず: ' + elided.join(' ') +
              ' (確認コマンドは「…」を使わず実行できる形で書く)');
          }
          if (!opts.json && r.missing.length) {
            console.log('  → 未指定のため実行せず: ' + r.missing.join(' ') +
              ' (--folder / --prev で埋まる)');
          }
          return;
        }
        const run = runCommand(r.command);
        ran += 1;
        combined += '\n' + run.output;
        if (!run.ok) failed = true;
        rec.runs.push({ command: r.command, ok: run.ok });
        if (!opts.json) {
          console.log('  → 実行: ' + r.command + ' (' + (run.ok ? 'exit 0' : '失敗') + ')');
          // 失敗の一行目は、確認できなかった理由そのもの (フォルダが無い等)。
          const first = String(run.output || '').split(SPLIT_RE).filter(function (l) { return l.trim(); })[0];
          if (!run.ok && first) console.log('     理由: ' + first.trim());
        }
      });
      const check = digest.checkOutput(blk, combined, { failed: failed });
      rec.verdict = check.verdict;
      rec.hits = check.hits;
      if (!blk.commands.length) {
        rec.verdict = 'no-command';
        if (!opts.json) console.log('  → 本文にコマンドの記載が無い (画面の変更なら GUI で見る)');
      } else if (!ran && elidedAll.length) {
        // 1 つも走らなかったのは機能の所為ではない。書式を直せば確かめられる。
        rec.verdict = 'elided';
        rec.elided = elidedAll;
        if (!opts.json) {
          console.log('  ⇒ 確認コマンドが省略記法のため確認できず (機能不良ではない。' +
            'BLK の「確認コマンド:」を実行できる形に直せば確かめられる)');
        }
      } else if (!opts.json) {
        check.hits.forEach(function (h) {
          console.log('     ' + (h.ok ? '出た  ' : '出ない') + ': 「' + h.marker + '」');
        });
        console.log('  ⇒ ' + check.line);
      }
    }
    results.push(rec);
    if (!opts.json) console.log('');
  });

  if (opts.json) console.log(JSON.stringify({ blks: results }, null, 1));
  else console.log(list.length + ' 件を確認 (本文 ' +
    list.reduce(function (s, b) { return s + b.bodyLines; }, 0) + ' 行ぶんを畳んだ)。');

  if (opts.state && !opts.all) {
    writeState(opts.dir, seen.concat(list.map(function (b) { return b.id; })));
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main: main, parseArgs: parseArgs, STATE_FILE: STATE_FILE };
