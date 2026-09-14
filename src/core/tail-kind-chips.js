'use strict';
// design「1a 展開」2b — 無選択時の右ペイン（追加タブ）の種別チップ。
//
// 「末尾に追加」の種別はプルダウン 1 個だった。何が足せるかは開くまで分からず、
// 選ぶのに 2 手かかる。ここでは同じ選択肢を横並びのチップにして 1 クリックで決める。
//
// 値の持ち主は従来どおり `<select id="{selectId}">` のままにする。チップは押すと
// select の値を変えて change を投げるだけなので、種別ごとの詳細フォームを出す
// 各図種モジュールの分岐は 1 本のまま古びない。チップの文字も select の option から
// 読むので、選択肢を増やしたときにチップ側だけ古いということが起きない。
window.MA = window.MA || {};
window.MA.tailKindChips = (function() {
  function esc(s) { return window.MA.htmlUtils.escHtml(s); }

  // shortLabel: '注釈 (note)' → '注釈'、'一括 (複数行)' → '一括'。
  // 括弧の中は選択肢を見分けるための補足なので、チップでは title に回して幅を詰める。
  function shortLabel(label) {
    var s = String(label == null ? '' : label).trim();
    var cut = s.replace(/\s*[（(][^）)]*[）)]?\s*$/, '').trim();
    return cut || s;
  }

  // idPart: value をそのまま id に使えない文字 (alt/loop の '/' など) を潰す。
  function idPart(value) {
    return String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '_');
  }

  // chipModels: select の option 相当の配列 + 現在値 → チップ 1 個ずつの姿。
  function chipModels(options, current) {
    var list = options || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var value = list[i].value;
      out.push({
        value: value,
        label: shortLabel(list[i].label),
        title: String(list[i].label == null ? '' : list[i].label).trim(),
        active: value === current,
      });
    }
    return out;
  }

  // moveIndex: ← → でチップ間を移る。端では巻き戻る (端で止まると
  // 「もう無い」のか「効いていない」のか押した側から見分けられないため)。
  function moveIndex(len, current, delta) {
    if (!len || len <= 0) return -1;
    var i = current;
    if (i < 0 || i >= len) i = 0;
    else i = (i + delta) % len;
    if (i < 0) i += len;
    return i;
  }

  function chipsHtml(idPrefix, models) {
    var btns = '';
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var on = !!m.active;
      btns += '<button type="button" class="prop-seg' + (on ? ' active' : '') + '"'
        + ' id="' + esc(idPrefix) + '-chip-' + esc(idPart(m.value)) + '"'
        + ' data-value="' + esc(m.value) + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' tabindex="' + (on ? '0' : '-1') + '"'
        + ' title="' + esc(m.title) + '"'
        + ' style="background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';'
        + 'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';'
        + 'color:' + (on ? '#fff' : 'var(--text-primary)') + ';'
        + 'font-size:11px;padding:3px 8px;border-radius:11px;cursor:pointer;">'
        + esc(m.label) + '</button>';
    }
    return '<div id="' + esc(idPrefix) + '-chips" role="group" aria-label="追加する種別"'
      + ' style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">' + btns + '</div>';
  }

  // paint: 現在値に合わせてチップの見た目と aria/tabindex を揃える。
  function paint(chipsEl, current) {
    if (!chipsEl) return;
    var btns = chipsEl.querySelectorAll('.prop-seg');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-value') === current;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      btns[i].setAttribute('tabindex', on ? '0' : '-1');
      btns[i].style.background = on ? 'var(--accent)' : 'var(--bg-tertiary)';
      btns[i].style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      btns[i].style.color = on ? '#fff' : 'var(--text-primary)';
    }
  }

  // ── 一括入力の呼び込み (BLK-junior-20260907-1903) ────────────────────────
  // 「一括 (複数行)」は種別の並びの最後にあり、チップにすると文字も「一括」の 2 字。
  // 4 部品 + 6 関係のコンポーネント図を 1 件ずつ足し切ってから、後で存在に気付く、
  // ということが起きる。何が足せるかの列とは別に、「まとめて入れられる」ことだけを
  // 言う 1 行を常に出す。どの種別を選んでいても 1 クリックで一括欄に入れる。
  var BULK_VALUE = 'bulk';

  function bulkOption(options) {
    var list = options || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === BULK_VALUE) return list[i];
    }
    return null;
  }

  // promoModel: 一括の選択肢が無ければ null (呼び込む先が無いので出さない)。
  function promoModel(options, current) {
    var opt = bulkOption(options);
    if (!opt) return null;
    var active = current === BULK_VALUE;
    return {
      value: BULK_VALUE,
      active: active,
      label: active ? '⊞ まとめて入れる — 選択中' : '⊞ まとめて入れる',
      hint: active
        ? '下の欄に 1 行 1 件で書いて、まとめて末尾に追加します'
        : '要素も関係も 1 行 1 件で書けます。1 件ずつ足さなくて済みます',
    };
  }

  function promoHtml(idPrefix, model) {
    if (!model) return '';
    var on = !!model.active;
    return '<button type="button" id="' + esc(idPrefix) + '-bulk-promo"'
      + ' data-value="' + esc(model.value) + '"'
      + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
      + ' style="display:block;width:100%;text-align:left;margin-bottom:6px;'
      + 'background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';'
      + 'border:1px dashed ' + (on ? 'var(--accent)' : 'var(--accent)') + ';'
      + 'color:' + (on ? '#fff' : 'var(--text-primary)') + ';'
      + 'padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">'
      + '<strong>' + esc(model.label) + '</strong><br>'
      + '<span style="font-size:10px;opacity:0.85;">' + esc(model.hint) + '</span>'
      + '</button>';
  }

  // paintPromo: 現在値に合わせて呼び込みの文言と当たりを揃える。
  function paintPromo(promoEl, options, current) {
    if (!promoEl) return;
    var m = promoModel(options, current);
    if (!m) return;
    var on = !!m.active;
    promoEl.setAttribute('aria-pressed', on ? 'true' : 'false');
    promoEl.style.background = on ? 'var(--accent)' : 'var(--bg-tertiary)';
    promoEl.style.color = on ? '#fff' : 'var(--text-primary)';
    var strong = promoEl.querySelector('strong');
    var span = promoEl.querySelector('span');
    if (strong) strong.textContent = m.label;
    if (span) span.textContent = m.hint;
  }

  // mount: {selectId} の select の直前にチップ列を差し込む。
  // propsEl を作り直すたびに呼ばれるので、既にある列は捨ててから作る。
  function mount(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel || !sel.parentNode) return null;
    var idPrefix = selectId;
    var old = document.getElementById(idPrefix + '-chips');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var oldPromo = document.getElementById(idPrefix + '-bulk-promo');
    if (oldPromo && oldPromo.parentNode) oldPromo.parentNode.removeChild(oldPromo);

    var options = [];
    for (var i = 0; i < sel.options.length; i++) {
      options.push({ value: sel.options[i].value, label: sel.options[i].textContent });
    }
    if (options.length === 0) return null;

    var host = document.createElement('div');
    host.innerHTML = chipsHtml(idPrefix, chipModels(options, sel.value));
    var chipsEl = host.firstChild;
    // select を包む <div>(ラベル付き) の直前に置く。ラベル「種類」は select 側に残る。
    var wrap = sel.parentNode;
    wrap.parentNode.insertBefore(chipsEl, wrap);

    // 呼び込みはチップ列の上。種別を読み下す前に目に入る位置に置く。
    var promoEl = null;
    var pm = promoModel(options, sel.value);
    if (pm) {
      var phost = document.createElement('div');
      phost.innerHTML = promoHtml(idPrefix, pm);
      promoEl = phost.firstChild;
      chipsEl.parentNode.insertBefore(promoEl, chipsEl);
    }

    function pick(value, focus) {
      if (sel.value === value) { paint(chipsEl, sel.value); paintPromo(promoEl, options, sel.value); return; }
      sel.value = value;
      paint(chipsEl, sel.value);
      // Event は select が属する document のものを使う。テストの jsdom のように
      // グローバルの Event が別実装だと dispatchEvent が受け取ってくれない。
      var doc = sel.ownerDocument || document;
      var view = doc.defaultView;
      var ev;
      if (view && view.Event) ev = new view.Event('change', { bubbles: true });
      else { ev = doc.createEvent('Event'); ev.initEvent('change', true, false); }
      sel.dispatchEvent(ev);
      paintPromo(promoEl, options, sel.value);
      if (focus) {
        var b = document.getElementById(idPrefix + '-chip-' + idPart(value));
        if (b) b.focus();
      }
    }

    chipsEl.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest ? e.target.closest('.prop-seg') : null;
      if (!btn || !chipsEl.contains(btn)) return;
      pick(btn.getAttribute('data-value'), false);
    });

    chipsEl.addEventListener('keydown', function(e) {
      var key = e.key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      var btns = chipsEl.querySelectorAll('.prop-seg');
      var cur = -1;
      for (var i = 0; i < btns.length; i++) if (btns[i].getAttribute('data-value') === sel.value) cur = i;
      var next = moveIndex(btns.length, cur, key === 'ArrowRight' ? 1 : -1);
      if (next < 0) return;
      e.preventDefault();
      pick(btns[next].getAttribute('data-value'), true);
    });

    if (promoEl) {
      promoEl.addEventListener('click', function() { pick(BULK_VALUE, false); });
    }

    // select 側 (従来の経路・E2E) から値が変わってもチップの当たりが古びないようにする。
    sel.addEventListener('change', function() {
      paint(chipsEl, sel.value);
      paintPromo(promoEl, options, sel.value);
    });

    return chipsEl;
  }

  return {
    shortLabel: shortLabel,
    idPart: idPart,
    chipModels: chipModels,
    chipsHtml: chipsHtml,
    moveIndex: moveIndex,
    paint: paint,
    promoModel: promoModel,
    promoHtml: promoHtml,
    paintPromo: paintPromo,
    mount: mount,
  };
})();
