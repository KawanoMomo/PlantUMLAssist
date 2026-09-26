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
// BLK-reviewer-20260914-1806: 下書き (`{name}-編集中.puml`) が本体に反映されたかは
// GUI の 📂 一覧にしか出ず、GUI を開かない reviewer は ls と byte 比較で判断していた。
// 台帳そのもの (src/core/swap-queue.js) は DOM に触らないので CLI からも引ける。
const swapQueue = require('../src/core/swap-queue');
const reviewBoard = require('../src/core/review-board');
// BLK-reviewer-20260914-2206 (差し戻し 1 回目): --board の「新規」は findings.js と
// 同じ同一性で数える。台帳 (finding-tracker の控え) を読んで、追跡中の指摘に
// 当たる行を新規から外す。台帳が無い場所では今までどおり指摘.md だけで突き合わせる。
const findingTracker = require('../src/core/finding-tracker');
const findingsCli = require('./findings');
// BLK-reviewer-20260914-2206: 控えは対象の組ごとに分けて持つ (src/core/audit-state.js)。
const auditState = require('../src/core/audit-state');
// BLK-reviewer-20260917-0523-wish: 対象の DSL が「いつから変わっていないか」。
// 無変化の tick を数え直さず、無変化の間は監査の入口で降りるための印。
const unchangedStreak = require('../src/core/unchanged-streak');
// BLK-reviewer-20260915-0506-wish: 表記揺れの「揃える先」を毎 tick 推定し直さず、
// 1 度決めて 3 人で共有する登録簿。判定も書式も 1 箇所 (GUI と同じ規則)。
const nameRegistry = require('../src/core/name-registry');

// 前回比較用の控え。CLI を打つ場所 (リポジトリ直下) に置く。
const STATE_FILE = '.assist-audit-last.json';

// 壊れた控えで CLI を落とさない。読めなければ空の store (「前回なし」と同じ扱い)。
function readStore(file) {
  try {
    if (!fs.existsSync(file)) return { scopes: {} };
    return auditState.readStore(fs.readFileSync(file, 'utf-8'));
  } catch (e) { return { scopes: {} }; }
}

// --since で名指しされた JSON。対象が今回と違う控えと比べると、図がバイト無差分でも
// 全枚が「変わった図」に出る。落とさずに読み、対象の食い違いは呼び出し元が言う。
function readReport(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const r = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (r && r.audits) return r;
    // 対象ごとの store を --since に渡されたら、今回の対象の 1 件を取り出す。
    return null;
  } catch (e) { return null; }
}

// 控えを書き戻す。他の対象の控えは消さずに残す (対象を切り替えて打っても、
// それぞれが自分の前回と比べ続けられるようにする)。書けない場所でも監査は成功させる。
function saveState(file, targets, result, mark) {
  try {
    fs.writeFileSync(file, auditState.serialize(
      auditState.put(readStore(file), targets, result, result.generatedAt, null, mark)), 'utf-8');
  } catch (e) {}
}

// 印だけを書き戻す (監査を回さずに降りた回)。書けない場所でも降り方は変えない。
function saveMark(file, targets, mark) {
  try {
    fs.writeFileSync(file, auditState.serialize(
      auditState.putMark(readStore(file), targets, mark)), 'utf-8');
  } catch (e) {}
}

// 今回の対象と控えの対象がずれていれば、その旨の 1 行。ずれていなければ null。
function scopeMismatch(prevTargets, curTargets) {
  if (!prevTargets || !prevTargets.length) return null;
  if (auditState.scopeKey(prevTargets) === auditState.scopeKey(curTargets)) return null;
  return '控えの対象が今回と違います (控え: ' + prevTargets.join(' / ')
    + ' / 今回: ' + curTargets.join(' / ') + ')。図の変化と指摘の新規/継続は比べていません';
}

