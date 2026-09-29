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
  // 1 = 左、2 = 矢印、3 = 右、4 = 本文。呼ばれる側は矢印の向きで決まる
  // (BLK-primary-20260907-1303: 接頭辞を持たない呼び出しの持ち主は受け手)。
  var MSG_RE = /^\s*("[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(-+>+|<-+|-+\\|\/-+)\s*("[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/;

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

  function _unquote(s) {
    var t = String(s == null ? '' : s).trim();
    return (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') ? t.slice(1, -1) : t;
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
  // receiver は「呼ばれる側」。`A -> B : m()` なら B、`A <- B : m()` なら A。
  function parseCall(line) {
    var m = _line(line).match(MSG_RE);
    if (!m) return null;
    var body = m[4];
    var c = body.match(CALL_RE);
    if (!c) return null;
    var backward = m[2].charAt(0) === '<';
    return { method: c[1], args: argCount(c[2]), receiver: _unquote(backward ? m[1] : m[3]) };
  }

  // クラス図の 1 図からメソッド宣言を取り出す。
  // 返り値: { classes: [クラス名], methods: [{ cls, method, args, ret }],
  //           members: { クラス名: 本体に書かれた行数 } }
  // members は「中身を 1 行も持たないクラス宣言」を見分けるために数える。
  // メソッドだけでなく属性 (括弧の無い行) も 1 行として数える —— 数えたいのは
  // 「宣言だけ置かれた空のクラス」であって、メソッドの有無ではない。
  function parseClassDoc(dsl) {
    var lines = _lines(dsl);
    var classes = [];
    var methods = [];
    var members = {};
    var open = null;   // 波括弧の中にいるときの、そのクラス名

    function countMember(cls, text) {
      if (!cls) return;
      if (String(text).trim() === '') return;
      members[cls] = (members[cls] || 0) + 1;
    }

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
        countMember(open, line);
        addMethod(open, line);
        continue;
      }
      var co = line.match(CLASS_OPEN_RE);
      if (co) {
        var cname = co[2] || co[3] || co[1];
        if (cname && classes.indexOf(cname) === -1) classes.push(cname);
        if (cname && !(cname in members)) members[cname] = 0;
        if (/\{\s*$/.test(line)) open = cname;
        continue;
      }
      var mo = line.match(MEMBER_OUTSIDE_RE);
      if (mo && classes.indexOf(mo[1]) !== -1) { countMember(mo[1], mo[2]); addMethod(mo[1], mo[2]); }
    }
    return { classes: classes, methods: methods, members: members };
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
    var dsl = window.MA.dslUtils.docDsl(doc);
    return /^\s*\[\*\]\s*-/m.test(dsl) || /^\s*state\s+/m.test(dsl);
  }

  // BLK-primary-20260907-1303: 遷移ラベルには 2 種類が混ざっている。
  //   (a) UML のイベント名 … `Tick` `Fault` `Reset` `Ack` `TransferComplete`。
  //       「何が起きたら遷移するか」であって、誰かのメソッドを呼ぶ話ではない。
  //   (b) ドライバ API の名前 … `Timer_StartConv` `Gpio_SetHigh`。
  //       接頭辞が型を指しており、クラス図に宣言があるべきもの。
  // これまでは両方をメソッド呼び出しとして突き合わせていたので、(a) が
  // 全件「対応するクラスが無い」になり、実害の無い指摘が本物の不整合を埋めていた。
  // 見分けは接頭辞 (`Xxx_`) の有無で付ける。接頭辞は「どの型のものか」の宣言そのもので、
  // それが無い名前はクラスと突き合わせる形になっていない。
  function isApiEvent(event) {
    return ownerPrefix(event) !== '';
  }

  // 「作業用の写し」を示す名前の印。📂 一覧の重複整理 (src/core/dupe-merge.js) と
  // 同じ印を使う。読み込み順に依存しないよう、取れなければ同じ既定を自前で持つ。
  var COPY_MARKS = ['-編集中', '-編集用', '-copy', '-コピー', '-作業中', '-bak', '-old'];
  function _copyMarks() {
    var dm = window.MA.dupeMerge;
    var m = dm && dm.COPY_MARKS;
    return (m && m.length) ? m : COPY_MARKS;
  }

  // BLK-reviewer-20260914-1406 (追記): 宣言を本体ではなく `-編集中` の写しにだけ
  // 足しても、監査は保存フォルダを丸ごと読むので指摘は消える。本体は未修正のまま
  // 件数が「改善」するので、控えとの sha1 比較でしか気付けなかった。
  function isCopyDoc(name) {
    var n = String(name == null ? '' : name);
    return _copyMarks().some(function(mk) { return n.indexOf(mk) >= 0; });
  }

  // state の図から遷移イベントを集める。
  function stateEvents(docs) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!isStateDoc(d)) return;
      var docName = (d && d.name) || '';
      _lines(window.MA.dslUtils.docDsl(d)).forEach(function(line, idx) {
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
    var classDecl = {};      // クラス名 → { docs, members }
    var classOrder = [];

    list.forEach(function(d) {
      var docName = (d && d.name) || '';
      var dsl = window.MA.dslUtils.docDsl(d);
      var parsedCls = parseClassDoc(dsl);
      parsedCls.classes.forEach(function(c) {
        if (classes.indexOf(c) === -1) classes.push(c);
        if (!classDecl[c]) { classDecl[c] = { docs: [], members: 0 }; classOrder.push(c); }
        if (classDecl[c].docs.indexOf(docName) === -1) classDecl[c].docs.push(docName);
        classDecl[c].members += (parsedCls.members && parsedCls.members[c]) || 0;
      });
      parsedCls.methods.forEach(function(m) {
        methods.push({ cls: m.cls, method: m.method, args: m.args, ret: m.ret, doc: docName });
      });
      _lines(dsl).forEach(function(line, idx) {
        var c = parseCall(line);
        if (!c) return;
        calls.push({ method: c.method, args: c.args, receiver: c.receiver, doc: docName, line: idx + 1 });
      });
    });

    // 同じ呼び出しが複数の図に出るので、メソッド名 + 引数個数でまとめる。
    var seen = {};
    var issues = [];
    var seenDraft = {};
    var draftOnly = [];
    calls.forEach(function(c) {
      var sig = c.method + '/' + c.args;
      if (seen[sig]) { seen[sig].docs.push(c.doc); return; }

      // 持ち主は名前の接頭辞 (`Spi_Init` → Spi)。接頭辞が無い呼び出し (`EnableClock()`)
      // は、矢印の受け手がそのまま持ち主なのでそちらを使う。これを見ないと
      // 「対応する型 のクラスがどの図にも無い」としか言えず、何を足せばよいか伝わらない。
      var prefix = ownerPrefix(c.method) || (c.receiver || '');
      var cls = findClass(classes, prefix);
      var decls = methods.filter(function(m) { return _key(m.method) === _key(c.method); });
      var issue = null;

      // 宣言が写し (`-編集中`) にしかないなら、本体は未修正のまま指摘だけが消える。
      if (decls.length > 0 && !isCopyDoc(c.doc) && !seenDraft[_key(c.method)]
          && decls.every(function(m) { return isCopyDoc(m.doc); })) {
        var ddocs = [];
        decls.forEach(function(m) { if (ddocs.indexOf(m.doc) === -1) ddocs.push(m.doc); });
        seenDraft[_key(c.method)] = true;
        draftOnly.push({
          kind: 'draft-only', method: c.method, args: c.args, owner: prefix,
          cls: decls[0].cls, docs: [c.doc], declDocs: ddocs,
        });
      }

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
    // 接頭辞を持たないもの (UML のイベント名) は突合の対象外。数だけ別に持ち、
    // 「黙って捨てた」ようには見せない (excludedEvents)。
    var events = stateEvents(list);
    var excludedEvents = [];
    var seenEx = {};
    var seenEv = {};
    events.forEach(function(e) {
      var k = _key(e.event);
      if (!isApiEvent(e.event)) {
        if (seenEx[k]) {
          if (seenEx[k].docs.indexOf(e.doc) === -1) seenEx[k].docs.push(e.doc);
          return;
        }
        seenEx[k] = { event: e.event, docs: [e.doc] };
        excludedEvents.push(seenEx[k]);
        return;
      }
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

    // BLK-reviewer-20260914-1406: 「クラスを足せば指摘が消える」だけを見ていると、
    // メソッド名をそのままクラスとして宣言した行 (`class WriteConfig`) でも件数が
    // 減り、数値からは誤りに気付けない。中身を 1 行も持たないクラス宣言が
    // 呼び出し・遷移イベントと同じ名前なら、宣言の付け方の誤りとして名指しする。
    var callNames = {};
    calls.forEach(function(c) { callNames[_key(c.method)] = true; });
    events.forEach(function(e) { if (isApiEvent(e.event)) callNames[_key(e.event)] = true; });
    classOrder.forEach(function(cname) {
      var d = classDecl[cname];
      if (!d || d.members > 0) return;
      if (!callNames[_key(cname)]) return;
      issues.push({
        kind: 'method-as-class', method: cname, args: null,
        owner: ownerPrefix(cname), cls: cname, docs: d.docs.slice(),
      });
    });
    draftOnly.forEach(function(it) { issues.push(it); });

    var ORDER = { 'no-class': 0, 'no-method': 1, arity: 2, 'method-as-class': 3, 'draft-only': 4 };
    issues.sort(function(a, b) {
      if (ORDER[a.kind] !== ORDER[b.kind]) return ORDER[a.kind] - ORDER[b.kind];
      return a.method < b.method ? -1 : (a.method > b.method ? 1 : 0);
    });

    // BLK-reviewer-20260915-0106-wish: 「意図して宣言しない」と決めたメソッドは、
    // note の自由文ではなく `'@omit-method Cls.Method 理由` の 1 行で宣言する。
    // ここで突合から外し、外した分は omitted に理由ごと残す —— 黙って件数だけ
    // 減らすと、宣言を書いた図を開かないかぎり何を外したか分からなくなる。
    var OM = window.MA.omitMethod;
    var omitted = [];
    if (OM) {
      var part = OM.partition(issues, OM.collect(list));
      issues = part.issues;
      omitted = part.omitted;
    }
    // BLK-reviewer-20260923-2012-wish: タグは無いが note の自由文で答えている組は、
    // 指摘に残したまま印 (noteReply) を付け、未解消とは別に数える箱にも入れる。
    var noteReplied = [];
    if (OM && OM.markNotes) {
      var mk = OM.markNotes(issues, OM.collect(list, { notes: true }));
      issues = mk.items;
      noteReplied = mk.noteReplied;
    }

    return {
      calls: calls,
      events: events,
      // 接頭辞を持たない UML のイベント名。突合の対象外だが、何を外したかは見せる。
      excludedEvents: excludedEvents,
      classes: classes,
      methods: methods,
      issues: issues,
      // 意図的な省略の宣言で外した指摘 (理由・宣言した図つき)。
      omitted: omitted,
      // issues のうち、note の自由文で応答済み (タグ化待ち) のもの。issues にも残る。
      noteReplied: noteReplied,
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
    if (issue.kind === 'method-as-class') {
      return issue.method + ' は同名の呼び出しがあるのに中身が 1 行も無いクラス宣言 ('
        + issue.docs.join(', ') + ')。メソッド宣言を独立したクラスとして書いた誤りの疑い';
    }
    if (issue.kind === 'draft-only') {
      return issue.method + '() の宣言が写しの ' + (issue.declDocs || []).join(', ')
        + ' にしかない (本体は未修正のまま)';
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

  // 対象外にしたイベントの説明 1 行。UI はこれを出す。
  function excludedLine(result) {
    var ex = (result && result.excludedEvents) || [];
    if (ex.length === 0) return '';
    var names = ex.map(function(e) { return e.event; });
    var head = names.slice(0, 5).join(' / ');
    return 'state の遷移イベント ' + ex.length + ' 種 (' + head
      + (names.length > 5 ? ' ほか' : '')
      + ') は接頭辞を持たない UML のイベント名なので、メソッド突合の対象外です';
  }

  return {
    argCount: argCount,
    parseCall: parseCall,
    parseStateEvent: parseStateEvent,
    isApiEvent: isApiEvent,
    isCopyDoc: isCopyDoc,
    excludedLine: excludedLine,
    isStateDoc: isStateDoc,
    stateEvents: stateEvents,
    parseClassDoc: parseClassDoc,
    ownerPrefix: ownerPrefix,
    findClass: findClass,
    audit: audit,
    describe: describe,
  };
})();
