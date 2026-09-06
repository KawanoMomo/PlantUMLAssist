'use strict';
window.MA = window.MA || {};

// reuse-modal — 「他の図から取り込む」ダイアログ。
// 開いている同じ図種の図から使える行を並べ、選んだ行を一括入力欄へ入れる。
// 打ち直しを 0 打鍵に置き換えるのが目的なので、選択はクリックだけで済ませる。
window.MA.reuseModal = (function() {
  var esc = function(s) { return window.MA.htmlUtils.escHtml(s); };

  function _docs() {
    var ws = window.MA.workspace;
    return (ws && ws.list) ? ws.list() : [];
  }

  function _activeId() {
    var ws = window.MA.workspace;
    return (ws && ws.getActiveId) ? ws.getActiveId() : null;
  }

  // opts: { diagramType, textareaId }
  function open(opts) {
    var modal = document.getElementById('reuse-modal');
    var content = document.getElementById('reuse-modal-content');
    if (!modal || !content) return;
    var target = document.getElementById(opts.textareaId);
    if (!target) return;

    var items = window.MA.reusePicker.collect(_docs(), opts.diagramType, _activeId());

    var rows = items.map(function(it, i) {
      return '<label class="reuse-row" style="display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:3px;font-size:12px;cursor:pointer;">' +
        '<input type="checkbox" class="reuse-check" data-i="' + i + '">' +
        '<span style="flex:1;font-family:var(--font-mono),Consolas,monospace;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.text) + '</span>' +
        '<span style="font-size:10px;color:var(--text-secondary);">' + esc(it.from) + '</span>' +
      '</label>';
    }).join('');

    content.innerHTML =
      '<h3 style="margin:0 0 10px 0;color:var(--text-primary);font-size:14px;">他の図から取り込む</h3>' +
      (items.length === 0
        ? '<div id="reuse-empty" style="font-size:12px;color:var(--text-secondary);">同じ図種の他の図がまだありません</div>'
        : '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;">選んだ行が入力欄に入ります (打ち直し不要)</div>' +
          '<input id="reuse-filter" type="text" placeholder="絞り込む" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 6px;border-radius:3px;font-size:12px;margin-bottom:6px;">' +
          '<div style="margin-bottom:6px;"><button id="reuse-all" style="font-size:11px;padding:2px 8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">表示中を全部選ぶ</button></div>' +
          '<div id="reuse-list" style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:3px;padding:4px;">' + rows + '</div>') +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="reuse-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="reuse-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">入力欄に入れる</button>' +
      '</div>';
    modal.style.display = 'flex';

    function close() { modal.style.display = 'none'; content.innerHTML = ''; }

    var cancel = document.getElementById('reuse-cancel');
    if (cancel) cancel.addEventListener('click', close);

    var filter = document.getElementById('reuse-filter');
    if (filter) {
      filter.addEventListener('input', function() {
        var q = (filter.value || '').trim().toLowerCase();
        Array.prototype.forEach.call(content.querySelectorAll('.reuse-row'), function(row) {
          var i = parseInt(row.querySelector('.reuse-check').getAttribute('data-i'), 10);
          var hit = !q || items[i].text.toLowerCase().indexOf(q) >= 0;
          row.hidden = !hit;
          if (!hit) row.querySelector('.reuse-check').checked = false;
        });
      });
    }

    var all = document.getElementById('reuse-all');
    if (all) {
      all.addEventListener('click', function() {
        Array.prototype.forEach.call(content.querySelectorAll('.reuse-row'), function(row) {
          if (!row.hidden) row.querySelector('.reuse-check').checked = true;
        });
      });
    }

    var confirm = document.getElementById('reuse-confirm');
    if (confirm) {
      confirm.addEventListener('click', function() {
        var picked = [];
        Array.prototype.forEach.call(content.querySelectorAll('.reuse-check'), function(cb) {
          if (cb.checked) picked.push(items[parseInt(cb.getAttribute('data-i'), 10)]);
        });
        if (picked.length === 0) { close(); return; }
        var block = window.MA.reusePicker.toBlock(picked);
        target.value = window.MA.reusePicker.appendTo(target.value, block);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        close();
      });
    }
  }

  // 一括入力欄の上に置くボタン。各図種のモジュールから同じ形で呼べるように
  // HTML と結線をここにまとめる。
  function buttonHtml(id) {
    return '<button id="' + id + '" style="width:100%;font-size:11px;padding:4px 10px;margin-bottom:5px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">⧉ 他の図から取り込む</button>';
  }

  function bindButton(id, diagramType, textareaId) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function() {
      open({ diagramType: diagramType, textareaId: textareaId });
    });
  }

  return {
    open: open,
    buttonHtml: buttonHtml,
    bindButton: bindButton,
  };
})();
