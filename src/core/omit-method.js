'use strict';

// omit-method — 「このメソッドは意図して宣言しない」を、自由文コメントではなく
// 監査ツールが読める 1 行の宣言として puml に置き、突合から外す。
//
// BLK-reviewer-20260915-0106-wish: primary は依頼2 (宣言の無い呼び出し 6 件) に
// `note top of ClockCtrl : ...意図的に割愛...` と自由文で答えた。趣旨には沿って
// いるが、audit.js / method-audit はコメント文を読めないので、突合では毎 tick
// 同じ 6 件が「未解消」として光り続け、reviewer は puml を開いて note の日本語を
// 人力で読み、これは対応済みだと判別していた。
//
// ここは「意図的な省略」の書式と、その宣言と指摘の突き合わせだけを持つ。
// DOM にもサーバにも触らない (帯の第 3 選択肢と結線は app.js)。node からも require できる。
//
// 書式 (PlantUML のコメント行なので描画には出ない):
//   '@omit-method ClockCtrl.EnableClock 呼び先は BSW 提供。本設計では宣言しない
//   '@omit-method EnableClock 理由                    … クラスを問わず名前で外す
(function() {

  var TAG = '@omit-method';
  // 行頭のコメント記号 `'` と `@omit-method`、対象 (`Cls.Method` か `Method`)、
  // 残り全部が理由。理由は日本語の自由文でよい —— 機械が読むのは対象だけで、
  // 理由は人が読む。
  var TAG_RE = /^\s*'\s*@omit-method\s+([A-Za-z_][A-Za-z0-9_.-]*)\s*(.*)$/;

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }
  // 突合の正規化は method-audit と同じ規則にする (Spi_Init と SpiInit を同じと見る)。
  function _key(s) { return _s(s).toLowerCase().replace(/[_\-.\s]/g, ''); }
  function _lines(text) { return _s(text).split(/\r?\n/); }

  // 対象 `ClockCtrl.EnableClock` を { cls, method } に割る。
  // ドットが無ければクラス指定なし (どのクラスの同名でも外す)。
  function parseTarget(target) {
    var t = _s(target).trim();
    var i = t.lastIndexOf('.');
    if (i <= 0 || i === t.length - 1) return { cls: '', method: t };
    return { cls: t.slice(0, i), method: t.slice(i + 1) };
  }

  // 1 枚の DSL から省略宣言を読む。
  // 返り値: [{ cls, method, reason, line }]
  function parse(dsl) {
    var out = [];
    _lines(dsl).forEach(function(raw, idx) {
      var m = _s(raw).replace(/\r$/, '').match(TAG_RE);
      if (!m) return;
      var t = parseTarget(m[1]);
      if (!t.method) return;
      out.push({ cls: t.cls, method: t.method, reason: _s(m[2]).trim(), line: idx + 1 });
    });
    return out;
  }

  // docs 一式から集める。doc は { name, dsl } (dsl は doc.doc.dsl でもよい)。
  function collect(docs) {
    var out = [];
    _list(docs).forEach(function(d) {
      if (!d) return;
      var dsl = _s(d.dsl || (d.doc && d.doc.dsl));
      parse(dsl).forEach(function(o) {
        out.push({ cls: o.cls, method: o.method, reason: o.reason, line: o.line, doc: _s(d.name) });
      });
    });
    return out;
  }

  // 省略宣言が指摘 1 件を指しているか。
  // クラス指定があるときは、指摘の cls か owner (接頭辞) のどちらかに当たればよい
  // —— no-class の指摘は cls が空で、持ち主は接頭辞にしか出ないため。
  function matches(om, issue) {
    if (!om || !issue) return false;
    if (_key(om.method) !== _key(issue.method)) return false;
    if (!om.cls) return true;
    var k = _key(om.cls);
    return k === _key(issue.cls) || k === _key(issue.owner);
  }

  // 指摘の一覧を「残る指摘」と「意図省略で外したもの」に割る。
  // 外したものには理由と、宣言が書かれている図の名前を添える (reviewer は
  // これを読めば puml を開かずに「意図省略で解消」と書ける)。
  function partition(issues, omissions) {
    var oms = _list(omissions);
    var kept = [];
    var omitted = [];
    _list(issues).forEach(function(it) {
      var hit = null;
      for (var i = 0; i < oms.length; i++) {
        if (matches(oms[i], it)) { hit = oms[i]; break; }
      }
      if (!hit) { kept.push(it); return; }
      var copy = {};
      Object.keys(it).forEach(function(k) { copy[k] = it[k]; });
      copy.omitted = true;
      copy.reason = _s(hit.reason);
      copy.omitDoc = _s(hit.doc);
      omitted.push(copy);
    });
    return { issues: kept, omitted: omitted };
  }

  // 指摘 1 件を、そのまま puml に貼れる 1 行にする。
  // クラスが決まらない (no-class) ものはメソッド名だけで書く。
  function tagLine(issue, reason) {
    if (!issue) return '';
    var cls = _s(issue.cls) || _s(issue.owner);
    var target = (cls ? cls + '.' : '') + _s(issue.method);
    var r = _s(reason).trim().replace(/[\r\n]+/g, ' ');
    return "'" + TAG + ' ' + target + (r ? ' ' + r : '');
  }

  // 同じ対象の宣言が既にあるか (同じ行を二重に足さない)。
  function has(dsl, issue) {
    return parse(dsl).some(function(o) { return matches(o, issue); });
  }

  // 宣言行を DSL に足す。`@enduml` の**直前**に入れる —— 末尾に置くと
  // PlantUML が図の外の行として読み、保存し直すたびに位置が揺れる。
  function apply(dsl, tagLines) {
    var add = _list(tagLines).filter(function(l) { return _s(l).trim() !== ''; });
    if (!add.length) return _s(dsl);
    var lines = _lines(dsl);
    var at = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml\b/.test(lines[i])) { at = i; break; }
    }
    if (at < 0) return lines.concat(add).join('\n');
    return lines.slice(0, at).concat(add, lines.slice(at)).join('\n');
  }

  // 外した 1 件の説明。突合ボード・指摘.md にそのまま書ける言い方にする。
  function describe(om) {
    if (!om) return '';
    var cls = _s(om.cls) || _s(om.owner);
    var name = (cls ? cls + '.' : '') + _s(om.method);
    return name + ' は意図的に宣言を省略 ('
      + (_s(om.reason) || '理由の記載なし') + ')'
      + (_s(om.omitDoc) ? ' — ' + _s(om.omitDoc) + ' の宣言' : '');
  }

  // 要約 1 行。0 件なら空 (何も外していないときに行を増やさない)。
  function summaryLine(omitted) {
    var n = _list(omitted).length;
    if (!n) return '';
    return '意図的な省略の宣言 (' + TAG + ') で突合から外した指摘が ' + n + ' 件あります';
  }

  var api = {
    TAG: TAG,
    TAG_RE: TAG_RE,
    parseTarget: parseTarget,
    parse: parse,
    collect: collect,
    matches: matches,
    partition: partition,
    tagLine: tagLine,
    has: has,
    apply: apply,
    describe: describe,
    summaryLine: summaryLine,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MA = window.MA || {}; window.MA.omitMethod = api; }
})();
