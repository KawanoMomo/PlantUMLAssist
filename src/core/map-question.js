'use strict';
window.MA = window.MA || {};

// map-question — 対応表の不一致行を「先輩・reviewer への質問」1 件にして預ける
// (BLK-junior-20260908-0923-wish)。
//
// 対応表 (state-map / class-map) は名前の形だけで機械的に組を作る。名前も抽象度も
// 違う 2 枚では、状態名の一致が 1/6 しか付かず、残りは「片方だけ」と「見せかけの
// 部分一致」しか出ない。そこから先の「先輩が後から足したのはどちらか」は、
// 図を書いた本人に聞かないと確信が持てない。今までは聞く先が画面に無いので、
// junior はそこで自分の推測を書き足すか、run を止めるかしかなかった。
//
// ここは不一致行 1 つを質問文にして、自分の図の指摘ピン (review-pins) として置く。
// ピンは DSL の行コメントなので図と一緒に保存フォルダへ渡り、先輩・reviewer の
// 「📮 指摘箱」(pin-inbox は自分が書いた指摘を落とすので、相手側にだけ出る) に並ぶ。
// 質問を置いたら答えを待たずに次へ進める、というのがこの機能の要点。
//
// 宛先は本文の頭に書く。review-pins の書式 (id|state|author|at|anchor|text) を
// 増やさずに済み、書式を知らない読み手にもそのまま読める。
//   ' @pin 3|open|junior|2026-09-08T13:40|state Idle|[?→ primary, reviewer] 状態「…」…
//
// ここは DOM にもサーバにも触らない純関数だけを置き、描画と結線は app.js。
window.MA.mapQuestion = (function() {

  // 既定の宛先。図を書いた先輩と、突き合わせを見る reviewer の 2 人。
  var DEFAULT_TO = ['primary', 'reviewer'];

  // 本文の頭に付ける宛先の印。'[?→ ' で始まり ']' で閉じる。
  var OPEN = '[?→ ';
  var CLOSE = ']';
  var HEAD_RE = /^\[\?→\s*([^\]]*)\]\s*/;

  // 質問の本体に必ず入れる一文。junior が聞きたいのはいつもこれ 1 つで、
  // 文面を毎回考えさせない (考えさせると聞かずに済ませてしまう)。
  var ASK = 'どちらが後から足したか分かりません。確認してください';

  // 不一致の種類ごとの言い分。なぜ自分で決められないかを 1 行で添える。
  var REASON = {
    'ref-only': '参照図にだけあり、自分の図にはありません',
    'mine-only': '自分の図にだけあり、参照図にはありません',
    'partial': '名前が部分一致で、同じものを指しているか確信が持てません',
  };

  var TYPE_LABEL = {
    state: '状態',
    transition: '遷移',
    'class': 'クラス',
    relation: '関係',
    // BLK-junior-20260914-1606: クラスの中のメソッド・属性も対応表の行になる。
    member: 'メンバー',
  };

  function _s(v) { return v == null ? '' : String(v); }

  function _trim(v) { return _s(v).trim(); }

  // 聞ける行か。一致 (exact) は聞くことが無い。残る 3 つが不一致行。
  function askable(row) {
    return !!(row && REASON.hasOwnProperty(row.match));
  }

  function reasonOf(row) {
    return (row && REASON[row.match]) || '';
  }

  function typeLabel(type) {
    return TYPE_LABEL[_s(type)] || _s(type) || '要素';
  }

  // 宛先の並びを整える。空白だけの名前と重複を落とす。
  function normalizeTo(to) {
    var seen = {}, out = [];
    (Array.isArray(to) ? to : DEFAULT_TO).forEach(function(name) {
      var n = _trim(name).replace(/[,\]]/g, '');
      if (n === '' || seen[n]) return;
      seen[n] = true;
      out.push(n);
    });
    return out.length > 0 ? out : DEFAULT_TO.slice();
  }

  function defaultTo() { return DEFAULT_TO.slice(); }

  // 質問の本体 (宛先の印を除いた部分)。行の中身だけで決まるので、
  // 同じ行から 2 回作れば同じ文字列になる (二重に聞いたかの判定に使う)。
  function body(row) {
    if (!askable(row)) return '';
    var ref = _trim(row.ref) || '—';
    var mine = _trim(row.mine) || '—';
    return typeLabel(row.type) + '「参照図: ' + ref + ' ／ 自分: ' + mine + '」 '
      + ASK + ' (' + reasonOf(row) + ')';
  }

  function format(to, text) {
    return OPEN + normalizeTo(to).join(', ') + CLOSE + ' ' + _trim(text);
  }

  // 質問文なら {to, body} を返す。ふつうの指摘なら null。
  function parse(text) {
    var t = _s(text);
    var m = HEAD_RE.exec(t);
    if (!m) return null;
    var to = m[1].split(',').map(_trim).filter(function(n) { return n !== ''; });
    return { to: to, body: t.slice(m[0].length) };
  }

  function isQuestion(text) { return parse(text) !== null; }

  function questionText(row, to) {
    if (!askable(row)) return '';
    return format(to, body(row));
  }

  // 質問を貼る行。自分の図に対応する行があればそこへ、無ければ図の頭 (@startuml)
  // に貼る。参照図にしか無い要素は自分の図のどの行とも結び付かないので、
  // 「この図全体への質問」として頭に置くのが素直で、行が動いても迷子にならない。
  function anchorLine(row, dsl) {
    var lines = _s(dsl).replace(/\r\n?/g, '\n').split('\n');
    var RP = window.MA.reviewPins;
    function ok(i) {
      return i >= 0 && i < lines.length && _trim(lines[i]) !== ''
        && !(RP && RP.isPinLine(lines[i]));
    }
    if (row && typeof row.mineLine === 'number' && ok(row.mineLine - 1)) return row.mineLine;
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*@start/.test(lines[i])) return i + 1;
    }
    for (var j = 0; j < lines.length; j++) {
      if (ok(j)) return j + 1;
    }
    return 0;
  }

  // DSL に置かれている質問だけを拾う。pin の並びは review-pins が決める。
  function asked(dsl) {
    var RP = window.MA.reviewPins;
    if (!RP) return [];
    var out = [];
    RP.list(dsl).forEach(function(p) {
      var q = parse(p.text);
      if (!q) return;
      p.to = q.to;
      p.question = q.body;
      out.push(p);
    });
    return out;
  }

  // 同じ行を 2 回聞かない。行が動いても本体が同じなら同じ質問とみなす。
  function hasAsked(dsl, row) {
    var b = body(row);
    if (b === '') return false;
    return asked(dsl).some(function(p) { return p.question === b; });
  }

  // 質問を 1 件置く。置けたときだけ {text, line, question, to} を返す。
  // 二重に聞いたときは null を返し、呼び出し側が「聞き済み」と言えるようにする。
  function ask(dsl, row, opts) {
    var RP = window.MA.reviewPins;
    var o = opts || {};
    if (!RP || !askable(row)) return null;
    if (hasAsked(dsl, row)) return null;
    var line = anchorLine(row, dsl);
    if (!line) return null;
    var to = normalizeTo(o.to);
    var text = format(to, body(row));
    var out = RP.add(dsl, {
      line: line,
      author: _trim(o.author) || 'junior',
      at: _trim(o.at),
      text: text,
    });
    if (out === _s(dsl)) return null;
    return { text: out, line: line, question: body(row), to: to };
  }

  // 見出し。「何件預けたか」「まだ答えが返っていないのが何件か」だけを出す。
  // 答えが返る = 先輩・reviewer 側で対応済み (done) にされる、を答えとみなす。
  function summary(dsl) {
    var list = asked(dsl);
    if (list.length === 0) return '';
    var open = list.filter(function(p) { return p.state !== 'done'; }).length;
    return '先輩に預けた質問 ' + list.length + ' 件 (未回答 ' + open + ')';
  }

  function buttonLabel(dsl, row) {
    if (!askable(row)) return '';
    return hasAsked(dsl, row) ? '✔ 聞き済み' : '先輩に聞く';
  }

  return {
    DEFAULT_TO: DEFAULT_TO,
    ASK: ASK,
    defaultTo: defaultTo,
    askable: askable,
    reasonOf: reasonOf,
    typeLabel: typeLabel,
    normalizeTo: normalizeTo,
    body: body,
    format: format,
    parse: parse,
    isQuestion: isQuestion,
    questionText: questionText,
    anchorLine: anchorLine,
    asked: asked,
    hasAsked: hasAsked,
    ask: ask,
    summary: summary,
    buttonLabel: buttonLabel,
  };
})();
