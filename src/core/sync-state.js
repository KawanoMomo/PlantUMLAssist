'use strict';
window.MA = window.MA || {};

// sync-state — 1 つの図が持つ 3 つの成果物 (本体 .puml / 編集中の下書き / 書き出した .svg) の
// うち、どれが最新でどれが取り残されているかを一覧の時点で言う。
//
// BLK-reviewer-20260914-1506-wish: 直した内容が `{name}-編集中.puml` にだけ入り、
// 審査対象の本体には入っていない事故を、reviewer が手で diff を取って初めて見つけていた。
// 追記では逆向き (本体は直ったが `{name}.svg` が旧内容のまま) も同じ日に起きている。
// 根っこは同じで「対になる成果物のうち片方だけを直した」。どちらの向きも、
// 保存フォルダの一覧が既に持っている値 (mtime と本文の sha1、svg の刻印) だけで言える。
//
// dupe-merge は「本体と写しが byte 単位で同じ」= もう片付けてよい重複を扱う。
// ここが見るのはその裏で、**中身が違う**ときにどちらが新しいかを言う。
// 同じ中身なら反映漏れではないので、ここは何も言わない (片付けは dupe-merge の職掌)。
//
// DOM にも fetch にも触らない純関数だけ。描画と本文の取り寄せは app.js。
window.MA.syncState = (function() {

  // 下書きを示す接尾辞。source-lock が「元を保つ」で作る `-編集中` が本命で、
  // 手で付けられる同義の語を併せて見る。末尾の連番 (-編集中2) も下書き。
  var DRAFT_MARKS = ['-編集中', '-編集用', '-作業中', '-下書き'];
  var DRAFT_RE = new RegExp('(' + DRAFT_MARKS.join('|') + ')\\d*$');

  function _s(v) { return v == null ? '' : String(v); }

  function _time(v) {
    var s = _s(v);
    if (s === '') return null;
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  function nameOf(e) {
    if (e == null) return '';
    return typeof e === 'string' ? '' : _s(e.name);
  }

  // 下書きの名前なら本体の名前を返す。下書きでなければ null。
  function baseNameOf(name) {
    var n = _s(name);
    var m = DRAFT_RE.exec(n);
    if (!m) return null;
    var base = n.slice(0, m.index);
    return base === '' ? null : base;
  }

  function isDraftName(name) { return baseNameOf(name) !== null; }

  // 本体と下書きの関係。
  //   none        … 下書きが無い
  //   same        … 中身が同じ (反映漏れではない)
  //   draft-ahead … 下書きの方が新しい = 直したのに本体へ入っていない (今回の事故)
  //   base-ahead  … 本体の方が新しい = 下書きが取り残されている
  //   unknown     … どちらが新しいか時刻から言えない (中身は違う)
  function draftStatus(base, draft) {
    if (!draft) return 'none';
    var bh = _s(base && base.hash), dh = _s(draft && draft.hash);
    if (bh !== '' && bh === dh) return 'same';
    var bt = _time(base && base.mtime), dt = _time(draft && draft.mtime);
    if (bt === null || dt === null) return 'unknown';
    if (dt > bt) return 'draft-ahead';
    if (bt > dt) return 'base-ahead';
    // 同時刻で中身が違う。どちらが後かは言えない。
    return 'unknown';
  }

  function _svgMap(entries, verified) {
    var SF = window.MA.svgFreshness;
    if (!SF || !SF.scan || !SF.contentMap) return {};
    return SF.contentMap(SF.scan(entries || [], verified || {}));
  }

  // 反映漏れとして名指しするのは 2 つだけ。
  //   - 下書きと本体が食い違う (same / none 以外)
  //   - svg が別内容の puml から作られている (differ)
  // svg 無しは「まだ書き出していない」であって反映漏れではないので、ここでは数えない
  // (📂 一覧の SVG の節が既に名指ししている。二重に赤くすると、どちらを直すか決められない)。
  function _issueOf(row) {
    if (row.baseMissing) return 'orphan';
    if (row.draftStatus !== 'none' && row.draftStatus !== 'same') return row.draftStatus;
    if (row.svgStatus === 'differ') return 'svg-stale';
    return '';
  }

  // scan — 一覧の entries (と /verify-svg の控え) から図ごとの 1 行を作る。
  function scan(entries, verified) {
    var list = (entries || []).filter(function(e) { return nameOf(e) !== ''; });
    var byName = {};
    list.forEach(function(e) { byName[nameOf(e)] = e; });
    var svg = _svgMap(list, verified);

    var drafts = {};   // base → draft entry (同じ本体に複数あれば新しい方を採る)
    list.forEach(function(e) {
      var base = baseNameOf(nameOf(e));
      if (base === null) return;
      var cur = drafts[base];
      if (!cur) { drafts[base] = e; return; }
      var a = _time(cur.mtime), b = _time(e.mtime);
      if (a === null || (b !== null && b > a)) drafts[base] = e;
    });

    var rows = [];
    list.forEach(function(e) {
      var name = nameOf(e);
      if (isDraftName(name)) return;
      var d = drafts[name] || null;
      var row = {
        name: name,
        base: e,
        draft: d,
        draftName: d ? nameOf(d) : '',
        draftStatus: draftStatus(e, d),
        svgStatus: svg[name] || 'missing',
        baseMissing: false,
      };
      row.issue = _issueOf(row);
      rows.push(row);
    });
    // 本体がもう無いのに下書きだけ残っている図。片方だけ直したのではなく
    // 「直した先が消えた」形なので、黙って落とさず同じ表に出す。
    Object.keys(drafts).forEach(function(base) {
      if (byName[base]) return;
      var d = drafts[base];
      var row = {
        name: base,
        base: null,
        draft: d,
        draftName: nameOf(d),
        draftStatus: 'orphan',
        svgStatus: svg[base] || 'missing',
        baseMissing: true,
      };
      row.issue = _issueOf(row);
      rows.push(row);
    });

    var counts = { total: rows.length, draftAhead: 0, baseAhead: 0, unknown: 0,
                   svgStale: 0, orphan: 0, ok: 0 };
    rows.forEach(function(r) {
      if (r.issue === 'draft-ahead') counts.draftAhead++;
      else if (r.issue === 'base-ahead') counts.baseAhead++;
      else if (r.issue === 'unknown') counts.unknown++;
      else if (r.issue === 'svg-stale') counts.svgStale++;
      else if (r.issue === 'orphan') counts.orphan++;
      else counts.ok++;
    });

    // 直す順に並べる。未反映の下書き (直したのに届いていない) が先頭。
    var ORDER = { 'draft-ahead': 0, orphan: 1, 'base-ahead': 2, unknown: 3, 'svg-stale': 4, '': 5 };
    var issues = rows.filter(function(r) { return r.issue !== ''; }).sort(function(a, b) {
      var d = ORDER[a.issue] - ORDER[b.issue];
      return d !== 0 ? d : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    return { rows: rows, issues: issues, counts: counts };
  }

  function find(scanned, name) {
    var rows = (scanned && scanned.rows) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].name === _s(name)) return rows[i];
    return null;
  }

  function hasIssue(scanned) { return !!(scanned && scanned.issues && scanned.issues.length); }

  // 一覧の見出しに出す 1 行。0 件でも黙らない —— 「反映漏れの節が出ていない」を
  // 「確かめた結果そろっている」と読ませないため。
  function summary(scanned) {
    if (!scanned || !scanned.counts.total) return '';
    var c = scanned.counts;
    if (!hasIssue(scanned)) return '本体・編集中・SVG は ' + c.total + ' 枚とも揃っています';
    var parts = [];
    if (c.draftAhead) parts.push('本体に未反映の下書き ' + c.draftAhead + ' 枚');
    if (c.orphan) parts.push('本体の無い下書き ' + c.orphan + ' 枚');
    if (c.baseAhead) parts.push('取り残された下書き ' + c.baseAhead + ' 枚');
    if (c.unknown) parts.push('前後の分からない下書き ' + c.unknown + ' 枚');
    if (c.svgStale) parts.push('古い SVG ' + c.svgStale + ' 枚');
    return '反映待ち ' + scanned.issues.length + ' 枚（' + parts.join('・') + '）';
  }

  var ISSUE_TEXT = {
    'draft-ahead': '編集中が新しい — 直した内容が本体に入っていません',
    'base-ahead': '編集中が古い — 本体を直した後、下書きが取り残されています',
    unknown: '本体と編集中の中身が違います — どちらが新しいかは時刻から言えません',
    orphan: '本体がありません — 直した内容が下書きにしか残っていません',
    'svg-stale': 'SVG が別の内容の本体から作られています — 書き出し直しが要ります',
  };

  function issueText(row) { return (row && ISSUE_TEXT[row.issue]) || ''; }

  var ISSUE_MARK = {
    'draft-ahead': '未反映',
    'base-ahead': '下書き古',
    unknown: '前後不明',
    orphan: '本体無',
    'svg-stale': 'SVG 古',
  };

  // 一覧の行に付く印。本体の行にも下書きの行にも同じ印を出す
  // (下書きの行だけ見ている人に「これは本体に入っていない」が届く)。
  function badge(scanned, name) {
    var n = _s(name);
    var rows = (scanned && scanned.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.issue) continue;
      var onBase = r.name === n;
      var onDraft = r.draftName === n && n !== '';
      if (!onBase && !onDraft) continue;
      return { kind: r.issue, mark: ISSUE_MARK[r.issue] || '要確認', of: r.name,
               title: r.name + ': ' + issueText(r) };
    }
    return null;
  }

  // 1 行の中身を「どれが最新でどれが古いか」の並びにする。
  // 時刻をそのまま 3 つ並べるだけでは、どれを直せばよいかを読む側が計算することになる。
  function lines(row) {
    if (!row) return [];
    var out = [];
    var bt = _time(row.base && row.base.mtime);
    var dt = _time(row.draft && row.draft.mtime);
    var newest = Math.max(bt === null ? -1 : bt, dt === null ? -1 : dt);
    function state(t, missing) {
      if (missing) return 'missing';
      if (t === null || newest < 0) return 'unknown';
      return t >= newest ? 'latest' : 'old';
    }
    out.push({ role: 'base', label: '本体', name: row.name + '.puml',
               at: _s(row.base && row.base.mtime),
               state: row.baseMissing ? 'missing' : state(bt, false) });
    out.push({ role: 'draft', label: '編集中',
               name: (row.draftName || (row.name + '-編集中')) + '.puml',
               at: _s(row.draft && row.draft.mtime),
               state: row.draft ? state(dt, false) : 'missing' });
    var svgState = row.svgStatus === 'missing' ? 'missing'
                 : (row.svgStatus === 'differ' ? 'old'
                 : (row.svgStatus === 'unverified' ? 'unknown' : 'latest'));
    out.push({ role: 'svg', label: 'SVG', name: row.name + '.svg',
               at: _s(row.base && row.base.svgMtime), state: svgState });
    return out;
  }

  var STATE_MARK = { latest: '最新', old: '古い', missing: '無し', unknown: '不明' };
  function stateMark(state) { return STATE_MARK[state] || '不明'; }

  // 差分を開くボタンの文言。何と何を比べるかを押す前に言う。
  function diffLabel(row) {
    if (!row || !row.draft) return '差分';
    return '差分（本体 ⇔ ' + row.draftName + '）';
  }

  function diffTitle(row) {
    if (!row) return '';
    if (!row.draft) return row.name + ' には編集中の下書きがありません';
    return row.name + '.puml と ' + row.draftName + '.puml の中身を行単位で並べます'
      + '（どちらのファイルも書き換えません）';
  }

  return {
    DRAFT_MARKS: DRAFT_MARKS,
    baseNameOf: baseNameOf,
    isDraftName: isDraftName,
    draftStatus: draftStatus,
    scan: scan,
    find: find,
    hasIssue: hasIssue,
    summary: summary,
    issueText: issueText,
    badge: badge,
    lines: lines,
    stateMark: stateMark,
    diffLabel: diffLabel,
    diffTitle: diffTitle,
  };
})();
