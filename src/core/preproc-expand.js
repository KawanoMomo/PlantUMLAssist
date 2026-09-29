'use strict';
window.MA = window.MA || {};

// preproc-expand — 当てる前の本文を PlantUML 自身のプリプロセッサに展開させ、全図種のパーサに展開後の行を読ませる。
//
// BLK-migrator-20260929-1351: マクロ (!procedure / !definelong / 引数つき !define / !include した手続き / 変数・%関数)
// が描く要素に選択枠が出なかった。マクロの種類ごとに DSL の読み方を足すのをやめ、同梱 jar の
// プリプロセッサ (server の POST /preproc。ローカルで完結し外へ送らない) が返す行を読む。
//
// 行の対応: 展開の前に、元の行の 1 行ごとに目印の行 `§pua7f3§{行番号}§` を差し込んで送る。
// プリプロセッサは目印をそのまま通すので、展開後の各行は直前の目印の行 (= 元の行) から生まれたと分かる。
// マクロを呼んだ行 (`RETRY(B)`) が生んだ行はその行番号になる。
//
// 読み方: 元の本文のうち「呼び出しの行」(! で始まらず、展開の結果が元の行と違う行) だけを展開後の行に
// 差し替えた本文 (spliced) をパーサに読ませ、結果の行番号を元の行に戻す。それ以外の行 (条件の描かれない枝・
// コメント・手続きの本体) は元のまま残るので、今までの読み方 (preproc-live の描かれない枝など) はそのまま効く。
// 展開できない (jar が無い・遅い・プリプロセッサのエラー) 図は今までどおり元の本文を読む。
window.MA.preprocExpand = (function() {
  var MARK = '§pua7f3§';
  var MARK_RE = /^§pua7f3§(\d+)§$/;
  var BODY_OPEN_RE = /^!(?:unquoted\s+)?(?:procedure|function|definelong)\b/i;
  var BODY_END_RE = /^!end(?:procedure|function|definelong)\b/i;
  // `!function $f($a) !return $a + 1` は 1 行で閉じる (本体の行を持たない)
  function _opensBody(t) { return BODY_OPEN_RE.test(t) && !/!return\b/i.test(t); }
  // 同じものを 2 度たどらない (参加者は participantMap と elements の両方から指される)
  function _seenSet() {
    if (typeof Set === 'function') { var st = new Set(); return { has: function(o) { return st.has(o); }, add: function(o) { st.add(o); } }; }
    var arr = [];
    return { has: function(o) { return arr.indexOf(o) >= 0; }, add: function(o) { arr.push(o); } };
  }
  // 展開を頼む価値がある本文: 行を生む・書き換えるプリプロセッサがある。
  // 条件 (!if / !ifdef) だけの図は preproc-live が本文の上で解くので頼まない。
  var NEED_LINE_RE = /^!(?:include\w*|import|procedure|function|unquoted|define\w*|foreach|while|local|global|\$)/i;
  var FN_RE = /%[A-Za-z_][A-Za-z0-9_]*\s*\(/;
  var JSON_OPEN_RE = /^!(?:(?:local|global)\s+)?\$[A-Za-z_][A-Za-z0-9_]*\s*\??=\s*[\[{]/i;
  var CACHE_MAX = 8;
  var TIMEOUT_MS = 5000;

  var _cache = {};      // 元の本文 → { mapped: [{text,line}] } | { failed: true }
  var _order = [];
  var _spliced = {};    // 元の本文 → 最後に読んだ差し替え後の本文
  var _pending = {};

  function _lines(text) { return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n'); }
  function _isComment(t) { return /^'/.test(t); }

  function needs(text) {
    var lines = _lines(text);
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || _isComment(t)) continue;
      if (NEED_LINE_RE.test(t)) return true;
      if (t.charAt(0) !== '!' && FN_RE.test(t)) return true;
    }
    return false;
  }

  // 元の行ごとに目印を差し込んだ本文。手続きの本体・行継ぎ (`\` で終わる行) の次・複数行の値の中には差し込まない
  // (本体に入れると呼ぶたびに目印が増え、継ぎ目や値の中に入れると元の意味が変わる)。
  function withMarks(text) {
    var lines = _lines(text);
    var out = [];
    var inBody = false, jsonDepth = 0;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var t = raw.trim();
      var prev = i > 0 ? lines[i - 1] : '';
      var mark = !inBody && jsonDepth === 0 && !/\\\s*$/.test(prev);
      if (mark) out.push(MARK + (i + 1) + '§');
      out.push(raw);
      if (inBody) { if (BODY_END_RE.test(t)) inBody = false; continue; }
      if (jsonDepth > 0) { jsonDepth += _depth(t); if (jsonDepth < 0) jsonDepth = 0; continue; }
      if (_opensBody(t)) { inBody = true; continue; }
      if (JSON_OPEN_RE.test(t)) { jsonDepth = _depth(t); if (jsonDepth < 0) jsonDepth = 0; }
    }
    return out.join('\n');
  }
  function _depth(t) {
    var d = 0, q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === '"') q = !q;
      else if (!q && (c === '{' || c === '[')) d++;
      else if (!q && (c === '}' || c === ']')) d--;
    }
    return d;
  }

  // 展開後の行 (目印つき) → [{ text, line }]。line は生んだ元の行 (1 始まり)。目印より前の行 (@startuml) は 0。
  function mapBack(outLines) {
    var cur = 0, res = [];
    (outLines || []).forEach(function(l) {
      var m = String(l).trim().match(MARK_RE);
      if (m) { cur = +m[1]; return; }
      res.push({ text: String(l), line: cur });
    });
    return res;
  }

  function _norm(s) { return String(s).trim().replace(/\s+/g, ' '); }

  // 元の行 L が「呼び出しの行」(展開で中身が変わった行) なら、その展開後の行を返す。変わらない行は null。
  function _callLines(text, mapped) {
    var lines = _lines(text);
    var by = {};
    mapped.forEach(function(m) { if (m.line > 0) (by[m.line] = by[m.line] || []).push(m.text); });
    var res = {};
    var inBody = false;
    for (var i = 0; i < lines.length; i++) {
      var L = i + 1, t = lines[i].trim();
      if (inBody) { if (BODY_END_RE.test(t)) inBody = false; continue; }
      if (_opensBody(t)) { inBody = true; continue; }
      if (!t || t.charAt(0) === '!' || _isComment(t) || /^@(start|end)/i.test(t)) continue;
      var outs = (by[L] || []).filter(function(x) { return x.trim() !== ''; });
      if (!outs.length) continue;   // 何も生まない行 (描かれない枝・コメント) は元のまま読む
      if (outs.length === 1 && _norm(outs[0]) === _norm(t)) continue;
      res[L] = outs;
    }
    return res;
  }

  // 元の本文と、差し替えた行 ({L: [展開後の行]}) から { text, map, expanded }。map[s] = 差し替え後の s 行目の元の行。
  function splice(text, calls) {
    var lines = _lines(text);
    var out = [], map = [0], expanded = {};
    for (var i = 0; i < lines.length; i++) {
      var L = i + 1;
      if (calls[L]) {
        calls[L].forEach(function(x) { out.push(x); map.push(L); expanded[out.length] = true; });
      } else {
        out.push(lines[i]); map.push(L);
      }
    }
    return { text: out.join('\n'), map: map, expanded: expanded, origCount: lines.length };
  }

  // パース結果の行番号 (line / 〜Line / deadLines のキー / createLines の値 / lineIdx) を元の行に戻す。
  function remap(result, sp) {
    var n = sp.map.length - 1;
    function back(s) {
      if (typeof s !== 'number' || s !== Math.floor(s) || s <= 0) return s;
      if (s <= n) return sp.map[s];
      return s - n + sp.origCount;
    }
    var seen = _seenSet();
    function walk(o) {
      if (!o || typeof o !== 'object' || seen.has(o)) return;
      if (o.nodeType) return;
      seen.add(o);
      Object.keys(o).forEach(function(k) {
        var v = o[k];
        if (typeof v === 'number') {
          if (k === 'line' || /[a-z]Line$/.test(k)) {
            if (k === 'line' && sp.expanded[v]) o.expanded = true;
            o[k] = back(v);
          } else if (k === 'lineIdx') {
            o[k] = back(v + 1) - 1;
          }
          return;
        }
        if (k === 'deadLines' && v && typeof v === 'object' && !Array.isArray(v)) {
          var nd = {};
          Object.keys(v).forEach(function(key) { nd[back(+key)] = v[key]; });
          o[k] = nd;
          return;
        }
        if (k === 'createLines' && v && typeof v === 'object') {
          Object.keys(v).forEach(function(name) {
            if (Array.isArray(v[name])) v[name] = v[name].map(back);
          });
          return;
        }
        if (v && typeof v === 'object') walk(v);
      });
    }
    walk(result);
    return result;
  }

  // 元のパース結果で要素・関係が載っている行
  function _claimed(result) {
    var out = {}, seen = _seenSet();
    function walk(o) {
      if (!o || typeof o !== 'object' || seen.has(o) || o.nodeType) return;
      seen.add(o);
      if (typeof o.line === 'number' && o.kind) out[o.line] = true;
      Object.keys(o).forEach(function(k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); });
    }
    walk(result);
    return out;
  }

  // 行ごとの「何が描かれるか」: 要素は id、関係は From>To。パーサが振る通し番号の id (`__m_3` など) は数だけ見る
  // (前の行の展開で番号がずれても同じ要素と見る)。
  function _identities(result) {
    var out = {}, seen = _seenSet();
    function walk(o) {
      if (!o || typeof o !== 'object' || seen.has(o) || o.nodeType) return;
      seen.add(o);
      if (typeof o.line === 'number' && o.kind) {
        var k = o.from != null || o.to != null ? String(o.from) + '>' + String(o.to)
          : (o.id != null && !/^__/.test(String(o.id)) ? 'id:' + o.id : '#');
        (out[o.line] = out[o.line] || []).push(o.kind + '|' + k);
      }
      Object.keys(o).forEach(function(k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); });
    }
    walk(result);
    return out;
  }

  // 展開後の読みが、元の読みと同じ種類の要素を別の顔ぶれで描くか。元に無い種類 (C4 の Container_Boundary が
  // 展開で `box` になる等) と、パーサが展開後の書き方を読めずに何も出さない行は比べない (元の読みを残す)。
  function _drawsOther(baseIds, fullIds) {
    if (!baseIds || !fullIds) return false;
    var kinds = {};
    baseIds.forEach(function(k) { kinds[k.split('|')[0]] = true; });
    var same = fullIds.filter(function(k) { return kinds[k.split('|')[0]]; });
    if (!same.length) return false;
    return same.slice().sort().join('\n') !== baseIds.slice().sort().join('\n');
  }

  // parseFn(text) の展開版。展開が手元に無ければ parseFn(text) そのもの。
  // 元の読み方が既に要素を読んでいる行 (C4 の Container(...) を形で読む、`participant "$sys 画面" as A` 等) は、
  // 展開しても同じ要素 (同じ id・同じ From>To・同じ数) になるなら元のまま残す。右パネルの名前は本文の書き方のまま出し、
  // 描いた側の飾り (`==` や <size>) で当て方を崩さない。
  // 展開で別の要素になる行 (`!while` の中の `participant "サービス$i" as S$i` が S1・S2・S3 を描く) は、
  // 元の読み方が何かを読んでいても展開後の行を読む (元の `S$i` は図のどこにも描かれない)。
  // 元の読み方では何も読めなかった呼び出しの行 (RETRY(B) など) は展開後の行を読む。
  function parseWith(parseFn, text) {
    var base = parseFn(text);
    var c = _cache[text];
    if (!c || !c.mapped) return base;
    var calls = _callLines(text, c.mapped);
    var keys = Object.keys(calls);
    if (!keys.length) { _spliced[text] = text; return base; }
    var claimed = _claimed(base);
    var claimedKeys = keys.filter(function(L) { return claimed[L]; });
    var full = null;
    if (claimedKeys.length) {
      // 全部の呼び出しを差し替えて読み、元の読み方と同じ要素になる行だけ元に戻す
      var spAll = splice(text, calls);
      try { full = remap(parseFn(spAll.text), spAll); } catch (e) { full = null; }
      var idsBase = _identities(base), idsFull = full ? _identities(full) : {};
      claimedKeys.forEach(function(L) {
        if (!full || !_drawsOther(idsBase[L], idsFull[L])) delete calls[L];
      });
      if (full && Object.keys(calls).length === keys.length) {
        _spliced[text] = spAll.text;
        if (full.meta) full.meta.expanded = true;
        return full;
      }
    }
    if (!Object.keys(calls).length) { _spliced[text] = text; return base; }
    var sp = splice(text, calls);
    var res;
    try { res = parseFn(sp.text); } catch (e) { return base; }
    _spliced[text] = sp.text;
    remap(res, sp);
    if (res && res.meta) res.meta.expanded = true;
    return res;
  }

  function _remember(text, entry) {
    if (!_cache[text]) _order.push(text);
    _cache[text] = entry;
    while (_order.length > CACHE_MAX) {
      var old = _order.shift();
      delete _cache[old];
      delete _spliced[old];
    }
  }

  function has(text) { return !!(_cache[text] && _cache[text].mapped); }
  function known(text) { return !!_cache[text]; }
  function splicedText(text) { return _spliced[text] || null; }

  // 展開を server に頼み、手元に憶える。展開が要らない・憶え済みならすぐ解決。失敗しても reject しない。
  // dir: 相対の !include を探すフォルダ (その図の .puml のあるフォルダ。BLK-primary-20260929-1108)。
  function ensure(text, fetchFn, dir) {
    if (!needs(text) || _cache[text]) return Promise.resolve(has(text));
    if (_pending[text]) return _pending[text];
    var f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.resolve(false);
    var timer = null;
    var req = Promise.resolve().then(function() {
      return f('/preproc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dir ? { text: withMarks(text), dir: dir } : { text: withMarks(text) }),
      });
    }).then(function(r) { return r && r.ok ? r.json() : null; })
      .then(function(d) {
        if (d && d.ok && Array.isArray(d.lines)) { _remember(text, { mapped: mapBack(d.lines) }); return true; }
        _remember(text, { failed: true, error: d && d.error });
        return false;
      }, function() { _remember(text, { failed: true }); return false; });
    var late = new Promise(function(resolve) { timer = setTimeout(function() { resolve(false); }, TIMEOUT_MS); });
    var p = Promise.race([req, late]).then(function(v) {
      if (timer) clearTimeout(timer);
      delete _pending[text];
      return v;
    });
    _pending[text] = p;
    return p;
  }

  // テスト・E2E 用: 展開後の行を直接憶えさせる。
  function remember(text, outLines) { _remember(text, { mapped: mapBack(outLines) }); }
  function forget() { _cache = {}; _order = []; _spliced = {}; _pending = {}; }

  return {
    needs: needs, withMarks: withMarks, mapBack: mapBack, splice: splice, remap: remap,
    parseWith: parseWith, ensure: ensure, has: has, known: known, splicedText: splicedText,
    remember: remember, forget: forget, MARK: MARK,
  };
})();
