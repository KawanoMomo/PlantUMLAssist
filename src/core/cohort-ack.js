'use strict';
window.MA = window.MA || {};

// cohort-ack — ドメイン突合で「この組は内部揺れで、実害としては衝突していない」と
// reviewer が一度確かめた組を、確定として覚えておく台帳。
//
// BLK-reviewer-20260917-0423-wish: junior×primary の突合 (spi/timer の 4 組) は毎 tick
// 同じ「部品名/ラベルが違うだけ」の差分を出し続け、reviewer はそのたびに同じ diff を
// 最初から読み直して同じ結論を出していた。domain-verdict の宣言は図の中に書く印なので、
// 自分のフォルダの図にしか書けない (相手の図には触らない)。reviewer は junior の図も
// primary の図も持たないので、junior×primary の組についてはどちらにも印を書けず、
// 「確認した」という事実の置き場が無い。
//
// ここは図の外に置く台帳。domain-verdict が「図の持ち主が自分の図に書く宣言」なのに対し、
// こちらは「第三者 (reviewer) が組について確かめた記録」で、書く先も寿命も別。
//
// 覚えるのは組の identity だけではなく、そのとき見た差分の指紋も一緒に持つ。
// 指紋が変われば「確認済み」は自動的に外れる (確認済みの印が、後から入った新しい
// 食い違いを隠してはならない)。
//
// 保管は name-registry と同じく保存フォルダの親 (= persona-data) 直下の
// `_cohort-ack.json` 1 個。DOM も fetch も触らない。
window.MA.cohortAck = (function() {

  var FILENAME = '_cohort-ack.json';

  function _s(v) { return v == null ? '' : String(v); }

  function _norm(v) { return _s(v).trim().toLowerCase(); }

  // ── 組の識別 ────────────────────────────────────────────────────────
  // 台帳は「どのドメインの、どの図種の、どの 2 枚か」で引く。左右を入れ替えても
  // 同じ組として当たるように、ファイル名を並べ替えてから鍵にする
  // (突合の並びは entries の並び順で決まるので、run ごとに左右が入れ替わりうる)。
  function pairKey(row) {
    if (!row) return '';
    var a = _norm(row.leftName), b = _norm(row.rightName);
    if (!a || !b) return '';
    var pair = a < b ? [a, b] : [b, a];
    return [_norm(row.domain), _norm(row.kind), pair[0], pair[1]].join('|');
  }

  // ── 差分の指紋 ──────────────────────────────────────────────────────
  // 「そのとき見た差分」を 1 本の文字列にする。片側にしか無い部品名・ラベルが
  // 指紋の中身。両方にある名前 (綴り違いを含む) も入れる — Gpio/Gpio_Driver の
  // 綴りが片方だけ変わったら、それは新しい差分なので確認をやり直す。
  function _side(d) {
    var x = d || {};
    function list(a) {
      return (Array.isArray(a) ? a : []).map(_norm).sort().join(',');
    }
    return [list(x.both), list(x.onlyA), list(x.onlyB)].join(';');
  }

  function fingerprint(row) {
    if (!row) return '';
    // 左右どちらが A かは並び順で変わるので、onlyA/onlyB も並べ替えた組にする。
    var names = row.names || {}, labels = row.labels || {};
    function sym(d) {
      var o = d || {};
      var a = (Array.isArray(o.onlyA) ? o.onlyA : []).map(_norm).sort().join(',');
      var b = (Array.isArray(o.onlyB) ? o.onlyB : []).map(_norm).sort().join(',');
      var pair = a < b ? [a, b] : [b, a];
      return _side({ both: o.both }) + '#' + pair[0] + '#' + pair[1];
    }
    return sym(names) + '||' + sym(labels);
  }

  // ── 台帳 ────────────────────────────────────────────────────────────
  function empty() { return { entries: [] }; }

  function _entry(raw) {
    var key = _s(raw && raw.key).trim();
    if (!key) return null;
    return {
      key: key,
      domain: _s(raw.domain),
      kind: _s(raw.kind),
      left: _s(raw.left),
      right: _s(raw.right),
      fingerprint: _s(raw.fingerprint),
      note: _s(raw.note).trim(),
      by: _s(raw.by).trim(),
      at: _s(raw.at).trim(),
    };
  }

  function _sorted(entries) {
    return entries.slice().sort(function(a, b) {
      return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
    });
  }

  // 壊れていれば空の台帳 (= 一度も確認していないのと同じ扱い)。台帳が読めないことで
  // 突合の画面が止まると、確認そのものができなくなる。
  function parse(input) {
    var data = input;
    if (typeof input === 'string') {
      var t = input.replace(/^﻿/, '').trim();
      if (!t) return empty();
      try { data = JSON.parse(t); } catch (e) { return empty(); }
    }
    if (!data || typeof data !== 'object') return empty();
    var list = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : []);
    var byKey = {};
    var out = [];
    list.forEach(function(raw) {
      var e = _entry(raw);
      if (!e) return;
      // 同じ組が 2 度書かれていたら後勝ち (2 つの確認済みが並ばない)。
      if (byKey[e.key]) {
        var i = out.indexOf(byKey[e.key]);
        out[i] = e;
        byKey[e.key] = e;
        return;
      }
      byKey[e.key] = e;
      out.push(e);
    });
    return { entries: _sorted(out) };
  }

  function format(ledger) {
    var l = ledger && ledger.entries ? ledger : parse(ledger);
    return JSON.stringify({ entries: _sorted(l.entries) }, null, 2) + '\n';
  }

  function find(ledger, row) {
    var k = typeof row === 'string' ? row : pairKey(row);
    if (!k) return null;
    var entries = (ledger && ledger.entries) || [];
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].key === k) return entries[i];
    }
    return null;
  }

  // ── 引く ────────────────────────────────────────────────────────────
  //   new     … 台帳に無い (これから見る組)
  //   acked   … 確認済みで、差分も当時のまま (見なくてよい)
  //   changed … 確認済みだが差分が変わった (もう一度見る組)
  function statusOf(ledger, row) {
    var e = find(ledger, row);
    if (!e) return { status: 'new', entry: null, text: '' };
    var fp = fingerprint(row);
    if (e.fingerprint && fp && e.fingerprint !== fp) {
      return { status: 'changed', entry: e, text: statusText('changed', e) };
    }
    return { status: 'acked', entry: e, text: statusText('acked', e) };
  }

  function statusText(status, entry) {
    var e = entry || {};
    var tail = [];
    if (e.by) tail.push(e.by);
    if (e.at) tail.push(e.at);
    var who = tail.length ? ' (' + tail.join(' / ') + ')' : '';
    var note = e.note ? ' — ' + e.note : '';
    if (status === 'acked') return '確認済み: 内部揺れ・非衝突' + who + note;
    if (status === 'changed') return '確認後に差分が変わりました。もう一度見てください' + who + note;
    return '';
  }

  // ── 書く ────────────────────────────────────────────────────────────
  // ack — 組 1 つを「内部揺れとして確認済み」にする。元の台帳は書き換えない。
  function ack(ledger, row, opts) {
    var o = opts || {};
    var key = pairKey(row);
    var base = parse(ledger);
    if (!key) return { ledger: base, entry: null, changed: false };
    var e = _entry({
      key: key,
      domain: _s(row.domain),
      kind: _s(row.kind),
      left: _s(row.leftName),
      right: _s(row.rightName),
      fingerprint: fingerprint(row),
      note: o.note, by: o.by, at: o.at,
    });
    var out = [];
    var replaced = false;
    base.entries.forEach(function(x) {
      if (x.key !== key) { out.push(x); return; }
      replaced = true;
      out.push(e);
    });
    if (!replaced) out.push(e);
    var next = { entries: _sorted(out) };
    return { ledger: next, entry: e, changed: format(base) !== format(next) };
  }

  // 何組かをまとめて確認済みにする (同じ画面で見た組を 1 回で片付ける)。
  function ackAll(ledger, rows, opts) {
    var cur = parse(ledger);
    var added = 0;
    (Array.isArray(rows) ? rows : []).forEach(function(r) {
      var res = ack(cur, r, opts);
      if (res.changed) added++;
      cur = res.ledger;
    });
    return { ledger: cur, added: added };
  }

  // 確認を取り消す (「やっぱり見直す」)。
  function unack(ledger, row) {
    var k = typeof row === 'string' ? row : pairKey(row);
    var base = parse(ledger);
    return {
      entries: base.entries.filter(function(e) { return e.key !== k; }),
    };
  }

  // ── 突合の行に重ねる ────────────────────────────────────────────────
  // domain-cohort.diffRows() の行に確認済みの状態を足す。突合の規則は変えない
  // (台帳は突合の外側の層で、名前やラベルの判定には一切触らない)。
  function annotate(rows, ledger) {
    var l = parse(ledger);
    return (Array.isArray(rows) ? rows : []).map(function(r) {
      var st = statusOf(l, r);
      r.ack = st.status;
      r.ackText = st.text;
      r.ackEntry = st.entry;
      return r;
    });
  }

  // これから見るべき行だけ。確認済みで差分も当時のままの組は落とす。
  function pending(rows, ledger) {
    var l = parse(ledger);
    return (Array.isArray(rows) ? rows : []).filter(function(r) {
      return statusOf(l, r).status !== 'acked';
    });
  }

  // 落とした行 (確認済み)。件数を黙って減らすと「差分が消えた」と読めてしまう。
  function settled(rows, ledger) {
    var l = parse(ledger);
    return (Array.isArray(rows) ? rows : []).filter(function(r) {
      return statusOf(l, r).status === 'acked';
    });
  }

  // ── 読ませる ────────────────────────────────────────────────────────
  function entryLine(e) {
    var line = e.domain + ' ' + (e.kind || '?') + ' ' + e.left + ' × ' + e.right;
    var tail = [];
    if (e.by) tail.push('確認: ' + e.by);
    if (e.at) tail.push(e.at);
    if (e.note) tail.push(e.note);
    return tail.length ? line + '  (' + tail.join(' / ') + ')' : line;
  }

  function lines(ledger) {
    return parse(ledger).entries.map(entryLine);
  }

  // 突合の尾に付ける 1 行。確認済みで外した数と、確認後に差分が変わった数を必ず言う。
  function summaryLine(rows, ledger) {
    var l = parse(ledger);
    var list = Array.isArray(rows) ? rows : [];
    var done = 0, changed = 0, fresh = 0;
    list.forEach(function(r) {
      var s = statusOf(l, r).status;
      if (s === 'acked') done++;
      else if (s === 'changed') changed++;
      else fresh++;
    });
    if (!l.entries.length) return '確認済み台帳: まだ 1 組も確認していません';
    var parts = ['確認済み台帳: ' + l.entries.length + ' 組'];
    if (done) parts.push('今回の突合から ' + done + ' 組を除外');
    if (changed) parts.push('確認後に差分が変わった ' + changed + ' 組');
    parts.push('未確認 ' + fresh + ' 組');
    return parts.join(' / ');
  }

  // ── 現在の 1 冊 ─────────────────────────────────────────────────────
  // server を知らない画面のために、app.js が読んだものをここに預ける
  // (nameRegistry.setCurrent と同じ約束)。
  var _current = empty();
  function setCurrent(l) { _current = l ? parse(l) : empty(); }
  function current() { return _current; }

  return {
    FILENAME: FILENAME,
    pairKey: pairKey,
    fingerprint: fingerprint,
    empty: empty,
    parse: parse,
    format: format,
    find: find,
    statusOf: statusOf,
    statusText: statusText,
    ack: ack,
    ackAll: ackAll,
    unack: unack,
    annotate: annotate,
    pending: pending,
    settled: settled,
    entryLine: entryLine,
    lines: lines,
    summaryLine: summaryLine,
    setCurrent: setCurrent,
    current: current,
  };
})();
