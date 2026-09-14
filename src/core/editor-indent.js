'use strict';
window.MA = window.MA || {};

// editor-indent — DSL エディタの「インデント幅」(design「1a 設定と網羅」5a)。
//
// 5a のエディタタブは 文字サイズ と並べて「インデント幅 / 2 / 4 / Tab」を置く。
// 今までは Tab キーが 2 スペース固定で、挿入も解除も app.js に `'  '` が
// 直書きされていた。4 スペースやタブ文字で書いている図を開くと、Tab キーを
// 押した行だけ幅が揃わないので Tab キー自体が使えなくなる。
// ここは DOM に触らない純関数だけを置き、結線は app.js。
window.MA.editorIndent = (function() {
  var CHOICES = [
    { id: '2',   label: '2',   unit: '  ' },
    { id: '4',   label: '4',   unit: '    ' },
    { id: 'tab', label: 'Tab', unit: '\t' },
  ];
  var DEFAULT_ID = '2';

  function normalize(id) {
    var s = String(id);
    for (var i = 0; i < CHOICES.length; i++) if (CHOICES[i].id === s) return s;
    return DEFAULT_ID;
  }

  function unitFor(id) {
    var n = normalize(id);
    for (var i = 0; i < CHOICES.length; i++) if (CHOICES[i].id === n) return CHOICES[i].unit;
    return '  ';
  }

  function _lineStart(text, pos) {
    return text.lastIndexOf('\n', pos - 1) + 1;
  }

  // Tab: カーソル位置に 1 単位入れる。選択範囲があれば置き換える
  // (既存の挙動をそのまま持ち越す。複数行の一括インデントは扱わない)。
  function applyIndent(text, start, end, id) {
    var unit = unitFor(id);
    return {
      text: text.substring(0, start) + unit + text.substring(end),
      caret: start + unit.length,
    };
  }

  // Shift+Tab: カーソル行の先頭から 1 単位ぶん外す。
  // 設定と違う書き方で書かれた行でも外せるように、
  // スペース指定ならタブ文字も、タブ指定ならスペースも受ける。
  function applyOutdent(text, start, id) {
    var ls = _lineStart(text, start);
    var unit = unitFor(id);
    var removed = 0;
    if (text.substr(ls, unit.length) === unit) {
      removed = unit.length;
    } else if (text.charAt(ls) === '\t') {
      removed = 1;
    } else {
      // 設定より浅いスペースしか無い行: あるだけ外す (最大でも 1 単位ぶん)
      var max = unit === '\t' ? 4 : unit.length;
      while (removed < max && text.charAt(ls + removed) === ' ') removed++;
    }
    if (removed === 0) return { text: text, caret: start, changed: false };
    return {
      text: text.substring(0, ls) + text.substring(ls + removed),
      caret: Math.max(ls, start - removed),
      changed: true,
    };
  }

  return {
    CHOICES: CHOICES,
    DEFAULT_ID: DEFAULT_ID,
    normalize: normalize,
    unitFor: unitFor,
    applyIndent: applyIndent,
    applyOutdent: applyOutdent,
  };
})();
