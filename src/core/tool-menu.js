'use strict';
window.MA = window.MA || {};

// tool-menu — 道具の一覧「ツール ▾」(タブ列の右端の 1 つ。design 7a)。
//
// タブ列は図のタブ (今どれを見ているか) と ＋ と ツール ▾ だけ。道具 (何をするか) は
// ツール ▾ の 1 段の一覧から選ぶ。タブ列に道具のボタンを並べる切り替え (畳む / 畳まない・
// ツール ▾ の置き場) は TICKET-owner-20261123-0222-prune で外した (入口は 1 つ)。
// 項目の id は道具の名前 (tool-*) で、窓を開く処理は app.js の runTool が持つ
// (同じ id を Ctrl+K のコマンドパレット・Ctrl+H・ファイルの右クリックも使う)。
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.toolMenu = (function() {
  // 分類と並びは design 7a のパネルに合わせる。label はメニュー上の文言で、
  // 「何をするか」で読める形にする。
  var GROUPS = [
    { key: 'edit', title: '書き換える', items: [
      { id: 'tool-lines',  label: '行を書き換える', group: 'まとめて直す' },
      { id: 'tool-rename', label: '部品名を一括置換する', group: 'まとめて直す' },
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
  // Ctrl+K / Ctrl+P からは今まで通りの名前で引ける。
  var MOVED_TO_FILES = [
    { key: 'file', title: 'ファイル', items: [
      // 語は FILES のファイルの右クリックと同じ (TICKET-owner-20261123-1242-1)。
      { id: 'tool-versions', label: 'この図の履歴を表示', group: 'ファイルの右クリック' },
      // フォルダの図を覗く窓は TICKET-owner-20261115-2141-prune で外した。
    ] },
  ];
  // 前の版と比べるのは「この図の履歴」の行の「比較」から (TICKET-owner-20261115-2141-prune)。
  var FILES_NOTE = 'ファイル単位の操作（開く・この図の履歴（前の版との比較）・名前変更・削除…）は FILES のファイルを右クリック。'
    + '隣の保存フォルダは FILES の読むだけ（図を押すと右の枠に出ます）';

  function allGroups() {
    return GROUPS.concat(MOVED_TO_EXPORT).concat(MOVED_TO_FILES);
  }

  // メニューに並べる分類 (右クリックへ移したものは入れない)。
  function menuGroups() {
    return GROUPS.concat(MOVED_TO_EXPORT);
  }

  // 絞り込み欄の右端に出す注記。
  var NOTE = 'Ctrl+K でも引けます';
  var FILTER_LABEL = 'ツールを絞り込む';

  // 一覧に並べる項目を分類ごとに返す (絞り込みと Ctrl+K の見出しが使う)。
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

  // 絞り込み。分類名・小見出し・項目名のどれかに当たれば残す。
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

  // 一覧の行数 (小見出しを 1 行と数える)。パネルの中をスクロールさせない 14 行以内に収める。
  function rowCount() {
    var heads = {};
    var n = 0;
    panelGroups().forEach(function(g) {
      g.items.forEach(function(it) {
        if (!heads[it.group]) { heads[it.group] = 1; n++; }
        n++;
      });
    });
    return n;
  }

  // 単独キーを持つツール。ボタン id → ショートカット表 (settings-tabs) の行 id。
  // メニューの右端にそのキーを出し、「次からはメニューを開かずに押せる」ことを
  // メニューを開いた人に見せる (キーの正本は表側。ここには文字列を書かない)。
  var KEY_ROWS = { 'tool-rename': 'bulk-rename' };

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

  // 一覧に載る道具の id (並び順)。
  function menuIds() {
    var ids = [];
    GROUPS.forEach(function(g) {
      g.items.forEach(function(it) { ids.push(it.id); });
    });
    return ids;
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

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // メニューの中身。badges は { 'tool-lines': '2' } のように件数を持つものだけ渡す
  // (0 件・未計算のものは付けない。今は件数を持つ道具が無いので呼ぶ側は空で渡す)。
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

  // 項目を小見出しで区切って並べる (同じ小見出しは 1 度だけ出す)。
  function listHtml(items, badges) {
    var head = '';
    return items.map(function(it) {
      var sub = '';
      if (it.group && it.group !== head) {
        head = it.group;
        sub = '<div class="tool-menu-sub">' + esc(head) + '</div>';
      }
      return sub + itemHtml(it, badges);
    }).join('');
  }

  // 残った道具だけの 1 段の一覧 (整理表 #4)。左の分類の列は持たない
  // (分類の中身が外れて残りは数行になり、分類を選ぶ 1 手が要らなくなった)。
  function buildMenuHtml(badges) {
    var b = badges || {};
    var items = [];
    panelGroups().forEach(function(g) { items = items.concat(g.items); });
    return '<div class="tool-menu-head">'
      + '<input type="search" id="tool-menu-filter" class="tool-menu-filter" autocomplete="off"'
      + ' placeholder="' + esc(FILTER_LABEL) + '" aria-label="' + esc(FILTER_LABEL) + '">'
      + '<span class="tool-menu-note">' + esc(NOTE) + '</span></div>'
      + '<div class="tool-menu-items">'
      + '<div class="tool-menu-list">' + listHtml(items, b) + '</div>'
      + '<div class="tool-menu-hits" hidden></div></div>'
      + '<div class="tool-menu-files-note" id="tool-menu-files-note">' + esc(FILES_NOTE) + '</div>';
  }

  // 絞り込み中に一覧の代わりに出す候補。
  function buildHitsHtml(query, badges) {
    var hits = filterItems(query);
    if (!hits.length) {
      return '<div class="tool-menu-sub">該当なし</div>';
    }
    return listHtml(hits, badges);
  }

  return {
    groups: groups,
    menuIds: menuIds,
    groupOf: groupOf,
    labelOf: labelOf,
    openerOf: openerOf,
    keyHintOf: keyHintOf,
    buildMenuHtml: buildMenuHtml,
    buildHitsHtml: buildHitsHtml,
    panelGroups: panelGroups,
    filterItems: filterItems,
    rowCount: rowCount,
    NOTE: NOTE,
    FILES_NOTE: FILES_NOTE,
    FILTER_LABEL: FILTER_LABEL,
  };
})();
