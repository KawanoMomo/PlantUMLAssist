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
    { key: 'make', title: '図をつくる', items: [
      { id: 'btn-tab-part',     label: '部品を起こす (6 図種まとめて)', group: '起こす' },
      { id: 'btn-tab-template', label: 'テンプレートから作る', group: '起こす' },
      { id: 'btn-tab-skeleton', label: '骨格から作る', group: '起こす' },
      { id: 'btn-tab-set',      label: '系統ごと複製する', group: '複製と控え' },
    ] },
    { key: 'edit', title: '書き換える', items: [
      { id: 'btn-tab-lines',  label: '行を書き換える', group: 'まとめて直す' },
      { id: 'btn-tab-rename', label: '部品名を一括置換する', group: 'まとめて直す' },
      { id: 'btn-tab-unify',  label: '表記を登録簿に揃える', group: '表記を揃える' },
      { id: 'btn-tab-apply',  label: '複数クラスに一括適用する', group: 'まとめて直す' },
    ] },
    { key: 'find', title: '探す', items: [
      { id: 'btn-tab-symptom', label: '症状から関連図を探す', group: '図をたどる' },
      { id: 'btn-tab-blame',   label: '部品名の混入点を探す', group: '図をたどる' },
      { id: 'btn-tab-xref',    label: '部品名で図をまたいで辿る', group: '図をたどる' },
    ] },
    { key: 'check', title: '確かめる', items: [
      { id: 'btn-tab-audit',          label: '名前の表記揺れ', group: '名前と系統' },
      { id: 'btn-tab-family',         label: '系統内の動作名のずれ', group: '名前と系統' },
      { id: 'btn-tab-drivermap',      label: '系統マップの崩れ', group: '名前と系統' },
      { id: 'btn-tab-trace',          label: '状態遷移のトレース漏れ', group: '名前と系統' },
      { id: 'btn-tab-pattern',        label: '1 つの観点で全図を棚卸し', group: 'まとめて点検' },
      { id: 'btn-tab-submit',         label: '提出前チェック', group: '渡す前に' },
      // BLK-owner-20260918-0429-prune: 「渡してよいか」を数える突合。ここに載るまでは
      // Ctrl+K でしか辿り着けず、同じ目的の 6 つで 1 つだけ入口が違っていた。
      { id: 'btn-tab-handover',       label: '引き継ぎチェックリスト', group: '渡す前に' },
      { id: 'btn-tab-cross',          label: '突合ボード (1 画面で全部)', group: 'まとめて点検' },
      { id: 'btn-tab-design',         label: '仕様 (design) と現在値の突合', group: 'まとめて点検' },
      { id: 'btn-tab-audit-timeline', label: '監査履歴', group: '渡す前に' },
    ] },
    // BLK-owner-20260923-1307-prune: 「2 つの版・2 枚の図を並べて違いを見る」入口を 2 つに絞る。
    // 前の回 (BLK-owner-20260918-0529-prune) は 5 つの入口をここに並べて名前だけ揃えたが、
    // 目的が同じ画面が 5 つ並ぶこと自体が「どれを開けばよいか」を選ばせていた。
    // 残すのは ⇔ 並べて見る (版どうし・図どうしを並べる正面) と 🔍 変更前後を見比べる
    // (資料・会議で見せる) の 2 つだけ。前回保存版 / 他フォルダの版 / 基準の図 は
    // ⇔ 並べて見る の相手 (compare-select の候補) になったので、ここには並べない。
    // 文脈内のショートカット (下端の「前回保存版 ＋a −b」・👀 他フォルダ・👁 レビュー) は
    // そのまま残し、押すと ⇔ 並べて見る をその相手で開く。
    // opener は、その入口がモーダルの中にしか無いもの (先に開く画面) の id。
    { key: 'review', title: 'レビュー', items: [
      // BLK-owner-20260923-1509-prune: 並べる面はタブ列の「並べて比較」1 つに統合した。
      // ⇔ 並べて見る (別タブの図) と 🔍 変更前後を見比べる (前回保存版) は
      // その枠の「相手」になったので、ここに別の入口としては並べない
      // (🔍 は ▤ 変更サマリボードの中には残る。提出前に全件を見る文脈)。
      // 並べる画面ではない道具。覗く・指摘を出すのが目的で、並べるのは ⇔ 並べて見る に任せる。
      { id: 'btn-tab-peek',     label: '他の保存フォルダを覗く', group: '見比べる' },
      { id: 'btn-tab-review',   label: '基準の図との指摘', group: '指摘' },
      { id: 'btn-tab-pins',     label: 'この図の指摘', group: '指摘' },
      { id: 'btn-tab-inbox',    label: '図をまたぐ指摘箱 (手で書いた指摘も出典で絞れる)', group: '指摘' },
      { id: 'btn-tab-diff',     label: '前回保存からの差分', group: '変更の履歴' },
      { id: 'btn-tab-lineage',  label: 'この図の継承元', group: '変更の履歴' },
      { id: 'btn-tab-board',    label: '変更サマリ', group: '変更の履歴' },
    ] },
    // BLK-owner-20260918-0329-prune: 「渡す」(引き継ぎ zip / 納品パッケージ zip) はこのメニューに
    // 出さない。zip にして渡す入口は Export ▾ の「渡す」1 か所に集めた。分類と言い換えは
    // MOVED_TO_EXPORT に残すので、Ctrl+K では今まで通り「渡す」の分類・同じ名前で引ける。
  ];

  // メニューからは外したが、分類と言い換えは生きているもの (入口は Export ▾)。
  var MOVED_TO_EXPORT = [
    { key: 'give', title: '渡す', items: [
      { id: 'btn-tab-handoff',  label: '引き継ぎ zip', group: 'zip にして渡す' },
      { id: 'btn-tab-delivery', label: '納品パッケージ zip', group: 'zip にして渡す' },
    ] },
  ];

  // BLK-human-20260923-1701 (design 10b): ファイル 1 枚に対する操作は FILES ツリーの
  // 右クリックに集めた。メニューには並べず案内 1 行に落とす。分類と言い換えは残すので、
  // Ctrl+K / Ctrl+P からは今まで通りの名前で引ける (ボタンの実体もそのまま)。
  var MOVED_TO_FILES = [
    { key: 'file', title: 'ファイル', items: [
      { id: 'btn-tab-draft',    label: '一時控えにする', group: 'ファイルの右クリック' },
      { id: 'btn-tab-versions', label: 'この図の変遷', group: 'ファイルの右クリック' },
    ] },
  ];
  var FILES_NOTE = 'ファイル単位の操作（開く・並べて比較・前回保存版と比較・履歴・名前変更・一時控え・削除…）は FILES のファイルを右クリック';

  function allGroups() {
    return GROUPS.concat(MOVED_TO_EXPORT).concat(MOVED_TO_FILES);
  }

  // メニューの 6 分類 (右クリックへ移したものは入れない)。
  function menuGroups() {
    return GROUPS.concat(MOVED_TO_EXPORT);
  }

  // タブ列に残すもの。図そのものの出し入れ (＋ / 📂 一覧) はツールではないので畳まない。
  // ⇔ 先輩の図 (BLK-junior-20260914-1406-wish) も畳まない。開いて終わる道具ではなく
  // 画面の枠の出し入れで、畳むと「据え置き」の値打ち (深い経路を通らない) が消える。
  // 📄 ファイルを開く (BLK-human-20260917-0901) も図の出し入れなので畳まない。
  var KEEP_IN_TAB_BAR = ['btn-tab-new', 'btn-tab-folder', 'btn-open-file', 'btn-tab-senior'];

  // メニューには載るが、タブ列のボタンではないもの (下端ステータスの札・モーダルの中の
  // ボタン)。畳む対象に数えると「他 N 件」の N が実際に消えた数とずれるので外す。
  var NOT_IN_TAB_BAR = ['status-livediff', 'dp-review'];

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
        items: g.items.map(function(it) {
          var o = { id: it.id, label: it.label, group: it.group || '' };
          if (it.opener) o.opener = it.opener;
          return o;
        }),
      };
    });
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
        if (!q
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

  // 札の文字。畳んで見えなくなっているボタンの数を出す (「他 25 件」)。
  function miniLabel(count) {
    var n = (typeof count === 'number' && count > 0) ? count : 0;
    return '他 ' + n + ' 件';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // メニューの中身。badges は { 'btn-tab-diff': '2' } のように件数を持つものだけ渡す
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
