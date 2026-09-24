'use strict';
window.MA = window.MA || {};

// dep-version-search — 依存グラフが挙げた「影響が届く図」の版履歴を 1 本の時系列に
// 並べ、症状の語で絞り込んで「いつ・どの版でこの記述になったか」を名指しする。
//
// BLK-primary-20260917-0123-wish: 不具合対応の入口で、◈依存グラフは「今どの図が
// 絡むか」(参照先 6 / 参照元 2 / 出現 5 図 / 連鎖 6 図) までは出すが、「いつこの記述に
// 変わったか」は答えない。primary は spi_init_sequence を開いて版履歴を探したが、
// 📂一覧・図の設定のどこにも版ごとの中身を並べる場所が無く、影響 6 図を 1 枚ずつ
// 開いて中身を目で追うしかなかった。
//
// version-timeline は 1 図ぶんの変遷を持ち、dep-graph は図の束を挙げる。足りないのは
// その 2 つの間 — 「束の版を 1 本の時系列に混ぜ、症状の語で絞る」ところ。ここは
// その混ぜ方と絞り方だけを置く純関数群で、DOM も fetch も localStorage も触らない
// (履歴の取り出しは historyOf として呼び出し側から渡す)。描画は app.js。
// 版の材料は保存フォルダ (server の /version-search。◉ 混入点と同じ道)。fromSearch が
// その返りを historyOf に渡せる形 (図名 → 新しい順の版) に直す。
window.MA.depVersionSearch = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 症状の語は利用者が打つもので、正規表現として打たれたつもりは無い。
  // 大文字小文字だけ無視した素の部分一致にする (Spi_Driver と spi_driver を
  // 同じ語として拾いたいのが実際の用途)。
  function matches(text, keyword) {
    var kw = _s(keyword).trim();
    if (!kw) return true;
    return _s(text).toLowerCase().indexOf(kw.toLowerCase()) >= 0;
  }

  // その版の中で語に当たった行。行番号は 1 から。
  // 語が空なら当たり行という概念が無いので空配列 (絞り込みもしない)。
  function hitLines(dsl, keyword) {
    var kw = _s(keyword).trim();
    var out = [];
    if (!kw) return out;
    _s(dsl).split('\n').forEach(function(raw, i) {
      if (matches(raw, kw)) out.push({ line: i + 1, text: _s(raw).trim() });
    });
    return out;
  }

  // 「この記述に変わったか」を、当たり行の並びそのもので見る。
  // 行数だけを比べると、1 行が書き換わって増減 0 の版を見落とす
  // (症状に効くのはまさにその書き換えなので、見落とすと入口として役に立たない)。
  function _sig(hits) {
    return (hits || []).map(function(h) { return h.text; }).join('\n');
  }

  // 版の当たり行。本文 (dsl) を持つ版はここで数え、保存フォルダの版
  // (server の /version-search が当たり行だけを返す) は渡された hits を語で絞る。
  // server は空白で語を分けて「どれかに当たった行」を返すので、句として当たる行だけに揃える。
  function _hitsOf(v, kw) {
    if (!v) return [];
    if (Array.isArray(v.hits) && v.dsl == null) {
      if (!_s(kw).trim()) return [];
      return v.hits.filter(function(h) { return h && matches(h.text, kw); })
        .map(function(h) { return { line: h.line, text: _s(h.text).trim() }; });
    }
    return hitLines(v.dsl, kw);
  }

  // server の刻印 (YYYYMMDD-HHMMSS[.N]、UTC) → 並べ替えと表示に使う ISO 時刻 (UTC)。
  function stampAt(stamp) {
    var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(_s(stamp));
    if (!m) return '';
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + 'Z';
  }

  // GET /version-search の返り → 図名ごとの版 (新しい順)。◉ 混入点と同じ材料を読む
  // (BLK-primary-20260924-1232: 版を読む道を 1 本にする。localStorage の変遷は
  // ブラウザを起こし直すと空になり、前の run までに保存フォルダへ積んだ版が見えなかった)。
  // 版番号は古い方から 1、2…。最後の「いまの中身」(current) も 1 つの版として数える。
  //
  // 時刻 (at) は「その中身になった時刻」。控えの刻印は「その版が次の保存で置き換えられた
  // 時刻」なので、版 k の時刻は 1 つ古い版 k-1 の刻印になる。いまの中身は更新時刻
  // (mtime)。一番古い控えがいつ書かれたかは残っていないので空 (並びは一番古い扱い)。
  function fromSearch(payload) {
    var out = {};
    var files = (payload && Array.isArray(payload.files)) ? payload.files : [];
    files.forEach(function(f) {
      if (!f || !f.name) return;
      var vs = Array.isArray(f.versions) ? f.versions : [];
      var list = vs.map(function(v, i) {
        v = v || {};
        var prev = i > 0 ? (vs[i - 1] || {}) : null;
        var at = prev && !prev.current ? stampAt(prev.stamp) : '';
        if (v.current && _s(v.mtime)) at = _s(v.mtime);
        return {
          rev: i + 1,
          stamp: v.current ? '' : _s(v.stamp),
          current: !!v.current,
          at: at,
          hits: (Array.isArray(v.lines) ? v.lines : []).map(function(h) {
            return { line: h && h.no, text: _s(h && h.text) };
          }),
        };
      });
      out[f.name] = list.reverse();     // 新しい順
    });
    return out;
  }

  // 並べ替えの時刻。「いまの中身」は刻印を持たないが、どの控えよりも新しい。
  function _sortAt(r) { return r && r.current && !r.at ? '\uffff' : _s(r && r.at); }

  // 行に出す「いつ」。時刻が残っていない版 (一番古い控え) は、そう言う。
  function whenLabel(r) {
    if (!r) return '';
    if (r.at) return atLabel(r.at);
    return r.current ? 'いま' : '日時不明';
  }

  // 1 図ぶん。versions は version-timeline の rows() と同じ「新しい順」で、
  // 各版が dsl / rev / at / label / lines / added / removed を持つ。
  //
  // 各版に足すもの:
  //   hits        … 語に当たった行
  //   changed     … 1 つ前 (古い方) の版と当たり行の並びが違う = ここで書き換わった
  //   appeared    … 前の版には無かった語が、この版で現れた
  //   vanished    … 前の版にはあった語が、この版で消えた
  //   becameCurrent … changed の中で一番新しいもの = 「今の形になった版」
  function docRows(doc, versions, keyword, opts) {
    var o = opts || {};
    var kw = _s(keyword).trim();
    var list = Array.isArray(versions) ? versions : [];
    var out = [];

    for (var i = 0; i < list.length; i++) {
      var v = list[i] || {};
      var prev = list[i + 1];            // 新しい順なので i+1 が 1 つ古い版
      var hits = _hitsOf(v, kw);
      var prevHits = prev ? _hitsOf(prev, kw) : [];
      var changed;
      if (!kw) {
        // 語が無いときは「中身が動いた版」を変化と見なす (増減が 0 の版は
        // version-timeline が積まないが、念のため両方を見る)。
        changed = !prev || (v.added || 0) + (v.removed || 0) > 0;
      } else if (!prev) {
        changed = hits.length > 0;       // 一番古い版に既にあれば、そこが出どころ
      } else {
        changed = _sig(hits) !== _sig(prevHits);
      }
      out.push({
        doc: _s(doc),
        stamp: _s(v.stamp),
        current: !!v.current,
        hop: typeof o.hop === 'number' ? o.hop : 0,
        via: (o.via || []).slice(),
        rev: typeof v.rev === 'number' ? v.rev : i + 1,
        at: _s(v.at),
        label: _s(v.label),
        lines: typeof v.lines === 'number' ? v.lines : null,
        added: typeof v.added === 'number' ? v.added : 0,
        removed: typeof v.removed === 'number' ? v.removed : 0,
        first: !prev,
        hits: hits,
        hitCount: hits.length,
        changed: changed,
        appeared: !!kw && prevHits.length === 0 && hits.length > 0,
        vanished: !!kw && prevHits.length > 0 && hits.length === 0,
        dsl: _s(v.dsl),
      });
    }

    // 語で絞る。当たらない版は、その図でその症状を追うときには読む価値が無い
    // (「消えた版」だけは、いつ消えたかが答えになるので残す)。
    if (kw) {
      out = out.filter(function(r) { return r.hitCount > 0 || r.vanished; });
    }
    if (o.changedOnly) {
      out = out.filter(function(r) { return r.changed; });
    }
    // 「今の形になった版」は、残った中で一番新しい changed。
    for (var j = 0; j < out.length; j++) {
      if (out[j].changed) { out[j].becameCurrent = true; break; }
    }
    return out;
  }

  // 影響一覧 (dep-graph.impactDocs の戻り) ぶんを 1 本の時系列にする。
  // historyOf(name) は図名 → 版の配列 (新しい順)。
  //
  // 並びは新しい順。不具合対応は「直近で何が変わったか」から遡るのが実際の読み方で、
  // 古い順に並べると毎回いちばん下までスクロールしてから読み始めることになる。
  function search(impact, historyOf, keyword, opts) {
    var o = opts || {};
    var list = Array.isArray(impact) ? impact : [];
    var get = typeof historyOf === 'function' ? historyOf : function() { return []; };
    var rows = [];
    list.forEach(function(r) {
      if (!r || !r.doc) return;
      var versions;
      try { versions = get(r.doc); } catch (e) { versions = []; }
      rows = rows.concat(docRows(r.doc, versions, keyword, {
        hop: r.hop, via: r.via, changedOnly: o.changedOnly,
      }));
    });
    rows.sort(function(a, b) {
      var ta = _sortAt(a), tb = _sortAt(b);
      if (ta !== tb) return ta < tb ? 1 : -1;           // 新しい順
      if (a.hop !== b.hop) return a.hop - b.hop;        // 直接の図を先に
      return a.doc.localeCompare(b.doc) || b.rev - a.rev;
    });
    if (typeof o.limit === 'number' && o.limit > 0) rows = rows.slice(0, o.limit);
    return rows;
  }

  // 図ごとのまとめ。一覧の前に「どの図から読むか」を決めるためのもの。
  // 並びは「最後にこの語が書き換わった版が新しい図」から。
  function byDoc(rows) {
    var acc = {};
    var order = [];
    (rows || []).forEach(function(r) {
      if (!acc[r.doc]) {
        acc[r.doc] = {
          doc: r.doc, hop: r.hop, via: (r.via || []).slice(),
          versions: 0, changed: 0, hits: 0, latestAt: '', latestChangedAt: '',
        };
        order.push(r.doc);
      }
      var a = acc[r.doc];
      a.versions++;
      a.hits += r.hitCount;
      var t = _sortAt(r);
      if (r.changed) {
        a.changed++;
        if (t > a.latestChangedAt) a.latestChangedAt = t;
      }
      if (t > a.latestAt) a.latestAt = t;
    });
    return order.map(function(k) { return acc[k]; }).sort(function(a, b) {
      if (a.latestChangedAt !== b.latestChangedAt) {
        return a.latestChangedAt < b.latestChangedAt ? 1 : -1;
      }
      return a.hop - b.hop || a.doc.localeCompare(b.doc);
    });
  }

  // 最初に開く 1 枚。不具合対応の入口はこの 1 行で終わってほしい
  // (依存グラフで名前を選ぶ + 語を打つ = 2 手で、次に開く図が決まる)。
  // いちばん最近この語が書き換わった図を勧める。
  function firstToOpen(rows) {
    var list = (rows || []).filter(function(r) { return r.changed; });
    if (!list.length) list = (rows || []).slice();
    if (!list.length) return null;
    return list[0];
  }

  // 一覧の見出し 1 行。
  function summaryText(rows, keyword, impactCount) {
    var kw = _s(keyword).trim();
    var list = rows || [];
    var docs = byDoc(list).length;
    var n = typeof impactCount === 'number' ? impactCount : docs;
    if (!list.length) {
      if (kw) {
        return '影響 ' + n + ' 図の版履歴に「' + kw + '」を含む版はありません'
          + '（語を短くするか、保存を重ねると履歴が貯まります）';
      }
      return '影響が届く図を選ぶと、その版履歴を新しい順に並べます';
    }
    var changed = list.filter(function(r) { return r.changed; }).length;
    var t = (kw ? '「' + kw + '」' : '全部') + ': ' + docs + ' 図 / ' + list.length + ' 版';
    if (changed > 0) t += ' — 書き換わった版 ' + changed;
    var first = firstToOpen(list);
    if (first) t += ' / 最新の変化は ' + first.doc + ' ' + whenLabel(first);
    return t;
  }

  // ISO 時刻 → 一覧に出す「MM/DD HH:MM」。読めなければそのまま返す。
  function atLabel(at) {
    var s = _s(at);
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
    if (!m) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return m[2] + '/' + m[3] + ' ' + m[4] + ':' + m[5];
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' '
      + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 1 行ぶんの説明。なぜこの版が並んでいるかを行の中で言い切る。
  function rowText(r) {
    if (!r) return '';
    var t = r.doc + ' 版' + r.rev + ' ' + whenLabel(r);
    if (r.appeared) t += ' — ここで現れた';
    else if (r.vanished) t += ' — ここで消えた';
    else if (r.changed) t += ' — ここで書き換わった';
    else t += ' — 変化なし';
    if (r.hitCount) t += '（当たり ' + r.hitCount + ' 行）';
    return t;
  }

  return {
    matches: matches,
    hitLines: hitLines,
    docRows: docRows,
    search: search,
    byDoc: byDoc,
    firstToOpen: firstToOpen,
    summaryText: summaryText,
    atLabel: atLabel,
    whenLabel: whenLabel,
    stampAt: stampAt,
    fromSearch: fromSearch,
    rowText: rowText,
  };
})();
