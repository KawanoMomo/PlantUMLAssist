'use strict';

// save-guard — 「保存」を押した**その瞬間、書き込む前に**、いま保存しようと
// している図のメソッド呼び出しを同じ保存フォルダのクラス図と突き合わせ、
// 宣言の無い呼び出しを一覧で出す。
//
// BLK-reviewer-20260915-0007-wish: 突合の中身 (method-audit) も、保存の直後に
// 突合を掛ける仕掛け (save-check) も既にある。ただし save-check は
//   (a) 保存が**済んだ後**に出る … primary は「書けた」と思って次の図へ移る
//   (b) 開いているタブどうしでしか突き合わせない (_atDocs は workspace.list)
// の 2 点で、📂 一覧から 1 枚だけ開いて直す primary の手順に届かない。
// クラス図 (driver_common_class) はタブに載っていないので、シーケンス図の
// `ClockCtrl.EnableClock()` が宣言なしで保存されても誰も気付けず、reviewer が
// 次の tick で突合 → 指摘.md → primary が次の tick で読む、の 1 時間の往復に
// なっていた (同じ 6 件が 3 tick 動かない)。
//
// ここは「保存フォルダのクラス図」を相手に取り、保存前に止める判断だけを持つ。
// DOM にもサーバにも触らない (帯の描画と結線は app.js)。node からも require できる。
(function() {

  // 保存前に止める種別。method-as-class / draft-only は「他の図の書き方の誤り」で
  // あって、いま保存する図を直せば消えるものではないので、ここでは止めない。
  var BLOCKING = { 'no-class': 1, 'no-method': 1, arity: 1 };

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  function _ma() {
    return (typeof window !== 'undefined' && window.MA) ? window.MA.methodAudit : null;
  }

  // クラス宣言を 1 つでも持つ図か。突合の相手はこれだけでよい
  // (シーケンス図どうしを突き合わせても宣言は出てこない)。
  function hasClassDecl(doc) {
    var MAa = _ma();
    if (!MAa || !doc) return false;
    try {
      var dsl = _s(doc.dsl || (doc.doc && doc.doc.dsl));
      return MAa.parseClassDoc(dsl).classes.length > 0;
    } catch (e) { return false; }
  }

  // 突合の相手 (同フォルダのクラス図。自分自身は除く)。
  function peers(doc, folderDocs) {
    var name = _s(doc && doc.name);
    return _list(folderDocs).filter(function(d) {
      if (!d || _s(d.name) === '' || _s(d.name) === name) return false;
      return hasClassDecl(d);
    });
  }

  // 出した一覧の同一性。「このまま保存」を選んだあと、同じ顔ぶれのままなら
  // 二度は止めない (押すたびに同じ帯が出ると、保存そのものが重くなる)。
  function signature(res) {
    return _list(res && res.issues).map(function(i) {
      return _s(i.kind) + '|' + _s(i.method) + '|' + (i.args == null ? '-' : i.args);
    }).sort().join(',');
  }

  // opts: { doc: { name, dsl, diagramType }, folderDocs: [{ name, dsl }] }
  // 返り値: { doc, issues, checked, count, clean, noPeers }
  //   noPeers … 突き合わせる相手 (クラス図) が 1 枚も無い。このときは止めない
  //             (フォルダをまだ読んでいないだけの保存を、全部堰き止めないため)。
  function check(opts) {
    var o = opts || {};
    var doc = o.doc;
    var name = _s(doc && doc.name);
    var empty = { doc: name, issues: [], checked: [], count: 0, clean: true, noPeers: true };
    var MAa = _ma();
    if (!MAa || !name) return empty;

    var others = peers(doc, o.folderDocs);
    if (!others.length) return empty;

    var res;
    try { res = MAa.audit([doc].concat(others)); } catch (e) { return empty; }

    var issues = _list(res && res.issues).filter(function(i) {
      if (!BLOCKING[_s(i.kind)]) return false;
      return _list(i.docs).indexOf(name) >= 0;
    });

    return {
      doc: name,
      issues: issues,
      checked: others.map(function(d) { return _s(d.name); }),
      count: issues.length,
      clean: issues.length === 0,
      noPeers: false,
    };
  }

  // 帯を出すか (= 保存を止めるか)。
  function shouldBlock(res) {
    return !!(res && !res.noPeers && _list(res.issues).length > 0);
  }

  // 帯の 1 行目。何件を・何と突き合わせたかを言い切る。
  function summaryLine(res) {
    var r = res || {};
    if (!shouldBlock(r)) {
      if (r.noPeers) return '同じフォルダにクラス図が無いので、メソッドの突合はしていません';
      return _s(r.doc) + ' の呼び出しは、クラス図の宣言と食い違いません';
    }
    var ck = _list(r.checked);
    return '保存前の突合: ' + _s(r.doc) + ' に宣言の無いメソッド呼び出しが '
      + r.issues.length + ' 件あります（'
      + (ck.length === 1 ? ck[0] : 'クラス図 ' + ck.length + ' 枚')
      + 'と突合）';
  }

  // 帯に並べる行。文面は method-audit の言い方をそのまま使う
  // (突合ボード・指摘.md と同じ言葉にして、別物の指摘に見せない)。
  function lines(res) {
    var MAa = _ma();
    return _list(res && res.issues).map(function(i) {
      return {
        key: _s(i.kind) + '|' + _s(i.method) + '|' + (i.args == null ? '-' : i.args),
        kind: _s(i.kind),
        method: _s(i.method),
        cls: _s(i.cls),
        text: MAa ? MAa.describe(i) : _s(i.method),
        decl: declSuggestion(i),
      };
    });
  }

  // 「このクラスにこの 1 行を足せばよい」を、そのまま貼れる形で出す。
  // 足し先が決まらない (no-class) ものは空にする。
  function declSuggestion(issue) {
    if (!issue || !_s(issue.cls)) return '';
    var n = (issue.args == null || issue.args <= 0) ? 0 : issue.args;
    var args = [];
    for (var i = 1; i <= n; i++) args.push('arg' + i);
    return _s(issue.cls) + ' : +' + _s(issue.method) + '(' + args.join(', ') + ')';
  }

  var api = {
    hasClassDecl: hasClassDecl,
    peers: peers,
    check: check,
    signature: signature,
    shouldBlock: shouldBlock,
    summaryLine: summaryLine,
    lines: lines,
    declSuggestion: declSuggestion,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MA = window.MA || {}; window.MA.saveGuard = api; }
})();
