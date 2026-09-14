'use strict';

// audit-report — .puml を集めて監査を回し、JSON 1 個にまとめる。
//
// 監査モジュールの API はどれも docs = [{ name, dsl }] を受ける。ここが
// 「ファイルを読む」と「監査を呼ぶ」の間に立つ唯一の層で、呼ぶ側 (CLI・テスト)
// はモジュール名も依存も知らなくてよい。あるモジュールが欠けていても
// その項目を skipped にするだけで、残りの監査は結果を返す。

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
// BLK-reviewer-20260907-2203: 件数表だけでは「同じ 5 件」の中身が入れ替わった
// ことも、カテゴリが新設されたことも読めない。前回の JSON との差分を要約に足す。
const auditDiff = require('./audit-diff');
// BLK-reviewer-20260908-0203: 指摘の増減だけでは、新規指摘が実データの変更か
// 対象外扱いのテンプレの汚染かを区別できない。ファイルの分類と内容の指紋を
// レポートに載せ、次回の --since / 控えとの比較で「どちらが動いたか」を出す。
const auditScope = require('../src/core/audit-scope');
// BLK-reviewer-20260914-2106: stale と出た図が「コメントを足しただけ」なのか
// 「中身が変わった」のかを、描き直さずに言うための材料。svg に畳まれている
// 元の DSL を開き、今の .puml と「描かれる行」だけで突き合わせる。
const svgEmbeddedSrc = require('./svg-embedded-src');

// ディレクトリなら再帰して .puml を集める。ファイルならそれ 1 枚。
// name は入力ルートからの相対パスにする (同名 basename が別フォルダにあっても
// 突合結果の doc 名で区別できるようにするため)。
// BLK-reviewer-20260909-0703: 保存フォルダの中の自動保存の控え。図そのものではなく
// 上書き前の版なので、監査の対象に混ぜると (a) 同じ図が版の数だけ重なり、
// (b) `_versions` がペルソナのフォルダ名として突合に出る。
// 名指しで渡されたとき (その中を意図して見に行った場合) だけ辿る。
const BOOKKEEPING_DIRS = ['_versions', '_vault'];
// BLK-reviewer-20260915-0007: 保存フォルダの中に `prev"cp -r E:01_Loop… "` の
// ような、シェルの事故でコマンド文字列がそのままフォルダ名になった残骸が出来る。
// 中身は元フォルダの写しなので、辿ると同じ図が二重に数えられ、指摘が毎回
// 「新規」で増え続ける。名指しで渡されたときだけ辿り、再帰では読み飛ばす
// (黙って落とすと「図が減った」と読めるので、読み飛ばした名前は呼ぶ側へ返す)。
const tracker = require('../src/core/finding-tracker');

