'use strict';
window.MA = window.MA || {};

// template-registry — 雛形そのものを登録して残す
// (BLK-junior-20260908-1403-wish)。
//
// 「雛形との差分」(template-diff) は出せるようになったが、雛形にする図は毎回
// その場で探す必要があった。相手が別の人のフォルダにあると、⇔ 並べて見る の
// 「🧩 相手のフォルダ」に絶対パスを打ち直し、名前の近い図を選び直す。同じ 2 枚を
// 何周も突き合わせる業務では、この「探し直し」だけが毎回積み上がる。
//
// ここは雛形を 1 回だけ登録して名前で呼べるようにする。持つのは
//   id / label (呼び名) / source (どの図から採ったか) / dsl / savedAt
// だけ。同じ呼び名で登録し直すと差し替える (雛形が育っても登録は 1 つに保つ)。
// 保存は呼び出し側 (localStorage) の仕事で、ここは配列を受けて配列を返す。
// DOM にも localStorage にも触らない。
window.MA.templateRegistry = (function() {

  var MAX = 20;   // 呼び名で選ぶ一覧なので、増え過ぎると選べなくなる

  function _s(v) { return v == null ? '' : String(v); }

  function _trim(v) { return _s(v).replace(/\s+/g, ' ').trim(); }

  // 呼び名の同一性。前後の空白と大小だけの違いは同じ雛形とみなす。
  function sameLabel(a, b) { return _trim(a).toLowerCase() === _trim(b).toLowerCase(); }

  // 図の名前から呼び名の下書きを作る。拡張子と保存名の飾りは呼び名に要らない。
  // 例 uart_activity_TYPO_interim.puml → uart activity
  function suggestLabel(docName) {
    var s = _trim(docName).replace(/\.(puml|plantuml|pu|wsd|txt)$/i, '');
    s = s.replace(/[_-]+/g, ' ');
    s = s.replace(/\b(?:TYPO|interim|tmp|temp|copy|wip|draft|old|new|bak|v?\d+)\b/gi, ' ');
    s = _trim(s);
    return s || _trim(docName);
  }

  function _id(label) {
    return 'tpl-' + _trim(label).toLowerCase().replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // 登録。呼び名が空なら source から下書きし、それも空なら登録しない。
  // 同じ呼び名があれば差し替え、その位置は変えない (選び直す手間を作らない)。
  function add(list, entry) {
    var cur = normalize(list);
    var e = entry || {};
    var label = _trim(e.label) || suggestLabel(e.source);
    var dsl = _s(e.dsl);
    if (!label || dsl.trim() === '') return cur;
    var rec = {
      id: _s(e.id) || _id(label),
      label: label,
      source: _trim(e.source),
      dsl: dsl,
      savedAt: _s(e.savedAt) || new Date().toISOString(),
    };
    var out = cur.slice();
    for (var i = 0; i < out.length; i++) {
      if (sameLabel(out[i].label, label)) { out[i] = rec; return out; }
    }
    out.unshift(rec);
    return out.slice(0, MAX);
  }

  function remove(list, id) {
    return normalize(list).filter(function(e) { return e.id !== _s(id); });
  }

  function get(list, id) {
    var hit = normalize(list).filter(function(e) { return e.id === _s(id); });
    return hit.length ? hit[0] : null;
  }

  // 呼び名で引く (画面に出ているのは呼び名なので、id を知らなくても引ける)。
  function byLabel(list, label) {
    var hit = normalize(list).filter(function(e) { return sameLabel(e.label, label); });
    return hit.length ? hit[0] : null;
  }

  // 図の名前にいちばん近い登録を返す。呼び名の語が図の名前に何語含まれるかで測り、
  // 1 語も重ならなければ「近い雛形は無い」と言う (当てずっぽうを既定にしない)。
  function suggestFor(list, docName) {
    var name = _trim(docName).toLowerCase();
    if (!name) return null;
    var best = null, bestN = 0;
    normalize(list).forEach(function(e) {
      var words = _trim(e.label).toLowerCase().split(/[^a-z0-9぀-ヿ一-鿿]+/)
        .filter(function(w) { return w.length >= 2; });
      var n = 0;
      words.forEach(function(w) { if (name.indexOf(w) >= 0) n++; });
      if (n > bestN) { best = e; bestN = n; }
    });
    return bestN > 0 ? best : null;
  }

  // 壊れた保存値・別バージョンの保存値を読んでも落ちないようにする。
  function normalize(list) {
    if (!list || Object.prototype.toString.call(list) !== '[object Array]') return [];
    var seen = {};
    var out = [];
    list.forEach(function(e) {
      if (!e || typeof e !== 'object') return;
      var label = _trim(e.label);
      var dsl = _s(e.dsl);
      if (!label || dsl.trim() === '') return;
      var id = _s(e.id) || _id(label);
      var key = label.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        id: id,
        label: label,
        source: _trim(e.source),
        dsl: dsl,
        savedAt: _s(e.savedAt),
      });
    });
    return out.slice(0, MAX);
  }

  function serialize(list) { return JSON.stringify(normalize(list)); }

  function parse(text) {
    try { return normalize(JSON.parse(_s(text))); } catch (e) { return []; }
  }

  // 一覧の見出し。登録が無いときに「まず 1 枚登録する」と分かる文にする。
  function summary(list) {
    var n = normalize(list).length;
    if (n === 0) return '雛形はまだ登録されていません (この図を雛形にできます)';
    return '登録された雛形 ' + n + ' 件';
  }

  // 選んだ雛形の出どころ。差分の根拠がどの図だったかを後から言えるようにする。
  function originNote(entry) {
    if (!entry) return '';
    var when = _s(entry.savedAt).slice(0, 16).replace('T', ' ');
    var src = entry.source ? (entry.source + ' から') : '';
    return '雛形「' + entry.label + '」' + (src ? (' — ' + src) : '') + (when ? (' ' + when + ' 登録') : '');
  }

  return {
    MAX: MAX,
    sameLabel: sameLabel,
    suggestLabel: suggestLabel,
    add: add,
    remove: remove,
    get: get,
    byLabel: byLabel,
    suggestFor: suggestFor,
    normalize: normalize,
    serialize: serialize,
    parse: parse,
    summary: summary,
    originNote: originNote,
  };
})();
