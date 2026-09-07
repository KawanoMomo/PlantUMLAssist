'use strict';
window.MA = window.MA || {};

// pin-jump — レビュー指摘から「その指摘の対象要素」へ 1 操作で移動する。
//
// BLK-junior-20260907-2303-wish: 指摘の対象を選び直す手順が、レイアウトが変わるたびに
// 「目で要素を探す → クリックする → 右ペインのフォームを開く」の 3 手になっていた。
// 再レイアウト後は隣の要素を掴む誤クリックも起きる。指摘 (review-pins) は既に対象行を
// anchor で覚えているので、その行に当たる選択候補を機械的に引き当てれば、
// 一覧から「ジャンプ」を押すだけで 選択 + ハイライト + 修正フォームまで運べる。
//
// ここは DOM に触らない。行番号と選択候補の対応付けだけを持ち、
// textarea・overlay・右ペインへの適用は app.js が行う。
window.MA.pinJump = (function() {

  function _num(v) {
    var n = Number(v);
    return isFinite(n) ? Math.round(n) : null;
  }

  // 候補のうち line を持つものだけを、DSL の並び順に整える。
  function normalizeCandidates(candidates) {
    var out = [];
    (Array.isArray(candidates) ? candidates : []).forEach(function(c) {
      if (!c || !c.id) return;
      var line = _num(c.line);
      if (line === null || line < 1) return;
      out.push({ type: c.type || 'message', id: c.id, line: line });
    });
    out.sort(function(a, b) { return a.line - b.line; });
    return out;
  }

  // その行の候補。同じ行に複数あるときは先頭 (DSL の並びで最初) を採る。
  function candidateAt(candidates, line) {
    var n = _num(line);
    if (n === null) return null;
    var list = normalizeCandidates(candidates);
    for (var i = 0; i < list.length; i++) {
      if (list[i].line === n) return list[i];
    }
    return null;
  }

  // 行がずれているときの寄せ先。指摘先の行そのものが選択候補でない
  // (title 行やグループの開き行など) 場面があるので、最も近い候補へ寄せる。
  // 同じ距離なら上の行を選ぶ (指摘は普通その要素の直前ではなく本体に付く)。
  function nearestCandidate(candidates, line, maxDistance) {
    var n = _num(line);
    if (n === null) return null;
    var limit = (typeof maxDistance === 'number') ? maxDistance : 3;
    var list = normalizeCandidates(candidates);
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(list[i].line - n);
      if (d > limit) continue;
      if (d < bestD) { best = list[i]; bestD = d; }
    }
    return best;
  }

  // plan — 指摘 1 件について「何をすればよいか」をまとめる。
  //   ok       : 行が生きていて飛べる
  //   item     : 選択する要素 (無ければ null。行へは飛べるが選択はしない)
  //   approx   : 指摘先の行そのものではなく近い候補に寄せた
  //   openProps: 右ペインの「選択中」タブを開いてよいか (要素が取れたときだけ)
  //   message  : 画面に出す 1 行
  function plan(pin, candidates) {
    if (!pin) {
      return { ok: false, stale: false, line: 0, item: null, approx: false,
        openProps: false, message: '指摘が見つかりません' };
    }
    if (pin.stale || !_num(pin.line)) {
      return { ok: false, stale: true, line: 0, item: null, approx: false, openProps: false,
        message: '指摘先の行が書き換わっています: ' + String(pin.anchor || '') };
    }
    var line = _num(pin.line);
    var item = candidateAt(candidates, line);
    var approx = false;
    if (!item) {
      item = nearestCandidate(candidates, line);
      approx = !!item;
    }
    var msg = '#' + String(pin.id) + ' L' + line + ' へ移動';
    if (item) {
      msg += ' ・ ' + item.type + ' ' + item.id + ' を選択';
      if (approx) msg += ' (L' + item.line + ' に寄せました)';
    } else {
      msg += ' ・ この行に選べる要素はありません';
    }
    return {
      ok: true, stale: false, line: line, item: item, approx: approx,
      openProps: !!item, message: msg,
    };
  }

  // ボタンの文言。押せない指摘は理由が分かる形にする。
  function jumpLabel(pin) {
    if (!pin) return '対象へジャンプ';
    if (pin.stale) return '対象が迷子';
    return '対象へジャンプ';
  }

  function canJump(pin) {
    return !!(pin && !pin.stale && _num(pin.line));
  }

  // 未読の指摘を上から順に辿るための次の 1 件。id が無ければ先頭を返す。
  // 既読と対応済みは飛ばす (読んだ / 直した指摘へ戻ってくる意味がない)。
  function nextOpen(pins, currentId) {
    var list = (Array.isArray(pins) ? pins : []).filter(function(p) {
      return p && p.state !== 'read' && p.state !== 'done' && canJump(p);
    });
    if (!list.length) return null;
    if (currentId == null || currentId === '') return list[0];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(currentId)) return list[(i + 1) % list.length];
    }
    return list[0];
  }

  return {
    normalizeCandidates: normalizeCandidates,
    candidateAt: candidateAt,
    nearestCandidate: nearestCandidate,
    plan: plan,
    jumpLabel: jumpLabel,
    canJump: canJump,
    nextOpen: nextOpen,
  };
})();
