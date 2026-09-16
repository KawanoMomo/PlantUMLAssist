'use strict';

(function () {

// blk-triage.js — 起票しようとしている本文を、過去の BLK 群に先に突き合わせる。
//
// BLK-reviewer-20260917-0223: BLK を新規起票してよいか (同じ操作種別の friction が
// open/done に 3 件以上あるか、状態ファイルのパス違いのように過去の BLK と同じ現象か)
// を、毎回 grep で目で数えていた。「1 件前はあるが 3 件目ではない」という際どい判定を
// 毎 tick 手作業でやり直すことになる。
//
// ここは下書き 1 本を受け取り、(1) 操作種別のカテゴリを当て、(2) 同カテゴリ・同種別の
// 既存 BLK を数えてしきい値 (既定 3) への到達を言い、(3) 類似の過去 BLK を近い順に出す。
// 判定の材料を並べるだけでなく「新規起票してよい」「追記せよ」まで言い切るのが目的
// (材料だけ出すと、結局そこから人が数え直すことになる)。

// 操作種別。reviewer/primary/junior の BLK 本文に実際に出る語から引いた分類で、
// 1 件が複数に当たることはある (点数の高い方を主とし、次点も残す)。
const CATEGORIES = [
  { name: 'BLK 運用・確認', keys: ['BLK', '起票', '差し戻し', 'blk-check', '実装ログ', 'done', 'known-red', '抑制', 'しきい値', '重複'] },
  { name: '指摘・findings 管理', keys: ['指摘', 'findings', 'finding', 'F-0', '📌', 'pins', '継続 tick', '解消', 'ID 化', 'IDを'] },
  { name: 'SVG・描画の実体', keys: ['SVG', 'svg', 'render', '描画', '再描画', 'スタンプ', 'sha1', 'レイアウト', '重なり', '切れ'] },
  { name: '命名規約・表記揺れ', keys: ['命名', '規約', '表記揺れ', '略語', '接頭辞', '大文字', 'participant 名', '名前の不一致', 'rename', '統一'] },
  { name: '突合・整合', keys: ['突合', '整合', '一致', '不一致', '対応', 'シグネチャ', '粒度', '遷移ラベル', 'クラス図', 'シーケンス'] },
  { name: '保存・状態ファイル', keys: ['保存', '状態ファイル', 'autosave', '自動保存', 'mtime', 'パス', '控え', 'フォルダ', '書き出し', '消失'] },
  { name: '差分・比較', keys: ['差分', 'diff', '比較', '前回', '変更前', '並べ', '--since', '巻き戻', '履歴'] },
  { name: 'CLI オプション・出力', keys: ['オプション', '--board', '--json', 'CLI', 'コマンド', '引数', '出力', '誤表示', '誤カウント', '省略記法'] },
  { name: 'DSL 編集・パース', keys: ['DSL', 'puml', 'パース', '構文', '行番号', '挿入', '編集', 'エディタ'] },
  { name: '画面・パネル操作', keys: ['パネル', 'タブ', 'ボタン', 'クリック', '右ペイン', '左レール', 'モーダル', '画面', 'パレット', 'Ctrl+K'] },
];

const THRESHOLD = 3;

// 「同じ現象」と言い切る類似度。この corpus (BLK 439 件) で friction の
// top-1 類似度を測ると中央値 0.31、0.45 以上は 103 件中 8 件で、その 8 件は
// 同じ穴の friction/wish 対や連番の再起票だった。0.5 では 2 件しか残らず
// 取り違えを拾えないので、knee の 0.45 を既定にする。
const SAME = 0.45;
// 同一とまでは言えないが目で見る値打ちのある帯。
const BORDERLINE = 0.35;

// 種別。BLK の frontmatter は kind: wish / depth: friction / depth: blocked。
function kindOf(blk) {
  if (blk.kind === 'wish') return 'wish';
  if (blk.depth === 'friction') return 'friction';
  return 'blocked';
}

function splitLines(text) {
  return String(text == null ? '' : text).split(/\r\n|\r|\n/);
}

function normalize(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ');
}

// frontmatter を持つ BLK ファイルを、突き合わせに要る欄だけ読む。
// 書式が欠けていてもその欄が空になるだけ (blk-digest と同じ約束)。
function parse(text, opts) {
  const options = opts || {};
  const lines = splitLines(text);
  const front = {};
  let bodyFrom = 0;
  if (lines[0] === '---') {
    let i = 1;
    for (; i < lines.length; i += 1) {
      if (lines[i] === '---') { i += 1; break; }
      const m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(lines[i]);
      if (m) front[m[1]] = m[2].trim();
    }
    bodyFrom = i;
  }
  const body = lines.slice(bodyFrom).join('\n');
  const blk = {
    id: front.id || options.name || '',
    persona: front.persona || '',
    depth: front.depth || '',
    kind: front.kind || '',
    status: (/^([A-Za-z]+)/.exec(front.status || '') || [])[1] || '',
    task: front.task || '',
    body: body,
    // 起票の判断に効くのは「詰まった経緯」なので、できるようになったこと以降
    // (builder が後から足す実装ログ) は突き合わせから外す。
    text: front.task + '\n' + body.split(/^できるようになったこと\s*[:：]/m)[0],
  };
  blk.kindName = kindOf(blk);
  return blk;
}

// 語の切り出し。英字の識別子・パス・オプションはそのまま、日本語は 2-gram。
// 形態素解析を入れないのは、対象が 1 リポジトリの語彙に閉じているため。
const ASCII_RE = /--?[A-Za-z][\w-]+|[A-Za-z][\w.\/-]{2,}/g;
const JA_RUN_RE = /[぀-ヿ一-鿿]{2,}/g;
const ASCII_STOP = {
  the: 1, and: 1, for: 1, that: 1, with: 1, this: 1, not: 1, but: 1, are: 1, was: 1,
};
const JA_STOP = {
  'する': 1, 'して': 1, 'した': 1, 'ある': 1, 'いる': 1, 'これ': 1, 'それ': 1, 'この': 1,
  'その': 1, 'から': 1, 'まで': 1, 'こと': 1, 'ため': 1, 'よう': 1, 'なる': 1, 'ない': 1,
  'れる': 1, 'られ': 1, 'てい': 1, 'もの': 1, 'ので': 1, 'とき': 1, 'every': 1,
};

function tokens(text) {
  const src = normalize(text);
  const out = [];
  let m;
  ASCII_RE.lastIndex = 0;
  while ((m = ASCII_RE.exec(src))) {
    const t = m[0].toLowerCase();
    if (!ASCII_STOP[t]) out.push(t);
  }
  JA_RUN_RE.lastIndex = 0;
  while ((m = JA_RUN_RE.exec(src))) {
    const run = m[0];
    for (let i = 0; i + 2 <= run.length; i += 1) {
      const g = run.slice(i, i + 2);
      if (!JA_STOP[g]) out.push(g);
    }
  }
  return out;
}

function countMap(list) {
  const map = Object.create(null);
  list.forEach(function (t) { map[t] = (map[t] || 0) + 1; });
  return map;
}

// カテゴリ判定。長い語ほど当たったときの情報量が大きいので重みにする。
function classify(text) {
  const src = normalize(text).toLowerCase();
  const scored = CATEGORIES.map(function (cat) {
    const hits = cat.keys.filter(function (k) { return src.indexOf(k.toLowerCase()) >= 0; });
    const score = hits.reduce(function (s, k) { return s + Math.min(k.length, 8); }, 0);
    return { name: cat.name, score: score, hits: hits };
  }).filter(function (c) { return c.score > 0; });
  scored.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); });
  return scored;
}