function collectDocs(targets, options) {
  const opts = options || {};
  const exts = opts.extensions || ['.puml', '.pu', '.plantuml'];
  const docs = [];
  const seen = {};
  // 読み飛ばした残骸のフォルダ名。呼ぶ側 (CLI) が「読み飛ばした」と言うために使う。
  const skipped = Array.isArray(opts.skipped) ? opts.skipped : [];

  function pushFile(filePath, name) {
    const key = path.resolve(filePath);
    if (seen[key]) return;
    seen[key] = true;
    docs.push({ name: name.split(path.sep).join('/'), dsl: fs.readFileSync(filePath, 'utf-8'), path: key });
  }

  function walk(dir, base, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (BOOKKEEPING_DIRS.indexOf(entry.name) >= 0) continue;
        if (tracker.isJunkPath(entry.name)) {
          if (skipped.indexOf(entry.name) < 0) skipped.push(entry.name);
          continue;
        }
        walk(full, base, prefix);
      } else if (exts.indexOf(path.extname(entry.name).toLowerCase()) >= 0) {
        pushFile(full, path.join(prefix, path.relative(base, full)));
      }
    }
  }

  const list = Array.isArray(targets) ? targets : [targets];
  // BLK-reviewer-20260909-0703: フォルダを 2 つ以上渡すのは「フォルダ同士を
  // 突き合わせたい」ということなので、名前の先頭 1 段にフォルダ名を付ける。
  // 付けないと primary と junior のどちらの図かが名前から消え、フォルダを
  // またぐドメインが 0 件になっていた (絶対パスで渡したときも同じ)。
  // フォルダ 1 つのときは今までどおり、そのフォルダからの相対名。
  const withFolder = list.filter(
    (t) => fs.existsSync(t) && fs.statSync(t).isDirectory()).length > 1;

  for (const t of list) {
    if (!fs.existsSync(t)) throw new Error('見つかりません: ' + t);
    if (fs.statSync(t).isDirectory()) {
      walk(t, t, withFolder ? path.basename(path.resolve(t)) : '');
    } else {
      pushFile(t, path.basename(t));
    }
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
  // BLK-reviewer-20260908-0823-wish: ここまでの監査は DSL の中しか見ていないので、
  // 「.puml はあるが .svg が書き出されていない」は 1 枚も検知できなかった。
  // timer_state.puml だけ SVG が無いことに気付いたのは 17 枚の目視突合の産物で、
  // 仕組みとしては存在しなかった。出力物の有無は DSL ではなくフォルダに書いてある。
  svg: (MA, docs) => (MA.svgFreshness
    ? withStaleReasons(MA, MA.svgFreshness.scan(svgEntries(docs, MA)), docs) : undefined),
  // BLK-primary-20260908-1403-wish: 「dma_state だけ 1 メッセージが 4 遷移」は
  // 名前の食い違いではないので family / trace のどこにも出ず、出力テキストを
  // 目で読んで気付くしかなかった。系統ごとの遷移密度を並べ、中央値から外れた
  // 系統を名指しする。
  density: (MA, docs) => (MA.transitionDensity ? MA.transitionDensity.rank(docs) : undefined),
  // BLK-reviewer-20260908-1803: ラベル位置の慣習ズレ (実在する名前なので trace は
  // 一致と出す) は「⇉ 系統チェック」でしか出せず、CLI からは method 順を目で読んで
  // 「dma だけ末尾」と毎 tick 確かめ直していた。label-position.js は純関数だが、
  // 入力が trace-coverage.audit() の結果で、それを組み立てているのが app.js
  // だけだったので node からは回せなかった。配線はここ 1 行で足りる。
  label: (MA, docs) => (MA.labelPosition && MA.traceCoverage
    ? MA.labelPosition.rank(MA.traceCoverage.audit(docs)) : undefined),
  // BLK-reviewer-20260909-0403-wish: 他の監査はどれもフォルダを捨てて系統だけを見るので、
  // 「junior の gpio_state と primary の gpio_state が別物」はどこにも出ず、
  // 該当ファイルを名前で推測して 4 枚個別に開き目で比べるしかなかった。
  // フォルダを軸に残したまま、同じドメイン・同じ図種の組だけを突き合わせる。
  cohort: (MA, docs) => (MA.domainCohort ? MA.domainCohort.audit(docs) : undefined),
  // BLK-reviewer-20260914-1406-wish: 他の監査はどれも「本文どうしの整合」しか見ないので、
  // ファイルが名乗っている図種と本文の図種が食い違う事故 (plantuml-usecase.puml の中身が
  // dma_transfer_sequence.puml の複製になっていた) は、31 枚を 1 枚ずつ読むまで出なかった。
  kind: (MA, docs) => (MA.kindMismatch ? MA.kindMismatch.audit(docs) : undefined),
};

