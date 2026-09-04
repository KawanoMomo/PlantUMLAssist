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

  // insertAtLine: insertBefore + 範囲外は先頭/末尾にクランプ (overlay UI 用)
  // 既存 insertBefore は範囲外で undefined を生むため、UI 由来の lineNum を安全に扱うラッパ。
  function insertAtLine(text, lineNum, newContent) {
    var lines = text.split('\n');
    var clamped = Math.max(1, Math.min(lines.length + 1, lineNum));
    return insertBefore(text, clamped, newContent);
  }

  // insertAfterLine: 「N行目の直後」 = 「N+1行目の前に挿入」 として委譲
  function insertAfterLine(text, lineNum, newContent) {
    return insertAtLine(text, lineNum + 1, newContent);
  }

  // extractRange (FEAT-181): 1-based の startLine〜endLine (両端含む) を抜き出し、
  // 単体でレンダリング可能な DSL として返す純関数。DOM に触れず副作用を持たない。
  // - 元テキストに @startuml / @enduml で始まる行があれば、抜き出し結果に不足している側だけを補う
  //   (抜き出し範囲が既にそれらを含む場合は二重に付けない)
  // - 元テキストに @startuml / @enduml が無い場合は何も付けない (素の抜き出しを返す)
  // - 範囲がテキスト外へ出る場合は存在する行だけを返し、startLine > endLine では空文字列を返す
  function extractRange(text, startLine, endLine) {
    if (typeof text !== 'string') return '';
    if (startLine > endLine) return '';
    var lines = text.split('\n');
    var from = Math.max(0, startLine - 1);
    var to = Math.min(lines.length, endLine); // slice の終端 (exclusive)
    if (from >= to) return '';
    var picked = lines.slice(from, to);

    var hasStartInSource = lines.some(function(l) { return l.trim().indexOf('@startuml') === 0; });
    var hasEndInSource = lines.some(function(l) { return l.trim().indexOf('@enduml') === 0; });
    var hasStartInPicked = picked.some(function(l) { return l.trim().indexOf('@startuml') === 0; });
    var hasEndInPicked = picked.some(function(l) { return l.trim().indexOf('@enduml') === 0; });

    if (hasStartInSource && !hasStartInPicked) picked.unshift('@startuml');
    if (hasEndInSource && !hasEndInPicked) picked.push('@enduml');
    return picked.join('\n');
  }

  return {
    replaceLine: replaceLine,
    insertAfter: insertAfter,
    insertBefore: insertBefore,
    deleteLine: deleteLine,
    swapLines: swapLines,
    appendToFile: appendToFile,
    insertAtLine: insertAtLine,
    insertAfterLine: insertAfterLine,
    extractRange: extractRange,
  };
})();
