'use strict';
window.MA = window.MA || {};

// finding-actions — 指摘 1 件を「対象図 + 当てる操作」に翻訳する。
//
// BLK-primary-20260914-1006-wish: 指摘.md の 1 件を押すと図の組が並ぶ所までは
// 来たが (review-note)、そこから先は primary が自分で「これは ⇄一括置換 か、
// 再出力か、別ドメイン宣言か」を毎回読んで決め、対応する画面を探して開いていた。
// 指摘が 1 件増えるたびに、この「読む→手段を決める→画面を探す」が増える。
//
// reviewer の指摘文は手段まで書いてある (「再エクスポートが必要」「junior 側と
// 揃える」「別ドメインを明示」)。書いてあるものを機械が読めば、画面は
// 「対象図 ◯◯ に 再出力 を当てる [適用]」という 1 行にできる。
//
// ここは翻訳だけを持つ。どの図が自分のものかは呼び手が渡し (mineFolder)、
// 実際に当てるのは app.js (bulk-rename / domain-verdict / /autosave-svg)。
// 手段が読み取れない指摘は manual にして、当てない理由をそのまま出す
// (勝手に近い操作を当てると、指摘と違うことをした図が黙って増える)。
window.MA.findingActions = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  var KINDS = {
    reexport: { label: '再出力', verb: 'SVG を出し直す' },
    rename: { label: 'ラベル統一', verb: '部品名を揃える' },
    verdict: { label: '別ドメイン明示', verb: '別物と決めて印を残す' },
    manual: { label: '手で判断', verb: '' },
  };

  function kindLabel(kind) {
    var k = KINDS[_s(kind)];
    return k ? k.label : '';
  }

  // ── 読み取り ────────────────────────────────────────────────────────────
  // 「A を B に統一 / 揃える」。指摘文が綴りを名指ししている形。
  // 「直す」「変更」は指摘文のどこにでも出るので取らない (指摘と違う綴りを
  // 当ててしまう)。綴りの言い換えを明示している語だけを合図にする。
  var RENAME_RE = /`?([A-Za-z_][\w]*)`?\s*(?:を|→|->|⇒)\s*`?([A-Za-z_][\w]*)`?\s*(?:に|へ)?\s*(?:統一|揃え|揃う|改名|改める)/;
  // 「junior `Timer_Start` 等(接頭辞あり) vs primary `Start` 等(接頭辞なし)」。
  // 接頭辞の有無で書かれた形。直すのは接頭辞が無い側なので from/to は逆に取る。
  var PREFIX_RE = /`([A-Za-z_][\w]*)`[^\n]{0,16}[(（]接頭辞あり[)）][^\n]{0,24}vs[^\n]{0,24}`([A-Za-z_][\w]*)`[^\n]{0,16}[(（]接頭辞なし[)）]/;

  var VERDICT_RE = /別ドメイン|別のドメイン|別物|domain-verdict|すり合わせ/;
  var REEXPORT_RE = /再エクスポート|再出力|出し直|書き出し直/;
  // 「再出力」と書かれていなくても、svg の中身が違うと言っていれば出し直すしかない。
  var SVG_BAD_RE = /入れ替わ|クロス|残存|不一致|食い違/;

  function renamePair(text) {
    var s = _s(text);
    var m = s.match(PREFIX_RE);
    if (m) return { from: m[2], to: m[1] };
    m = s.match(RENAME_RE);
    if (m && m[1] !== m[2]) return { from: m[1], to: m[2] };
    return null;
  }

  // 自分のフォルダにある図だけ。指摘は他人の図の話も書くが、当てられるのは自分の図。
  function mineDocs(row, mineFolder) {
    var mine = _s(mineFolder);
    return ((row && row.docs) || []).filter(function(d) {
      return !mine || (d.folders || []).indexOf(mine) >= 0;
    });
  }

  // 相手のフォルダ (別ドメインの印に書く名前)。同名の図を持つ、自分でない方。
  function otherFolderOf(docs, mineFolder) {
    var mine = _s(mineFolder);
    for (var i = 0; i < docs.length; i++) {
      var fs = docs[i].folders || [];
      for (var j = 0; j < fs.length; j++) if (fs[j] !== mine) return fs[j];
    }
    return '';
  }

  // ── 1 件ぶんの提案 ──────────────────────────────────────────────────────
  function planFor(row, opts) {
    var o = opts || {};
    var mineFolder = _s(o.mineFolder);
    var text = _s(row && row.text) || (_s(row && row.title) + '\n' + _s(row && row.body));
    var docs = mineDocs(row, mineFolder);
    var names = docs.map(function(d) { return d.name; });
    var base = {
      id: _s(row && row.id), heading: _s(row && row.heading) || _s(row && row.title),
      docs: names, from: '', to: '', otherFolder: '', scope: 'docs',
    };

    var pair = renamePair(text);
    if (pair) {
      base.kind = 'rename';
      base.from = pair.from;
      base.to = pair.to;
      // 図名が書かれていなければ、自分のフォルダから綴りを含む図を探して当てる
      // (「timer の接頭辞を揃える」のように、綴りだけで来る指摘がある)。
      base.scope = names.length ? 'docs' : 'folder';
      base.ready = true;
      base.reason = '';
      return _finish(base);
    }

    if (VERDICT_RE.test(text)) {
      base.kind = 'verdict';
      base.otherFolder = otherFolderOf(docs, mineFolder);
      base.ready = names.length > 0 && !!base.otherFolder;
      base.reason = base.ready ? ''
        : (names.length ? '同じ名前の図を持つ相手のフォルダが見つかりません'
                        : 'この指摘には自分の保存フォルダにある図の名前がありません');
      return _finish(base);
    }

    if (REEXPORT_RE.test(text) || SVG_BAD_RE.test(text)) {
      base.kind = 'reexport';
      base.ready = names.length > 0;
      base.reason = base.ready ? '' : 'この指摘には自分の保存フォルダにある図の名前がありません';
      return _finish(base);
    }

    base.kind = 'manual';
    base.ready = false;
    base.reason = '指摘文に当てる操作が書かれていません (読んで決めてください)';
    return _finish(base);
  }

  function _finish(p) {
    p.label = kindLabel(p.kind);
    p.text = planText(p);
    return p;
  }

  // 押す前に読む 1 行。「何を、どの図に」を言い切る。
  function planText(p) {
    if (!p) return '';
    var docs = (p.docs || []).join('・');
    if (p.kind === 'rename') {
      var where = p.scope === 'folder' ? '保存フォルダの当たる図' : docs;
      return 'ラベル統一: ' + p.from + ' → ' + p.to + ' を ' + where + ' に当てる';
    }
    if (p.kind === 'verdict') {
      return p.ready
        ? '別ドメイン明示: ' + docs + ' を「' + p.otherFolder + ' とは別のドメイン」と決める'
        : '別ドメイン明示: ' + (p.reason || '当てられません');
    }
    if (p.kind === 'reexport') {
      return p.ready ? '再出力: ' + docs + ' の SVG を出し直す'
                     : '再出力: ' + (p.reason || '当てられません');
    }
    return '手で判断: ' + (p.reason || '');
  }

  function plans(rows, opts) {
    return (rows || []).map(function(r) { return planFor(r, opts); });
  }

  function planOf(plans_, id) {
    var want = _s(id);
    for (var i = 0; i < (plans_ || []).length; i++) {
      if (plans_[i] && plans_[i].id === want) return plans_[i];
    }
    return null;
  }

  // 一覧の見出し。今日 [適用] だけで済む件数を先に言う。
  function summaryText(plans_) {
    var list = plans_ || [];
    if (!list.length) return '指摘.md がありません';
    var ready = list.filter(function(p) { return p.ready; }).length;
    var by = {};
    list.forEach(function(p) { if (p.ready) by[p.kind] = (by[p.kind] || 0) + 1; });
    var parts = [];
    ['reexport', 'rename', 'verdict'].forEach(function(k) {
      if (by[k]) parts.push(kindLabel(k) + ' ' + by[k] + ' 件');
    });
    if (!ready) return '指摘 ' + list.length + ' 件 (適用できるものはありません)';
    return '指摘 ' + list.length + ' 件 / うち ' + ready + ' 件は [適用] で当てられます ('
      + parts.join(' / ') + ')';
  }

  // 当てたあとに出す 1 行。何件の図に何が起きたかを言う。
  function resultText(plan, res) {
    var r = res || {};
    var done = (r.done || []).join('・');
    if (!r.ok) return (plan ? kindLabel(plan.kind) + ': ' : '') + (r.message || '当てられませんでした');
    if (plan && plan.kind === 'rename') {
      return plan.from + ' → ' + plan.to + ' を ' + (r.hits || 0) + ' 箇所、' + done + ' に保存しました';
    }
    if (plan && plan.kind === 'verdict') return done + ' に「別のドメイン」の印を書きました';
    if (plan && plan.kind === 'reexport') return done + ' の SVG を出し直しました';
    return r.message || '当てました';
  }

  var api = {
    KINDS: KINDS,
    kindLabel: kindLabel,
    renamePair: renamePair,
    mineDocs: mineDocs,
    otherFolderOf: otherFolderOf,
    planFor: planFor,
    planText: planText,
    plans: plans,
    planOf: planOf,
    summaryText: summaryText,
    resultText: resultText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