const USAGE = [
  '使い方: node tools/audit.js <ファイル|フォルダ> [...] [オプション]',
  '',
  '  --only a,b    回す監査を絞る (' + report.auditNames().join(', ') + ')',
  '  --cohort      ドメイン突合だけを要約で出す (= --only cohort --summary)。',
  '                フォルダを 2 つ以上渡すと、名前の先頭 1 段がそのフォルダ名になる',
  '  --names       名前突合だけを要約で出す (= --only name --summary)。表記揺れの組を',
  '                「綴り ⇔ 綴り」と、その宣言行 (ファイル:行) まで開いて並べる',
  '  --summary     JSON ではなく人が読む要約を出す',
  '  --summary-json  要約だけを、どの run でも同じ形・同じ順の JSON で出す',
  '                (別名 --summary-only)。totalIssues が先頭付近に固定で出て、',
  '                回らなかった監査も status: skipped/error として必ず並ぶので、',
  '                大きい JSON を grep -n で探し直さずに済む',
  '  --out FILE    JSON をファイルに書く (標準出力にはパスだけ)',
  '  --since FILE  前回の監査 JSON と突き合わせ、増えた指摘・消えた指摘と、',
  '                実データ/テンプレ別のファイル内容の変化を要約に足す',
  '  --since-files DIR  前回の図フォルダ (控え) から指紋を採り直して内容変化を比べる。',
  '                     変わった図は消えた行数と代表行まで出す (--pairs-max で枚数を伸ばす)。',
  '                     指紋を持たない古い JSON と比べる run でも 1 回で切り分けられる',
  '  --personas a,b (-p) ペルソナ名だけで保存フォルダを対象にする (長いパスを打たない)。',
  '                 根は PUA_PERSONA_DATA、既定はリポジトリの隣の persona-data',
  '  --full-diff [NAME,..]  変わった図の全文 diff を、その場で (要約の中に) 開く。',
  '                 既定でも 20 行以上動いた図は全文まで開く (促しだけにするなら --no-full-diff)。',
  '                 all で変わった図を全部、図名を並べればその図を大きさに関わらず開く',
  '  --full-diff-threshold N  全文を自動で開く行数のしきい値 (既定 20)',
  '  --pairs-max N 突合の差分行を N 組まで出す (既定 10、0 で全部)。',
  '  --drafts      監査は回さず、下書き (`{name}-編集中.puml`) の差し替え待ちキューを出す。',
  '                本体へ差し替え待ち / 本体が無い / 前後不明 / 削除予定 に振り分けて名指しする',
  '  --versions    監査は回さず、保存フォルダの各図を `_versions/` の直前版と',
  '                突き合わせて差分を出す。上書きで中身が失われた図を名指しする',
  '  --versions-max N  --versions が 1 枚あたりに出す差分行を N 行まで (既定 6、0 で全部)',
  '  --dashboard   図 1 枚を 1 行にして、指摘・📌・SVG 検証・表記の要決定・前回控えとの',
  '                差分を 1 枚の表に並べる (node tools/dashboard.js と同じ)。',
  '                出口ごとの言い分が食い違う行は「気づき」列に両方を残す',
  '  --board [MD]  突合結果・前回の指摘文書 (MD、既定は保存フォルダの 指摘.md)・',
  '                前回控えとの差分を 1 枚に束ねて出す。前回の指摘 1 件ごとに',
  '                解消/継続/新規を振り分け、継続には tick 数を数えて付ける',
  '  --save-board [MD]  --board が出した画面を、そのまま指摘文書 (MD) へ書き戻す',
  '                (別名 --save)。省略時の書き先は --board が読んだ MD と同じ。',
  '                読んでから書くので、前回の指摘との突合は書き戻しの前に終わる',
  '                (`> 指摘.md` の手リダイレクトは読む前に空にしてしまう)。',
  '                --save-board を付けずに --board を打った run は、最後に',
  '                「控えは更新していません」と言うので、保存忘れに気づける',
  '  --tick ID     この run の tick 名 (既定は環境変数 PUA_TICK)。同じ tick で何度',
  '                打っても無変化の数字は 1 つしか進まない。名乗らない run は',
  '                「N 回連続」と数え方のまま出す',
  '  --if-changed  対象の DSL が前回の控えから変わっていなければ、監査を回さずに',
  '                「変化なし・N tick 連続」と前回の指摘の件数だけを出して終える',
  '                (別名 --stop-if-unchanged)。変わっていれば今までどおり全部回す。',
  '                無変化の tick 数は、この印を付けずに打った回でも要約の先頭に出る',
  '  --no-state    前回比較用の控え (.assist-audit-last.json) を読み書きしない。',
  '                控えは渡した対象の組ごとに分けて持つので、-p primary と',
  '                -p junior,primary を交互に打っても、それぞれが自分の前回と比べる',
  '  --registry [FILE]  表記揺れを「正式表記の登録簿」と突き合わせる。登録済みの組は',
  '                     揃える先を決め直さず、登録簿に無い組だけが「要決定」で残る。',
  '                     既定の置き場は対象フォルダの親の `_names.json` (3 人で共有)',
  '  --register    --registry の「要決定」を、突合が推す綴りで登録簿に書き込む',
  '                (揃える先を変えたいときは、書いた後に _names.json を直す)',
  '  --by NAME     --register が登録簿に残す登録者名 (既定 reviewer)',
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

// --full-diff の引数。all / none はそのまま、それ以外は図名の並び
// (拡張子は付けても付けなくてもよい。控えの名前で打てるようにする)。
function _fullDiffSel(v) {
  const t = String(v == null ? '' : v).trim();
  if (t === 'all' || t === 'none') return t;
  const names = t.split(',').map((x) => x.trim()).filter(Boolean);
  return names.length ? names : 'all';
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

// 下書き台帳の材料。📂 一覧が持っているのと同じ [{ name, mtime, hash }] を
// 保存フォルダから直に採る (name は拡張子なし。swap-queue はこの形だけを見る)。
function draftEntries(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => /\.puml$/i.test(f));
  } catch (e) {
    throw new Error('保存フォルダが読めません: ' + dir + ' — ' + e.message);
  }
  return names.sort().map((f) => {
    const p = path.join(dir, f);
    let text = '';
    try { text = fs.readFileSync(p, 'utf-8'); } catch (e) { text = ''; }
    let mtime = '';
    try { mtime = fs.statSync(p).mtime.toISOString(); } catch (e) { mtime = ''; }
    return { name: f.slice(0, -5), mtime: mtime, hash: auditScope.fingerprint(text) };
  });
}

