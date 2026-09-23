'use strict';
window.MA = window.MA || {};

// state-branch — 状態遷移図の分岐 (choice 擬似状態 + 複数のガード付き遷移) を
// 1 度の入力でまとめて組み立てる。
//
// choice 状態そのものは Properties の「+ State追加」で作れるが、そこから伸びる
// 遷移は Transition 追加フォームを 1 本ずつ開いて Guard を埋めるしかない。
// 分岐は本質的に「1 つの入口と N 本の枝」で 1 つの単位なので、枝をまとめて
// 受け取り、DSL 行を一括で生成する。
//
// 生成する行:
//   state {choiceId} <<choice>>          (未宣言のときだけ)
//   {source} --> {choiceId} : {trigger}  (source があるときだけ)
//   {choiceId} --> {to} : [{guard}] / {action}   枝の数だけ
window.MA.stateBranch = (function() {
  var ASCII_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // text 中で既に使われている state 名。choice の別名生成と
  // 「もう宣言済みか」の判定に使う。
  function existingIds(text) {
    var ids = {};
    _s(text).split('\n').forEach(function(raw) {
      var line = raw.trim();
      var m = line.match(/^state\s+(?:"[^"]*"\s+as\s+)?([A-Za-z_][A-Za-z0-9_.]*)/);
      if (m) { ids[m[1]] = true; return; }
      var a = line.match(/^(\[\*\]|[A-Za-z_][A-Za-z0-9_.]*)\s*-[-a-z]*->\s*(\[\*\]|[A-Za-z_][A-Za-z0-9_.]*)/);
      if (a) {
        if (a[1] !== '[*]') ids[a[1]] = true;
        if (a[2] !== '[*]') ids[a[2]] = true;
      }
    });
    return ids;
  }

  // 日本語の choice 名を打たれても壊れないよう、ASCII 別名へ寄せる。
  // id-normalizer と同じ約束 ("表示名" as ASCII別名)。
  function normalizeId(rawInput, text, prefix) {
    var trimmed = _s(rawInput);
    if (!trimmed) return { id: '', label: '', valid: false };
    if (ASCII_ID_RE.test(trimmed)) return { id: trimmed, label: trimmed, valid: true };
    var used = existingIds(text);
    var pfx = prefix || 'C';
    for (var i = 1; i < 10000; i++) {
      if (!used[pfx + i]) return { id: pfx + i, label: trimmed, valid: true };
    }
    return { id: pfx + Date.now(), label: trimmed, valid: true };
  }

  // 空の枝 (遷移先が無い) は無視する。フォームは既定で数行出すので、
  // 埋めなかった行がそのまま DSL に漏れないようにする。
  function normalizeSpec(spec, text) {
    var src = spec || {};
    var norm = normalizeId(src.choiceId, text, 'C');
    var branches = [];
    (src.branches || []).forEach(function(b) {
      var to = _s(b && b.to);
      if (!to) return;
      branches.push({ to: to, guard: _s(b.guard), action: _s(b.action) });
    });
    return {
      source: _s(src.source),
      trigger: _s(src.trigger),
      choiceId: norm.id,
      choiceLabel: norm.label,
      branches: branches,
    };
  }

  // ── 枝の一括入力 (BLK-junior-20260907-0803) ────────────────────────────
  // 枝ごとに「ガード」「遷移先」「アクション」の 3 欄をクリックして回ると、
  // 枝が 2 本でもクリックとフォーカス移動が 8 回になる。他の一括入力
  // (#seq-tail-bulk / #cl-scaffold-open / #ac-tail-add-lines) と同じ「1 行 1 枝」で
  // 受けられるようにして、枝が増えても手数が線形に増えないようにする。
  //
  // 1 行の書き方:  {ガード} -> {遷移先} / {アクション}
  //   重大 -> Error / notify
  //   軽微 -> Idle
  //   -> Idle            (ガード無しの枝 = else)
  //   Idle               (矢印を省くと遷移先だけの枝)
  // 「->」は「→」「=>」でもよい。空行と # で始まる行は読み飛ばす。
  var ARROW_RE = /\s*(?:-+>|=+>|→)\s*/;

  function parseBranchLines(input) {
    var out = [];
    _s(input).split('\n').forEach(function(raw) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var guard = '', rest = line;
      var m = line.split(ARROW_RE);
      if (m.length >= 2) {
        guard = _s(m[0]);
        rest = m.slice(1).join(' -> ');
      }
      var action = '';
      var slash = rest.indexOf('/');
      if (slash >= 0) {
        action = _s(rest.substring(slash + 1));
        rest = rest.substring(0, slash);
      }
      var to = _s(rest);
      if (!to && !guard && !action) return;
      out.push({ guard: guard, to: to, action: action });
    });
    return out;
  }

  // 行に戻す (フォームの行を触ったとき、一括入力欄を追随させるため)。
  function formatBranchLines(branches) {
    return (branches || []).map(function(b) {
      var guard = _s(b && b.guard), to = _s(b && b.to), action = _s(b && b.action);
      if (!guard && !to && !action) return '';
      return (guard ? guard + ' ' : '') + '-> ' + to + (action ? ' / ' + action : '');
    }).filter(function(l) { return l !== ''; }).join('\n');
  }

  // ── 置き換え元の直接遷移 (BLK-junior-20260907-0803 追記) ────────────────
  // 分岐は「そのトリガーで起きる枝分かれ」を表すので、同じ遷移元・同じトリガーの
  // 直接遷移が残っていると経路が二重になった図がそのまま保存される。
  // choice へ向かう遷移だけは残す (今まさに足す行そのもの)。
  var TRANS_RE = /^(\[\*\]|[A-Za-z_][A-Za-z0-9_.]*)\s*-[-a-z]*->\s*(\[\*\]|[A-Za-z_][A-Za-z0-9_.]*)\s*(?::\s*(.*))?$/;

  // ラベルからトリガー名だけを取り出す (`Fault [重大] / act` → `Fault`)。
  function triggerOf(label) {
    var s = _s(label);
    if (!s) return '';
    var cut = s.length;
    var b = s.indexOf('[');
    if (b >= 0 && b < cut) cut = b;
    var sl = s.indexOf('/');
    if (sl >= 0 && sl < cut) cut = sl;
    return _s(s.substring(0, cut));
  }

  // 消す対象の行を {line, text} で返す (1 始まり)。UI はこれを「消える行」として見せる。
  function replacedTransitions(text, spec) {
    var s = normalizeSpec(spec, text);
    if (!s.source || !s.trigger || !s.choiceId || s.branches.length === 0) return [];
    var out = [];
    _s(text).split('\n').forEach(function(raw, i) {
      var m = raw.trim().match(TRANS_RE);
      if (!m) return;
      if (m[1] !== s.source) return;
      if (m[2] === s.choiceId) return;          // これから足す行と同じ向きは残す
      if (triggerOf(m[3]) !== s.trigger) return;
      out.push({ line: i + 1, text: raw.trim() });
    });
    return out;
  }

  // 「何が足りないか」を返す。UI は確定ボタンの可否とメッセージに使う。
  function validate(spec, text) {
    var s = normalizeSpec(spec, text);
    var errors = [];
    if (!s.choiceId) errors.push('分岐 (choice) 状態の名前を入れてください');

    // BLK-human-20260923-1330: 重複した枝もガード無しが複数あるのも PlantUML としては
    // 書ける行なので、止めずに「確かめたいこと」として警告に落とす。
    var warnings = [];
    if (s.branches.length < 2) warnings.push('枝が 1 本だけです (分岐になりませんが行は追加されます)');
    var seen = {};
    s.branches.forEach(function(b) {
      var key = JSON.stringify([b.to, b.guard]);
      if (seen[key]) warnings.push('同じ遷移先とガードの枝が重複しています: ' + b.to);
      seen[key] = true;
    });
    var noGuard = s.branches.filter(function(b) { return !b.guard; });
    if (noGuard.length > 1) warnings.push('ガード無しの枝 (else) が ' + noGuard.length + ' 本あります');
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function fmtTransition(from, to, trigger, guard, action) {
    var parts = [];
    if (trigger) parts.push(trigger);
    if (guard) parts.push('[' + guard + ']');
    if (action) parts.push('/ ' + action);
    return from + ' --> ' + to + (parts.length ? ' : ' + parts.join(' ') : '');
  }

  // 追加される行だけを返す。UI のプレビューと apply が同じ結果を見る。
  function preview(text, spec) {
    var s = normalizeSpec(spec, text);
    if (!s.choiceId || s.branches.length === 0) return [];
    var lines = [];
    if (!existingIds(text)[s.choiceId]) {
      var decl = (s.choiceLabel && s.choiceLabel !== s.choiceId)
        ? 'state "' + s.choiceLabel + '" as ' + s.choiceId
        : 'state ' + s.choiceId;
      lines.push(decl + ' <<choice>>');
    }
    if (s.source) lines.push(fmtTransition(s.source, s.choiceId, s.trigger, '', ''));
    s.branches.forEach(function(b) {
      lines.push(fmtTransition(s.choiceId, b.to, '', b.guard, b.action));
    });
    return lines;
  }

  function _insertBeforeEnd(text, newLines) {
    var lines = _s(text).length ? String(text).split('\n') : [];
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml\s*$/i.test(lines[i])) { endIdx = i; break; }
    }
    if (endIdx >= 0) {
      var args = [endIdx, 0].concat(newLines);
      lines.splice.apply(lines, args);
      return lines.join('\n');
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    var hasStart = lines.some(function(l) { return /^\s*@startuml/i.test(l); });
    if (!hasStart) lines.unshift('@startuml');
    return lines.concat(newLines, ['@enduml']).join('\n');
  }

  // 1 手で分岐一式を書き込む。不正な spec なら text をそのまま返す
  // (呼び手が validate せずに呼んでも DSL を壊さない)。
  function apply(text, spec) {
    var lines = preview(text, spec);
    if (lines.length === 0) return text;
    var out = _removeLines(text, replacedTransitions(text, spec));
    return _insertBeforeEnd(out, lines);
  }

  function _removeLines(text, drops) {
    if (!drops || !drops.length) return text;
    var kill = {};
    drops.forEach(function(d) { kill[d.line] = true; });
    return _s(text).split('\n').filter(function(_, i) { return !kill[i + 1]; }).join('\n');
  }

  return {
    existingIds: existingIds,
    parseBranchLines: parseBranchLines,
    formatBranchLines: formatBranchLines,
    triggerOf: triggerOf,
    replacedTransitions: replacedTransitions,
    normalizeId: normalizeId,
    normalizeSpec: normalizeSpec,
    validate: validate,
    preview: preview,
    apply: apply,
  };
})();
