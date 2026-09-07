'use strict';
// relation-kind-cards — 関係の種類を「UML の名称が主・意味の説明が従」のカードで選ばせる。
// design/PlantUMLAssist - 1a 図種展開.dc.html の 3b。プルダウンのラベル (`Provides (-())`)
// は記法しか伝えないため、記法を知らない利用者はどれを選べばよいか決められない。
window.MA = window.MA || {};
window.MA.relationKindCards = (function() {

  // 図種ごとの関係の種類。name は UML の名称(主)、desc は意味の説明(従)。
  var KINDS = {
    component: [
      { value: 'association', name: '関連 / association',  desc: '部品どうしが接続されている' },
      { value: 'dependency',  name: '依存 / dependency',   desc: '一方が他方を利用している' },
      { value: 'provides',    name: '提供 / provides',     desc: '部品がインターフェースを提供する' },
      { value: 'requires',    name: '要求 / requires',     desc: '部品がインターフェースを必要とする' },
    ],
  };

  // 向きが固定の種類。部品 → インターフェース の並びに揃える。
  var FIXED_ORIENTATION = { provides: true, requires: true };

  function kindsOf(diagram) {
    return (KINDS[diagram] || []).slice();
  }

  function isFixedOrientation(kind) {
    return !!FIXED_ORIENTATION[kind];
  }

  // orient: 向きが固定の種類なら from が部品・to がインターフェースになるよう並べ替える。
  // kindOf(id) は 'component' / 'interface' / それ以外を返す関数。
  // 判定できない (どちらも interface でない等) ときは並べ替えない。
  function orient(kind, from, to, kindOf) {
    var unchanged = { from: from, to: to, swapped: false };
    if (!isFixedOrientation(kind)) return unchanged;
    if (typeof kindOf !== 'function') return unchanged;
    var fk = kindOf(from), tk = kindOf(to);
    if (fk === 'interface' && tk === 'component') {
      return { from: to, to: from, swapped: true };
    }
    return unchanged;
  }

  // kindOfFromParsed: parse 結果から id → kind の引き当て関数を作る
  function kindOfFromParsed(parsed) {
    var map = {};
    var elts = (parsed && parsed.elements) || [];
    for (var i = 0; i < elts.length; i++) {
      if (elts[i].id) map[elts[i].id] = elts[i].kind;
    }
    return function(id) { return map[id]; };
  }

  var esc = function(s) { return window.MA.htmlUtils.escHtml(s); };

  // cardsHtml: 見出し + カード列。各カードは class=<cls>、data-value に種類を持つ。
  function cardsHtml(cls, kinds, current) {
    var html = '<div style="margin-bottom:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:4px;">関係の種類 / Relation</label>';
    for (var i = 0; i < kinds.length; i++) {
      var k = kinds[i];
      var on = k.value === current;
      html += '<button type="button" class="' + cls + (on ? ' active' : '') + '"' +
        ' data-value="' + esc(k.value) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
        ' style="display:block;width:100%;text-align:left;margin-bottom:4px;padding:6px 8px;border-radius:6px;cursor:pointer;' +
        'background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';' +
        'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';' +
        'color:' + (on ? '#fff' : 'var(--text-primary)') + ';">' +
        '<span style="display:block;font-size:12px;">' + esc(k.name) + '</span>' +
        '<span style="display:block;font-size:10px;opacity:0.75;">' + esc(k.desc) + '</span>' +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  // moreSettingsHtml: 3c の共通パレット。ここでは折りたたみの枠だけを出す。
  function moreSettingsHtml(id) {
    return '<button type="button" id="' + id + '"' +
      ' aria-expanded="false"' +
      ' style="display:block;width:100%;padding:7px;margin-bottom:8px;border-radius:8px;cursor:pointer;' +
      'background:var(--bg-tertiary);border:1px dashed var(--border);color:var(--text-secondary);font-size:12px;">' +
      'その他の設定… <span style="font-size:10px;">▾</span></button>';
  }

  var FIXED_NOTE = '提供 / 要求 は向きが固定です。選ぶと 部品 → インターフェース の向きに自動で並べ替えます。';

  // noteHtml: 向き固定の注記。常に出す (選ぶ前に読めなければ意味がない)
  function noteHtml() {
    return '<div style="margin-bottom:8px;padding:6px 8px;border-radius:6px;' +
      'background:var(--bg-tertiary);color:var(--text-secondary);font-size:10px;line-height:1.5;">' +
      esc(FIXED_NOTE) + '</div>';
  }

  // headerHtml: いまどの線を触っているかを平文で出す (`Relation · 10 行目` / `WebApp → Logger`)
  function headerHtml(line, from, to) {
    return '<div style="margin-bottom:8px;">' +
      '<div style="font-size:10px;color:var(--accent);font-weight:bold;">Relation · ' + line + ' 行目</div>' +
      '<div style="font-size:13px;color:var(--text-primary);">' + esc(from) + ' → ' + esc(to) + '</div>' +
      '</div>';
  }

  function bindCards(propsEl, cls, onPick) {
    if (!propsEl) return;
    var btns = propsEl.querySelectorAll('.' + cls);
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() { onPick(btn.getAttribute('data-value')); });
      })(btns[i]);
    }
  }

  return {
    KINDS: KINDS,
    FIXED_NOTE: FIXED_NOTE,
    kindsOf: kindsOf,
    isFixedOrientation: isFixedOrientation,
    orient: orient,
    kindOfFromParsed: kindOfFromParsed,
    cardsHtml: cardsHtml,
    moreSettingsHtml: moreSettingsHtml,
    noteHtml: noteHtml,
    headerHtml: headerHtml,
    bindCards: bindCards,
  };
})();