// --drafts の本体。監査モジュールを読まないので、GUI を開かずに
// 「下書きが何枚あって、そのうち何枚が本体へ差し替え待ちか」だけを 1 本で出す。
function runDrafts(targets) {
  for (const dir of targets) {
    console.log(path.resolve(dir));
    console.log(swapQueue.reportText(swapQueue.build(draftEntries(dir), {})));
  }
  return 0;
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

// ── 正式表記の登録簿 (BLK-reviewer-20260915-0506-wish) ────────────────────
// 置き場は対象フォルダの親。ペルソナごとに保存フォルダが別なので、3 人が
// 同じ 1 冊を見られる場所は親しかない (server.py の /name-registry と同じ)。
function registryPath(opts) {
  if (opts.registryFile) return path.resolve(opts.registryFile);
  for (const t of opts.targets) {
    try {
      if (fs.statSync(t).isDirectory()) return path.join(path.dirname(path.resolve(t)), nameRegistry.FILENAME);
    } catch (e) { /* 次の対象を見る */ }
  }
  return path.join(personaRoot(), nameRegistry.FILENAME);
}

function readRegistry(file) {
  try { return nameRegistry.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { return nameRegistry.empty(); }
}

// --registry / --register の本体。突合の結果を登録簿で 2 つに割る。
//   登録済み … 揃える先はもう決まっている。reviewer は何も決めない
//   要決定   … 登録簿に無い新しい略語。ここだけを 1 回決めて登録する
function runRegistry(opts) {
  const rt = loadMA();
  const docs = report.collectDocs(opts.targets);
  if (docs.length === 0) {
    console.error('対象の .puml が 1 枚もありません: ' + opts.targets.join(', '));
    return 1;
  }
  const NA = rt.MA && rt.MA.nameAudit;
  if (!NA) {
    console.error('名前突合が読み込めません (src/core/name-audit.js)');
    return 1;
  }

  const file = registryPath(opts);
  let reg = readRegistry(file);
  const groups = NA.variants(docs);
  let pend = nameRegistry.pending(reg, groups);

  const lines = [];
  lines.push('登録簿: ' + file);
  if (opts.register && pend.length) {
    const at = new Date().toISOString().slice(0, 10);
    const res = nameRegistry.registerAll(reg, pend, { by: opts.by || 'reviewer', at: at });
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, nameRegistry.format(res.registry), 'utf-8');
    } catch (e) {
      console.error('登録簿に書けません: ' + file + ' — ' + e.message);
      return 1;
    }
    reg = res.registry;
    lines.push('登録しました: ' + res.added + ' 語 (揃える先は突合の推し。変えるなら _names.json を直す)');
    pend = nameRegistry.pending(reg, groups);
  }

  lines.push(nameRegistry.summary(reg));
  nameRegistry.lines(reg).forEach((l) => lines.push('  ' + l));

  const done = nameRegistry.covered(reg, groups);
  lines.push('');
  lines.push('表記揺れ ' + groups.length + ' 組 / 登録済み ' + done.length + ' 組 / 要決定 ' + pend.length + ' 組');
  done.forEach((g) => {
    const e = nameRegistry.find(reg, g.suggested);
    lines.push('  登録済み  ' + g.members.map((m) => m.name).join(' ⇔ ') + ' — 揃える先: ' + e.canonical);
  });
  pend.forEach((g) => {
    lines.push('  要決定    ' + g.members.map((m) => m.name).join(' ⇔ ') + ' — 推し: ' + g.suggested);
    NA.variantLines([g], { max: 1 }).slice(1).forEach((l) => lines.push('  ' + l));
  });
  if (!opts.register && pend.length) {
    lines.push('');
    lines.push('→ 揃える先を登録する: 同じコマンドに --register を足す');
  }
  if (!pend.length) {
    lines.push('→ 決め直す組はありません (登録済みの揺れは junior/primary の入力欄で揃います)');
  }
  console.log(lines.join('\n'));
  return 0;
}

