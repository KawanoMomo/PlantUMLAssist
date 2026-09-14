'use strict';
window.MA = window.MA || {};

// request-ledger — primary への依頼 (指摘.md に自然文で書く「お願い」) を 1 件ずつ
// 憶えておき、初出 tick からの継続 tick 数・継続日数・着手状況を機械で出す。
//
// BLK-reviewer-20260914-1906-wish: 依頼が何 tick 前から未着手か、いつ退行したかは
// どこにも残らず、手順2・7・8 のたびに runs/ の過去ログを手で遡って数えていた。
// 指摘ピン (review-pins / pin-progress) は図の行に貼る指摘を追うが、依頼は図の行では
// なく文書に書く単位 (「本体に差し替えて -編集中 を消す」) なので、ピンでは追えない。
//
// ここは指摘.md から依頼を切り出し、控えと突き合わせて
//   新規 / 継続 (連続 N tick) / 再発 (一度消えたのにまた出た) / 解消 (今回の文書から消えた)
// を出す。あわせて依頼が名指しする図の指紋を憶え、前回 tick から図が動いたかで
//   未着手 (図が 1 度も動いていない) / 着手 (図は動いたが依頼は残っている)
// を言う。過去ログの遡りはこの控え 1 つで置き換わる。
//
// DOM にもファイルにも触らない。控えの読み書きは呼ぶ側 (tools/requests.js) の職掌。
window.MA.requestLedger = (function() {

  var VERSION = 1;

  function _s(v) { return v == null ? '' : String(v); }

  // ---- 指摘.md から依頼を切り出す ------------------------------------------

  // 依頼が並ぶのは「依頼」と書かれた見出しの下の番号つき箇条書き。
  // 見出しが無い文書でも拾えるよう、`## …依頼N…` の見出し自身も 1 件として読む。
  function _isRequestHeading(line) {
    return /^#{1,6}\s.*依頼/.test(line);
  }

  function _isListHeading(line) {
    return /^#{1,6}\s.*(への依頼|依頼一覧|お願い)/.test(line);
  }

  // 「(最優先・継続)」「【未解消・継続】」のような、その回の扱いを表す括弧は
  // 依頼の中身ではない。指紋から外さないと、扱いが変わるたびに別の依頼になる。
  function normalize(text) {
    return _s(text)
      .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ')
      .replace(/^\s*\d+\s*[.)．、]\s*/, ' ')
      .replace(/[`'"]/g, '')
      // 空白は全部落とす。日本語の文は行の折り返し位置で空白の有無が変わるので、
      // 残すと「同じ依頼を書き直しただけ」で別件になる。
      .replace(/\s+/g, '')
      .trim();
  }

  // FNV-1a 32bit。同じ依頼なら同じ値が出ればよい (manual-findings と同じ考え方)。
  function hash(text) {
    var s = normalize(text);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // 依頼が名指しする図。着手したかを見るのはこのファイルたち。
  function docsIn(text) {
    var out = [];
    // 図名には日本語が入る (plantuml-usecase-編集中.puml)。区切りに使う記号だけを外す。
    var re = /([^\s`'"「」（）(),、。:：]+?\.(?:puml|plantuml))/g;
    var m;
    while ((m = re.exec(_s(text)))) {
      var name = m[1].replace(/\.(puml|plantuml)$/i, '');
      if (out.indexOf(name) < 0) out.push(name);
    }
    return out;
  }

  // 表示用の文面。先頭に付く扱いの括弧 (「(最優先・継続)」「【未解消】」) は落とす。
  // 指紋では無視している部分なので、一覧に出すときも出さないほうが読みやすい。
  function displayText(text) {
    return _s(text).replace(/^\s*(?:[（(【\[][^）)】\]]*[）)】\]]\s*)+/, '').trim() || _s(text).trim();
  }

  function parse(markdown) {
    var lines = _s(markdown).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var heads = [];
    var inList = false;
    var cur = null;

    function _add(list, text) {
      var t = displayText(text);
      if (!t) return;
      var key = hash(t);
      for (var i = 0; i < list.length; i++) { if (list[i].key === key) return; }
      list.push({ key: key, text: t, docs: docsIn(t) });
    }

    function push(text) { _add(out, text); }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^#{1,6}\s/.test(line)) {
        if (cur) { push(cur); cur = null; }
        inList = _isListHeading(line);
        // 「## 【未解消・継続】依頼1: …」のような見出しそのものも控えておく。
        // 一覧の節がある回は同じ依頼が言い換えで 2 件に割れるので使わず、
        // 一覧が無い回にだけ使う (依頼を落とさないための保険)。
        if (!inList && _isRequestHeading(line)) {
          _add(heads, line.replace(/^#{1,6}\s*/, '').replace(/^.*?依頼\s*\d*\s*[:：]?\s*/, ''));
        }
        continue;
      }
      if (!inList) continue;
      var item = /^\s*\d+\s*[.)．、]\s+(.*)$/.exec(line);
      if (item) {
        if (cur) push(cur);
        cur = item[1];
        continue;
      }
      // 折り返しの続き。日本語の文の途中で切れているときは空白を挟まない
      // (挟むと、同じ依頼でも折り返し位置が変わるたびに文面が変わる)。
      if (cur && /^\s+\S/.test(line)) {
        cur += (/[ -~]$/.test(cur) ? ' ' : '') + line.trim();
        continue;
      }
      if (cur && !line.trim()) { push(cur); cur = null; }
    }
    if (cur) push(cur);
    return out.length ? out : heads;
  }

  // ---- 控え ----------------------------------------------------------------

  function emptyState() {
    return { version: VERSION, ticks: [], requests: {}, docs: {} };
  }

  function readState(raw) {
    var v = raw;
    if (typeof raw === 'string') {
      try { v = JSON.parse(raw); } catch (e) { return emptyState(); }
    }
    if (!v || typeof v !== 'object') return emptyState();
    var out = emptyState();
    if (Array.isArray(v.ticks)) {
      out.ticks = v.ticks.filter(function(t) { return t && typeof t === 'object'; })
        .map(function(t) { return { label: _s(t.label), at: _s(t.at) }; });
    }
    if (v.requests && typeof v.requests === 'object') {
      for (var k in v.requests) {
        if (!Object.prototype.hasOwnProperty.call(v.requests, k)) continue;
        var r = v.requests[k];
        if (!r || typeof r !== 'object') continue;
        out.requests[k] = {
          key: k, text: _s(r.text),
          docs: Array.isArray(r.docs) ? r.docs.map(_s) : [],
          seen: Array.isArray(r.seen) ? r.seen.filter(function(n) { return typeof n === 'number'; }) : [],
        };
      }
    }
    if (v.docs && typeof v.docs === 'object') {
      for (var d in v.docs) {
        if (Object.prototype.hasOwnProperty.call(v.docs, d)) out.docs[d] = _s(v.docs[d]);
      }
    }
    return out;
  }

  // update — 1 tick ぶんを控えに足す。docs は {図名: DSL}。
  // 同じ label で 2 度呼んでも tick は増えない (同じ run の数え直しで日数が伸びない)。
  function update(state, input) {
    var st = readState(state);
    var o = input || {};
    var label = _s(o.label) || _s(o.at) || String(st.ticks.length + 1);
    var at = _s(o.at);
    var requests = Array.isArray(o.requests) ? o.requests : parse(o.markdown);
    var docs = (o.docs && typeof o.docs === 'object') ? o.docs : {};

    var idx = -1;
    for (var i = 0; i < st.ticks.length; i++) { if (st.ticks[i].label === label) { idx = i; break; } }
    if (idx < 0) { st.ticks.push({ label: label, at: at }); idx = st.ticks.length - 1; }
    else { st.ticks[idx].at = at || st.ticks[idx].at; }

    requests.forEach(function(r) {
      var cur = st.requests[r.key];
      if (!cur) { cur = st.requests[r.key] = { key: r.key, text: r.text, docs: r.docs || [], seen: [] }; }
      cur.text = r.text || cur.text;
      if ((r.docs || []).length) cur.docs = r.docs;
      if (cur.seen.indexOf(idx) < 0) cur.seen.push(idx);
    });

    // 図の指紋。前回 tick からの動きを見るために、今回の値へ入れ替える前に控える。
    var prevDocs = st.docs;
    var nextDocs = {};
    var moved = {};
    for (var name in docs) {
      if (!Object.prototype.hasOwnProperty.call(docs, name)) continue;
      var h = hash(docs[name]);
      nextDocs[name] = h;
      // 前回の指紋が無い図は「動いた」とは言わない (初回はどの図も未知)。
      moved[name] = Object.prototype.hasOwnProperty.call(prevDocs, name) && prevDocs[name] !== h;
    }
    st.docs = nextDocs;
    st.__moved = moved;
    st.__tick = idx;
    return st;
  }

  // ---- 読み出し ------------------------------------------------------------

  function _days(fromIso, toIso) {
    var a = Date.parse(_s(fromIso));
    var b = Date.parse(_s(toIso));
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  // 最新 tick から数えて、連続で出ている tick の数。
  function _streak(seen, last) {
    var n = 0;
    for (var i = last; i >= 0; i--) {
      if (seen.indexOf(i) < 0) break;
      n++;
    }
    return n;
  }

  // rows(state) — 1 依頼 1 行。控えに残っている全依頼 (解消したものも) を返す。
  function rows(state) {
    var st = readState(state);
    var moved = (state && state.__moved) || {};
    var last = st.ticks.length - 1;
    var out = [];
    for (var k in st.requests) {
      if (!Object.prototype.hasOwnProperty.call(st.requests, k)) continue;
      var r = st.requests[k];
      var seen = r.seen.slice().sort(function(a, b) { return a - b; });
      if (!seen.length) continue;
      var first = seen[0];
      var latest = seen[seen.length - 1];
      var open = latest === last;
      // 出ていない tick を挟んでいれば、いちど消えた依頼が戻ってきている。
      var gaps = (latest - first + 1) !== seen.length;
      var streak = open ? _streak(seen, last) : 0;
      var docsMoved = (r.docs || []).some(function(d) { return !!moved[d]; });
      var status;
      if (!open) status = 'resolved';
      else if (gaps && streak === 1) status = 'regressed';
      else if (seen.length === 1) status = 'new';
      else status = docsMoved ? 'working' : 'stalled';
      out.push({
        key: k, text: r.text, docs: r.docs || [],
        open: open, status: status,
        firstTick: st.ticks[first] ? st.ticks[first].label : '',
        firstAt: st.ticks[first] ? st.ticks[first].at : '',
        lastTick: st.ticks[latest] ? st.ticks[latest].label : '',
        lastAt: st.ticks[latest] ? st.ticks[latest].at : '',
        ticks: seen.length,
        streak: streak,
        days: _days(st.ticks[first] && st.ticks[first].at, st.ticks[latest] && st.ticks[latest].at),
        regressed: gaps,
      });
    }
    // 放置の長いものが上。今日どれを押すかはこの並びがそのまま答えになる。
    out.sort(function(a, b) {
      if (a.open !== b.open) return a.open ? -1 : 1;
      if (a.streak !== b.streak) return b.streak - a.streak;
      return a.text < b.text ? -1 : (a.text > b.text ? 1 : 0);
    });
    return out;
  }

  var LABEL = {
    'new': '新規',
    stalled: '未着手',
    working: '着手',
    regressed: '再発',
    resolved: '解消',
  };

  function statusLabel(status) { return LABEL[status] || String(status || ''); }

  // 1 行の言い方。過去ログを遡らずに「何 tick 前から放置か」がここで読める。
  function rowText(row) {
    var r = row || {};
    var head = '[' + statusLabel(r.status) + '] ' + _s(r.text);
    if (r.status === 'resolved') return head + ' — ' + _s(r.lastTick) + ' を最後に消えた';
    var tail = ' — 初出 ' + _s(r.firstTick);
    if (r.days !== null && r.days !== undefined) tail += ' (' + r.days + ' 日前)';
    tail += ' ・ 連続 ' + r.streak + ' tick';
    if (r.regressed) tail += ' ・ 一度消えてから再発';
    return head + tail;
  }

  function summaryText(list) {
    var rs = list || [];
    var open = rs.filter(function(r) { return r.open; });
    if (!rs.length) return '追っている依頼はありません';
    var stalled = open.filter(function(r) { return r.status === 'stalled'; }).length;
    var worst = 0;
    open.forEach(function(r) { if (r.streak > worst) worst = r.streak; });
    return '未解消 ' + open.length + ' 件 (未着手 ' + stalled + ' 件) / 解消済み '
      + (rs.length - open.length) + ' 件 ・ 最長 ' + worst + ' tick 継続';
  }

  return {
    VERSION: VERSION,
    normalize: normalize,
    hash: hash,
    docsIn: docsIn,
    displayText: displayText,
    parse: parse,
    emptyState: emptyState,
    readState: readState,
    update: update,
    rows: rows,
    statusLabel: statusLabel,
    rowText: rowText,
    summaryText: summaryText,
  };
})();
