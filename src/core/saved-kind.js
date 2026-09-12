'use strict';
window.MA = window.MA || {};

// saved-kind — 保存したときの図種を控え、次に開くときはその図種のまま開く。
//
// BLK-junior-20260912-2103-wish: 保存フォルダから開いた図は毎回本文から図種を
// 当て直していた。`actor` を持ち、ラベルに括弧の付くシーケンスはユースケースに
// 倒れるので、開くたびに図種を選び直して本文を貼り直す遠回りが要った。
// 控え (server の .assist-kinds.json) があればそれを本文判定より先に使う。
// 「別図種と紛らわしい書き方」を気にせず、先輩の図の構成をそのまま持ち込める。
window.MA.savedKind = (function() {

  var PREFIX = 'plantuml-';
  // diagram-kind.js の LABELS と同じ並び。あちらは保存フォルダの要約用、
  // こちらは開くときの図種決めなので、用途ごとに持ち回る値を分けている。
  var LABELS = {
    sequence: 'シーケンス',
    state: '状態遷移',
    'class': 'クラス',
    usecase: 'ユースケース',
    component: 'コンポーネント',
    activity: 'アクティビティ',
  };
  // 行に出す印。図種の頭文字ではなく形で見分ける (名前の左に 1 文字だけ置く)。
  var MARKS = {
    sequence: '⇄',
    state: '◎',
    'class': '▣',
    usecase: '⬭',
    component: '⬛',
    activity: '▶',
  };

  function _s(v) { return v == null ? '' : String(v); }

  // 'plantuml-sequence' → 'sequence'。知らない図種は ''。
  function slugOf(diagramType) {
    var t = _s(diagramType);
    if (t.indexOf(PREFIX) !== 0) return '';
    var slug = t.slice(PREFIX.length);
    return LABELS[slug] ? slug : '';
  }

  // 'sequence' → 'plantuml-sequence'。知らない図種は ''。
  function typeOf(slug) {
    var k = _s(slug);
    return LABELS[k] ? PREFIX + k : '';
  }

  function label(slug) {
    return LABELS[_s(slug)] || '';
  }

  // 一覧の行に出す印。控えの無い図 (= 開いてみるまで図種の分からない図) は null。
  function badge(slug) {
    var k = _s(slug);
    if (!LABELS[k]) return null;
    return {
      slug: k,
      mark: MARKS[k],
      label: LABELS[k],
      title: '前回保存した図種は' + LABELS[k] + '図。この図種のまま開きます（本文からの判定はしません）',
    };
  }

  // 控えの一覧 (name → slug) から 1 枚分。知らない図種の控えは無いものとして扱う。
  function pick(kinds, name) {
    if (!kinds || typeof kinds !== 'object') return '';
    var k = _s(kinds[_s(name)]);
    return LABELS[k] ? k : '';
  }

  // 開くときの図種を決める。控え > 本文判定 > 今の図種。
  // known は「この版が持っている図種」(app の modules)。控えがそこに無ければ使わない。
  function resolveType(opts) {
    var o = opts || {};
    var known = o.known || {};
    var saved = typeOf(o.savedKind);
    if (saved && known[saved]) return saved;
    var detected = null;
    if (typeof o.detectType === 'function') {
      try { detected = o.detectType(_s(o.dsl)); } catch (e) { detected = null; }
    }
    if (detected && known[detected]) return detected;
    return o.fallback || '';
  }

  // 保存で控えを更新した姿。図種の分からない保存は前の控えを消さない
  // (一括の書き戻しは図種を持たずに来るため、消すと控えが虫食いになる)。
  function nextKinds(kinds, name, slug) {
    var out = {};
    var src = (kinds && typeof kinds === 'object') ? kinds : {};
    Object.keys(src).forEach(function(k) { out[k] = src[k]; });
    var n = _s(name);
    var k2 = _s(slug);
    if (n && LABELS[k2]) out[n] = k2;
    return out;
  }

  return {
    LABELS: LABELS,
    MARKS: MARKS,
    slugOf: slugOf,
    typeOf: typeOf,
    label: label,
    badge: badge,
    pick: pick,
    resolveType: resolveType,
    nextKinds: nextKinds,
  };
})();
