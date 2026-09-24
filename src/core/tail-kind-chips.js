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

  // BLK-owner-20260923-2332-prune: まとめて足す入口は種別チップの「まとめて」1 つにする。
  // 以前はチップ列の上に「⊞ まとめて入れる」の呼び込み枠 (BLK-junior-20260907-1903) を
  // 別に出していたが、同じ値を選ぶ入口が 1 枚のペインに 2 つ並ぶので畳んだ。

  // hideSelect: 「種類」プルダウンはチップと同じ選択肢を同じ順で並べるだけなので画面から外す。
  // 値の持ち主 (各図種の分岐が change を聞いている) なので要素は残し、見えない・Tab で
  // 止まらない形にする (Tab はチップ列の当たっている 1 個に届く)。
  function hideSelect(sel) {
    var wrap = sel.parentNode;
    if (!wrap || !wrap.style) return;
    wrap.setAttribute('data-tail-kind-select', '1');
    wrap.style.position = 'absolute';
    wrap.style.width = '1px';
    wrap.style.height = '1px';
    wrap.style.margin = '0';
    wrap.style.padding = '0';
    wrap.style.overflow = 'hidden';
    wrap.style.clip = 'rect(0 0 0 0)';
    wrap.style.clipPath = 'inset(50%)';
    wrap.style.whiteSpace = 'nowrap';
    wrap.setAttribute('aria-hidden', 'true');
    sel.setAttribute('tabindex', '-1');
  }

  // mount: {selectId} の select の直前にチップ列を差し込む。
  // propsEl を作り直すたびに呼ばれるので、既にある列は捨ててから作る。
  function mount(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel || !sel.parentNode) return null;
    var idPrefix = selectId;
    var old = document.getElementById(idPrefix + '-chips');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var options = [];
    for (var i = 0; i < sel.options.length; i++) {
      options.push({ value: sel.options[i].value, label: sel.options[i].textContent });
    }
    if (options.length === 0) return null;

    var host = document.createElement('div');
    host.innerHTML = chipsHtml(idPrefix, chipModels(options, sel.value));
    var chipsEl = host.firstChild;
    // select を包む <div>(ラベル付き) の直前に置く。ラベル「種類」ごと select は隠す。
    var wrap = sel.parentNode;
    wrap.parentNode.insertBefore(chipsEl, wrap);

    hideSelect(sel);

    function pick(value, focus) {
      if (sel.value === value) { paint(chipsEl, sel.value); return; }
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

    // select 側 (従来の経路・E2E) から値が変わってもチップの当たりが古びないようにする。
    sel.addEventListener('change', function() {
      paint(chipsEl, sel.value);
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
    hideSelect: hideSelect,
    mount: mount,
  };
})();
