'use strict';

// name-registry — 図をまたいで共有する「正式表記の登録簿」。
//
// BLK-reviewer-20260915-0506-wish: 表記揺れ (IRQCtrl ⇔ Irq_Ctrl) は nameAudit が
// 機械で見つけられるようになったが、「揃える先」は出現数から毎回推定し直すだけで
// どこにも残らない。そのため reviewer は毎 tick 同じ組を見つけ直し、指摘.md に
// 揃える先を書き、junior/primary が次の run で読む、という最短 2 tick の伝言を
// 続けていた。推定を毎回やり直すかぎり、この往復は減らない。
//
// ここは「揃える先」を 1 度だけ人が決めて置いておく場所。
//   - 決めた綴り (canonical) と、それに寄せる綴り (variants) の組を持つ
//   - 引くのは正規化キー (大小・区切り記号を無視。nameAudit と同じ規則) なので、
//     登録した綴り以外の書き方で打たれても同じ組に当たる
//   - 登録簿に載っていない名前には何も言わない (新語を邪魔しない。揃える先を
//     知らないものについて黙るのは、推定で嘘を言わないため)
//
// glossary.js は社内略語 → 顧客向け正式名称の展開表で、納品時に別目的で使う。
// こちらはペルソナ間で綴りを揃えるためのもので、目的も寿命も別。
//
// 保管は保存フォルダの親 (= persona-data) 直下の `_names.json` 1 個。
// junior / primary / reviewer はそれぞれ別のフォルダに保存するので、
// 3 人が同じ 1 冊を見る場所は親しかない。DOM も fs も触らない。
(function() {

  // 登録簿のファイル名。server.py と tools/audit.js が同じ名前を使う。
  var FILENAME = '_names.json';

  function _s(v) { return v == null ? '' : String(v); }

  // 比較キー。nameAudit.normalizeKey と同じ規則 (2 つの規則を持たない)。
  function normalize(name) {
    return _s(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function empty() { return { entries: [] }; }

  function _entry(raw) {
    var canonical = _s(raw && raw.canonical).trim();
    if (!canonical) return null;
    var key = normalize(canonical);
    if (!key) return null;
    var seen = {};
    var variants = [];
    (Array.isArray(raw.variants) ? raw.variants : []).forEach(function(v) {
      var n = _s(v).trim();
      // 揃える先そのものは「寄せる綴り」ではない。重複も 1 度だけ。
      if (!n || n === canonical || seen[n]) return;
      seen[n] = true;
      variants.push(n);
    });
    variants.sort();
    return {
      key: key,
      canonical: canonical,
      variants: variants,
      note: _s(raw.note).trim(),
      by: _s(raw.by).trim(),
      at: _s(raw.at).trim(),
    };
  }

  // 並びは canonical の昇順で固定する。登録の順で並べると、同じ内容の登録簿が
  // run ごとに違う差分に見えて「変わった」と読まれる。
  function _sorted(entries) {
    return entries.slice().sort(function(a, b) {
      return a.canonical < b.canonical ? -1 : (a.canonical > b.canonical ? 1 : 0);
    });
  }

  // parse — JSON 文字列でも、読み込み済みのオブジェクトでも受ける。
  // 壊れていれば空の登録簿 (「登録簿が無い」と同じ扱い)。登録簿が読めないことで
  // GUI が止まると、名前を打つ手順そのものが止まる。
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
      // 同じキーが 2 度書かれていたら後勝ちで 1 件にする (2 つの正が並ばない)。
      if (byKey[e.key]) {
        var prev = byKey[e.key];
        // 先に書かれていた揃える先は、後勝ちで「寄せる綴り」に降りる。
        prev.variants = prev.variants.concat([prev.canonical]);
        prev.canonical = e.canonical;
        prev.note = e.note || prev.note;
        prev.by = e.by || prev.by;
        prev.at = e.at || prev.at;
        prev.variants = _mergeVariants(prev.variants, e.variants, e.canonical);
        return;
      }
      byKey[e.key] = e;
      out.push(e);
    });
    return { entries: _sorted(out) };
  }

  function _mergeVariants(a, b, canonical) {
    var seen = {};
    var out = [];
    a.concat(b).forEach(function(n) {
      if (!n || n === canonical || seen[n]) return;
      seen[n] = true;
      out.push(n);
    });
    out.sort();
    return out;
  }

  // format — 保存する形。読む人が直せるように整形して出す。
  function format(reg) {
    var r = reg && reg.entries ? reg : parse(reg);
    return JSON.stringify({ entries: _sorted(r.entries) }, null, 2) + '\n';
  }

  // ── 引く ─────────────────────────────────────────────────────────────
  function find(reg, name) {
    var k = normalize(name);
    if (!k) return null;
    var entries = (reg && reg.entries) || [];
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].key === k) return entries[i];
    }
    return null;
  }

  // lookup — 打たれた綴りがどう扱われるか。
  //   ok      … 登録簿の正式表記そのもの
  //   variant … 同じ組だが綴りが違う (揃える先がある)
  //   unknown … 登録簿に無い (何も言わない)
  function lookup(reg, name) {
    var n = _s(name).trim();
    var e = find(reg, n);
    if (!e) return { status: 'unknown', name: n, canonical: '', entry: null };
    return {
      status: e.canonical === n ? 'ok' : 'variant',
      name: n,
      canonical: e.canonical,
      entry: e,
    };
  }

  // checkName — 入力欄の下に出す 1 行。揃える先があるときだけ言う。
  function checkName(reg, name) {
    var r = lookup(reg, name);
    if (r.status !== 'variant') return '';
    var who = r.entry.by ? ' / 登録: ' + r.entry.by : '';
    var note = r.entry.note ? ' — ' + r.entry.note : '';
    return '登録簿の正式表記は ' + r.canonical + ' です (' + r.name + ' は揺れ' + who + ')' + note;
  }

  // suggest — 前方一致の候補。入力中の欄に正式表記を出すためのもの。
  // 打ちかけの綴り (`irqc`) は正規化キーの前方一致でも当てる — 区切り記号を
  // 打つ前でも候補が出ないと、揺れた綴りを打ち切ってから直すことになる。
  function suggest(reg, prefix, limit) {
    var p = _s(prefix).trim();
    var lp = p.toLowerCase();
    var kp = normalize(p);
    var out = [];
    ((reg && reg.entries) || []).forEach(function(e) {
      if (p && e.canonical.toLowerCase().indexOf(lp) !== 0
          && (!kp || e.key.indexOf(kp) !== 0)) return;
      out.push(e);
    });
    var n = limit | 0;
    return n > 0 ? out.slice(0, n) : out;
  }

  // ── 書く ─────────────────────────────────────────────────────────────
  // register — 1 件を登録 (同じキーがあれば揃える先を差し替え、綴りは足す)。
  // 元の登録簿は書き換えない (呼び手が「変わったか」を比べられるように)。
  function register(reg, canonical, variants, opts) {
    var o = opts || {};
    var e = _entry({
      canonical: canonical, variants: variants,
      note: o.note, by: o.by, at: o.at,
    });
    if (!e) return { registry: parse(reg), entry: null, changed: false };
    var base = parse(reg);
    var out = [];
    var replaced = false;
    base.entries.forEach(function(x) {
      if (x.key !== e.key) { out.push(x); return; }
      replaced = true;
      out.push({
        key: e.key,
        canonical: e.canonical,
        // 以前の揃える先が新しい綴りに変わったなら、古い方は「寄せる綴り」に降りる。
        variants: _mergeVariants(x.variants.concat([x.canonical]), e.variants, e.canonical),
        note: e.note || x.note,
        by: e.by || x.by,
        at: e.at || x.at,
      });
    });
    if (!replaced) out.push(e);
    var next = { entries: _sorted(out) };
    return {
      registry: next,
      entry: find(next, e.canonical),
      changed: format(base) !== format(next),
    };
  }

  function remove(reg, name) {
    var base = parse(reg);
    var k = normalize(name);
    return {
      entries: base.entries.filter(function(e) { return e.key !== k; }),
    };
  }

  // ── 表記揺れとの突き合わせ ───────────────────────────────────────────
  // pending — nameAudit.variants() が出した組のうち、登録簿がまだ何も言えないもの。
  // reviewer が「揃える先を 1 回決める」対象はこれだけで、残りは登録済みなので
  // junior/primary 側で自動的に揃う。
  function pending(reg, groups) {
    var base = parse(reg);
    return (Array.isArray(groups) ? groups : []).filter(function(g) {
      return !find(base, (g && g.suggested) || (g && g.key) || '');
    });
  }

  // covered — 登録簿が既に揃える先を持っている組。
  function covered(reg, groups) {
    var base = parse(reg);
    return (Array.isArray(groups) ? groups : []).filter(function(g) {
      return !!find(base, (g && g.suggested) || (g && g.key) || '');
    });
  }

  // fromVariants — 組をそのまま登録簿の形にした提案。揃える先は nameAudit の
  // 推定 (多数派) をそのまま使う。決めるのは人で、ここは打ち直しを省くだけ。
  function fromVariants(groups, opts) {
    var o = opts || {};
    return (Array.isArray(groups) ? groups : []).map(function(g) {
      var members = (g && g.members) || [];
      return _entry({
        canonical: (g && g.suggested) || (members[0] && members[0].name) || '',
        variants: members.map(function(m) { return m.name; }),
        note: o.note, by: o.by, at: o.at,
      });
    }).filter(function(e) { return !!e; });
  }

  // registerAll — 提案 (または組) をまとめて登録する。
  function registerAll(reg, entries, opts) {
    var list = (Array.isArray(entries) ? entries : []).map(function(x) {
      return (x && x.members) ? fromVariants([x], opts)[0] : _entry(x);
    }).filter(function(e) { return !!e; });
    var cur = parse(reg);
    var added = 0;
    list.forEach(function(e) {
      var r = register(cur, e.canonical, e.variants, {
        note: e.note || (opts && opts.note), by: e.by || (opts && opts.by),
        at: e.at || (opts && opts.at),
      });
      if (r.changed) added++;
      cur = r.registry;
    });
    return { registry: cur, added: added };
  }

  // ── 読ませる ─────────────────────────────────────────────────────────
  function entryLine(e) {
    var line = e.canonical;
    if (e.variants.length) line += ' ← ' + e.variants.join('・');
    var tail = [];
    if (e.by) tail.push('登録: ' + e.by);
    if (e.at) tail.push(e.at);
    if (e.note) tail.push(e.note);
    if (tail.length) line += '  (' + tail.join(' / ') + ')';
    return line;
  }

  function lines(reg) {
    return parse(reg).entries.map(entryLine);
  }

  function summary(reg) {
    var n = parse(reg).entries.length;
    return n ? '正式表記の登録簿: ' + n + ' 語' : '正式表記の登録簿: 未登録';
  }

  // ── 現在の 1 冊 ───────────────────────────────────────────────────────
  // 図種ごとのパネルは server を知らないので、app.js が読んだものをここに預ける
  // (partVocab.setCurrent と同じ約束)。
  var _current = empty();
  function setCurrent(reg) { _current = reg ? parse(reg) : empty(); }
  function current() { return _current; }

  var api = {
    FILENAME: FILENAME,
    normalize: normalize,
    empty: empty,
    parse: parse,
    format: format,
    find: find,
    lookup: lookup,
    checkName: checkName,
    suggest: suggest,
    register: register,
    registerAll: registerAll,
    remove: remove,
    pending: pending,
    covered: covered,
    fromVariants: fromVariants,
    entryLine: entryLine,
    lines: lines,
    summary: summary,
    setCurrent: setCurrent,
    current: current,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.nameRegistry = api;
  }
})();
