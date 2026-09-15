'use strict';
window.MA = window.MA || {};

// sequence-participant-zone — シーケンス図の DSL を「参加者の欄」と
// 「シーケンスの欄」の 2 領域として読む。
//
// BLK-human-20260915-1205: 途中から actor / participant / database を足すと、
// 宣言行が `@enduml` の直前 (= 全メッセージの後ろ) に入っていた。PlantUML は
// それでも描くが、宣言が上に揃っていないと DSL が読めず、左右の並びも
// 意図どおりにならない。挿入・並べ替え・一括追加のどこから足しても同じ場所に
// 入るよう、「欄の範囲」を答える純関数をここ 1 つに置き、全経路がこれを使う。
//
// 領域の見立て (上から):
//   1. 見出し     @startuml / title / skinparam / !include / autonumber / コメント …
//   2. 参加者の欄  participant / actor / boundary / control / entity / database /
//                 collections / queue の宣言が続く区間 (間の空行・コメントも欄の内)
//   3. シーケンスの欄  メッセージ・帯・alt / loop など、最初の実質行から `@enduml` まで
//
// 見出しは跨がない。宣言が 1 つも無ければ、最初のシーケンス行の直前に欄を作る。
// ここは純関数だけ。DOM にも window.MA の他モジュールにも触らない。
window.MA.seqParticipantZone = (function() {
  var TYPES = ['participant', 'actor', 'boundary', 'control', 'entity',
               'database', 'queue', 'collections'];

  // 見出しに置ける指令。`participant` より前に来ても欄の外として跨がない。
  var HEADER_WORDS = ['title', 'header', 'footer', 'caption', 'skinparam', 'scale',
                      'autonumber', 'hide', 'show', 'left', 'right', 'top', 'bottom',
                      'order', 'mainframe', 'allow_mixing', 'allowmixing'];

  var DECL_RE = new RegExp('^(' + TYPES.join('|') + ')\\s+\\S', 'i');
  var HEADER_RE = new RegExp('^(' + HEADER_WORDS.join('|') + ')\\b', 'i');

  function _s(v) { return v == null ? '' : String(v); }
  function _t(line) { return _s(line).trim(); }

  function isStartUml(line) { return /^@startuml\b/i.test(_t(line)); }
  function isEndUml(line) { return /^@enduml\b/i.test(_t(line)); }

  // 空行と `'` コメント、`/' … '/` の 1 行ブロックコメント。どの領域にも属さず、
  // 前後どちらの領域にも寄せずに「そのまま置いておく」行。
  function isBlankOrComment(line) {
    var t = _t(line);
    if (!t) return true;
    if (t.indexOf("'") === 0) return true;
    return /^\/'.*'\/$/.test(t);
  }

  // 参加者の宣言行か。色指定 (`#red`)・`as`・`order 10` が付いていても宣言。
  function isDeclaration(line) {
    var t = _t(line);
    if (!t) return false;
    return DECL_RE.test(t);
  }

  // 見出しに置ける行か (`@startuml` と `!` 指令、title / skinparam の類)。
  function isHeader(line) {
    var t = _t(line);
    if (!t) return false;
    if (isStartUml(t)) return true;
    if (t.indexOf('!') === 0) return true;   // !include / !theme / !define / !pragma
    if (isDeclaration(t)) return false;      // `order` は宣言の一部でもあるので宣言を先に見る
    return HEADER_RE.test(t);
  }

  // 参加者の欄の範囲を答える。
  //   headerEnd    見出しが終わった行番号 (0 起点。ここから参加者の欄が始まりうる)
  //   firstDecl    最初の宣言行 (無ければ -1)
  //   lastDecl     最後の宣言行 (無ければ -1)
  //   insertAt     新しい宣言を splice で差し込む位置 (この番号の「手前」に入る)
  //   firstBody    最初のシーケンス行 (メッセージ・帯・alt など。無ければ -1)
  //   count        宣言の数
  // 宣言はすべて先頭側の連なりだけを欄と見なす。メッセージの後ろに取り残された
  // 宣言 (この BLK が直す前の出力) は欄の外で、新しい宣言はそこへは足さない。
  function find(text) {
    var lines = _s(text).split('\n');
    var i = 0;
    var headerEnd = 0;

    // 1. 見出し。@startuml と、その後に続く指令・空行・コメント。
    while (i < lines.length && (isHeader(lines[i]) || isBlankOrComment(lines[i]))) {
      if (isEndUml(lines[i])) break;
      i++;
    }
    headerEnd = i;

    // 2. 参加者の欄。宣言が続く限り (間の空行・コメントは跨ぐ)。
    var firstDecl = -1;
    var lastDecl = -1;
    var j = i;
    while (j < lines.length && !isEndUml(lines[j])) {
      if (isDeclaration(lines[j])) {
        if (firstDecl < 0) firstDecl = j;
        lastDecl = j;
        j++;
        continue;
      }
      if (isBlankOrComment(lines[j])) { j++; continue; }
      break;   // 宣言でもコメントでもない = シーケンスの欄の始まり
    }

    // 3. シーケンスの欄の最初の実質行。
    var firstBody = -1;
    for (var k = (lastDecl >= 0 ? lastDecl + 1 : headerEnd); k < lines.length; k++) {
      if (isEndUml(lines[k])) break;
      if (isBlankOrComment(lines[k])) continue;
      if (isDeclaration(lines[k]) && lastDecl < 0) continue;   // 先頭の宣言は欄の内
      firstBody = k;
      break;
    }

    // 4. 差し込む位置。宣言があればその直後、無ければ最初のシーケンス行の直前。
    //    どちらも無ければ `@enduml` の直前 (= 末尾)。
    var insertAt;
    if (lastDecl >= 0) {
      insertAt = lastDecl + 1;
    } else if (firstBody >= 0) {
      insertAt = firstBody;
    } else {
      insertAt = lines.length;
      for (var e = lines.length - 1; e >= 0; e--) {
        if (isEndUml(lines[e])) { insertAt = e; break; }
      }
      if (insertAt < headerEnd) insertAt = headerEnd;
    }

    return {
      headerEnd: headerEnd,
      firstDecl: firstDecl,
      lastDecl: lastDecl,
      firstBody: firstBody,
      insertAt: insertAt,
      count: (firstDecl < 0) ? 0 : _countDecls(lines, firstDecl, lastDecl),
    };
  }

  function _countDecls(lines, from, to) {
    var n = 0;
    for (var i = from; i <= to && i < lines.length; i++) if (isDeclaration(lines[i])) n++;
    return n;
  }

  // `@startuml` / `@enduml` の枠を持つ DSL か。枠の無い断片への追記は枠の補完ごと
  // dsl-updater の職掌なので、呼び出し側はここで振り分ける。
  function hasFrame(text) {
    var lines = _s(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (isStartUml(lines[i]) || isEndUml(lines[i])) return true;
    }
    return false;
  }

  // 宣言行を参加者の欄の末尾に入れた DSL を返す。
  function insert(text, declLine) {
    var line = _s(declLine);
    if (!line.trim()) return _s(text);
    var src = _s(text);
    var lines = src.split('\n');
    var z = find(src);
    lines.splice(z.insertAt, 0, line);
    return lines.join('\n');
  }

  // 宣言が既にあるか (同じ alias を 2 度足さないため)。
  function hasDeclaration(text, alias) {
    var a = _t(alias);
    if (!a) return false;
    var lines = _s(text).split('\n');
    var z = find(text);
    if (z.firstDecl < 0) return false;
    for (var i = z.firstDecl; i <= z.lastDecl; i++) {
      if (!isDeclaration(lines[i])) continue;
      if (_aliasOf(lines[i]) === a) return true;
    }
    return false;
  }

  function _aliasOf(line) {
    var t = _t(line).replace(/\s+#[0-9A-Za-z_]+\s*$/, '');
    var m = t.match(new RegExp('^(?:' + TYPES.join('|') + ')\\s+(.*)$', 'i'));
    if (!m) return '';
    var rest = m[1].trim();
    var asM = rest.match(/\bas\s+("[^"]+"|\S+)\s*$/i);
    if (asM) return asM[1].replace(/^"(.*)"$/, '$1').trim();
    var first = rest.match(/^("[^"]+"|\S+)/);
    return first ? first[1].replace(/^"(.*)"$/, '$1').trim() : '';
  }

  return {
    TYPES: TYPES,
    isDeclaration: isDeclaration,
    isHeader: isHeader,
    isBlankOrComment: isBlankOrComment,
    find: find,
    hasFrame: hasFrame,
    insert: insert,
    hasDeclaration: hasDeclaration,
    aliasOf: _aliasOf,
  };
})();
