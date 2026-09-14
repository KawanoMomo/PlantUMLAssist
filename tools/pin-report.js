'use strict';

// pin-report — 指摘の着手状況 (未着手 / 着手 / 解消) を、ブラウザ抜きで組み立てる。
//
// BLK-reviewer-20260908-1803-wish: 仕分けの規則 (src/core/pin-progress.js) も
// 受信箱の収集 (src/core/pin-inbox.js) も純関数だが、これを呼ぶ側は
// `src/app.js` の 📥 指摘箱しかなかった。reviewer はブラウザを開かない運用のため、
// 「前回の依頼が着手されたか」を `audit.js --since-files` で保存フォルダの
// 全図の指紋を控えと突き合わせて読み取っていた (17 枚全部)。
//
// ここは audit-report と同じ役どころ: MA と docs を受け取って結果の形を決め、
// 人が読む要約も作る。ファイルにも標準出力にも触らない (それは tools/pins.js)。
//
// 控え (memo) の持ち方だけが画面と違う。画面は localStorage、CLI はファイル。
// pin-progress.observe は控えを引数で受け取り新しい控えを返すので、
// 置き場所を変えるだけで同じ仕分けがそのまま動く。

// 状況ごとの並び順。pin-progress.sort と同じ (未着手 → 着手 → 解消)。
function build(MA, docs, memo, options) {
  const opts = options || {};
  const PI = MA && MA.pinInbox;
  const PP = MA && MA.pinProgress;
  if (!PI || !PP) throw new Error('pin-inbox / pin-progress が読み込めていません');

  const now = opts.now || new Date().toISOString();
  let items = PI.collect(docs || []);
  const author = String(opts.author == null ? '' : opts.author).trim().toLowerCase();
  if (author) {
    items = items.filter((p) => String(p && p.author == null ? '' : p.author).trim().toLowerCase() === author);
  }

  // 控えは仕分けの前に読む。observe は渡された控えを書き換えず新しい控えを返す。
  const res = PP.observe(items, docs || [], memo || {}, { now: now });
  const shown = opts.all ? res.entries : PP.openOnly(res.entries);

  const entries = PP.sort(shown).map((e) => ({
    key: e.key,
    id: String(e.item.id == null ? '' : e.item.id),
    doc: String(e.item.doc == null ? '' : e.item.doc),
    line: e.item.stale ? 0 : e.item.line,
    stale: !!e.item.stale,
    state: e.item.state,
    author: String(e.item.author == null ? '' : e.item.author),
    at: String(e.item.at == null ? '' : e.item.at),
    text: String(e.item.text == null ? '' : e.item.text),
    status: e.status,
    label: e.label,
    why: e.why,
    passes: e.passes,
    age: e.age,
    reply: e.reply ? { verdict: e.reply.verdict, at: e.reply.at || '', text: e.reply.text || '' } : null,
  }));

  return {
    generatedAt: now,
    // 要約は「全件」で取る。--all を付けていなくても解消の数は読みたい
    // (反映確認は「解消が増えたか」で終わる)。
    summary: PP.summary(res.entries),
    head: PP.headText(PP.summary(res.entries)),
    entries: entries,
    shownAll: !!opts.all,
    docs: (docs || []).length,
    memo: res.memo,
  };
}

// 1 件を 2 行で言う。1 行目が札 (未着手 · 12 時間前 · 見送り 2 回)、
// 2 行目が指摘そのもの。grep で状況を絞れるよう、札は必ず行頭に置く。
function formatEntry(e) {
  const badge = [e.label];
  if (e.age) badge.push(e.age);
  if (e.passes > 0) badge.push('見送り ' + e.passes + ' 回');
  const where = e.stale ? '行が見つかりません' : ('L' + e.line);
  const head = badge.join(' · ') + '  ' + e.doc + ' ' + where + ' #' + e.id
    + (e.author ? ' ・ ' + e.author : '');
  const lines = [head, '    ' + e.text, '    → ' + e.why];
  if (e.reply) lines.push('    応答: ' + e.reply.verdict + (e.reply.text ? ' — ' + e.reply.text : ''));
  return lines.join('\n');
}

function formatSummary(result, options) {
  const opts = options || {};
  const out = [];
  out.push('指摘の着手状況' + (opts.from ? ' — ' + opts.from : '') + ' (' + result.docs + ' 図)');
  out.push(result.head);
  if (opts.stateFile) {
    out.push('控え: ' + opts.stateFile + (opts.stateAt ? ' (前回 ' + opts.stateAt + ')' : ' (前回なし)'));
  }
  out.push('');
  if (result.entries.length === 0) {
    out.push(result.shownAll ? '指摘は 1 件もありません' : '未解消の指摘はありません');
  } else {
    result.entries.forEach((e) => { out.push(formatEntry(e)); out.push(''); });
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

module.exports = { build, formatEntry, formatSummary };
