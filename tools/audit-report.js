'use strict';

// audit-report — .puml を集めて監査を回し、JSON 1 個にまとめる。
//
// 監査モジュールの API はどれも docs = [{ name, dsl }] を受ける。ここが
// 「ファイルを読む」と「監査を呼ぶ」の間に立つ唯一の層で、呼ぶ側 (CLI・テスト)
// はモジュール名も依存も知らなくてよい。あるモジュールが欠けていても
// その項目を skipped にするだけで、残りの監査は結果を返す。

const fs = require('fs');
const path = require('path');
// BLK-reviewer-20260907-2203: 件数表だけでは「同じ 5 件」の中身が入れ替わった
// ことも、カテゴリが新設されたことも読めない。前回の JSON との差分を要約に足す。
const auditDiff = require('./audit-diff');

// ディレクトリなら再帰して .puml を集める。ファイルならそれ 1 枚。
// name は入力ルートからの相対パスにする (同名 basename が別フォルダにあっても
// 突合結果の doc 名で区別できるようにするため)。
function collectDocs(targets, options) {
  const opts = options || {};
  const exts = opts.extensions || ['.puml', '.pu', '.plantuml'];
  const docs = [];
  const seen = {};

  function pushFile(filePath, name) {
    const key = path.resolve(filePath);
    if (seen[key]) return;
    seen[key] = true;
    docs.push({ name: name.replace(/\\/g, '/'), dsl: fs.readFileSync(filePath, 'utf-8'), path: key });
  }

  function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else if (exts.indexOf(path.extname(entry.name).toLowerCase()) >= 0) {
        pushFile(full, path.relative(base, full));
      }
    }
  }

  for (const t of (Array.isArray(targets) ? targets : [targets])) {
    if (!fs.existsSync(t)) throw new Error('見つかりません: ' + t);
    if (fs.statSync(t).isDirectory()) walk(t, t);
    else pushFile(t, path.basename(t));
  }

  docs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return docs;
}

