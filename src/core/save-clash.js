'use strict';

// save-clash — 「保存したその瞬間に、隣の persona のフォルダと部品名が表記違いで
// 衝突していないか」を、保存の流れの中で言い切る。
//
// BLK-primary-20260916-0526-wish: 衝突の判定 (name-clash) も、隣のフォルダを読む
// 経路 (📂一覧の「他personaと突合」) も既にある。ただし後者は押さないと動かず、
// 日常の保存には組み込まれていない。だから ClockCtrl ⇔ Clock_Ctrl の衝突は、
// reviewer が audit を通しで走らせて指摘.md に書いて初めて分かり、気づくのが
// 数 tick 後になる (今の継続 3 tick 目がそれ)。
//
// ここは「保存した図 1 枚について、衝突を出すか・何と書くか・どう揃えるか」だけを
// 決める。綴りの抽出は name-audit、衝突の束ね直しは name-clash の職掌なので持たない
// (規則を二重に持つと片方だけ直して食い違う)。DOM も fetch も触らない。
(function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 突合に掛ける図を 1 本に束ねる。同じ名前があれば mine を勝たせる
  // (いま保存した本文は、隣のフォルダを読んだ時点の控えより新しい)。
  function merge(others, mine) {
    var out = [];
    var at = {};
    function push(d) {
      if (!d || !d.name) return;
      var k = _s(d.name);
      if (at[k] != null) { out[at[k]] = d; return; }
      at[k] = out.length;
      out.push(d);
    }
    _list(others).forEach(push);
    _list(mine).forEach(push);
    return out;
  }

  // 保存した図 1 枚の判定。audit は window.MA.nameClash.audit() の結果。
  // doc は突合の中でのその図の呼び名 (`フォルダ名/ファイル名`)。
  function evaluate(audit, opts) {
    var a = audit || null;
    var doc = _s(opts && opts.doc);
    var base = {
      doc: doc, persona: '', checked: 0, personas: [], verdict: 'unchecked',
      others: [], pairs: [],
    };
    if (!a || !doc) return base;
    var row = (a.byDoc || {})[doc] || null;
    base.checked = a.checked || 0;
    base.personas = _list(a.personas).filter(function(p) { return p; });
    if (!row) {
      // 照合はしたが、この図が突合に入っていない (保存直後に読み直せなかった等)。
      // 「衝突なし」とは言わない — 見ていないことを見ていないと言う。
      return base;
    }
    base.persona = _s(row.persona);
    base.verdict = _s(row.verdict) || 'clean';
    base.others = _list(row.others).slice();

    // 衝突している組について、こちら側の綴りと相手側の綴りを名指しで取り出す。
    // 「どちらが自分の綴りか」を言わないと、揃える向きを決めるためにまた図を開く。
    _list(a.crossGroups).forEach(function(g) {
      var mineSp = null, theirs = [];
      _list(g.spellings).forEach(function(sp) {
        if (_list(sp.docs).indexOf(doc) >= 0) mineSp = sp;
      });
      if (!mineSp) return;
      _list(g.spellings).forEach(function(sp) {
        if (sp === mineSp) return;
        theirs.push({
          name: _s(sp.name),
          personas: _list(sp.personas).filter(function(p) { return p; }),
          docs: _list(sp.docs).slice(),
        });
      });
      if (!theirs.length) return;
      base.pairs.push({
        key: _s(g.key), mine: _s(mineSp.name), suggested: _s(g.suggested),
        theirs: theirs,
      });
    });
    return base;
  }

  // 帯を出すか。相手とぶつかっているときだけ。自分の中の揺れは 📂一覧の職掌で、
  // 保存のたびに帯で図を隠すほどのことではない (相手に断らずに揃えられる)。
  function shouldWarn(ev) {
    return !!(ev && ev.verdict === 'cross' && _list(ev.pairs).length);
  }

  // 衝突が無いときにステータスバーへ足す 1 語。「何枚と照合しての結果か」を必ず言う
  // (照合していないだけの 0 件と読み分けられないと、結局 audit を回し直すことになる)。
  function statusLine(ev) {
    var e = ev || {};
    if (e.verdict === 'unchecked' || !e.checked) return '他 persona とは照合していません';
    var who = _list(e.personas).filter(function(p) { return p && p !== e.persona; });
    var tail = '（' + e.checked + ' 枚'
      + (who.length ? '・' + who.join('・') : '') + 'と照合）';
    if (e.verdict === 'internal') {
      return '他 persona との衝突なし。自分の中の表記の揺れだけです' + tail;
    }
    return '他 persona との部品名の衝突なし' + tail;
  }

  // 帯の見出し。誰と・どの綴りでぶつかっているかを 1 行で言い切る。
  function summaryLine(ev) {
    var e = ev || {};
    var who = _list(e.others).join('・') || '他の persona';
    var names = _list(e.pairs).map(function(p) {
      return p.mine + ' ⇔ ' + p.theirs.map(function(t) { return t.name; }).join(' / ');
    }).join('、');
    return who + 'と部品名が衝突しています（' + names + '）';
  }

  // 帯に並べる行。相手側の図まで名指しする (名指ししないと 1 枚ずつ開くことになる)。
  function lines(ev) {
    var out = [];
    _list(ev && ev.pairs).forEach(function(p) {
      p.theirs.forEach(function(t) {
        out.push({
          key: p.key, mine: p.mine, theirs: t.name, suggested: p.suggested,
          personas: t.personas.slice(), docs: t.docs.slice(),
          text: p.mine + ' ⇔ ' + t.name + ' — 揃える先: ' + p.suggested
            + '（' + (t.personas.length ? t.personas.join('・') + ' の ' : '')
            + t.docs.join('、') + '）',
        });
      });
    });
    return out;
  }

  // 揃える操作 1 回分。自分の綴りを、組の揃える先へ置き換える。
  // 揃える先が自分の綴りと同じなら、動かすのは相手側なので何も出さない
  // (相手の図をこちらから書き換えると、断りのない変更になる)。
  function fixPlan(ev) {
    var plans = [];
    _list(ev && ev.pairs).forEach(function(p) {
      if (!p.suggested || p.suggested === p.mine) return;
      plans.push({ from: p.mine, to: p.suggested });
    });
    return plans;
  }

  // 揃えるボタンの文言。何が何になるかをボタンの上で言う
  // (押してから確かめる操作を作らない)。
  function fixLabel(plan) {
    if (!plan) return '';
    return '⇄ ' + plan.from + ' を ' + plan.to + ' に揃える';
  }

  var api = {
    merge: merge, evaluate: evaluate, shouldWarn: shouldWarn,
    statusLine: statusLine, summaryLine: summaryLine, lines: lines,
    fixPlan: fixPlan, fixLabel: fixLabel,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MA = window.MA || {}; window.MA.saveClash = api; }
})();
