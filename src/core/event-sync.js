'use strict';
window.MA = window.MA || {};

// event-sync — state 図の遷移イベントと class 図のメソッドを 1 枚の表に並べ、
// 足りない行からその場でメソッドを足せるようにする。
//
// BLK-primary-20260907-1803-wish: レビュー指摘は「イベント名の一覧」で来るのに、
// GUI 側には「どのクラスに何が足りないか」をまとめて示す画面が無かった。
// 指摘文とクラス一覧を目で見比べて対応表を作り、クラスを 1 つずつ選んで
// メソッド追加フォームを開く、を欠落の数だけ繰り返すしかない。
// ここは突合表そのものと、行から DSL へメソッドを足す純関数を持つ。
// 突合の判断は method-audit に任せる (同じ突合を 2 つ持つと数が食い違う)。
// DOM には触らない。
window.MA.eventSync = (function() {

  // method-audit と同じ正規化。Spi_Init と spiinit を同じものとして扱う。
  function _key(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[_\-.\s]/g, '');
  }

  var CLASS_OPEN_RE = /^\s*(?:abstract\s+class|abstract|class|interface|enum|struct)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;

  function _dsl(doc) { return window.MA.dslUtils.docDsl(doc); }

  // 全図のクラス宣言。同じクラス名が 2 枚に出るときは先に出た方を持ち主とする
  // (追加先が揺れると、押すたびに違う図が書き変わる)。
  function classIndex(docs) {
    var MAUD = window.MA.methodAudit;
    var out = [];
    var seen = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      var parsed = MAUD.parseClassDoc(_dsl(d));
      parsed.classes.forEach(function(c) {
        if (seen[c]) return;
        seen[c] = true;
        out.push({ cls: c, docId: (d && d.id) != null ? d.id : null, docName: (d && d.name) || '' });
      });
    });
    return out;
  }

  // 全図のメソッド宣言 (クラス名つき)。
  function methodIndex(docs) {
    var MAUD = window.MA.methodAudit;
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      MAUD.parseClassDoc(_dsl(d)).methods.forEach(function(m) {
        out.push({ cls: m.cls, method: m.method, args: m.args, ret: m.ret, docName: (d && d.name) || '' });
      });
    });
    return out;
  }

  // 突合表。state 図の遷移イベント 1 種につき 1 行。
  //
  // status:
  //   'ok'       … 対応するメソッドが class 図にある
  //   'missing'  … クラスはあるが、そのメソッドが無い (ここに追加ボタンを出す)
  //   'no-class' … 対応する型のクラスがどの図にも無い (足す先が決められない)
  //   'excluded' … 接頭辞を持たない UML のイベント名 (突合の対象外)
  function build(docs) {
    var MAUD = window.MA.methodAudit;
    if (!MAUD) return { rows: [], missing: [], counts: { ok: 0, missing: 0, noClass: 0, excluded: 0 }, total: 0 };
    var list = Array.isArray(docs) ? docs : [];
    var classes = classIndex(list);
    var classNames = classes.map(function(c) { return c.cls; });
    var methods = methodIndex(list);

    var byKey = {};
    var rows = [];
    MAUD.stateEvents(list).forEach(function(e) {
      var k = _key(e.event);
      if (byKey[k]) {
        if (byKey[k].stateDocs.indexOf(e.doc) === -1) byKey[k].stateDocs.push(e.doc);
        return;
      }
      var row = { event: e.event, key: k, stateDocs: [e.doc], line: e.line, owner: '', cls: '', classDoc: '', classDocId: null, status: '' };
      byKey[k] = row;
      rows.push(row);

      if (!MAUD.isApiEvent(e.event)) { row.status = 'excluded'; return; }
      row.owner = MAUD.ownerPrefix(e.event);
      var decl = null;
      for (var i = 0; i < methods.length; i++) {
        if (_key(methods[i].method) === k) { decl = methods[i]; break; }
      }
      if (decl) {
        row.status = 'ok';
        row.cls = decl.cls;
        row.classDoc = decl.docName;
        return;
      }
      var cls = MAUD.findClass(classNames, row.owner);
      if (!cls) { row.status = 'no-class'; return; }
      row.status = 'missing';
      row.cls = cls;
      for (var j = 0; j < classes.length; j++) {
        if (classes[j].cls === cls) { row.classDoc = classes[j].docName; row.classDocId = classes[j].docId; break; }
      }
    });

    var ORDER = { missing: 0, 'no-class': 1, ok: 2, excluded: 3 };
    rows.sort(function(a, b) {
      if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
      return a.event < b.event ? -1 : (a.event > b.event ? 1 : 0);
    });

    var counts = { ok: 0, missing: 0, noClass: 0, excluded: 0 };
    rows.forEach(function(r) {
      if (r.status === 'ok') counts.ok++;
      else if (r.status === 'missing') counts.missing++;
      else if (r.status === 'no-class') counts.noClass++;
      else counts.excluded++;
    });

    return {
      rows: rows,
      missing: rows.filter(function(r) { return r.status === 'missing'; }),
      counts: counts,
      total: rows.length,
    };
  }

  // 見出しの 1 行。「何件を足せるか」を先に言う。
  function summary(result) {
    var c = (result && result.counts) || { ok: 0, missing: 0, noClass: 0, excluded: 0 };
    if (c.missing === 0 && c.noClass === 0) {
      return 'イベント ' + ((result && result.total) || 0) + ' 種 — 欠落なし';
    }
    var parts = [];
    if (c.missing) parts.push('追加できる欠落 ' + c.missing);
    if (c.noClass) parts.push('クラス無し ' + c.noClass);
    return 'イベント ' + result.total + ' 種 — ' + parts.join(' / ');
  }

  // クラス本体の 1 行分の字下げ。既存メンバーがあればそれに合わせる。
  function _indentOf(lines, from, to) {
    for (var i = from; i < to; i++) {
      var m = lines[i].match(/^(\s+)\S/);
      if (m) return m[1];
    }
    return '  ';
  }

  // メソッド 1 件の宣言テキスト。`+Gpio_Reset() : void`。
  function memberText(name, ret) {
    var r = String(ret == null ? '' : ret).trim();
    return '+' + name + '()' + (r ? ' : ' + r : '');
  }

  // dsl の cls にメソッド name を足す。
  // 返り値: { dsl, added, reason }。reason は 'no-class' / 'exists'。
  // 本体 { } を持つクラスは閉じ括弧の直前に、持たないクラスは
  // `Cls : +name()` の形で宣言 (と既存の外置きメンバー) の後ろに足す。
  function addMethod(dsl, cls, name, ret) {
    var text = String(dsl == null ? '' : dsl);
    if (!cls || !name) return { dsl: text, added: false, reason: 'no-class' };

    var MAUD = window.MA.methodAudit;
    if (MAUD) {
      var already = MAUD.parseClassDoc(text).methods.some(function(m) {
        return m.cls === cls && _key(m.method) === _key(name);
      });
      if (already) return { dsl: text, added: false, reason: 'exists' };
    }

    var lines = text.split(/\r?\n/);
    var eol = /\r\n/.test(text) ? '\r\n' : '\n';
    var declAt = -1;
    var hasBody = false;
    for (var i = 0; i < lines.length; i++) {
      var co = lines[i].replace(/\r$/, '').match(CLASS_OPEN_RE);
      if (!co) continue;
      var cname = co[2] || co[3] || co[1];
      if (cname !== cls) continue;
      declAt = i;
      hasBody = /\{\s*$/.test(lines[i].replace(/\r$/, ''));
      break;
    }
    if (declAt === -1) return { dsl: text, added: false, reason: 'no-class' };

    var member = memberText(name, ret);
    if (hasBody) {
      var close = -1;
      for (var j = declAt + 1; j < lines.length; j++) {
        if (/^\s*\}/.test(lines[j])) { close = j; break; }
      }
      if (close === -1) return { dsl: text, added: false, reason: 'no-class' };
      lines.splice(close, 0, _indentOf(lines, declAt + 1, close) + member);
      return { dsl: lines.join(eol), added: true, reason: '' };
    }

    // 外置きメンバー (`Cls : +read()`) が続いていれば、その最後の行の後ろに置く。
    var at = declAt;
    var outside = new RegExp('^\\s*' + cls.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\s*:');
    for (var k = declAt + 1; k < lines.length; k++) {
      if (outside.test(lines[k].replace(/\r$/, ''))) at = k;
    }
    lines.splice(at + 1, 0, cls + ' : ' + member);
    return { dsl: lines.join(eol), added: true, reason: '' };
  }

  // 複数行をまとめて当てる。同じ図への複数件は 1 回の書き換えにまとめる
  // (図ごとに 1 回しか updateDoc を呼ばない)。
  // 返り値: { changed: [{ id, name, dsl, events }], added: [event], skipped: [{ event, reason }] }
  function apply(docs, rows, ret) {
    var list = Array.isArray(docs) ? docs : [];
    var byId = {};
    list.forEach(function(d) { if (d && d.id != null) byId[d.id] = d; });

    var work = {};   // docId → { id, name, dsl, events }
    var added = [];
    var skipped = [];

    (Array.isArray(rows) ? rows : []).forEach(function(r) {
      if (!r || r.status !== 'missing' || r.classDocId == null) {
        skipped.push({ event: (r && r.event) || '', reason: 'no-class' });
        return;
      }
      var doc = byId[r.classDocId];
      if (!doc) { skipped.push({ event: r.event, reason: 'no-class' }); return; }
      if (!work[r.classDocId]) {
        work[r.classDocId] = { id: doc.id, name: doc.name || '', dsl: _dsl(doc), events: [] };
      }
      var w = work[r.classDocId];
      var res = addMethod(w.dsl, r.cls, r.event, ret);
      if (!res.added) { skipped.push({ event: r.event, reason: res.reason }); return; }
      w.dsl = res.dsl;
      w.events.push(r.event);
      added.push(r.event);
    });

    var changed = [];
    Object.keys(work).forEach(function(id) { if (work[id].events.length) changed.push(work[id]); });
    return { changed: changed, added: added, skipped: skipped };
  }

  // ステータスバーのバッジ。0 件は「⇄ 0」ではなく言い切る。
  function badgeLabel(result) {
    if (!result) return '⇄ イベント —';
    var n = result.counts.missing + result.counts.noClass;
    return n === 0 ? '⇄ イベント OK' : '⇄ イベント ' + n;
  }

  return {
    classIndex: classIndex,
    methodIndex: methodIndex,
    build: build,
    summary: summary,
    memberText: memberText,
    addMethod: addMethod,
    apply: apply,
    badgeLabel: badgeLabel,
  };
})();