// 監査 1 種を安全に呼ぶ。モジュールが無ければ skipped、投げたら error。
// 監査が 1 つ壊れても他の結果を読めるようにする (reviewer が原因調査で
// 止まらないことがこの CLI の目的なので、全滅させない)。
function runOne(name, fn) {
  try {
    const value = fn();
    if (value === undefined) return { status: 'skipped', reason: 'モジュールがありません' };
    return { status: 'ok', result: value };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

const AUDITS = {
  name: (MA, docs) => (MA.nameAudit ? MA.nameAudit.audit(docs) : undefined),
  method: (MA, docs) => (MA.methodAudit ? MA.methodAudit.audit(docs) : undefined),
  consistency: (MA, docs) => (MA.consistency ? MA.consistency.check(docs) : undefined),
  family: (MA, docs) => (MA.familyAudit ? MA.familyAudit.audit(docs) : undefined),
  // BLK-reviewer-20260907-1903-wish: 状態遷移 → シーケンスの片方向だけを見る。
  // family は両方向の食い違いを出すので、「シーケンスに書き漏らした遷移」は
  // その中から目視で拾うしかなかった。
  trace: (MA, docs) => (MA.traceCoverage ? MA.traceCoverage.audit(docs) : undefined),
};

function auditNames() { return Object.keys(AUDITS); }

// only を渡すとその監査だけ回す。
function runAudits(MA, docs, only) {
  const wanted = (only && only.length) ? only : auditNames();
  const audits = {};
  for (const key of wanted) {
    if (!AUDITS[key]) { audits[key] = { status: 'error', message: '未知の監査: ' + key }; continue; }
    audits[key] = runOne(key, () => AUDITS[key](MA, docs));
  }
  return audits;
}

// 件数だけの要約。CI や「直ったか」の確認はここだけ読めば済む。
function summarize(audits) {
  const s = {};
  const n = audits.name;
  if (n && n.status === 'ok') s.name = { variants: n.result.variants.length, undeclared: n.result.undeclared.length, clean: !!n.result.clean };
  const m = audits.method;
  if (m && m.status === 'ok') s.method = { issues: (m.result.issues || []).length };
  const c = audits.consistency;
  if (c && c.status === 'ok') {
    s.consistency = {
      naming: c.result.naming.length, unused: c.result.unused.length, methods: c.result.methods.length,
      // 呼び出しへの応答として突合から外した件数。0 件が「見ていない」ではないと分かるように出す。
      methodReplies: (c.result.methodReplies || []).length,
      granularity: c.result.granularity.length, events: c.result.events.length, count: c.result.count,
    };
  }
  const f = audits.family;
  if (f && f.status === 'ok') {
    s.family = {
      families: f.result.length,
      mismatched: f.result.filter((g) => (g.mismatches || []).length > 0).length,
      // BLK-reviewer-20260907-1803: 粒度が違うとして突き合わせなかった組数。
      // 何を見ていないかが読めないと「0 件 = 揃っている」と読み違える。
      skippedPairs: f.result.reduce((n, g) => n + ((g.skipped || []).length), 0),
    };
  }
  const t = audits.trace;
  if (t && t.status === 'ok') {
    s.trace = {
      families: t.result.length,
      transitions: t.result.reduce((n, g) => n + g.rows.length, 0),
      missing: t.result.reduce((n, g) => n + g.missing.length, 0),
      partial: t.result.reduce((n, g) => n + g.partial.length, 0),
      // 突き合わせられなかった系統。0 件を「漏れなし」と読み違えないように、
      // 見ていない系統数を別に出す。シーケンス図が無い系統と、シーケンス図は
      // あるが粒度が違うとして外した系統 (BLK-reviewer-20260907-2003) は
      // 直し方が違うので分けて数える。
      unmatchable: t.result.filter((g) => !g.comparable).length,
      noSequence: t.result.filter((g) => !g.comparable && g.seqDocs.length === 0).length,
      grainSkipped: t.result.filter((g) => (g.grainSkipped || []).length > 0).length,
      outOfScope: t.result.reduce((n, g) => n + (g.outOfScope || []).length, 0),
    };
  }
  return s;
}

function totalIssues(summary) {
  let t = 0;
  if (summary.name) t += summary.name.variants + summary.name.undeclared;
  if (summary.method) t += summary.method.issues;
  if (summary.consistency) t += summary.consistency.count;
  if (summary.family) t += summary.family.mismatched;
  if (summary.trace) t += summary.trace.missing;
  return t;
}

// 人が読む 1 行ずつの要約。--summary のときだけ使う。
function formatSummary(report, prev) {
  const lines = [`図 ${report.docs.length} 枚 (${report.targets.join(', ')})`];
  const s = report.summary;
  if (s.name) lines.push(`名前突合: 表記揺れ ${s.name.variants} 組 / 宣言なし ${s.name.undeclared} 件`);
  if (s.method) lines.push(`メソッド突合: 指摘 ${s.method.issues} 件`);
  if (s.consistency) lines.push(`整合: 命名 ${s.consistency.naming} / 未使用 ${s.consistency.unused} / メソッド ${s.consistency.methods}`
    + (s.consistency.methodReplies ? ` (応答として除外 ${s.consistency.methodReplies} 件)` : '')
    + ` / 粒度 ${s.consistency.granularity} / イベント ${s.consistency.events}`);
  if (s.family) {
    const skipped = s.family.skippedPairs ? ` (粒度違いで突き合わせ対象外 ${s.family.skippedPairs} 組)` : '';
    lines.push(`系統: ${s.family.families} 系統中 ${s.family.mismatched} 系統に食い違い${skipped}`);
  }
  if (s.trace) {
    const parts = [];
    if (s.trace.noSequence) parts.push(`シーケンス図が無く突き合わせ不能 ${s.trace.noSequence} 系統`);
    if (s.trace.grainSkipped) parts.push(`粒度違いで除外 ${s.trace.grainSkipped} 系統 / ${s.trace.outOfScope} 件`);
    const un = parts.length ? ` (${parts.join(' / ')})` : '';
    const pa = s.trace.partial ? ` / 部分一致 ${s.trace.partial} 件` : '';
    lines.push(`トレース: 遷移 ${s.trace.transitions} 件中 ${s.trace.missing} 件がどのシーケンスにも現れない${pa}${un}`);
  }
  for (const k of Object.keys(report.audits)) {
    const a = report.audits[k];
    if (a.status !== 'ok') lines.push(`${k}: ${a.status} (${a.message || a.reason})`);
  }
  lines.push(`合計 ${report.totalIssues} 件`);
  // prev を渡さない旧来の呼び方では何も足さない。null を渡すと「前回が無い」と
  // 明示する 1 行が出る。件数だけを見て「前回と同じ」と読むのを防ぐのが目的。
  if (prev !== undefined) {
    const d = prev ? auditDiff.diff(prev.audits, report.audits) : null;
    for (const l of auditDiff.formatDiff(d, prev && prev.generatedAt)) lines.push(l);
  }
  return lines.join('\n');
}

// docs は dsl を含むので、レポートには載せない (JSON が図の全文で膨らむ)。
function buildReport(MA, docs, options) {
  const opts = options || {};
  const audits = runAudits(MA, docs, opts.only);
  const summary = summarize(audits);
  return {
    generatedAt: opts.now || new Date().toISOString(),
    targets: opts.targets || [],
    docs: docs.map((d) => d.name),
    audits,
    summary,
    totalIssues: totalIssues(summary),
  };
}

module.exports = { collectDocs, runAudits, summarize, totalIssues, buildReport, formatSummary, auditNames };
