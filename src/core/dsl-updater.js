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

  // 行の塊 [startLine, endLine] (1 始まり・両端を含む) をまとめて 1 行上 / 下へ動かす
  // (TICKET-junior-20261122-1001-wish。DSL エディタで複数行を選んで Alt+↑ / Alt+↓)。
  // 塊の隣の 1 行が塊の反対側へ回るだけで、ほかの行と改行コード (CRLF / LF) は変えない。
  // 端 (上なら 1 行目、下なら最終行に塊が掛かる) や範囲外では入力をそのまま返す。
  function _splitKeepEol(text) {
    var eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    return { lines: text.split(eol), eol: eol };
  }
  function moveLinesUp(text, startLine, endLine) {
    var sp = _splitKeepEol(text), lines = sp.lines;
    var s = startLine - 1, e = endLine - 1;
    if (s <= 0 || e < s || e >= lines.length) return text;
    var above = lines[s - 1];
    lines.splice(s - 1, 1);
    lines.splice(e, 0, above);
    return lines.join(sp.eol);
  }
  function moveLinesDown(text, startLine, endLine) {
    var sp = _splitKeepEol(text), lines = sp.lines;
    var s = startLine - 1, e = endLine - 1;
    if (s < 0 || e < s || e >= lines.length - 1) return text;
    var below = lines[e + 1];
    lines.splice(e + 1, 1);
    lines.splice(s, 0, below);
    return lines.join(sp.eol);
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

  // 右パネルの「変更を反映」で名前 (id) を変えたときの共通の口 (TICKET-owner-20261124-0422-1)。
  // 宣言の行 (declLine, 1 始まり) は図種の更新関数 updateDecl(text) -> text が書き換え (表示名・
  // ステレオタイプ・色の書き方は図種の流儀のまま)、withRefs なら宣言の行の外で oldId を識別子として
  // 持つ行 (遷移・関係の両端、`note … of X` など) を newId に付け替える。行の数は変えないので
  // declLine はどちらの順でも同じ行を指す。宣言の行が更新関数で変わらない (宣言の無い要素で
  // declLine が関係の行を指す等) ときは、その行も参照として付け替える (要素が 2 つに割れない)。
  // CRLF の図で、図種の更新関数が宣言の行の末尾の \r を落としたら戻す (その行だけ LF に替わらない)。
  function _keepCr(before, after, idx) {
    var b = before.split('\n'), a = after.split('\n');
    if (a.length !== b.length || idx < 0 || idx >= b.length) return after;
    if (/\r$/.test(b[idx]) && !/\r$/.test(a[idx])) { a[idx] += '\r'; return a.join('\n'); }
    return after;
  }
  function renameDecl(text, declLine, oldId, newId, updateDecl, withRefs) {
    var renamed = (oldId && newId && oldId !== newId);
    var idx = (declLine | 0) - 1;
    if (!renamed || !withRefs) return _keepCr(text, updateDecl(text), idx);
    var lines = text.split('\n');
    if (idx < 0 || idx >= lines.length) return renameWithRefs(updateDecl(text), oldId, newId);
    var refs = renameWithRefs(text, oldId, newId).split('\n');
    refs[idx] = lines[idx];
    var outside = refs.join('\n');
    var out = updateDecl(outside);
    if (out === outside) return renameWithRefs(text, oldId, newId);
    return _keepCr(outside, out, idx);
  }

  // FEAT-180 (resolves HFR-041): 既存の skinparam 行をすべて取り除き、
  // presetLines で与えられた skinparam 行群を @startuml の直後に挿入して返す。
  // プリセットの中身(何を何色にするか)は呼び出し側が持ち、本関数は差し替えのみを行う。
  // presetLines が空配列のときは「プリセット無し」= 既存 skinparam の除去のみ。
  function applySkinparamPreset(text, presetLines) {
    if (text == null) return '';
    var add = [];
    var src = presetLines || [];
    for (var a = 0; a < src.length; a++) {
      var s = String(src[a]);
      if (s.trim() !== '') add.push(s);
    }
    var lines = String(text).split('\n');
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*skinparam\b/i.test(lines[i])) continue;
      kept.push(lines[i]);
    }
    if (add.length === 0) return kept.join('\n');
    var startIdx = -1;
    for (var j = 0; j < kept.length; j++) {
      if (/^\s*@startuml\b/i.test(kept[j])) { startIdx = j; break; }
    }
    if (startIdx < 0) return add.concat(kept).join('\n');
    return kept.slice(0, startIdx + 1)
      .concat(add)
      .concat(kept.slice(startIdx + 1))
      .join('\n');
  }

  return {
    insertBeforeEnd: insertBeforeEnd,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    moveLinesUp: moveLinesUp,
    moveLinesDown: moveLinesDown,
    renameWithRefs: renameWithRefs,
    renameDecl: renameDecl,
    applySkinparamPreset: applySkinparamPreset,
  };
})();
