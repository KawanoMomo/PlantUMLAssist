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

  // Editor を mount: container 要素内に textarea + toolbar + preview を構築
  function mount(container, initialValue, onChange) {
    container.innerHTML =
      '<div class="rle-toolbar" style="display:flex;gap:4px;padding:4px;background:var(--bg-primary);border:1px solid var(--border);border-bottom:none;border-radius:3px 3px 0 0;align-items:center;flex-wrap:wrap;">' +
        '<button type="button" class="rle-b" title="太字" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;font-weight:700;border-radius:3px;">B</button>' +
        '<button type="button" class="rle-i" title="斜体" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;font-style:italic;border-radius:3px;">I</button>' +
        '<button type="button" class="rle-u" title="下線" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;text-decoration:underline;border-radius:3px;">U</button>' +
        '<span style="border-left:1px solid var(--border);height:18px;margin:0 4px;"></span>' +
        '<span style="font-size:10px;color:var(--text-secondary);">色:</span>' +
        ['#f74a4a','#ffa657','#f1e05a','#7ee787','#7c8cf8','#d2a8ff','#8b949e'].map(function(c) {
          return '<button type="button" class="rle-color" data-color="' + c + '" title="色: ' + c + '" style="background:' + c + ';width:16px;height:16px;border:2px solid var(--bg-secondary);border-radius:3px;cursor:pointer;padding:0;"></button>';
        }).join('') +
        '<button type="button" class="rle-color-clear" title="色解除" style="background:transparent;border:1px dashed var(--text-secondary);width:16px;height:16px;border-radius:3px;cursor:pointer;font-size:9px;color:var(--text-secondary);">✕</button>' +
        '<span style="border-left:1px solid var(--border);height:18px;margin:0 4px;"></span>' +
        '<button type="button" class="rle-newline" title="改行 \\n" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;border-radius:3px;">↵</button>' +
      '</div>' +
      '<textarea class="rle-textarea" style="width:100%;min-height:60px;background:var(--bg-tertiary);border:1px solid var(--border);border-top:none;color:var(--text-primary);padding:6px;border-radius:0 0 3px 3px;font-family:var(--font-mono);font-size:12px;resize:vertical;box-sizing:border-box;">' + escHtml(initialValue || '') + '</textarea>' +
      '<div class="rle-preview" style="margin-top:6px;padding:6px 8px;background:#fff;color:#000;border-radius:3px;font-size:12px;font-family:-apple-system,Segoe UI,sans-serif;min-height:24px;">' + plantumlToHtml(initialValue || '') + '</div>';

    var ta = container.querySelector('.rle-textarea');
    var preview = container.querySelector('.rle-preview');

    function refreshPreview() {
      preview.innerHTML = plantumlToHtml(ta.value);
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
        container.dispatchEvent(new window.CustomEvent('rle-escape', { bubbles: true }));
      }
    });

    container.querySelector('.rle-b').addEventListener('click', function() { insertWrapAtSelection(ta, '<b>', '</b>'); });
    container.querySelector('.rle-i').addEventListener('click', function() { insertWrapAtSelection(ta, '<i>', '</i>'); });
    container.querySelector('.rle-u').addEventListener('click', function() { insertWrapAtSelection(ta, '<u>', '</u>'); });
    container.querySelector('.rle-newline').addEventListener('click', function() { insertAtCursor(ta, '\\n'); });
    Array.prototype.forEach.call(container.querySelectorAll('.rle-color'), function(btn) {
      btn.addEventListener('click', function() {
        var c = btn.getAttribute('data-color');
        insertWrapAtSelection(ta, '<color:' + c + '>', '</color>');
      });
    });
    container.querySelector('.rle-color-clear').addEventListener('click', function() {
      var s = ta.selectionStart, e = ta.selectionEnd;
      var sel = ta.value.substring(s, e);
      sel = sel.replace(/<color:[^>]+>/g, '').replace(/<\/color>/g, '');
      ta.value = ta.value.substring(0, s) + sel + ta.value.substring(e);
      fireInput(ta);
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
