'use strict';

// review-board — 「前回の指摘文書」「今回の突合結果」「前回控えとの差分」を
// 1 枚に束ねる。
//
// BLK-reviewer-20260914-1206-wish: 突合そのものは name-audit / consistency /
// svg-cross / part-cross が、run をまたぐ指摘の追跡は audit-timeline / audit-diff が、
// 1 画面の一覧は audit-board が既に持っている。それでも reviewer は毎 run
//   (1) audit.js の JSON  (2) 前回書いた `指摘.md`  (3) 前回控えとの puml diff
//   (4) DSL 本文の宣言コメント
// の 4 つを手で突き合わせ、「これは解消・これは継続 3 tick 目・これは新規」を
// 頭の中で振り分けてから指摘文を書いていた。束ねる作業だけが機械化されていない。
//
// ここは束ねるだけを行う。突合はしない (audit-board の行を受け取る)。
//   ・前回の `指摘.md` を見出し単位で読み、状態 (継続/新規/解消) と継続 tick 数、
//     対象の図名を取り出す
//   ・前回の指摘 1 件ごとに、今回の突合行が当たっているかを図名で突き合わせ、
//     当たれば「継続 (tick+1)」、当たらなければ「解消」と振り分ける
//   ・どの前回指摘にも当たらない今回の行を「新規」として残す
//   ・前回控えとの diff (変わったファイル) を同じ画面に並べ、指摘のある図が
//     実際に触られたのかを 1 目で見えるようにする
//
// DOM にもサーバにも触らない。描画と結線は app.js。node からも require できる
// (tools/audit.js の --board が同じ束ね方を使う)。
(function() {

  // 指摘.md の見出しに付く印。reviewer が手で書く言葉をそのまま読む
  // (書式を新しく決めると、過去の指摘文書が全部「その他」に落ちるため)。
  var MARKS = [
    { status: 'resolved', label: '解消', re: /解消/ },
    { status: 'carried', label: '継続', re: /継続|未着手|再掲/ },
    { status: 'fresh', label: '新規', re: /新規|初出/ },
  ];

  // 図名として拾う綴り。拡張子は落として突き合わせる (指摘文は
  // `timer_state.puml` とも `timer_state.svg` とも書くが、同じ図を指す)。
  var DOC_RE = /([A-Za-z0-9_][A-Za-z0-9_\-]*)\.(?:puml|pu|plantuml|svg)\b/g;

  function _s(v) { return v == null ? '' : String(v); }

  function _list(v) { return Array.isArray(v) ? v : []; }

  // 図名の正規化。拡張子とフォルダを落とす。
  function docKey(name) {
    var s = _s(name).split(/[\\/]/).pop();
    return s.replace(/\.(puml|pu|plantuml|svg)$/i, '');
  }

  // ---- 指摘.md を読む ------------------------------------------------------

  // 指摘ではない節の見出し。reviewer は指摘.md の末尾に件数表と依頼一覧を置く。
  // これらの本文には「継続」「未着手」がふつうに現れるので、本文の言い回しで
  // 状態を決める前に弾かないと、件数表そのものが 1 件の指摘として振り分けられる。
  var NOT_A_FINDING = /サマリ|まとめ|依頼|一覧|凡例|補足/;

  // 見出しの `【継続・最優先・2回目】` のような印から状態を決める。
  // 印が無ければ本文の言い回しで決め、それも無ければ 'other'。
  function _statusOf(heading, body) {
    var head = _s(heading);
    var mark = /【([^】]*)】/.exec(head);
    if (mark) {
      for (var i = 0; i < MARKS.length; i++) {
        if (MARKS[i].re.test(mark[1])) return MARKS[i].status;
      }
    }
    if (NOT_A_FINDING.test(head)) return 'other';
    var src = mark ? head.replace(/【[^】]*】/g, '') : head;
    for (var j = 0; j < MARKS.length; j++) {
      if (MARKS[j].re.test(src)) return MARKS[j].status;
    }
    for (var k = 0; k < MARKS.length; k++) {
      if (MARKS[k].re.test(_s(body))) return MARKS[k].status;
    }
    return 'other';
  }

  // 継続 tick 数。`継続 2 tick 目` / `2回目` / `継続 4 tick 以上` を読む。
  // 読めなければ 0 (= 数えていない) を返し、当たったときに 1 から数え直す。
  function _tickOf(heading, body) {
    var all = _s(heading) + '\n' + _s(body);
    var m = /継続\s*(\d+)\s*tick/.exec(all);
    if (m) return Number(m[1]);
    m = /(\d+)\s*回目/.exec(all);
    if (m) return Number(m[1]);
    return 0;
  }

  // 「継続 4 tick 以上」のように、正確な回数が分かっていない印。
  function _atLeastOf(heading, body) {
    return /継続\s*\d+\s*tick\s*以上/.test(_s(heading) + '\n' + _s(body));
  }

  // 初出の run。`初出: runs/20260914-1106` を読む。
  function _sinceOf(body) {
    // 句読点・閉じ括弧で切る。reviewer は `初出: runs/... 。継続 2 tick 目。` のように
    // 1 行に 2 つの事実を続けて書くので、空白までを 1 語とすると次の文が混ざる。
    var m = /初出[:：]\s*([^\s。、）)]+)/.exec(_s(body));
    return m ? m[1] : '';
  }

  // 見出しから印と装飾を落とした題名。
  function _titleOf(heading) {
    return _s(heading).replace(/【[^】]*】/g, '').replace(/^#+\s*/, '').trim();
  }

  function _docsIn(text) {
    var out = [], m;
    DOC_RE.lastIndex = 0;
    while ((m = DOC_RE.exec(_s(text))) !== null) {
      var k = docKey(m[1]);
      if (k && out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }

  // 指摘.md を `##` の見出し単位で 1 件ずつに割る。
  // サマリ・依頼のような「指摘ではない節」も落とさず持つ (状態は 'other')。
  function parseFindings(md) {
    var lines = _s(md).split(/\r?\n/);
    var out = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var h = /^##\s+(.*)$/.exec(lines[i]);
      if (h) {
        if (cur) out.push(cur);
        cur = { heading: h[1].trim(), body: [] };
        continue;
      }
      if (cur) cur.body.push(lines[i]);
    }
    if (cur) out.push(cur);

    return out.map(function(sec, idx) {
      var body = sec.body.join('\n').trim();
      var status = _statusOf(sec.heading, body);
      return {
        index: idx,
        heading: sec.heading,
        title: _titleOf(sec.heading),
        status: status,
        tick: _tickOf(sec.heading, body),
        atLeast: _atLeastOf(sec.heading, body),
        since: _sinceOf(body),
        docs: _docsIn(sec.heading + '\n' + body),
        keys: _keysIn(sec.heading + '\n' + body),
        svgIssue: /svg|エクスポート|書き出/i.test(sec.heading + '\n' + body),
        body: body,
      };
    });
  }

  // 指摘が名指ししている「図の中の何か」。バッククォートで囲った語のうち
  // 図名でないもの (クラス名・メソッド名・宣言コメント) を拾う。
  // 図名だけで突き合わせると、同じ図に別の指摘が 1 件でもあれば全部が
  // 「継続」に見える (1 枚に 10 件ある図では常に継続になる)。
  function _keysIn(text) {
    var out = [], m;
    var re = /`([^`]+)`/g;
    while ((m = re.exec(_s(text))) !== null) {
      var k = m[1].trim();
      if (!k) continue;
      // 図名はここでは鍵にしない (docs が持つ)。
      if (/^[A-Za-z0-9_][A-Za-z0-9_\-]*\.(puml|pu|plantuml|svg)$/i.test(k)) continue;
      // コマンド行は鍵にならない。
      if (/^(node|npm|npx|git)\s/.test(k)) continue;
      // `Timer_Init()` は `Timer_Init` としても当てたいので括弧を落とす。
      k = k.replace(/\(\s*\)$/, '');
      if (k.length < 3) continue;
      if (out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }

  // ---- 束ねる --------------------------------------------------------------

  // 突合行 1 件が触れている図名。
  function _rowDocs(row) {
    var d = _list(row && row.docs).map(docKey).filter(function(s) { return s !== ''; });
    if (d.length) return d;
    var one = docKey(row && row.doc);
    return one ? [one] : [];
  }

  // 前回指摘 1 件に、今回の突合行が当たっているか。
  // 突き合わせは図名で行う (指摘文は自然文なので、題名の一致は当てにできない)。
  // 図名を 1 つも書いていない指摘は機械では当てられないので、当たり判定の
  // 対象から外して 'unmatched' として出す (勝手に解消にしない)。
  function _match(finding, rows) {
    var want = _list(finding.docs);
    if (!want.length) return null;
    var onDoc = _list(rows).filter(function(r) {
      var rd = _rowDocs(r);
      for (var i = 0; i < rd.length; i++) {
        if (want.indexOf(rd[i]) >= 0) return true;
      }
      return false;
    });
    var keys = _list(finding.keys);
    // 図しか名指ししていない指摘は、図名の一致が持っている一番強い手がかり。
    if (!keys.length && !finding.svgIssue) return { hit: onDoc, rest: [] };

    function byKey(r) {
      var text = _s(r.title) + ' ' + _s(r.detail);
      for (var i = 0; i < keys.length; i++) {
        if (text.indexOf(keys[i]) >= 0) return true;
      }
      return false;
    }
    // 名指しされた部品 (ClockCtrl など) は、指摘を書いた図とは別の図の行に
    // 出ることがある (クラス図に足りないメソッドは、呼んでいるシーケンス図の
    // 行として上がる)。図で絞ると、その手の指摘が毎回「解消」に落ちる。
    // 一方「SVG が古い」は図そのものの話なので、その図の出力物の行だけを見る。
    var hit = _list(rows).filter(function(r) {
      if (byKey(r)) return true;
      return finding.svgIssue && onDoc.indexOf(r) >= 0 && _s(r.kind).indexOf('svg.') === 0;
    });
    return { hit: hit, rest: onDoc.filter(function(r) { return hit.indexOf(r) < 0; }) };
  }

  // build({ board, findings, changedFiles })
  //   board        — audit-board.build() の結果 (今回の突合)
  //   findings     — parseFindings() の結果 (前回の指摘文書)、または指摘.md の本文
  //   changedFiles — 前回控えとの diff で「変わった」と出たファイル名の配列
  function build(input) {
    var inp = input || {};
    var board = inp.board || { rows: [] };
    var rows = _list(board.rows);
    var findings = typeof inp.findings === 'string'
      ? parseFindings(inp.findings)
      : _list(inp.findings);
    var changed = _list(inp.changedFiles).map(docKey)
      .filter(function(s) { return s !== ''; });

    var covered = {};
    var carried = [];

    findings.forEach(function(f) {
      // サマリ節・依頼節は指摘ではないので振り分けない。
      if (f.status === 'other') return;
      var m = _match(f, rows);
      if (m === null) {
        carried.push({ finding: f, verdict: 'unmatched', tick: f.tick, rows: [],
          note: '対象の図名が書かれていないため機械では突き合わせられません。本文を読んでください' });
        return;
      }
      var hit = m.hit;
      hit.forEach(function(r) { covered[rows.indexOf(r)] = true; });
      // 名指しした対象には当たらないが、同じ図に別の指摘が残っている。
      // 「解消」と言い切らず、その図の行を添えて読ませる。
      if (!hit.length && m.rest.length) {
        m.rest.forEach(function(r) { covered[rows.indexOf(r)] = true; });
        carried.push({ finding: f, verdict: 'sameDoc', tick: f.tick, rows: m.rest,
          note: '名指しの対象は今回の突合に出ていませんが、同じ図に別の指摘が残っています' });
        return;
      }
      if (hit.length) {
        // 当たった = まだ直っていない。前回まで数えた回数に 1 を足す。
        // 前回が「解消」だった指摘に今回また当たったら、それは出戻りなので 1 から数える。
        var tick = f.status === 'resolved' ? 1 : (f.tick || 0) + 1;
        carried.push({ finding: f, verdict: 'carried', tick: tick, atLeast: f.atLeast, rows: hit,
          note: f.status === 'resolved' ? '前回は解消と書いていますが、今回また当たっています' : '' });
      } else {
        carried.push({ finding: f, verdict: 'resolved', tick: f.tick, rows: [],
          note: '今回の突合に出ていません' });
      }
    });

    // どの前回指摘にも当たらなかった行。
    var fresh = rows.filter(function(r, i) { return !covered[i]; });

    // 指摘のある図のうち、前回控えから実際に中身が変わったもの。
    // 「継続なのに触られている」= 直そうとして直り切っていない、
    // 「継続で触られてもいない」= 未着手、の区別がここで付く。
    var touched = {};
    changed.forEach(function(c) { touched[c] = true; });
    carried.forEach(function(c) {
      c.touched = _list(c.finding.docs).filter(function(d) { return touched[d]; });
    });

    return {
      carried: carried,
      fresh: fresh,
      changedFiles: changed,
      counts: {
        carried: carried.filter(function(c) { return c.verdict === 'carried'; }).length,
        resolved: carried.filter(function(c) { return c.verdict === 'resolved'; }).length,
        sameDoc: carried.filter(function(c) { return c.verdict === 'sameDoc'; }).length,
        unmatched: carried.filter(function(c) { return c.verdict === 'unmatched'; }).length,
        fresh: fresh.length,
        changed: changed.length,
      },
    };
  }

  // 最長の継続 tick 数。「いちばん放置されている指摘」を先に読むための目印。
  function longestCarry(view) {
    var max = 0, item = null;
    _list(view && view.carried).forEach(function(c) {
      if (c.verdict === 'carried' && c.tick > max) { max = c.tick; item = c; }
    });
    return item ? { tick: max, title: item.finding.title } : null;
  }

  function summaryLine(view) {
    var c = (view && view.counts) || { carried: 0, resolved: 0, fresh: 0, sameDoc: 0, unmatched: 0, changed: 0 };
    var s = '継続 ' + c.carried + ' / 解消 ' + c.resolved + ' / 新規 ' + c.fresh + ' 件';
    var re = [];
    if (c.sameDoc) re.push('同じ図に別の指摘 ' + c.sameDoc + ' 件');
    if (c.unmatched) re.push('要読み直し ' + c.unmatched + ' 件');
    if (re.length) s += '（' + re.join('・') + '）';
    s += '、前回控えから変わった図 ' + c.changed + ' 枚';
    var l = longestCarry(view);
    if (l) s += '。最長の継続は「' + l.title + '」' + l.tick + ' tick 目';
    return s;
  }

  var VERDICT = { carried: '継続', resolved: '解消', sameDoc: '同じ図に別の指摘', unmatched: '要読み直し' };

  // 1 枚の常設ビュー。そのまま次の指摘.md の下敷きになる形で出す。
  function markdown(view, title) {
    var v = view || { carried: [], fresh: [], changedFiles: [] };
    var out = ['# ' + (_s(title) || 'レビュー結果'), '', summaryLine(v), ''];

    var order = ['carried', 'sameDoc', 'unmatched', 'resolved'];
    order.forEach(function(kind) {
      var items = _list(v.carried).filter(function(c) { return c.verdict === kind; });
      if (!items.length) return;
      out.push('## 前回の指摘 — ' + VERDICT[kind] + '（' + items.length + ' 件）');
      items.forEach(function(c) {
        var head = '- ' + c.finding.title;
        if (kind === 'carried') {
          head += '（' + c.tick + ' tick 目' + (c.atLeast ? '以上' : '') + '）';
          head += c.touched && c.touched.length
            ? '（' + c.touched.join('・') + ' は前回控えから変わっています）'
            : '（前回控えから 1 行も変わっていません = 未着手）';
        }
        if (c.finding.since) head += '（初出 ' + c.finding.since + '）';
        out.push(head);
        if (c.note) out.push('  - ' + c.note);
        _list(c.rows).slice(0, 5).forEach(function(r) {
          out.push('  - [' + _s(r.doc) + '] ' + _s(r.category) + ' ' + _s(r.title));
        });
        if (_list(c.rows).length > 5) out.push('  - ほか ' + (c.rows.length - 5) + ' 件');
      });
      out.push('');
    });

    if (_list(v.fresh).length) {
      out.push('## 今回の新規（' + v.fresh.length + ' 件）');
      v.fresh.forEach(function(r) {
        out.push('- [' + _s(r.doc) + '] ' + _s(r.category) + ' ' + _s(r.title) + ' — ' + _s(r.detail));
      });
      out.push('');
    }

    out.push('## 前回控えから変わった図（' + _list(v.changedFiles).length + ' 枚）');
    out.push(_list(v.changedFiles).length ? '- ' + v.changedFiles.join('・') : '- なし');
    out.push('');
    return out.join('\n');
  }

  var api = {
    MARKS: MARKS, VERDICT: VERDICT,
    docKey: docKey, parseFindings: parseFindings, build: build,
    longestCarry: longestCarry, summaryLine: summaryLine, markdown: markdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.reviewBoard = api;
  }
})();
