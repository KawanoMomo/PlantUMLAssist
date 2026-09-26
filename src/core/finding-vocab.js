'use strict';
window.MA = window.MA || {};

// finding-vocab — 指摘 1 件に付く「対応状況の札」の語彙を 1 つに決める。
//
// BLK-owner-20260923-1409-prune: 「指摘を集め、1 件ごとに札を付けて一覧する」機能が
// 4 か所にあり、札の語彙がばらばらだった。同じ 1 件が 📥 指摘箱では「未対応」、
// 🔖 手動指摘では「要再確認」、📂 一覧では「⚠未確認」と、画面ごとに違う状態に見え、
// 下端の件数も 🔖 と 📥 が別勘定になりうる。
//
// 正本は 📥 指摘箱の 4 つ (pin-verify の判定と同じ):
//   未対応     — まだ直っていない
//   SVG 未反映 — puml は直ったが、保存中の SVG が今の puml を描いた結果ではない
//   反映済み   — 直り、SVG も一致している。依頼は終わっている
//   確かめられず — 確かめていない / 確かめられなかった。分からないことを「反映済み」と言わない
// 他の画面が持っていた札は、ここで 4 つへの対応付けにする。「対象外」は札ではなく
// 絞り込み条件 (指摘の対象になっていない図) なので、VERDICT には入れない。
//
// 出典 (監査が出した / 手で書いた) は札ではない。同じ札の中で見分ける列として持つ。
//
// DOM にもサーバにも触らない。描画は app.js。
window.MA.findingVocab = (function() {

  var VERDICT = {
    open: {
      key: 'open', label: '未対応', done: false,
      title: 'まだ直っていません',
    },
    'puml-only': {
      key: 'puml-only', label: 'SVG 未反映', done: false,
      title: 'puml は直りましたが、保存中の SVG は今の puml を描いた結果ではありません',
    },
    reflected: {
      key: 'reflected', label: '反映済み', done: true,
      title: 'puml が直り、SVG も今の puml と一致しています',
    },
    unknown: {
      key: 'unknown', label: '確かめられず', done: false,
      title: '確かめていないので、反映されたとは言えません',
    },
  };

  // 並べ替えの順。未対応を先に、終わったものを後ろに。
  var ORDER = ['open', 'puml-only', 'unknown', 'reflected'];

  var SOURCE = {
    audit: { key: 'audit', label: '監査が出した', title: '監査ツールが機械で拾った指摘です' },
    manual: { key: 'manual', label: '手で書いた', title: '人が図を読んで書いた指摘です' },
  };

  function _s(v) { return v == null ? '' : String(v); }

  function has(key) { return Object.prototype.hasOwnProperty.call(VERDICT, _s(key)); }

  function verdict(key) { return has(key) ? VERDICT[_s(key)] : VERDICT.unknown; }

  function label(key) { return verdict(key).label; }

  function title(key) { return verdict(key).title; }

  function isDone(key) { return !!verdict(key).done; }

  function order() { return ORDER.slice(); }

  function rank(key) {
    var i = ORDER.indexOf(_s(key));
    return i < 0 ? ORDER.length : i;
  }

  function source(key) {
    return Object.prototype.hasOwnProperty.call(SOURCE, _s(key)) ? SOURCE[_s(key)] : SOURCE.audit;
  }

  // ---- 他の画面の札 → 正本の 4 つ ------------------------------------------

  // 🔖 手動指摘 (manual-findings.review の 1 行)。
  //   keep=true  (未変更 / 行移動) — 前回判定を維持する。前回判定が「解消」なら反映済み、
  //                                 そうでなければ未対応。判定がまだ無いものも未対応。
  //   keep=false (要再確認 / 行が消えた / 図が無い) — 確かめ直すまで何とも言えない。
  // 「未変更のため前回判定を維持」という言い方は札ではなく根拠なので、why として残す。
  function fromManual(row) {
    if (!row) return { key: 'unknown', why: '' };
    var why = _s(row.title) || _s(row.label);
    if (!row.keep) return { key: 'unknown', why: why };
    var v = _s(row.verdict);
    if (/解消|対応済|反映|直/.test(v) && !/未解消|未対応|未反映/.test(v)) {
      return { key: 'reflected', why: why + (v ? '（前回判定: ' + v + '）' : '') };
    }
    return { key: 'open', why: why + (v ? '（前回判定: ' + v + '）' : '') };
  }

  // 📂 一覧の反映状況 (note-board の BADGE キー)。
  //   off  — 指摘の対象になっていない図。札ではなく絞り込み条件なので null を返す
  //   todo — この図あての指摘はあるが、反映されたかは確かめていない → 確かめられず
  //   done — 本文を見るかぎり反映済み → 反映済み
  function fromNote(key) {
    var k = _s(key);
    if (k === 'done') return 'reflected';
    if (k === 'todo') return 'unknown';
    return null;   // off = 絞り込み条件
  }

  // 📂 一覧のバッジ文字。off だけは札ではないので、そのまま「対象外」と言う。
  function noteMark(key) {
    var v = fromNote(key);
    if (!v) return '対象外';
    return (v === 'reflected' ? '✓' : '⚠') + label(v);
  }

  // ---- 数える --------------------------------------------------------------

  // 同じ 1 件を二重に数えないための鍵。出典が違っても、同じ図の同じ行に対する
  // 同じ文面は 1 件。下端のステータスバーはこの鍵で数える。
  function countKey(item) {
    if (!item) return '';
    var doc = _s(item.doc);
    var line = item.line == null ? '' : String(item.line);
    var text = _s(item.text).replace(/\s+/g, ' ').trim();
    if (text) return doc + '@' + line + '|' + text;
    return doc + '#' + _s(item.id);
  }

  // 未終了 (= 反映済み以外) を、同じ鍵で 1 件に畳んで数える。
  function pendingCount(items) {
    var seen = {}, n = 0;
    (Array.isArray(items) ? items : []).forEach(function(it) {
      if (!it) return;
      if (isDone(it.verdictKey)) return;
      var k = countKey(it);
      if (seen[k]) return;
      seen[k] = true;
      n++;
    });
    return n;
  }

  function totalCount(items) {
    var seen = {}, n = 0;
    (Array.isArray(items) ? items : []).forEach(function(it) {
      if (!it) return;
      var k = countKey(it);
      if (seen[k]) return;
      seen[k] = true;
      n++;
    });
    return n;
  }

  // 札ごとの内訳。
  function summary(items) {
    var s = { total: 0, pending: 0, open: 0, 'puml-only': 0, reflected: 0, unknown: 0 };
    var seen = {};
    (Array.isArray(items) ? items : []).forEach(function(it) {
      if (!it) return;
      var k = countKey(it);
      if (seen[k]) return;
      seen[k] = true;
      var key = has(it.verdictKey) ? _s(it.verdictKey) : 'unknown';
      s.total++;
      s[key]++;
      if (!VERDICT[key].done) s.pending++;
    });
    return s;
  }

  function headText(sum) {
    var s = sum || summary([]);
    if (!s.total) return '未対応の指摘はありません';
    var t = '未対応 ' + s.open + ' · SVG 未反映 ' + s['puml-only'] + ' · 反映済み ' + s.reflected;
    if (s.unknown) t += ' · 確かめられず ' + s.unknown;
    return t;
  }

  var api = {
    VERDICT: VERDICT,
    SOURCE: SOURCE,
    ORDER: ORDER,
    has: has,
    verdict: verdict,
    label: label,
    title: title,
    isDone: isDone,
    order: order,
    rank: rank,
    source: source,
    fromManual: fromManual,
    fromNote: fromNote,
    noteMark: noteMark,
    countKey: countKey,
    pendingCount: pendingCount,
    totalCount: totalCount,
    summary: summary,
    headText: headText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
