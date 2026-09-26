'use strict';

// manual-findings — reviewer が図を読んで気づいた指摘 (監査ツールが拾えないもの) に
// 実体 id を持たせ、次の run で「見直す必要があるか」を機械で仕分ける。
//
// BLK-reviewer-20260908-0003-wish: audit.js の name/method/consistency/family/trace の
// どれにも当たらない指摘 (状態遷移とシーケンスのリセットフローの対応、章立てとの対応など) は
// `指摘.md` に自然文で書くしかなく、次 run の自分が全文を読み直していた。読み直しを
// 省くと、何 run も前に解消済みの指摘を引き継ぎ続ける (BLK-reviewer-20260908-0003 が実例)。
//
// 指摘 1 件を「対象ファイル名 + その行の本文 + 本文の指紋」で憶える。次 run では
//   指紋が同じ  → 未変更のため前回判定を維持 (読み直さない)
//   指紋が違う / 行が消えた / 図が消えた → 要再確認 (ここだけ読む)
// と仕分ける。行番号は上に行が増えると動くので、突き合わせは指紋で行い、
// 行番号は表示用に付け直す (review-pins が anchor で行を追うのと同じ考え方)。
//
// DOM にもサーバにも触らない。走査と画面は app.js。
(function() {

  // 前回判定を維持してよいか。keep=true の 2 つだけが「読み直さなくてよい」。
  var STATUS = {
    unchanged: { keep: true, label: '未変更', title: '前回見た版から行が変わっていません。前回判定を維持します' },
    moved: { keep: true, label: '行移動', title: '行の中身は同じで、位置だけ動いています。前回判定を維持します' },
    changed: { keep: false, label: '要再確認', title: '指摘した行が書き換わっています' },
    gone: { keep: false, label: '行が消えた', title: '指摘した行が図から無くなっています' },
    'missing-doc': { keep: false, label: '図が無い', title: '対象の図が保存フォルダにありません' },
  };

  var KEY_PREFIX = 'pua.review.findings:';

  function _s(v) { return v == null ? '' : String(v); }

  // 控えは保存フォルダごと。review-watch / review-carry と同じ区切り方にする。
  function storageKey(fileDir) {
    return KEY_PREFIX + String(fileDir == null || fileDir === '' ? './autosave' : fileDir);
  }

  // ---- 行の指紋 ------------------------------------------------------------

  // 行頭行末の空白とインデントの違いは「書き換わった」に数えない。
  // 整形しただけで全件が要再確認になると、仕分けの意味が無くなる。
  function norm(line) {
    return _s(line).replace(/\r/g, '').replace(/\s+/g, ' ').trim();
  }

  // FNV-1a 32bit。暗号強度は要らない (敵はいない。要るのは「同じ行なら同じ値」だけ)。
  // 依存を足さずにブラウザと node の両方で同じ値が出ることを優先する。
  function hash(line) {
    var s = norm(line);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  // 指摘の実体 id。同じ図の同じ行に対する指摘は、書き直しても同じ id になる。
  // 同じ行に複数の観点で指摘することがあるので、末尾に連番を許す。
  function entityId(doc, lineText, seq) {
    var base = _s(doc) + '#' + hash(lineText);
    var n = seq == null ? 0 : (parseInt(seq, 10) || 0);
    return n > 0 ? (base + '.' + n) : base;
  }

  function _lines(dsl) {
    return _s(dsl).replace(/\r\n?/g, '\n').split('\n');
  }

  // ---- 指摘を作る ----------------------------------------------------------

  // line は 1 始まり (画面の行番号と揃える)。dsl を渡せばその行の本文を拾う。
  function make(o) {
    var src = o && typeof o === 'object' ? o : {};
    var line = parseInt(src.line, 10);
    if (!(line > 0)) line = 0;
    var lineText = _s(src.lineText);
    if (!lineText && typeof src.dsl === 'string' && line > 0) {
      lineText = _s(_lines(src.dsl)[line - 1]);
    }
    return {
      id: _s(src.id) || entityId(src.doc, lineText, src.seq),
      doc: _s(src.doc),
      line: line,
      lineText: lineText,
      hash: hash(lineText),
      text: _s(src.text),
      author: _s(src.author),
      at: _s(src.at),
      // 前回の判定。空なら「まだ判定していない」。
      verdict: _s(src.verdict),
    };
  }

  function _clean(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (!_s(obj.doc)) return null;
    var f = make(obj);
    // 控えに指紋があればそれを正とする (本文を落として指紋だけ持ち帰った控えも読める)。
    if (_s(obj.hash)) f.hash = _s(obj.hash);
    return f;
  }

  function cleanList(list) {
    var out = [];
    if (!list || typeof list.length !== 'number') return out;
    for (var i = 0; i < list.length; i++) {
      var f = _clean(list[i]);
      if (f) out.push(f);
    }
    return out;
  }

  // ---- 突き合わせ ----------------------------------------------------------

  // 1 件を今の DSL と突き合わせる。dsl が null/undefined なら図そのものが無い。
  // 返すのは {status, line, hash, lineText}。line は付け直した表示用の行番号。
  function check(finding, dsl) {
    var f = _clean(finding);
    if (!f) return null;
    if (typeof dsl !== 'string') {
      return { status: 'missing-doc', line: f.line, hash: f.hash, lineText: f.lineText };
    }
    var lines = _lines(dsl);
    // まず前回の位置を見る。動いていないのが普通なので、そこで決まれば走査しない。
    if (f.line > 0 && f.line <= lines.length && hash(lines[f.line - 1]) === f.hash) {
      return { status: 'unchanged', line: f.line, hash: f.hash, lineText: _s(lines[f.line - 1]) };
    }
    // 上に行が増えた / 減っただけなら、同じ本文の行が他の位置にある。
    for (var i = 0; i < lines.length; i++) {
      if (hash(lines[i]) === f.hash) {
        return { status: 'moved', line: i + 1, hash: f.hash, lineText: _s(lines[i]) };
      }
    }
    // 同じ本文がどこにも無い。前回の位置に別の行があるなら「書き換わった」、
    // 図が短くなって位置ごと無いなら「行が消えた」。どちらも要再確認だが、
    // 見に行ったときに何を探せばよいかが違う。
    if (f.line > 0 && f.line <= lines.length) {
      return { status: 'changed', line: f.line, hash: hash(lines[f.line - 1]), lineText: _s(lines[f.line - 1]) };
    }
    return { status: 'gone', line: 0, hash: '', lineText: '' };
  }

  // 全件を突き合わせる。docs は {図名: DSL}。
  // 並びは「要再確認が先、その中は図名順・行番号順」。上から読めば今日見る所だけ済む。
  function review(findings, docs) {
    var src = docs && typeof docs === 'object' ? docs : {};
    var rows = cleanList(findings).map(function(f) {
      var has = Object.prototype.hasOwnProperty.call(src, f.doc);
      var r = check(f, has ? src[f.doc] : undefined);
      var st = STATUS[r.status] || STATUS.changed;
      return {
        id: f.id, doc: f.doc, text: f.text, author: f.author, at: f.at, verdict: f.verdict,
        status: r.status, keep: !!st.keep, label: st.label, title: st.title,
        line: r.line, hash: r.hash, lineText: r.lineText,
        prevLine: f.line, prevHash: f.hash, prevLineText: f.lineText,
      };
    });
    rows.sort(function(a, b) {
      if (a.keep !== b.keep) return a.keep ? 1 : -1;
      if (a.doc !== b.doc) return a.doc < b.doc ? -1 : 1;
      if (a.line !== b.line) return a.line - b.line;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    return rows;
  }

  function summary(rows) {
    var list = rows || [];
    var keep = 0, recheck = 0;
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (list[i].keep) keep++; else recheck++;
    }
    return { total: keep + recheck, keep: keep, recheck: recheck };
  }

  function headText(sum) {
    var s = sum || { total: 0, keep: 0, recheck: 0 };
    if (!s.total) return '手動の指摘はまだありません';
    if (!s.recheck) return s.total + ' 件すべて未変更のため前回判定を維持します（今日読む行はありません）';
    return '要再確認 ' + s.recheck + ' 件 / 未変更のため前回判定を維持 ' + s.keep + ' 件';
  }

  function badgeText(sum) {
    var s = sum || { total: 0, recheck: 0 };
    if (!s.total) return '手動指摘 −';
    return '手動指摘 ' + s.recheck + '/' + s.total;
  }

  // 要再確認の行だけを図名で返す (今日開く図)。
  function toRecheck(rows) {
    var seen = {}, out = [];
    (rows || []).forEach(function(r) {
      if (!r || r.keep) return;
      if (seen[r.doc]) return;
      seen[r.doc] = true;
      out.push(r.doc);
    });
    return out;
  }

  // ---- 控えの更新 ----------------------------------------------------------

  // 突き合わせた結果を控えに書き戻す形にする。
  // 行が動いただけの指摘は新しい行番号を憶える (次 run は走査せずに当たる)。
  // 書き換わった指摘は指紋を更新しない。更新すると「見ないまま解決済み」になる。
  function applyMoves(findings, rows) {
    var byId = {};
    (rows || []).forEach(function(r) { if (r && r.id) byId[r.id] = r; });
    return cleanList(findings).map(function(f) {
      var r = byId[f.id];
      if (r && r.status === 'moved') { f.line = r.line; f.lineText = r.lineText; }
      return f;
    });
  }

  // 要再確認の 1 件を人が見た後に呼ぶ。今の行を新しい実体として憶え直す。
  // verdict を渡さなければ前の判定をそのまま持ち越す。
  function confirm(findings, id, dsl, verdict) {
    var wanted = _s(id);
    return cleanList(findings).map(function(f) {
      if (f.id !== wanted) return f;
      var r = check(f, dsl);
      if (r && r.line > 0) { f.line = r.line; f.lineText = r.lineText; f.hash = r.hash; }
      if (verdict != null) f.verdict = _s(verdict);
      return f;
    });
  }

  function remove(findings, id) {
    var wanted = _s(id);
    return cleanList(findings).filter(function(f) { return f.id !== wanted; });
  }

  // 同じ図の同じ行に足すときは連番でずらす (同じ行に 2 つの観点を書ける)。
  function add(findings, o) {
    var list = cleanList(findings);
    var seq = 0, f = make(o);
    while (list.some(function(x) { return x.id === f.id; })) {
      seq++;
      f = make(Object.assign({}, o, { id: '', seq: seq }));
    }
    list.push(f);
    return list;
  }

  // ---- 出し入れ ------------------------------------------------------------

  function load(storage, fileDir) {
    if (!storage || !storage.getItem) return [];
    var raw = null;
    try { raw = storage.getItem(storageKey(fileDir)); } catch (e) { return []; }
    if (!raw) return [];
    try { return cleanList(JSON.parse(raw)); } catch (e) { return []; }
  }

  function save(storage, fileDir, findings) {
    if (!storage || !storage.setItem) return false;
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(cleanList(findings)));
      return true;
    } catch (e) { return false; }
  }

  // 指摘.md へそのまま貼れる形。実体 id を頭に出して、次 run で本文を
  // 読み直さなくても控えと突き合わせられるようにする。
  function toMarkdown(rows) {
    var list = rows || [];
    if (!list.length) return '- 手動の指摘なし';
    return list.map(function(r) {
      var where = r.line > 0 ? (r.doc + ':' + r.line) : (r.doc + ':—');
      return '- [' + r.label + '] ' + where + ' `' + r.id + '` ' + _s(r.text)
        + (r.verdict ? ('  → ' + r.verdict) : '');
    }).join('\n');
  }

  var api = {
    STATUS: STATUS,
    storageKey: storageKey,
    norm: norm,
    hash: hash,
    entityId: entityId,
    make: make,
    cleanList: cleanList,
    check: check,
    review: review,
    summary: summary,
    headText: headText,
    badgeText: badgeText,
    toRecheck: toRecheck,
    applyMoves: applyMoves,
    confirm: confirm,
    remove: remove,
    add: add,
    load: load,
    save: save,
    toMarkdown: toMarkdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.manualFindings = api;
  }
})();