// .puml の隣に置かれた同名の .svg を見て、svg-freshness が読む形の行にする。
// 判定 (無い / 古い / 追いついている) は GUI と同じモジュールに任せる。
// path を持たない docs (テストが手で組んだもの) は unknown ではなく対象外にする
// — 「ファイルとして存在しない図」に出力漏れを問うても直しようがない。
// BLK-reviewer-20260915-0406: ここが載せていたのは mtime 2 つだけで、GUI の一覧
// (server の /autosave) が持つ hash (今の puml の sha1) と svgSource (svg 末尾の印)
// が入っていなかった。svg-freshness.contentOf は印と hash の突合で内容一致を言うので、
// 入っていなければ答えは常に 'unverified' — isSettled を一度も通らず、mtime だけで
// 「SVG 古」になっていた (findings.js の継続追跡もその誤検知をそのまま持ち越す)。
// server と同じ 3 つを、同じ読み方でここでも載せる。
function svgEntries(docs, MA) {
  const out = [];
  const stamp = MA && MA.svgStamp;
  for (const d of (Array.isArray(docs) ? docs : [])) {
    if (!d || !d.path) continue;
    const svgPath = d.path.replace(/\.[^.\/]+$/, '') + '.svg';
    let mtime = null;
    let svgMtime = null;
    try { mtime = fs.statSync(d.path).mtime.toISOString(); } catch (e) { mtime = null; }
    try { svgMtime = fs.statSync(svgPath).mtime.toISOString(); } catch (e) { svgMtime = null; }
    const entry = { name: d.name, mtime: mtime, svgMtime: svgMtime,
      hash: null, svgSource: null, svgHash: null, visibleMatch: null };
    // 読めなかったものは null のまま = 従来どおり「言えない」に落とす (嘘を足さない)。
    try { entry.hash = _sha1(fs.readFileSync(d.path)); } catch (e) { entry.hash = null; }
    if (svgMtime !== null) {
      try {
        const raw = fs.readFileSync(svgPath);
        entry.svgHash = _sha1(raw);
        const n = stamp ? stamp.tailBytes() : 200;
        const tail = raw.slice(Math.max(0, raw.length - n)).toString('utf-8');
        entry.svgSource = (stamp ? stamp.readStamp(tail) : '') || null;
      } catch (e) { /* 読めない svg は印なし扱い */ }
      // BLK-reviewer-20260915-0606: 指紋 (印 / 畳まれた DSL の sha1) はコメントや
      // 体裁だけの書き換えでも食い違うので、それだけで出す答えは「内容ずれ」に倒れる。
      // server の /verify-svg は描き直して differ-format (描かれる中身は一致) と答えるが、
      // audit.js は server を持たないため、reviewer は --board 1 回ごとに枚数ぶん
      // curl で裏取りしていた。畳まれた DSL と今の puml を描かれる行だけで比べれば、
      // 同じ答えが Java も server も無しにここで出る。
      entry.visibleMatch = visibleMatchOf(MA, d, svgPath);
    }
    out.push(entry);
  }
  return out;
}

// svg に畳まれた元の DSL と今の .puml を、描かれる行だけで比べる。
// 'same' / 'differ' / null (畳まれた DSL が無い = 描かれる行では言えない)。
function visibleMatchOf(MA, doc, svgPath) {
  const VD = MA && MA.dslVisibleDiff;
  if (!VD || !doc || typeof doc.dsl !== 'string') return null;
  let svgText = null;
  try { svgText = fs.readFileSync(svgPath, 'utf-8'); } catch (e) { return null; }
  const folded = svgEmbeddedSrc.decode(svgText);
  if (folded === null) return null;
  const v = VD.compare(folded, doc.dsl).verdict;
  return (v === 'same' || v === 'differ') ? v : null;
}

function _sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

