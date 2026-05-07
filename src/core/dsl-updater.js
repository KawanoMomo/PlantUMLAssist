'use strict';
window.MA = window.MA || {};
window.MA.dslUpdater = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;

  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (RP.isEndUml(lines[i])) { endIdx = i; break; }
    }
    if (endIdx >= 0) {
      lines.splice(endIdx, 0, newLine);
      return lines.join('\n');
    }
    // No @enduml — strip trailing blank lines and locate @startuml.
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    var hasStartUml = false;
    for (var j = 0; j < lines.length; j++) {
      if (RP.isStartUml(lines[j])) { hasStartUml = true; break; }
    }
    // userissue v1.2.2: スクラッチからの追加対応。 @enduml が無い場合は
    // PlantUML が "No valid @start/@end found" でレンダリング失敗するため、
    // 必要に応じ @startuml/@enduml を補完して常に有効な DSL を返す。
    if (!hasStartUml) lines.unshift('@startuml');
    lines.push(newLine);
    lines.push('@enduml');
    return lines.join('\n');
  }

  function moveLineUp(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx <= 0 || idx >= lines.length) return text;
    var tmp = lines[idx]; lines[idx] = lines[idx - 1]; lines[idx - 1] = tmp;
    return lines.join('\n');
  }

  function moveLineDown(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length - 1) return text;
    var tmp = lines[idx]; lines[idx] = lines[idx + 1]; lines[idx + 1] = tmp;
    return lines.join('\n');
  }

  function renameWithRefs(text, oldId, newId) {
    if (!oldId || !newId || oldId === newId) return text;
    var escaped = DU.escapeForRegex(oldId);
    var pattern = new RegExp('\\b' + escaped + '\\b', 'g');
    return text.split('\n').map(function(line) {
      if (DU.isPlantumlComment(line)) return line;
      var quoted = [];
      var stripped = line.replace(/"[^"]*"/g, function(m) {
        quoted.push(m);
        return '' + (quoted.length - 1) + '';
      });
      var replaced = stripped.replace(pattern, newId);
      return replaced.replace(/(\d+)/g, function(_, idx) {
        return quoted[parseInt(idx, 10)];
      });
    }).join('\n');
  }

  return {
    insertBeforeEnd: insertBeforeEnd,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    renameWithRefs: renameWithRefs,
  };
})();
