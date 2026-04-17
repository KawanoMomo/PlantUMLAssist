'use strict';
window.MA = window.MA || {};
window.MA.textUpdater = (function() {
  // replaceLine: 1-based lineNum の行を newContent に置き換え
  function replaceLine(text, lineNum, newContent) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    lines[idx] = newContent;
    return lines.join('\n');
  }

  // insertAfter: 1-based lineNum の行の直後に newContent を挿入
  function insertAfter(text, lineNum, newContent) {
    var lines = text.split('\n');
    var idx = lineNum; // 0-based の挿入位置 = lineNum (lineNum-1 + 1)
    lines.splice(idx, 0, newContent);
    return lines.join('\n');
  }

  // insertBefore: 1-based lineNum の行の直前に newContent を挿入
  function insertBefore(text, lineNum, newContent) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    lines.splice(idx, 0, newContent);
    return lines.join('\n');
  }

  // deleteLine: 1-based lineNum の行を削除
  function deleteLine(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    lines.splice(idx, 1);
    return lines.join('\n');
  }

  // swapLines: 2行の内容を入れ替え
  function swapLines(text, lineA, lineB) {
    var lines = text.split('\n');
    var a = lineA - 1, b = lineB - 1;
    if (a < 0 || a >= lines.length || b < 0 || b >= lines.length) return text;
    var tmp = lines[a];
    lines[a] = lines[b];
    lines[b] = tmp;
    return lines.join('\n');
  }

  // appendToFile: ファイル末尾に追加（末尾の空行をスキップして直前に挿入）
  function appendToFile(text, newContent) {
    var lines = text.split('\n');
    var insertAt = lines.length;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, newContent);
    return lines.join('\n');
  }

  return {
    replaceLine: replaceLine,
    insertAfter: insertAfter,
    insertBefore: insertBefore,
    deleteLine: deleteLine,
    swapLines: swapLines,
    appendToFile: appendToFile,
  };
})();
