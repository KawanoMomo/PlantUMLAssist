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
    { kind: 'repeat',   label: '後判定の繰り返し (repeat)', hint: 'repeat / repeat while' },
    { kind: 'fork',     label: '並行 (fork)',   hint: 'fork / fork again / end fork' },
    { kind: 'note',     label: '注釈 (note)',       hint: 'note right' },
    { kind: 'swimlane', label: 'レーン (swimlane)', hint: '|レーン名|' },
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


  // ── 位置の読める説明 (BLK-junior-20260908-0103) ─────────────────────────────
  // 「位置」の候補が行番号と DSL の生コード (例: `8: if (初期化失敗時?) then (異常) の後`)
  // でしか出ていなかったため、どちらが異常側の行かを PlantUML の構文から自分で
  // 判断する必要があった。DSL を 1 度なぞって「どの分岐の どちら側 の中か」を持ち、
  // 候補を日本語の構造で言い直す。記法を覚えていなくても位置が選べる。
  var L_IF = /^if\s*\(([^)]*)\)\s*(?:then\s*(?:\(([^)]*)\))?)?\s*$/i;
  var L_ELSEIF = /^elseif\s*\(([^)]*)\)\s*(?:then\s*(?:\(([^)]*)\))?)?\s*$/i;
  var L_ELSE = /^else(?:\s*\(([^)]*)\))?\s*$/i;
  var L_ENDIF = /^endif\s*$/i;
  var L_WHILE = /^while\s*\(([^)]*)\)\s*(?:is\s*\(([^)]*)\))?\s*$/i;
  var L_ENDWHILE = /^endwhile\s*$/i;
  var L_REPEAT = /^repeat\s*$/i;
  var L_REPEAT_WHILE = /^repeat\s+while\s*\(([^)]*)\)\s*(?:is\s*\(([^)]*)\))?\s*$/i;
  var L_FORK = /^fork\s*$/i;
  var L_FORK_AGAIN = /^fork\s+again\s*$/i;
  var L_END_FORK = /^end\s+fork\s*$/i;
  var L_SWIMLANE = /^\|(?:#[^|]+\|)?\s*([^|]+?)\s*\|$/;
  var L_ACTION = /^(?:#[A-Za-z0-9_]+(?:\/#?[A-Za-z0-9_]+)?\s*)?:(.*?);?\s*(?:<<[^>]*>>)?\s*$/;
  var L_NOTE = /^note\b/i;

  function _q(s) { return '「' + String(s == null ? '' : s).trim() + '」'; }

  // 各行の「そこはどの構造の中か」。開いている構造を積んで 1 度なぞる。
  // 返すのは行ごとの { depth, inside, self } (1 始まりの添字)。
  //   inside — その行が属する枠 (分岐の側 / 繰り返しの中 / 並行処理の N 本目)
  //   self   — その行そのものが何か
  function structure(dsl) {
    var lines = _lines(dsl);
    var stack = [];
    var out = [];
    function top() { return stack.length ? stack[stack.length - 1] : null; }
    function insideText() {
      var t = top();
      return t ? t.inside : '';
    }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      var m, self = '', depth = stack.length, inside = insideText();
      if ((m = t.match(L_IF))) {
        self = '分岐' + _q(m[1]) + 'の ' + (m[2] || 'yes') + ' 側のはじめ';
        stack.push({ cond: m[1], inside: '分岐' + _q(m[1]) + 'の ' + (m[2] || 'yes') + ' 側' });
      } else if ((m = t.match(L_ELSEIF)) && top() && top().cond != null) {
        stack.pop();
        self = '分岐' + _q(m[1]) + 'の ' + (m[2] || 'yes') + ' 側のはじめ';
        stack.push({ cond: m[1], inside: '分岐' + _q(m[1]) + 'の ' + (m[2] || 'yes') + ' 側' });
        depth = stack.length - 1;
      } else if ((m = t.match(L_ELSE)) && top() && top().cond != null) {
        var cond = top().cond;
        stack.pop();
        var lbl = m[1] || 'no';
        self = '分岐' + _q(cond) + 'の ' + lbl + ' 側のはじめ';
        stack.push({ cond: cond, inside: '分岐' + _q(cond) + 'の ' + lbl + ' 側' });
        depth = stack.length - 1;
      } else if (L_ENDIF.test(t)) {
        var c2 = top() ? top().cond : null;
        if (top() && top().cond != null) stack.pop();
        depth = stack.length;
        inside = insideText();
        self = '分岐' + (c2 == null ? '' : _q(c2)) + 'を閉じた後';
      } else if ((m = t.match(L_WHILE))) {
        self = '繰り返し' + _q(m[1]) + 'の中のはじめ';
        stack.push({ inside: '繰り返し' + _q(m[1]) + 'の中' });
      } else if (L_ENDWHILE.test(t)) {
        if (stack.length) stack.pop();
        depth = stack.length;
        inside = insideText();
        self = '繰り返しを閉じた後';
      } else if ((m = t.match(L_REPEAT_WHILE))) {
        if (stack.length) stack.pop();
        depth = stack.length;
        inside = insideText();
        self = '繰り返し' + _q(m[1]) + 'を閉じた後';
      } else if (L_REPEAT.test(t)) {
        self = '繰り返しの中のはじめ';
        stack.push({ inside: '繰り返しの中' });
      } else if (L_FORK.test(t)) {
        self = '並行処理 1 本目のはじめ';
        stack.push({ fork: 1, inside: '並行処理 1 本目' });
      } else if (L_FORK_AGAIN.test(t)) {
        var n = (top() && top().fork ? top().fork : 1) + 1;
        if (top() && top().fork) stack.pop();
        self = '並行処理 ' + n + ' 本目のはじめ';
        stack.push({ fork: n, inside: '並行処理 ' + n + ' 本目' });
        depth = stack.length - 1;
      } else if (L_END_FORK.test(t)) {
        if (stack.length) stack.pop();
        depth = stack.length;
        inside = insideText();
        self = '並行処理を閉じた後';
      } else if ((m = t.match(L_SWIMLANE))) {
        self = 'レーン' + _q(m[1]) + 'のはじめ';
      } else if (START_RE.test(t)) {
        self = 'フローのはじめ';
      } else if (TERM_RE.test(t)) {
        self = 'フローの終わりの後';
      } else if (L_NOTE.test(t)) {
        self = 'ノートの後';
      } else if (t && (m = t.match(L_ACTION)) && t.charAt(0) !== '@' && /:/.test(t)) {
        self = 'アクション' + _q(m[1]) + 'の後';
      }
      out.push({ depth: depth, inside: inside, self: self, text: t });
    }
    return out;
  }

  // pointLabel: 「位置」の 1 行。構造で言い、行番号は末尾に小さく残す
  // (DSL を読む人が突き合わせられるように)。
  function pointLabel(dsl, lineNum, position) {
    var st = structure(dsl);
    var idx = lineNum - 1;
    var s = (idx >= 0 && idx < st.length) ? st[idx] : null;
    if (!s) return 'L' + lineNum;
    if (position === 'before') return 'フローのはじめの前 (L' + lineNum + ')';
    var body = s.self;
    if (!body) body = _q(s.text) + 'の後';
    // 分岐や繰り返しの中の行は、どの枠の中かを先に言う。
    if (s.inside && s.self && s.self.indexOf('のはじめ') < 0 && s.self.indexOf('閉じた後') < 0) {
      body = s.inside + ' ・ ' + body;
    }
    return body + ' (L' + lineNum + ')';
  }


  // pointIndexForLine: 図で選んだ要素の行に当たる候補の番号 (0 始まり)。
  // 図形をクリックしてから「＋この位置に挿入」を開いたとき、位置を選び直さずに
  // その要素の位置から始められるようにする。無ければ -1。
  function pointIndexForLine(dsl, lineNum) {
    var n = Number(lineNum);
    if (!isFinite(n) || n < 1) return -1;
    var pts = insertPoints(dsl);
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].line === n && pts[i].position === 'after') return i;
    }
    return -1;
  }

  // defaultPointIndex: 既定の位置。図で要素を選んでいればその位置、
  // 選んでいなければ本体の最後 (いちばんよく足す位置)。
  function defaultPointIndex(dsl, selectedLine) {
    var pts = insertPoints(dsl);
    var i = pointIndexForLine(dsl, selectedLine);
    if (i >= 0) return i;
    var last = 0;
    for (var d = 0; d < pts.length; d++) if (pts[d].inFlow) last = d;
    return last;
  }

  // 図で選んだ要素に合わせたことを画面で言う 1 行。
  function pickedNote(dsl, selectedLine) {
    var i = pointIndexForLine(dsl, selectedLine);
    if (i < 0) return '';
    var pt = insertPoints(dsl)[i];
    return '図で選んだ ' + pt.label.replace(/\s*\(L\d+\)$/, '') + ' に合わせました';
  }

  // 挿入できる位置の一覧。行間ではなく「どの行の後ろか」で表す
  // (position: 'after' で addXxxAtLine にそのまま渡せる)。
  // 先頭の 1 件だけ position: 'before' で「いちばん前」を表す。
  function insertPoints(dsl) {
    var lines = _lines(dsl);
    var st = structure(dsl);
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
        label: pointLabel(dsl, lineNum, 'after'),
        raw: lineNum + ': ' + t + ' の後',
        depth: st[i] ? st[i].depth : 0,
        inside: st[i] ? st[i].inside : '',
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
          label: pointLabel(dsl, j + 1, 'before'),
          raw: (j + 1) + ': start の前',
          depth: 0,
          inside: '',
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
        { id: 'thenLabel', label: 'yes のラベル', value: 'yes' },
        { id: 'elseLabel', label: 'no のラベル (空で no 側なし)', value: 'no' },
      ];
    }
    if (kind === 'while' || kind === 'repeat') {
      return [
        { id: 'cond', label: '条件', value: '', placeholder: '例: 残りあり?' },
        { id: 'label', label: 'ラベル', value: 'yes' },
      ];
    }
    if (kind === 'fork') return [{ id: 'branchCount', label: '枝の数', value: '2' }];
    if (kind === 'note') return [{ id: 'text', label: '注釈の本文', value: '' }];
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
    structure: structure,
    pointLabel: pointLabel,
    pointIndexForLine: pointIndexForLine,
    defaultPointIndex: defaultPointIndex,
    pickedNote: pickedNote,
    insertPoints: insertPoints,
    pointAt: pointAt,
    fieldsFor: fieldsFor,
    isBareKind: isBareKind,
    bareLineFor: bareLineFor,
  };
})();
