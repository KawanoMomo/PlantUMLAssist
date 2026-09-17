'use strict';
window.MA = window.MA || {};

// glossary — 社内略語 → 顧客向け正式名称の組 (画面は 🔤 表記統一パネルの略語欄)。
//
// BLK-primary-20260913-0206-wish: 顧客向けに資料化する場面では、図に散っている
// 社内略語 (SpiDrv / IRQCtrl / DmaCtrl …) を洗い出し、正式名称に置き換え、
// どこにも残っていないことを確かめる、の 3 工程を踏む。今までは
// 「⇄ 一括置換を略語ごとに 1 回ずつ」+「SVG を 1 枚ずつ目視」だったので、
// 手数が略語の数 × 図の枚数に比例していた。
//
// ここは対応表そのものを扱う:
//   1. 洗い出し  scan(docs)       — 図に出る識別子から略語らしいものを拾う
//   2. 正式名称  suggest(term)    — 既知の短縮語を展開した既定値を出す
//   3. 保証      remaining(...)   — 当てたあとに残っている略語を数える
// 置換そのものは bulkRename に任せる (識別子単位の照合規則を 2 つ持たない)。
window.MA.glossary = (function() {

  // 語尾に付く短縮語 → 正式形。車載 MCU ドライバの設計書で実際に出るものだけ。
  var SUFFIXES = [
    ['Drv', 'Driver'],
    ['Ctrl', 'Controller'],
    ['Cfg', 'Config'],
    ['Mgr', 'Manager'],
    ['Hdlr', 'Handler'],
    ['Hdl', 'Handler'],
    ['Hw', 'Hardware'],
    ['Sw', 'Software'],
    ['Req', 'Request'],
    ['Rsp', 'Response'],
    ['Buf', 'Buffer'],
    ['Cnt', 'Counter'],
    ['Err', 'Error'],
    ['Msg', 'Message'],
    ['Pkt', 'Packet'],
    ['Sts', 'Status'],
    ['Mem', 'Memory'],
    ['Reg', 'Register'],
  ];

  function _s(v) { return v == null ? '' : String(v); }

  // 全体が大文字の頭字語 (IRQ / DMA / SPI / PWM)。2〜6 文字。
  function _isAcronym(s) { return /^[A-Z][A-Z0-9]{1,5}$/.test(s); }

  // 略語か。語尾が既知の短縮語のもの、または全体が頭字語のもの。
  // 正式名称の側 (Spi_Driver) を再び略語と読まないよう、展開後の語は弾く。
  function isAbbrev(name) {
    return !!abbrevOf(name);
  }

  // 略語の内訳。略語でなければ null。
  //   SpiDrv   → { base: 'Spi',  suffix: 'Drv',  expanded: 'Driver' }
  //   IRQCtrl  → { base: 'IRQ',  suffix: 'Ctrl', expanded: 'Controller' }
  //   DMA      → { base: 'DMA',  suffix: '',     expanded: '' }  (頭字語だけ)
  function abbrevOf(name) {
    var n = _s(name);
    if (!n || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(n)) return null;
    for (var i = 0; i < SUFFIXES.length; i++) {
      var suf = SUFFIXES[i][0];
      // 語尾が短縮語で、その手前に本体がある (Drv だけの名前は拾わない)。
      // 既に `_Driver` の形になっているものは正式名称なので対象外。
      if (n.length > suf.length && n.slice(-suf.length) === suf) {
        var base = n.slice(0, n.length - suf.length);
        if (!base || /[_.\-]$/.test(base)) continue;
        return { name: n, base: base, suffix: suf, expanded: SUFFIXES[i][1] };
      }
    }
    if (_isAcronym(n)) return { name: n, base: n, suffix: '', expanded: '' };
    return null;
  }

  // 正式名称の既定値。既知の短縮語は「本体_正式形」に展開する
  // (SpiDrv → Spi_Driver。primary が手順 2 で実際に使っている綴り方)。
  // 頭字語だけの略語は、正しい言い換えを機械で決められないので空にする
  // (当てずっぽうの正式名称を入れると顧客向け資料に嘘が載る)。
  function suggest(term) {
    var a = abbrevOf(term);
    if (!a || !a.suffix) return '';
    return a.base + '_' + a.expanded;
  }

  // 図に出る略語を洗い出す。docs: [{ id, name, dsl }]
  // 返り値の行は出現の多い順 → 綴り順 (毎回同じ並びにする)。
  function scan(docs) {
    var BR = window.MA.bulkRename;
    var list = Array.isArray(docs) ? docs : [];
    if (!BR) return [];
    var rows = [];
    BR.identifiers(list).forEach(function(term) {
      if (!abbrevOf(term)) return;
      var count = 0, sheets = 0;
      list.forEach(function(d) {
        var n = BR.countIn(d && d.dsl, term);
        if (n > 0) { count += n; sheets++; }
      });
      if (count === 0) return;
      rows.push({ term: term, count: count, docs: sheets, suggestion: suggest(term) });
    });
    rows.sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.term < b.term ? -1 : (a.term > b.term ? 1 : 0);
    });
    return rows;
  }

  // 表の入力 (term → 正式名称) から、実際に当てる組だけを取り出す。
  // 空欄・元と同じ綴り・DSL を壊す綴りは当てない。
  function pairs(entries) {
    var BR = window.MA.bulkRename;
    var out = [];
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      var from = _s(e && e.term);
      var to = _s(e && e.to).replace(/^\s+|\s+$/g, '');
      if (!from || !to || from === to) return;
      if (BR && !BR.isValidTarget(to)) return;
      out.push({ from: from, to: to });
    });
    return out;
  }

  // 表のうち正式名称が空のまま残っている略語。確定しても消えない分。
  function unset(entries) {
    var out = [];
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      var to = _s(e && e.to).replace(/^\s+|\s+$/g, '');
      if (e && e.term && !to) out.push(_s(e.term));
    });
    return out;
  }

  // 当てたあとに図へ残っている略語。0 件であることが「顧客に出せる」の判定。
  // terms を渡すと表に挙げた略語だけを数える (表に無い語の残りは別の話)。
  function remaining(docs, terms) {
    var BR = window.MA.bulkRename;
    var list = Array.isArray(docs) ? docs : [];
    var out = [];
    if (!BR) return out;
    (Array.isArray(terms) ? terms : []).forEach(function(t) {
      var term = _s(t);
      if (!term) return;
      var count = 0, sheets = 0;
      list.forEach(function(d) {
        var n = BR.countIn(d && d.dsl, term);
        if (n > 0) { count += n; sheets++; }
      });
      if (count > 0) out.push({ term: term, count: count, docs: sheets });
    });
    return out;
  }

  // 表 1 枚の判定文。目視の代わりになる 1 行なので、
  // 「0 件」と「まだ表に入れていない」を混ぜない。
  function verdict(res) {
    var r = res || {};
    var left = r.remaining || [];
    var open = r.unset || [];
    if (left.length > 0) {
      var n = 0;
      left.forEach(function(x) { n += x.count; });
      var line = '残存略語 ' + n + ' 件 (' + left.map(function(x) { return x.term; }).join(', ') + ')';
      // 残っている理由が「正式名称を決めていないから」なら、そう名指しする
      // (表に戻って埋めれば済むのか、置換が効かなかったのかで次の手が違う)。
      if (open.length > 0) {
        line += '。うち正式名称が未設定の略語が ' + open.length + ' 件あります ('
          + open.join(', ') + ')';
      }
      return line;
    }
    if (open.length > 0) {
      return '残存略語 0 件。正式名称が未設定の略語が ' + open.length + ' 件あります ('
        + open.join(', ') + ')';
    }
    return '残存略語 0 件。顧客向けに出せます';
  }

  // ── 🔤 表記統一の登録簿へ寄せる (BLK-owner-20260917-2329-prune) ────────
  // 対応表は 📤 提出前チェックに別の表として持たず、登録簿 (_names.json) の組になる。
  // unregistered — 洗い出した略語のうち、登録簿がまだ揃える先を知らないもの。
  //   find: function(name) → 登録簿の該当 entry か null (name-registry.find を渡す)
  function unregistered(rows, find) {
    return (Array.isArray(rows) ? rows : []).filter(function(r) {
      return !(r && typeof find === 'function' && find(r.term));
    });
  }

  // toEntries — pairs() の組を登録簿の entry の形にする (略語は寄せる綴り)。
  function toEntries(prs, opts) {
    var o = opts || {};
    return (Array.isArray(prs) ? prs : []).map(function(p) {
      return { canonical: p.to, variants: [p.from], note: o.note || '社内略語', by: o.by || '', at: o.at || '' };
    });
  }

  // applyPairs — 1 本の DSL に組を全部当てる。置換規則は bulkRename と同じ。
  function applyPairs(dsl, prs) {
    var br = window.MA && window.MA.bulkRename;
    var text = _s(dsl);
    var count = 0;
    if (!br) return { dsl: text, count: 0 };
    (Array.isArray(prs) ? prs : []).forEach(function(p) {
      var c = br.countIn(text, p.from);
      if (!c) return;
      count += c;
      text = br.replaceIn(text, p.from, p.to);
    });
    return { dsl: text, count: count };
  }

  return {
    unregistered: unregistered,
    toEntries: toEntries,
    applyPairs: applyPairs,
    SUFFIXES: SUFFIXES,
    isAbbrev: isAbbrev,
    abbrevOf: abbrevOf,
    suggest: suggest,
    scan: scan,
    pairs: pairs,
    unset: unset,
    remaining: remaining,
    verdict: verdict,
  };
})();
