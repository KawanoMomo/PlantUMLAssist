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
      { id: 'btn-tab-part',     label: '部品を起こす (6 図種まとめて)' },
      { id: 'btn-tab-template', label: 'テンプレートから作る' },
      { id: 'btn-tab-skeleton', label: '骨格から作る' },
      { id: 'btn-tab-set',      label: '系統ごと複製する' },
      { id: 'btn-tab-draft',    label: '一時控えにする' },
    ] },
    { key: 'edit', title: '書き換える', items: [
      { id: 'btn-tab-lines',  label: '行を書き換える' },
      { id: 'btn-tab-rename', label: '部品名を一括置換する' },
      { id: 'btn-tab-unify',  label: '表記を登録簿に揃える' },
      { id: 'btn-tab-apply',  label: '複数クラスに一括適用する' },
    ] },
    { key: 'find', title: '探す', items: [
      { id: 'btn-tab-symptom', label: '症状から関連図を探す' },
      { id: 'btn-tab-blame',   label: '部品名の混入点を探す' },
      { id: 'btn-tab-xref',    label: '部品名で図をまたいで辿る' },
    ] },
    { key: 'check', title: '確かめる', items: [
      { id: 'btn-tab-audit',          label: '名前の表記揺れ' },
      { id: 'btn-tab-family',         label: '系統内の動作名のずれ' },
      { id: 'btn-tab-drivermap',      label: '系統マップの崩れ' },
      { id: 'btn-tab-trace',          label: '状態遷移のトレース漏れ' },
      { id: 'btn-tab-pattern',        label: '1 つの観点で全図を棚卸し' },
      { id: 'btn-tab-submit',         label: '提出前チェック' },
      // BLK-owner-20260918-0429-prune: 「渡してよいか」を数える突合。ここに載るまでは
      // Ctrl+K でしか辿り着けず、同じ目的の 6 つで 1 つだけ入口が違っていた。
      { id: 'btn-tab-handover',       label: '引き継ぎチェックリスト' },
      { id: 'btn-tab-cross',          label: '突合ボード (1 画面で全部)' },
      { id: 'btn-tab-design',         label: '仕様 (design) と現在値の突合' },
      { id: 'btn-tab-audit-timeline', label: '監査履歴' },
    ] },
    // BLK-owner-20260918-0529-prune: 「2 枚を左右に並べて食い違いを見る」機能が 5 つあり、
    // 入口が 参照ペインのタブ / 下端ステータス / ツール ▾ / 変更サマリボードの中 に散って、
    // 呼び名も「並べて見る」「比較」「差分」「見比べる」で割れていた。5 つともここから開け、
    // 名前は「…と見比べる」で揃える。文脈内のショートカット (参照ペインのタブ・下端の
    // 「前回保存版 ＋a −b」・🔍) はそのまま残すので、覚えている人の手は変わらない。
    // opener は、その入口がモーダルの中にしか無いもの (先に開く画面) の id。
    { key: 'review', title: 'レビュー', items: [
      { id: 'btn-tab-compare',  label: '別の図と見比べる' },
      { id: 'status-livediff',  label: '前回保存版と見比べる' },
      { id: 'btn-tab-peek',     label: '他の保存フォルダの版と見比べる' },
      { id: 'btn-tab-review',   label: '基準の図と見比べる' },
      { id: 'dp-review',        label: '変更前後を見比べる', opener: 'btn-tab-delivery' },
      { id: 'btn-tab-pins',     label: 'この図の指摘' },
      { id: 'btn-tab-inbox',    label: '図をまたぐ指摘箱' },
      { id: 'btn-tab-findings', label: '手動指摘の台帳' },
      { id: 'btn-tab-diff',     label: '前回保存からの差分' },
      { id: 'btn-tab-versions', label: 'この図の変遷' },
      { id: 'btn-tab-lineage',  label: 'この図の継承元' },
      { id: 'btn-tab-board',    label: '変更サマリ' },
    ] },
    // BLK-owner-20260918-0329-prune: 「渡す」(引き継ぎ zip / 納品パッケージ zip) はこのメニューに
    // 出さない。zip にして渡す入口は Export ▾ の「渡す」1 か所に集めた。分類と言い換えは
    // MOVED_TO_EXPORT に残すので、Ctrl+K では今まで通り「渡す」の分類・同じ名前で引ける。
  ];

  // メニューからは外したが、分類と言い換えは生きているもの (入口は Export ▾)。
  var MOVED_TO_EXPORT = [
    { key: 'give', title: '渡す', items: [
      { id: 'btn-tab-handoff',  label: '引き継ぎ zip' },
      { id: 'btn-tab-delivery', label: '納品パッケージ zip' },
    ] },
  ];

  function allGroups() {
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

  var NOTE = 'Ctrl+K でも同じ操作が引ける';

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
  function buildMenuHtml(badges) {
    var b = badges || {};
    var body = GROUPS.map(function(g) {
      var items = g.items.map(function(it) {
        var badge = b[it.id];
        var key = keyHintOf(it.id);
        return '<button type="button" class="tool-menu-item" data-target="' + esc(it.id) + '"'
          + (it.opener ? ' data-opener="' + esc(it.opener) + '"' : '') + '>'
          + '<span class="tool-menu-label">' + esc(it.label) + '</span>'
          + (key ? '<span class="tool-menu-key">' + esc(key) + '</span>' : '')
          + (badge ? '<span class="tool-menu-badge">' + esc(badge) + '</span>' : '')
          + '</button>';
      }).join('');
      return '<div class="tool-menu-group" data-group="' + esc(g.key) + '">'
        + '<div class="tool-menu-title">' + esc(g.title) + '</div>'
        + items + '</div>';
    }).join('');
    return '<div class="tool-menu-note">' + esc(NOTE) + '</div>' + body;
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
    NOTE: NOTE,
  };
})();