// findings.js の台帳 (追跡中の指摘) を、findings.js と同じ場所の決め方で読む。
// 読めなければ空で返す (台帳が無いことは異常ではない)。
function readLedger(targets) {
  try {
    const file = findingsCli.defaultStateFile(targets || []);
    if (!fs.existsSync(file)) return { file: null, rows: [] };
    const st = findingTracker.readState(JSON.parse(fs.readFileSync(file, 'utf-8')));
    const rows = findingTracker.rows(st)
      // 今回も出ている未解消のものだけ。解消済みを混ぜると、出戻りが継続に見える。
      .filter((r) => r.open && r.present)
      .map((r) => ({ id: r.id, title: r.title, docs: r.docs, since: r.since,
                     tick: r.streak, status: r.state }));
    return { file: file, rows: rows };
  } catch (e) {
    return { file: null, rows: [] };
  }
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
  // BLK-builder-20260926-1512-3-red: 置き場を借りるのは persona-data の中を突き合わせた回だけ。
  // 関係の無いフォルダ (一時フォルダ・別の案件) を突き合わせた回に reviewer の指摘.md を当てると、
  // 別の図の指摘の語 (`Fault` など) が今回の行に当たり、本当の新規が「継続」に化けて 0 件になる。
  if (!targetsInPersonaRoot(opts)) return null;
  try {
    const p = path.join(personaRoot(), 'reviewer', '指摘.md');
    if (fs.existsSync(p)) return p;
  } catch (e) {}
  return null;
}

// 対象のどれかが persona-data (PUA_PERSONA_DATA) の中にあるか。
function targetsInPersonaRoot(opts) {
  let root;
  try { root = path.resolve(personaRoot()); } catch (e) { return false; }
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const r = norm(root);
  return (opts.targets || []).some((t) => {
    const a = norm(path.resolve(t));
    return a === r || a.startsWith(r + path.sep);
  });
}

// 入口で降りた回に出す 1 行。突合を回していないので、前回の指摘文書に何件
// 残ったままかだけを言う (件数が動かないこと自体が「継続 N 件」の答えになる)。
function carriedFindingsLine(opts) {
  let p = null;
  try { p = findingsPath(opts); } catch (e) { p = null; }
  if (!p) return '前回の指摘: 指摘文書が見つかりません (継続件数は数えていません)';
  try {
    const md = fs.readFileSync(p, 'utf-8');
    const tally = unchangedStreak.tallyFromDoc(md);
    const hand = reviewBoard.parseFindings(md).length;
    const head = tally
      ? '前回の指摘: 継続 ' + tally.carried + ' / 解消 ' + tally.resolved + ' / 新規 ' + tally.fresh + ' 件'
      : '前回の指摘: 継続件数の行が見つかりません';
    return head + '（手で書いた節 ' + hand + ' 件）— ' + p + ' (無変化なので突合は回していません)';
  } catch (e) {
    return '前回の指摘: ' + p + ' が読めません — ' + e.message;
  }
}

// --save-board の書き先。読む側 (findingsPath) と違い、まだ 1 度も書いていない
// run でも決まらないと初回が保存できないので、file が無くても置き場を返す。
function boardSavePath(opts) {
  if (opts.saveBoardFile) return path.resolve(opts.saveBoardFile);
  if (opts.boardFile) return path.resolve(opts.boardFile);
  const found = findingsPath(opts);
  if (found) return found;
  // 指摘文書を書くのは reviewer なので、見られる側のフォルダには置かない。
  // persona-data の外を突き合わせた回は reviewer の指摘.md に書き戻さない (名指しさせる)。
  if (!targetsInPersonaRoot(opts)) return null;
  try { return path.join(personaRoot(), 'reviewer', '指摘.md'); } catch (e) { return null; }
}