// BLK-reviewer-20260914-2106: 「SVG が古い」の中身を割る。
// svg に畳まれている書き出し当時の DSL と、今の .puml を、描かれる行だけで比べる。
//   same    — コメント・空行の差だけ。絵は同じ (見かけ上の stale)
//   differ  — 描かれる行が違う。作り直しが要る
//   unknown — 畳まれた DSL が無く、中身では言えない (従来どおり手で確かめる 1 枚)
// render も server も要らないので、audit.js を打つだけでその場で答えが出る。
function withStaleReasons(MA, scan, docs) {
  const VD = MA.dslVisibleDiff;
  if (!scan || !VD) return scan;
  const dslByName = {};
  for (const d of (Array.isArray(docs) ? docs : [])) {
    if (d && d.name) dslByName[d.name] = { dsl: d.dsl, path: d.path };
  }
  const reasons = {};
  const detail = {};
  for (const row of (scan.rows || [])) {
    if (row.status !== 'stale') continue;
    const doc = dslByName[row.name];
    if (!doc || !doc.path) { reasons[row.name] = 'unknown'; continue; }
    let svgText = null;
    try {
      svgText = fs.readFileSync(doc.path.replace(/\.[^.\\/]+$/, '') + '.svg', 'utf-8');
    } catch (e) { svgText = null; }
    const folded = svgEmbeddedSrc.decode(svgText);
    if (folded === null) { reasons[row.name] = 'unknown'; continue; }
    const r = VD.compare(folded, doc.dsl);
    reasons[row.name] = r.verdict;
    if (r.verdict === 'differ') {
      detail[row.name] = { added: r.added.slice(0, 10), removed: r.removed.slice(0, 10) };
    }
  }
  scan.staleReasons = reasons;
  scan.staleDetail = detail;
  return scan;
}

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
  // BLK-reviewer-20260914-1706: 件数と正規化キーだけでは、どの綴りがどの綴りと
  // 対応するのか・その宣言行がどのファイルの何行目なのかが出ず、毎回ソースを
  // grep し直すことになっていた。文面は name-audit が作る (画面と CLI で同じ言葉)。
  if (n && n.status === 'ok') s.name = {
    variants: n.result.variants.length,
    undeclared: n.result.undeclared.length,
    clean: !!n.result.clean,
    variantLines: n.result.variantLines || [],
    undeclaredLines: n.result.undeclared.map((r) => {
      const at = (r.at && r.at[0]) ? `${r.at[0].doc}:${r.at[0].line}  ${r.at[0].text}` : r.docs.join(', ');
      return `${r.name}  ${at}`;
    }),
  };
  const m = audits.method;
  // BLK-reviewer-20260914-1406: 指摘の総数だけでは「クラスを足したら減った」が
  // 正しい修正なのか、メソッド名をクラスとして宣言した誤り・写しにだけ入れた
  // 修正なのかを読み分けられない。宣言の付け方を疑う 2 種を別に数えて出す。
  if (m && m.status === 'ok') {
    const mi = m.result.issues || [];
    // BLK-reviewer-20260915-0106-wish: `'@omit-method` で意図的に省略と宣言された
    // 指摘は issues から外れている。0 件が「見ていない」でないと分かるよう、
    // 外した件数と対象を別に出す (reviewer はここを読めば puml を開かずに済む)。
    const om = m.result.omitted || [];
    s.method = {
      issues: mi.length,
      suspect: mi.filter((it) => it.kind === 'method-as-class' || it.kind === 'draft-only').length,
      omitted: om.length,
      omittedLines: om.map((it) => `${it.cls || it.owner || '?'}.${it.method} — ${it.reason || '理由の記載なし'}`
        + (it.omitDoc ? ` (${it.omitDoc})` : '')),
    };
  }
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
  const sv = audits.svg;
  if (sv && sv.status === 'ok') {
    s.svg = {
      files: sv.result.rows.length,
      missing: sv.result.counts.missing,
      stale: sv.result.counts.stale,
      unknown: sv.result.counts.unknown,
      // 名前まで出す。件数だけだと「どの図か」を探すのに結局 ls の突合に戻る。
      missingNames: sv.result.rows.filter((r) => r.status === 'missing').map((r) => r.name),
      staleNames: sv.result.rows.filter((r) => r.status === 'stale').map((r) => r.name),
    };
    // BLK-reviewer-20260914-2106: 「SVG が古い」を 3 つに割る。割らないと
    // reviewer は 1 枚ずつ render API を叩いて文字列 diff を取る使い捨ての
    // スクリプトを書くことになり、図が増えるほど手作業が線形に増える。
    const reasons = sv.result.staleReasons || {};
    const pick = (v) => s.svg.staleNames.filter((n) => reasons[n] === v);
    // 件数は名前の数なので持たない (要約の行数はそのまま grep のしやすさになる)。
    s.svg.staleCommentOnlyNames = pick('same');
    s.svg.staleContentNames = pick('differ');
    s.svg.staleUnknownNames = pick('unknown');
  }
  const dn = audits.density;
  if (dn && dn.status === 'ok') {
    s.density = {
      families: dn.result.rows.length,
      // BLK-reviewer-20260908-1603: 数えた系統と、粒度が違って数えなかった系統を
      // 分けて持つ。rows.length で「10 系統とも揃っている」と言うと、実際には
      // 2 系統しか比べていない中央値を 10 系統の合意のように読ませてしまう。
      counted: dn.result.rows.filter((r) => r.density != null).length,
      skippedNames: dn.result.rows
        .filter((r) => r.density == null && r.messages > 0 && r.stateDocs.length && !r.sameGrain)
        .map((r) => r.key),
      median: dn.result.median,
      outliers: dn.result.outliers.length,
      // 系統名まで出す。件数だけだと「どの系統か」を探しに他の出力へ戻ることになる。
      outlierNames: dn.result.outliers.map((r) => r.key),
    };
  }
  const lp = audits.label;
  if (lp && lp.status === 'ok') {
    s.label = {
      families: lp.result.rows.length,
      // 慣習を言えた系統だけが比較の母数。rows.length で「9 系統とも揃っている」と
      // 言うと、対応の付いたラベルが 1 本も無い系統まで「揃っている」に数えてしまう。
      known: lp.result.rows.filter((r) => !!r.convention).length,
      common: lp.result.common,
      commonLabel: lp.result.commonLabel,
      odd: lp.result.odd.length,
      // 系統名と、その系統がどこを指しているかまで出す。件数だけだと
      // 「どの系統か」を探しに GUI へ戻ることになる (それがこの配線の目的)。
      oddNames: lp.result.odd.map((r) => r.key + ' (' + r.conventionLabel + ')'),
      // 系統内で位置が割れている系統。多数派とはズレていなくても直す対象になる。
      mixedNames: lp.result.rows.filter((r) => r.mixed).map((r) => r.key),
    };
  }
  const km = audits.kind;
  if (km && km.status === 'ok') {
    s.kind = {
      files: km.result.files,
      // 名乗りと本文の両方が読めた枚数。files で語ると、名前に図種の無い図
      // (diagram1) まで「照合して問題なし」に数えてしまう。
      checked: km.result.checked,
      mismatched: km.result.mismatched,
      mismatchedNames: km.result.mismatchedNames,
      // 保存時の控えとの差。本文判定は紛らわしい書き方で普通に外れるので、
      // 指摘には数えずここに残す。
      notes: km.result.notes,
    };
  }
  const ch = audits.cohort;
  if (ch && ch.status === 'ok') {
    s.cohort = {
      domains: ch.result.domains,
      // フォルダをまたぐドメインだけが比較の母数。domains で語ると、
      // 1 フォルダにしか無いドメインまで「揃っている」に数えてしまう。
      crossFolder: ch.result.groups.length,
      mismatched: ch.result.groups.filter((g) => g.mismatched > 0).length,
      mismatchedNames: ch.result.groups.filter((g) => g.mismatched > 0)
        .map((g) => g.domain + ' [' + g.folders.join(' × ') + ']'),
      // 同名ドメインだが図種が噛み合わず突き合わせていない組。
      unpairedNames: ch.result.groups.filter((g) => g.unpaired).map((g) => g.domain),
      // BLK-reviewer-20260909-0503-wish: テンプレを各自が複製しただけのドメイン
      // (plantuml-*.puml の plantuml 等) は既定で突合から外す。外したことを数字で
      // 残さないと、前回の run との件数比較で「食い違いが直った」と読めてしまう。
      excludedTemplateDomains: (ch.result.templateDomains || []).map((t) => t.domain),
      templateFiles: ch.result.templateFiles || 0,
      // BLK-reviewer-20260909-0703-wish: 図の中の宣言 (' domain-verdict: ...) を読み、
      // 「決定済み」を食い違いから外す。外した数と、宣言が実体と合っていない組は
      // 必ず残す (外した分だけ件数が減ると「直った」と読めてしまう)。
      declared: ch.result.declared || 0,
      conflicts: ch.result.conflicts || 0,
      conflictNames: ch.result.groups.reduce((out, g) => out.concat(
        (g.conflictPairs || []).map((p) => `${g.domain} [${p.a.folder} × ${p.b.folder}]: ${p.verdict.text}`)), []),
      // BLK-reviewer-20260912-2206: 件数とドメイン名までは出ていたが、食い違って
      // いる部品名は出ていなかったので、reviewer は毎回 2 フォルダの同名ファイルを
      // 開いて手 diff していた。組ごとの名前差をそのまま要約に載せる。
      // 文面は domain-cohort が作る (画面と CLI で同じ言葉にする)。
      diffLines: (ch.result.diffRows || []).map((r) => r.text),
      // 同名ファイルどうしの組の数。0 なら「同じ図の 2 人の版」は 1 組も無い。
      sameBasePairs: (ch.result.diffRows || []).filter((r) => r.sameBase).length,
    };
  }
  return s;
}

