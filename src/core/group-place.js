'use strict';
window.MA = window.MA || {};

// group-place — クラス図・コンポーネント図・ユースケース図の「追加する位置」
// (BLK-owner-20260923-2332-2)。
//
// 3 図種は境界 (package / rectangle / namespace …) をフォームで作れても、
// 中に要素を入れる手段がフォームに無く、`{ }` が空のまま末尾に残った。
// 状態遷移図 (state-insert) と同じく、追加フォームに「図の末尾 / 境界『X』の中」を
// 置き、選んだ要素の右パネルでも同じ候補から「中へ移す / 外へ出す」を選ばせる。
//
// 各図種の add 関数は insertBeforeEnd で末尾に足すだけなので、ここでは
// 「足す前と足した後の本文」の差 (末尾に入った塊) を取り出し、境界の閉じ `}` の
// 直前へ移す。図種ごとの書式 (enum の本文・ステレオタイプ …) はそのまま保つ。
window.MA.groupPlace = (function() {
  var END = 'end';

  function _s(v) { return v == null ? '' : String(v); }
  function _indentOf(line) { return (_s(line).match(/^\s*/) || [''])[0]; }

  // 中身を持てる境界だけ (閉じ `}` が読めたもの)。
  function _usable(groups) {
    return (groups || []).filter(function(g) {
      return g && g.startLine > 0 && g.endLine > g.startLine;
    });
  }

  function _byId(groups, id) {
    var gs = groups || [];
    for (var i = 0; i < gs.length; i++) if (gs[i] && gs[i].id === id) return gs[i];
    return null;
  }

  // 入れ子の境界は「外 › 内」で出す。同じ名前の境界が別の親に居ても取り違えない。
  function pathOf(groups, group) {
    var names = [];
    var g = group;
    var guard = 0;
    while (g && guard++ < 50) {
      names.unshift(_s(g.label));
      g = g.parentId ? _byId(groups, g.parentId) : null;
    }
    return names.join(' › ');
  }

  function insideLabel(groups, group) {
    return '境界『' + pathOf(groups, group) + '』の中';
  }

  // 追加フォームの候補。境界が無い図では「図の末尾」だけ (= 欄を出さない)。
  function options(groups) {
    var out = [{ value: END, label: '図の末尾' }];
    _usable(groups).forEach(function(g) {
      out.push({ value: g.id, label: insideLabel(groups, g) });
    });
    return out;
  }

  // 行 idx から始まる宣言の最後の行 (0 始まり)。`{` で終わる行はその閉じまで。
  function blockEndIdx(lines, idx) {
    if (!/\{\s*$/.test(_s(lines[idx]))) return idx;
    var depth = 0;
    for (var j = idx; j < lines.length; j++) {
      var t = _s(lines[j]).trim();
      if (/\{\s*$/.test(t)) depth++;
      if (t === '}' || /^\}\s*$/.test(t)) {
        depth--;
        if (depth === 0) return j;
      }
    }
    return idx;
  }

  // 塊の字下げを付け替える。塊の中の相対的な字下げ (enum の値など) は保つ。
  function reindent(block, indent) {
    var min = null;
    block.forEach(function(l) {
      if (!_s(l).trim()) return;
      var n = _indentOf(l).length;
      if (min === null || n < min) min = n;
    });
    min = min || 0;
    return block.map(function(l) {
      if (!_s(l).trim()) return l;
      return indent + _s(l).slice(min);
    });
  }

  // 境界の閉じ `}` の直前へ lines を入れる。字下げは `}` の 1 段内側。
  function insertInto(text, group, block) {
    if (!group) return text;
    var lines = _s(text).split('\n');
    var closeIdx = group.endLine - 1;
    if (closeIdx < 0 || closeIdx >= lines.length) return text;
    var body = reindent(block, _indentOf(lines[group.startLine - 1]) + '  ');
    lines.splice.apply(lines, [closeIdx, 0].concat(body));
    return lines.join('\n');
  }

  // before → after で末尾側に 1 か所だけ入った塊を、境界の中へ移す。
  // 塊が取り出せない (追加が末尾以外を書き換えた) ときは after をそのまま返す。
  function placeAdded(before, after, group) {
    if (!group || before === after) return after;
    var a = _s(before).split('\n');
    var b = _s(after).split('\n');
    if (b.length <= a.length) return after;
    var pre = 0;
    while (pre < a.length && a[pre] === b[pre]) pre++;
    var suf = 0;
    while (suf < a.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    if (pre + suf !== a.length) return after;
    var block = b.slice(pre, b.length - suf);
    var RP = window.MA.regexParts;
    for (var i = 0; i < block.length; i++) {
      if (RP && (RP.isStartUml(block[i].trim()) || RP.isEndUml(block[i].trim()))) return after;
    }
    // 境界は before の行番号で指されている。塊は境界の閉じより後ろに入ったので、
    // before の境界の中へ入れれば「足してから移した」のと同じ結果になる。
    if (group.endLine - 1 >= pre) return after;
    return insertInto(before, group, block);
  }

  // 行 line (1 始まり) を含む最も内側の境界。
  function containerOf(groups, line) {
    var best = null;
    _usable(groups).forEach(function(g) {
      if (g.startLine < line && line < g.endLine) {
        if (!best || g.startLine > best.startLine) best = g;
      }
    });
    return best;
  }

  // 右パネルの候補。今居る境界は「中へ移す」に出さず、居るなら「外へ出す」を先頭に。
  function moveOptions(groups, line) {
    var cur = containerOf(groups, line);
    var out = [{ value: '', label: '境界へ入れる / 出す…' }];
    if (cur) out.push({ value: 'out', label: '境界『' + pathOf(groups, cur) + '』の外へ出す' });
    _usable(groups).forEach(function(g) {
      if (cur && g.id === cur.id) return;
      out.push({ value: g.id, label: insideLabel(groups, g).replace(/の中$/, 'の中へ移す') });
    });
    return out;
  }

  // 行 line の宣言 (ブロックならその閉じまで) を切り出して返す。
  function _cut(lines, line) {
    var s = line - 1;
    if (s < 0 || s >= lines.length) return null;
    var e = blockEndIdx(lines, s);
    return { start: s, end: e, block: lines.slice(s, e + 1) };
  }

  // 宣言を境界の中へ移す。ほかの行は動かさない。
  function moveInto(text, line, groups, groupId) {
    var g = _byId(groups, groupId);
    if (!g) return text;
    var lines = _s(text).split('\n');
    var c = _cut(lines, line);
    if (!c) return text;
    // 自分自身の中 (境界を持つ宣言が自分の境界へ) には移せない
    if (g.startLine - 1 >= c.start && g.endLine - 1 <= c.end) return text;
    var openIdx = g.startLine - 1;
    var closeIdx = g.endLine - 1;
    var indent = _indentOf(lines[openIdx]) + '  ';
    var body = reindent(c.block, indent);
    var n = c.end - c.start + 1;
    lines.splice(c.start, n);
    if (c.start < closeIdx) closeIdx -= n;
    lines.splice.apply(lines, [closeIdx, 0].concat(body));
    return lines.join('\n');
  }

  // 宣言を今の境界の外 (その境界の閉じ `}` の直後) へ出す。
  function moveOut(text, line, groups) {
    var g = containerOf(groups, line);
    if (!g) return text;
    var lines = _s(text).split('\n');
    var c = _cut(lines, line);
    if (!c) return text;
    var body = reindent(c.block, _indentOf(lines[g.startLine - 1]));
    var n = c.end - c.start + 1;
    var afterIdx = g.endLine; // 閉じの直後 (0 始まり)
    lines.splice(c.start, n);
    if (c.start < afterIdx) afterIdx -= n;
    lines.splice.apply(lines, [afterIdx, 0].concat(body));
    return lines.join('\n');
  }

  // ── フォームの状態 ──────────────────────────────────────────────
  // 境界を作った直後・中へ足した直後は、次の追加も同じ境界を既定にする
  // (続けて中身を足せる)。図種ごとに覚える。境界は名前で覚え、同じ名前が
  // 複数あれば後ろ (最後に作った方) を選ぶ。
  var _remembered = {};

  function remember(kind, label) { _remembered[kind] = label == null ? null : _s(label); }
  function forget(kind) { delete _remembered[kind]; }

  function preferred(kind, groups) {
    var lbl = _remembered[kind];
    if (lbl == null) return END;
    var hit = null;
    _usable(groups).forEach(function(g) { if (_s(g.label) === lbl) hit = g; });
    return hit ? hit.id : END;
  }

  // 追加フォームの欄。境界が 1 つも無ければ出さない (選べるものが「末尾」だけ)。
  function fieldHtml(kind, idPrefix, groups) {
    var P = window.MA.properties;
    var opts = options(groups);
    if (opts.length <= 1 || !P) return '';
    var cur = preferred(kind, groups);
    return '<div id="' + idPrefix + '-place-box">' +
      P.selectFieldHtml('追加する位置', idPrefix + '-place', opts.map(function(o) {
        return { value: o.value, label: o.label, selected: o.value === cur };
      })) + '</div>';
  }

  // 追加ボタンの後処理。選んだ位置が境界なら、足した塊をその中へ移す。
  function applyAdd(kind, idPrefix, groups, before, after) {
    var el = document.getElementById(idPrefix + '-place');
    var v = el ? el.value : END;
    var g = v && v !== END ? _byId(groups, v) : null;
    if (!g) { if (el) remember(kind, null); return after; }
    remember(kind, g.label);
    return placeAdded(before, after, g);
  }

  // 右パネルの「境界」欄。境界が無い図では出さない。
  function editFieldHtml(idPrefix, groups, line) {
    var P = window.MA.properties;
    if (!P || _usable(groups).length === 0) return '';
    var cur = containerOf(groups, line);
    return '<div id="' + idPrefix + '-group-box" style="margin-top:8px;">' +
      '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">境界: ' +
        (cur ? window.MA.htmlUtils.escHtml(insideLabel(groups, cur)) : '図の直下 (どの境界にも入っていない)') +
      '</div>' +
      P.selectFieldHtml('境界へ入れる / 出す', idPrefix + '-group-move', moveOptions(groups, line)) +
      '</div>';
  }

  function bindEdit(idPrefix, groups, line, ctx) {
    var el = document.getElementById(idPrefix + '-group-move');
    if (!el) return;
    el.addEventListener('change', function() {
      var v = el.value;
      if (!v) return;
      var t = ctx.getMmdText();
      var out = v === 'out' ? moveOut(t, line, groups) : moveInto(t, line, groups, v);
      if (out === t) return;
      window.MA.history.pushHistory();
      // 行が動くので、選択は外して追加フォームへ戻す (古い行番号を指したままにしない)。
      if (window.MA.selection && window.MA.selection.clearSelection) window.MA.selection.clearSelection();
      ctx.setMmdText(out);
      ctx.onUpdate();
    });
  }

  return {
    END: END,
    pathOf: pathOf,
    insideLabel: insideLabel,
    options: options,
    blockEndIdx: blockEndIdx,
    reindent: reindent,
    insertInto: insertInto,
    placeAdded: placeAdded,
    containerOf: containerOf,
    moveOptions: moveOptions,
    moveInto: moveInto,
    moveOut: moveOut,
    remember: remember,
    forget: forget,
    preferred: preferred,
    fieldHtml: fieldHtml,
    applyAdd: applyAdd,
    editFieldHtml: editFieldHtml,
    bindEdit: bindEdit,
  };
})();
