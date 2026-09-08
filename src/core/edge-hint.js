'use strict';

// edge-hint — 矢印にマウスを乗せたときに出す「From → To」の文言。
//
// BLK-junior-20260908-1703: 1 つの部品から出る点線が 2 本あると、色も太さも
// 同じなので見分けが付かない。1 本クリックしては右パネルの From/To を読み、
// 違えばもう 1 本、という当て物になっていた (関係が増えるほど当たりにくい)。
// クリックしないと相手が分からない、が原因なので、乗せた時点で相手を出す。
//
// 文言を作るだけで、DOM にもサーバにも触らない。node からも require できる。
(function() {

  // 種類の日本語。矢印の記号 (`..>`) だけでは「依存」と読めない人が居るため
  // 併記する。相手 (From/To) が主で、種類は括弧に落とす。
  var KIND_LABEL = {
    association: '関連',
    dependency: '依存',
    provides: '提供',
    requires: '要求',
    inheritance: '継承',
    implementation: '実現',
    composition: '合成',
    aggregation: '集約',
    nested: '入れ子',
  };

  // 種類しか分からないときの矢印。parse 済みの relation は arrow を持つので
  // 普段は使わない (書かれた記号をそのまま見せる方が DSL と突き合わせやすい)。
  var KIND_ARROW = {
    association: '-->',
    dependency: '..>',
    provides: '-()',
    requires: ')-',
    inheritance: '<|--',
    implementation: '<|..',
    composition: '*--',
    aggregation: 'o--',
    nested: '+--',
  };

  function _s(v) { return v == null ? '' : String(v); }

  function arrowOf(rel) {
    var r = rel || {};
    return _s(r.arrow) || KIND_ARROW[_s(r.kind)] || '--';
  }

  function kindLabel(kind) { return KIND_LABEL[_s(kind)] || ''; }

  // 乗せたときに出す 1 行。「GpioDrv ..> IrqCtrl（依存 / L12）」。
  // 行番号まで出すのは、DSL 側で直したい人がその行へ直接飛べるようにするため。
  function hintText(rel) {
    var r = rel || {};
    var from = _s(r.from), to = _s(r.to);
    if (!from && !to) return '';
    var main = from + ' ' + arrowOf(r) + ' ' + to;
    if (_s(r.label)) main += ' : ' + _s(r.label);
    var tail = [];
    var kl = kindLabel(r.kind);
    if (kl) tail.push(kl);
    if (r.line) tail.push('L' + r.line);
    return tail.length ? main + '（' + tail.join(' / ') + '）' : main;
  }

  // overlay の rect に持たせる属性。乗せたときに読むのはこれだけで、
  // 図の再描画を待たずに文言が出る。
  function hintAttrs(rel) {
    var r = rel || {};
    var text = hintText(r);
    if (!text) return {};
    return {
      'data-hint': text,
      'data-from': _s(r.from),
      'data-to': _s(r.to),
    };
  }

  var api = {
    KIND_LABEL: KIND_LABEL, KIND_ARROW: KIND_ARROW,
    arrowOf: arrowOf, kindLabel: kindLabel,
    hintText: hintText, hintAttrs: hintAttrs,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.edgeHint = api;
  }
})();
