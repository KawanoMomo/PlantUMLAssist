'use strict';
window.MA = window.MA || {};

// export-shortcuts — Export メニューのキー割り当て (design 2c)。
//
// design 2c は「上部バーに残す唯一のボタン。4 項目だけで、よく使う 2 つに
// ショートカットを割り当てる」。図を書き出すたびに Export ▾ を開いて行を探す
// 2 手を、キー 1 発に畳む。ここは DOM に触らない純関数だけを置き、
// 実際の書き出しと結線は app.js。
window.MA.exportShortcuts = (function() {

  // design 2c のアートボードに出ている 2 つだけ。増やすときは設定の
  // ショートカット一覧 (settings-tabs) にも同時に足す。
  var BINDINGS = [
    { id: 'exp-svg',       keys: 'Ctrl+Shift+S', key: 's', desc: 'SVG として保存' },
    { id: 'exp-clipboard', keys: 'Ctrl+Shift+C', key: 'c', desc: 'クリップボードにコピー' },
  ];

  function bindings() {
    return BINDINGS.map(function(b) {
      return { id: b.id, keys: b.keys, key: b.key, desc: b.desc };
    });
  }

  // メニュー行の右に出す表示。割り当てが無い行は空文字 (行の形は変えない)。
  function keyHintFor(id) {
    for (var i = 0; i < BINDINGS.length; i++) if (BINDINGS[i].id === id) return BINDINGS[i].keys;
    return '';
  }

  // keydown が書き出しに当たるか。当たるなら押すべきボタンの id を返す。
  //
  // - Ctrl(Windows) と Meta(mac) の両方を受ける。Alt 付きは別物として弾く。
  //   Shift 必須なので、ブラウザの Ctrl+S (ページ保存) / Ctrl+C (コピー) は奪わない。
  // - e.key はレイアウトや Shift で 'S' にも 's' にもなるので小文字で比べる。
  //   IME 変換中 (isComposing / keyCode 229) は素通しする。
  function matchEvent(e) {
    if (!e || e.isComposing || e.keyCode === 229) return null;
    if (!(e.ctrlKey || e.metaKey)) return null;
    if (!e.shiftKey || e.altKey) return null;
    var k = String(e.key || '').toLowerCase();
    for (var i = 0; i < BINDINGS.length; i++) {
      if (BINDINGS[i].key === k) return BINDINGS[i].id;
    }
    return null;
  }

  // 設定の「ショートカット」タブへ流し込む行。settings-tabs の SHORTCUTS と
  // 同じ形 ({ keys, desc }) にそろえ、一覧の作り方を 1 本にする。
  function shortcutRows() {
    return BINDINGS.map(function(b) { return { keys: b.keys, desc: b.desc }; });
  }

  return {
    bindings: bindings,
    keyHintFor: keyHintFor,
    matchEvent: matchEvent,
    shortcutRows: shortcutRows,
  };
})();
