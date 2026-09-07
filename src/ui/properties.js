'use strict';
window.MA = window.MA || {};
window.MA.properties = (function() {
  var state = {
    getMmdText: function() { return ''; },
    setMmdText: function(t) {},
    onUpdate: function() {},
    moduleUpdater: function(text, lineNum, field, value) { return text; },
  };

  function init(opts) {
    state.getMmdText = opts.getMmdText;
    state.setMmdText = opts.setMmdText;
    state.onUpdate = opts.onUpdate || function() {};
    state.moduleUpdater = opts.moduleUpdater;
  }

  // bindTextField: text input の change で moduleUpdater を呼んでテキスト更新
  function bindTextField(elId, lineNum, field) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener('change', function() {
      window.MA.history.pushHistory();
      var newText = state.moduleUpdater(state.getMmdText(), lineNum, field, el.value);
      state.setMmdText(newText);
      state.onUpdate();
    });
  }

  // bindDateField: 開始日/終了日 ペアのバインド (datesUpdater は外部から注入)
  function bindDateField(startId, endId, lineNum, datesUpdater) {
    var startEl = document.getElementById(startId);
    var endEl = document.getElementById(endId);
    if (startEl) {
      startEl.addEventListener('change', function() {
        window.MA.history.pushHistory();
        var newText = datesUpdater(state.getMmdText(), lineNum, startEl.value, null);
        state.setMmdText(newText);
        state.onUpdate();
      });
    }
    if (endEl) {
      endEl.addEventListener('change', function() {
        window.MA.history.pushHistory();
        var newText = datesUpdater(state.getMmdText(), lineNum, null, endEl.value);
        state.setMmdText(newText);
        state.onUpdate();
      });
    }
  }

  // ── HTML builders ────────────────────────────────────────────────────────
  var escHtml = function(s) {
    return window.MA.htmlUtils.escHtml(s);
  };

  // fieldHtml: standard text input field with label
  function fieldHtml(label, id, value, placeholder) {
    return '<div style="margin-bottom:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">' + escHtml(label) + '</label>' +
      '<input id="' + id + '" type="text" value="' + escHtml(value || '') + '" placeholder="' + escHtml(placeholder || '') + '" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;">' +
    '</div>';
  }

  // selectFieldHtml: select dropdown with label
  // options: array of { value, label, selected? }
  // segmentedFieldHtml: 選択肢を横並びのボタンにして、押した瞬間に確定させる
  // (design 1a の右ペイン)。プルダウンを開く 1 手が消えるので、よく使う
  // 数個の値はこちらに出す。options = [{ value, label, title, selected }]
  function segmentedFieldHtml(label, id, options) {
    var btns = '';
    for (var i = 0; i < options.length; i++) {
      var on = !!options[i].selected;
      btns += '<button type="button" class="prop-seg' + (on ? ' active' : '') + '"'
        + ' data-value="' + escHtml(options[i].value) + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + (options[i].title ? ' title="' + escHtml(options[i].title) + '"' : '')
        + ' style="flex:1;min-width:34px;background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';'
        + 'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';'
        + 'color:' + (on ? '#fff' : 'var(--text-primary)') + ';'
        + 'font-family:var(--font-mono);font-size:12px;padding:3px 4px;border-radius:3px;cursor:pointer;">'
        + escHtml(options[i].label)
        // design 2d: 「何が起きるか」を先に、記法は小さく下に。sub 無しは従来どおり 1 行。
        + (options[i].sub ? '<br><span style="font-size:9px;opacity:0.75;">' + escHtml(options[i].sub) + '</span>' : '')
        + '</button>';
    }
    return '<div style="margin-bottom:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">' + escHtml(label) + '</label>' +
      '<div id="' + id + '" style="display:flex;gap:3px;">' + btns + '</div>' +
    '</div>';
  }

  // arrowPickerHtml: design 2d「矢印のその他パレット」。
  // よく使う数種を分節ボタンで常時出し、残りは「その他の矢印… ▾」を開いた
  // パレットに置く。パレットの各行は「何が起きるか」が主で、記法は右に小さく。
  // 現在値は hidden input (id) が持つので、送信側は `.value` で読める。
  // quick  = [{ value, label, title }]
  // others = [{ value, desc, notation }]
  function arrowPickerHtml(label, id, quick, others, current) {
    var seg = segmentedFieldHtml(label, id + '-seg', quick.map(function(q) {
      return { value: q.value, label: q.label, sub: q.sub, title: q.title, selected: q.value === current };
    }));
    var inOthers = false;
    var rows = '';
    for (var i = 0; i < others.length; i++) {
      var on = others[i].value === current;
      if (on) inOthers = true;
      rows += '<button type="button" class="prop-arrow-item' + (on ? ' active' : '') + '"'
        + ' data-value="' + escHtml(others[i].value) + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' style="display:flex;width:100%;align-items:baseline;gap:8px;text-align:left;'
        + 'background:' + (on ? 'rgba(124,140,248,0.18)' : 'transparent') + ';border:0;'
        + 'border-left:2px solid ' + (on ? 'var(--accent)' : 'transparent') + ';'
        + 'color:var(--text-primary);padding:4px 6px;font-size:12px;cursor:pointer;">'
        + '<span style="flex:1;min-width:0;">' + escHtml(others[i].desc) + '</span>'
        + '<span style="flex:0 0 auto;font-family:var(--font-mono);font-size:10px;color:var(--text-secondary);">'
        + escHtml(others[i].notation || others[i].value) + '</span>'
        + '</button>';
    }
    return seg +
      '<input type="hidden" id="' + id + '" value="' + escHtml(current || '') + '">' +
      '<div style="margin-bottom:8px;">' +
        '<button type="button" id="' + id + '-more-btn" aria-expanded="' + (inOthers ? 'true' : 'false') + '"'
          + ' aria-controls="' + id + '-more"'
          + ' style="width:100%;text-align:left;background:transparent;border:0;color:var(--text-secondary);'
          + 'font-size:11px;padding:2px 0;cursor:pointer;">その他の矢印… <span class="prop-arrow-caret">'
          + (inOthers ? '▴' : '▾') + '</span></button>' +
        '<div id="' + id + '-more"' + (inOthers ? '' : ' hidden')
          + ' style="border:1px solid var(--border);border-radius:3px;margin-top:2px;">' + rows + '</div>' +
      '</div>';
  }

  // bindArrowPicker: 分節ボタンとパレットの両方を onPick(value) に繋ぎ、
  // 「その他の矢印…」の開閉を配線する。
  function bindArrowPicker(id, onPick) {
    var hidden = document.getElementById(id);
    var apply = function(v) {
      if (hidden) hidden.value = v;
      onPick(v);
    };
    var seg = document.getElementById(id + '-seg');
    if (seg) {
      var segBtns = seg.querySelectorAll('.prop-seg');
      for (var i = 0; i < segBtns.length; i++) {
        (function(b) {
          b.addEventListener('click', function() { apply(b.getAttribute('data-value')); });
        })(segBtns[i]);
      }
    }
    var more = document.getElementById(id + '-more');
    if (more) {
      var items = more.querySelectorAll('.prop-arrow-item');
      for (var j = 0; j < items.length; j++) {
        (function(b) {
          b.addEventListener('click', function() { apply(b.getAttribute('data-value')); });
        })(items[j]);
      }
    }
    var btn = document.getElementById(id + '-more-btn');
    if (btn && more) {
      btn.addEventListener('click', function() {
        var open = more.hasAttribute('hidden');
        if (open) more.removeAttribute('hidden'); else more.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var caret = btn.querySelector('.prop-arrow-caret');
        if (caret) caret.textContent = open ? '▴' : '▾';
      });
    }
  }

  function selectFieldHtml(label, id, options, monoFont) {
    var opts = '';
    for (var i = 0; i < options.length; i++) {
      var sel = options[i].selected ? ' selected' : '';
      opts += '<option value="' + escHtml(options[i].value) + '"' + sel + '>' + escHtml(options[i].label) + '</option>';
    }
    var fontStyle = monoFont ? 'font-family:var(--font-mono);' : '';
    return '<div style="margin-bottom:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">' + escHtml(label) + '</label>' +
      '<select id="' + id + '" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;' + fontStyle + '">' + opts + '</select>' +
    '</div>';
  }

  // panelHeaderHtml: title bar at top of single-element edit panel
  function panelHeaderHtml(label) {
    return '<div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);font-weight:bold;color:var(--text-primary);font-size:13px;">' + escHtml(label) + '</div>';
  }

  // sectionHeaderHtml: divider with section heading (used inside no-selection panel for grouped controls)
  function sectionHeaderHtml(label) {
    return '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
      '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' + escHtml(label) + '</label>';
  }

  function sectionFooterHtml() {
    return '</div>';
  }

  // listItemHtml: row with label + select-edit and delete buttons
  // opts: { label, sublabel?, selectClass, deleteClass, dataElementId?, dataLine?, dataEndLine?, mono? }
  function listItemHtml(opts) {
    var sub = opts.sublabel ? ' <span style="color:var(--text-secondary);font-size:10px;">' + escHtml(opts.sublabel) + '</span>' : '';
    var fontStyle = opts.mono ? 'font-family:var(--font-mono);' : '';
    var dataAttrs = '';
    if (opts.dataElementId !== undefined) dataAttrs += ' data-element-id="' + escHtml(opts.dataElementId) + '"';
    if (opts.dataLine !== undefined) dataAttrs += ' data-line="' + opts.dataLine + '"';
    if (opts.dataEndLine !== undefined) dataAttrs += ' data-end-line="' + opts.dataEndLine + '"';
    var selectBtn = opts.selectClass ?
      '<button class="' + opts.selectClass + '"' + dataAttrs + ' style="background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">編集</button>' : '';
    var deleteBtn = opts.deleteClass ?
      '<button class="' + opts.deleteClass + '"' + dataAttrs + ' style="background:var(--accent-red);color:#fff;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✕</button>' : '';
    return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;padding:3px 4px;background:var(--bg-tertiary);border-radius:3px;font-size:11px;">' +
      '<div style="flex:1;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + fontStyle + '">' + escHtml(opts.label) + sub + '</div>' +
      selectBtn + deleteBtn +
    '</div>';
  }

  // emptyListHtml: placeholder text when a list is empty
  function emptyListHtml(text) {
    return '<div style="font-size:11px;color:var(--text-secondary);">' + escHtml(text) + '</div>';
  }

  // primaryButtonHtml: full-width accent button
  function primaryButtonHtml(id, label) {
    return '<button id="' + id + '" style="width:100%;background:var(--accent);color:#fff;border:none;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:12px;">' + escHtml(label) + '</button>';
  }

  // dangerButtonHtml: full-width red button (for delete actions)
  function dangerButtonHtml(id, label) {
    return '<button id="' + id + '" style="width:100%;background:var(--accent-red);color:#fff;border:none;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:12px;margin-top:8px;">' + escHtml(label) + '</button>';
  }

  // ── Event binding helpers ────────────────────────────────────────────────

  // bindEvent: simple event binding by element ID
  function bindEvent(id, event, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  // bindAllByClass: bind a handler to all elements matching a CSS class within propsEl
  // handlerWithBtn(btn) is called per element with that element as the only arg
  function bindAllByClass(propsEl, className, handlerWithBtn) {
    if (!propsEl) return;
    var btns = propsEl.querySelectorAll('.' + className);
    for (var i = 0; i < btns.length; i++) {
      (function(btn) { btn.addEventListener('click', function() { handlerWithBtn(btn); }); })(btns[i]);
    }
  }

  // bindSelectButtons: standardized select-button bindings.
  // For elements with class `selectClass` and attribute `data-element-id`, sets selection on click.
  function bindSelectButtons(propsEl, selectClass, selectionType) {
    bindAllByClass(propsEl, selectClass, function(btn) {
      window.MA.selection.setSelected([{ type: selectionType, id: btn.getAttribute('data-element-id') }]);
    });
  }

  // bindDeleteButtons: standardized delete-button bindings.
  // For elements with class `deleteClass` and attribute `data-line`, calls deleteFn(text, lineNum)
  // and updates state. Optional: pass `data-end-line` and use `endLine` for block deletion.
  function bindDeleteButtons(propsEl, deleteClass, ctx, deleteFn, useEndLine) {
    bindAllByClass(propsEl, deleteClass, function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      if (isNaN(ln)) return;
      var endLn;
      if (useEndLine) {
        endLn = parseInt(btn.getAttribute('data-end-line'), 10);
        if (isNaN(endLn) || endLn <= 0) return;
      }
      window.MA.history.pushHistory();
      var newText = useEndLine ? deleteFn(ctx.getMmdText(), ln, endLn) : deleteFn(ctx.getMmdText(), ln);
      ctx.setMmdText(newText);
      ctx.onUpdate();
    });
  }

  // bindFieldChange: bind change event to update a single field via a custom updater
  // updaterFn(text, lineNum, field, value) -> text
  function bindFieldChange(elId, lineNum, field, ctx, updaterFn) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener('change', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(updaterFn(ctx.getMmdText(), lineNum, field, el.value));
      ctx.onUpdate();
    });
  }

  return {
    init: init,
    bindTextField: bindTextField,
    bindDateField: bindDateField,
    // HTML builders
    fieldHtml: fieldHtml,
    selectFieldHtml: selectFieldHtml,
    segmentedFieldHtml: segmentedFieldHtml,
    arrowPickerHtml: arrowPickerHtml,
    bindArrowPicker: bindArrowPicker,
    panelHeaderHtml: panelHeaderHtml,
    sectionHeaderHtml: sectionHeaderHtml,
    sectionFooterHtml: sectionFooterHtml,
    listItemHtml: listItemHtml,
    emptyListHtml: emptyListHtml,
    primaryButtonHtml: primaryButtonHtml,
    dangerButtonHtml: dangerButtonHtml,
    // Event helpers
    bindEvent: bindEvent,
    bindAllByClass: bindAllByClass,
    bindSelectButtons: bindSelectButtons,
    bindDeleteButtons: bindDeleteButtons,
    bindFieldChange: bindFieldChange,
  };
})();
