'use strict';
window.MA = window.MA || {};

// method-audit — シーケンス図で呼んでいるメソッドと、クラス図の宣言を突き合わせる。
//
// BLK-reviewer-20260907-0143: name-audit は participant / class の「名前」までしか
// 見ておらず、`Spi_Init()` のようなメッセージが driver_common_class に宣言されて
// いるか、引数の個数が合っているかは grep して目視で突合するしかなかった。
// 図が増えるたびに (UART → Timer → ADC) 同じ欠落が繰り返し起票されている。
//
// ここは DOM に触らない純関数だけを置き、表示と結線は app.js。
window.MA.methodAudit = (function() {

  // シーケンスのメッセージ本文に出る呼び出し。`Spi_Init()` `Uart_Send(buf, len)`。
  // 本文全体ではなく「識別子 + 丸括弧」だけを拾うので、`: 初期化する` のような
  // 日本語の本文は呼び出しとして数えない。
  var CALL_RE = /([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;
  var MSG_RE = /^\s*(?:"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|<-+|-+\\|\/-+)\s*(?:"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/;

  // クラス本体の開始行 `class Spi_Driver {` と、外置きの `Spi_Driver : +Spi_Init()`。
  // BLK-reviewer-20260907-0943: state の遷移ラベルは `Idle --> Busy : Timer_StartConv`
  // のように丸括弧を持たない。CALL_RE は括弧を要求するので、この形は今まで
  // 突合の網に 1 件も掛からず、adc_state.puml を接頭辞だけ替えて複製した
  // timer_state.puml のイベント名が どのクラスにも無いことに誰も気付けなかった。
  var STATE_TRANS_RE = /^\s*(?:\[\*\]|"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*-+(?:up|down|left|right)?-*>\s*(?:\[\*\]|"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/;
  var EVENT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  var CLASS_OPEN_RE = /^\s*(?:abstract\s+class|abstract|class|interface|enum|struct)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;
  var MEMBER_OUTSIDE_RE = /^\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/;

  function _key(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[_\-.\s]/g, '');
  }

  // BLK-reviewer-20260907-1203: 保存された .puml は CRLF が普通なので、行末に \r が
  // 残る。上の正規表現はどれも末尾が `(.+)$` で、JS の `.` は \r に当たらないため、
  // CRLF の図では遷移ラベルが 1 件も拾えず「問題なし」を返していた。
  // 行を渡す入口で必ずここを通し、改行の種類を突合の結果に影響させない。
  function _line(s) {
    return String(s == null ? '' : s).replace(/\r$/, '');
  }

  function _lines(text) {
    return String(text == null ? '' : text).split(/\r?\n/);
  }

  // 引数の個数。`()` は 0、`(buf: uint8*, len)` は 2。空白だけも 0 とする。
  function argCount(argsText) {
    var t = String(argsText == null ? '' : argsText).trim();
    if (!t) return 0;
    return t.split(',').filter(function(p) { return p.trim() !== ''; }).length;
  }

  // 1 行から呼び出しを 1 件取り出す。メソッドらしくない行は null。
  function parseCall(line) {
    var m = _line(line).match(MSG_RE);
    if (!m) return null;
    var body = m[1];
    var c = body.match(CALL_RE);
    if (!c) return null;
    return { method: c[1], args: argCount(c[2]) };
  }

  // クラス図の 1 図からメソッド宣言を取り出す。
  // 返り値: { classes: [クラス名], methods: [{ cls, method, args, ret }] }
  function parseClassDoc(dsl) {
    var lines = _lines(dsl);
    var classes = [];
    var methods = [];
    var open = null;   // 波括弧の中にいるときの、そのクラス名

    function addMethod(cls, text) {
      var t = String(text).replace(/^\s*[+\-#~]\s*/, '').trim();
      var c = t.match(CALL_RE);
      if (!c) return;                       // 属性 (括弧が無い) はメソッドではない
      var after = t.slice(t.indexOf('(' + c[2] + ')') + c[2].length + 2);
      var ret = (after.match(/^\s*:\s*(.+?)\s*$/) || [])[1] || '';
      methods.push({ cls: cls, method: c[1], args: argCount(c[2]), ret: ret });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*'/.test(line)) continue;                 // コメント
      if (open !== null) {
        if (/^\s*\}/.test(line)) { open = null; continue; }
        addMethod(open, line);
        continue;
      }
      var co = line.match(CLASS_OPEN_RE);
      if (co) {
        var cname = co[2] || co[3] || co[1];
        if (cname && classes.indexOf(cname) === -1) classes.push(cname);
        if (/\{\s*$/.test(line)) open = cname;
        continue;
      }
      var mo = line.match(MEMBER_OUTSIDE_RE);
      if (mo && classes.indexOf(mo[1]) !== -1) addMethod(mo[1], mo[2]);
    }
    return { classes: classes, methods: methods };
  }

  // `Spi_Init` の持ち主は `Spi`。接頭辞の無い名前 (`Init`) は持ち主なしとする。
  function ownerPrefix(method) {
    var m = String(method == null ? '' : method).match(/^([A-Za-z0-9]+)_/);
    return m ? m[1] : '';
  }

  // 持ち主 (Spi) に対応するクラス (Spi_Driver / SpiDriver / Spi) を探す。
  // 正規化キーの前方一致で選び、いちばん短い名前を採る (Spi_Driver と
  // Spi_Driver_Cfg があれば Spi_Driver)。
  function findClass(classes, prefix) {
    if (!prefix) return null;
    var pk = _key(prefix);
    var hit = null;
    (classes || []).forEach(function(c) {
      if (_key(c).indexOf(pk) !== 0) return;
      if (!hit || c.length < hit.length) hit = c;
    });
    return hit;
  }

  // 遷移ラベルの「きっかけ」を 1 件取り出す。`start [cond] / act()` なら `start`。
  // 括弧つき (`Timer_Init()`) は呼び出しとして parseCall が拾うので、ここでは扱わない。
  // 日本語ラベル・空白入りのラベル (`受信 完了`) はイベント名として数えない
  // (クラスのメソッド名と突き合わせられる形になっていないため)。
  function parseStateEvent(line) {
    var m = _line(line).match(STATE_TRANS_RE);
    if (!m) return null;
    // guard `[...]` と action `/ ...` を先に落とす。action 側の `log()` の括弧で
    // 行ごと捨ててしまうと、`Timer_Fault [retry > 3] / log()` のきっかけを取り逃す。
    var trigger = m[1].split('/')[0].split('[')[0].trim();
    if (!EVENT_NAME_RE.test(trigger)) return null;
    return { event: trigger };
  }

  // state の図かどうか。diagramType があればそれを信じ、無ければ DSL の形で見る
  // (保存フォルダから読んだ図には diagramType が付いていないことがある)。
  function isStateDoc(doc) {
    var t = String((doc && doc.diagramType) || '');
    if (t) return t.indexOf('state') !== -1;
    var dsl = String((doc && doc.dsl) || '');
    return /^\s*\[\*\]\s*-/m.test(dsl) || /^\s*state\s+/m.test(dsl);
  }

  // state の図から遷移イベントを集める。
  function stateEvents(docs) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!isStateDoc(d)) return;
      var docName = (d && d.name) || '';
      _lines((d && d.dsl) || '').forEach(function(line, idx) {
        var e = parseStateEvent(line);
        if (!e) return;
        out.push({ event: e.event, doc: docName, line: idx + 1 });
      });
    });
    return out;
  }

  // docs: [{ name, dsl, diagramType }]
  // 返り値: { calls, classes, methods, issues: [...], clean }
  //
  // issues の kind:
  //   'no-class'  … 呼び出しの型に対応するクラスがどのクラス図にも無い
  //   'no-method' … クラスはあるが、そのメソッドが宣言されていない
  //   'arity'     … 宣言はあるが引数の個数が呼び出しと違う
  function audit(docs) {
    var list = Array.isArray(docs) ? docs : [];
    var classes = [];
    var methods = [];
    var calls = [];

    list.forEach(function(d) {
      var docName = (d && d.name) || '';
      var dsl = (d && d.dsl) || '';
      var parsedCls = parseClassDoc(dsl);
      parsedCls.classes.forEach(function(c) { if (classes.indexOf(c) === -1) classes.push(c); });
      parsedCls.methods.forEach(function(m) {
        methods.push({ cls: m.cls, method: m.method, args: m.args, ret: m.ret, doc: docName });
      });
      _lines(dsl).forEach(function(line, idx) {
        var c = parseCall(line);
        if (!c) return;
        calls.push({ method: c.method, args: c.args, doc: docName, line: idx + 1 });
      });
    });

    // 同じ呼び出しが複数の図に出るので、メソッド名 + 引数個数でまとめる。
    var seen = {};
    var issues = [];
    calls.forEach(function(c) {
      var sig = c.method + '/' + c.args;
      if (seen[sig]) { seen[sig].docs.push(c.doc); return; }

      var prefix = ownerPrefix(c.method);
      var cls = findClass(classes, prefix);
      var decls = methods.filter(function(m) { return _key(m.method) === _key(c.method); });
      var issue = null;

      if (!cls && decls.length === 0) {
        issue = { kind: 'no-class', method: c.method, args: c.args, owner: prefix, cls: '', docs: [c.doc] };
      } else if (decls.length === 0) {
        issue = { kind: 'no-method', method: c.method, args: c.args, owner: prefix, cls: cls, docs: [c.doc] };
      } else {
        var match = decls.filter(function(m) { return m.args === c.args; });
        if (match.length === 0) {
          issue = {
            kind: 'arity', method: c.method, args: c.args, owner: prefix,
            cls: decls[0].cls, declaredArgs: decls[0].args, ret: decls[0].ret, docs: [c.doc],
          };
        }
      }
      if (issue) { seen[sig] = issue; issues.push(issue); }
      else seen[sig] = { docs: [] };
    });

    // state の遷移イベントも同じ表に載せる。引数が書けない形なので arity は見ない。
    var events = stateEvents(list);
    var seenEv = {};
    events.forEach(function(e) {
      var k = _key(e.event);
      if (seenEv[k]) { if (seenEv[k].docs.indexOf(e.doc) === -1) seenEv[k].docs.push(e.doc); return; }
      var prefix = ownerPrefix(e.event);
      var cls = findClass(classes, prefix);
      var decls = methods.filter(function(m) { return _key(m.method) === k; });
      var issue = null;
      if (decls.length > 0) { seenEv[k] = { docs: [] }; return; }
      if (!cls) issue = { kind: 'no-class', method: e.event, args: null, owner: prefix, cls: '', docs: [e.doc], via: 'state' };
      else issue = { kind: 'no-method', method: e.event, args: null, owner: prefix, cls: cls, docs: [e.doc], via: 'state' };
      seenEv[k] = issue;
      issues.push(issue);
    });

    var ORDER = { 'no-class': 0, 'no-method': 1, arity: 2 };
    issues.sort(function(a, b) {
      if (ORDER[a.kind] !== ORDER[b.kind]) return ORDER[a.kind] - ORDER[b.kind];
      return a.method < b.method ? -1 : (a.method > b.method ? 1 : 0);
    });

    return {
      calls: calls,
      events: events,
      classes: classes,
      methods: methods,
      issues: issues,
      clean: issues.length === 0,
    };
  }

  // 1 件を 1 行の日本語にする。何が足りないのかを言い切る。
  function describe(issue) {
    if (!issue) return '';
    if (issue.via === 'state') {
      // 遷移ラベルは呼び出しではないので「() を呼んでいる」とは言わない。
      if (issue.kind === 'no-class') {
        return issue.method + ' (state の遷移) に対応する ' + (issue.owner || '型') + ' のクラスがどの図にも無い';
      }
      return issue.method + ' (state の遷移) の宣言が ' + issue.cls + ' に無い';
    }
    if (issue.kind === 'no-class') {
      return issue.method + '() を呼んでいるが、' + (issue.owner || '対応する型') + ' のクラスがどの図にも無い';
    }
    if (issue.kind === 'no-method') {
      return issue.method + '() を呼んでいるが、' + issue.cls + ' に宣言が無い';
    }
    return issue.method + '() の引数が ' + issue.args + ' 個だが、'
      + issue.cls + ' の宣言は ' + issue.declaredArgs + ' 個';
  }

  return {
    argCount: argCount,
    parseCall: parseCall,
    parseStateEvent: parseStateEvent,
    isStateDoc: isStateDoc,
    stateEvents: stateEvents,
    parseClassDoc: parseClassDoc,
    ownerPrefix: ownerPrefix,
    findClass: findClass,
    audit: audit,
    describe: describe,
  };
})();
