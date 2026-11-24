'use strict';
window.MA = window.MA || {};

// export-name — 1 枚書き出し (SVG / PNG) のファイル名を決める。
//
// Export ▾ →「SVGとして保存」は図の title
// (@startuml の title 行) をそのままファイル名にしていた。.puml の保存名は
// 図の名前 (workspace の doc.name) なので、同じ図の spi_state.puml と
// 「SPI ドライバ 状態遷移.svg」が保存フォルダに並び、どれとどれが対か
// 名前だけでは分からなかった。
//
// .puml 側の save-target.decide は「doc.name があればそれ、無ければ title」
// という順で既に決めている。書き出しも同じ順に揃えると、.puml と画像は
// 常に同じ名前で並ぶ (zip の一括書き出しは TICKET-owner-20261116-0140-prune で外した)。
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

  // kindFileName(doc, meta, kind) — 書き出しの種類 ('svg' / 'png' / 'png-transparent') のダウンロード名。
  // TICKET-owner-20261124-0342-3: 保存先の無い図の透過 PNG も、保存先の図・まとめての書き出しと同じく
  // `{名前}.transparent.png` (通常の PNG `{名前}.png` と名前で分かれる)。末尾の決め方は MA.exportDest.fileName の 1 か所。
  var KIND_EXT = { 'svg': '.svg', 'png': '.png', 'png-transparent': '.transparent.png' };
  function kindFileName(doc, meta, kind) {
    var base = baseOf(doc, meta);
    var ED = window.MA.exportDest;
    if (ED && ED.fileName && ED.KINDS && ED.KINDS[kind]) return ED.fileName(base, kind);
    return base + (KIND_EXT[kind] || '');
  }

  return { baseOf: baseOf, fileName: fileName, kindFileName: kindFileName };
})();
