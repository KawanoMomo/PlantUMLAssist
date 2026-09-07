'use strict';
window.MA = window.MA || {};

// activity-insert — アクティビティ図の「この位置に挿入」(design 4b)。
//
// 4b は、フローの行間を選ぶとその位置に**置ける要素だけ**に絞ったメニューが開き、
// if / while / fork は開始・終了が対で入る、という位置依存の挿入。
// 今までは行を選んで生テキストを 1 行打つしかなく、if を入れるには
// `if (…) then (…)` / `else` / `endif` を全部手で書く必要があった。
// ここは DSL 文字列だけを見る純関数を置き、書き換えは activity モジュールの
// addActionAtLine / addControlAtLine / addSwimlaneAtLine / addNoteAtLine が担う。
window.MA.activityInsert = (function() {
  // 置ける要素。code は activity モジュール側の呼び分けに使う。
  var KINDS = [
    { kind: 'action',   label: 'アクション',        hint: ':処理;' },
    { kind: 'if',       label: '条件分岐 (if)',     hint: 'if / else / endif' },
    { kind: 'while',    label: '繰り返し (while)',  hint: 'while / endwhile' },
    { kind: 'repeat',   label: '繰り返し (repeat)', hint: 'repeat / repeat while' },
    { kind: 'fork',     label: '並行処理 (fork)',   hint: 'fork / fork again / end fork' },
    { kind: 'note',     label: 'ノート',            hint: 'note right' },
    { kind: 'swimlane', label: 'スイムレーンを分ける', hint: '|レーン名|' },
    { kind: 'break',    label: '中断 (break)',      hint: 'break' },
    { kind: 'detach',   label: '切り離し (detach)', hint: 'detach' },
    { kind: 'kill',     label: '打ち切り (kill)',   hint: 'kill' },
  ];

  // フローの外 (start より前 / stop・end より後 / @startuml と title のあたり) で
  // 意味を持つのはレーン宣言と start / stop だけ。
  var OUTSIDE_KINDS = ['swimlane', 'start', 'stop'];

  var START_RE = /^\s*start\s*$/;
  var TERM_RE = /^\s*(stop|end)\s*$/;
  var HEAD_RE = /^\s*(@startuml|@enduml|title\s|skinparam|!|'|$)/;

  function _lines(dsl) {
    return String(dsl == null ? '' : dsl).split('\n');
  }

  function kinds() {
    return KINDS.map(function(k) { return { kind: k.kind, label: k.label, hint: k.hint }; });
  }

  function labelFor(kind) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].kind === kind) return KINDS[i].label;
    return kind;
  }

  // 行 lineNum (1 始まり) がフローの本体 (start と stop/end の間) にあるか。
  // start が無い図では、@startuml / title / skinparam 等の頭でない行を本体とみなす。
  function inFlow(dsl, lineNum) {
    var lines = _lines(dsl);
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return false;
    // 候補は「この行の後ろ」を指すので、stop / end の行そのものは本体の外。
    if (TERM_RE.test(lines[idx])) return false;
    var sawStart = false;
    for (var i = 0; i < idx; i++) {
      if (START_RE.test(lines[i])) sawStart = true;
    }
    if (sawStart) {
      // start より後。stop / end で閉じた後ならもう本体ではない。
      var closed = false;
      for (var j = 0; j < idx; j++) {
        if (TERM_RE.test(lines[j])) closed = true;
        else if (START_RE.test(lines[j])) closed = false;
      }
      return !closed;
    }
    var hasStart = false;
    for (var k = 0; k < lines.length; k++) if (START_RE.test(lines[k])) hasStart = true;
    if (hasStart) return false;                 // start はあるが、この行はその前
    return !HEAD_RE.test(lines[idx]);           // start の無い図は頭以外を本体とみなす
  }

  // その位置に置ける要素だけを返す。フローの外では start / stop / レーンだけ。
  function allowedKinds(dsl, lineNum) {
    if (inFlow(dsl, lineNum)) return kinds();
    var lines = _lines(dsl);
    var hasStart = false, hasTerm = false;
    for (var i = 0; i < lines.length; i++) {
      if (START_RE.test(lines[i])) hasStart = true;
      if (TERM_RE.test(lines[i])) hasTerm = true;
    }
    var out = [];
    OUTSIDE_KINDS.forEach(function(k) {
      if (k === 'start' && hasStart) return;
      if (k === 'stop' && hasTerm) return;
      if (k === 'swimlane') out.push({ kind: 'swimlane', label: labelFor('swimlane'), hint: '|レーン名|' });
      else if (k === 'start') out.push({ kind: 'start', label: 'フローの開始 (start)', hint: 'start' });
      else out.push({ kind: 'stop', label: 'フローの終了 (stop)', hint: 'stop' });
    });
    return out;
  }

  function isAllowed(dsl, lineNum, kind) {
    var list = allowedKinds(dsl, lineNum);
    for (var i = 0; i < list.length; i++) if (list[i].kind === kind) return true;
    return false;
  }

  // 挿入できる位置の一覧。行間ではなく「どの行の後ろか」で表す
  // (position: 'after' で addXxxAtLine にそのまま渡せる)。
  // 先頭の 1 件だけ position: 'before' で「いちばん前」を表す。
  function insertPoints(dsl) {
    var lines = _lines(dsl);
    var pts = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var t = raw.trim();
      if (!t) continue;
      if (/^@enduml/.test(t)) continue;
      var lineNum = i + 1;
      if (/^@startuml/.test(t)) continue;
      pts.push({
        line: lineNum,
        position: 'after',
        text: t,
        label: lineNum + ': ' + t + ' の後',
        inFlow: inFlow(dsl, lineNum),
      });
    }
    // 本体の先頭に置きたいことがあるので「いちばん前」も 1 件出す。
    for (var j = 0; j < lines.length; j++) {
      if (START_RE.test(lines[j])) {
        pts.unshift({
          line: j + 1,
          position: 'before',
          text: lines[j].trim(),
          label: (j + 1) + ': start の前',
          inFlow: false,
        });
        break;
      }
    }
    return pts;
  }

  // 選んだ位置に一番近い候補を返す (行番号だけ分かっているときに使う)。
  function pointAt(dsl, lineNum) {
    var pts = insertPoints(dsl);
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].line === lineNum && pts[i].position === 'after') return pts[i];
    }
    return pts.length ? pts[pts.length - 1] : null;
  }

  // 種類ごとに要る入力欄。フォームの組み立てをここで決め、
  // 画面側は並べるだけにする。
  function fieldsFor(kind) {
    if (kind === 'action') return [{ id: 'text', label: '処理', value: '', placeholder: '例: 受信バッファを読む' }];
    if (kind === 'if') {
      return [
        { id: 'cond', label: '条件', value: '', placeholder: '例: 受信成功?' },
        { id: 'thenLabel', label: 'then のラベル', value: 'yes' },
        { id: 'elseLabel', label: 'else のラベル (空で else なし)', value: 'no' },
      ];
    }
    if (kind === 'while' || kind === 'repeat') {
      return [
        { id: 'cond', label: '条件', value: '', placeholder: '例: 残りあり?' },
        { id: 'label', label: 'ラベル', value: 'yes' },
      ];
    }
    if (kind === 'fork') return [{ id: 'branchCount', label: '枝の数', value: '2' }];
    if (kind === 'note') return [{ id: 'text', label: 'ノート本文', value: '' }];
    if (kind === 'swimlane') return [{ id: 'name', label: 'レーン名', value: '' }];
    return [];   // break / detach / kill / start / stop は入力なし
  }

  // design 4b の「小さなメニュー」の並び。よく置くものだけを 1 段目に出し、
  // 残り (repeat / break / detach / kill) は「その他」の 2 段目に畳む。
  var PRIMARY_ORDER = ['action', 'if', 'while', 'fork', 'note', 'swimlane'];
  var OTHER_ORDER = ['repeat', 'break', 'detach', 'kill'];

  // その位置に置ける要素を 1 段目 / 2 段目に振り分ける。
  // フローの外 (start / stop / レーンだけ) では 2 段目を作らない。
  function pickerKinds(dsl, lineNum) {
    var allowed = allowedKinds(dsl, lineNum);
    var byKind = {};
    allowed.forEach(function(k) { byKind[k.kind] = k; });
    var primary = [];
    var other = [];
    PRIMARY_ORDER.forEach(function(k) { if (byKind[k]) { primary.push(byKind[k]); delete byKind[k]; } });
    OTHER_ORDER.forEach(function(k) { if (byKind[k]) { other.push(byKind[k]); delete byKind[k]; } });
    // 並びに載っていないもの (start / stop) は 1 段目の末尾に、allowed の順で残す。
    allowed.forEach(function(k) { if (byKind[k.kind]) { primary.push(k); delete byKind[k.kind]; } });
    return { primary: primary, other: other };
  }

  // メニューの見出しに出す「どこに入るか」。
  function describePoint(dsl, lineNum, position) {
    var lines = _lines(dsl);
    var idx = lineNum - 1;
    var text = (idx >= 0 && idx < lines.length) ? lines[idx].trim() : '';
    var where = position === 'before' ? 'の前' : 'の後';
    if (!text) return lineNum + ' 行目' + where;
    return lineNum + ' 行目「' + text + '」' + where;
  }

  // 入力なしでそのまま 1 行入る種類。
  function isBareKind(kind) {
    return kind === 'break' || kind === 'detach' || kind === 'kill'
      || kind === 'start' || kind === 'stop';
  }

  function bareLineFor(kind) {
    return isBareKind(kind) ? kind : null;
  }


  // design 4b の右ペインは、選んでいるアクションの居場所を行番号ではなく構造で
  // 示すことを求める (例:「条件分岐「有効?」の yes 側、1 番目」)。
  // ブロックの入れ子は selection-reorder が持つ判定 (isOpen / isClose / isMid /
  // isFence) をそのまま使い、開き行の書き方の解釈だけをここに置く。
  function _condOf(head) {
    var m = /\(([^)]*)\)/.exec(head);
    return m ? m[1] : '';
  }

  // `if (c?) then (yes)` / `else (no)` / `elseif (x) then (y)` の枝ラベル。
  function _branchOf(head) {
    var m = /then\s*\(([^)]*)\)\s*$/i.exec(head);
    if (m) return m[1];
    m = /^else\s*\(([^)]*)\)/i.exec(head);
    if (m) return m[1];
    m = /is\s*\(([^)]*)\)/i.exec(head);        // while (c) is (yes)
    if (m) return m[1];
    return '';
  }

  // 種類は開き行 (openHead) で決める。else / fork again をまたいでも
  // 「条件分岐」「並行処理」という呼び名は変わらないため。
  function _frameLabel(fr) {
    var head = fr.openHead;
    if (/^if\s*\(/i.test(head)) {
      var br = fr.branch;
      return '条件分岐「' + _condOf(head) + '」の' + (br ? ' ' + br + ' 側' : '中');
    }
    if (/^while\s*\(/i.test(head)) return '繰り返し「' + _condOf(head) + '」の中';
    if (/^repeat\s*$/i.test(head)) return '繰り返し (repeat) の中';
    if (/^fork\s*$/i.test(head)) return '並行処理の ' + (fr.branchIndex + 1) + ' 本目';
    if (/^split\s*$/i.test(head)) return '分岐 (split) の ' + (fr.branchIndex + 1) + ' 本目';
    if (/^partition/i.test(head)) return '「' + head.replace(/^partition\s*/i, '').replace(/\{\s*$/, '').trim() + '」の中';
    return '「' + head + '」の中';
  }

  // 行 lineNum が「どのブロックのどちら側の何番目か」。フローの直下なら
  // 「フローの N 番目」。範囲外・空行では '' を返す。
  function describeStructure(dsl, lineNum) {
    var SR = window.MA && window.MA.selectionReorder;
    if (!SR) return '';
    var lines = _lines(dsl);
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return '';
    var stack = [];
    var count = 0;
    for (var i = 0; i <= idx; i++) {
      var line = lines[i];
      var t = line.trim();
      if (!t) continue;
      if (SR.isClose(line)) {
        var st = stack.pop();
        count = st ? st.count : 0;
        if (i === idx) return '';                 // 閉じ行そのものには居場所を出さない
        continue;
      }
      if (SR.isMid(line)) {
        if (stack.length) {
          var top = stack[stack.length - 1];
          top.branch = _branchOf(t);
          top.branchIndex++;
        }
        count = 0;
        if (i === idx) return '';
        continue;
      }
      if (SR.isFence(line)) {
        if (i === idx) return '';
        continue;
      }
      count++;
      if (i === idx) break;
      if (SR.isOpen(line)) {
        stack.push({
          openHead: t, branch: _branchOf(t), branchIndex: 0, count: count,
        });
        count = 0;
      }
    }
    if (!stack.length) return 'フローの ' + count + ' 番目';
    return _frameLabel(stack[stack.length - 1]) + '、' + count + ' 番目';
  }

  return {
    kinds: kinds,
    labelFor: labelFor,
    inFlow: inFlow,
    allowedKinds: allowedKinds,
    isAllowed: isAllowed,
    pickerKinds: pickerKinds,
    describePoint: describePoint,
    describeStructure: describeStructure,
    insertPoints: insertPoints,
    pointAt: pointAt,
    fieldsFor: fieldsFor,
    isBareKind: isBareKind,
    bareLineFor: bareLineFor,
  };
})();