function categoryOf(text) {
  const scored = classify(text);
  return scored.length ? scored[0].name : '未分類';
}

// idf は corpus 全体から。1 リポジトリに 400 件あるので、共通語 (BLK, 手順…) が
// 効きすぎて何にでも似てしまうのを抑える。
function buildIdf(blks) {
  const df = Object.create(null);
  blks.forEach(function (b) {
    const seen = Object.create(null);
    tokens(b.text).forEach(function (t) {
      if (seen[t]) return;
      seen[t] = 1;
      df[t] = (df[t] || 0) + 1;
    });
  });
  const n = blks.length || 1;
  return function (t) { return Math.log((n + 1) / ((df[t] || 0) + 1)) + 1; };
}

function cosine(aMap, bMap, idf) {
  let dot = 0; let na = 0; let nb = 0;
  Object.keys(aMap).forEach(function (t) {
    const w = aMap[t] * idf(t);
    na += w * w;
    if (bMap[t]) dot += w * (bMap[t] * idf(t));
  });
  Object.keys(bMap).forEach(function (t) {
    const w = bMap[t] * idf(t);
    nb += w * w;
  });
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

// 似ている根拠。点数だけ出されても「同じ現象か」は判断できないので、
// 効いた語を重い順に返す。
function sharedTerms(aMap, bMap, idf, max) {
  const shared = Object.keys(aMap).filter(function (t) { return bMap[t]; });
  shared.sort(function (x, y) { return (bMap[y] * idf(y)) - (bMap[x] * idf(x)); });
  const out = [];
  const seen = Object.create(null);
  shared.forEach(function (t) {
    if (out.length >= (max || 6)) return;
    // 2-gram は隣り合うと重複して見えるので、含まれる方は落とす。
    if (out.some(function (o) { return o.indexOf(t) >= 0; })) return;
    if (seen[t]) return;
    seen[t] = 1;
    out.push(t);
  });
  return out;
}

const COUNTED = { open: 1, done: 1, building: 1, stuck: 1 };

// 下書き 1 本を corpus に突き合わせる。
//   draft: { text, kind, persona }   blks: parse() 済みの配列
function triage(draft, blks, opts) {
  const options = opts || {};
  const threshold = options.threshold || THRESHOLD;
  const topN = options.top || 5;
  const scored = classify(draft.text);
  const category = scored.length ? scored[0].name : '未分類';
  const kind = draft.kind || 'friction';
  const self = draft.id || '';

  const corpus = blks.filter(function (b) { return b.id !== self; });
  const idf = buildIdf(corpus);
  const draftMap = countMap(tokens(draft.text));

  // 同カテゴリ・同種別の既存 (wontfix は起票が退けられた分なので数に入れない)。
  const cohort = corpus.filter(function (b) {
    if (b.kindName !== kind) return false;
    if (!COUNTED[b.status]) return false;
    return categoryOf(b.text) === category;
  });
  cohort.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });

  const similar = corpus.map(function (b) {
    const map = countMap(tokens(b.text));
    return {
      id: b.id,
      status: b.status,
      kindName: b.kindName,
      persona: b.persona,
      task: b.task,
      score: cosine(draftMap, map, idf),
      shared: sharedTerms(draftMap, map, idf, 6),
    };
  }).filter(function (s) { return s.score > 0; });
  similar.sort(function (a, b) { return b.score - a.score || String(a.id).localeCompare(String(b.id)); });
  const top = similar.slice(0, topN);

  // 判定。同じ現象が既にあるなら追記、同カテゴリが積み上がっているなら追記、
  // どちらでもなければ新規起票。
  const same = options.sameThreshold || SAME;
  const near = top.filter(function (s) { return s.score >= same; });
  const borderline = top.filter(function (s) {
    return s.score < same && s.score >= (options.borderline || BORDERLINE);
  });
  const reached = cohort.length >= threshold;
  let verdict; let reason;
  if (near.length) {
    verdict = '追記せよ';
    reason = '同じ現象の BLK がある (' + near[0].id + ' 類似度 ' + near[0].score.toFixed(2) +
      ' ≥ ' + same.toFixed(2) + ')';
  } else if (reached) {
    verdict = '追記せよ';
    reason = '同カテゴリ「' + category + '」の ' + kind + ' が既に ' + cohort.length +
      ' 件でしきい値 ' + threshold + ' に到達';
  } else {
    verdict = '新規起票してよい';
    reason = '同カテゴリ「' + category + '」の ' + kind + ' は ' + cohort.length +
      ' 件でしきい値 ' + threshold + ' に未達、類似度 ' +
      (top.length ? top[0].score.toFixed(2) : '0.00') + ' も同一現象の線 ' + same.toFixed(2) + ' に届かない';
  }

  return {
    category: category,
    categories: scored.slice(0, 3),
    kind: kind,
    threshold: threshold,
    cohort: cohort.map(function (b) {
      return { id: b.id, status: b.status, persona: b.persona, task: b.task };
    }),
    reached: reached,
    similar: top,
    near: near,
    borderline: borderline,
    same: same,
    verdict: verdict,
    reason: reason,
  };
}

