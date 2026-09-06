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

  // 入力なしでそのまま 1 行入る種類。
  function isBareKind(kind) {
    return kind === 'break' || kind === 'detach' || kind === 'kill'
      || kind === 'start' || kind === 'stop';
  }

  function bareLineFor(kind) {
    return isBareKind(kind) ? kind : null;
  }

  return {
    kinds: kinds,
    labelFor: labelFor,
    inFlow: inFlow,
    allowedKinds: allowedKinds,
    isAllowed: isAllowed,
    insertPoints: insertPoints,
    pointAt: pointAt,
    fieldsFor: fieldsFor,
    isBareKind: isBareKind,
    bareLineFor: bareLineFor,
  };
})();
