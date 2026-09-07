'use strict';
window.MA = window.MA || {};

// bulk-apply — 「同じ種類の変更を、複数の対象へ 1 回で当てる」。
//
// 一括置換 (bulk-rename) は識別子の綴りを図をまたいで直せるが、レビュー指摘で
// 来るのは「この 3 クラスに同じメソッドが無い」のような **要素への追加** で、
// これは今まで対象を 1 件ずつ選んでフォームを開き直すしかなかった。対象が増える
// たびに同じ操作を繰り返すので、手数が対象数に比例して増え続ける。
//
// ここは「対象の一覧を作る / 当てたあとの DSL を返す」純関数だけを置く。
// 対象は開いている全部のクラス図から集めたクラス宣言で、当てる変更は
// メソッド追加と属性追加。DOM には触らない。
window.MA.bulkApply = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  var KINDS = [
    { kind: 'class-method',    label: 'メソッドを追加', diagramType: 'plantuml-class' },
    { kind: 'class-attribute', label: '属性を追加',     diagramType: 'plantuml-class' },
  ];

  function kinds() {
    return KINDS.map(function(k) { return { kind: k.kind, label: k.label, diagramType: k.diagramType }; });
  }

  function diagramTypeFor(kind) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].kind === kind) return KINDS[i].diagramType;
    return null;
  }

  // クラス宣言行。`class Foo`, `abstract class Foo`, `interface Foo`,
  // `class "表示名" as Foo`, ジェネリクス・ステレオタイプ付きも拾う。
  // enum はメソッド・属性を持たないので対象にしない。
  var DECL_RE = /^(?:abstract\s+)?(class|interface)\s+(?:"([^"]*)"\s+as\s+([A-Za-z_][\w.]*)|([A-Za-z_][\w.]*(?:<[^>]*>)?))/;

  function classesIn(dsl) {
    var out = [];
    _s(dsl).split('\n').forEach(function(raw, i) {
      var m = DECL_RE.exec(raw.trim());
      if (!m) return;
      var id = m[3] || _s(m[4]).replace(/<.*$/, '');
      if (!id) return;
      out.push({ name: id, label: m[2] || id, line: i + 1 });
    });
    return out;
  }

  // docs: workspace.list() が返す [{ id, name, diagramType, dsl }]。
  // key は「どの図のどのクラスか」を 1 つの文字列で表す (画面の checkbox の値)。
  function targets(docs, kind) {
    var want = diagramTypeFor(kind);
    var out = [];
    (docs || []).forEach(function(d) {
      if (!d || (want && d.diagramType !== want)) return;
      classesIn(d.dsl).forEach(function(c) {
        out.push({
          key: d.id + '#' + c.name,
          docId: d.id,
          docName: _s(d.name),
          name: c.name,
          label: c.label,
          line: c.line,
        });
      });
    });
    return out;
  }

  // spec: { name, params, returnType, visibility, type }
  // 当てる 1 行。メソッドは `+ 名前(引数) : 戻り値`、属性は `+ 名前 : 型`。
  function memberLine(kind, spec) {
    spec = spec || {};
    var vis = _s(spec.visibility) || '+';
    var name = _s(spec.name).trim();
    if (!name) return '';
    if (kind === 'class-method') {
      var ret = _s(spec.returnType).trim();
      return vis + ' ' + name + '(' + _s(spec.params).trim() + ')' + (ret ? ' : ' + ret : '');
    }
    var type = _s(spec.type).trim();
    return vis + ' ' + name + (type ? ' : ' + type : '');
  }

  // 同じ名前のメンバーが既にあるか。引数・戻り値の違いは見ない
  // (指摘は「このメソッドが無い」で来るので、名前が合えば当てる必要はない)。
  function hasMember(dsl, className, kind, name) {
    var want = _s(name).trim();
    if (!want) return false;
    var lines = _s(dsl).split('\n');
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      var m = DECL_RE.exec(lines[i].trim());
      if (!m) continue;
      var id = m[3] || _s(m[4]).replace(/<.*$/, '');
      if (id === className) { idx = i; break; }
    }
    if (idx < 0) return false;
    if (!/\{\s*$/.test(lines[idx])) return false;      // 本体が無い = メンバーも無い
    var re = kind === 'class-method'
      ? new RegExp('(^|[\\s+\\-#~{}])' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(')
      : new RegExp('(^|[\\s+\\-#~{}])' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(:|$)');
    for (var j = idx + 1; j < lines.length; j++) {
      var t = lines[j].trim();
      if (t === '}') break;
      if (re.test(t)) return true;
    }
    return false;
  }

  // 1 枚の DSL に、選ばれたクラスすべてへ 1 行ずつ足す。行番号がずれないよう
  // 後ろのクラスから順に入れる。本体 { } の無いクラスは足す直前に開く。
  function applyToDsl(dsl, classNames, kind, spec) {
    var line = memberLine(kind, spec);
    if (!line) return { dsl: _s(dsl), added: 0, skipped: 0 };
    var want = {};
    (classNames || []).forEach(function(n) { want[n] = true; });
    var lines = _s(dsl).split('\n');
    var added = 0, skipped = 0;
    var hits = [];
    for (var i = 0; i < lines.length; i++) {
      var m = DECL_RE.exec(lines[i].trim());
      if (!m) continue;
      var id = m[3] || _s(m[4]).replace(/<.*$/, '');
      if (!want[id]) continue;
      hits.push({ idx: i, name: id });
    }
    for (var h = hits.length - 1; h >= 0; h--) {
      var hit = hits[h];
      if (hasMember(lines.join('\n'), hit.name, kind, spec && spec.name)) { skipped++; continue; }
      var indent = lines[hit.idx].match(/^(\s*)/)[1];
      if (!/\{\s*$/.test(lines[hit.idx])) {
        lines[hit.idx] = lines[hit.idx].replace(/\s*$/, '') + ' {';
        lines.splice(hit.idx + 1, 0, indent + '}');
      }
      // 閉じ括弧の直前へ入れる。
      var close = -1;
      for (var k = hit.idx + 1; k < lines.length; k++) {
        if (lines[k].trim() === '}') { close = k; break; }
      }
      if (close < 0) { skipped++; continue; }
      lines.splice(close, 0, indent + '  ' + line);
      added++;
    }
    return { dsl: lines.join('\n'), added: added, skipped: skipped };
  }

  // 当てる前に「どこへ何件入るか」を見せる。既にあるものは skip として残す
  // (指摘の一部だけが未対応、という並びがそのまま読める)。
  function preview(docs, keys, kind, spec) {
    var sel = {};
    (keys || []).forEach(function(k) { sel[k] = true; });
    var rows = [];
    var name = _s(spec && spec.name).trim();
    targets(docs, kind).forEach(function(t) {
      if (!sel[t.key]) return;
      var doc = (docs || []).filter(function(d) { return d.id === t.docId; })[0];
      var has = name && doc ? hasMember(doc.dsl, t.name, kind, name) : false;
      rows.push({
        key: t.key, docName: t.docName, name: t.name,
        status: !name ? 'none' : (has ? 'skip' : 'add'),
      });
    });
    return rows;
  }

  // 選ばれた対象へまとめて当てる。返すのは変わった図だけ (bulk-rename と同じ形)。
  function apply(docs, keys, kind, spec) {
    var sel = {};
    (keys || []).forEach(function(k) { sel[k] = true; });
    var byDoc = {};
    targets(docs, kind).forEach(function(t) {
      if (!sel[t.key]) return;
      (byDoc[t.docId] = byDoc[t.docId] || []).push(t.name);
    });
    var changed = [];
    var added = 0, skipped = 0;
    (docs || []).forEach(function(d) {
      var names = byDoc[d.id];
      if (!names || !names.length) return;
      var res = applyToDsl(d.dsl, names, kind, spec);
      added += res.added;
      skipped += res.skipped;
      if (res.dsl !== _s(d.dsl)) changed.push({ id: d.id, name: d.name, dsl: res.dsl });
    });
    return { changed: changed, added: added, skipped: skipped };
  }

  return {
    kinds: kinds,
    diagramTypeFor: diagramTypeFor,
    classesIn: classesIn,
    targets: targets,
    memberLine: memberLine,
    hasMember: hasMember,
    applyToDsl: applyToDsl,
    preview: preview,
    apply: apply,
  };
})();