// 画面 1 枚ぶんの行。数え直さずに済むのが目的なので、件数・しきい値・判定を
// 先頭に置き、根拠 (同カテゴリの列挙と類似候補) を後ろに付ける。
function report(result, opts) {
  const options = opts || {};
  const out = [];
  out.push('⇒ ' + '「' + result.verdict + '」  ' + result.reason);
  // 際どい帯は判定を変えないが、黙って捨てると結局 grep し直すことになる。
  if (result.verdict === '新規起票してよい' && result.borderline.length) {
    out.push('   ただし「要確認」: ' + result.borderline.map(function (s) {
      return s.id + ' ' + s.score.toFixed(2);
    }).join(', ') + ' が同一の線 ' + result.same.toFixed(2) + ' の手前にある');
  }
  out.push('');
  out.push('カテゴリ: ' + result.category +
    (result.categories.length > 1 ? '  (次点: ' + result.categories.slice(1).map(function (c) { return c.name; }).join(' / ') + ')' : ''));
  out.push('同カテゴリの ' + result.kind + ': ' + result.cohort.length + ' 件 / しきい値 ' +
    result.threshold + ' — ' + (result.reached ? '到達' : '未達'));
  result.cohort.forEach(function (b) {
    out.push('  - ' + b.id + ' [' + (b.status || '?') + '] ' + (b.task || '').slice(0, options.width || 60));
  });
  if (!result.cohort.length) out.push('  (同カテゴリの既存なし)');
  out.push('');
  out.push('類似の過去 BLK (近い順):');
  if (!result.similar.length) out.push('  (似たものなし)');
  result.similar.forEach(function (s) {
    out.push('  ' + s.score.toFixed(2) + '  ' + s.id + ' [' + (s.status || '?') + '/' + s.kindName + '] ' +
      (s.task || '').slice(0, options.width || 60));
    if (s.shared.length) out.push('        共通語: ' + s.shared.join(' · '));
  });
  return out;
}

  var api = {
    CATEGORIES: CATEGORIES,
    THRESHOLD: THRESHOLD,
    SAME: SAME,
    BORDERLINE: BORDERLINE,
    parse: parse,
    kindOf: kindOf,
    tokens: tokens,
    classify: classify,
    categoryOf: categoryOf,
    triage: triage,
    report: report,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.blkTriage = api;
  }
})();