// BLK-reviewer-20260906-2043: summarize() は回った監査のキーだけを生やすので、
// `--only` や監査モジュールの欠落で summary の形が run ごとに変わる。reviewer は
// そのたびに巨大な JSON を grep -n して summary の位置とキー名を探し直していた。
// ここは「どの run でも同じ形・同じ順・同じキー」を返す口にする。回らなかった
// 監査は status で名指しし、数字は 0 ではなく null にする (0 件と「見ていない」を
// 取り違えない)。フィールドの既定はここ 1 か所に書く。
const SUMMARY_FIELDS = {
  name: ['variants', 'undeclared', 'clean', 'variantLines', 'undeclaredLines'],
  method: ['issues', 'suspect', 'omitted', 'omittedLines'],
  consistency: ['naming', 'unused', 'methods', 'methodReplies', 'granularity', 'events', 'count'],
  family: ['families', 'mismatched', 'skippedPairs'],
  trace: ['families', 'transitions', 'missing', 'partial', 'unmatchable', 'noSequence', 'grainSkipped', 'outOfScope'],
  svg: ['files', 'missing', 'stale', 'unknown', 'missingNames', 'staleNames',
    'staleCommentOnlyNames', 'staleContentNames', 'staleUnknownNames'],
  density: ['families', 'counted', 'skippedNames', 'median', 'outliers', 'outlierNames'],
  label: ['families', 'known', 'common', 'commonLabel', 'odd', 'oddNames', 'mixedNames'],
  cohort: ['domains', 'crossFolder', 'mismatched', 'mismatchedNames', 'unpairedNames',
    'excludedTemplateDomains', 'templateFiles', 'declared', 'conflicts', 'conflictNames',
    'diffLines', 'sameBasePairs'],
  kind: ['files', 'checked', 'mismatched', 'mismatchedNames', 'notes'],
};

