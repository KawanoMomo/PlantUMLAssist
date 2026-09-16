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
  // opts.notes を立てると、タグに加えて note の自由文で述べられた意図も集める
  // (source: 'note')。突合から外すのはタグだけなので、既定では集めない。
  function collect(docs, opts) {
    var withNotes = !!(opts && opts.notes);
    var out = [];
    _list(docs).forEach(function(d) {
      if (!d) return;
      var dsl = _s(d.dsl || (d.doc && d.doc.dsl));
      parse(dsl).forEach(function(o) {
        out.push({ cls: o.cls, method: o.method, reason: o.reason, line: o.line,
                   doc: _s(d.name), source: 'tag' });
      });
      if (!withNotes) return;
      parseNotes(dsl).forEach(function(o) {
        out.push({ cls: o.cls, method: o.method, reason: o.reason, line: o.line,
                   doc: _s(d.name), source: 'note' });
      });
    });
    return out;
  }

  // ---- note の自由文から読む意図 --------------------------------------------
  //
  // BLK-reviewer-20260915-0307-wish: reviewer は毎 tick「note で意図を明記済み」と
  // 「まだ何も答えていない」を、driver_common_class.puml の note 本文を人力で読んで
  // 割り、指摘.md に手書きの表を作っていた。タグ (`@omit-method`) は機械が読めるが、
  // primary はまだ note のままなので、タグだけを見ていては今日の区別が付かない。
  //
  // note の本文は note-intent が組み立てる形 (「…の呼び先はクラス図に置かず、意図して
  // 省略しています」) と、primary が手で打った形 (「…は呼び先の詳細を意図的に割愛」) の
  // どちらも「意図」+「省略/割愛/除外/宣言しない」で言う。その言い回しがある note の
  // 中で名指しされた `Cls.Method()` / `Method()` を対象と見る。
  //
  // タグと違い、これは**弱い宣言**として扱う (source: 'note')。突合から外すのは
  // タグだけ (partition) で、note は「意図明記済み」と印を付けるだけ (annotate)。
  // 自由文の読み取りに突合の結果を委ねない。
  var NOTE_INTENT_RE = /意図[^\n]{0,16}(?:省略|割愛|除外|宣言しない)|(?:省略|割愛)[^\n]{0,8}(?:である旨|の旨)/;

  // `note ... : 本文` の 1 行と `note ...` 〜 `end note` の塊、どちらも拾う。
  // 返り値: [{ cls, body, line }] (cls は note の宛先。無ければ空)
  function noteBlocks(dsl) {
    var lines = _lines(dsl);
    var out = [];
    var open = null;
    var HEAD = /^\s*(?:h|r|l)?note\s+(?:(?:left|right|top|bottom)\s+of\s+|over\s+)?("?)([A-Za-z_][A-Za-z0-9_]*)?\1?\s*(?::\s*(.*))?$/i;
    for (var i = 0; i < lines.length; i++) {
      var raw = _s(lines[i]).replace(/\r$/, '');
      if (open) {
        if (/^\s*end\s*note\s*$/i.test(raw)) { out.push(open); open = null; }
        else open.body += '\n' + raw;
        continue;
      }
      var m = raw.match(HEAD);
      if (!m) continue;
      // 本文が同じ行にあるなら 1 行 note。無ければ end note まで溜める。
      if (m[3] != null && _s(m[3]).trim() !== '') {
        out.push({ cls: _s(m[2]), body: _s(m[3]), line: i + 1 });
      } else {
        open = { cls: _s(m[2]), body: '', line: i + 1 };
      }
    }
    if (open) out.push(open);
    return out;
  }

  // `\n` は puml では改行の書き方。読むときは本物の改行と同じに均す。
  function _body(s) { return _s(s).replace(/\\n/g, '\n'); }

  var PAIR_RE = /\b([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?/g;
  var BARE_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)/g;
  var NOT_METHOD = /^(puml|pu|plantuml|svg|png|md|js|json|html)$/i;

  // 意図を述べている note 1 つから対象を読む。
  // クラス付きの名指しが 1 つでもあればそれだけを採る (同じ note に出る裸の
  // `Foo()` は、その名指しの言い換えであることが多い)。
  function parseNote(block) {
    var body = _body(block && block.body);
    if (!NOTE_INTENT_RE.test(body)) return [];
    var out = [];
    var seen = {};
    var m;
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(body))) {
      if (NOT_METHOD.test(m[2])) continue;
      var k = _key(m[1]) + '#' + _key(m[2]);
      if (seen[k]) continue;
      seen[k] = true;
      out.push({ cls: m[1], method: m[2] });
    }
    if (!out.length) {
      // 名指しが無いなら、note の宛先クラスの中の `Foo()` を対象と見る。
      BARE_RE.lastIndex = 0;
      while ((m = BARE_RE.exec(body))) {
        if (NOT_METHOD.test(m[1])) continue;
        if (seen[_key(m[1])]) continue;
        seen[_key(m[1])] = true;
        out.push({ cls: _s(block.cls), method: m[1] });
      }
    }
    var reason = body.replace(/\s*\n\s*/g, ' ').trim();
    return out.map(function(t) {
      return { cls: t.cls, method: t.method, reason: reason, line: block.line, source: 'note' };
    });
  }

  // 1 枚の DSL から note 由来の意図を読む。
  function parseNotes(dsl) {
    var out = [];
    noteBlocks(dsl).forEach(function(b) {
      parseNote(b).forEach(function(o) { out.push(o); });
    });
    return out;
  }

  // 省略宣言が指摘 1 件を指しているか。
  // クラス指定があるときは、指摘の cls か owner (接頭辞) のどちらかに当たればよい
  // —— no-class の指摘は cls が空で、持ち主は接頭辞にしか出ないため。
  // 整合/メソッドの指摘は持ち主を target に持つので、そこも見る。
  function matches(om, issue) {
    if (!om || !issue) return false;
    if (_key(om.method) !== _key(issue.method)) return false;
    if (!om.cls) return true;
    var k = _key(om.cls);
    return k === _key(issue.cls) || k === _key(issue.owner) || k === _key(issue.target);
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

  // ---- 意図明記済み / 未対応 の仕分け ---------------------------------------
  //
  // partition は指摘を消すが、annotate は消さずに印だけ付ける。reviewer が
  // 指摘.md に書きたいのは「6 件のうち 3 件は意図明記済み、3 件は未対応」であって、
  // 意図明記済みが一覧から消えることではない (消えると継続 tick 数も切れる)。
  var INTENT = {
    tag: '意図明記済み(タグ)',
    note: '意図明記済み(note)',
    '': '未対応',
  };

  function intentLabel(src) { return INTENT[_s(src)] || INTENT['']; }

  // 指摘 1 件に当たる宣言を探す。タグが note より強い (両方あればタグを採る)。
  function findIntent(issue, omissions) {
    var hit = null;
    _list(omissions).forEach(function(om) {
      if (!matches(om, issue)) return;
      if (!hit || (_s(hit.source) !== 'tag' && _s(om.source) === 'tag')) hit = om;
    });
    return hit;
  }

  // 指摘の配列に intent / intentReason / intentDoc を足した写しを返す。
  // 元の配列は変えない (監査の結果そのものは書き換えない)。
  function annotate(issues, omissions) {
    return _list(issues).map(function(it) {
      var hit = findIntent(it, omissions);
      var copy = {};
      Object.keys(it || {}).forEach(function(k) { copy[k] = it[k]; });
      copy.intent = hit ? (_s(hit.source) || 'tag') : '';
      copy.intentReason = hit ? _s(hit.reason) : '';
      copy.intentDoc = hit ? _s(hit.doc) : '';
      return copy;
    });
  }

  // 監査結果 (audit.js の JSON) のメソッド系の箱にだけ印を付ける。
  // 触るのは配列の中身の写しだけで、監査の構造は保つ。
  function annotateAudits(audits, omissions) {
    var a = audits || {};
    function at(obj, key) {
      if (!obj || !obj.result || !Array.isArray(obj.result[key])) return;
      obj.result[key] = annotate(obj.result[key], omissions);
    }
    at(a.method, 'issues');
    at(a.consistency, 'methods');
    at(a.consistency, 'methodReplies');
    return a;
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
    NOTE_INTENT_RE: NOTE_INTENT_RE,
    INTENT: INTENT,
    parseTarget: parseTarget,
    parse: parse,
    noteBlocks: noteBlocks,
    parseNote: parseNote,
    parseNotes: parseNotes,
    collect: collect,
    matches: matches,
    partition: partition,
    intentLabel: intentLabel,
    findIntent: findIntent,
    annotate: annotate,
    annotateAudits: annotateAudits,
    tagLine: tagLine,
    has: has,
    apply: apply,
    describe: describe,
    summaryLine: summaryLine,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MA = window.MA || {}; window.MA.omitMethod = api; }
})();
