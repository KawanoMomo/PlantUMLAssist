'use strict';
window.MA = window.MA || {};

// svg-stamp — 保存された svg の末尾に刻まれた印 `<!-- @pua-source-sha1 ... -->` を読む。
//
// BLK-reviewer-20260915-0406: 印を読んでいたのは server (server.py の
// `_read_svg_stamp`) だけで、CLI 経路 (`node tools/findings.js <フォルダ>`) が組む
// svg 一覧には `hash` も `svgSource` も入っていなかった。その結果
// `svg-freshness.contentOf` は常に 'unverified' を返し、内容一致 (isSettled) の
// 判定を一度も通らないまま mtime だけで「SVG 古」になっていた。
// server と同じ読み方をここに 1 つ置き、GUI と CLI で同じ答えが出るようにする。
window.MA.svgStamp = (function() {

  var PREFIX = '<!-- @pua-source-sha1 ';
  var SUFFIX = ' -->';
  // server は末尾 200 バイトだけを読む (図が大きくても一覧が遅くならない)。
  // 同じ約束にしておかないと、片方だけが「印がある」と言う図ができる。
  var TAIL_BYTES = 200;

  function tailBytes() { return TAIL_BYTES; }

  // readStamp(text) — svg の本文 (または末尾 200 バイト) から sha1 を返す。無ければ ''。
  function readStamp(text) {
    var s = String(text == null ? '' : text);
    if (s.length > TAIL_BYTES) s = s.slice(s.length - TAIL_BYTES);
    var at = s.lastIndexOf(PREFIX);
    if (at < 0) return '';
    var rest = s.slice(at + PREFIX.length);
    var end = rest.indexOf(SUFFIX);
    if (end < 0) return '';
    var digest = rest.slice(0, end).trim();
    return /^[0-9a-f]{40}$/.test(digest) ? digest : '';
  }

  return { readStamp: readStamp, tailBytes: tailBytes, PREFIX: PREFIX, SUFFIX: SUFFIX };
})();
