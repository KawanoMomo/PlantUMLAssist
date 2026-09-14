'use strict';
window.MA = window.MA || {};

// class-map — 2 枚のクラス図の「対応表」を作る (BLK-junior-20260908-1203-wish)。
//
// 状態遷移図には対応表があり、橙の行から「＋この図にも足す」で先輩の変更を
// 1 クリックで取り込めるようになった。クラス図にはそれが無く、先輩版と読み比べて
// 共通基底クラスと継承関係を見つけ、Relation フォームで手打ちする作業が残っていた。
// おまけに継承は From/To のどちらが親か分かりにくく、逆向きに張ってしまう。
//
// ここは state-map と同じ形の行 (match / ref / mine / refLine / mineLine) を作る。
// 名前の突き合わせ規則は state-map のものをそのまま使う (同じ判断を 2 か所に
// 書くと片方だけ直されるため)。違うのは「何を並べるか」だけ:
//   要素 — class / interface / abstract / enum
//   関係 — 継承・実装・集約・関連など。向き (どちらが親か) を行に持たせる
//
// 向きは表示にも取り込みにも効く。関係の行は「親 DriverBase ← 子 GpioDrv」の形で
// 見せ、取り込みは参照図の向きをそのまま写すので、フォームで From/To を選び直す
// 場面自体が無くなる。DOM には触らない。
window.MA.classMap = (function() {

  function _s(v) { return v == null ? '' : String(v).trim(); }

  function _sm() { return window.MA.stateMap; }

  function normalize(name) { return _sm().normalize(name); }
  function score(a, b) { return _sm().score(a, b); }

  function kindOf(sc) {
    if (sc >= 1) return 'exact';
    if (sc >= 0.4) return 'partial';
    return 'none';
  }

  var KIND_LABEL = {
    'class': 'クラス',
    'interface': 'インタフェース',
    'abstract': '抽象クラス',
    'enum': '列挙',
  };

  // 関係の種類ごとの呼び名 (親/子・全体/部分) と矢印は relation-roles が持つ。
  // フォームの見出しと対応表の行で同じ言葉を使うため、表はここに二重に置かない
  // (BLK-junior-20260908-1203)。
  function relInfo(kind) { return window.MA.relationRoles.of(kind); }

  function elementName(el) {
    if (!el) return '';
    return _s(el.label) || _s(el.id);
  }

  function _elements(parsed) {
    return ((parsed && parsed.elements) || []).filter(function(el) {
      return el && _s(el.id) !== '';
    });
  }

  function _relations(parsed) {
    return ((parsed && parsed.relations) || []).filter(function(r) {
      return r && _s(r.from) !== '' && _s(r.to) !== '';
    });
  }

  // 貪欲な組み合わせ。state-map と同じ規則 (点数の高い組から確定)。
  function _pair(left, right, keyOf) {
    var cands = [];
    left.forEach(function(l, li) {
      right.forEach(function(r, ri) {
        var sc = score(keyOf(l), keyOf(r));
        if (sc > 0) cands.push({ li: li, ri: ri, score: sc });
      });
    });
    cands.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.li !== b.li) return a.li - b.li;
      return a.ri - b.ri;
    });
    var usedL = {}, usedR = {}, pairs = [];
    cands.forEach(function(c) {
      if (usedL[c.li] || usedR[c.ri]) return;
      usedL[c.li] = true; usedR[c.ri] = true;
      pairs.push(c);
    });
    return { pairs: pairs, usedL: usedL, usedR: usedR };
  }

  function _elementRow(el, side, match, sc) {
    var row = {
      type: 'class', match: match, score: sc,
      ref: '', refId: null, refLine: null,
      mine: '', mineId: null, mineLine: null,
    };
    if (side === 'ref') {
      row.ref = elementName(el); row.refId = el.id; row.refLine = el.line;
      row.refKind = el.kind; row.refLabel = elementName(el);
      row.refStereotype = el.stereotype || null;
      row.refGenerics = el.generics || null;
    } else {
      row.mine = elementName(el); row.mineId = el.id; row.mineLine = el.line;
    }
    return row;
  }

  // 要素の対応表。行は [対応が付いた組] → [参照図だけ] → [自分の図だけ]。
  function mapClasses(refParsed, mineParsed) {
    var refs = _elements(refParsed);
    var mines = _elements(mineParsed);
    var res = _pair(refs, mines, elementName);
    var rows = [];

    res.pairs.forEach(function(p) {
      var r = refs[p.li], m = mines[p.ri];
      var row = _elementRow(r, 'ref', kindOf(p.score), p.score);
      row.mine = elementName(m); row.mineId = m.id; row.mineLine = m.line;
      rows.push(row);
    });
    rows.sort(function(a, b) { return b.score - a.score; });

    refs.forEach(function(r, i) {
      if (res.usedL[i]) return;
      rows.push(_elementRow(r, 'ref', 'ref-only', 0));
    });
    mines.forEach(function(m, i) {
      if (res.usedR[i]) return;
      rows.push(_elementRow(m, 'mine', 'mine-only', 0));
    });
    return rows;
  }

  function _labelOf(id, parsed) {
    var list = _elements(parsed);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === _s(id)) return elementName(list[i]);
    }
    return _s(id);
  }

  // 関係の表示名。向きが読み取れる形にする。
  // 「継承: 親 DriverBase ← 子 GpioDrv」。矢印だけだと、どちらが親かを
  // PlantUML の記法を憶えている人にしか読めない。
  function relationName(rel, parsed) {
    if (!rel) return '';
    var info = relInfo(rel.kind);
    var from = _labelOf(rel.from, parsed);
    var to = _labelOf(rel.to, parsed);
    var lbl = _s(rel.label);
    return info.label + ': ' + info.from + ' ' + from + ' ← ' + info.to + ' ' + to
      + (lbl ? ' (' + lbl + ')' : '');
  }

  function _withRefEnds(row, rel, refParsed) {
    row.refFrom = _s(rel.from);
    row.refTo = _s(rel.to);
    row.refFromName = _labelOf(rel.from, refParsed);
    row.refToName = _labelOf(rel.to, refParsed);
    row.refRelKind = _s(rel.kind) || 'association';
    row.refRelLabel = _s(rel.label);
    return row;
  }

  // 関係の対応表。要素の対応が付いていれば端点を読み替えてから突き合わせる。
  // 種類も鍵に入れる。同じ 2 クラスの間に継承と依存が両方あることがあり、
  // 端点だけで組むと別種の関係どうしが「一致」になる。
  function mapRelations(refParsed, mineParsed, classRows) {
    var refs = _relations(refParsed);
    var mines = _relations(mineParsed);

    var alias = {};
    (classRows || []).forEach(function(row) {
      if (row.refId && row.mineId) alias[row.refId] = row.mineId;
    });

    function refKey(r) {
      var from = alias[_s(r.from)] || _s(r.from);
      var to = alias[_s(r.to)] || _s(r.to);
      return from + ' ' + _s(r.kind) + ' ' + to;
    }
    function mineKey(r) {
      return _s(r.from) + ' ' + _s(r.kind) + ' ' + _s(r.to);
    }

    var cands = [];
    refs.forEach(function(r, li) {
      mines.forEach(function(m, ri) {
        // 種類が違う関係は組にしない (向きが同じでも別の意味)。
        if (_s(r.kind) !== _s(m.kind)) return;
        var sc = score(refKey(r), mineKey(m));
        if (sc > 0) cands.push({ li: li, ri: ri, score: sc });
      });
    });
    cands.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.li !== b.li) return a.li - b.li;
      return a.ri - b.ri;
    });

    var usedL = {}, usedR = {}, rows = [];
    cands.forEach(function(c) {
      if (usedL[c.li] || usedR[c.ri]) return;
      usedL[c.li] = true; usedR[c.ri] = true;
      var r = refs[c.li], m = mines[c.ri];
      rows.push(_withRefEnds({
        type: 'relation', match: kindOf(c.score), score: c.score,
        ref: relationName(r, refParsed), refId: r.id, refLine: r.line,
        mine: relationName(m, mineParsed), mineId: m.id, mineLine: m.line,
      }, r, refParsed));
    });
    rows.sort(function(a, b) { return b.score - a.score; });

    refs.forEach(function(r, i) {
      if (usedL[i]) return;
      rows.push(_withRefEnds({
        type: 'relation', match: 'ref-only', score: 0,
        ref: relationName(r, refParsed), refId: r.id, refLine: r.line,
        mine: '', mineId: null, mineLine: null,
      }, r, refParsed));
    });
    mines.forEach(function(m, i) {
      if (usedR[i]) return;
      rows.push({
        type: 'relation', match: 'mine-only', score: 0,
        ref: '', refId: null, refLine: null,
        mine: relationName(m, mineParsed), mineId: m.id, mineLine: m.line,
      });
    });
    return rows;
  }

  // ── メンバー (BLK-junior-20260914-1606) ──────────────────────────────
  // クラスと関係が揃っていても、先輩が同じクラスにメソッドを足した回は行が 1 つも
  // 出ず、「IRQCtrl が 2 メソッド多い」と分かった後は先輩の画面を見ながら
  // `+ TransferComplete() : void` を手で打ち直すしかなかった。記法を憶えていない
  // 身には 1 文字違いで壊れる行で、クラス・関係と同じ「＋この図にも足す」が要る。
  // 並べるのは差のある行だけ (揃っているメンバーまで並べると表が読めなくなる)。

  function _members(el) {
    return ((el && el.members) || []).filter(function(m) {
      return m && _s(m.name) !== '' && (m.kind === 'method' || m.kind === 'attribute');
    });
  }

  // メンバー 1 つの見せ方。PlantUML の記法そのままではなく、可視性・引数・型が
  // 読める形に組み直す (打ち直しの元にしないので、記法は画面に出さなくてよい)。
  function memberName(m) {
    if (!m) return '';
    var vis = _s(m.visibility);
    var tail = m.kind === 'method' ? '(' + _s(m.params) + ')' : '';
    var type = _s(m.type) ? ' : ' + _s(m.type) : '';
    return (vis ? vis + ' ' : '') + _s(m.name) + tail + type;
  }

  function _memberSpec(m) {
    return {
      kind: m.kind, visibility: m.visibility || null, name: _s(m.name),
      params: _s(m.params), type: _s(m.type),
      static: !!m.static, abstract: !!m.abstract,
    };
  }

  function _memberRow(m, side, match, cls) {
    var row = {
      type: 'member', match: match, score: 0,
      ref: '', refId: null, refLine: null,
      mine: '', mineId: null, mineLine: null,
      cls: cls.name, mineClassId: cls.mineId, mineClassLine: cls.mineLine,
    };
    var text = cls.name + ' . ' + memberName(m);
    if (side === 'ref') {
      row.ref = text; row.refLine = m.line; row.refMember = _memberSpec(m);
    } else {
      row.mine = text; row.mineLine = m.line;
    }
    return row;
  }

  // 対応の付いたクラスの組ごとに、片方にしかないメンバーを並べる。
  function mapMembers(refParsed, mineParsed, classRows) {
    var refEls = {}, mineEls = {};
    _elements(refParsed).forEach(function(el) { refEls[el.id] = el; });
    _elements(mineParsed).forEach(function(el) { mineEls[el.id] = el; });
    var rows = [];
    (classRows || []).forEach(function(row) {
      if (!row.refId || !row.mineId) return;
      var r = refEls[row.refId], m = mineEls[row.mineId];
      if (!r || !m) return;
      var cls = { name: row.mine || row.ref, mineId: m.id, mineLine: m.line };
      var mineKeys = {}, refKeys = {};
      _members(m).forEach(function(x) { mineKeys[normalize(x.name)] = true; });
      _members(r).forEach(function(x) { refKeys[normalize(x.name)] = true; });
      _members(r).forEach(function(x) {
        if (mineKeys[normalize(x.name)]) return;
        rows.push(_memberRow(x, 'ref', 'ref-only', cls));
      });
      _members(m).forEach(function(x) {
        if (refKeys[normalize(x.name)]) return;
        rows.push(_memberRow(x, 'mine', 'mine-only', cls));
      });
    });
    return rows;
  }

  // 対応表 1 回分。要素 → 関係 → メンバーの順 (どちらも要素の対応に依存する)。
  function build(refParsed, mineParsed) {
    var classes = mapClasses(refParsed, mineParsed);
    var relations = mapRelations(refParsed, mineParsed, classes);
    var members = mapMembers(refParsed, mineParsed, classes);
    return { states: classes, transitions: relations, members: members, kind: 'class' };
  }

  // ── 参照図だけの行を自分の図にも足す ──────────────────────────────
  // 状態遷移図と同じ操作にする。橙の行 1 つから、自分の図の末尾に足す DSL を
  // 組み立てる。関係は端点が要るので、対応の付いた要素は自分の側の id に
  // 読み替え、付かない端点だけ「どのクラスにするか」を聞き返す。
  // 向きは参照図のものをそのまま写すので、親子を選び直す場面は無い。

  var NEW_CLASS = '__new__';

  function aliasMap(map) {
    var alias = {};
    ((map && map.states) || []).forEach(function(row) {
      if (row.refId && row.mineId) alias[row.refId] = row.mineId;
    });
    return alias;
  }

  function mineOptions(mineParsed) {
    return _elements(mineParsed).map(function(el) {
      return { value: el.id, label: elementName(el) };
    });
  }

  // 新しく作るクラスの id。自分の図と、この 1 回で作る分にぶつからないもの。
  function _newClass(name, mineParsed, taken) {
    var classMod = window.MA.modules && window.MA.modules.plantumlClass;
    var extra = (taken || []).map(function(id) { return { id: id, label: id }; });
    var parsed = { elements: _elements(mineParsed).concat(extra) };
    var norm = classMod
      ? classMod.normalizeIdInput(name, parsed)
      : { id: _s(name), label: _s(name) };
    var id = norm.id, label = norm.label;
    var used = {};
    parsed.elements.forEach(function(el) { used[_s(el.id)] = true; });
    var base = id, n = 2;
    while (used[id]) { id = base + '_' + n; n++; }
    return { id: id, label: label };
  }

  function _endpoint(side, sideLabel, refId, refName, alias, mineParsed, taken) {
    var end = { side: side, sideLabel: sideLabel, name: refName || refId, resolved: null };
    if (alias[_s(refId)]) {
      end.resolved = alias[_s(refId)];
      return end;
    }
    // 対応表は 1 対 1 で組むので、同名が 2 つあると片方が余る。名前が同じなら拾う。
    var same = null;
    _elements(mineParsed).forEach(function(el) {
      if (same === null && normalize(elementName(el)) === normalize(refName)) same = el.id;
    });
    if (same) { end.resolved = same; return end; }
    var made = _newClass(refName || refId, mineParsed, taken);
    end.newId = made.id;
    end.newLabel = made.label;
    end.options = mineOptions(mineParsed);
    return end;
  }

  // 1 行を足す計画。ready なら押すだけで足せる。
  function adoptPlan(row, map, mineParsed) {
    if (!row || row.match !== 'ref-only') {
      return { adoptable: false, reason: '参照図だけの行しか足せません' };
    }
    if (row.type === 'member') {
      var mem = row.refMember;
      if (!mem || row.mineClassLine == null) {
        return { adoptable: false, reason: '足し先のクラスが自分の図にありません' };
      }
      return {
        adoptable: true, kind: 'member', ready: true, needs: [],
        member: mem, classLine: row.mineClassLine, className: row.cls,
        describe: (mem.kind === 'method' ? 'メソッド' : '属性') + '「' + memberName(mem)
          + '」を ' + row.cls + ' に足します',
      };
    }
    if (row.type === 'class') {
      var made = _newClass(row.ref, mineParsed, []);
      var kindLabel = KIND_LABEL[row.refKind] || KIND_LABEL['class'];
      return {
        adoptable: true, kind: 'class', ready: true, needs: [],
        element: {
          id: made.id, label: made.label,
          kind: row.refKind || 'class',
          stereotype: row.refStereotype || null,
          generics: row.refGenerics || null,
        },
        describe: kindLabel + '「' + (made.label || made.id) + '」を足します',
      };
    }
    var info = relInfo(row.refRelKind);
    var alias = aliasMap(map);
    var taken = [];
    var from = _endpoint('from', info.from, row.refFrom, row.refFromName, alias, mineParsed, taken);
    if (from.newId) taken.push(from.newId);
    var to = _endpoint('to', info.to, row.refTo, row.refToName, alias, mineParsed, taken);
    if (to.newId) taken.push(to.newId);
    var needs = [from, to].filter(function(e) { return e.resolved === null; });
    return {
      adoptable: true, kind: 'relation', ready: needs.length === 0, needs: needs,
      from: from, to: to,
      relKind: row.refRelKind || 'association',
      label: row.refRelLabel || '',
      describe: info.label + '「' + info.from + ' ' + (row.refFromName || row.refFrom)
        + ' ← ' + info.to + ' ' + (row.refToName || row.refTo) + '」を足します',
    };
  }

  function _pickEnd(end, pick) {
    if (end.resolved !== null) return { id: end.resolved, create: null };
    if (pick && pick !== NEW_CLASS) return { id: pick, create: null };
    return { id: end.newId, create: { id: end.newId, label: end.newLabel } };
  }

  function _append(text, line) {
    var out = window.MA.dslUpdater.insertBeforeEnd(text, line);
    var lines = out.split('\n');
    for (var i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === line) return { text: out, line: i + 1 };
    }
    return { text: out, line: lines.length };
  }

  function _fmtElement(classMod, el) {
    if (el.kind === 'interface') return classMod.fmtInterface(el.id, el.label, el.stereotype, el.generics);
    if (el.kind === 'abstract') return classMod.fmtAbstract(el.id, el.label, el.stereotype, el.generics);
    if (el.kind === 'enum') return classMod.fmtEnum(el.id, el.label, el.stereotype);
    return classMod.fmtClass(el.id, el.label, el.stereotype, el.generics);
  }

  // 計画を自分の DSL に書き込む。戻り値の line は「足した本体の行」。
  function applyAdopt(text, row, map, mineParsed, picks) {
    var classMod = window.MA.modules && window.MA.modules.plantumlClass;
    if (!classMod || !window.MA.dslUpdater) return null;
    var plan = adoptPlan(row, map, mineParsed);
    if (!plan.adoptable) return null;
    var out = _s(text), res, added = [];

    if (plan.kind === 'member') {
      var mem = plan.member;
      var line = mem.kind === 'method'
        ? classMod.fmtMethod(mem.visibility, mem.name, mem.params, mem.type, mem.static, mem.abstract)
        : classMod.fmtAttribute(mem.visibility, mem.name, mem.type, mem.static);
      var next = mem.kind === 'method'
        ? classMod.addMethod(out, plan.classLine, mem.visibility, mem.name, mem.params,
          mem.type, mem.static, mem.abstract)
        : classMod.addAttribute(out, plan.classLine, mem.visibility, mem.name, mem.type, mem.static);
      if (next === out) return null;              // 足し先が読めなければ何も書かない
      var ls = next.split('\n');
      var at = plan.classLine;
      for (var i = plan.classLine; i < ls.length; i++) {
        if (_s(ls[i]) === _s(line)) { at = i + 1; break; }
      }
      return { text: next, line: at, added: [memberName(mem)], plan: plan };
    }

    if (plan.kind === 'class') {
      res = _append(out, _fmtElement(classMod, plan.element));
      added.push(plan.element.label || plan.element.id);
      return { text: res.text, line: res.line, added: added, plan: plan };
    }

    var p = picks || {};
    var from = _pickEnd(plan.from, p.from);
    var to = _pickEnd(plan.to, p.to);
    [from, to].forEach(function(e) {
      if (!e.create) return;
      res = _append(out, classMod.fmtClass(e.create.id, e.create.label, null, null));
      out = res.text;
      added.push(e.create.label || e.create.id);
    });
    // 向きは参照図のまま。fmtRelation は from を親 (矢の根元) として書く。
    res = _append(out, classMod.fmtRelation(plan.relKind, from.id, to.id, plan.label));
    added.push(relInfo(plan.relKind).label + ' ' + from.id + ' ' + relInfo(plan.relKind).arrow + ' ' + to.id);
    return { text: res.text, line: res.line, added: added, plan: plan };
  }

  function _count(rows, match) {
    return (rows || []).filter(function(r) { return r.match === match; }).length;
  }

  // メンバーの差は「参照図だけ / 自分だけ」しか並べないので、行数がそのまま差の数。
  function memberDiffText(map) {
    var mem = (map && map.members) || [];
    if (mem.length === 0) return '';
    return ' / メンバー差 ' + mem.length;
  }

  function summary(map) {
    var rows = ((map && map.states) || []).concat((map && map.transitions) || []);
    if (rows.length === 0) return 'クラスが読めません';
    var refOnly = _count(rows, 'ref-only');
    var mineOnly = _count(rows, 'mine-only');
    var exact = _count(rows, 'exact');
    var partial = _count(rows, 'partial');
    if (refOnly === 0 && mineOnly === 0) {
      return '片方だけ 0 件 (一致 ' + exact + ' / 部分一致 ' + partial + ')' + memberDiffText(map);
    }
    return '参照図だけ ' + refOnly + ' / 自分だけ ' + mineOnly
      + ' (一致 ' + exact + ' / 部分一致 ' + partial + ')' + memberDiffText(map);
  }

  function abstractionWarning(map) {
    var classes = (map && map.states) || [];
    if (classes.length === 0) return '';
    var paired = _count(classes, 'exact') + _count(classes, 'partial');
    if (paired * 2 >= classes.length) return '';
    return 'クラス名の対応が ' + paired + '/' + classes.length
      + ' しか付きません。抽象度が違う図どうしの可能性があります';
  }

  return {
    KIND_LABEL: KIND_LABEL,
    relInfo: relInfo,
    elementName: elementName,
    relationName: relationName,
    mapClasses: mapClasses,
    mapRelations: mapRelations,
    mapMembers: mapMembers,
    memberName: memberName,
    build: build,
    summary: summary,
    abstractionWarning: abstractionWarning,
    matchLabel: function(m) { return _sm().matchLabel(m); },
    NEW_CLASS: NEW_CLASS,
    NEW_STATE: NEW_CLASS,
    aliasMap: aliasMap,
    mineOptions: mineOptions,
    adoptPlan: adoptPlan,
    applyAdopt: applyAdopt,
    sectionTitles: {
      states: 'クラス (参照図 / 自分の図)',
      transitions: '関係 (参照図 / 自分の図)',
      members: 'メンバー (片方にしかないもの)',
    },
    emptyMessage: 'クラスが読めません。どちらもクラス図にしてください。',
  };
})();
