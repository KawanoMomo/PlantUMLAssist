'use strict';
window.MA = window.MA || {};

// export-name — 1 枚書き出し (SVG / PNG) のファイル名を決める。
//
// BLK-junior-20260915-0406: Export ▾ →「SVGとして保存」は図の title
// (@startuml の title 行) をそのままファイル名にしていた。.puml の保存名は
// 図の名前 (workspace の doc.name) なので、同じ図の spi_state.puml と
// 「SPI ドライバ 状態遷移.svg」が保存フォルダに並び、どれとどれが対か
// 名前だけでは分からなかった。
//
// .puml 側の save-target.decide は「doc.name があればそれ、無ければ title」
// という順で既に決めている。書き出しも同じ順に揃えると、.puml と画像は
// 常に同じ名前で並ぶ。zip の一括書き出し (bulk-export.plan) も doc.name を
// 使っているので、1 枚と一括で名前が食い違うこともなくなる。
window.MA.exportName = (function() {

  function _s(v) { return String(v == null ? '' : v).trim(); }

  // baseOf(doc, meta) — 拡張子の付かない書き出し名。
  // doc.name (= .puml のファイル名) → title → 'untitled' の順。
  // doc.name はファイル名として使えるとは限らない (フォルダに保存できない
  // 名前のまま開いている図がある) ので、workspace の判定を通ったものだけ採る。
  function baseOf(doc, meta) {
    var name = _s(doc && doc.name);
    var WS = window.MA.workspace;
    var ok = name !== '' && (!WS || !WS.isValidName || WS.isValidName(name));
    if (ok) return name;
    var title = _s(meta && meta.title);
    return title !== '' ? title : 'untitled';
  }

  // fileName(doc, meta, ext) — baseOf に拡張子を付ける ('svg' / 'png')。
  function fileName(doc, meta, ext) {
    var e = _s(ext).replace(/^\./, '');
    return baseOf(doc, meta) + (e ? '.' + e : '');
  }

  return { baseOf: baseOf, fileName: fileName };
})();
