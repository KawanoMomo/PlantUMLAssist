'use strict';
window.MA = window.MA || {};
window.MA.richLabelEditor = (function() {

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // PlantUML 表記 → プレビュー HTML
  function plantumlToHtml(s) {
    if (!s) return '';
    var out = escHtml(s);
    // literal '\n' (2 文字) → <br>
    out = out.replace(/\\n/g, '<br>');
    // 実改行 (U+000A) → <br>
    out = out.replace(/\n/g, '<br>');
    // <color:xxx> ... </color> (HTML エスケープ後 → &lt;color:...&gt;)
    out = out.replace(/&lt;color:([^&]+)&gt;([\s\S]*?)&lt;\/color&gt;/g, function(_, c, body) {
      return '<span style="color:' + c + '">' + body + '</span>';
    });
    out = out.replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/g, '<b>$1</b>');
    out = out.replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/g, '<i>$1</i>');
    out = out.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');
    return out;
  }

  function fireInput(ta) {
    // 環境によって Event コンストラクタが異なる (jsdom の EventTarget は jsdom の Event を要求する)
    var EvtCtor = (typeof window !== 'undefined' && window.Event) ? window.Event : Event;
    ta.dispatchEvent(new EvtCtor('input'));
  }

  function fireChange(ta) {
    // Feature #9 fix: ツールバーボタン (B/I/U/color/newline) は click 後に blur
    // しないため、onChange (change event) が発火せず DSL に反映されない。
    // insertWrapAtSelection 後に明示的に change を dispatch して
    // ctx.setMmdText → SVG re-render の経路を起動する。
    var EvtCtor = (typeof window !== 'undefined' && window.Event) ? window.Event : Event;
    try {
      ta.dispatchEvent(new EvtCtor('change', { bubbles: true }));
    } catch (e) {
      ta.dispatchEvent(new EvtCtor('change'));
    }
  }

  function insertWrapAtSelection(ta, openTag, closeTag) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    var before = ta.value.substring(0, s);
    var sel = ta.value.substring(s, e);
    var after = ta.value.substring(e);
    ta.value = before + openTag + sel + closeTag + after;
    var newPos = s + openTag.length + sel.length;
    ta.setSelectionRange(newPos, newPos);
    fireInput(ta);
  }

  function insertAtCursor(ta, str) {
    var s = ta.selectionStart;
    ta.value = ta.value.substring(0, s) + str + ta.value.substring(ta.selectionEnd);
    ta.setSelectionRange(s + str.length, s + str.length);
    fireInput(ta);
  }

  // design 2b: 色は `···` の内側に畳む。パネルは
  // 「文字色 / Text color」の見本列 → 「最近使った色」 → 「色を外す」 → 「Esc で閉じる」の順。
  function _swatch(cls, c, label) {
    return '<button type="button" class="' + cls + '" data-color="' + escHtml(c) + '"'
      + ' title="' + escHtml(label || ('色: ' + c)) + '"'
      + ' style="background:' + escHtml(c) + ';width:16px;height:16px;border:2px solid var(--bg-secondary);'
      + 'border-radius:3px;cursor:pointer;padding:0;"></button>';
  }

  function colorPanelHtml(recent) {
    var LC = window.MA.labelColors;
    var swatches = LC.PALETTE.map(function(c) {
      return _swatch('rle-color', c.value, c.label + ' ' + c.value);
    }).join('');
    var recentHtml = (recent && recent.length)
      ? '<div class="rle-recent-row" style="display:flex;gap:4px;align-items:center;margin-top:6px;">'
        + '<span style="font-size:10px;color:var(--text-secondary);">最近使った色</span>'
        + recent.map(function(c) { return _swatch('rle-color rle-recent', c, '最近使った色: ' + c); }).join('')
        + '</div>'
      : '';
    return '<div class="rle-color-panel" hidden'
      + ' style="position:absolute;z-index:10;top:100%;left:0;margin-top:2px;padding:8px;'
      + 'background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;">'
      + '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px;">文字色 / Text color</div>'
      + '<div style="display:flex;gap:4px;align-items:center;">' + swatches + '</div>'
      + recentHtml
      + '<button type="button" class="rle-color-clear" style="display:block;width:100%;margin-top:8px;'
      + 'background:transparent;border:1px dashed var(--text-secondary);color:var(--text-secondary);'
      + 'border-radius:3px;cursor:pointer;font-size:11px;padding:3px 6px;">色を外す</button>'
      + '<div style="font-size:10px;color:var(--text-secondary);margin-top:6px;">Esc で閉じる</div>'
      + '</div>';
  }

  // Editor を mount: container 要素内に textarea + toolbar + preview を構築
  function mount(container, initialValue, onChange) {
    var LC = window.MA.labelColors;
    // jsdom の opaque origin では localStorage を読むだけで例外になる。
    // 最近使った色が残らないだけなので、取れなければ null で続ける。
    var storage = null;
    try { storage = window.localStorage || null; } catch (e) { storage = null; }
    var recent = LC.load(storage, LC.RECENT_KEY);
    var BTN = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);'
      + 'width:24px;height:24px;cursor:pointer;border-radius:3px;';
    container.innerHTML =
      '<div class="rle-toolbar" style="position:relative;display:flex;gap:4px;padding:4px;background:var(--bg-primary);border:1px solid var(--border);border-bottom:none;border-radius:3px 3px 0 0;align-items:center;">' +
        '<button type="button" class="rle-b" title="太字" style="' + BTN + 'font-weight:700;">B</button>' +
        '<button type="button" class="rle-i" title="斜体" style="' + BTN + 'font-style:italic;">I</button>' +
        '<button type="button" class="rle-u" title="下線" style="' + BTN + 'text-decoration:underline;">U</button>' +
        '<button type="button" class="rle-color-more" title="文字色" aria-expanded="false" style="' + BTN + '">···</button>' +
        '<button type="button" class="rle-newline" title="改行 \\n" style="' + BTN + '">↵</button>' +
        '<span class="rle-creole" title="creole 記法: **太字** // 斜体 // __下線__" ' +
          'style="margin-left:auto;font-size:10px;color:var(--text-secondary);font-family:var(--font-mono);">creole</span>' +
        colorPanelHtml(recent) +
      '</div>' +
      '<textarea class="rle-textarea" style="width:100%;min-height:60px;background:var(--bg-tertiary);border:1px solid var(--border);border-top:none;color:var(--text-primary);padding:6px;border-radius:0 0 3px 3px;font-family:var(--font-mono);font-size:12px;resize:vertical;box-sizing:border-box;">' + escHtml(initialValue || '') + '</textarea>' +
      // BLK-owner-20260923-2332-prune: 見え方の欄は白い 1 行欄に見え、本文の欄が 2 つあると
      // 読まれていた。打てない欄だと分かる形 (見出し付き・破線の枠) にし、空の間は出さない。
      '<div class="rle-preview-wrap"' + (String(initialValue || '').trim() ? '' : ' hidden') + ' style="margin-top:6px;">' +
        '<div class="rle-preview-caption" style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">図での見え方</div>' +
        '<div class="rle-preview" aria-readonly="true" style="padding:4px 8px;background:transparent;color:var(--text-primary);border:1px dashed var(--border);border-radius:3px;font-size:12px;font-family:-apple-system,Segoe UI,sans-serif;">' + plantumlToHtml(initialValue || '') + '</div>' +
      '</div>';

    var ta = container.querySelector('.rle-textarea');
    var preview = container.querySelector('.rle-preview');

    var previewWrap = container.querySelector('.rle-preview-wrap');
    function refreshPreview() {
      preview.innerHTML = plantumlToHtml(ta.value);
      if (previewWrap) previewWrap.hidden = !ta.value.trim();
    }

    // onChange への出力も getValue() と同じ正規化を通す (実改行 → literal \n)
    function normalized() { return ta.value.replace(/\n/g, '\\n'); }
    // Bug 2+5: input (毎 keystroke) は preview のみ更新 (パネル再描画なし)。
    // onChange は change (blur) 時のみ発火 → panel re-render で textarea が
    // destroy されず focus を保持できる。
    ta.addEventListener('input', function() {
      refreshPreview();
    });
    ta.addEventListener('change', function() {
      if (onChange) onChange(normalized());
    });
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Tab' && !e.isComposing) {
        e.preventDefault();
        var s = ta.selectionStart, ed = ta.selectionEnd;
        if (e.shiftKey) {
          // outdent: 行頭の 2 空白を除去
          var before = ta.value.substring(0, s);
          var lineStart = before.lastIndexOf('\n') + 1;
          if (ta.value.substring(lineStart, lineStart + 2) === '  ') {
            ta.value = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + 2);
            ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - 2);
          }
        } else {
          // indent: 2 空白挿入
          ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(ed);
          ta.selectionStart = ta.selectionEnd = s + 2;
        }
        ta.dispatchEvent(new window.Event('input', { bubbles: true }));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // design 2b: 色パネルが開いていれば、まずそれだけを閉じる。
        if (!panel.hasAttribute('hidden')) { setPanelOpen(false); return; }
        container.dispatchEvent(new window.CustomEvent('rle-escape', { bubbles: true }));
      }
    });

    // design 2b: `···` で色パネルを開閉する。
    var panel = container.querySelector('.rle-color-panel');
    var moreBtn = container.querySelector('.rle-color-more');
    function setPanelOpen(open) {
      if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    moreBtn.addEventListener('click', function() {
      setPanelOpen(panel.hasAttribute('hidden'));
    });
    // パネル内の Esc でも閉じる (見本にフォーカスがあるとき)。
    panel.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); setPanelOpen(false); moreBtn.focus(); }
    });

    // 使った色を「最近使った色」に積む。次に開いたときは同じ色がすぐ押せる。
    function rememberColor(c) {
      recent = LC.push(recent, c, LC.RECENT_MAX);
      LC.save(storage, LC.RECENT_KEY, recent);
      var row = container.querySelector('.rle-recent-row');
      var fresh = document.createElement('div');
      fresh.innerHTML = colorPanelHtml(recent);
      var newRow = fresh.querySelector('.rle-recent-row');
      if (!newRow) return;
      if (row) row.parentNode.replaceChild(newRow, row);
      else panel.insertBefore(newRow, container.querySelector('.rle-color-clear'));
      bindColorButtons(newRow);
    }

    function bindColorButtons(scope) {
      Array.prototype.forEach.call(scope.querySelectorAll('.rle-color'), function(btn) {
        if (btn.getAttribute('data-bound') === '1') return;
        btn.setAttribute('data-bound', '1');
        btn.addEventListener('click', function() {
          var c = btn.getAttribute('data-color');
          insertWrapAtSelection(ta, '<color:' + c + '>', '</color>');
          fireChange(ta);
          rememberColor(c);
        });
      });
    }

    container.querySelector('.rle-b').addEventListener('click', function() { insertWrapAtSelection(ta, '<b>', '</b>'); fireChange(ta); });
    container.querySelector('.rle-i').addEventListener('click', function() { insertWrapAtSelection(ta, '<i>', '</i>'); fireChange(ta); });
    container.querySelector('.rle-u').addEventListener('click', function() { insertWrapAtSelection(ta, '<u>', '</u>'); fireChange(ta); });
    container.querySelector('.rle-newline').addEventListener('click', function() { insertAtCursor(ta, '\\n'); fireChange(ta); });
    bindColorButtons(panel);
    container.querySelector('.rle-color-clear').addEventListener('click', function() {
      var s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.substring(0, s) + LC.stripColor(ta.value.substring(s, e)) + ta.value.substring(e);
      fireInput(ta);
      fireChange(ta);
    });

    return {
      getValue: function() {
        // 実改行 (U+000A) を PlantUML literal '\n' (2 文字) に変換
        return ta.value.replace(/\n/g, '\\n');
      },
      setValue: function(v) { ta.value = (v || '').replace(/\\n/g, '\n'); refreshPreview(); },
      element: ta,
    };
  }

  return { mount: mount, plantumlToHtml: plantumlToHtml, insertWrapAtSelection: insertWrapAtSelection };
})();
