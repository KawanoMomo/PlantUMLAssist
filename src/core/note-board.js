'use strict';
window.MA = window.MA || {};

// note-board — 指摘.md を 📂一覧の側から読み、保存フォルダの図 1 枚ずつに
// 「対象外 / ⚠未確認 / ✅対応済み」を付ける。
//
// BLK-junior-20260914-1206-wish: 指摘.md は自由文で、「対象図種・部品・対応要否」が
// 構造化されていない。junior は図を 1 枚開くたびに、自分のフォルダと先輩のフォルダの
// 両方を開いて突き合わせ、「この図は対応不要」を自分で判定していた。指摘の無い図でも
// 同じ往復をするので、判定の手間は図の枚数ぶん増える (指摘の件数ではなく)。
// 8 周目は 5 図種のうち 4 図種が「指摘なし」で、その 4 回ぶんが丸ごと無駄だった。
//
// 判定は開く前に、一覧の上で出す。
//   対象外   指摘.md のどの件もこの図を指していない  → 開かずに次へ進める
//   ⚠未確認 指している件があり、反映を確かめていない → 開いて直す
//   ✅対応済み 指している件が、本文を見るかぎり反映済み → 開かずに次へ進める
//
// 「指している」は 3 通り。名前が本文に綴られている (review-note の docs)、
// 指摘文が版を名指ししていて findingVariant がその 1 枚を選んだ、
// 図名は無いが図種が名指しされている (その図種の図を全部指したものとして扱う)。
// 図名も図種も書かれていない件はどの図にも割り当てない。割り当てると全図が
// ⚠ になり、対象外という答えが 1 つも出せなくなる。代わりに件数を summaryText で
// 言う (「宛先の書かれていない指摘が残っている」と読めれば、junior はそこだけ読む)。
//
// ✅ は本文に証拠があるときだけ出す。「対応済みらしい」で ✅ を出すと、直していない
// 図を開かずに飛ばしてしまう — 対象外と違い、間違えたときに指摘が落ちる側の誤り。
// 証拠は 2 つ: 指摘が綴りの言い換え (`Gpio` を `Gpio_Driver` に統一) を書いていて
// 古い綴りが本文に残っていない、または domain-verdict の注記が本文にある。
// それ以外は判定できないので ⚠未確認 のまま (開いて確かめる)。
//
// DOM にも fetch にも触らない。本文の取り寄せと描画は app.js の職掌。
window.MA.noteBoard = (function() {

  // BLK-owner-20260923-1409-prune: 札の語彙は 📥 指摘箱の 4 つ (finding-vocab) が正本。
  // ここは「図 1 枚ずつ」という文脈のショートカットなので画面は残し、札の表示だけを
  // 揃える。⚠未確認 → ⚠確かめられず、✅対応済み → ✅反映済み。
  // 「対象外」は札ではなく絞り込み条件 (指摘の対象になっていない図) なのでそのまま。
  function _mark(key, fallback) {
    var FV = window.MA.findingVocab;
    return FV ? FV.noteMark(key) : fallback;
  }

  var BADGE = {
    off: {
      key: 'off', mark: _mark('off', '対象外'),
      title: '指摘.md にこの図の名前も図種も挙がっていません（開かずに次へ進めます）',
    },
    todo: {
      key: 'todo', mark: _mark('todo', '⚠確かめられず'),
      title: 'この図あての指摘があります（反映されているかはまだ確かめていません）',
    },
    done: {
      key: 'done', mark: _mark('done', '✓反映済み'),
      title: 'この図あての指摘は、本文を見るかぎり反映済みです',
    },
  };

  function _s(v) { return v == null ? '' : String(v); }

  function _fv() { return window.MA.findingVariant; }
  function _fa() { return window.MA.findingActions; }
  function _rn() { return window.MA.reviewNote; }

  // 一覧のファイル名 → 突き合わせ用の鍵。フォルダ名も拡張子も落として小文字にする
  // (一覧は `GPIOドライバ初期化シーケンス`、指摘の索引は `junior/…​.puml` から
  // 切り出した名前で、同じ図が違う綴りで来る)。
  function keyOf(name) {
    var RN = _rn();
    var s = _s(name).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    if (RN) s = RN.baseName(s);
    else s = s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
    return s.trim().toLowerCase();
  }

  function _rowText(row) {
    if (!row) return '';
    if (_s(row.text)) return _s(row.text);
    return _s(row.title) + '\n' + (Array.isArray(row.body) ? row.body.join('\n') : _s(row.body));
  }

  // 語として含まれているか。前後が英数字・アンダースコアなら別の語の一部。
  function _hasWord(body, word) {
    var w = _s(word);
    if (!w) return false;
    var esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z0-9_])' + esc + '([^A-Za-z0-9_]|$)').test(_s(body));
  }

  function _head(row) {
    return _s(row && (row.heading || row.title)) || ('指摘 ' + _s(row && row.index));
  }

  // ── どの図を指しているか ────────────────────────────────────────────────
  // scan({rows, targets, names, kindOf})
  //   rows    reviewNote.rows の戻り
  //   targets { 指摘 id: findingVariant.choose の戻り } (無くてもよい)
  //   names   一覧にあるファイル名
  //   kindOf  name → 図種 (無ければ図種による割り当てをしない)
  // 戻り: { byName: {name: [hit…]}, unaddressed: [row…], names: [name…] }
  //   hit = { id, head, why: 'name'|'variant'|'kind', row }
  function scan(opts) {
    var o = opts || {};
    var FV = _fv();
    var rows = Array.isArray(o.rows) ? o.rows : [];
    var names = Array.isArray(o.names) ? o.names : [];
    var targets = o.targets || {};
    var kindOf = (typeof o.kindOf === 'function') ? o.kindOf : function() { return ''; };

    var byKey = {};   // 鍵 → 一覧のファイル名 (複数あれば先に出たものを採る)
    names.forEach(function(n) {
      var k = keyOf(n);
      if (k && !byKey[k]) byKey[k] = n;
    });

    var byName = {};
    var unaddressed = [];

    function hit(name, row, why) {
      if (!name) return false;
      if (!byName[name]) byName[name] = [];
      for (var i = 0; i < byName[name].length; i++) {
        if (byName[name][i].id === row.id) return true;
      }
      byName[name].push({ id: row.id, head: _head(row), why: why, row: row });
      return true;
    }

    rows.forEach(function(row) {
      var got = false;
      // 1. 本文に綴られている図名。
      (row.docs || []).forEach(function(d) {
        var name = byKey[keyOf(d && d.name)];
        if (name) got = hit(name, row, 'name') || got;
      });
      // 2. 指摘文が名指しした版。本文にその綴りが無くても選ばれている。
      var pick = targets[row.id];
      if (pick && pick.name) {
        var pn = byKey[keyOf(pick.name)];
        if (pn) got = hit(pn, row, 'variant') || got;
      }
      if (got) return;
      // 3. 図名は無いが図種が名指しされている。その図種の図を全部指す。
      var kind = FV ? FV.wantedKind(_rowText(row)) : '';
      if (kind) {
        names.forEach(function(n) {
          if (_s(kindOf(n)) === kind) got = hit(n, row, 'kind') || got;
        });
      }
      if (!got) unaddressed.push(row);
    });

    var hitNames = [];
    names.forEach(function(n) { if (byName[n]) hitNames.push(n); });

    return { byName: byName, unaddressed: unaddressed, names: hitNames };
  }

  function hitsOf(board, name) {
    return (board && board.byName && board.byName[name]) || [];
  }

  // 「junior 側 `Gpio` / primary 側 `Gpio_Driver`」。reviewer が食い違いを書くときの形で、
  // 直す向き (自分の綴りを相手の綴りへ) がそのまま書かれている。
  // 「〜を〜に統一」と違い動詞が無いので finding-actions の renamePair では取れないが、
  // どちらが自分の綴りかはフォルダ名で決まるので、反映されたかは機械で言える。
  var SIDE_RE = /([A-Za-z0-9_぀-ヿ一-鿿]+)\s*側[^\n`]{0,8}`([A-Za-z_][\w]*)`/g;

  function sidePairs(text) {
    var out = [];
    var s = _s(text);
    SIDE_RE.lastIndex = 0;
    var m;
    while ((m = SIDE_RE.exec(s))) {
      out.push({ side: m[1], name: m[2] });
    }
    return out;
  }

  // 自分のフォルダの綴り → 相手のフォルダの綴り、の組。どちらも書かれていなければ null。
  function sideRename(text, mineFolder) {
    var mine = _s(mineFolder).toLowerCase();
    if (!mine) return null;
    var pairs = sidePairs(text);
    var from = '', to = '';
    pairs.forEach(function(p) {
      if (_s(p.side).toLowerCase() === mine) { if (!from) from = p.name; }
      else if (!to) to = p.name;
    });
    if (!from || !to || from === to) return null;
    return { from: from, to: to };
  }

  // ── 反映されているか ────────────────────────────────────────────────────
  // verdictOf(row, dsl, opts) — 本文に残る証拠だけで決める。判定できなければ done:false。
  // opts.mineFolder があれば「自分側 / 相手側」で書かれた食い違いも読む。
  function verdictOf(row, dsl, opts) {
    var FA = _fa();
    var RN = _rn();
    var text = _rowText(row);
    var body = _s(dsl);
    if (!body) return { done: false, why: '本文をまだ読んでいません' };

    var pair = FA ? FA.renamePair(text) : null;
    if (!pair) pair = sideRename(text, (opts || {}).mineFolder);
    if (pair && pair.from && pair.to) {
      // 語の切れ目で見る。`Gpio` を `Gpio_Driver` に統一した図には `Gpio_Driver` が
      // 並ぶので、素の indexOf では直した図が永遠に「まだ残っています」になる。
      if (_hasWord(body, pair.from)) {
        return { done: false, why: '「' + pair.from + '」がまだ残っています', term: pair.from };
      }
      // 消えただけでは足りない。直した綴りが入っていて初めて「揃えた」と言える
      // (部品ごと消しても古い綴りは消える)。
      if (_hasWord(body, pair.to)) {
        return { done: true, why: '「' + pair.to + '」に揃っています' };
      }
      return { done: false, why: 'どちらの綴りも見当たりません（開いて確かめてください）' };
    }

    var notes = RN ? RN.verdictNotes(body) : [];
    if (notes.length) return { done: true, why: notes.join('、') };

    return { done: false, why: '本文からは判定できません（開いて確かめてください）', term: termIn(text, body) };
  }

  // BLK-junior-20260924-1632-wish: 指摘文が `…` で括った語のうち、本文に語として出てくる最初の 1 つ。
  // FILES ツリーの札を押して図を開いたとき、どこを見ればよいかをエディタで選んで見せるのに使う。
  // 見つからなければ '' (図を開くだけにする。当てずっぽうの語は選ばない)。
  var CODE_RE = /`([^`\n]+)`/g;
  function termIn(text, dsl) {
    var body = _s(dsl);
    if (!body) return '';
    CODE_RE.lastIndex = 0;
    var m;
    while ((m = CODE_RE.exec(_s(text)))) {
      var w = m[1].trim();
      if (w && _hasWord(body, w)) return w;
    }
    return '';
  }

  // 図 1 枚の状態。dsl が無いうちは ⚠未確認 のまま (「読めていない」を ✅ にしない)。
  function statusOf(opts) {
    var o = opts || {};
    var hits = Array.isArray(o.hits) ? o.hits : [];
    if (!hits.length) {
      return { key: 'off', mark: BADGE.off.mark, title: BADGE.off.title, hits: [], reasons: [] };
    }
    var reasons = [];
    var allDone = true;
    // head / term: まだ反映を確かめられない最初の 1 件の見出しと、その件が指す本文の語
    // (FILES ツリーの札の title と、押したときに選ぶ語。BLK-junior-20260924-1632-wish)。
    var head = '', term = '', open = 0;
    hits.forEach(function(h) {
      var v = verdictOf(h.row, o.dsl, { mineFolder: o.mineFolder });
      if (!v.done) {
        allDone = false;
        open++;
        if (!head) { head = h.head; term = _s(v.term); }
      }
      reasons.push(h.head + ': ' + v.why);
    });
    var b = allDone ? BADGE.done : BADGE.todo;
    return {
      key: b.key, mark: b.mark,
      title: b.title + ' — ' + reasons.join(' / '),
      hits: hits, reasons: reasons,
      head: head, term: term, open: open,
    };
  }

  // statusMap({board, names, dslByName}) → { name: statusOf の戻り }
  function statusMap(opts) {
    var o = opts || {};
    var board = o.board || { byName: {} };
    var names = Array.isArray(o.names) ? o.names : Object.keys(board.byName || {});
    var dsl = o.dslByName || {};
    var out = {};
    names.forEach(function(n) {
      out[n] = statusOf({ hits: hitsOf(board, n), dsl: dsl[n], mineFolder: o.mineFolder });
    });
    return out;
  }

  // 本文を取り寄せる価値のある図だけ。対象外の図は読まない
  // (「開かなくてよい」と言うために全部読むのでは、往復が画面の中に移るだけ)。
  function pendingNames(board) {
    return (board && board.names) ? board.names.slice() : [];
  }

  function badge(key) {
    return BADGE[_s(key)] || null;
  }

  // 一覧の見出し 1 行。今日開かなくてよい枚数を先に言う。
  function summaryText(opts) {
    var o = opts || {};
    var board = o.board;
    if (!board) return '指摘.md を読み込んでいます…';
    var names = Array.isArray(o.names) ? o.names : [];
    if (!o.hasNote) return '指摘.md がありません（この保存先の隣に置かれていません）';
    var map = o.statusByName || {};
    var off = 0, todo = 0, done = 0;
    names.forEach(function(n) {
      var k = (map[n] && map[n].key) || 'off';
      if (k === 'todo') todo++;
      else if (k === 'done') done++;
      else off++;
    });
    var s = '指摘.md: ' + names.length + ' 枚のうち ' + BADGE.todo.mark + ' ' + todo + ' 枚 / '
      + BADGE.done.mark + ' ' + done + ' 枚 / ' + BADGE.off.mark + ' ' + off
      + ' 枚（対象外は開かずに次へ進めます）';
    var un = (board.unaddressed || []).length;
    if (un) {
      // 件数だけでは「自分宛か」を確かめに GUI の外へ出ることになる。
      // 宛先まで言い切れる分は言う (BLK-junior-20260914-1306)。
      s += ' — ' + unaddressedSummary(board, o);
    }
    return s;
  }

  // ── 宛先の書かれていない指摘 ────────────────────────────────────────────
  // BLK-junior-20260914-1306: 図名も図種も書かれていない件はどの図にも割り当てられず、
  // 一覧は件数だけを言っていた。その件が自分宛かどうかは、結局 GUI の外で
  // 指摘.md の全文を読むまで分からない。宛先は本文に書かれていることが多いので
  // (「junior 側 …」「primary への依頼」「junior は …」)、そこまでは機械で言う。
  // 言い切れないものは「宛先不明」として、本文をその場で読めるようにする
  // (誤って「自分宛ではない」と決めて指摘を落とすより、1 件読む方が安い)。
  var ADDRESSEE = {
    mine: { key: 'mine', mark: '自分宛' },
    other: { key: 'other', mark: '他の人宛' },
    unknown: { key: 'unknown', mark: '宛先不明' },
  };

  // 本文にフォルダ名 (= ペルソナ名) が語として出てくるか。
  function _mentions(text, who) {
    return _hasWord(_s(text).toLowerCase(), _s(who).toLowerCase());
  }

  // addresseeOf(row, {mineFolder, otherFolders}) → { key, mark, why }
  function addresseeOf(row, opts) {
    var o = opts || {};
    var text = _rowText(row);
    var mine = _s(o.mineFolder);
    var others = Array.isArray(o.otherFolders) ? o.otherFolders : [];
    var hitMine = mine && _mentions(text, mine);
    var hitOther = '';
    others.forEach(function(f) {
      if (!hitOther && _s(f) && _s(f).toLowerCase() !== mine.toLowerCase() && _mentions(text, f)) {
        hitOther = _s(f);
      }
    });
    // 自分の名前が出ていれば、他の人の名前も出ていても自分宛として読む
    // (「junior 側 Gpio / primary 側 Gpio_Driver」は自分が直す件)。
    if (hitMine) return { key: 'mine', mark: ADDRESSEE.mine.mark, why: '本文に ' + mine + ' が出てきます' };
    if (hitOther) return { key: 'other', mark: ADDRESSEE.other.mark, why: '本文に ' + hitOther + ' しか出てきません' };
    return { key: 'unknown', mark: ADDRESSEE.unknown.mark, why: '本文に誰宛かが書かれていません' };
  }

  // 一覧に出す行。本文もそのまま持たせる (GUI の外で指摘.md を開かなくて済む)。
  function unaddressedRows(board, opts) {
    return ((board && board.unaddressed) || []).map(function(row) {
      var to = addresseeOf(row, opts);
      return {
        id: row.id, index: row.index, head: _head(row), marks: row.marks || [],
        body: _s(row.body) || _rowText(row),
        to: to.key, toMark: to.mark, why: to.why,
      };
    });
  }

  // 見出しの 1 行。何件が自分宛かを先に言う (全文を読ませない)。
  function unaddressedSummary(board, opts) {
    var rows_ = unaddressedRows(board, opts);
    if (!rows_.length) return '';
    var n = { mine: 0, other: 0, unknown: 0 };
    rows_.forEach(function(r) { n[r.to]++; });
    var parts = [];
    if (n.mine) parts.push('自分宛 ' + n.mine + ' 件');
    if (n.other) parts.push('他の人宛 ' + n.other + ' 件');
    if (n.unknown) parts.push('宛先不明 ' + n.unknown + ' 件');
    return '図名も図種も書かれていない指摘 ' + rows_.length + ' 件（' + parts.join('・') + '）';
  }

  var api = {
    BADGE: BADGE,
    ADDRESSEE: ADDRESSEE,
    addresseeOf: addresseeOf,
    unaddressedRows: unaddressedRows,
    unaddressedSummary: unaddressedSummary,
    keyOf: keyOf,
    scan: scan,
    hitsOf: hitsOf,
    sidePairs: sidePairs,
    sideRename: sideRename,
    verdictOf: verdictOf,
    termIn: termIn,
    statusOf: statusOf,
    statusMap: statusMap,
    pendingNames: pendingNames,
    badge: badge,
    summaryText: summaryText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