// 突合結果・前回の指摘文書・前回控えとの差分を 1 枚にする。
// 指摘文書が無ければ「前回の指摘なし」として今回の突合だけを出す
// (初回の run でも同じ 1 本のコマンドで済むようにする)。
function runBoard(result, opts, prev, fmtOpts, prevNote) {
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
  // BLK-reviewer-20260914-2206: 「変わった図」は --names (formatFileDiff) と同じ
  // 同一性判定で数える。改名は diffFiles が中身の指紋で見分けて added から外して
  // いるので、ここでは新しく起こした下書き (`{本体}-編集中.puml`) も除く
  // (--names は「うち新しい下書き N 枚」と別に数えており、本体の図は動いていない)。
  const draftNames = {};
  if (fd) (fd.addedDrafts || []).forEach((f) => { draftNames[f.name] = true; });
  const changed = fd && fd.contentComparable
    ? fd.changed.map((f) => f.name)
      .concat(fd.added.filter((f) => !draftNames[f.name]).map((f) => f.name))
    : [];

  // findings.js が使っている控えと同じ物を、同じ決め方の場所から読む。
  const ledger = readLedger(opts.targets);

  // BLK-reviewer-20260914-2206 (差し戻し 1 回目の芯): 新規かどうかは、前回の
  // 突合結果そのものと実体 id で比べて決める。指摘.md に書かれているかどうかで
  // 決めていた間は、reviewer が書き落とした指摘 (実データの整合/イベント 24 件) が
  // 毎 run 「新規」に出続け、その裏取りが毎 run 手作業で残っていた。
  // 控えは対象の組ごとに分かれている (audit-state) ので、比べるのは同じ対象の前回だけ。
  const prevBoard = prev && prev.audits
    ? auditBoard.build({
      audits: prev.audits,
      svg: prev.audits.svg && prev.audits.svg.status === 'ok' ? prev.audits.svg.result : null,
    })
    : null;

  // BLK-reviewer-20260914-2206 (3 件目): --only で絞った回は、回していない監査の
  // 指摘まで「今回の突合に出ていない = 解消」と出ていた。何を回したかを渡して、
  // 見ていない物は「今回は見ていない」と言わせる。
  const view = reviewBoard.build({ board: b, findings: md, changedFiles: changed,
    ledger: ledger.rows,
    prevRows: prevBoard ? prevBoard.rows : null,
    scope: opts.only && opts.only.length ? opts.only : null });
  const lines = [reviewBoard.markdown(view, 'レビュー結果 — ' + opts.targets.join(' / '))];
  lines.push('前回の指摘文書: ' + (fpath || '(無し。今回の突合だけを出しています)'));
  lines.push('findings.js の台帳: ' + (ledger.file
    ? ledger.file + '（追跡中 ' + ledger.rows.length + ' 件。新規の判定はこの台帳と同じ同一性で行います）'
    : '(無し。指摘文書だけで突き合わせています)'));
  lines.push('新規の判定: ' + (prevBoard
    ? '前回控えの突合結果と実体 id で比較（' + prevBoard.rows.length + ' 行）。'
      + '指摘.md に書かれていない行でも、前回も出ていれば新規に数えません'
    : '(この対象の控えが無いため、今回の行は全部が新規に出ます。次の素の回から比較します)'));
  if (prevNote) lines.push(prevNote);
  lines.push('前回控えとの比較: ' + (base
    ? (fd && fd.contentComparable ? '内容まで比較' : '名前だけ比較 (前回に指紋が無い)')
    : '(控えが無いため比較なし)'));
  // 「変わった図」に数えなかった物は黙って落とさず、--names と同じ語で名指しする
  // (数えたか数えていないかを reviewer が prev/ との手 diff で確かめ直さずに済む)。
  if (fd && fd.contentComparable) {
    if ((fd.renamed || []).length) {
      lines.push('改名 ' + fd.renamed.length + ' 枚: ' + fd.renamed.slice(0, 5).map(
        (r) => r.from + ' → ' + r.to).join(', ')
        + (fd.renamed.length > 5 ? ', ほか ' + (fd.renamed.length - 5) + ' 枚' : '')
        + ' (中身は同じ。変わった図に数えていません)');
    }
    if ((fd.addedDrafts || []).length) {
      lines.push('新しい下書き ' + fd.addedDrafts.length + ' 枚: '
        + fd.addedDrafts.slice(0, 5).map((f) => f.name).join(', ')
        + ' (作業中の控え。変わった図に数えていません)');
    }
    if ((fd.removed || []).length) {
      lines.push('消えた図 ' + fd.removed.length + ' 枚: '
        + fd.removed.slice(0, 5).map((f) => f.name).join(', ') + ' (改名は上の行に分けてあります)');
    }
  }
  lines.push('今回の突合: ' + auditBoard.summaryLine(b));
  if (opts.only && opts.only.length) {
    lines.push('前回控えの更新: 絞った回なので更新していません (次の素の回が前回のまま比べます)');
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { targets: [], only: null, ifChanged: false, tick: null, summary: false, summaryJson: false, out: null, help: false, since: null, sinceFiles: null, state: true, pairsMax: 0, personas: null, versions: false, versionsMax: 6, dashboard: false, board: false, boardFile: null, drafts: false, registry: false, registryFile: null, register: false, by: '', fullDiff: null, fullDiffThreshold: 0 };
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
    // BLK-reviewer-20260914-1706: 手順 2 は毎 tick これだけを打つ。
    // `--only name --summary` の 23 打鍵を 7 打鍵にする (--cohort と同じ理由)。
    else if (a === '--names') { opts.only = ['name']; opts.summary = true; }
    else if (a === '--only') opts.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.indexOf('--only=') === 0) opts.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--since') opts.since = argv[++i];
    else if (a.indexOf('--since=') === 0) opts.since = a.slice(8);
    else if (a === '--since-files') opts.sinceFiles = argv[++i];
    else if (a.indexOf('--since-files=') === 0) opts.sinceFiles = a.slice(14);
    // 手順 4 の突合は毎 tick これを打つので 1 文字の別名を持たせる (--cohort と同じ理由)。
    else if (a === '--personas' || a === '-p') opts.personas = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.indexOf('--personas=') === 0) opts.personas = a.slice(11).split(',').map((s) => s.trim()).filter(Boolean);
    // BLK-reviewer-20260916-0526-wish: 既定は「大きく動いた図だけ全文」。
    // 名前を並べればその図を大きさに関わらず開き、all で全部、none で促しだけにする。
    else if (a === '--full-diff') {
      const nx = argv[i + 1];
      if (nx && nx.indexOf('-') !== 0) { opts.fullDiff = _fullDiffSel(nx); i++; }
      else opts.fullDiff = 'all';
    }
    else if (a.indexOf('--full-diff=') === 0) opts.fullDiff = _fullDiffSel(a.slice(12));
    else if (a === '--no-full-diff') opts.fullDiff = 'none';
    else if (a === '--full-diff-threshold') opts.fullDiffThreshold = _vnum(argv[++i], a);
    else if (a.indexOf('--full-diff-threshold=') === 0) opts.fullDiffThreshold = _vnum(a.slice(22), '--full-diff-threshold');
    else if (a === '--pairs-max') opts.pairsMax = _num(argv[++i], a);
    else if (a.indexOf('--pairs-max=') === 0) opts.pairsMax = _num(a.slice(12), '--pairs-max');
    else if (a === '--drafts') opts.drafts = true;
    else if (a === '--dashboard') opts.dashboard = true;
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
    // BLK-reviewer-20260917-0323: --board の結果を指摘文書へ書き戻す。--board と
    // 同じく引数は任意 (省けば --board が読んだ MD と同じ場所へ書く)。
    else if (a === '--save-board' || a === '--save') {
      opts.saveBoard = true;
      const next = argv[i + 1];
      if (next && next.indexOf('--') !== 0 && /\.(md|markdown)$/i.test(next)) opts.saveBoardFile = argv[++i];
    }
    else if (a.indexOf('--save-board=') === 0) { opts.saveBoard = true; opts.saveBoardFile = a.slice(13); }
    // --registry も引数を任意で取る。次が対象パスのときは食べない (--board と同じ)。
    else if (a === '--registry') {
      opts.registry = true;
      const next = argv[i + 1];
      if (next && next.indexOf('--') !== 0 && /\.json$/i.test(next)) opts.registryFile = argv[++i];
    }
    else if (a.indexOf('--registry=') === 0) { opts.registry = true; opts.registryFile = a.slice(11); }
    else if (a === '--register') { opts.registry = true; opts.register = true; }
    else if (a === '--by') opts.by = String(argv[++i] || '').trim();
    else if (a.indexOf('--by=') === 0) opts.by = a.slice(5).trim();
    else if (a === '--no-state') opts.state = false;
    // BLK-reviewer-20260917-0523: 無変化の tick は入口で降りる。
    else if (a === '--if-changed' || a === '--stop-if-unchanged') opts.ifChanged = true;
    else if (a === '--tick') opts.tick = argv[++i];
    else if (a.indexOf('--tick=') === 0) opts.tick = a.slice(7);
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

  // --drafts も監査ではなく「保存フォルダの下書き台帳」。GUI を開かずに
  // 「本体へ差し替え待ちの下書き」を名指しするのがここ。
  if (opts.drafts) {
    try {
      return runDrafts(opts.targets);
    } catch (e) {
      console.error(e.message);
      return 1;
    }
  }

  // --dashboard は「6 つの出口を 1 枚に畳んだ表」。畳み方は tools/dashboard.js が持つ
  // (GUI と共通の src/core/status-dashboard.js を呼ぶ口はここと CLI の 2 つだけ)。
  if (opts.dashboard) {
    return require('./dashboard').main(opts.targets, null);
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

  // --registry は監査の件数表ではなく「揃える先が決まっているか」だけを見る口。
  if (opts.registry) {
    try {
      return runRegistry(opts);
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

  // BLK-reviewer-20260917-0523-wish: 監査を回す前に「前回の控えから中身が変わったか」を
  // 決める。無変化の tick 数はここでしか分からず、ここで分かれば全部回さずに降りられる。
  const markPath = path.resolve(STATE_FILE);
  const markStore = opts.state ? readStore(markPath) : { scopes: {} };
  const mark = unchangedStreak.advance(
    opts.state ? auditState.pickMark(markStore, opts.targets) : null,
    unchangedStreak.folderFingerprint(auditScope.fileEntries(docs)),
    new Date().toISOString(),
    opts.tick || process.env.PUA_TICK || null);
  const markLine = unchangedStreak.describe(mark);
  if (opts.ifChanged && unchangedStreak.isUnchanged(mark)) {
    console.log(markLine);
    console.log(carriedFindingsLine(opts));
    if (opts.state) saveMark(markPath, opts.targets, mark);
    return 0;
  }

  const result = report.buildReport(rt.MA, docs, { targets: opts.targets, only: opts.only });
  // 読み込みに失敗したモジュールは黙って落とさない。監査結果が「0 件」でも
  // それが「問題なし」なのか「見ていない」なのかを読む側が区別できるようにする。
  if (rt.errors.length) result.loadErrors = rt.errors;

  // BLK-reviewer-20260907-2203: 件数表だけでは「同じ 5 件」の中身が入れ替わった
  // ことも、監査側にカテゴリが新設されたことも読めない。前回の控えを既定で
  // 読み書きし、--summary に差分を足す。--since で控え以外の JSON とも比べられる。
  const statePath = path.resolve(STATE_FILE);
  // BLK-reviewer-20260914-2206 (3 件目): --only / --cohort / --names で絞った回の
  // 結果で控えを上書きすると、次の素の回が「回さなかった監査の指摘は前回 0 件だった」
  // と読み、同じ指摘を新規として出し直す。呼び出しの順序だけで新規/継続がぶれる
  // のはここが根。絞った回は読むだけで、控えは全部回した回だけが書き替える。
  const partial = !!(opts.only && opts.only.length);
  let prev = null;
  // 控えがどの対象のいつの物か。--board / --summary に必ず 1 行出して、
  // 「今の数字が何と比べた数字か」を手で裏取りせずに読めるようにする。
  let prevNote = null;
  // BLK-reviewer-20260908-0203 (0723 追記): 指紋を載せる前に採った JSON と比べる run は
  // 「追えない」で終わり、その 1 回だけは 22 枚の手 diff に戻っていた。前回の図が
  // フォルダで残っているなら、そこから指紋を採り直して同じ 1 回で内容変化を出す。
  const fmtOpts = {};
  // --board も前回との比較を使う (前回控えから変わった図を同じ画面に並べる)。
  if (opts.summary || opts.board) {
    if (opts.since) {
      prev = readReport(path.resolve(opts.since));
      if (!prev) {
        console.error('前回の監査 JSON が読めません: ' + opts.since);
        return 1;
      }
      const bad = scopeMismatch(prev.targets, opts.targets);
      if (bad) { prev = null; prevNote = '前回控え: ' + bad; }
      else prevNote = '前回控え: ' + auditState.describe({ targets: prev.targets, savedAt: prev.generatedAt });
    } else if (opts.state) {
      // 対象の組ごとに別の控えを見る。別の対象で採った控えとは比べない
      // (比べると、図が無差分でも全枚が「変わった図」に、指摘が全件「新規」に出る)。
      const entry = auditState.pick(readStore(statePath), opts.targets);
      prev = entry ? entry.report : null;
      prevNote = '前回控え: ' + auditState.describe(entry);
    }
    if (opts.pairsMax) fmtOpts.pairsMax = opts.pairsMax;
    if (opts.fullDiff) fmtOpts.fullDiff = opts.fullDiff;
    if (opts.fullDiffThreshold) fmtOpts.fullDiffThreshold = opts.fullDiffThreshold;
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
      // BLK-reviewer-20260916-0046: 控えの本文はここで既に読んでいる。
      // 現物と一緒に渡して、変わった図の「消えた行」まで同じ出力に添える
      // (添えないと、指摘を書くために控えと現物を手 diff し直すことになる)。
      fmtOpts.prevDocs = prevDocs;
      fmtOpts.curDocs = docs;
      fmtOpts.MA = rt.MA;
    }
  } else if (opts.sinceFiles) {
    console.error('--since-files は --summary か --board と一緒に使います');
    return 1;
  }
  // 書き戻すのは --board が作る画面なので、--board が無ければ書くものが無い。
  if (opts.saveBoard && !opts.board) {
    console.error('--save-board は --board と一緒に使います (書き戻すのは --board の画面です)');
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
    // 画面と控えは同じ本文にする。標準出力に出したものがそのまま指摘文書に
    // 残るので、「画面では見たのに控えには無い」がそもそも起こらない。
    let boardText = markLine + '\n' + runBoard(result, opts, prev, fmtOpts, prevNote);
    if (opts.summary) boardText += '\n' + report.formatSummary(result, prev, fmtOpts);
    console.log(boardText);
    if (opts.saveBoard) {
      const dest = boardSavePath(opts);
      if (!dest) {
        console.error('書き戻し先の指摘文書が決まりません。--save-board 指摘.md のように名指ししてください');
        return 1;
      }
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        // BLK-reviewer-20260917-0423-friction: 画面をそのまま上書きすると、reviewer が
        // 手で書いた指摘 (と、そこにしか無い継続 tick 数) が消え、次の run はその
        // 自動生成を指摘として読み直して見出しが箇条書きに入れ子で潰れる。
        // 手で書いた部分は残し、自動生成の塊だけを差し替える。
        let before = '';
        try { before = fs.readFileSync(dest, 'utf-8'); } catch (e) { before = ''; }
        fs.writeFileSync(dest, reviewBoard.mergeIntoDoc(before, boardText), 'utf-8');
        const keptFindings = reviewBoard.parseFindings(before).length;
        console.error('指摘文書を更新しました: ' + dest
          + '（手で書いた ' + keptFindings + ' 件はそのまま残し、自動生成の節だけ差し替えました）');
      } catch (e) {
        console.error('指摘文書に書けません: ' + dest + ' — ' + e.message);
        return 1;
      }
    } else {
      // 保存忘れは「次回の突合が古い指摘文書のまま進む」形で後から効くので、
      // 黙って終わらない (BLK-reviewer-20260917-0323)。
      console.error('控えは更新していません (--save-board で ' + (boardSavePath(opts) || '指摘.md') + ' に書き戻せます)');
    }
    // --summary-json と併記されたら、画面の後ろに要約 JSON も出す
    // (読む口と機械で読む口を 1 回の実行で両方取れるようにする)。
    if (viewJson) console.log('\n' + viewJson);
    if (opts.state && !partial) {
      saveState(statePath, opts.targets, result, mark);
    } else if (opts.state) {
      saveMark(statePath, opts.targets, mark);
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
    if (opts.summary) console.log(markLine + '\n' + report.formatSummary(result, prev, fmtOpts));
  } else if (viewJson) {
    console.log(viewJson);
    if (opts.summary) console.log(markLine + '\n' + report.formatSummary(result, prev, fmtOpts));
  } else if (opts.summary) {
    console.log(markLine);
    console.log(report.formatSummary(result, prev, fmtOpts));
    if (prevNote) console.log(prevNote);
  } else {
    console.log(json);
  }
  // 次回の比較のために控えを置く。書けない場所でも監査自体は成功させる。
  if (opts.state && !partial) {
    saveState(statePath, opts.targets, result, mark);
  } else if (opts.state) {
    // BLK-human-20260924-1640: 無変化 tick の印は図のファイル構成の指紋で、指摘の中身とは独立している。
    // 絞った回でも印だけは書き戻す (控えの report は上の理由で書き替えない)。書かないと
    // --cohort でしか回さない対象の組は印が一度も残らず、毎回「今回が最初の控え」になる。
    saveMark(statePath, opts.targets, mark);
  }
  if (rt.errors.length) {
    for (const e of rt.errors) console.error('読み込み失敗: ' + e.file + ' — ' + e.message);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, USAGE };
