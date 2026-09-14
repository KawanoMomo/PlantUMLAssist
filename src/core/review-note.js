'use strict';
window.MA = window.MA || {};

// review-note — reviewer が置いた `指摘.md` (自由文) を、GUI で 1 件ずつ選べる形にする。
//
// BLK-junior-20260913-0306-wish: junior は `persona-data\reviewer\指摘.md` を
// エディタの外でテキストとして読み、そこに書かれた図名 (gpio_init_sequence など) を
// 目で拾い、覗き機能で自分と先輩のフォルダから同じ名前を探し当て、ようやく
// 見比べる画面に辿り着いていた。指摘文と図の対応付けが全部手読みで、
// 指摘が 1 件増えるたびに「拾う→探す」が増える。
//
// ここは指摘.md を `##` 見出しで 1 件ずつに切り、各件の本文に出てくる図名を
// 保存フォルダの実在する名前と突き合わせる。どの名前が「同じ名前で 2 人が
// 持っている」かまで出せば、画面はその組を並べて見る画面へ渡すだけで済む。
//
// 突き合わせは名前の実在で決める (本文から正規表現で「それらしい語」を拾うと、
// 図でない語 — md5 値やコマンド名 — が図名として並ぶ)。
//
// DOM も fetch も触らない (切り分けと突き合わせだけ)。読み込みと描画は app.js。
window.MA.reviewNote = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _lines(text) { return _s(text).replace(/\r\n?/g, '\n').split('\n'); }

  // ── 図名 ────────────────────────────────────────────────────────────────
  // `junior/gpio_init_sequence.puml` → `gpio_init_sequence`。
  function baseName(name) {
    var s = _s(name).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // ── 1 件に切る ──────────────────────────────────────────────────────────
  // `##` 以上の見出しで切る。`#` (題) は文書全体の見出しなので件にしない。
  // 見出しの前に書かれた前書きも件にしない (誰宛かを書く行で、指摘ではない)。
  // 見出しに付く【最重要】【継続】などは、そのまま印として残す (並べ替えない。
  // reviewer が書いた順が、読む順として意味を持つ)。
  var HEAD_RE = /^(#{2,6})\s+(.*)$/;
  var MARK_RE = /【([^】]+)】/g;

  function parse(text) {
    var lines = _lines(text);
    var out = [];
    var cur = null;
    var n = 0;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(HEAD_RE);
      if (m) {
        var title = _s(m[2]).trim();
        if (m[1].length > 2 && cur) {
          // 小見出しは親の本文の一部として扱う (指摘 1 件の中の内訳)。
          cur.body.push(lines[i]);
          continue;
        }
        n++;
        cur = { id: 'note-' + n, index: n, title: title, marks: marksOf(title),
                heading: title.replace(MARK_RE, '').trim(), body: [] };
        out.push(cur);
        continue;
      }
      if (cur) cur.body.push(lines[i]);
    }
    return out.map(function(f) {
      f.body = f.body.join('\n').replace(/^\n+|\n+$/g, '');
      f.text = f.title + '\n' + f.body;
      return f;
    });
  }

  function marksOf(title) {
    var out = [];
    var s = _s(title), m;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(s))) {
      _s(m[1]).split(/[・\/、]/).forEach(function(v) {
        var t = _s(v).trim();
        if (t && out.indexOf(t) < 0) out.push(t);
      });
    }
    return out;
  }

  // ── 図名の突き合わせ ────────────────────────────────────────────────────
  // docs は `folder/name` の疑似 doc の並び (app.js の _peekIndexDocs の戻り)。
  // 図名 → それを持つフォルダ、の引きにする。
  function index(docs) {
    var map = {};
    var order = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      var full = _s(d && d.name);
      if (!full) return;
      var slash = full.indexOf('/');
      if (slash < 0) return;
      var folder = full.slice(0, slash);
      var base = baseName(full);
      if (!base || !folder) return;
      if (!map[base]) { map[base] = { name: base, folders: [], docs: [] }; order.push(base); }
      if (map[base].folders.indexOf(folder) < 0) {
        map[base].folders.push(folder);
        map[base].docs.push(d);
      }
    });
    order.forEach(function(k) { map[k].folders.sort(); });
    return { map: map, names: order };
  }

  // 1 件の本文に出てくる図名。実在する名前だけを拾う。
  // 長い名前から当て、既に採った名前に丸ごと含まれる短い名前は採らない
  // (`gpio_state` と `gpio_state_detail` が両方並ぶと、どちらの話か決まらない)。
  function docsIn(finding, idx) {
    var text = _s(finding && finding.text).toLowerCase();
    var ix = idx || { map: {}, names: [] };
    if (!text) return [];
    var names = (ix.names || []).slice().sort(function(a, b) { return b.length - a.length; });
    var taken = [];
    names.forEach(function(name) {
      var low = name.toLowerCase();
      if (!low || text.indexOf(low) < 0) return;
      for (var i = 0; i < taken.length; i++) {
        if (taken[i].toLowerCase().indexOf(low) >= 0) return;
      }
      taken.push(name);
    });
    // 本文に出てくる順に戻す (書いた順に読めるようにする)。
    taken.sort(function(a, b) {
      return text.indexOf(a.toLowerCase()) - text.indexOf(b.toLowerCase());
    });
    return taken.map(function(name) {
      var e = ix.map[name] || { folders: [], docs: [] };
      return { name: name, folders: e.folders.slice(), docs: e.docs.slice(),
               shared: e.folders.length >= 2 };
    });
  }

  // 並べて見る相手になる組。同じ名前を 2 つ以上のフォルダが持っているものだけ。
  // 左右はフォルダ名順に固定する (side-by-side.pairsByFile と同じ決め方。
  // 選ぶたびに左右が入れ替わると、どちらを直すと決めたかが読めなくなる)。
  function pairsOf(docs) {
    var out = [];
    (docs || []).forEach(function(d) {
      if (!d || !d.shared) return;
      var fs = d.folders.slice().sort();
      for (var i = 0; i < fs.length; i++) {
        for (var j = i + 1; j < fs.length; j++) {
          out.push({ base: d.name, a: fs[i], b: fs[j] });
        }
      }
    });
    return out;
  }

  // 指摘 1 件ぶんの行。画面はこれをそのままボタンにする。
  function rows(findings, idx) {
    return (findings || []).map(function(f) {
      var docs = docsIn(f, idx);
      var pairs = pairsOf(docs);
      return {
        id: f.id, index: f.index, title: f.title, heading: f.heading,
        marks: f.marks || [], body: f.body,
        docs: docs, pairs: pairs,
        ready: pairs.length > 0,
      };
    });
  }

  // ボタンに出す 1 行。「押したら何が出るか」を押す前に言い切る。
  function rowLabel(row) {
    if (!row) return '';
    var head = _s(row.heading) || _s(row.title) || ('指摘 ' + _s(row.index));
    if (row.pairs && row.pairs.length) {
      var p = row.pairs[0];
      return head + ' — ' + p.base + ' (' + p.a + ' ⇔ ' + p.b + ') を並べる';
    }
    if (row.docs && row.docs.length) {
      return head + ' — ' + row.docs[0].name + ' は '
        + (row.docs[0].folders.join('・') || '—') + ' にしかありません';
    }
    return head + ' — 図の名前が書かれていません';
  }

  // ── 前置き ──────────────────────────────────────────────────────────────
  // BLK-primary-20260914-1706-wish: 指摘.md の `##` 見出しには、直す対象のある指摘に
  // 混じって「前提: DSL 無変化」「突合サマリ」「primary への依頼(優先順)」のような
  // 前置きが並ぶ。どれも特定の図を直す件ではないので [適用] も出ないが、一覧には
  // 同じ形で並ぶため、1 件ずつ開いて「これは本物の指摘か、ただの前置きか」を
  // 読んで決める一手間が毎回残っていた (今回は 9 件中 3 件が前置き)。
  //
  // 前置きと決めるのは見出しの語だけ (サマリ・前提・依頼・凡例…)。
  // 「図名を 1 つも挙げていない件」も前置きに入れると、図名を綴らずに書かれた
  // 実物の指摘 (「can の『編集中』ファイルの整理」など) まで一覧から消え、
  // 指摘が落ちる — 前置きを 1 件読む手間とは釣り合わない誤り方なので、そちらは残す。
  // 消しはしない (reviewer が書いた文章は残す)。既定で一覧の外に出し、件数を言い、
  // 出し直せるようにする — 前置きにしか書かれていない話を落とさないため。
  var PREAMBLE_WORDS = ['サマリ', '前提', '依頼', '凡例', '概要', 'はじめに', 'まとめ', '総括'];

  function headingIsPreamble(title) {
    var head = _s(title).replace(MARK_RE, '').trim();
    if (!head) return false;
    for (var i = 0; i < PREAMBLE_WORDS.length; i++) {
      if (head.indexOf(PREAMBLE_WORDS[i]) >= 0) return true;
    }
    return false;
  }

  function isPreamble(row) {
    return !!row && headingIsPreamble(row.title);
  }

  // 実物の指摘だけ / 前置きだけ。画面はこの 2 つを別々に並べる。
  function realRows(rows_) {
    return (rows_ || []).filter(function(r) { return !isPreamble(r); });
  }

  function preambleRows(rows_) {
    return (rows_ || []).filter(function(r) { return isPreamble(r); });
  }

  // 一覧に並べる行。既定は実物の指摘だけ。前置きが 1 件も無いフォルダでは
  // 絞っても絞らなくても同じものが出る (押す所を無駄に増やさない)。
  function visibleRows(rows_, showPreamble) {
    var list = rows_ || [];
    if (showPreamble) return list.slice();
    var real = realRows(list);
    // 全部が前置きなら、隠すと一覧が空になって読む手がかりが消える。そのまま出す。
    return real.length ? real : list.slice();
  }

  // 前置きの出し入れボタンの文字。押す前に何件動くかを言う。
  function preambleLabel(rows_, showPreamble) {
    var n = preambleRows(rows_).length;
    if (!n) return '';
    return showPreamble
      ? '前置き ' + n + ' 件を隠す'
      : '前置き ' + n + ' 件も出す';
  }

  // 一覧の見出し。今日 1 クリックで開ける件数を先に言う。
  function summaryText(rows_, showPreamble) {
    var list = rows_ || [];
    if (!list.length) return '指摘.md がありません';
    var pre = preambleRows(list).length;
    var real = list.length - pre;
    // 前置きが混ざっているなら、まず「実物が何件か」を言う (毎回数え直させない)。
    var head = (pre && real && !showPreamble)
      ? '指摘 ' + real + ' 件 (前置き ' + pre + ' 件は一覧の外)'
      : '指摘 ' + list.length + ' 件';
    var target = (pre && real && !showPreamble) ? realRows(list) : list;
    var ready = target.filter(function(r) { return r.ready; }).length;
    if (!ready) return head + ' (並べて見られる図の組はありません)';
    return head + ' / うち ' + ready + ' 件はクリック 1 回で並べて見られます';
  }

  // ── 指摘の無い図 ────────────────────────────────────────────────────────
  // BLK-junior-20260913-0306-wish (追記): 指摘.md に出てこない図を開いたとき、
  // 「本当に指摘が無いのか」を確かめるには指摘.md の全文をもう一度読むしかなかった。
  // 開いている図の名前が 1 件も挙がっていないことは機械で言える。言い切る。
  function mentionsOf(rows_, base) {
    var want = _s(base).toLowerCase();
    if (!want) return [];
    return (rows_ || []).filter(function(r) {
      return (r.docs || []).some(function(d) { return _s(d.name).toLowerCase() === want; });
    });
  }

  // 図に書かれた判断の注記。突合で「別物」と決めた図には
  // `' domain-verdict: separate gpio vs junior` が本文に残る (domain-verdict が書く)。
  // 対応不要の根拠はここにもあるので、指摘の有無と一緒に出す。
  var VERDICT_RE = /^\s*'\s*(domain-verdict:.*)$/;

  function verdictNotes(dsl) {
    var out = [];
    _lines(dsl).forEach(function(l) {
      var m = l.match(VERDICT_RE);
      if (m) out.push(_s(m[1]).trim());
    });
    return out;
  }

  // 開いている図について、指摘 1 行を返す。docs は並べている図 (1 枚でも 2 枚でもよい)。
  function docStatus(rows_, base, docs) {
    var hits = mentionsOf(rows_, base);
    var notes = [];
    (docs || []).forEach(function(d) {
      verdictNotes(d && d.dsl).forEach(function(v) {
        var tag = _s(d.folder || d.name);
        var line = (tag ? tag + ': ' : '') + v;
        if (notes.indexOf(line) < 0) notes.push(line);
      });
    });
    var text = hits.length
      ? _s(base) + ' への指摘 ' + hits.length + ' 件: '
        + hits.map(function(h) { return _s(h.heading) || _s(h.title); }).join(' / ')
      : _s(base) + ' への指摘はありません (指摘.md に名前が挙がっていません)';
    if (notes.length) text += ' — ' + notes.join('、');
    return { base: _s(base), hits: hits, notes: notes, clear: hits.length === 0, text: text };
  }

  // 覗ける行き先の一覧 (peek-dirs) と同じ形の答えから、指摘.md を選ぶ。
  // 複数あれば reviewer のフォルダのものを先に出す (指摘を書くのは reviewer)。
  function pickNote(notes) {
    var list = (notes || []).filter(function(n) { return n && _s(n.text); });
    if (!list.length) return null;
    list.sort(function(a, b) {
      var ar = /review/i.test(_s(a.folder)) ? 0 : 1;
      var br = /review/i.test(_s(b.folder)) ? 0 : 1;
      if (ar !== br) return ar - br;
      return _s(a.folder) < _s(b.folder) ? -1 : 1;
    });
    return list[0];
  }

  var api = {
    baseName: baseName,
    parse: parse,
    marksOf: marksOf,
    index: index,
    docsIn: docsIn,
    pairsOf: pairsOf,
    rows: rows,
    rowLabel: rowLabel,
    mentionsOf: mentionsOf,
    verdictNotes: verdictNotes,
    docStatus: docStatus,
    summaryText: summaryText,
    pickNote: pickNote,
    PREAMBLE_WORDS: PREAMBLE_WORDS,
    headingIsPreamble: headingIsPreamble,
    isPreamble: isPreamble,
    realRows: realRows,
    preambleRows: preambleRows,
    visibleRows: visibleRows,
    preambleLabel: preambleLabel,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
