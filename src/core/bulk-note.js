'use strict';
window.MA = window.MA || {};

// bulk-note — 「同じ note を、影響が届く図すべてへ 1 回で打つ」。
//
// BLK-primary-20260915-0007: 「意図的な省略を note で明記する」対応は、依存グラフが
// 出した影響先の枚数だけ同じ文言を打ち直す作業になっていた。1 図ずつ 📂一覧から開き、
// DSL 欄の末尾にカーソルを合わせ、同じ 1 行をタイプする —— 影響先が 6 図なら 6 回。
// 文言は 1 つなのに手数が枚数に比例する。
//
// ここは純関数だけを置く (DOM に触らない)。図に応じた note の書き方と、
// 「既に同じ note がある図は飛ばす」判定がこのモジュールの仕事。
window.MA.bulkNote = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // シーケンス図に浮いた note (`note "…" as N1`) は置けない。参加者に掛ける
  // `note over X : …` にする必要があるので、図種ではなく **DSL の中身** で見分ける
  // (図種の宣言はファイルに残らないことがあり、保存フォルダ直読みでは頼れない)。
  var PARTICIPANT_RE = /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]*)"\s+as\s+([A-Za-z_][\w.]*)|([A-Za-z_][\w.]*))/;
  var MESSAGE_RE = /^([A-Za-z_][\w.]*)\s*(?:->>?|-->>?|<-|<--)\s*([A-Za-z_][\w.]*)\s*:/;

  // その図が「シーケンス図として読める」なら、note を掛ける参加者を返す。
  // 返らなければ浮いた note を使う。
  function anchorFor(dsl) {
    var lines = _s(dsl).split('\n');
    var firstMsg = null;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.charAt(0) === "'" || t.charAt(0) === '@') continue;
      var p = PARTICIPANT_RE.exec(t);
      if (p) return p[2] || p[3];
      var m = MESSAGE_RE.exec(t);
      if (m && !firstMsg) firstMsg = m[1];
    }
    return firstMsg;
  }

  // 打つ 1 行。参加者があれば `note over X : …`、無ければ浮いた note。
  // 本文の改行は PlantUML の改行記号に寄せる (1 行に収めると、どの図でも
  // 同じ 1 行が入る = 後から grep で追える)。
  function noteLine(dsl, text, opts) {
    var body = _s(text).trim().replace(/\s*\n\s*/g, '\\n');
    if (!body) return '';
    var anchor = (opts && opts.anchor) || anchorFor(dsl);
    if (anchor) return 'note over ' + anchor + ' : ' + body;
    var id = _s(opts && opts.id) || 'MA_BULK_NOTE';
    return 'note "' + body.replace(/"/g, "'") + '" as ' + id;
  }

  // 同じ文面の note が既にあるか。位置・掛け先の違いは見ない
  // (利用者にとっては「この図にもう書いてある」かどうかだけが問題)。
  function hasNote(dsl, text) {
    var body = _s(text).trim().replace(/\s*\n\s*/g, '\\n');
    if (!body) return false;
    var needle = body.replace(/"/g, "'");
    var lines = _s(dsl).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!/^note\b/i.test(t)) continue;
      if (t.indexOf(body) >= 0 || t.indexOf(needle) >= 0) return true;
    }
    return false;
  }

  // 浮いた note の別名は図の中で一意でなければならない。同じ図に 2 本目を
  // 打つとき、別名が衝突して図が全滅するのを避ける。
  function _freeId(dsl) {
    var base = 'MA_BULK_NOTE';
    var body = _s(dsl);
    if (body.indexOf(base) < 0) return base;
    for (var n = 2; n < 100; n++) {
      if (body.indexOf(base + n) < 0) return base + n;
    }
    return base + Date.now();
  }

  // 1 枚に打つ。入れる場所は `@enduml` の直前 (最後の 1 つ)。@enduml が
  // 無ければ末尾に足す (保存フォルダには断片だけのファイルも混ざる)。
  function applyToDsl(dsl, text) {
    var src = _s(dsl);
    if (!_s(text).trim()) return { dsl: src, added: 0, skipped: 0 };
    if (hasNote(src, text)) return { dsl: src, added: 0, skipped: 1 };
    var line = noteLine(src, text, { id: _freeId(src) });
    if (!line) return { dsl: src, added: 0, skipped: 0 };
    var lines = src.split('\n');
    var at = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^@enduml\b/i.test(lines[i].trim())) { at = i; break; }
    }
    if (at < 0) {
      // 末尾の空行の前に入れる (末尾に空行を増やして差分を汚さない)。
      var end = lines.length;
      while (end > 0 && lines[end - 1].trim() === '') end--;
      lines.splice(end, 0, line);
    } else {
      lines.splice(at, 0, line);
    }
    return { dsl: lines.join('\n'), added: 1, skipped: 0 };
  }

  // docs: [{ id, name, dsl }]、names: 打つ図の名前。
  // 「何枚に入り、何枚は既にあるか」を当てる前に見せる。
  function preview(docs, names, text) {
    var want = {};
    (names || []).forEach(function(n) { want[_s(n)] = true; });
    var rows = [];
    (docs || []).forEach(function(d) {
      if (!d || !want[_s(d.name)]) return;
      var has = hasNote(d.dsl, text);
      rows.push({
        name: _s(d.name),
        status: !_s(text).trim() ? 'none' : (has ? 'skip' : 'add'),
        line: has ? '' : noteLine(d.dsl, text, { id: _freeId(d.dsl) }),
      });
    });
    return rows;
  }

  // 選ばれた図へまとめて打つ。返すのは変わった図だけ (bulk-apply と同じ形)。
  function apply(docs, names, text) {
    var want = {};
    (names || []).forEach(function(n) { want[_s(n)] = true; });
    var changed = [];
    var added = 0, skipped = 0;
    (docs || []).forEach(function(d) {
      if (!d || !want[_s(d.name)]) return;
      var res = applyToDsl(d.dsl, text);
      added += res.added;
      skipped += res.skipped;
      if (res.dsl !== _s(d.dsl)) {
        changed.push({ id: d.id, name: _s(d.name), dsl: res.dsl, before: _s(d.dsl) });
      }
    });
    return { changed: changed, added: added, skipped: skipped };
  }

  // 画面に出す 1 行。打つ前は「何枚に入るか」、打った後は「何枚に入ったか」。
  function summaryText(rows) {
    var list = rows || [];
    var add = list.filter(function(r) { return r.status === 'add'; }).length;
    var skip = list.filter(function(r) { return r.status === 'skip'; }).length;
    if (!list.length) return '打つ図を選んでください';
    if (add === 0 && skip === 0) return 'note の文面を入力してください';
    if (add === 0) return '選んだ ' + skip + ' 図にはすべて同じ note があります';
    return add + ' 図に打ちます' + (skip ? '（' + skip + ' 図は既にあり）' : '');
  }

  return {
    anchorFor: anchorFor,
    noteLine: noteLine,
    hasNote: hasNote,
    applyToDsl: applyToDsl,
    preview: preview,
    apply: apply,
    summaryText: summaryText,
  };
})();
