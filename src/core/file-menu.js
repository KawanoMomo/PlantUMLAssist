'use strict';
window.MA = window.MA || {};

// file-menu — FILES ツリーのファイル・フォルダの右クリックに集める操作 (design 10b)。
//
// BLK-human-20260923-1701: ファイル 1 枚に対する操作が、タブ列 (一時控え・並べて比較)、
// ツール ▾ (この図の変遷)、下端の札 (前回保存版) と散らばっていて、「この図に何ができるか」を
// 入口ごとに探し直していた。10b はファイルの右クリックに全部を集める。
// フォルダの右クリックは「そこに作る」「そこを保存先 / 読むだけにする」。
//
// ここは DOM も fetch も触らない純関数だけ (メニューの中身・キー操作・名前の組み立て)。
// 描画と結線は src/ui/file-menu.js。
window.MA.fileMenu = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // ファイルの右クリック。並びと区切りは 10b のモックのとおり。
  // 「過去のコミットと比較…」は保存先が Git のときだけ押せる (10c)。
  var FILE_ITEMS = [
    { id: 'open', label: '開く', key: 'Enter' },
    { id: 'open-side', label: '右に並べて開く' },
    { sep: true },
    { id: 'cmp-readonly', label: '読むだけのフォルダの同じ図と比較' },
    { id: 'cmp-saved', label: '前回保存版と比較' },
    { id: 'cmp-commit', label: '過去のコミットと比較…', tag: 'Git', needsGit: true },
    { id: 'history', label: 'この図の履歴を表示' },
    { sep: true },
    { id: 'rename', label: '名前を変更', key: 'F2' },
    { id: 'copy', label: '複製' },
    { id: 'move', label: '別のフォルダへ移動…' },
    { id: 'draft', label: '一時控えにする' },
    { sep: true },
    { id: 'export-svg', label: 'SVG で書き出す' },
    { id: 'reveal', label: 'エクスプローラで場所を開く' },
    { sep: true },
    { id: 'delete', label: '削除', key: 'Delete', danger: true },
  ];

  // フォルダの右クリック。部品のフォルダ (`SPI 4 / 6`) はファイル名の頭で束ねた見出しで
  // 実在のディレクトリではないので、「保存先にする / 読むだけにする」は出さない。
  var FOLDER_ITEMS = [
    { id: 'new-doc', label: '新しい図' },
    { id: 'new-part', label: '6 図種をまとめて作る' },
    { sep: true, realOnly: true },
    { id: 'set-target', label: '保存先にする', realOnly: true },
    { id: 'set-readonly', label: '読むだけにする', realOnly: true },
    // BLK-owner-20260924-0637-1: 旧 📂 一覧 (要約・選ぶバー・対象 set・SVG の鮮度…) はツリーから外し、
    // 今の保存先の右クリックからだけ中央の枠に開く。
    { sep: true, targetOnly: true },
    { id: 'open-list', label: '保存先の一覧を開く', targetOnly: true },
  ];

  function _copy(it) {
    var o = {};
    Object.keys(it).forEach(function(k) { o[k] = it[k]; });
    return o;
  }

  // ctx: { git, draft, isCurrentTarget }
  function fileItems(ctx) {
    var c = ctx || {};
    return FILE_ITEMS.map(function(it) {
      var o = _copy(it);
      if (o.needsGit && !c.git) {
        o.disabled = true;
        o.title = '保存先が Git リポジトリのときに使えます';
      }
      // 一時控えは裏返す操作なので、今の状態に合わせて言い換える。
      if (o.id === 'draft' && c.draft) o.label = '一時控えを外す';
      return o;
    });
  }

  // ctx: { kind: 'target' | 'part' | 'readonly' }
  function folderItems(ctx) {
    var kind = _s((ctx || {}).kind) || 'part';
    var real = kind !== 'part';
    return FOLDER_ITEMS.filter(function(it) {
      if (it.targetOnly) return kind === 'target';
      return real || !it.realOnly;
    }).map(function(it) {
      var o = _copy(it);
      if (o.id === 'set-target' && kind === 'target') {
        o.disabled = true;
        o.title = '今の保存先です';
      }
      if (o.id === 'set-readonly' && kind === 'readonly') {
        o.disabled = true;
        o.title = 'もう読むだけのフォルダです';
      }
      return o;
    });
  }

  // メニューの中で ↑↓ を押したときの次の行。区切りと押せない行は飛ばし、端で回り込む。
  function nextIndex(items, from, dir) {
    var list = items || [];
    var n = list.length;
    if (!n) return -1;
    var d = dir < 0 ? -1 : 1;
    var i = typeof from === 'number' ? from : (d > 0 ? -1 : n);
    for (var step = 0; step < n; step++) {
      i = (i + d + n) % n;
      var it = list[i];
      if (it && !it.sep && !it.disabled) return i;
    }
    return -1;
  }

  // ツリーの中の ↑↓。行の並び (見えているものだけ) の中で 1 つ動かす。端では止まる。
  function moveInTree(count, from, dir) {
    var n = Number(count) || 0;
    if (n <= 0) return -1;
    var i = typeof from === 'number' && from >= 0 ? from : -1;
    if (i < 0) return dir < 0 ? n - 1 : 0;
    var j = i + (dir < 0 ? -1 : 1);
    if (j < 0) return 0;
    if (j >= n) return n - 1;
    return j;
  }

  // ツリーの行で押されたキーを操作の名前に読み替える。当たらなければ ''。
  // row: 'file' | 'folder' | 'section'。folder / section は → ← で開閉する。
  function keyAction(key, row, expanded) {
    var k = _s(key);
    if (k === 'ArrowDown') return 'down';
    if (k === 'ArrowUp') return 'up';
    if (k === 'ArrowRight') {
      if (row === 'file') return '';
      return expanded ? 'down' : 'expand';
    }
    if (k === 'ArrowLeft') {
      if (row === 'file') return 'parent';
      return expanded ? 'collapse' : 'parent';
    }
    if (k === 'Enter') return row === 'file' ? 'open' : 'toggle';
    if (k === 'F2') return row === 'file' ? 'rename' : '';
    if (k === 'Delete') return row === 'file' ? 'delete' : '';
    if (k === 'ContextMenu') return 'menu';
    return '';
  }

  // 名前の入力を整える。拡張子は付けても付けなくてもよい。空・同じ名前は null。
  function cleanName(input, current) {
    var v = _s(input).trim().replace(/\.puml$/i, '').trim();
    if (!v || v === _s(current)) return null;
    return v;
  }

  // 複製の名前。`{名前}_copy`、あれば `_copy2`, `_copy3`…。
  function copyName(name, existing) {
    var base = _s(name) + '_copy';
    var have = {};
    (existing || []).forEach(function(n) { have[_s(n)] = true; });
    if (!have[base]) return base;
    for (var i = 2; i < 1000; i++) {
      if (!have[base + i]) return base + i;
    }
    return base + Date.now();
  }

  // 部品のフォルダへドラッグした図の新しい名前。部品はファイル名の頭の語なので、
  // 別の部品へ移す = 頭の語を差し替える (`spi_init_sequence` → `adc_init_sequence`)。
  // 同じ部品へ落としたとき・頭の語が読めないときは null。
  function renameForPart(name, toPart) {
    var n = _s(name);
    var to = _s(toPart).trim().toLowerCase();
    if (!n || !to) return null;
    var m = /^([^_\-\s]+)([_\-\s].*)?$/.exec(n);
    if (!m) return null;
    if (m[1].toLowerCase() === to) return null;
    // 図種の語だけの名前 (`sequence`) は部品を持たないので、頭に部品を足す。
    var FT = window.MA.fileTree;
    if (!m[2] && FT && FT.kindOf(n)) return to + '_' + n;
    return to + (m[2] || '');
  }

  // 外からツリーへ落としたファイルのうち取り込むもの。.puml / .plantuml / .uml / .txt。
  // 返り値は { name, file } の並び (name は拡張子を落とした図の名前)。
  function importables(files) {
    var out = [];
    Array.prototype.forEach.call(files || [], function(f) {
      var fn = _s(f && f.name);
      var m = /^(.*)\.(puml|plantuml|uml|txt)$/i.exec(fn);
      if (!m || !m[1]) return;
      out.push({ name: m[1], file: f });
    });
    return out;
  }

  return {
    fileItems: fileItems,
    folderItems: folderItems,
    nextIndex: nextIndex,
    moveInTree: moveInTree,
    keyAction: keyAction,
    cleanName: cleanName,
    copyName: copyName,
    renameForPart: renameForPart,
    importables: importables,
  };
})();
