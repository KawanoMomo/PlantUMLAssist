'use strict';
window.MA = window.MA || {};

// handover-board — 「この 14 枚を新人に渡してよいか」を 1 画面で言い切る表。
//
// BLK-primary-20260917-0323-wish: 統一を終えた 14 枚を junior が引き継げる状態か
// 確かめる工程が、別々の操作の積み重ねになっていた。置換の残りは ⇄ 一括置換の
// 履歴を開いて読み、note の鮮度は図を 1 枚ずつ開いて本文を目で読み、SVG が
// 今の puml から作られたものかは 📂 一覧の印を見る。3 つの答えが 3 つの画面に
// 散っているので、14 枚ぶんの確認が枚数 × 画面数の操作になり、しかも
// 「どれを確かめ終えたか」はどこにも残らない (前回は driver_common_class を
// 個別に開いて本文を読み直している)。
//
// ここが作るのは 1 行 = 1 図の表。列は引き継ぎの合否を決める 4 つだけ:
//   置換済み — 本文に旧称が残っていないか (残っていれば件数)
//   note最新 — note 行に旧称が残っていないか (note が無い図は「note 無」で、赤にしない)
//   SVG最新  — その図の svg が今の puml から作られているか (判定は svg-freshness)
//   指摘     — 指摘.md がこの図を名指ししているか (符合する欠落。判定は review-note)
// この 4 つが揃った行だけが「渡せる」。揃わない行は渡す前に見る行として赤くする。
//
// 鮮度を日付で測らないのは、この業務の note が古びる理由が時刻ではなく
// 「統一前の名前を書いたまま残っている」ことだから。日付印は図に無く、
// 有っても人が打ち直す物なので、本文そのものを根拠にする。
//
// DOM にも fetch にも触らない。材料を集めるのと描くのは app.js の職掌。
window.MA.handoverBoard = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 渡せない行の理由を並べる順 (画面の列と同じ順で読める)。
  var COLS = ['rename', 'note', 'svg', 'gap'];

  // svg-freshness の内容判定 → 引き継ぎの可否。
  //   match / format は「今の puml から作られている」ので可。
  //   differ / missing は作り直しが要る。
  //   unverified と判定なしは分からない — 分からないものを「済」と言わない。
  var SVG_OK = { match: 1, format: 1 };
  var SVG_NG = { differ: 1, missing: 1 };
  var SVG_LABEL = {
    match: '最新', format: '最新（体裁差）', differ: '作り直し',
    missing: 'SVG 無', unverified: '未確認', unknown: '未確認',
  };

  // note として読む行。浮いた note も掛ける note も、複数行 note の中身も拾う。
  function noteLines(dsl) {
    var lines = _s(dsl).split('\n');
    var out = [];
    var inBlock = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (inBlock) {
        if (/^end\s*(note|legend|hnote|rnote)\b/i.test(t)) { inBlock = false; continue; }
        out.push(lines[i]);
        continue;
      }
      if (/^(note|hnote|rnote|legend)\b/i.test(t)) {
        // `note ... : 本文` は 1 行、`:` が無ければブロックの始まり。
        if (t.indexOf(':') >= 0) out.push(lines[i]);
        else inBlock = true;
      }
    }
    return out;
  }

  // 旧称の出現数。語の途中に埋もれた綴り (Spi_Driver の中の SpiDrv 等) は
  // 数えない — 置換後の名前を「残っている」と言うと表が嘘をつく。
  function countName(text, name) {
    var n = _s(name);
    if (!n) return 0;
    var esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(^|[^A-Za-z0-9_])' + esc + '($|[^A-Za-z0-9_])', 'g');
    var body = _s(text);
    var c = 0;
    var m;
    while ((m = re.exec(body)) !== null) {
      c++;
      re.lastIndex = m.index + m[0].length - (m[2] ? m[2].length : 0);
    }
    return c;
  }

  function _countAll(text, froms) {
    var total = 0;
    (froms || []).forEach(function(f) { total += countName(text, f); });
    return total;
  }

  // ── 列ごとの判定 ──────────────────────────────────────────────────────────

  // note の外 = ⇄ 一括置換が当たる範囲 (宣言・参加者・関係・呼び出し)。
  // note の散文は置換の対象にならないので、ここで数えると 2 つの列が
  // 同じことを言い、「置換は済んだが note だけ古い」図を名指しできなくなる。
  function bodyOutsideNotes(dsl) {
    var notes = {};
    noteLines(dsl).forEach(function(l) { notes[l] = (notes[l] || 0) + 1; });
    return _s(dsl).split('\n').filter(function(l) {
      if (notes[l]) { notes[l]--; return false; }
      return true;
    }).join('\n');
  }

  function renameCell(text, froms) {
    if (typeof text !== 'string') return { state: 'unknown', count: 0, label: '未確認' };
    var n = _countAll(bodyOutsideNotes(text), froms);
    if (!(froms || []).length) return { state: 'unknown', count: 0, label: '未確認' };
    return n === 0
      ? { state: 'done', count: 0, label: '置換済み' }
      : { state: 'left', count: n, label: '旧称 ' + n + ' 件' };
  }

  function noteCell(text, froms) {
    if (typeof text !== 'string') return { state: 'unknown', count: 0, label: '未確認' };
    var lines = noteLines(text);
    if (!lines.length) return { state: 'none', count: 0, label: 'note 無' };
    var n = _countAll(lines.join('\n'), froms);
    return n === 0
      ? { state: 'fresh', count: 0, label: 'note 最新' }
      : { state: 'stale', count: n, label: 'note に旧称 ' + n + ' 件' };
  }

  function svgCell(status) {
    var s = _s(status) || 'unknown';
    var label = SVG_LABEL[s] || '未確認';
    var state = SVG_OK[s] ? 'ok' : (SVG_NG[s] ? 'ng' : 'unknown');
    return { state: state, basis: s, count: 0, label: label };
  }

  // 指摘.md がこの図を名指ししている件。前置き (summary/依頼) は数えない。
  function gapCell(name, findings) {
    var hits = [];
    (findings || []).forEach(function(f) {
      if (!f || f.preamble) return;
      var docs = f.docs || [];
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        var dn = _s(d && typeof d === 'object' ? d.name : d);
        if (dn && dn === name) {
          hits.push(_s(f.heading) || _s(f.title) || ('指摘 ' + _s(f.index)));
          return;
        }
      }
    });
    return hits.length
      ? { state: 'hit', count: hits.length, titles: hits,
          label: '指摘 ' + hits.length + ' 件' }
      : { state: 'clear', count: 0, titles: [], label: '符合なし' };
  }

  // 相手の同名図 (BLK-primary-20260924-1432-wish)。渡す相手 (読むだけのフォルダ) を選んだときだけ出る 5 列目。
  // 判定は並べて比較の対応表 (state-map / class-map の build) の戻りをそのまま数える。ここで新しい
  // 突き合わせ規則は書かない。数えるのは「片方にしか無い」行 (参照図だけ / 自分だけ) だけ。
  //   exists=false → 相手に無い (赤にしない。新人にまだ渡していない図は普通にある)
  //   same=true    → 本文が同じ
  //   map が null  → 読めなかった (未確認)
  //   行が 0      → 状態遷移・クラスとして突き合わせる図ではない (対象外)
  var PEER_SHOW = 3;

  function peerDiffRows(map) {
    var m = map || {};
    var rows = [].concat(m.states || [], m.members || [], m.transitions || []);
    return rows.filter(function(r) { return r && (r.match === 'ref-only' || r.match === 'mine-only'); });
  }

  function peerCell(map, exists, same) {
    if (!exists) return { state: 'missing', count: 0, names: [], label: '相手に無い' };
    if (same) return { state: 'same', count: 0, names: [], label: '同じ' };
    if (!map) return { state: 'unknown', count: 0, names: [], label: '未確認' };
    var all = [].concat(map.states || [], map.members || [], map.transitions || []);
    if (!all.length) return { state: 'na', count: 0, names: [], label: '突き合わせ対象外' };
    var diff = peerDiffRows(map);
    if (!diff.length) return { state: 'match', count: 0, names: [], label: '食い違いなし' };
    var names = [];
    diff.forEach(function(r) {
      var n = _s(r.ref || r.mine).trim();
      if (n && names.indexOf(n) < 0) names.push(n);
    });
    var head = names.slice(0, PEER_SHOW).join(', ');
    return {
      state: 'differ', count: diff.length, names: names,
      titles: diff.map(function(r) {
        return (r.match === 'ref-only' ? '相手だけ: ' : '自分だけ: ') + _s(r.ref || r.mine);
      }),
      label: '食い違い ' + diff.length + '（' + head + (names.length > PEER_SHOW ? ' ほか' : '') + '）',
    };
  }

  // ── 表 ────────────────────────────────────────────────────────────────────

  var BLOCKING = {
    rename: { left: 1, unknown: 1 },
    note: { stale: 1 },
    svg: { ng: 1, unknown: 1 },
    gap: { hit: 1 },
    peer: { differ: 1 },
  };

  var REASON = {
    rename: '旧称が残っている', note: 'note が統一前のまま',
    svg: 'SVG が今の図から作られていない', gap: '指摘と符合する欠落',
    peer: '相手の同名図と食い違い',
  };

  function row(name, text, froms, svgStatus, findings, peer) {
    var r = {
      name: name,
      rename: renameCell(text, froms),
      note: noteCell(text, froms),
      svg: svgCell(svgStatus),
      gap: gapCell(name, findings),
    };
    // 相手を選んでいるときだけ 5 列目を持つ (選ばない間は今の 4 列のまま)。
    if (peer) r.peer = peer;
    var why = [];
    COLS.concat(peer ? ['peer'] : []).forEach(function(c) {
      if (BLOCKING[c] && BLOCKING[c][r[c].state]) why.push(REASON[c]);
    });
    r.blockers = why;
    r.ready = why.length === 0;
    r.tone = r.ready ? 'ok' : 'ng';
    return r;
  }

  // build(input) — 1 画面ぶん。
  // input: { names, texts, froms, svg, findings }
  //   names    渡す図の名前 (並びは資料の並びをそのまま保つ)
  //   texts    { 図名: puml 本文 }。読めなかった図は入れない (未確認として出る)
  //   froms    統一前の名前 (⇄ 一括置換の from。複数可)
  //   svg      { 図名: svg-freshness の内容判定 }
  //   findings review-note.rows の戻り
  function build(input) {
    var o = input || {};
    var names = Array.isArray(o.names) ? o.names.filter(function(n) { return _s(n); }) : [];
    var texts = o.texts || {};
    var froms = (Array.isArray(o.froms) ? o.froms : (o.from ? [o.from] : []))
      .map(_s).filter(function(f) { return f; });
    var svg = o.svg || {};
    var findings = Array.isArray(o.findings) ? o.findings : [];
    // peer: { label: 相手の呼び名, cells: { 図名: peerCell } } — 渡す相手を選んだときだけ。
    var peer = o.peer && o.peer.cells ? o.peer : null;
    var rows = names.map(function(n) {
      var pc = peer ? (peer.cells[n] || peerCell(null, false)) : null;
      return row(n, Object.prototype.hasOwnProperty.call(texts, n) ? texts[n] : null,
        froms, svg[n], findings, pc);
    });
    var out = { rows: rows, froms: froms, summary: summary(rows) };
    if (peer) out.peer = { label: _s(peer.label) };
    return out;
  }

  function summary(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var ready = 0;
    list.forEach(function(r) { if (r && r.ready) ready++; });
    var blocked = list.length - ready;
    return {
      total: list.length, ready: ready, blocked: blocked,
      line: list.length === 0
        ? '対象の図がありません'
        : (list.length + ' 枚中 ' + ready + ' 枚が渡せます'
           + (blocked ? '・渡す前に見る図 ' + blocked + ' 枚' : '')),
      tone: list.length === 0 ? 'empty' : (blocked ? 'ng' : 'ok'),
    };
  }

  function blockedRows(board) {
    return (((board && board.rows) || [])).filter(function(r) { return r && !r.ready; });
  }

  function blockedNames(board) {
    return blockedRows(board).map(function(r) { return r.name; });
  }

  // 書き出す前に出す 1 行。渡せない図をその場で名指しする
  // (押してから zip を開いて気付く作りにしない)。
  function exportWarning(board, names) {
    var b = board || { rows: [] };
    var only = Array.isArray(names) && names.length ? names : null;
    var bad = blockedRows(b).filter(function(r) {
      return !only || only.indexOf(r.name) >= 0;
    });
    if (!bad.length) return '';
    var head = bad.slice(0, 3).map(function(r) { return r.name; }).join('、');
    return '未確認のまま渡そうとしています: ' + bad.length + ' 枚（' + head
      + (bad.length > 3 ? ' ほか' : '') + '）';
  }

  // 行 1 つを 1 行の文にする (run ログ・コピー用)。
  function rowText(r) {
    if (!r) return '';
    return r.name + '\t' + r.rename.label + '\t' + r.note.label + '\t'
      + r.svg.label + '\t' + r.gap.label + (r.peer ? '\t' + r.peer.label : '');
  }

  function copyText(board) {
    var b = board || { rows: [] };
    var cols = ['図', '置換済み', 'note最新', 'SVG最新', '指摘'];
    if (b.peer) cols.push('相手の同名図');
    var head = cols.join('\t');
    return [head].concat((b.rows || []).map(rowText)).join('\n');
  }

  return {
    COLS: COLS,
    noteLines: noteLines,
    bodyOutsideNotes: bodyOutsideNotes,
    countName: countName,
    renameCell: renameCell,
    noteCell: noteCell,
    svgCell: svgCell,
    gapCell: gapCell,
    peerCell: peerCell,
    peerDiffRows: peerDiffRows,
    row: row,
    build: build,
    summary: summary,
    blockedRows: blockedRows,
    blockedNames: blockedNames,
    exportWarning: exportWarning,
    rowText: rowText,
    copyText: copyText,
  };
})();
