'use strict';
// sequence-marks — シーケンス図の「区切り線 / 遅延 / 参照」(design 5c の「その他」)。
//
// 5c の挿入メニューの最後は「その他（区切り線 / 遅延 / 参照）」で、5b の網羅表も
// Sequence のその他パレットとして `区切り線 ==、遅延 ...、ref` を挙げる。
// メッセージでも note でもブロックでもない、この 3 つの行の書式をここに 1 つだけ置く。
// すべて純関数で、DOM にも図種モジュールにも依存しない。
window.MA = window.MA || {};
window.MA.sequenceMarks = (function() {

  // 挿入メニューの「その他」を開いたときに並ぶもの。value は _formatLine の kind。
  var MARKS = [
    { value: 'separator', label: '区切り線', hint: '== 区切り ==', desc: 'ここまでを一区切りにする' },
    { value: 'delay',     label: '遅延',     hint: '... 待ち ...',  desc: '時間が空くことを示す' },
    { value: 'ref',       label: '参照',     hint: 'ref over A : 別図', desc: '別の図を参照する' },
  ];

  function marks() { return MARKS.slice(); }
  function isMarkKind(kind) {
    for (var i = 0; i < MARKS.length; i++) if (MARKS[i].value === kind) return true;
    return false;
  }

  function _clean(s) {
    // 区切り線・遅延の本文に `=` や `.` の並びが混ざると行の意味が変わるため落とす。
    return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();
  }

  // fmtSeparator: `== 本文 ==`。本文が空なら `====` (PlantUML の無地の区切り)。
  function fmtSeparator(text) {
    var t = _clean(text).replace(/^=+|=+$/g, '').trim();
    return t ? '== ' + t + ' ==' : '====';
  }

  // fmtDelay: `... 本文 ...`。本文が空なら `...`。
  function fmtDelay(text) {
    var t = _clean(text).replace(/^\.+|\.+$/g, '').trim();
    return t ? '... ' + t + ' ...' : '...';
  }

  // fmtRef: `ref over A, B : 本文`。参加者が無ければ '' (呼び出し側で no-op)。
  function fmtRef(targets, text) {
    var list = (Array.isArray(targets) ? targets : [targets])
      .map(function(t) { return _clean(t); })
      .filter(function(t) { return t.length > 0; });
    if (list.length === 0) return '';
    var t = _clean(text);
    return 'ref over ' + list.join(', ') + (t ? ' : ' + t : '');
  }

  function formatLine(kind, props) {
    props = props || {};
    if (kind === 'separator') return fmtSeparator(props.text);
    if (kind === 'delay') return fmtDelay(props.text);
    if (kind === 'ref') return fmtRef(props.targets, props.text);
    return '';
  }

  // parseLine: 1 行を読み返す。3 つのどれでもなければ null。
  // 図の読み手 (パーサ・アウトライン) が「メッセージではない行」を素通りせず
  // 何の行か言えるようにするための入口。
  var SEP_RE = /^\s*={2,}\s*(.*?)\s*={2,}\s*$/;
  var SEP_BARE_RE = /^\s*={2,}\s*$/;
  var DELAY_RE = /^\s*\.{3,}\s*(.*?)\s*\.{3,}\s*$/;
  var DELAY_BARE_RE = /^\s*\.{3,}\s*$/;
  var REF_RE = /^\s*ref\s+over\s+([^:]+?)\s*(?::\s*(.*?))?\s*$/i;

  function parseLine(line) {
    if (typeof line !== 'string') return null;
    var m;
    if (SEP_BARE_RE.test(line)) return { kind: 'separator', text: '' };
    m = line.match(SEP_RE);
    if (m) return { kind: 'separator', text: m[1] };
    if (DELAY_BARE_RE.test(line)) return { kind: 'delay', text: '' };
    m = line.match(DELAY_RE);
    if (m) return { kind: 'delay', text: m[1] };
    m = line.match(REF_RE);
    if (m) {
      return {
        kind: 'ref',
        targets: m[1].split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        text: (m[2] || '').trim(),
      };
    }
    return null;
  }

  // summarize: アウトラインや行一覧に出す 1 行の説明。
  function summarize(line) {
    var p = parseLine(line);
    if (!p) return null;
    if (p.kind === 'separator') return p.text ? '区切り線: ' + p.text : '区切り線';
    if (p.kind === 'delay') return p.text ? '遅延: ' + p.text : '遅延';
    return '参照: ' + p.targets.join(', ') + (p.text ? ' — ' + p.text : '');
  }

  return {
    MARKS: MARKS,
    marks: marks,
    isMarkKind: isMarkKind,
    fmtSeparator: fmtSeparator,
    fmtDelay: fmtDelay,
    fmtRef: fmtRef,
    formatLine: formatLine,
    parseLine: parseLine,
    summarize: summarize,
  };
})();
