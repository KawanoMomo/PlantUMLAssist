'use strict';
window.MA = window.MA || {};

// tool-menu — タブ列に横並びだった機能ボタンを「ツール」1 か所に畳む (design 7a)。
//
// タブ列には 2 種類のものが混ざっている。図のタブ (今どれを見ているか) と、機能ボタン
// (何をするか)。後者が 20 個以上あるため、目的のボタンを目で探す時間が業務のたびに要る。
// ここでは機能ボタンを 6 分類のメニューに畳み、分類ごとに開いて選べるようにする。
// メニュー項目は既存のボタンの id を指すだけで、実際の処理は元のボタンの click に委ねる
// (同じ操作が Ctrl+K のコマンドパレットからも引ける、という関係を崩さないため)。
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.toolMenu = (function() {
  // 分類と並びは design 7a のパネルに合わせる。label はメニュー上の文言で、
  // タブ列のボタン文字 (絵文字 + 短い語) ではなく「何をするか」で読める形にする。
  var GROUPS = [
    { key: 'edit', title: '書き換える', items: [
      { id: 'btn-tab-lines',  label: '行を書き換える', group: 'まとめて直す' },
      { id: 'btn-tab-rename', label: '部品名を一括置換する', group: 'まとめて直す' },
      { id: 'btn-tab-apply',  label: '複数クラスに一括適用する', group: 'まとめて直す' },
    ] },
    // 「探す」(図をまたぐ調べ物) の分類は TICKET-owner-20261115-2140-prune で中身ごと外した。
    // 図をまたぐ操作は「書き換える」の ⇄ 一括置換 1 本。
    // 「確かめる」(図をまたぐ監査) の分類は TICKET-owner-20261115-1841-prune で中身ごと外した。
    // 「レビュー」の分類 (基準の図に照らした指摘の窓・前回保存からの差分) は TICKET-owner-20261115-2141-prune で
    // 中身ごと外した。2 枚を比べるのは「この図の履歴」の行の「比較」1 つ (FILES のファイルの右クリック)。
    // zip にして渡す入口は TICKET-owner-20261116-0140-prune で外した (書き出しは Export ▾ の 1 枚ずつ)。
  ];

  // メニューからは外したが、分類と言い換えは生きているもの (入口は Export ▾)。今は無い。
  var MOVED_TO_EXPORT = [];

  // ファイル 1 枚に対する操作は FILES ツリーの
  // 右クリックに集めた。メニューには並べず案内 1 行に落とす。分類と言い換えは残すので、
  // Ctrl+K / Ctrl+P からは今まで通りの名前で引ける (ボタンの実体もそのまま)。
  var MOVED_TO_FILES = [
    { key: 'file', title: 'ファイル', items: [
      { id: 'btn-tab-versions', label: 'この図の履歴を見る', group: 'ファイルの右クリック' },
      // フォルダの図を覗く窓は TICKET-owner-20261115-2141-prune で外した。
    ] },
  ];
  // 前の版と比べるのは「この図の履歴」の行の「比較」から (TICKET-owner-20261115-2141-prune)。
  var FILES_NOTE = 'ファイル単位の操作（開く・この図の履歴（前の版との比較）・名前変更・削除…）は FILES のファイルを右クリック。'
    + '隣の保存フォルダは FILES の読むだけ（図を押すと右の枠に出ます）';

  function allGroups() {
    return GROUPS.concat(MOVED_TO_EXPORT).concat(MOVED_TO_FILES);
  }

  // メニューの 6 分類 (右クリックへ移したものは入れない)。
  function menuGroups() {
    return GROUPS.concat(MOVED_TO_EXPORT);
  }

  // タブ列に残すもの。図そのものの出し入れ (＋ / 📂 一覧) はツールではないので畳まない。
  // 📄 ファイルを開く も図の出し入れなので畳まない。
  var KEEP_IN_TAB_BAR = ['btn-tab-new', 'btn-tab-folder', 'btn-open-file'];

  // メニューには載るが、タブ列のボタンではないもの (下端ステータスの札・モーダルの中の
  // ボタン)。畳む対象に数えると「他 N 件」の N が実際に消えた数とずれるので外す。
  // 下端の「前回保存版」の札 (status-livediff) はメニューから外し (TICKET-owner-20261115-2141-prune)、
  // 消える向きの警告のときだけ出る守りになった。
  var NOT_IN_TAB_BAR = ['status-livediff'];

  // design 9b: 絞り込み欄の右端に出す注記。パネルが 2 段になって幅が要るので短くする。
  var NOTE = 'Ctrl+K でも引けます';
  var FILTER_LABEL = 'ツールを絞り込む';

  // design 9b: パネルの左列に出す 6 分類。Export ▾ に入口を移した「渡す」も、
  // 「どこを見ればよいか」の地図としてはここに居る (押すと Export 側のボタンを鳴らす)。
  function panelGroups() {
    return menuGroups().map(function(g) {
      return {
        key: g.key,
        title: g.title,
        items: bySubHead(g.items.map(function(it) {
          var o = { id: it.id, label: it.label, group: it.group || '' };
          if (it.opener) o.opener = it.opener;
          if (it.keywords) o.keywords = it.keywords.slice();
          return o;
        })),
      };
    });
  }

  // 右列は並び順に小見出しを差し込むので、
  // 同じ小見出しの項目が離れていると小見出しが 2 度出る (「まとめて点検」「渡す前に」が
  // 2 回ずつ出ていた)。小見出しの初出順に項目を寄せる。小見出しの中では元の並びを保つ。
  function bySubHead(items) {
    var order = [];
    var bucket = {};
    items.forEach(function(it) {
      var k = it.group || '';
      if (!bucket[k]) { bucket[k] = []; order.push(k); }
      bucket[k].push(it);
    });
    var out = [];
    order.forEach(function(k) { out = out.concat(bucket[k]); });
    return out;
  }

  // 分類ごとの合計件数。開く前に「どこに何件あるか」を左列で見せる (design 9b)。
  // 0 の分類は数字を出さない (常に場所を取る 0 を画面から消す)。
  function groupCounts(badges) {
    var b = badges || {};
    var out = {};
    panelGroups().forEach(function(g) {
      var n = 0;
      g.items.forEach(function(it) {
        var v = parseInt(b[it.id], 10);
        if (v > 0) n += v;
      });
      if (n > 0) out[g.key] = n;
    });
    return out;
  }

  // 絞り込み。分類名・小見出し・項目名のどれかに当たれば残す (全分類を横断する)。
  function filterItems(query) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    var out = [];
    panelGroups().forEach(function(g) {
      g.items.forEach(function(it) {
        // keywords: 畳んだ旧画面の名前 (「名前突合」等) でも、行き先の行に当たるようにする。
        var kw = (it.keywords || []).some(function(k) { return String(k).toLowerCase().indexOf(q) >= 0; });
        if (!q || kw
          || it.label.toLowerCase().indexOf(q) >= 0
          || String(it.group).toLowerCase().indexOf(q) >= 0
          || g.title.toLowerCase().indexOf(q) >= 0) {
          out.push({ id: it.id, label: it.label, group: it.group,
            opener: it.opener || '', groupKey: g.key, groupTitle: g.title });
        }
      });
    });
    return out;
  }

  // パネル 1 面あたりの行数 (小見出しを 1 行と数える)。design 9b は 14 行以内。
  function rowCount(key) {
    var gs = panelGroups();
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].key !== key) continue;
      var heads = {};
      var n = 0;
      gs[i].items.forEach(function(it) {
        if (!heads[it.group]) { heads[it.group] = 1; n++; }
        n++;
      });
      return n;
    }
    return 0;
  }

  // 単独キーを持つツール。ボタン id → ショートカット表 (settings-tabs) の行 id。
  // メニューの右端にそのキーを出し、「次からはメニューを開かずに押せる」ことを
  // メニューを開いた人に見せる (キーの正本は表側。ここには文字列を書かない)。
  var KEY_ROWS = { 'btn-tab-rename': 'bulk-rename' };

  // いま効いているキー。差し替えられていればその姿で出す。無ければ ''。
  function keyHintOf(id) {
    var rowId = KEY_ROWS[id];
    if (!rowId) return '';
    var KB = window.MA.keyBindings;
    if (!KB || !KB.keysFor) return '';
    return KB.keysFor(rowId) || '';
  }

  function groups() {
    // 呼び出し側が書き換えても内部が壊れないよう複製を返す。
    return GROUPS.map(function(g) {
      return {
        key: g.key,
        title: g.title,
        items: g.items.map(function(it) {
          var o = { id: it.id, label: it.label };
          if (it.opener) o.opener = it.opener;
          return o;
        }),
      };
    });
  }

  // 畳む対象になるタブ列のボタン。下端ステータスの札・モーダルの中のボタンは
  // タブ列に居ないので数えない (畳んでも画面から消えるものではない)。
  function menuIds() {
    var ids = [];
    GROUPS.forEach(function(g) {
      g.items.forEach(function(it) {
        if (NOT_IN_TAB_BAR.indexOf(it.id) >= 0) return;
        ids.push(it.id);
      });
    });
    return ids;
  }

  function keepIds() {
    return KEEP_IN_TAB_BAR.slice();
  }

  function groupOf(id) {
    var GS = allGroups();
    for (var i = 0; i < GS.length; i++) {
      for (var j = 0; j < GS[i].items.length; j++) {
        if (GS[i].items[j].id === id) return GS[i].key;
      }
    }
    return null;
  }

  function labelOf(id) {
    var GS = allGroups();
    for (var i = 0; i < GS.length; i++) {
      for (var j = 0; j < GS[i].items.length; j++) {
        if (GS[i].items[j].id === id) return GS[i].items[j].label;
      }
    }
    return null;
  }

  // 畳む対象か。タブ列に残すものとメニューに無いものは畳まない
  // (新しいボタンが増えたとき、メニューに載せ忘れたまま画面から消えるのを避ける)。
  function isFoldable(id) {
    if (KEEP_IN_TAB_BAR.indexOf(id) >= 0) return false;
    if (NOT_IN_TAB_BAR.indexOf(id) >= 0) return false;
    return groupOf(id) !== null;
  }

  // その入口がモーダルの中にしか無いとき、先に開く画面のボタン id。無ければ ''。
  function openerOf(id) {
    var GS = allGroups();
    for (var i = 0; i < GS.length; i++) {
      for (var j = 0; j < GS[i].items.length; j++) {
        if (GS[i].items[j].id === id) return GS[i].items[j].opener || '';
      }
    }
    return '';
  }

  // 開いたときに畳むかどうか。design 7a/7b の既定は「畳む」。
  // 一度でも自分で切り替えた人 ('0' / '1' が残っている人) はその選択が勝つ。
  function foldedAtStart(saved) {
    if (saved == null || saved === '') return true;
    return saved === '1';
  }

  // design 7b: タブ列にはボタンを 1 つも置かない。7a で 25 個を「ツール ▾」1 個に
  // 畳んだが、7b はその 1 個も置かず、機能はすべて Ctrl+K から引く。
  // 既定は静か (true) で、「ツール ▾ をタブ列に出す」を押した人はその選択が残る。
  function quietAtStart(saved) {
    if (saved == null || saved === '') return true;
    return saved !== '0';
  }

  // 「ツール ▾」をタブ列に出すか。畳んでいないとき (機能ボタンが並んでいるとき) は、
  // 畳み直す入口が要るので静かの設定にかかわらず出す。
  function showsToolButton(folded, quiet) {
    if (!folded) return true;
    return !quiet;
  }

  // 静かなタブ列 (7b) でも、畳んだ機能の一覧を 1 クリックで開ける入口は残す。
  // 「ツール ▾」を出さないときに代わりに出る小さな札で、押すと同じメニューが開く。
  // コマンド名を知らない人 (新人) が Ctrl+K でしか入口に辿り着けない状態を作らない。
  function showsMiniButton(folded, quiet) {
    return !showsToolButton(folded, quiet);
  }

  // 札の文字。design 7a / 9a / 10a はどれも「ツール ▾」と書く。以前の「他 25 件」は
  // 押すまで何の 25 件か読めなかったので、件数は title (miniTitle) に回す。
  function miniLabel(count) {
    return 'ツール ▾';
  }

  // 札の title。畳んで見えなくなっているボタンの数と、Ctrl+K でも引けることを出す。
  function miniTitle(count) {
    var n = (typeof count === 'number' && count > 0) ? count : 0;
    return '畳んでいるツール ' + n + ' 件を分類から選ぶ (Ctrl+K でも同じ操作が引ける)';
  }

  // パネルの下端に出す切り替え。
  // 9b のパネルは絞り込み欄と 2 段だけで、既定 (畳む・ツール ▾ は右端) の人に切り替えは要らない。
  // 以前に自分で切り替えて既定から外れている人にだけ、既定へ戻す 1 行を出す (選んだ状態は消さない)。
  //   畳んでいない (機能ボタンがタブ列に並ぶ) → 「タブ列から畳む」
  //   畳んでいるが ツール ▾ が ＋ の隣       → 「ツール ▾ を右端へ戻す」
  function footToggles(folded, quiet) {
    if (!folded) return [{ id: 'tool-menu-fold', label: 'タブ列から畳む' }];
    if (!quiet) return [{ id: 'tool-menu-quiet', label: 'ツール ▾ を右端へ戻す' }];
    return [];
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // メニューの中身。badges は { 'btn-tab-lines': '2' } のように件数を持つものだけ渡す
  // (タブ列のボタン文字から拾った数字。0 件・未計算のものは付けない)。
  function itemHtml(it, badges) {
    var badge = (badges || {})[it.id];
    var key = keyHintOf(it.id);
    return '<button type="button" class="tool-menu-item" data-target="' + esc(it.id) + '"'
      + (it.opener ? ' data-opener="' + esc(it.opener) + '"' : '') + '>'
      + '<span class="tool-menu-label">' + esc(it.label) + '</span>'
      + (key ? '<span class="tool-menu-key">' + esc(key) + '</span>' : '')
      + (badge ? '<span class="tool-menu-badge">' + esc(badge) + '</span>' : '')
      + '</button>';
  }

  // design 9b: 左に 6 分類、右にその中身を小見出しで区切って出す 2 段のパネル。
  // 縦 1 列に 40 件近く並べていたときは「確かめる」「レビュー」が画面の下にはみ出し、
  // 何があるかを見るのにパネル内スクロールが要った。1 面 14 行以内に収める。
  function buildMenuHtml(badges) {
    var b = badges || {};
    var counts = groupCounts(b);
    var gs = panelGroups();
    var cats = gs.map(function(g, i) {
      return '<button type="button" class="tool-menu-cat" role="tab" data-group="' + esc(g.key) + '"'
        + (i === 0 ? ' aria-selected="true"' : ' aria-selected="false"') + '>'
        + '<span class="tool-cat-name">' + esc(g.title) + '</span>'
        + (counts[g.key] ? '<span class="tool-cat-count">' + esc(counts[g.key]) + '</span>' : '')
        + '</button>';
    }).join('');
    var panes = gs.map(function(g, i) {
      var head = '';
      var items = g.items.map(function(it) {
        var sub = '';
        if (it.group && it.group !== head) {
          head = it.group;
          sub = '<div class="tool-menu-sub">' + esc(head) + '</div>';
        }
        return sub + itemHtml(it, b);
      }).join('');
      return '<div class="tool-menu-group" data-group="' + esc(g.key) + '"'
        + (i === 0 ? '' : ' hidden') + '>'
        + '<div class="tool-menu-title">' + esc(g.title) + '</div>'
        + items + '</div>';
    }).join('');
    return '<div class="tool-menu-head">'
      + '<input type="search" id="tool-menu-filter" class="tool-menu-filter" autocomplete="off"'
      + ' placeholder="' + esc(FILTER_LABEL) + '" aria-label="' + esc(FILTER_LABEL) + '">'
      + '<span class="tool-menu-note">' + esc(NOTE) + '</span></div>'
      + '<div class="tool-menu-panes">'
      + '<div class="tool-menu-cats" role="tablist">' + cats + '</div>'
      + '<div class="tool-menu-items">' + panes
      + '<div class="tool-menu-hits" hidden></div></div></div>'
      + '<div class="tool-menu-files-note" id="tool-menu-files-note">' + esc(FILES_NOTE) + '</div>';
  }

  // 絞り込み中に右列へ出す一覧。どの分類のものかが分かるように分類名を添える。
  function buildHitsHtml(query, badges) {
    var hits = filterItems(query);
    if (!hits.length) {
      return '<div class="tool-menu-sub">該当なし</div>';
    }
    var head = '';
    return hits.map(function(it) {
      var sub = '';
      if (it.groupTitle !== head) {
        head = it.groupTitle;
        sub = '<div class="tool-menu-sub">' + esc(head) + '</div>';
      }
      return sub + itemHtml(it, badges);
    }).join('');
  }

  return {
    groups: groups,
    menuIds: menuIds,
    keepIds: keepIds,
    groupOf: groupOf,
    labelOf: labelOf,
    isFoldable: isFoldable,
    openerOf: openerOf,
    foldedAtStart: foldedAtStart,
    quietAtStart: quietAtStart,
    showsToolButton: showsToolButton,
    showsMiniButton: showsMiniButton,
    miniLabel: miniLabel,
    miniTitle: miniTitle,
    footToggles: footToggles,
    keyHintOf: keyHintOf,
    buildMenuHtml: buildMenuHtml,
    buildHitsHtml: buildHitsHtml,
    panelGroups: panelGroups,
    groupCounts: groupCounts,
    filterItems: filterItems,
    rowCount: rowCount,
    NOTE: NOTE,
    FILES_NOTE: FILES_NOTE,
    FILTER_LABEL: FILTER_LABEL,
  };
})();
