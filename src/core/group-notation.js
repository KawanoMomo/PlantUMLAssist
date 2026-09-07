'use strict';
window.MA = window.MA || {};

// group-notation — 境界 (package / folder / frame / node / rectangle) の表記
// (design「1a 設定と網羅」5d の「その他パレット」)。
//
// Component / UseCase のパーサはこの 5 語をどれも境界として読めるのに、
// GUI から作れるのは `package "…" {` だけだった。folder や node で書かれた図を
// 真似ようとすると、境界の 1 行だけ DSL を手で打ち直すことになる。
// 表記が変わっても中身と閉じ括弧はそのままなので、開き行の書き換えだけを
// 純関数として置き、図種のパーサには依存しない。
window.MA.groupNotation = (function() {
  var ALL = [
    { id: 'package',   label: 'package',   hint: 'パッケージ (既定)' },
    { id: 'folder',    label: 'folder',    hint: 'フォルダの形' },
    { id: 'frame',     label: 'frame',     hint: '枠 (frame)' },
    { id: 'node',      label: 'node',      hint: '実行ノード (箱)' },
    { id: 'rectangle', label: 'rectangle', hint: '飾りのない四角' },
  ];
  // UseCase のパーサが読めるのは package / rectangle だけ。
  var BY_TYPE = {
    'plantuml-component': ['package', 'folder', 'frame', 'node', 'rectangle'],
    'plantuml-usecase':   ['package', 'rectangle'],
  };
  var DEFAULT_ID = 'package';

  function notationsFor(diagramType) {
    var ids = BY_TYPE[diagramType] || [DEFAULT_ID];
    return ALL.filter(function(n) { return ids.indexOf(n.id) >= 0; });
  }

  function isValid(id, diagramType) {
    var ids = BY_TYPE[diagramType] || [DEFAULT_ID];
    return ids.indexOf(String(id)) >= 0;
  }

  function normalize(id, diagramType) {
    return isValid(id, diagramType) ? String(id) : DEFAULT_ID;
  }

  // `folder "Backend" {` を組む。ラベルは常に引用符でくるむ
  // (空白や日本語が入っても 1 つの語として読めるようにするため)。
  function fmtOpen(notation, label, diagramType) {
    return normalize(notation, diagramType) + ' "' + String(label == null ? '' : label) + '" {';
  }

  var OPEN_RE = /^(\s*)(package|folder|frame|node|rectangle)\s+(?:"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*))\s*\{\s*$/;

  // 開き行を { notation, label, indent } に分ける。境界の開き行でなければ null。
  function parseOpen(line) {
    var m = String(line == null ? '' : line).match(OPEN_RE);
    if (!m) return null;
    return {
      indent: m[1],
      notation: m[2],
      label: m[3] !== undefined ? m[3] : m[4],
    };
  }

  function notationOf(line) {
    var p = parseOpen(line);
    return p ? p.notation : null;
  }

  // 表記だけを差し替える。ラベル・字下げ・中身・閉じ括弧はそのまま。
  // 境界の開き行でない行を渡されたら入力をそのまま返す (壊さない)。
  function changeNotation(text, lineNum, notation, diagramType) {
    var lines = String(text == null ? '' : text).split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var p = parseOpen(lines[idx]);
    if (!p) return text;
    var next = normalize(notation, diagramType);
    if (next === p.notation) return text;
    lines[idx] = p.indent + next + ' "' + p.label + '" {';
    return lines.join('\n');
  }

  return {
    ALL: ALL,
    DEFAULT_ID: DEFAULT_ID,
    notationsFor: notationsFor,
    isValid: isValid,
    normalize: normalize,
    fmtOpen: fmtOpen,
    parseOpen: parseOpen,
    notationOf: notationOf,
    changeNotation: changeNotation,
  };
})();
