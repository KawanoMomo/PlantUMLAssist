'use strict';
window.MA = window.MA || {};

// class-scaffold — クラス図の「親 1 つ + 派生クラス数個 + 関連数本」を
// 1 度の入力でまとめて組み立てる。
//
// 個々の class / Relation の追加フォームは迷わず使えるが、4 クラス・6 関連を
// 作るには class 追加を 4 回、メソッド追加をクラスごとに、Relation 追加を 6 回
// 開き直すことになり、DSL を直接打った方が早くなってしまう。
// 派生クラス図は「親と、それにぶら下がる子」で 1 つの単位なので、
// 子を行として並べて受け取り、宣言・メンバ・関連の行を一括で生成する。
//
// 生成する行の例:
//   abstract class CanDrv {
//     +init() : void
//   }
//   class CanDrvHs {
//     +send()
//   }
//   CanDrv <|-- CanDrvHs
//   CanDrvHs --> CanBus : uses
window.MA.classScaffold = (function() {
  var ASCII_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var KEYWORD_RE = /^(?:abstract\s+class|abstract|class|interface|enum|entity)\s+(?:"[^"]*"\s+as\s+)?([A-Za-z_][A-Za-z0-9_]*)/;
  var RELATION_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:"[^"]*"\s*)?(?:<\|--|<\|\.\.|\*--|o--|\.\.>|-->|--|\.\.)\s*(?:"[^"]*"\s*)?([A-Za-z_][A-Za-z0-9_]*)/;

  // class モジュールの fmtRelation と同じ記法。core は modules に依存しないので
  // 表をここに持つ (両者がずれると preview と実際の DSL が食い違うため、
  // class-scaffold.test.js で突き合わせている)。
  var ARROWS = {
    inheritance: '<|--',
    implementation: '<|..',
    composition: '*--',
    aggregation: 'o--',
    dependency: '..>',
    association: '--',
  };

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // text 中で既に宣言・参照されているクラス名。ASCII 別名の採番と
  // 「もう宣言済みか」の判定に使う。
  function existingIds(text) {
    var ids = {};
    _s(text).split('\n').forEach(function(raw) {
      var line = raw.trim();
      var m = line.match(KEYWORD_RE);
      if (m) { ids[m[1]] = true; return; }
      var r = line.match(RELATION_RE);
      if (r) { ids[r[1]] = true; ids[r[2]] = true; }
    });
    return ids;
  }

  // 日本語のクラス名を打たれても壊れないよう ASCII 別名へ寄せる
  // (id-normalizer と同じ約束: `class "表示名" as ASCII別名`)。
  // used は同じ入力の中で既に払い出した別名。1 回の apply で C1 が
  // 2 つ生まれないようにする。
  function normalizeId(rawInput, text, used) {
    var trimmed = _s(rawInput);
    if (!trimmed) return { id: '', label: '', valid: false };
    if (ASCII_ID_RE.test(trimmed)) return { id: trimmed, label: trimmed, valid: true };
    var taken = used || existingIds(text);
    for (var i = 1; i < 10000; i++) {
      if (!taken['C' + i]) return { id: 'C' + i, label: trimmed, valid: true };
    }
    return { id: 'C' + Date.now(), label: trimmed, valid: true };
  }

  // メンバは 1 行 1 つ。改行でもカンマでも区切れるようにする
  // (先輩の図からコピペすると改行、手で打つとカンマになりやすい)。
  function parseMembers(raw) {
    return _s(raw).split(/[\n,]/).map(function(x) { return x.trim(); })
      .filter(function(x) { return x.length > 0; });
  }

  function normalizeKind(raw) {
    var k = _s(raw);
    return ARROWS[k] ? k : 'association';
  }

  function fmtRelation(kind, from, to, label) {
    return from + ' ' + ARROWS[normalizeKind(kind)] + ' ' + to + (label ? ' : ' + label : '');
  }

  function _decl(kind, id, label) {
    var head = kind === 'interface' ? 'interface'
      : kind === 'abstract' ? 'abstract class'
      : kind === 'enum' ? 'enum'
      : 'class';
    return head + ' ' + ((label && label !== id) ? '"' + label + '" as ' + id : id);
  }

  // 空行 (クラス名が無い行、from/to が欠けた関連) は捨てる。
  // フォームは既定で数行出すので、埋めなかった行が DSL に漏れないようにする。
  function normalizeSpec(spec, text) {
    var src = spec || {};
    var used = existingIds(text);
    function take(raw) {
      var n = normalizeId(raw, text, used);
      if (n.id) used[n.id] = true;
      return n;
    }

    var parentNorm = take(src.parent);
    var parent = parentNorm.id ? {
      id: parentNorm.id,
      label: parentNorm.label,
      kind: _s(src.parentKind) || 'class',
      members: parseMembers(src.parentMembers),
    } : null;

    var classes = [];
    (src.classes || []).forEach(function(c) {
      var n = take(c && c.name);
      if (!n.id) return;
      classes.push({
        id: n.id,
        label: n.label,
        kind: _s(c.kind) || 'class',
        members: parseMembers(c.members),
        // 親との関連。'none' なら関連行を出さない
        relation: _s(c.relation) === 'none' ? 'none' : normalizeKind(c.relation || 'inheritance'),
        relationLabel: _s(c.relationLabel),
      });
    });

    var relations = [];
    (src.relations || []).forEach(function(r) {
      var from = _s(r && r.from);
      var to = _s(r && r.to);
      if (!from || !to) return;
      relations.push({
        from: from, to: to,
        kind: normalizeKind(r.kind),
        label: _s(r.label),
      });
    });

    return { parent: parent, classes: classes, relations: relations };
  }

  // 「何が足りないか」を返す。UI は確定ボタンの可否とメッセージに使う。
  function validate(spec, text) {
    var s = normalizeSpec(spec, text);
    var errors = [];
    if (s.classes.length === 0 && !s.parent) {
      errors.push('クラスを 1 つ以上入れてください');
    }
    var seen = {};
    if (s.parent) seen[s.parent.id] = true;
    s.classes.forEach(function(c) {
      if (seen[c.id]) errors.push('クラス名が重複しています: ' + (c.label || c.id));
      seen[c.id] = true;
    });
    var declared = existingIds(text);
    var known = function(id) { return !!(seen[id] || declared[id]); };
    if (!s.parent) {
      var needsParent = s.classes.some(function(c) { return c.relation !== 'none'; });
      if (needsParent) errors.push('親クラスを入れるか、関連を「なし」にしてください');
    }
    // BLK-human-20260923-1330: 未定義の相手は PlantUML 側がその行からクラスを起こすので
    // 生成はできる。止めずに「確かめたいこと」として警告に落とす。
    var warnings = [];
    s.relations.forEach(function(r) {
      if (!known(r.from)) warnings.push('関連の元が未定義です: ' + r.from + ' (この行でクラスが起きます)');
      if (!known(r.to)) warnings.push('関連の先が未定義です: ' + r.to + ' (この行でクラスが起きます)');
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // BLK-primary-20260929-2056-friction: 継承を図の書き方に合わせる。図の継承が `子 --|> 親` の向きで多く書かれていれば
  // 新しい継承もその向きで書く (`親 <|-- 子` と混ぜると、揃える手が別に要った)。
  function childFirstInheritance(text) {
    var fwd = 0, back = 0;
    _s(text).split(/\r?\n/).forEach(function(raw) {
      var l = raw.trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*(?:"[^"]*"\s*)?--\|>/.test(l)) fwd++;
      else if (/^[A-Za-z_][A-Za-z0-9_]*\s*(?:"[^"]*"\s*)?<\|--/.test(l)) back++;
    });
    return fwd > back;
  }

  // 同じ語尾 (最後の `_` の後、例 `Driver`) の兄弟クラスが 2 つ以上そろって継承している親。無ければ ''。
  // 系統を 1 つ足すとき、新しい `Pwm_Driver` は兄弟の `Spi_Driver` … と同じ親 (`Driver_Common`) にぶら下がる。
  function siblingParent(text, name) {
    var n = _s(name);
    var cut = n.lastIndexOf('_');
    if (cut <= 0 || cut === n.length - 1) return '';
    var suffix = n.slice(cut);
    var count = {};
    _s(text).split(/\r?\n/).forEach(function(raw) {
      var l = raw.trim(), m, child = null, parent = null;
      if ((m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*--\|>\s*([A-Za-z_][A-Za-z0-9_]*)/))) { child = m[1]; parent = m[2]; }
      else if ((m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*<\|--\s*([A-Za-z_][A-Za-z0-9_]*)/))) { child = m[2]; parent = m[1]; }
      if (!child || child === n || child.slice(-suffix.length) !== suffix || child.length <= suffix.length) return;
      count[parent] = (count[parent] || 0) + 1;
    });
    var best = '', bestN = 1;
    Object.keys(count).forEach(function(p) { if (count[p] > bestN) { bestN = count[p]; best = p; } });
    return best;
  }

  // 本文の中のクラスの宣言の行 ({ で本体を開くか) を探す。
  function _declAt(lines, id) {
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].trim().match(KEYWORD_RE);
      if (m && m[1] === id) return { index: i, body: /\{\s*$/.test(lines[i]) };
    }
    return null;
  }

  // 末尾に足す行 (tail) と、もう有るクラスの中へ足すメンバ (into: [{ id, members }]) に分ける。
  function _plan(text, spec) {
    var s = normalizeSpec(spec, text);
    var tail = [], into = [];
    if (!s.parent && s.classes.length === 0) return { tail: tail, into: into };
    var declared = existingIds(text);
    var srcLines = _s(text).length ? String(text).split('\n') : [];
    var childFirst = childFirstInheritance(text);

    function emitClass(c) {
      if (declared[c.id]) {
        // もう有るクラスは宣言し直さない。持ち込んだメンバのうち、まだ無いものだけをそのクラスの中へ足す。
        var at = _declAt(srcLines, c.id);
        var have = {};
        if (at && at.body) {
          for (var k = at.index + 1; k < srcLines.length && srcLines[k].trim() !== '}'; k++) have[srcLines[k].trim()] = true;
        }
        var add = c.members.filter(function(m) { return !have[m]; });
        if (!add.length) return;
        if (at) { into.push({ id: c.id, members: add }); return; }
      }
      if (c.members.length === 0) {
        tail.push(_decl(c.kind, c.id, c.label));
        return;
      }
      tail.push(_decl(c.kind, c.id, c.label) + ' {');
      c.members.forEach(function(m) { tail.push('  ' + m); });
      tail.push('}');
    }

    if (s.parent) emitClass(s.parent);
    s.classes.forEach(emitClass);
    if (s.parent) {
      s.classes.forEach(function(c) {
        if (c.relation === 'none') return;
        if (c.relation === 'inheritance' && childFirst) {
          tail.push(c.id + ' --|> ' + s.parent.id + (c.relationLabel ? ' : ' + c.relationLabel : ''));
          return;
        }
        tail.push(fmtRelation(c.relation, s.parent.id, c.id, c.relationLabel));
      });
    }
    s.relations.forEach(function(r) { tail.push(fmtRelation(r.kind, r.from, r.to, r.label)); });
    return { tail: tail, into: into };
  }

  // 追加される行だけを返す。UI のプレビューと apply が同じ結果を見る。
  // もう有るクラスの中へ足すメンバは「' {クラス} に足す」の見出しの下に並べる。
  function preview(text, spec) {
    var p = _plan(text, spec);
    var lines = p.tail.slice();
    p.into.forEach(function(x) {
      lines.push("' " + x.id + ' に足す');
      x.members.forEach(function(m) { lines.push('  ' + m); });
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

  // 1 手でクラス構成一式を書き込む。不正な spec なら text をそのまま返す
  // (呼び手が validate せずに呼んでも DSL を壊さない)。
  function apply(text, spec) {
    var p = _plan(text, spec);
    if (p.tail.length === 0 && p.into.length === 0) return text;
    var out = String(text);
    p.into.forEach(function(x) {
      var ls = out.split('\n');
      var at = _declAt(ls, x.id);
      if (!at) return;
      var ind = (ls[at.index].match(/^\s*/) || [''])[0];
      if (at.body) {
        var k = at.index + 1;
        while (k < ls.length && ls[k].trim() !== '}') k++;
        ls.splice.apply(ls, [k, 0].concat(x.members.map(function(m) { return ind + '  ' + m; })));
      } else {
        ls.splice.apply(ls, [at.index, 1, ls[at.index].replace(/\s*$/, '') + ' {']
          .concat(x.members.map(function(m) { return ind + '  ' + m; }), [ind + '}']));
      }
      out = ls.join('\n');
    });
    return p.tail.length ? _insertBeforeEnd(out, p.tail) : out;
  }

  return {
    existingIds: existingIds,
    // class-derive が同じ差し込み位置 (@enduml の直前) を使うため公開する。
    insertBeforeEnd: _insertBeforeEnd,
    normalizeId: normalizeId,
    parseMembers: parseMembers,
    normalizeSpec: normalizeSpec,
    fmtRelation: fmtRelation,
    ARROWS: ARROWS,
    validate: validate,
    childFirstInheritance: childFirstInheritance,
    siblingParent: siblingParent,
    preview: preview,
    apply: apply,
  };
})();
