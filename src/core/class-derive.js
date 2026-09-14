'use strict';
window.MA = window.MA || {};

// class-derive — BLK-junior-20260909-0703-wish
// 「手本のクラス図の親から、派生クラスを 1 つ作る」。
//
// 新人は先輩の共通クラス図 (親 + 6 部品分の派生) を見ながら、必要な行の名前と
// メンバを覚え直して「クラス構成をまとめて追加」に打ち直していた。手本が同じ画面に
// 開いているのに、親の宣言・メンバ・周辺クラスへの関連を人間の記憶で運んでいる。
// ここは選んだ親から
//   - 親のメンバの原文 (memberSource)
//   - 親が既に引いている関連の原文 (relationCandidates) = 「同じ関連を引く」の候補
// を取り出し、あとは派生クラス名と固有メンバだけを埋めれば済むようにする。
//
// 関連は kind に畳まず**元の行をそのまま**使い、親の名前だけを派生の名前に差し替える。
// kind 経由にすると手本の `-->` が `--` に化けて、同じ関連を引いたことにならない。
// クラス宣言と継承の行は classScaffold に任せる (書式が 2 つに割れない)。
window.MA.classDerive = (function() {
  function _s(v) { return v == null ? '' : String(v).trim(); }
  function CS() { return window.MA.classScaffold; }

  // 親の `{ ... }` の中身を原文のまま 1 行 1 メンバで返す。
  // 書き写しではなく原文を運ぶので、可視性 / 型 / {static} がそのまま残る。
  function memberSource(text, element) {
    if (!element) return '';
    var start = parseInt(element.line, 10);
    var end = parseInt(element.endLine, 10);
    if (isNaN(start) || isNaN(end) || end <= start) return '';
    var lines = String(text == null ? '' : text).split('\n');
    var out = [];
    for (var i = start; i < end - 1; i++) {
      var s = _s(lines[i]);
      if (!s || s === '{' || s === '}') continue;
      out.push(s);
    }
    return out.join('\n');
  }

  // 親の宣言そのもの (`abstract class Driver_Common` など) の見出し文。
  function declOf(element) {
    if (!element) return '';
    var kind = _s(element.kind) || 'class';
    var head = kind === 'interface' ? 'interface'
      : kind === 'abstract' ? 'abstract class'
      : kind === 'enum' ? 'enum'
      : 'class';
    var id = _s(element.id);
    var label = _s(element.label);
    return head + ' ' + id + (label && label !== id ? ' ("' + label + '")' : '');
  }

  // 行の中の識別子 1 個だけを置き換える。関連行では最初に現れる識別子が
  // 必ず端点なので、ラベルに同じ語が入っていても端点側が当たる。
  function _swapFirstId(rawLine, fromId, toId) {
    var id = _s(fromId);
    if (!id) return rawLine;
    var re = new RegExp('(^|[^A-Za-z0-9_])' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])');
    var m = String(rawLine).match(re);
    if (!m) return rawLine;
    var at = m.index + m[1].length;
    return rawLine.slice(0, at) + toId + rawLine.slice(at + id.length);
  }

  // 親が既に引いている関連 = 派生にも同じものを引ける候補。
  // 継承 / 実装は「親から子へ」の線そのものなので候補にしない
  // (派生を作れば必ず 1 本引かれるため、二重になる)。
  function relationCandidates(text, parsed, parentId) {
    var pid = _s(parentId);
    if (!pid) return [];
    var lines = String(text == null ? '' : text).split('\n');
    var rels = (parsed && parsed.relations) || [];
    var out = [];
    rels.forEach(function(r) {
      var kind = _s(r.kind);
      if (kind === 'inheritance' || kind === 'implementation') return;
      var from = _s(r.from), to = _s(r.to);
      var dir = (from === pid && to !== pid) ? 'out'
        : (to === pid && from !== pid) ? 'in'
        : null;
      if (!dir) return;
      var raw = _s(lines[parseInt(r.line, 10) - 1]);
      if (!raw) return;
      out.push({
        kind: kind,
        dir: dir,
        other: dir === 'out' ? to : from,
        label: _s(r.label),
        line: r.line,
        rawLine: raw,
      });
    });
    return out;
  }

  // 候補 1 件をチェックボックスの見出しにする。親の名前を「(派生)」に置いた
  // 原文なので、確定したときに増える行がそのまま読める。
  function candidateText(cand, parentId) {
    if (!cand) return '';
    return _swapFirstId(cand.rawLine, parentId, '(派生)');
  }

  // 選んだ候補から、派生の名前で引き直した関連行。
  function relationLines(text, parsed, spec, derivedId) {
    var src = spec || {};
    var parentId = _s(src.parentId);
    var cands = relationCandidates(text, parsed, parentId);
    var out = [];
    (src.picked || []).forEach(function(i) {
      var c = cands[parseInt(i, 10)];
      if (!c || !derivedId) return;
      out.push(_swapFirstId(c.rawLine, parentId, derivedId));
    });
    return out;
  }

  // 選んだ矢印と同じ関連を、端点を差し替えてもう 1 本。元の行を写して端点だけを
  // 置き換えるので、矢印の記法・多重度・ラベルはそのまま残る。
  // 置換は一度プレースホルダを経由する (新旧の名前が入れ違いでも壊れない)。
  function sameRelationLine(text, relation, newFrom, newTo) {
    if (!relation) return '';
    var raw = _s(String(text == null ? '' : text).split('\n')[parseInt(relation.line, 10) - 1]);
    if (!raw) return '';
    var out = _swapFirstId(raw, relation.from, '\u0001');
    out = _swapFirstId(out, relation.to, '\u0002');
    return out.replace('\u0001', _s(newFrom) || _s(relation.from))
      .replace('\u0002', _s(newTo) || _s(relation.to));
  }

  // 関連の原文で端点の間に書かれている部分 (矢印の記法。多重度が付いていれば
  // それも含む)。見出しに「この記法のまま引く」と出すために使う。
  function arrowBetween(text, relation) {
    if (!relation) return '';
    var raw = _s(String(text == null ? '' : text).split('\n')[parseInt(relation.line, 10) - 1]);
    if (!raw) return '';
    var out = _swapFirstId(raw, relation.from, '\u0001');
    out = _swapFirstId(out, relation.to, '\u0002');
    var a = out.indexOf('\u0001'), b = out.indexOf('\u0002');
    if (a < 0 || b < 0 || b < a) return '';
    return out.slice(a + 1, b).trim();
  }

  // 派生 1 つ分のクラス宣言 + 継承だけを classScaffold の spec に畳む。
  // 親は図に宣言済みなので classScaffold 側で宣言し直されない。
  //   spec: { parentId, parentKind, name, members, picked: [候補の添字] }
  function toScaffoldSpec(spec) {
    var src = spec || {};
    return {
      parent: _s(src.parentId),
      parentKind: _s(src.parentKind) || 'class',
      parentMembers: '',
      classes: [{ name: _s(src.name), members: _s(src.members), relation: 'inheritance' }],
      relations: [],
    };
  }

  // 日本語のクラス名は classScaffold と同じ ASCII 別名に寄せる
  // (`class "表示名" as C1` の C1 側で関連を引かないと未定義になる)。
  function derivedId(text, spec) {
    var raw = _s(spec && spec.name);
    return raw ? CS().normalizeId(raw, text).id : '';
  }

  // 追加される行。派生クラス名が空なら 1 行も出さない。
  function preview(text, parsed, spec) {
    if (!_s(spec && spec.name) || !_s(spec && spec.parentId)) return [];
    var id = derivedId(text, spec);
    return CS().preview(text, toScaffoldSpec(spec)).concat(relationLines(text, parsed, spec, id));
  }

  function validate(text, parsed, spec) {
    var errors = [];
    if (!_s(spec && spec.parentId)) errors.push('親クラスが選ばれていません');
    if (!_s(spec && spec.name)) errors.push('派生クラス名を入れてください');
    if (errors.length) return { ok: false, errors: errors };
    if (CS().existingIds(text)[_s(spec.name)]) {
      return { ok: false, errors: ['その名前のクラスは図にあります: ' + _s(spec.name)] };
    }
    return CS().validate(toScaffoldSpec(spec), text);
  }

  function apply(text, parsed, spec) {
    if (!validate(text, parsed, spec).ok) return text;
    var lines = preview(text, parsed, spec);
    if (lines.length === 0) return text;
    return CS().insertBeforeEnd(text, lines);
  }

  return {
    memberSource: memberSource,
    declOf: declOf,
    relationCandidates: relationCandidates,
    candidateText: candidateText,
    relationLines: relationLines,
    sameRelationLine: sameRelationLine,
    arrowBetween: arrowBetween,
    toScaffoldSpec: toScaffoldSpec,
    derivedId: derivedId,
    preview: preview,
    validate: validate,
    apply: apply,
  };
})();
