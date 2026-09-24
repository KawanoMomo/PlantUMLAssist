'use strict';

// audit-board — プロジェクト 1 つ分の突合結果を「1 画面の指摘一覧」にする。
//
// BLK-reviewer-20260908-1403-wish: 突合そのものは name-audit / consistency /
// family-audit / trace-coverage / svg-freshness / manual-findings が既に持っている。
// ただし出口が別々のモーダルに分かれているので、13 枚を 1 プロジェクトとして
// 横断で見るには reviewer が node で audit.js を叩き、JSON をその場のスクリプトで
// 並べ替えるしかなかった (run のたびにそのスクリプトを保守することになる)。
//
// ここは各突合の結果を受け取り、「どの図の・何が・なぜ指摘か」を同じ形の行に
// 揃えて 1 本の一覧にする。カテゴリ (名前の不一致 / 未使用 participant / 粒度の
// ばらつき / SVG 実体不一致 / 手動指摘) と図名の 2 通りで数え、そのまま
// 指摘.md に貼れる markdown も出す。
//
// 突合そのものはここでは行わない (どのモジュールが何を見るかは各モジュールの職掌)。
// DOM にもサーバにも触らない。描画と結線は app.js。node からも require できる。
(function() {

  // 表示順と呼び名。audit-timeline の CATEGORY と同じ言葉づかいにする
  // (履歴の帯と一覧で名前が違うと、同じ指摘が別物に見える)。
  var KINDS = [
    { kind: 'name.variants', label: '名前/表記揺れ' },
    { kind: 'name.undeclared', label: '名前/宣言なし' },
    { kind: 'consistency.naming', label: '整合/命名' },
    { kind: 'consistency.unused', label: '整合/未使用' },
    { kind: 'consistency.methods', label: '整合/メソッド' },
    { kind: 'consistency.events', label: '整合/イベント' },
    { kind: 'consistency.granularity', label: '整合/粒度' },
    { kind: 'family.mismatches', label: '系統/食い違い' },
    { kind: 'trace.missing', label: 'トレース/漏れ' },
    { kind: 'method.issues', label: 'メソッド' },
    { kind: 'svg.differ', label: '出力物/SVG 内容ずれ' },
    { kind: 'svg.missing', label: '出力物/SVG 無' },
    { kind: 'svg.stale', label: '出力物/SVG 古' },
    { kind: 'manual', label: '手動指摘' },
  ];

  var LABEL = {};
  var ORDER = {};
  KINDS.forEach(function(k, i) { LABEL[k.kind] = k.label; ORDER[k.kind] = i; });

  // 図をまたぐ指摘 (表記揺れなど) の図名。1 枚に絞れないものは空にせず、
  // 「どこを直せばよいか分からない行」にならないよう、この印で束ねる。
  var CROSS = '(図をまたぐ)';

  function _s(v) { return v == null ? '' : String(v); }

  function _list(v) { return Array.isArray(v) ? v : []; }

  // BLK-reviewer-20260914-2206 (差し戻し 1 回目): 行 1 件の「実体 id」。
  // 同じ欠陥が別の図に出ても、カテゴリの箱が移っても同じ文字列になる id は
  // audit-timeline が既に持っており (findings.js の継続追跡もこれで数える)、
  // 同一性の正はそちら。ここで行に貼っておくと、前回の突合結果と今回を
  // 突き合わせる側 (review-board) が指摘.md の自然文を読まずに新規を決められる。
  function _timeline() {
    if (typeof window !== 'undefined' && window.MA && window.MA.auditTimeline) return window.MA.auditTimeline;
    if (typeof require === 'function') { try { return require('./audit-timeline.js'); } catch (e) {} }
    return null;
  }

  // 出力物の行は「その図の出力物」が実体。無・古・内容ずれは同じ図の同じ話が
  // 箱を移っているだけなので、3 つとも同じ実体 id にする
  // (箱が移った回を「解消 + 新規」と読ませない)。
  var ENTITY_KIND = { 'svg.differ': 'svg.stale', 'svg.missing': 'svg.stale' };

  function _entity(kind, item) {
    var tl = _timeline();
    if (!tl || !item) return '';
    try { return _s(tl.entityId(ENTITY_KIND[kind] || kind, item)); } catch (e) { return ''; }
  }

  function _docsOf(v) {
    return _list(v).map(_s).filter(function(s) { return s !== ''; });
  }

  // 図名は 1 枚に絞れたときだけ入れる。絞れないものは CROSS。
  function _oneDoc(docs) {
    var d = _docsOf(docs);
    return d.length === 1 ? d[0] : CROSS;
  }

  function _row(kind, doc, title, detail, docs, ref) {
    return {
      kind: kind, category: LABEL[kind] || kind,
      doc: _s(doc) || CROSS, title: _s(title), detail: _s(detail),
      docs: _docsOf(docs && docs.length ? docs : (_s(doc) && _s(doc) !== CROSS ? [doc] : [])),
      line: ref && ref.line ? ref.line : 0,
      // 実体 id (findings.js と同じ同一性)。突合結果が元の項目を渡していない
      // 呼び出し (古いテスト・手で組んだ board) では空文字になり、
      // 受け取る側は「id で突き合わせられない行」として扱う。
      entity: _entity(kind, ref && ref.item),
      // 「読み直さなくてよい」と分かっている手動指摘。件数からは外して数える
      // (0 件になったのか、見ないことにしただけなのかを潰さない)。
      keep: !!(ref && ref.keep),
      // BLK-reviewer-20260923-2012-wish (差し戻し 1 回目): note の自由文で答えてある組の印。
      // --board が「継続」ではなく「タグ化待ち」に別掲するのに使う。
      noteReply: ref && ref.item && ref.item.noteReply ? ref.item.noteReply : null,
    };
  }

  function _ok(a) { return !!(a && a.status === 'ok' && a.result); }

  // ---- 各突合 → 行 ---------------------------------------------------------

  function _fromName(res, out) {
    _list(res.variants).forEach(function(v) {
      var names = _list(v.members).map(function(m) { return _s(m.name); });
      var docs = [];
      _list(v.members).forEach(function(m) {
        _docsOf(m.docs).forEach(function(d) { if (docs.indexOf(d) < 0) docs.push(d); });
      });
      out.push(_row('name.variants', _oneDoc(docs), _s(v.suggested),
        names.join(' / ') + ' が同じ物を指しています。多数派は ' + _s(v.suggested), docs,
        { item: v }));
    });
    _list(res.undeclared).forEach(function(u) {
      var docs = _docsOf(u.docs);
      out.push(_row('name.undeclared', _oneDoc(docs), _s(u.name),
        '矢印にだけ現れ、宣言がありません', docs, { item: u }));
    });
  }

  // BLK-reviewer-20260923-2012-wish: タグは無いが note の自由文で答えている組
  // (omit-method.markNotes が noteReply を付けたもの) は、どの note で答えたかを
  // 理由の後ろに書く。reviewer が puml を開いて note を読み直さずに済むように。
  function _noteSuffix(it) {
    var n = it && it.noteReply;
    if (!n) return '';
    return '（自由文で応答あり(タグ化待ち): ' + _s(n.doc) + (n.line ? ' ' + n.line + ' 行' : '')
      + ' の note「' + _s(n.reason) + '」）';
  }

  function _fromConsistency(res, out) {
    _list(res.naming).forEach(function(n) {
      var docs = _docsOf(n.docs);
      out.push(_row('consistency.naming', _oneDoc(docs), _s(n.name),
        '語尾 ' + _s(n.suffix) + ' は少数派です。多数派は ' + _s(n.expected), docs, { item: n }));
    });
    _list(res.unused).forEach(function(u) {
      out.push(_row('consistency.unused', _s(u.doc), _s(u.name),
        'participant として宣言されていますが、どの矢印にも出てきません', null, { item: u }));
    });
    _list(res.methods).forEach(function(m) {
      out.push(_row('consistency.methods', _s(m.doc), _s(m.target) + '.' + _s(m.method),
        'シーケンスで呼んでいますが、クラス図の ' + _s(m.target) + ' にこのメソッドがありません'
        + _noteSuffix(m),
        null, { item: m }));
    });
    _list(res.events).forEach(function(e) {
      out.push(_row('consistency.events', _oneDoc(e.docs), _s(e.event),
        '状態遷移のイベントに対応するメソッドが ' + (_s(e.cls) || _s(e.owner) || 'クラス図') + ' にありません',
        e.docs, { item: e }));
    });
    _list(res.granularity).forEach(function(g) {
      out.push(_row('consistency.granularity', _s(g.onlyIn), _s(g.label),
        '系統 ' + _s(g.family) + ' のうち ' + _s(g.onlyIn) + ' にしかありません', null, { item: g }));
    });
  }

  function _fromFamily(res, out) {
    _list(res).forEach(function(f) {
      if (!f.comparable) return;
      _list(f.mismatches).forEach(function(m) {
        out.push(_row('family.mismatches', _s(m.onlyIn), _s(m.label || m.key),
          '系統 ' + _s(f.key) + ' の片方 (' + _s(m.onlyIn) + ') にしかありません', null,
          { item: { family: f.family || f.key || f.name, key: m.key, label: m.label } }));
      });
    });
  }

  function _fromTrace(res, out) {
    _list(res).forEach(function(g) {
      _list(g.missing).forEach(function(m) {
        out.push(_row('trace.missing', _s(m.docName), _s(m.from) + ' → ' + _s(m.to),
          '系統 ' + _s(g.key) + ' の遷移 ' + (_s(m.label) || '(名前なし)')
          + ' がシーケンス図に現れません', [m.docName],
          { line: m.line, item: { family: g.family || g.key || g.name, from: m.from, to: m.to, label: m.label || m.event } }));
      });
    });
  }

  function _fromMethod(res, out) {
    _list(res.issues).forEach(function(i) {
      out.push(_row('method.issues', _oneDoc(i.docs), _s(i.owner || i.cls) + '.' + _s(i.method),
        (_s(i.kind) === 'no-method'
          ? 'クラス図に定義がありません'
          : 'メソッド突合で ' + _s(i.kind) + ' として挙がっています') + _noteSuffix(i), i.docs, { item: i }));
    });
  }

  // BLK-reviewer-20260915-0606: 内容で追いついていると分かった図 (一致 / 体裁差) は
  // 作り直しが要らないので、mtime が古くても指摘にしない (svg-freshness.isSettled と
  // 同じ線。ここは MA に依存しないモジュールなので、判定の言葉だけを写す)。
  function _settled(content) { return content === 'match' || content === 'format'; }

  // svg-freshness.scan() の結果。内容ずれ (differ) は mtime の新旧に関わらず出す
  // (中身が食い違う図は、印が新しくても読める図ではない)。
  function _fromSvg(scan, out) {
    _list(scan && scan.rows).forEach(function(r) {
      var name = _s(r.name);
      if (!name) return;
      if (r.content === 'differ') {
        out.push(_row('svg.differ', name, name, '保存中の SVG の中身が今の図と食い違います',
          null, { item: { name: name } }));
        return;
      }
      if (r.status === 'missing') {
        out.push(_row('svg.missing', name, name, 'SVG が書き出されていません',
          null, { item: { name: name } }));
      } else if (r.status === 'stale' && !_settled(r.content)) {
        out.push(_row('svg.stale', name, name, 'SVG が図より古いままです',
          null, { item: { name: name } }));
      }
    });
  }

  // manual-findings.review() の結果。未変更 (keep) の行も載せるが、件数は分ける。
  function _fromManual(rows, out) {
    _list(rows).forEach(function(r) {
      out.push(_row('manual', _s(r.doc), _s(r.text),
        _s(r.label) + (r.line ? '（' + r.line + ' 行目）' : ''), [r.doc],
        { line: r.line, keep: r.keep, item: { doc: _s(r.doc), text: _s(r.text) } }));
    });
  }

  // ---- 組み立て ------------------------------------------------------------

  // input: { audits: {name,method,consistency,family,trace}, svg: scan, findings: rows }
  // audits は app.js の _atRunAudits() がそのまま渡せる形 ({status:'ok', result}).
  function build(input) {
    var inp = input || {};
    var a = inp.audits || {};
    var rows = [];

    if (_ok(a.name)) _fromName(a.name.result, rows);
    if (_ok(a.consistency)) _fromConsistency(a.consistency.result, rows);
    // 粒度は consistency が family-audit を畳んで出す。両方が来たときに
    // 同じ食い違いを 2 行にしない (数が倍に見えると図を疑う羽目になる)。
    if (!_ok(a.consistency) && _ok(a.family)) _fromFamily(a.family.result, rows);
    if (_ok(a.trace)) _fromTrace(a.trace.result, rows);
    // メソッドは consistency/methods と重なる。consistency を見ているなら出さない。
    if (!_ok(a.consistency) && _ok(a.method)) _fromMethod(a.method.result, rows);
    _fromSvg(inp.svg, rows);
    _fromManual(inp.findings, rows);

    rows.sort(function(x, y) {
      if (ORDER[x.kind] !== ORDER[y.kind]) return ORDER[x.kind] - ORDER[y.kind];
      if (x.doc !== y.doc) return x.doc < y.doc ? -1 : 1;
      return x.title < y.title ? -1 : (x.title > y.title ? 1 : 0);
    });

    return {
      rows: rows,
      byCategory: countBy(rows, 'kind'),
      byDoc: countByDoc(rows),
      total: rows.length,
      // 前回判定を維持してよい手動指摘。今日読む行の数はここを引いた分。
      keep: rows.filter(function(r) { return r.keep; }).length,
      // 見た突合の名前。見ていない突合は 0 件と区別する。
      seen: seenKinds(inp),
    };
  }

  function countBy(rows, field) {
    var byKey = {}, order = [];
    _list(rows).forEach(function(r) {
      var k = _s(r[field]);
      if (!byKey[k]) { byKey[k] = { key: k, label: field === 'kind' ? (LABEL[k] || k) : k, count: 0, keep: 0 }; order.push(k); }
      byKey[k].count++;
      if (r.keep) byKey[k].keep++;
    });
    if (field === 'kind') order.sort(function(x, y) { return ORDER[x] - ORDER[y]; });
    else order.sort(function(x, y) { return x < y ? -1 : (x > y ? 1 : 0); });
    return order.map(function(k) { return byKey[k]; });
  }

  // 図ごとの件数。図をまたぐ指摘は、またいでいる図それぞれに数える
  // (「この図で絞る」で図をまたぐ指摘が消えると、絞った側からは無かったことになる)。
  function countByDoc(rows) {
    var byKey = {}, order = [];
    _list(rows).forEach(function(r) {
      var keys = r.docs && r.docs.length ? r.docs : [r.doc];
      keys.forEach(function(k) {
        if (!byKey[k]) { byKey[k] = { key: k, label: k, count: 0, keep: 0 }; order.push(k); }
        byKey[k].count++;
        if (r.keep) byKey[k].keep++;
      });
    });
    order.sort(function(x, y) { return x < y ? -1 : (x > y ? 1 : 0); });
    return order.map(function(k) { return byKey[k]; });
  }

  // 「この run で見た突合」。結果が来なかったものは載せない。
  function seenKinds(inp) {
    var a = (inp && inp.audits) || {};
    var out = [];
    if (_ok(a.name)) out.push('名前');
    if (_ok(a.consistency)) out.push('整合');
    if (_ok(a.family) || _ok(a.consistency)) out.push('系統');
    if (_ok(a.trace)) out.push('トレース');
    if (inp && inp.svg && Array.isArray(inp.svg.rows)) out.push('出力物');
    if (inp && Array.isArray(inp.findings)) out.push('手動指摘');
    return out;
  }

  // 一覧の絞り込み。kind / doc のどちらか、または両方。
  function filter(board, opts) {
    var o = opts || {};
    var kind = _s(o.kind), doc = _s(o.doc);
    return _list(board && board.rows).filter(function(r) {
      if (kind && r.kind !== kind) return false;
      if (doc && r.doc !== doc && r.docs.indexOf(doc) < 0) return false;
      return true;
    });
  }

  function summaryLine(board) {
    var b = board || { total: 0, keep: 0, byDoc: [], seen: [] };
    if (!b.total) {
      return b.seen && b.seen.length
        ? b.seen.join('・') + ' を見て、指摘はありません'
        : 'まだ何も突き合わせていません';
    }
    var docs = _list(b.byDoc).filter(function(d) { return d.key !== CROSS; }).length;
    var s = b.total + ' 件 / ' + docs + ' 枚';
    if (b.keep) s += '（うち前回判定を維持 ' + b.keep + ' 件）';
    return s;
  }

  // 指摘.md に貼る形。カテゴリ見出し → 図名つきの箇条書き。
  function markdown(board, title) {
    var b = board || { rows: [] };
    var out = ['# ' + (_s(title) || '突合ダッシュボード'), '', summaryLine(b), ''];
    _list(b.byCategory).forEach(function(c) {
      out.push('## ' + c.label + '（' + c.count + ' 件）');
      filter(b, { kind: c.key }).forEach(function(r) {
        out.push('- [' + r.doc + '] ' + r.title + ' — ' + r.detail);
      });
      out.push('');
    });
    return out.join('\n');
  }

  var api = {
    KINDS: KINDS, LABEL: LABEL, CROSS: CROSS,
    build: build, filter: filter, countBy: countBy, countByDoc: countByDoc,
    summaryLine: summaryLine, markdown: markdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.auditBoard = api;
  }
})();
