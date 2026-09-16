'use strict';
window.MA = window.MA || {};

// part-card — 部品 1 個ぶんの「カード」。6 図種を 1 まとまりとして、
// 揃っている枚数と、先輩に合っていない図種を 1 行で言う。
//
// BLK-junior-20260915-2346-wish: 部品ビュー (part-board) は 6 図種を先輩と自分の
// 2 列で並べるところまでは出せるが、並ぶのは本文そのものなので「6 枚のうち何枚
// 済んだか」と「どの図がまだ先輩に合っていないか」は 6 行を目で読み比べないと
// 言えない。新部品を起こす周でユースケース図 1 枚だけが残っている状態も、
// 画面には「その行が空」としてしか出ず、進捗としては読めなかった。
//
// ここは part-board.board() の行をそのまま材料にして 2 つだけを足す。
//
//   進捗 … 自分の図がある図種の枚数 / 6。「手本があるか」ではなく
//          「自分が持っているか」で数える (junior が終わらせるのは自分の 6 枚)
//   一致 … 先輩の欄から拾った名前が自分の欄にあるか。綴りだけが違うもの
//          (Spi_Init ⇔ SPI_Init) は「無い」と混ぜず表記揺れとして別に言う
//
// 名前の抽出は part-vocab、綴りの寄せは name-pairing をそのまま使う
// (同じ図に対して名前帳と一致判定が違うことを言わないよう、規則を 2 つ持たない)。
// 相乗り図 (driver_common_class) が手本のときは、その部品に属する名前だけを見る
// — 他部品の名前が「自分に無い」に数えられると、一致は永遠に赤になる。
// DOM も fetch も触らない。読み込みと描画は app.js。
window.MA.partCard = (function() {

  var TOTAL = 6;

  function _s(v) { return v == null ? '' : String(v); }

  function _PB() { return window.MA.partBoard; }
  function _PV() { return window.MA.partVocab; }

  function _norm(name) {
    var PV = _PV();
    if (PV && PV.normalize) return PV.normalize(name);
    return _s(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // その部品の名前か。相乗り図 (driver_common_class) の手本から他部品の名前を
  // 落とすためだけに使う。落とすのは「並んでいる他の部品の名を頭に持つ」もの
  // だけ (`Can_Init` を SPI のカードで数えない)。接頭辞を持たない名前
  // (TransferComplete / Idle / Driver_Common) は誰のものとも決められないので
  // 落とさない — 落とすと状態遷移図の一致判定が空振りする。
  function _ofPart(part, others, name) {
    var p = _norm(part);
    if (!p) return true;
    var n = _norm(name);
    if (!n) return false;
    if (n.indexOf(p) === 0) return true;
    for (var i = 0; i < others.length; i++) {
      var o = _norm(others[i]);
      if (o && o !== p && n.indexOf(o) === 0) return false;
    }
    return true;
  }

  function _names(text, kind, part, others) {
    var PV = _PV();
    if (!PV || !PV.namesIn || !_s(text)) return [];
    var seen = {};
    var out = [];
    (PV.namesIn(text, kind) || []).forEach(function(n) {
      if (!n || !n.name) return;
      if (seen[n.name]) return;
      seen[n.name] = true;
      if (part && !_ofPart(part, others || [], n.name)) return;
      out.push({ name: n.name, role: n.role });
    });
    return out;
  }

  // 1 行ぶんの一致。手本か自分のどちらかが無い行は判定しない
  // ('n/a')。判定できないものを「合っている」に寄せると、進捗が嘘になる。
  function verdictOf(row, part, others) {
    var r = row || {};
    if (!r.ref || !r.mine || r.ref.missing || r.mine.missing) {
      return { verdict: 'n/a', missing: [], variant: [], checked: 0 };
    }
    var refNames = _names(r.ref.text, r.kind, r.ref.shared ? part : '', others);
    var mineNames = _names(r.mine.text, r.kind, '', null);
    var exact = {};
    var loose = {};
    mineNames.forEach(function(n) {
      exact[n.name] = true;
      loose[_norm(n.name)] = n.name;
    });
    var missing = [];
    var variant = [];
    refNames.forEach(function(n) {
      if (exact[n.name]) return;
      var hit = loose[_norm(n.name)];
      if (hit) variant.push({ name: n.name, mine: hit, role: n.role });
      else missing.push({ name: n.name, role: n.role });
    });
    var v = missing.length ? 'differ' : (variant.length ? 'variant' : 'agree');
    if (!refNames.length) v = 'n/a';
    return { verdict: v, missing: missing, variant: variant, checked: refNames.length };
  }

  // 部品 1 個ぶんのカード。行は part-board のものに一致の判定を足しただけ。
  function card(part, mine, theirs) {
    var PB = _PB();
    var p = _s(part).toLowerCase();
    var bd = (PB && PB.board) ? PB.board(p, mine, theirs) : { part: p, rows: [] };
    var others = (PB && PB.parts) ? PB.parts(mine, theirs) : [];
    var rows = (bd.rows || []).map(function(r) {
      var v = verdictOf(r, p, others);
      return {
        kind: r.kind,
        label: r.label,
        ref: r.ref,
        mine: r.mine,
        state: r.state,
        verdict: v.verdict,
        missing: v.missing,
        variant: v.variant,
        checked: v.checked,
        has: !r.mine.missing,
      };
    });
    return { part: p, rows: rows };
  }

  // 進捗。母数は常に 6 (足りない図種が画面から消えると、残りが分からなくなる)。
  function progress(cd) {
    var rows = (cd && cd.rows) || [];
    var done = 0;
    var missing = [];
    rows.forEach(function(r) {
      if (r.has) done++;
      else missing.push(r.label);
    });
    return {
      done: done,
      total: TOTAL,
      missing: missing,
      text: TOTAL + ' 図種中 ' + done + ' 枚',
    };
  }

  // 先輩に合っていない図種。differ を先に、表記揺れだけのものを後に出す
  // (打ち直しが要るものと、綴りを寄せるだけのものは手間が違う)。
  function gaps(cd) {
    var rows = (cd && cd.rows) || [];
    var out = [];
    rows.forEach(function(r) { if (r.verdict === 'differ') out.push(r); });
    rows.forEach(function(r) { if (r.verdict === 'variant') out.push(r); });
    return out;
  }

  function verdictLabel(v) {
    if (v === 'agree') return '先輩と一致';
    if (v === 'variant') return '綴りだけ違う';
    if (v === 'differ') return '先輩に合っていない';
    return '判定できない';
  }

  // 行 1 本ぶんの説明。色だけだと 6 行あるとき理由が読めないので文字でも言う。
  function rowLine(r) {
    if (!r) return '';
    var head = r.label + ': ';
    if (!r.has) return head + 'まだ無い' + (r.ref && !r.ref.missing ? ' (手本 ' + r.ref.name + ')' : '');
    if (r.verdict === 'differ') {
      var names = r.missing.slice(0, 3).map(function(m) { return m.name; }).join(' ');
      return head + '先輩に合っていない — 自分に無い名前 ' + r.missing.length + ' 件: ' + names;
    }
    if (r.verdict === 'variant') {
      var v0 = r.variant[0];
      return head + '綴りだけ違う — ' + v0.name + ' ⇔ ' + v0.mine + (r.variant.length > 1 ? ' ほか ' + (r.variant.length - 1) + ' 件' : '');
    }
    if (r.verdict === 'agree') return head + '先輩と一致 (' + r.checked + ' 件を照合)';
    return head + (r.ref && r.ref.missing ? '手本なし' : '照合する名前が無い');
  }

  // カードの見出し 1 行。部品名・進捗・残りの合っていない図種を 1 行に畳む。
  // 手順 7 (保存後の見返し) はこの 1 行を読めば済むようにする。
  function headline(cd) {
    if (!cd || !cd.part) return '';
    var pr = progress(cd);
    var g = gaps(cd);
    var out = _s(cd.part).toUpperCase() + ': ' + pr.text;
    if (pr.missing.length) out += ' (未着手 ' + pr.missing.join('・') + ')';
    if (g.length) out += ' / 要直し ' + g.length + ' 図種: ' + g.map(function(r) { return r.label; }).join('・');
    else if (pr.done === TOTAL) out += ' / 先輩と一致';
    return out;
  }

  function done(cd) {
    var pr = progress(cd);
    return pr.done === TOTAL && gaps(cd).length === 0;
  }

  return {
    TOTAL: TOTAL,
    card: card,
    verdictOf: verdictOf,
    progress: progress,
    gaps: gaps,
    verdictLabel: verdictLabel,
    rowLine: rowLine,
    headline: headline,
    done: done,
  };
})();
