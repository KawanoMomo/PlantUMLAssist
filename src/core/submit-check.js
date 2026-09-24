'use strict';
window.MA = window.MA || {};

// submit-check — BLK-primary-20260907-1403-wish「顧客提出前チェック」。
//
// 顧客向け資料に図を組み込む前に、14 枚のタイトル・注釈・部品名を 1 枚ずつ開いて
// 社内略語や日付入りの一時識別子が残っていないか目で読み比べていた。読む対象は
// 決まっている (title / note / 宣言名) のに、置き場所が図ごとに散っているだけなので、
// 抜き出して 1 枚の表にし、辞書に当たった行だけを赤くする。
//
// BLK-owner-20260924-1252-prune: 社内略語 (SpiDrv / IRQCtrl …) の見分け方は 🔤 表記統一と同じ
// glossary 1 本にする。ここは略語を自分で決めず、呼び出し側が glossary で数えた語 (opts.abbrevs)
// を当てるだけ。辞書は「略語以外で出したくない語」(TBD / FIXME / 仮 / 暫定 …) の欄で、
// 利用者が足せる。日付入りの一時的な識別子は辞書に書かなくても当たる。判定は「語として現れたか」で見る。
window.MA.submitCheck = (function() {
  // 既定の「出したくない語」。1 語 1 行で利用者が書き換えられる。略語は入れない (glossary が数える)。
  var DEFAULT_TERMS = [
    'Init', 'Tmp', 'WIP', 'TBD', 'FIXME', 'TODO',
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

  // 辞書から、glossary が略語として見分ける語 (語尾の短縮語 Drv / Ctrl …) を外す。
  // 前の既定 (Drv / Ctrl / Mgr / Cfg) を保存したままの辞書でも、略語を 2 本の物差しで数えない。
  //   abbrevWords: glossary の短縮語の綴り (glossary.SUFFIXES の左列)
  function dropAbbrevWords(terms, abbrevWords) {
    var drop = {};
    (abbrevWords || []).forEach(function(w) { drop[String(w)] = true; });
    return (terms || []).filter(function(t) { return !drop[String(t)]; });
  }

  // 画面が出す形。rows は全件 (赤くない行も並べて「見た」と言えるようにする)、
  // flagged は当たった行だけ。
  //   opts.abbrevs: glossary で数えた社内略語の語 (🔤 表記統一の略語欄と同じ語)。
  //   行ごとの hits は 略語 → 辞書の語 → 日付 の順に並ぶ (abbrevs / words にも分けて持つ)。
  function check(docs, terms, opts) {
    var list = (terms && terms.length) ? terms : DEFAULT_TERMS;
    var abbrevs = [];
    ((opts && opts.abbrevs) || []).forEach(function(a) {
      var t = String(a == null ? '' : a);
      if (t && abbrevs.indexOf(t) === -1) abbrevs.push(t);
    });
    var rows = collect(docs).map(function(r) {
      var ab = abbrevs.filter(function(a) { return hasTerm(r.text, a); });
      var w = hits(r.text, list).filter(function(t) { return ab.indexOf(t) === -1; });
      var h = ab.concat(w);
      return {
        doc: r.doc, kind: r.kind, line: r.line, text: r.text,
        hits: h, abbrevs: ab, words: w, flagged: h.length > 0,
      };
    });
    var flagged = rows.filter(function(r) { return r.flagged; });
    var docNames = [];
    rows.forEach(function(r) { if (docNames.indexOf(r.doc) === -1) docNames.push(r.doc); });
    return {
      rows: rows,
      flagged: flagged,
      docs: docNames,
      clean: flagged.length === 0 && abbrevs.length === 0,
      terms: list,
      abbrevs: abbrevs,
    };
  }

  // 画面の見出しに出す 1 行。0 件が「見ていない」ではなく「揃っている」と読めるように、
  // 何枚から何行を見たのかを必ず書く。社内略語は 🔤 表記統一と同じ語の数 (語の種類) で言う。
  function summaryLine(result) {
    if (!result) return '';
    return result.docs.length + ' 枚 / 見た行 ' + result.rows.length + ' 件 — '
      + '要確認 ' + result.flagged.length + ' 件 / 社内略語 ' + (result.abbrevs || []).length + ' 語';
  }

  // 略語の節の 1 行。直す先は 🔤 表記統一 (ここに直す表は持たない)。
  function abbrevLine(result) {
    var ab = (result && result.abbrevs) || [];
    if (!ab.length) return '社内略語は残っていません';
    var shown = ab.slice(0, 6).join(', ') + (ab.length > 6 ? ' ほか' : '');
    return ab.length + ' 件の社内略語が全図に残っています (' + shown + ')';
  }

  function kindLabel(kind) { return KIND_LABEL[kind] || kind; }

  return {
    DEFAULT_TERMS: DEFAULT_TERMS,
    dropAbbrevWords: dropAbbrevWords,
    abbrevLine: abbrevLine,
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
