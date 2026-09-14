'use strict';
window.MA = window.MA || {};

// state-transition — 状態遷移のラベルを trigger / [guard] / action の
// 3 要素として扱う。
//
// 遷移ラベルの構文 (`start [cond] / act`) を利用者に書かせないために、
// 「3 つの欄に入れた値 → DSL 行」の変換をここに 1 本化する。UI は入力の
// たびに previewLine() を呼んで組み立て結果をそのまま見せられる。
// state.js の fmtTransition / _parseTransitionLabel はこのモジュールに
// 委譲するので、プレビューと実際に書き込まれる行が食い違うことはない。
window.MA.stateTransition = (function() {
  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 3 要素からラベル部分 (": " の右) を組む。全部空ならラベル無し。
  function composeLabel(trigger, guard, action) {
    var parts = [];
    var t = _s(trigger), g = _s(guard), a = _s(action);
    if (t) parts.push(t);
    if (g) parts.push('[' + g + ']');
    if (a) parts.push('/ ' + a);
    return parts.join(' ');
  }

  // ラベルを 3 要素へ戻す。読めない形なら trigger 扱いにして値を落とさない。
  function parseLabel(label) {
    if (!label) return { trigger: null, guard: null, action: null };
    var trimmed = String(label).trim();
    var actionMatch = trimmed.match(/^(.*?)\s*\/\s*(.+)$/);
    var action = null;
    var rest = trimmed;
    if (actionMatch) {
      action = actionMatch[2].trim();
      rest = actionMatch[1].trim();
    }
    var guardMatch = rest.match(/^(.*?)\s*\[(.+?)\]\s*$/);
    var guard = null;
    var trigger = rest;
    if (guardMatch) {
      guard = guardMatch[2].trim();
      trigger = guardMatch[1].trim();
    }
    return {
      trigger: trigger || null,
      guard: guard || null,
      action: action || null,
    };
  }

  // 確定したら DSL に入る 1 行。From/To が未入力でも「まだ足りない」と
  // 分かる形で返す (プレースホルダ) ので、プレビューが空にならない。
  function previewLine(from, to, trigger, guard, action) {
    var f = _s(from) || '?';
    var t = _s(to) || '?';
    var label = composeLabel(trigger, guard, action);
    return f + ' --> ' + t + (label ? ' : ' + label : '');
  }

  // 一覧の 1 行に出す短い説明。遷移を名前で選べるようにする。
  function summaryText(tr) {
    if (!tr) return '';
    var label = composeLabel(tr.trigger, tr.guard, tr.action);
    return _s(tr.from) + ' → ' + _s(tr.to) + (label ? ' : ' + label : '');
  }

  // parse 結果から遷移一覧を作る。UI の select / リスト用。
  function summaries(parsed) {
    var trs = (parsed && parsed.transitions) || [];
    return trs.map(function(tr) {
      return { id: tr.id, line: tr.line, text: summaryText(tr) };
    });
  }

  return {
    composeLabel: composeLabel,
    parseLabel: parseLabel,
    previewLine: previewLine,
    summaryText: summaryText,
    summaries: summaries,
  };
})();
