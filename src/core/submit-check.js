'use strict';
window.MA = window.MA || {};

// submit-check — BLK-primary-20260907-1403-wish「顧客提出前チェック」。
//
// 顧客向け資料に図を組み込む前に、14 枚のタイトル・注釈・部品名を 1 枚ずつ開いて
// 社内略語や日付入りの一時識別子が残っていないか目で読み比べていた。読む対象は
// 決まっている (title / note / 宣言名) のに、置き場所が図ごとに散っているだけなので、
// 抜き出して 1 枚の表にし、辞書に当たった行だけを赤くする。
//
// 辞書は利用者が足せる。既定は現場でそのまま出したくない綴り (Drv / Ctrl のような
// 省略形) と、日付入りの一時的な識別子。判定は「語として現れたか」で見る。
window.MA.submitCheck = (function() {
  // 既定の社内略語。1 語 1 行で利用者が書き換えられる。
  var DEFAULT_TERMS = [
    'Drv', 'Ctrl', 'Mgr', 'Cfg', 'Init', 'Tmp', 'WIP', 'TBD', 'FIXME', 'TODO',
    '仮', '暫定', '社内',
  ];

  // 日付入りの一時的な識別子。20260907 / 2026-09-07 / 2026_09_07 を拾う。
  var DATE_RE = /\b(?:20\d{2}[-_]?[01]\d[-_]?[0-3]\d)\b/;

  // 抜き出す行。title / note / 宣言 (participant・class・state・component・usecase)。
  var TITLE_RE = /^\s*title\s+(.+)$/i;
  var NOTE_INLINE_RE = /^\s*note\s+(?:(?:left|right|top|bottom|over)\b[^:]*)?:\s*(.+)$/i;
  var NOTE_OPEN_RE = /^\s*note\b(?!.*:)/i;
  var NOTE_END_RE = /^\s*end\s*note\s*$/i;
  var DECL_RE = new RegExp(
    '^\\s*(?:participant|actor|boundary|control|entity|database|collections|queue' +
    '|abstract\\s+class|abstract|class|interface|enum|state|component|node|package' +
    '|folder|rectangle|cloud|storage|usecase)\\s+(.+?)\\s*\\{?\\s*$', 'i');

  var KIND_LABEL = { title: 'タイトル', note: '注釈', name: '部品名' };

  // 宣言行から人が読む文字列だけを残す。`"表示名" as Alias` は両方見たいので
  // 引用符とキーワードだけ落として丸ごと返す。
  function _declText(rest) {
    return String(rest || '').replace(/^"|"$/g, '').trim();
  }

  // 辞書テキスト (1 行 1 語) を語の配列にする。空行と `#` 始まりは注記として捨てる。
  function parseDict(text) {
    var out = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function(l) {
      var s = l.trim();
      if (!s || s.charAt(0) === '#') return;
      if (out.indexOf(s) === -1) out.push(s);
    });
    return out;
  }

  // 語として現れたか。英数字の語は前後が英数字でないこと (Drive の Dr は当てない)。
  // CamelCase の中の Drv は語の切れ目とみなす (Uart_Drv / UartDrv どちらも当てる)。
  // 日本語の語は境界を持たないので単純な包含で見る。
  function hasTerm(text, term) {
    var s = String(text == null ? '' : text);
    var t = String(term == null ? '' : term);
    if (!s || !t) return false;
    if (!/^[A-Za-z0-9]+$/.test(t)) return s.indexOf(t) !== -1;
    var esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 前は「語の切れ目」か、CamelCase の切れ目 (UartDrv の t→D)。
    // 後ろは小文字・数字が続かないこと (Init は Initiative に当てない)。
    var head = /^[A-Z]/.test(t) ? '(?:^|[^A-Za-z0-9]|[a-z0-9])' : '(?:^|[^A-Za-z0-9])';
    var re = new RegExp(head + esc + '(?:$|[^a-z0-9])');
    if (re.test(s)) return true;
    // 綴りだけ違う (uart_drv のような全小文字) も同じ語として見る。
    return new RegExp('(?:^|[^A-Za-z0-9])' + esc + '(?:$|[^a-z0-9])', 'i').test(s);
  }

  // 1 行に当たった語の一覧。日付は '日付' という擬似的な語で返す。
  function hits(text, terms) {
    var out = [];
    (terms || []).forEach(function(t) {
      if (hasTerm(text, t) && out.indexOf(t) === -1) out.push(t);
    });
    if (DATE_RE.test(String(text == null ? '' : text)) && out.indexOf('日付') === -1) out.push('日付');
    return out;
  }

  // 1 枚の DSL から、顧客の目に入る文字列を行番号つきで抜き出す。
  function collectDoc(doc) {
    var out = [];
    var name = (doc && doc.name) || '';
    var lines = String((doc && doc.dsl) || '').split(/\r?\n/);
    var inNote = false;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.trim();
      var lineNo = i + 1;
      if (inNote) {
        if (NOTE_END_RE.test(line)) { inNote = false; continue; }
        if (line) out.push({ doc: name, kind: 'note', line: lineNo, text: line });
        continue;
      }
      if (!line || line.charAt(0) === "'" || line.charAt(0) === '@') continue;
      var tm = line.match(TITLE_RE);
      if (tm) { out.push({ doc: name, kind: 'title', line: lineNo, text: tm[1].trim() }); continue; }
      var nm = line.match(NOTE_INLINE_RE);
      if (nm) { out.push({ doc: name, kind: 'note', line: lineNo, text: nm[1].trim() }); continue; }
      if (NOTE_OPEN_RE.test(line)) { inNote = true; continue; }
      var dm = line.match(DECL_RE);
      if (dm) {
        var t = _declText(dm[1]);
        if (t) out.push({ doc: name, kind: 'name', line: lineNo, text: t });
      }
    }
    return out;
  }

  function collect(docs) {
    var out = [];
    (docs || []).forEach(function(d) { out = out.concat(collectDoc(d)); });
    return out;
  }

  // 画面が出す形。rows は全件 (赤くない行も並べて「見た」と言えるようにする)、
  // flagged は当たった行だけ。
  function check(docs, terms) {
    var list = (terms && terms.length) ? terms : DEFAULT_TERMS;
    var rows = collect(docs).map(function(r) {
      var h = hits(r.text, list);
      return {
        doc: r.doc, kind: r.kind, line: r.line, text: r.text,
        hits: h, flagged: h.length > 0,
      };
    });
    var flagged = rows.filter(function(r) { return r.flagged; });
    var docNames = [];
    rows.forEach(function(r) { if (docNames.indexOf(r.doc) === -1) docNames.push(r.doc); });
    return {
      rows: rows,
      flagged: flagged,
      docs: docNames,
      clean: flagged.length === 0,
      terms: list,
    };
  }

  // 画面の見出しに出す 1 行。0 件が「見ていない」ではなく「揃っている」と読めるように、
  // 何枚から何行を見たのかを必ず書く。
  function summaryLine(result) {
    if (!result) return '';
    return result.docs.length + ' 枚 / 見た行 ' + result.rows.length + ' 件 — '
      + '要確認 ' + result.flagged.length + ' 件';
  }

  function kindLabel(kind) { return KIND_LABEL[kind] || kind; }

  return {
    DEFAULT_TERMS: DEFAULT_TERMS,
    parseDict: parseDict,
    hasTerm: hasTerm,
    hits: hits,
    collectDoc: collectDoc,
    collect: collect,
    check: check,
    summaryLine: summaryLine,
    kindLabel: kindLabel,
  };
})();