// 監査 1 つ分の枠。status は 'ok' / 'skipped' (--only で外した) /
// 'error' (読み込みや実行に失敗した) の 3 つだけ。
function summarySlot(key, audit, counts) {
  const slot = { status: 'skipped', message: null };
  if (audit) {
    slot.status = audit.status === 'ok' ? 'ok' : 'error';
    if (audit.status !== 'ok') slot.message = audit.message || null;
  }
  const got = (slot.status === 'ok' && counts) ? counts : null;
  for (const f of SUMMARY_FIELDS[key]) {
    slot[f] = (got && got[f] !== undefined) ? got[f] : null;
  }
  return slot;
}

// buildReport() の結果から、位置もキーも固定の要約だけを取り出す。
// 先頭に totalIssues を置くので、どの run でも JSON の 3 行目を読めば合計が出る。
function summaryView(result) {
  const r = result || {};
  const audits = r.audits || {};
  const summary = r.summary || {};
  const view = {
    generatedAt: r.generatedAt || null,
    totalIssues: (typeof r.totalIssues === 'number') ? r.totalIssues : totalIssues(summary),
    targets: r.targets || [],
    docs: (r.docs || []).length,
    audits: {},
  };
  for (const key of auditNames()) {
    view.audits[key] = summarySlot(key, audits[key], summary[key]);
  }
  return view;
}

function totalIssues(summary) {
  let t = 0;
  if (summary.name) t += summary.name.variants + summary.name.undeclared;
  if (summary.method) t += summary.method.issues;
  if (summary.consistency) t += summary.consistency.count;
  if (summary.family) t += summary.family.mismatched;
  if (summary.trace) t += summary.trace.missing;
  // ラベル位置のズレは画面でも下端の「整合」の件数に足している
  // (BLK-reviewer-20260908-1703)。CLI の合計だけ数えないと、同じ図に対して
  // GUI と CLI で件数が割れる。密度と違い「多数派に揃える」という直し方が
  // 決まっているので、判断の要る指摘ではなく数える指摘として扱う。
  if (summary.label) t += summary.label.odd;
  // 名乗りと本文の食い違いは、直し方 (中身を戻すか名前を変えるか) が要る事故なので
  // 合計に数える。控えとの差 (notes) は雑音になるので数えない。
  if (summary.kind) t += summary.kind.mismatched;
  return t;
}

// 内容比較の土台を決める。指紋入りの前回 JSON がいちばん強く、
// --since-files で渡された前回の図フォルダがそれに次ぎ、名前だけの古い JSON が最後。
// BLK-reviewer-20260908-0203 (0723 追記): 指紋を載せる前に採った JSON と比べる run は
// 「追えない」で終わり、その 1 回はまた 22 枚の手 diff に戻っていた。前回の控えが
// フォルダで残っているなら、そこから指紋を採り直せばその run から比較できる。
function baselineFiles(prev, options) {
  const opts = options || {};
  if (opts.prevFiles && opts.prevFiles.length) return opts.prevFiles;
  if (prev && prev.files && prev.files.length) return prev.files;
  if (prev && prev.docs && prev.docs.length) return auditScope.entriesFromNames(prev.docs);
  return null;
}

