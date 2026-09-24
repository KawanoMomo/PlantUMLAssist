'use strict';
window.MA = window.MA || {};

// state-insert — State の「追加する位置」(design 4c)。
//
// 右パネルの追加フォームは長く「末尾に追加」しか持たず、Idle と Running の
// 間に状態を 1 つ挟むには、末尾に足してから遷移を消して引き直すか、DSL を
// 手で切り貼りするしかなかった。design 4c は追加フォームに
// 「図の末尾 / この遷移の途中 / (状態) の中」の 3 択を置く。
//
// ここは DOM に触らない純関数だけ。描画と結線は modules/state.js。
window.MA.stateInsert = (function() {
  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 複合状態 = 本文を持つ state (`state X {` … `}`)。
  // 単純 state には中が無いので「の中」の相手にならない。
  function _composites(parsed) {
    return ((parsed && parsed.states) || []).filter(function(s) {
      return s && s.endLine > s.line;
    });
  }

  // 子を置ける状態。中身を持つかどうかで分けない (持たなければ開く)。
  // 疑似状態 (choice / fork / …) だけは中を描けないので外す。
  function _childHosts(parsed) {
    var SC = window.MA.stateChild;
    return ((parsed && parsed.states) || []).filter(function(s) {
      return SC ? SC.canHaveChild(s) : (s && s.endLine > s.line);
    });
  }

  // 選べる位置。図に無いものは出さない — 選んでから「置けません」と
  // 言われるより、最初から並ばない方が迷わない。
  function positions(parsed) {
    var out = [{ value: 'end', label: '図の末尾' }];
    if (((parsed && parsed.transitions) || []).length > 0) {
      out.push({ value: 'transition', label: 'この遷移の途中' });
    }
    // BLK-human-20260915-1206: 以前は「既に中身を持つ状態」がある図でしか
    // 出さなかったので、最初の 1 つを GUI から作る道がどこにも無かった。
    // 中身を持たない状態もその場で `{ }` に開くので、状態が 1 つでもあれば出す。
    if (_childHosts(parsed).length > 0) {
      out.push({ value: 'inside', label: '選んだ状態の中 (子状態にする)' });
    }
    return out;
  }

  // 遷移に載っている `: ...` の中身。parser は label を持たせるが、
  // 3 要素 (trigger / guard / action) しか無い呼ばれ方でも同じ行を作れるように、
  // 無ければ state-transition の組み立てに落とす。
  function _labelOf(t) {
    if (!t) return '';
    var lbl = _s(t.label);
    if (lbl) return lbl;
    var STR = window.MA.stateTransition;
    if (STR && STR.composeLabel) return _s(STR.composeLabel(t.trigger, t.guard, t.action));
    return _s(t.trigger);
  }

  // 遷移の見出し。図の矢印と同じ向きで読めるように → を使う。
  function transitionLabel(t) {
    if (!t) return '';
    var head = _s(t.from) + ' → ' + _s(t.to);
    var lbl = _labelOf(t);
    return lbl ? head + ' : ' + lbl : head;
  }

  function transitionOptions(parsed) {
    return ((parsed && parsed.transitions) || []).map(function(t) {
      return { value: t.id, label: transitionLabel(t) };
    });
  }

  // 「の中」の相手。BLK-human-20260915-1206 以降は中身の有無で絞らない。
  // 入れ子の中の状態は「Outer › Inner」と出す — 同じ名前の子が別の親に
  // 居るとき、どちらを指しているかが名前だけでは分からない。
  function compositeOptions(parsed) {
    var SC = window.MA.stateChild;
    return _childHosts(parsed).map(function(s) {
      return {
        value: s.id,
        label: (SC && SC.breadcrumbText(parsed, s.id)) || s.label || s.id,
      };
    });
  }

  function _findTransition(parsed, id) {
    var ts = (parsed && parsed.transitions) || [];
    for (var i = 0; i < ts.length; i++) if (ts[i].id === id) return ts[i];
    return null;
  }

  function _hasState(parsed, id) {
    var ss = (parsed && parsed.states) || [];
    for (var i = 0; i < ss.length; i++) if (ss[i].id === id) return true;
    return false;
  }

  function _stateLine(id, label, stereotype) {
    var lbl = _s(label);
    var head = (lbl && lbl !== id) ? '"' + lbl + '" as ' + id : id;
    return 'state ' + head + (stereotype ? ' <<' + stereotype + '>>' : '');
  }

  function _indentOf(line) { return (String(line || '').match(/^\s*/) || [''])[0]; }

  // 遷移 A --> B : t の途中に N を挟む。A --> N : t と N --> B に割る。
  // きっかけは前半に残す — 「t が起きたら N へ進み、そのあと B」という
  // 読みになり、後半に付けると t が 2 回要るように見えてしまう。
  function splitTransition(text, parsed, transitionId, newId, stereotype, label) {
    var id = _s(newId);
    if (!id) return text;
    var t = _findTransition(parsed, transitionId);
    if (!t || !t.line) return text;
    var lines = String(text).split('\n');
    var idx = t.line - 1;
    if (idx < 0 || idx >= lines.length) return text;

    var indent = _indentOf(lines[idx]);
    var lbl = _labelOf(t);
    var first = indent + _s(t.from) + ' --> ' + id + (lbl ? ' : ' + lbl : '');
    var second = indent + id + ' --> ' + _s(t.to);

    var replacement = [first, second];
    // 既にある状態を挟むだけなら宣言は増やさない (同じ state 行が 2 本並ぶと
    // PlantUML は通すが、DSL を読む人には重複に見える)。
    if (!_hasState(parsed, id)) replacement.unshift(indent + _stateLine(id, label, stereotype));

    lines.splice.apply(lines, [idx, 1].concat(replacement));
    return lines.join('\n');
  }

  // 中身を持たない状態を `{ }` に開き、その中へ入れる。
  function _insertIntoSimple(text, parsed, stateId, newLines) {
    var SC = window.MA.stateChild;
    var host = null;
    var hs = _childHosts(parsed);
    for (var i = 0; i < hs.length; i++) if (hs[i].id === stateId) { host = hs[i]; break; }
    if (!host || !SC) return text;
    var lines = String(text).split('\n');
    var declIdx = host.line - 1;
    if (declIdx < 0 || declIdx >= lines.length) return text;
    var indent = _indentOf(lines[declIdx]);
    lines[declIdx] = lines[declIdx].replace(/\s*$/, '') + ' {';
    var body = (Array.isArray(newLines) ? newLines : [newLines]).map(function(l) {
      return indent + '  ' + String(l);
    });
    lines.splice.apply(lines, [declIdx + 1, 0].concat(body, [indent + '}']));
    return lines.join('\n');
  }

  // 複合状態の閉じ `}` の直前へ入れる。字下げは `}` の 1 段内側にそろえる。
  function insertInside(text, parsed, compositeId, newLines) {
    var target = null;
    var cs = _composites(parsed);
    for (var i = 0; i < cs.length; i++) if (cs[i].id === compositeId) { target = cs[i]; break; }
    // BLK-human-20260915-1206: まだ中身を持たない状態が相手なら、その場で
    // `{ }` に開いてから入れる (「先に composite に変換」を利用者にさせない)。
    if (!target) return _insertIntoSimple(text, parsed, compositeId, newLines);
    var lines = String(text).split('\n');
    var closeIdx = target.endLine - 1;
    if (closeIdx < 0 || closeIdx >= lines.length) return text;
    var indent = _indentOf(lines[closeIdx]) + '  ';
    var body = (Array.isArray(newLines) ? newLines : [newLines]).map(function(l) {
      return indent + String(l);
    });
    lines.splice.apply(lines, [closeIdx, 0].concat(body));
    return lines.join('\n');
  }

  // ── 遷移を選んだ右パネルの「状態を追加」(BLK-builder-20260924-1252-2, design 4c) ──
  // design 4c は遷移を選んだパネルに「状態を追加 / Add state」と「追加する位置」
  // (この遷移の途中 / 図の末尾 / From の中) を置く。追加タブへ回って挟む遷移を
  // 選び直さなくても、いま選んでいる遷移を相手にして 1 手で足せるようにする。

  function _endingBefore(lines) {
    for (var i = lines.length - 1; i >= 0; i--) if (/^\s*@enduml\b/.test(lines[i])) return i;
    return lines.length;
  }

  function _appendBeforeEnd(text, newLines) {
    var lines = String(text).split('\n');
    lines.splice.apply(lines, [_endingBefore(lines), 0].concat(newLines));
    return lines.join('\n');
  }

  // 遷移の元 (From) を「の中」の相手にできるか。開始・終了・履歴 (`[*]` / `[H]`) は状態ではない。
  // 宣言のある状態はその宣言を開き、宣言の無い最上位の状態 (`Idle --> Running` だけで出る Idle) は
  // 図の末尾に `state Idle { … }` を足す (PlantUML は同じ状態として描く)。
  function fromHost(parsed, tr) {
    if (!tr) return null;
    var raw = _s(tr.from);
    if (!raw || raw.indexOf('[') >= 0) return null;
    var states = (parsed && parsed.states) || [];
    var STb = window.MA.stateTable;
    var id = STb && STb.resolveEnd ? STb.resolveEnd(raw, tr.scope, states) : raw;
    for (var i = 0; i < states.length; i++) {
      if (states[i].id !== id) continue;
      var SC = window.MA.stateChild;
      if (SC && !SC.canHaveChild(states[i])) return null;
      if (!(states[i].line > 0)) break;
      return { id: id, label: states[i].label || id.split('.').pop(), declared: true };
    }
    if (tr.scope || raw.indexOf('.') >= 0) return null;
    return { id: raw, label: raw, declared: false };
  }

  // 選べる位置。複合状態は中身の無い箱を遷移に挟まない (追加タブと同じ)。
  // BLK-builder-20260924-2341-1 (design 4c): 入口・出口ポイントは複合状態の縁に付くので「From の中」だけ。
  // 開始・終了・履歴は置く所が相手で決まる (pseudoFromTransition) ので位置を選ばせない。
  var STEREO_KINDS = { choice: 1, fork: 1, join: 1, entryPoint: 1, exitPoint: 1 };
  var EDGE_KINDS = { entryPoint: 1, exitPoint: 1 };
  var PSEUDO_KINDS = { start: 1, end: 1, history: 1 };
  function transitionPositions(parsed, tr, kind) {
    var out = [];
    if (PSEUDO_KINDS[kind]) return out;
    var host = fromHost(parsed, tr);
    if (EDGE_KINDS[kind]) {
      if (host) out.push({ value: 'inside', label: host.label + ' の中' });
      return out;
    }
    if (kind !== 'composite') out.push({ value: 'transition', label: 'この遷移の途中' });
    out.push({ value: 'end', label: '図の末尾' });
    if (host) out.push({ value: 'inside', label: host.label + ' の中' });
    return out;
  }

  // 遷移の端 (From / To) を状態として引く。`[*]` / `[H]` は状態ではないので null。
  // 宣言の無い状態 (`Idle --> Running` だけで出る Idle) は遷移と同じ所に居るものとして返す。
  function _endState(parsed, tr, raw) {
    var r = _s(raw);
    if (!r || r.indexOf('[') >= 0) return null;
    var states = (parsed && parsed.states) || [];
    var STb = window.MA.stateTable;
    var id = STb && STb.resolveEnd ? STb.resolveEnd(r, tr.scope, states) : r;
    for (var i = 0; i < states.length; i++) if (states[i].id === id) return states[i];
    return { id: id, parentId: tr.scope || null, line: 0, endLine: 0 };
  }
  function _byId(parsed, id) {
    var states = (parsed && parsed.states) || [];
    for (var i = 0; i < states.length; i++) if (states[i].id === id) return states[i];
    return null;
  }
  function _bare(id) { return String(id || '').split('.').pop(); }

  // 選んだ遷移から 開始 / 終了 / 履歴 を足すときの相手と、書かれる 1 行。
  //   start   — From (From が [*] なら To) を、その状態と同じ所の開始にする
  //   end     — To (To が [*] なら From) から終わる
  //   history — To の親 (To が中を持つ複合状態なら To) の [H] へ、From から戻る
  // 返り値 { ok, kind, scope, state, line } / { ok: false, reason }。scope は複合状態の id (最上位は '')。
  function pseudoFromTransition(parsed, tr, kind) {
    if (!tr) return { ok: false, reason: '遷移を選んでください' };
    var from = _endState(parsed, tr, tr.from);
    var to = _endState(parsed, tr, tr.to);
    if (kind === 'start' || kind === 'end') {
      var st = kind === 'start' ? (from || to) : (to || from);
      if (!st) return { ok: false, reason: '開始・終了を付ける状態がありません' };
      return {
        ok: true, kind: kind, scope: st.parentId || '', state: st.id,
        line: kind === 'start' ? '[*] --> ' + _bare(st.id) : _bare(st.id) + ' --> [*]',
      };
    }
    if (kind === 'history') {
      var host = null;
      if (to && to.line > 0 && to.endLine > to.line) host = to;
      else if (to && to.parentId) host = _byId(parsed, to.parentId);
      if (!host || !from) {
        return { ok: false, reason: '履歴は、複合状態 (中を持つ状態) かその中の状態へ向かう遷移を選んだときに足せます' };
      }
      return {
        ok: true, kind: 'history', scope: host.id, state: from.id,
        line: _bare(from.id) + ' --> ' + _bare(host.id) + '[H]',
      };
    }
    return { ok: false, reason: '' };
  }

  // opts = { kind: 'state' | 'composite' | 'choice' | 'fork' | 'join' | 'entryPoint' | 'exitPoint', id, label,
  //         where: 'transition' | 'end' | 'inside' }
  function addFromTransition(text, parsed, tr, opts) {
    var o = opts || {};
    var id = _s(o.id);
    if (!id || !tr) return text;
    var kind = o.kind || 'state';
    if (PSEUDO_KINDS[kind]) return text;
    var stereo = STEREO_KINDS[kind] ? kind : null;
    var decl = _stateLine(id, o.label, stereo);
    var block = kind === 'composite' ? [decl + ' {', '}'] : [decl];
    if (EDGE_KINDS[kind] && o.where !== 'inside') return text;
    if (o.where === 'transition') {
      if (kind === 'composite') return text;
      return splitTransition(text, parsed, tr.id, id, stereo, o.label);
    }
    if (o.where === 'inside') {
      var host = fromHost(parsed, tr);
      if (!host) return text;
      if (host.declared) return insertInside(text, parsed, host.id, block);
      return _appendBeforeEnd(text, ['state ' + host.id + ' {'].concat(
        block.map(function(l) { return '  ' + l; }), ['}']));
    }
    return _appendBeforeEnd(text, block);
  }

  return {
    fromHost: fromHost,
    transitionPositions: transitionPositions,
    addFromTransition: addFromTransition,
    pseudoFromTransition: pseudoFromTransition,
    positions: positions,
    transitionLabel: transitionLabel,
    transitionOptions: transitionOptions,
    compositeOptions: compositeOptions,
    splitTransition: splitTransition,
    insertInside: insertInside,
  };
})();
