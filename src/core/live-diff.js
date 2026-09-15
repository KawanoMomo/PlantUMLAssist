'use strict';
window.MA = window.MA || {};

// live-diff — 「いま編集している中身」と「前回保存版」の差を、保存する前から
// 常時 1 行で言う (BLK-reviewer-20260915-2346-wish)。
//
// reviewer が driver_common_class.puml の 77 行 → 4 行という内容消失を見つけられたのは、
// 手元の複製と `diff` を手で打ったから。書いた本人 (primary) の画面には、保存を
// 押すまで「前回保存版から何行増えて何行消えるか」がどこにも出ていなかった。
// save-swap は保存した後に警告を出すので、消えたこと自体は防げない。
//
// ここが足すのは「保存する前の予告」。状態バーに常に出ている 1 行と、押せば
// 前回保存版と現在を並べる全文差分。判定は既存のものをそのまま借りる:
//   行の突き合わせ  version-fulldiff.rows (LCS)
//   激減の閾値      save-swap.inspect の shrink (同じ事故を 2 つの規約で判定しない)
//   前回保存版      save-diff.baselineOf (保存のたびに mark される基準)
// DOM も fetch も触らない。描画は app.js。
window.MA.liveDiff = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _vfd() { return window.MA.versionFullDiff; }
  function _ss() { return window.MA.saveSwap; }

  // 前回保存版 → 現在の行の並び。基準が無ければ空 (まだ一度も保存していない図は
  // 「消える行」を持ちようがないので、比べる相手が無いことを空で表す)。
  function rows(before, now) {
    var VFD = _vfd();
    if (!VFD) return [];
    return VFD.rows(_s(before), _s(now));
  }

  function counts(rowList) {
    var VFD = _vfd();
    if (!VFD) return { added: 0, removed: 0, same: 0 };
    return VFD.counts(rowList || []);
  }

  // この変更が「雛形に戻った / 中身が入れ替わった」形かどうか。
  // 閾値は save-swap のものを借りるので、保存前の予告と保存後の警告が食い違わない。
  function shrink(before, now) {
    var SS = _ss();
    if (!SS || _s(before) === '') return null;
    var res = SS.inspect({ name: '_livediff', dsl: _s(now), prev: _s(before), folderDocs: [] });
    return res && res.shrink ? res.shrink : null;
  }

  // 'none'    比べる相手が無い (まだ保存していない)
  // 'same'    前回保存版と同じ
  // 'changed' 増減がある
  // 'shrink'  大きく減っている (保存すると内容消失になる形)
  function verdict(before, now, hasBaseline) {
    if (hasBaseline === false || _s(before) === '') return 'none';
    if (shrink(before, now)) return 'shrink';
    var c = counts(rows(before, now));
    return (c.added || c.removed) ? 'changed' : 'same';
  }

  // 状態バーの 1 行。常に出ているものなので、変化が無いときほど短くする。
  function chipText(before, now, hasBaseline) {
    var v = verdict(before, now, hasBaseline);
    if (v === 'none') return '前回保存版 —';
    if (v === 'same') return '前回保存版 と同じ';
    var c = counts(rows(before, now));
    var body = '＋' + c.added + ' −' + c.removed;
    return (v === 'shrink' ? '⚠ ' : '') + '前回保存版 ' + body;
  }

  // 激減のときだけ、何が起きるのかを言い切る (数字だけでは手が止まらない)。
  function warnText(name, before, now) {
    var sh = shrink(before, now);
    if (!sh) return '';
    return '⚠ ' + _s(name) + ': いま保存すると ' + sh.before + ' 行から ' + sh.after
      + ' 行に減ります (−' + sh.lost + ' 行)。消えてよい行か確かめてください';
  }

  function title(name) {
    return _s(name) + ' — 前回保存版 → いまの中身 (未保存)';
  }

  return {
    rows: rows,
    counts: counts,
    shrink: shrink,
    verdict: verdict,
    chipText: chipText,
    warnText: warnText,
    title: title,
  };
})();
