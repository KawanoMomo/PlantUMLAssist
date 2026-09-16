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
    { status: 'partial', label: '部分解消', re: /部分解消|一部解消/ },
    { status: 'resolved', label: '解消', re: /解消/ },
    { status: 'carried', label: '継続', re: /継続|未着手|再掲/ },
    { status: 'fresh', label: '新規', re: /新規|初出/ },
  ];

  // 前回の状態を 1 語で言い直すための表 (スコープ外の行が「前回のまま」と言うのに使う)。
  var VERDICT_OF_STATUS = { partial: '部分解消', resolved: '解消', carried: '継続', fresh: '新規' };

  // BLK-reviewer-20260914-2206: 「puml 側は解消・svg 再エクスポートのみ継続」のように
  // 1 件の中で解消した所と残っている所を書き分けた指摘は、`解消` の 2 文字だけを見ると
  // 「解消」に落ちる。次の run で残っている方に当たると「前回は解消と書いたのに再発」と
  // 読める文が出て、reviewer が図の中身を読み直す羽目になる。同じ文の中に解消と
  // 残りの両方が書かれていれば、それは部分解消として読む。
  var STILL_RE = /継続|残(?:っ|り|る)|まだ|のみ|未(?:反映|対応|着手|完了)|待ち/;
  function _isPartial(text) {
    var lines = _s(text).split(/[\n。]/);
    for (var i = 0; i < lines.length; i++) {
      if (/解消/.test(lines[i]) && STILL_RE.test(lines[i])) return true;
    }
    return false;
  }

  // 図名として拾う綴り。拡張子は落として突き合わせる (指摘文は
  // `timer_state.puml` とも `timer_state.svg` とも書くが、同じ図を指す)。
  var DOC_RE = /([A-Za-z0-9_][A-Za-z0-9_\-]*)\.(?:puml|pu|plantuml|svg)\b/g;

  function _s(v) { return v == null ? '' : String(v); }

  function _list(v) { return Array.isArray(v) ? v : []; }

  // ---- 今回どの監査を回したか (スコープ) -----------------------------------

  // BLK-reviewer-20260914-2206 (3 件目): `--board --only svg` のように監査を絞って
  // 呼ぶと、突合行には svg のものしか来ない。今までは「今回の突合に出ていない」を
  // そのまま『解消』と読んでいたので、メソッド指摘のようなスコープ外の指摘まで
  // 「解消」と出た。さらに絞った回でも継続 tick を数え直すので、呼び出しオプション
  // の違いだけで新規/継続/tick 数がぶれていた。
  // 見ていない物は解消でも継続でもなく「今回は見ていない」と言う。tick も触らない。

  // 指摘文がどの監査の話かの手がかり。監査名は audit-report.js の AUDITS のキー
  // (= 突合行の kind の前置き)。reviewer は自然文で書くので、当てられない
  // 指摘は「分からない」に落とす (絞った回に勝手な解消を出さないため)。
  var AUDIT_HINTS = [
    { audit: 'svg', re: /svg|エクスポート|書き出/i },
    { audit: 'consistency', re: /メソッド|イベント|未使用|命名|語尾|粒度|クラス図/ },
    { audit: 'method', re: /メソッド|引数|戻り値|呼び先/ },
    { audit: 'name', re: /表記揺れ|綴り|宣言|別名/ },
    { audit: 'trace', re: /遷移|トレース|シーケンス図に/ },
    { audit: 'family', re: /系統|食い違い/ },
  ];

  function _auditsOf(finding) {
    var text = _s(finding && finding.heading) + '\n' + _s(finding && finding.body);
    var out = [];
    AUDIT_HINTS.forEach(function(h) {
      if (h.re.test(text) && out.indexOf(h.audit) < 0) out.push(h.audit);
    });
    return out;
  }

  // scope に入っていない指摘か。scope が空 (= 全部回した) なら常に false。
  function _outOfScope(finding, scope) {
    if (!scope || !scope.length) return false;
    var mine = _auditsOf(finding);
    // どの監査の話か当てられない指摘は、絞った回では判定しない。
    if (!mine.length) return true;
    for (var i = 0; i < mine.length; i++) {
      if (scope.indexOf(mine[i]) >= 0) return false;
    }
    return true;
  }

  // 突合行の kind ("consistency.events") がどの監査の物か。--only で絞った回に、
  // 回していない監査の行を「前回の突合から消えた」と読ませないために使う。
  function _outOfScopeKind(kind, scope) {
    if (!scope || !scope.length) return false;
    var audit = _s(kind).split('.')[0];
    if (!audit) return true;
    return scope.indexOf(audit) < 0;
  }

  // 図名の正規化。拡張子とフォルダを落とす。
  function docKey(name) {
    var s = _s(name).split(/[\\/]/).pop();
    return s.replace(/\.(puml|pu|plantuml|svg)$/i, '');
  }

  // ---- 指摘.md を読む ------------------------------------------------------

  // 指摘ではない節の見出し。reviewer は指摘.md の末尾に件数表と依頼一覧を置く。
  // これらの本文には「継続」「未着手」がふつうに現れるので、本文の言い回しで
  // 状態を決める前に弾かないと、件数表そのものが 1 件の指摘として振り分けられる。
  // BLK-reviewer-20260916-0629-friction: 相手の回答を待つ確認依頼の言い回し。監査の突合は
  // 図の中身しか見ないので、この種の指摘が突合に出ないことは解消を意味しない。
  var REQUEST_RE = /意図(?:の)?確認|確認依頼|確認を依頼|回答(?:待ち|が無|がな|を依頼|を求)|返答(?:待ち|が無|がな)/;

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
    if (_isPartial(src)) return 'partial';
    for (var j = 0; j < MARKS.length; j++) {
      if (MARKS[j].re.test(src)) return MARKS[j].status;
    }
    if (_isPartial(body)) return 'partial';
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
    // BLK-reviewer-20260916-0629-friction: 実物の指摘.md は「継続保留(4tick目)」とも書く。
    m = /(\d+)\s*tick\s*目/.exec(all);
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

  // ---- 自分が書いた節を読み返さない ----------------------------------------
  //
  // BLK-reviewer-20260917-0423-friction: --save-board は markdown() の本文をそのまま
  // 指摘.md へ書く。次の run はその指摘.md を「reviewer が手で書いた指摘」として
  // 読むので、`## 前回の指摘 — 継続（1 件）` という自分の見出しが 1 件の指摘の題名に、
  // その下の箇条書きが本文になる。出力は入れ子に潰れ (継続の箇条書きに別の見出し文言が
  // 並ぶ)、reviewer が手で書いた指摘と継続 tick 数 (13 tick 目) は消える。
  //
  // 直し方は 2 つとも要る。
  //   ・書くとき … 自動生成の塊を印で囲み、次の save はその塊だけを差し替える
  //                 (手で書いた指摘を消さない)
  //   ・読むとき … 印の中と、自分の見出しに当たる節を指摘として数えない
  //                 (印の無い、すでに壊れた指摘.md も同じ規則で読み直せる)
  var GEN_BEGIN = '<!-- review-board:auto ここから下は audit.js --board が書いた自動生成です。'
    + '手で書いた指摘はこの印より上に置いてください -->';
  var GEN_END = '<!-- /review-board:auto -->';

  // markdown() が出す節の見出し。手書きの指摘がこの言い回しになることはない
  // (「前回の指摘 — 継続（2 件）」のように件数の括弧まで揃って初めて当たる)。
  var GEN_HEADING_RE = new RegExp(
    '^(?:前回の指摘\\s*—\\s*.*|今回の新規|前回の突合にもあった.*|前回の突合から消えた|'
    + '前回控えから変わった図)（\\d+\\s*(?:件|枚)）$');

  function isGeneratedHeading(heading) {
    return GEN_HEADING_RE.test(_s(heading).trim());
  }

  // 自動生成の塊を落とす。印が閉じていなければ、印から後ろを全部落とす
  // (途中で書き込みが切れた指摘.md を、半分だけ指摘として読まない)。
  function stripGenerated(md) {
    var text = _s(md);
    var at = text.indexOf(GEN_BEGIN);
    while (at >= 0) {
      var end = text.indexOf(GEN_END, at);
      text = end < 0 ? text.slice(0, at)
        : text.slice(0, at) + text.slice(end + GEN_END.length);
      at = text.indexOf(GEN_BEGIN);
    }
    return text;
  }

  // 手で書いた部分 + 今回の自動生成。save のたびに塊だけが入れ替わる。
  function mergeIntoDoc(md, generated) {
    var kept = stripGenerated(md).replace(/\s*$/, '');
    var block = GEN_BEGIN + '\n\n' + _s(generated).replace(/\s*$/, '') + '\n\n' + GEN_END;
    return (kept ? kept + '\n\n' : '') + block + '\n';
  }

  // 指摘.md を `##` の見出し単位で 1 件ずつに割る。
  // サマリ・依頼のような「指摘ではない節」も落とさず持つ (状態は 'other')。
  // 自動生成の節は、印の中にあっても印が無くても指摘として数えない。
  function parseFindings(md) {
    var lines = stripGenerated(md).split(/\r?\n/);
    var out = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var h = /^##\s+(.*)$/.exec(lines[i]);
      if (h) {
        if (cur) out.push(cur);
        // 自分が書いた節は、その本文ごと読み飛ばす (次の見出しまで捨てる)。
        cur = isGeneratedHeading(h[1].trim()) ? null : { heading: h[1].trim(), body: [] };
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
    if (!keys.length && !finding.svgIssue) return { hit: onDoc, rest: [], keyHit: onDoc };

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
    // 名指しの語で当たった行と、図の出力物 (svg) だけで当たった行を分けて持つ。
    // 「本体は直ったが svg の書き出しだけが残っている」を出戻りと呼ばないため。
    return {
      hit: hit,
      rest: onDoc.filter(function(r) { return hit.indexOf(r) < 0; }),
      keyHit: hit.filter(byKey),
    };
  }

  // build({ board, findings, changedFiles })
  //   board        — audit-board.build() の結果 (今回の突合)
  //   findings     — parseFindings() の結果 (前回の指摘文書)、または指摘.md の本文
  //   changedFiles — 前回控えとの diff で「変わった」と出たファイル名の配列
  //   scope        — 今回回した監査名の配列 (--only の中身)。空 / 未指定は全部回した
  //   ledger       — findings.js の台帳の行 ({ id, title, docs, tick, ... })
  //   prevRows     — 前回の突合結果の行 (audit-board.build().rows)。渡されたときは
  //                  新規かどうかを行の実体 id だけで決める (指摘.md の書きぶりに依らない)
  function build(input) {
    var inp = input || {};
    var scope = _list(inp.scope).map(_s).filter(function(s) { return s !== ''; });
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
      // 見ていない監査の指摘は、突合行に当たる当たらない以前に判定できない。
      // 時計を進めず、前回の状態のまま据え置く。
      if (_outOfScope(f, scope)) {
        carried.push({ finding: f, verdict: 'outOfScope', tick: f.tick, rows: [],
          note: '今回は --only で ' + scope.join('・') + ' だけを回したので、この指摘は見ていません。'
            + '前回の状態 (' + (VERDICT_OF_STATUS[f.status] || f.status) + (f.tick ? ' ' + f.tick + ' tick 目' : '')
            + ') のままです' });
        return;
      }
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
        //
        // BLK-reviewer-20260914-2206: ただし「解消」の一言だけで出戻りと言い切ると、
        // 内容が前回から 1 文字も変わっていない継続まで「再発」に見える。出戻りと
        // 呼ばないのは次の 2 つ:
        //   ・前回を『部分解消』と書いた指摘 — 残ると書いた方に当たっただけ
        //   ・当たったのが図の出力物 (svg) の行だけ — 本体は消え、再エクスポート待ちが残っている
        var svgOnly = !m.keyHit.length && hit.every(function(r) {
          return _s(r.kind).indexOf('svg.') === 0;
        });
        var regressed = f.status === 'resolved' && !svgOnly;
        var tick = regressed ? 1 : (f.tick || 0) + 1;
        var note = '';
        if (regressed) note = '前回は解消と書いていますが、今回また当たっています';
        else if (f.status === 'partial') {
          note = '前回は部分解消 (直った所と残る所を書き分けた指摘) です。'
            + '残ると書いた方に当たっているので、出戻りではありません';
        } else if (f.status === 'resolved') {
          note = '前回は解消と書いた本体に当たっておらず、残っているのは図の出力物 (SVG) だけです。'
            + '再エクスポート待ちの継続で、出戻りではありません';
        }
        carried.push({ finding: f, verdict: 'carried', tick: tick, atLeast: f.atLeast, rows: hit,
          regressed: regressed, svgOnly: svgOnly, note: note });
      } else if (REQUEST_RE.test(_s(f.heading) + ' ' + _s(f.body))) {
        // BLK-reviewer-20260916-0629-friction: 本文中の確認依頼 (意図の確認など) は、監査の
        // どの種類 (名前・メソッド・整合・SVG…) の突合にも出ない。出ないことは解消を意味しない。
        carried.push({ finding: f, verdict: 'notAudited', tick: f.tick, rows: [],
          note: '監査の突合が扱う種類の指摘ではないため、突合に出ないことは解消を意味しません。'
            + '前回の状態 (' + (VERDICT_OF_STATUS[f.status] || f.status) + (f.tick ? ' ' + f.tick + ' tick 目' : '')
            + ') のまま据え置きます。回答の有無は `node tools/replies.js` で見られます' });
      } else {
        carried.push({ finding: f, verdict: 'resolved', tick: f.tick, rows: [],
          note: '今回の突合に出ていません' });
      }
    });

    // BLK-reviewer-20260914-2206 (差し戻し 1 回目): ここまでの突き合わせは
    // 指摘.md の自然文 (図名とバッククォートで囲った語) しか手がかりに出来ない。
    // 同じ欠陥が別の図に広がっただけの行は、図名で当たらず名指しの語もバッククォートで
    // 囲まれていなければ「今回の新規」に落ちる (実データの F-01 ClockCtrl.EnableClock が
    // adc / can_init_sequence.puml に出た回がこれ)。
    // findings.js (finding-tracker) は同じ欠陥を図に依らない実体 id 1 つで追っていて、
    // そちらが同一性の正。台帳を渡されたときは、まずその実体で当ててから新規を数える。
    _list(inp.ledger).forEach(function(L) {
      var parts = _s(L.title).split('.').map(function(p) { return _s(p).trim(); })
        .filter(function(p) { return p.length >= 2; });
      if (!parts.length) return;
      var wantDocs = _list(L.docs).map(docKey).filter(function(d) { return d !== ''; });
      var hit = rows.filter(function(r, i) {
        if (covered[i]) return false;
        var text = (_s(r.title) + ' ' + _s(r.detail)).toLowerCase();
        var all = parts.every(function(p) { return text.indexOf(p.toLowerCase()) >= 0; });
        if (!all) return false;
        // 主語と目的語が揃っている台帳行 (ClockCtrl.EnableClock) は語だけで当ててよい。
        // 1 語しか無い台帳行は当たりが緩すぎるので、図名まで一致したときだけ当てる。
        if (parts.length >= 2) return true;
        var rd = _rowDocs(r);
        return rd.some(function(d) { return wantDocs.indexOf(d) >= 0; });
      });
      if (!hit.length) return;
      hit.forEach(function(r) { covered[rows.indexOf(r)] = true; });
      var spread = hit.filter(function(r) {
        return _rowDocs(r).some(function(d) { return wantDocs.indexOf(d) < 0; });
      });
      carried.push({
        finding: { title: (L.id ? L.id + ' ' : '') + _s(L.title), docs: wantDocs,
                   since: _s(L.since), status: 'carried', keys: parts },
        verdict: 'ledger', tick: L.tick || 0, atLeast: !!L.atLeast, rows: hit,
        ledgerId: _s(L.id), ledgerStatus: _s(L.status),
        note: 'findings.js の台帳が追っている同じ指摘です'
          + (spread.length ? '。うち ' + spread.length + ' 件は台帳に載っていない図への再掲で、'
             + '新規の問題ではありません' : ''),
      });
    });

    // BLK-reviewer-20260914-2206 (差し戻し 1 回目の芯): ここまでの突き合わせは、
    // 前回の指摘.md に「書かれている」ことを新規でない条件にしている。reviewer が
    // 書き落とした指摘 (実データでは整合/イベント 24 件) は、前回も今回も同じように
    // 突合に出ているのに毎回「今回の新規」に落ち、毎 run 手で裏取りする羽目になる。
    // 経路を 1 つずつ塞いでも次の run で別経路に出ていたのはここが根で、
    // 自然文から同一性を組み立て直している限り止まらない。
    //
    // 前回の突合結果そのもの (同じ対象で採った控えから組み直した行) を渡されたら、
    // 新規かどうかは実体 id — findings.js が継続を数えるのと同じ id — だけで決める。
    // 前回にも同じ実体があった行は、指摘.md に書かれていなくても新規ではない。
    var prevRows = _list(inp.prevRows);
    var prevByEntity = {};
    prevRows.forEach(function(r) {
      var e = _s(r && r.entity);
      if (e && !prevByEntity[e]) prevByEntity[e] = r;
    });
    var hasPrev = Object.keys(prevByEntity).length > 0;

    var uncovered = rows.filter(function(r, i) { return !covered[i]; });
    // 前回の突合にも同じ実体があった行。指摘文書に書かれていないだけで、新規ではない。
    var seen = hasPrev ? uncovered.filter(function(r) {
      return _s(r.entity) && prevByEntity[_s(r.entity)];
    }) : [];
    var seenSet = {};
    seen.forEach(function(r) { seenSet[rows.indexOf(r)] = true; });
    var fresh = uncovered.filter(function(r) { return !seenSet[rows.indexOf(r)]; });

    // 前回の突合にあって今回は出ていない実体。指摘.md に書いていないものも
    // ここで見えるので、「解消したのか、見ていないだけなのか」を手で確かめ直さずに済む。
    var nowEntities = {};
    rows.forEach(function(r) { if (_s(r.entity)) nowEntities[_s(r.entity)] = true; });
    var gone = hasPrev ? Object.keys(prevByEntity).filter(function(e) {
      return !nowEntities[e] && !_outOfScopeKind(_s(prevByEntity[e].kind), scope);
    }).map(function(e) { return prevByEntity[e]; }) : [];
    gone.sort(function(x, y) {
      var a = _s(x.doc) + _s(x.title), b = _s(y.doc) + _s(y.title);
      return a < b ? -1 : (a > b ? 1 : 0);
    });

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
      // 指摘.md には書かれていないが、前回の突合にも同じ実体があった行 / 前回だけにあった実体。
      seen: seen,
      gone: gone,
      hasPrevRows: hasPrev,
      changedFiles: changed,
      scope: scope,
      counts: {
        carried: carried.filter(function(c) { return c.verdict === 'carried'; }).length,
        // findings.js の台帳で当たった継続。継続の内数として数える
        // (--board と findings.js で「新規」の数が食い違わないための 1 行)。
        ledger: carried.filter(function(c) { return c.verdict === 'ledger'; }).length,
        // 本当の出戻り。読み直しが要るのはここだけ (継続との区別が付かないと全件読む羽目になる)。
        regressed: carried.filter(function(c) { return c.regressed; }).length,
        resolved: carried.filter(function(c) { return c.verdict === 'resolved'; }).length,
        // 今回回していない監査の指摘。解消にも継続にも数えない。
        outOfScope: carried.filter(function(c) { return c.verdict === 'outOfScope'; }).length,
        // 突合の対象外 (確認依頼など)。解消にも継続にも数えない。
        notAudited: carried.filter(function(c) { return c.verdict === 'notAudited'; }).length,
        sameDoc: carried.filter(function(c) { return c.verdict === 'sameDoc'; }).length,
        unmatched: carried.filter(function(c) { return c.verdict === 'unmatched'; }).length,
        fresh: fresh.length,
        // 前回の突合にもあった行 (実体 id で一致)。新規には数えない。
        seen: seen.length,
        // 前回の突合にあって今回は出ていない実体。
        gone: gone.length,
        changed: changed.length,
      },
    };
  }

  // 最長の継続 tick 数。「いちばん放置されている指摘」を先に読むための目印。
  function longestCarry(view) {
    var max = 0, item = null;
    _list(view && view.carried).forEach(function(c) {
      if ((c.verdict === 'carried' || c.verdict === 'ledger') && c.tick > max) { max = c.tick; item = c; }
    });
    return item ? { tick: max, title: item.finding.title } : null;
  }

  function summaryLine(view) {
    var c = (view && view.counts)
      || { carried: 0, ledger: 0, resolved: 0, fresh: 0, sameDoc: 0, unmatched: 0, changed: 0,
           regressed: 0, outOfScope: 0, seen: 0, gone: 0 };
    // 台帳で当たった継続も継続に数える。ここを分けて出すと、findings.js が
    // 「継続 6 / 新規 0」と言っている回に --board だけが「新規 2」と言う。
    var s = '継続 ' + (c.carried + (c.ledger || 0));
    // 出戻りは継続の内数。0 件なら書かない (毎回出る数字は読み飛ばされる)。
    if (c.regressed) s += '（うち出戻り ' + c.regressed + '）';
    s += ' / 解消 ' + c.resolved + ' / 新規 ' + c.fresh + ' 件';
    var re = [];
    // 前回の突合にもあった行。「指摘.md に書き落としただけ」を新規と呼ばないための 1 語。
    if (c.seen) re.push('前回の突合にもあり ' + c.seen + ' 件');
    if (c.gone) re.push('前回の突合から消えた ' + c.gone + ' 件');
    if (c.sameDoc) re.push('同じ図に別の指摘 ' + c.sameDoc + ' 件');
    if (c.unmatched) re.push('要読み直し ' + c.unmatched + ' 件');
    if (c.outOfScope) re.push('今回は見ていない ' + c.outOfScope + ' 件');
    if (c.notAudited) re.push('突合の対象外で判定できない ' + c.notAudited + ' 件');
    if (re.length) s += '（' + re.join('・') + '）';
    s += '、前回控えから変わった図 ' + c.changed + ' 枚';
    if (c.ledger) s += '（うち findings.js の台帳で追跡中 ' + c.ledger + '）';
    var l = longestCarry(view);
    if (l) s += '。最長の継続は「' + l.title + '」' + l.tick + ' tick 目';
    return s;
  }

  var VERDICT = { carried: '継続', ledger: '継続（findings.js の台帳で追跡中）',
                  resolved: '解消', sameDoc: '同じ図に別の指摘', unmatched: '要読み直し',
                  outOfScope: '今回は見ていない (スコープ外)',
                  notAudited: '突合の対象外で判定できない (本文を読む)' };

  // 1 枚の常設ビュー。そのまま次の指摘.md の下敷きになる形で出す。
  function markdown(view, title) {
    var v = view || { carried: [], fresh: [], changedFiles: [] };
    var out = ['# ' + (_s(title) || 'レビュー結果'), '', summaryLine(v), ''];
    // 絞って回した回は、その旨を画面の頭で言う (解消の少なさを実態と読み違えないため)。
    if (_list(v.scope).length) {
      out.push('※ 今回は `--only ' + v.scope.join(',') + '` で回しています。'
        + 'ここに出ていない監査の指摘は「今回は見ていない」として前回の状態のまま据え置きです。', '');
    }

    var order = ['carried', 'ledger', 'sameDoc', 'unmatched', 'outOfScope', 'notAudited', 'resolved'];
    order.forEach(function(kind) {
      var items = _list(v.carried).filter(function(c) { return c.verdict === kind; });
      if (!items.length) return;
      out.push('## 前回の指摘 — ' + VERDICT[kind] + '（' + items.length + ' 件）');
      items.forEach(function(c) {
        var head = '- ' + c.finding.title;
        if ((kind === 'outOfScope' || kind === 'notAudited') && c.tick) head += '（前回のまま ' + c.tick + ' tick 目）';
        if (kind === 'ledger' && c.tick) head += '（' + c.tick + ' tick 目' + (c.atLeast ? '以上' : '') + '）';
        if (kind === 'carried') {
          head += '（' + c.tick + ' tick 目' + (c.atLeast ? '以上' : '') + '）';
          // 読み直しが要る 1 件を、行の頭で見分けられるようにする。
          if (c.regressed) head += '（出戻り）';
          else if (c.svgOnly) head += '（SVG 再エクスポート待ち）';
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
      if (v.hasPrevRows) {
        out.push('  - 前回の突合結果に同じ実体が無かった行だけです'
          + '（findings.js と同じ実体 id で判定。指摘.md の書きぶりでは決めていません）');
      }
      v.fresh.forEach(function(r) {
        out.push('- [' + _s(r.doc) + '] ' + _s(r.category) + ' ' + _s(r.title) + ' — ' + _s(r.detail));
      });
      out.push('');
    }

    // 前回も今回も出ている行。指摘.md に書き落としていても新規ではない、と
    // 名指しで言い切る (書き落としに気付く場でもある)。
    if (_list(v.seen).length) {
      out.push('## 前回の突合にもあった（指摘.md には書かれていません。新規ではありません）（'
        + v.seen.length + ' 件）');
      v.seen.forEach(function(r) {
        out.push('- [' + _s(r.doc) + '] ' + _s(r.category) + ' ' + _s(r.title));
      });
      out.push('');
    }

    if (_list(v.gone).length) {
      out.push('## 前回の突合から消えた（' + v.gone.length + ' 件）');
      v.gone.forEach(function(r) {
        out.push('- [' + _s(r.doc) + '] ' + _s(r.category) + ' ' + _s(r.title));
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
    GEN_BEGIN: GEN_BEGIN, GEN_END: GEN_END,
    isGeneratedHeading: isGeneratedHeading,
    stripGenerated: stripGenerated, mergeIntoDoc: mergeIntoDoc,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.reviewBoard = api;
  }
})();
