'use strict';
window.MA = window.MA || {};

// twin-restore — 保存フォルダの中で「別名なのに中身がバイト完全一致した」組を
// 全部その場で挙げ、巻き込まれた図を 1 操作で元の中身に戻す
// (BLK-primary-20260912-2206-wish)。
//
// save-swap は「いま保存した 1 枚が別名の図と一致したか」を言う。primary の事故は
// driver_common_class / plantuml-class / diagram1 の 3 枚が同時に壊れており、
// 保存した 1 枚の警告だけでは残りの 2 枚が黙ったまま残る。気付けたのも reviewer の
// 突合待ちで、直すには `_versions/` の過去版を 1 枚ずつ探して手で打ち直すしかなかった。
//
// ここが持つのは 2 つ。
//   groups   — フォルダ全体を見て、同じ中身を持つファイルの組を全部挙げる
//              (保存した図が入っていない組も出す。3 枚目に気付けるのはこれだけ)
//   pickVersion — その図の `_versions/` の一覧から「戻す先」を 1 つ選ぶ。
//              雛形で上書きされた事故は必ず行数を失うので、今より行数の多い
//              いちばん新しい版が、事故の直前の中身になる
//
// DOM も fetch も見ない純関数だけを置く (結線と描画は app.js)。
(function() {
  // 戻す先として認めるのに要る行数の差。1〜2 行の増減は普通の書き足しで、
  // 「戻す」対象ではない。save-swap の SHRINK_MIN_LOST と同じ下限を使う
  // (同じ事故を 2 つの規約で判定しない)。
  var MIN_GAIN = 5;

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 突合の単位は save-swap に合わせる (同じ組を別の規約で二度判定しない)。
  function normalize(dsl) {
    var SS = window.MA.saveSwap;
    if (SS && SS.normalize) return SS.normalize(dsl);
    return _s(dsl).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function lineCount(dsl) {
    var t = normalize(dsl);
    return t === '' ? 0 : t.split('\n').length;
  }

  // @startuml/@enduml とコメントしか無い図は、別名どうしで一致していて
  // 当たり前なので組に数えない (save-swap の _tooThin と同じ線引き)。
  function _tooThin(dsl) {
    var t = normalize(dsl);
    if (t === '') return true;
    return t.split('\n').filter(function(l) {
      var s = l.trim();
      return s !== '' && !/^@/.test(s) && !/^'/.test(s);
    }).length < 1;
  }

  // 保存フォルダの一覧 [{name, dsl}] → 中身が一致する組
  // [{ names: [名前...], lines: 行数 }]。名前順・組は名前の若い順。
  function groups(folderDocs) {
    var byContent = {}, order = [];
    _list(folderDocs).forEach(function(d) {
      if (!d || !_s(d.name)) return;
      if (_tooThin(d.dsl)) return;
      var k = normalize(d.dsl);
      if (!byContent[k]) { byContent[k] = []; order.push(k); }
      if (byContent[k].indexOf(_s(d.name)) < 0) byContent[k].push(_s(d.name));
    });
    var out = [];
    order.forEach(function(k) {
      if (byContent[k].length < 2) return;
      out.push({ names: byContent[k].slice().sort(), lines: lineCount(k) });
    });
    out.sort(function(a, b) { return a.names[0] < b.names[0] ? -1 : (a.names[0] > b.names[0] ? 1 : 0); });
    return out;
  }

  // 帯に出す 1 行。「どれとどれが」を名前で言い切る (件数だけでは探せない)。
  function groupLines(gs) {
    return _list(gs).map(function(g) {
      return g.names.join(' と ') + ' の内容が一致しています（' + g.lines + ' 行）';
    });
  }

  // その図が巻き込まれている組。無ければ null。
  function groupFor(gs, name) {
    var n = _s(name);
    var hit = null;
    _list(gs).forEach(function(g) {
      if (!hit && _list(g.names).indexOf(n) >= 0) hit = g;
    });
    return hit;
  }

  // 戻す先を選ぶ。rows は version-history.rows() の答え (新しい順、lines つき)。
  // 今より MIN_GAIN 行以上多い版のうち、いちばん新しいもの。
  // 見つからなければ null (「戻す」を出さない。中身の分からない版を押し付けない)。
  function pickVersion(rows, opts) {
    var o = opts || {};
    var cur = typeof o.currentLines === 'number' ? o.currentLines : 0;
    var hit = null;
    _list(rows).forEach(function(r) {
      if (hit || !r || typeof r.lines !== 'number') return;
      if (r.lines - cur >= MIN_GAIN) hit = r;
    });
    return hit;
  }

  // 「戻す」ボタンの文言。押す前に、どの版に戻るのかが読めるようにする。
  function restoreLabel(row) {
    if (!row) return '';
    return '↩ ' + _s(row.label) + ' の版に戻す（' + (row.lines || 0) + ' 行）';
  }

  // 戻したあとに言う 1 行。保存フォルダにも書き戻ったことまで言う
  // (エディタだけ戻って安心し、ファイルが壊れたままになるのを防ぐ)。
  function restoredLine(name, row) {
    return _s(name) + ' を ' + _s(row && row.label) + ' の版（'
      + ((row && row.lines) || 0) + ' 行）に戻し、保存フォルダにも書き戻しました';
  }

  var api = {
    normalize: normalize,
    lineCount: lineCount,
    groups: groups,
    groupLines: groupLines,
    groupFor: groupFor,
    pickVersion: pickVersion,
    restoreLabel: restoreLabel,
    restoredLine: restoredLine,
    MIN_GAIN: MIN_GAIN,
  };
  window.MA.twinRestore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