// 人が読む 1 行ずつの要約。--summary のときだけ使う。
function formatSummary(report, prev, options) {
  const opts = options || {};
  const lines = [`図 ${report.docs.length} 枚 (${report.targets.join(', ')})`];
  const s = report.summary;
  if (s.name) {
    lines.push(`名前突合: 表記揺れ ${s.name.variants} 組 / 宣言なし ${s.name.undeclared} 件`);
    // 件数の下に、どの綴りとどの綴りが・どのファイルの何行目で揺れているかを開く。
    for (const l of (s.name.variantLines || [])) lines.push('  ' + l);
    for (const l of (s.name.undeclaredLines || [])) lines.push('  宣言なし: ' + l);
  }
  if (s.method) {
    lines.push(`メソッド突合: 指摘 ${s.method.issues} 件`
      + (s.method.suspect ? ` (うち宣言の付け方の疑い ${s.method.suspect} 件)` : '')
      + (s.method.omitted ? ` / 意図省略で除外 ${s.method.omitted} 件` : ''));
    for (const l of (s.method.omittedLines || [])) lines.push('  意図省略: ' + l);
  }
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
  if (s.density) {
    // 粒度は「揃っていないと直す」判断が要る指摘で、名前の食い違いのような
    // 一意の正解が無い。合計には足さず、外れた系統を名指しするだけにする。
    const med = s.density.median == null ? '—' : (Math.round(s.density.median * 100) / 100).toFixed(2);
    const skipped = s.density.skippedNames || [];
    const tail = skipped.length
      ? ` (シーケンス図が状態機械と同じ粒度でない系統 ${skipped.length} 件は数えていない: ${skipped.join(', ')})`
      : '';
    const counted = s.density.counted == null ? s.density.families : s.density.counted;
    lines.push(counted < 3
      ? `遷移密度: 比べられる系統が ${counted} 件しかない (中央値 ${med} 遷移/メッセージ)${tail}`
      : (s.density.outliers === 0
        ? `遷移密度: ${counted} 系統とも中央値 ${med} 遷移/メッセージに揃っている${tail}`
        : `遷移密度: 中央値 ${med} から外れた系統 ${s.density.outliers} 件 (${s.density.outlierNames.join(', ')})${tail}`));
  }
  if (s.label) {
    // 「dma だけ末尾」を毎 tick 目で確かめ直していた行。名指しまでここで済ませる。
    const mixed = s.label.mixedNames && s.label.mixedNames.length
      ? ` (系統内で位置が割れている ${s.label.mixedNames.length} 系統: ${s.label.mixedNames.join(', ')})`
      : '';
    if (!s.label.known) {
      lines.push('ラベル位置: 対応の付いた遷移ラベルを持つ系統がない');
    } else if (!s.label.common) {
      lines.push(`ラベル位置: 慣習を比べられる系統が ${s.label.known} 件しかない${mixed}`);
    } else if (!s.label.odd) {
      lines.push(`ラベル位置: ${s.label.known} 系統とも遷移ラベルは${s.label.commonLabel}のメッセージを指している${mixed}`);
    } else {
      lines.push(`ラベル位置: 多数派 (${s.label.commonLabel}) とズレた系統 ${s.label.odd} 件 / ${s.label.known} 件`
        + ` (${s.label.oddNames.join(', ')})${mixed}`);
    }
  }
  if (s.kind) {
    // 名乗り (ファイル名) と本文の食い違い。0 件のときも「何枚を照合しての 0 件か」を
    // 出す —— 名前に図種の無い図は照合できないので、files で語ると嘘になる。
    const note = s.kind.notes ? ` / 保存時の控えとの差 ${s.kind.notes} 件` : '';
    lines.push(s.kind.mismatched === 0
      ? `図種: 名乗りと本文が食い違う図はない (${s.kind.files} 枚中 ${s.kind.checked} 枚を照合)${note}`
      : `図種: 名乗りと本文が食い違う図 ${s.kind.mismatched} 枚 (${s.kind.mismatchedNames.join(', ')})`
        + ` / ${s.kind.checked} 枚を照合${note}`);
  }
  if (s.svg) {
    // 出力物は DSL の指摘ではないので合計には足さない。「図は直っているが
    // 書き出していない」は別の直し方 (作り直す) をするため、行を分けて出す。
    if (s.svg.missing === 0 && s.svg.stale === 0 && s.svg.unknown === 0) {
      lines.push(`出力物: SVG は ${s.svg.files} 枚とも puml に追いついている`);
    } else {
      const parts = [];
      if (s.svg.missing) parts.push(`SVG が無い ${s.svg.missing} 枚 (${s.svg.missingNames.join(', ')})`);
      if (s.svg.stale) {
        // 「古い」だけでは作り直しの要否が決まらない。中身で割った内訳を同じ行に出す。
        const why = [];
        const content = s.svg.staleContentNames || [];
        const commentOnly = s.svg.staleCommentOnlyNames || [];
        const noSrc = s.svg.staleUnknownNames || [];
        if (content.length) {
          why.push(`可視内容の食い違い ${content.length} 枚 (${content.join(', ')})`);
        }
        if (commentOnly.length) {
          why.push(`コメント等ソース変化のみ ${commentOnly.length} 枚 (${commentOnly.join(', ')})`);
        }
        if (noSrc.length) {
          why.push(`畳まれた DSL が無く中身では言えない ${noSrc.length} 枚 (${noSrc.join(', ')})`);
        }
        parts.push(`SVG が古い ${s.svg.stale} 枚 (${s.svg.staleNames.join(', ')})`
          + (why.length ? ` — ${why.join(' / ')}` : ''));
      }
      if (s.svg.unknown) parts.push(`時刻が取れず不明 ${s.svg.unknown} 枚`);
      lines.push(`出力物: ${parts.join(' / ')}`);
    }
  }
  if (s.cohort) {
    // 「該当ファイルを名前で推測して 4 枚開く」を置き換える 1 行。
    // どのドメインが・どのフォルダの間で食い違っているかまでここで名指しする。
    const tail = s.cohort.unpairedNames.length
      ? ` (図種が噛み合わず比べられないドメイン ${s.cohort.unpairedNames.length} 件: ${s.cohort.unpairedNames.join(', ')})`
      : '';
    // 外したテンプレ由来のドメインは必ず添える。黙って減らすと、前回との
    // 件数比較で「食い違いが直った」と読めてしまう。
    const ex = s.cohort.excludedTemplateDomains || [];
    // 図の中の宣言で決着済みの組も同じ理由で数えて出す。
    const vparts = [];
    if (s.cohort.declared) vparts.push(`宣言済み ${s.cohort.declared} 組は除外`);
    if (s.cohort.conflicts) vparts.push(`宣言と実体の食い違い ${s.cohort.conflicts} 組`);
    const note = (vparts.length ? ` (${vparts.join(' / ')})` : '')
      + (ex.length ? ` (テンプレ由来 ${ex.length} ドメインは除外: ${ex.join(', ')})` : '');
    lines.push(s.cohort.crossFolder === 0
      ? `ドメイン突合: フォルダをまたぐドメインがありません (全 ${s.cohort.domains} ドメイン)${note}`
      : (s.cohort.mismatched === 0
        ? `ドメイン突合: フォルダをまたぐ ${s.cohort.crossFolder} ドメインは名前もラベルも揃っている${tail}${note}`
        : `ドメイン突合: ${s.cohort.crossFolder} ドメイン中 ${s.cohort.mismatched} 件が食い違い (${s.cohort.mismatchedNames.join(', ')})${tail}${note}`));
    // 宣言が実体と合っていない組は、件数だけでは直しようがないので名指しする。
    for (const c of (s.cohort.conflictNames || [])) lines.push(`  宣言ずれ: ${c}`);
    // 食い違っている名前そのもの。ここが出ないと、reviewer は 2 フォルダの
    // 同名ファイルを開いて手 diff するところまで毎回戻る。
    // 要約を潰さないよう既定は 10 組まで。打ち切ったら残り件数を必ず言う
    // (「これで全部」と読ませない。全部要るなら --pairs-max で伸ばす)。
    const dl = s.cohort.diffLines || [];
    const cap = opts.pairsMax > 0 ? opts.pairsMax : 10;
    for (const l of dl.slice(0, cap)) lines.push(`  差分: ${l}`);
    if (dl.length > cap) lines.push(`  差分: ほか ${dl.length - cap} 組 (--pairs-max で全部出す)`);
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
    // 指摘の差分のすぐ下に、ファイル内容がどちら側で動いたかを置く。
    // 「新規 16 件」の原因を実データかテンプレかへ寄せるのはこの 1 行。
    // 前回そのものが無い run では formatDiff が既にそう言っているので重ねない。
    const base = baselineFiles(prev, opts);
    if (prev || base) {
      if (opts.prevFilesFrom) lines.push(`ファイル内容の比較元: ${opts.prevFilesFrom} (控えのフォルダから指紋を採り直した)`);
      for (const l of auditScope.formatFileDiff(auditScope.diffFiles(base, report.files), report.files)) lines.push(l);
    }
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
    // docs (名前だけ) は残す。古い JSON を読む側を壊さないため、分類と指紋は
    // files として別に持つ。
    files: auditScope.fileEntries(docs),
    audits,
    summary,
    totalIssues: totalIssues(summary),
  };
}

module.exports = { collectDocs, runAudits, summarize, totalIssues, buildReport, formatSummary, auditNames, baselineFiles, summaryView, SUMMARY_FIELDS };
