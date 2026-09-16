'use strict';
window.MA = window.MA || {};

// senior-draft — 先輩がまだ書いていない図種の「仮の手本」を、先輩の他図種から起こす。
//
// BLK-junior-20260915-2240-wish: 今回 (SPI コンポーネント図) は先輩側にその図種の
// 実体が無く、手順1「手本を見て直す」が成立しなかった。junior は表記統一登録簿
// (_names.json) だけを頼りに要素構成と依存の粒度を決め打ちし、先輩が後から本物を
// 書いても、reviewer の指摘が付くまで食い違いに誰も気づけない。
//
// ここは「先輩の既存図 (クラス図・シーケンス図・状態遷移図…) に実際に書かれている
// 名前」だけを材料に、足りない図種の下書き DSL を組む。材料は part-vocab が
// 役割ごとに分けた名前帳 (method / event / state / type) で、どの名前をどの図から
// 拾ったかを必ず添える — 決め打ちと機械抽出を混ぜないための線引きで、根拠の無い
// 要素は 1 つも足さない (「ドライバなら普通ある」は component-starter の職掌)。
//
// 先輩が後から本物を書いたら compare() が下書きとの差分を出す。下書きのまま
// 残っている要素と、先輩だけが持つ要素が並ぶので、決め打ちのずれがその場で分かる。
//
// DOM にも localStorage にも触らない。出来上がりは下書きであり、直して使う。
window.MA.seniorDraft = (function() {
  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 起こせる図種。値は workspace の diagramType と同じ綴り。
  var KINDS = [
    { value: 'plantuml-sequence', key: 'sequence', label: 'シーケンス図' },
    { value: 'plantuml-state', key: 'state', label: '状態遷移図' },
    { value: 'plantuml-class', key: 'class', label: 'クラス図' },
    { value: 'plantuml-activity', key: 'activity', label: 'アクティビティ図' },
    { value: 'plantuml-component', key: 'component', label: 'コンポーネント図' },
    { value: 'plantuml-usecase', key: 'usecase', label: 'ユースケース図' },
  ];

  function kindLabel(key) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].key === key) return KINDS[i].label;
    return _s(key);
  }

  function _kindKey(v) {
    var s = _s(v).replace(/^plantuml-/, '');
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].key === s) return s;
    return '';
  }

  function _kindOf(doc) {
    if (!doc) return '';
    var k = _kindKey(doc.kind);
    if (k) return k;
    var PR = window.MA.partReference;
    if (PR && PR.kindOf) {
      return _kindKey(PR.kindOf({ kind: '', text: _s(doc.text != null ? doc.text : doc.dsl) }));
    }
    return '';
  }

  // 先輩がその部品について持っている図種と、持っていない図種。
  // 部品名で引けない相乗り図も part-vocab と同じ規則で「持っている」に数える
  // (driver_common_class.puml はクラス図の手本として十分に読める)。
  function coverage(subject, docs) {
    var PV = window.MA.partVocab;
    var have = {};
    var byKind = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var text = _s(d.text != null ? d.text : d.dsl);
      if (!text) return;
      if (subject && PV && PV.belongs && !PV.belongs(subject, _s(d.name))) {
        // 相乗り図はその部品ぶんが入っているときだけ数える。
        if (text.toLowerCase().indexOf(_s(subject).toLowerCase()) < 0) return;
      }
      var k = _kindOf(d);
      if (!k) return;
      have[k] = true;
      (byKind[k] = byKind[k] || []).push(_s(d.name));
    });
    var missing = [];
    var present = [];
    KINDS.forEach(function(k) {
      (have[k.key] ? present : missing).push(k.key);
    });
    return { subject: _s(subject), present: present, missing: missing, byKind: byKind };
  }

  // ── 材料 ─────────────────────────────────────────────────────────────
  // part-vocab の名前帳から、図を組むのに要る 4 つの束を取り出す。
  // 名前は先輩の綴りのまま。ここで整えると先輩の表記が黙って消える。
  function materials(subject, docs) {
    var PV = window.MA.partVocab;
    if (!PV || !PV.collect) return { methods: [], events: [], states: [], types: [], sources: [] };
    var vocab = PV.collect(subject, docs);
    function names(role) {
      return (vocab.byRole[role] || []).map(function(it) { return it.name; });
    }
    return {
      vocab: vocab,
      methods: names('method'),
      events: names('event'),
      states: names('state'),
      types: names('type'),
      sources: (vocab.docs || []).map(function(d) { return d.name; }),
    };
  }

  function _bodyName(subject, mat) {
    // 先輩が型として書いている名前 (Spi_Driver) を本体に使う。無ければ部品名。
    var id = _s(subject).toLowerCase();
    for (var i = 0; i < mat.types.length; i++) {
      if (mat.types[i].toLowerCase().indexOf(id) === 0) return mat.types[i];
    }
    return mat.types[0] || (_s(subject) || 'Part');
  }

  function _others(mat, body) {
    return mat.types.filter(function(t) { return t !== body; });
  }

  function _call(name) {
    return /\(\s*\)$/.test(name) ? name : name + '()';
  }

  // ── 図種ごとの組み立て ───────────────────────────────────────────────
  function _sequence(subject, mat) {
    var body = _bodyName(subject, mat);
    var others = _others(mat, body);
    var caller = others[0] || 'Caller';
    var lines = ['participant ' + caller, 'participant ' + body];
    others.slice(1).forEach(function(t) { lines.push('participant ' + t); });
    mat.methods.forEach(function(m) {
      lines.push(caller + ' -> ' + body + ' : ' + _call(m));
    });
    mat.events.forEach(function(e) {
      lines.push(body + ' --> ' + caller + ' : ' + e);
    });
    return lines;
  }

  function _state(subject, mat) {
    var lines = [];
    var states = mat.states.slice();
    states.forEach(function(s) { lines.push('state ' + s); });
    if (states.length > 0) {
      lines.push('[*] --> ' + states[0]);
      // きっかけは先輩が書いているメソッド・イベントから順に当てる。
      var triggers = mat.methods.concat(mat.events);
      for (var i = 0; i + 1 < states.length; i++) {
        var t = triggers[i];
        lines.push(states[i] + ' --> ' + states[i + 1] + (t ? ' : ' + t : ''));
      }
    }
    return lines;
  }

  function _class(subject, mat) {
    var body = _bodyName(subject, mat);
    var lines = ['class ' + body + ' {'];
    mat.methods.forEach(function(m) { lines.push('  +' + _call(m)); });
    lines.push('}');
    _others(mat, body).forEach(function(t) {
      lines.push('class ' + t);
      lines.push(body + ' --> ' + t);
    });
    return lines;
  }

  function _activity(subject, mat) {
    var lines = ['start'];
    mat.methods.forEach(function(m) { lines.push(':' + _call(m) + ';'); });
    lines.push('stop');
    return lines;
  }

  function _component(subject, mat) {
    var body = _bodyName(subject, mat);
    var lines = ['component [' + body + ']'];
    _others(mat, body).forEach(function(t) {
      lines.push('component [' + t + ']');
      lines.push('[' + body + '] --> [' + t + ']');
    });
    return lines;
  }

  function _usecase(subject, mat) {
    var body = _bodyName(subject, mat);
    var others = _others(mat, body);
    var actor = others[0] || 'Caller';
    var lines = ['actor ' + actor];
    mat.methods.forEach(function(m, i) {
      var id = 'UC' + (i + 1);
      lines.push('usecase "' + m + '" as ' + id);
      lines.push(actor + ' --> ' + id);
    });
    return lines;
  }

  var BUILD = {
    sequence: _sequence, state: _state, class: _class,
    activity: _activity, component: _component, usecase: _usecase,
  };

  // その図種を組むのに要る材料。足りなければ下書きを出さずに何が足りないか言う。
  var NEEDS = {
    sequence: ['methods'], state: ['states'], class: ['methods'],
    activity: ['methods'], component: ['types'], usecase: ['methods'],
  };
  var NEED_LABEL = {
    methods: '呼べる操作 (メソッド名)', states: '状態名',
    types: '型・部品名', events: 'きっかけ',
  };

  // ── 下書き ───────────────────────────────────────────────────────────
  function draft(subject, docs, kind) {
    var key = _kindKey(kind);
    var mat = materials(subject, docs);
    var build = BUILD[key];
    if (!build) {
      return { ok: false, kind: key, reason: '図種が分かりません', dsl: '', sources: [], basis: [] };
    }
    var missing = (NEEDS[key] || []).filter(function(n) { return mat[n].length === 0; });
    if (missing.length > 0) {
      return {
        ok: false, kind: key, dsl: '', sources: mat.sources, basis: [],
        reason: '先輩の図から ' + missing.map(function(n) { return NEED_LABEL[n]; }).join(' / ')
          + ' を 1 つも拾えませんでした',
      };
    }
    var title = _s(subject).toUpperCase() + ' ' + kindLabel(key) + '（先輩の他図種からの仮の手本）';
    var body = build(_s(subject), mat);
    var dsl = ['@startuml', 'title ' + title].concat(body, ['@enduml']).join('\n');
    // 何をどの図から拾ったか。下書きを見た人が根拠を辿れるようにする。
    var basis = [];
    ['types', 'methods', 'events', 'states'].forEach(function(role) {
      if (mat[role].length === 0) return;
      basis.push({ role: role, label: NEED_LABEL[role] || role, names: mat[role].slice() });
    });
    return {
      ok: true, kind: key, subject: _s(subject), dsl: dsl,
      sources: mat.sources, basis: basis,
    };
  }

  // 画面に出す 1 行。決め打ちではなく機械抽出であることを名乗る。
  function noticeText(res) {
    if (!res) return '';
    if (!res.ok) return '下書きを作れません: ' + _s(res.reason);
    var from = res.sources.length ? res.sources.join(' / ') : '(なし)';
    return '先輩の ' + from + ' から拾った仮の手本です（先輩本人の ' + kindLabel(res.kind)
      + ' ではありません）。要らない要素は消して使ってください';
  }

  function docName(subject, kind) {
    return _s(subject).toLowerCase() + '_' + _kindKey(kind) + '_draft';
  }

  // ── 先輩が後から本物を書いたとき ─────────────────────────────────────
  // 下書きと本物に出てくる「名前」を比べる。行の差分ではなく名前の差分にするのは、
  // 並び順や書式の違いで埋もれさせないため (知りたいのは要素構成の食い違い)。
  function _namesOf(dsl) {
    var out = [];
    var seen = {};
    _s(dsl).split(/\r?\n/).forEach(function(raw) {
      var line = raw.trim();
      if (!line || line.charAt(0) === "'" || /^@(start|end)uml/.test(line)) return;
      if (/^title\s/.test(line)) return;
      var re = /[A-Za-z_][A-Za-z0-9_]*/g;
      var m;
      while ((m = re.exec(line)) !== null) {
        var w = m[0];
        if (/^(participant|actor|component|class|state|usecase|as|start|stop)$/i.test(w)) continue;
        if (seen[w]) continue;
        seen[w] = 1;
        out.push(w);
      }
    });
    return out;
  }

  function compare(draftDsl, realDsl) {
    var a = _namesOf(draftDsl);
    var b = _namesOf(realDsl);
    var inB = {};
    b.forEach(function(n) { inB[n] = 1; });
    var inA = {};
    a.forEach(function(n) { inA[n] = 1; });
    return {
      same: a.filter(function(n) { return inB[n]; }),
      onlyInDraft: a.filter(function(n) { return !inB[n]; }),
      onlyInReal: b.filter(function(n) { return !inA[n]; }),
    };
  }

  function compareText(res) {
    if (!res) return '';
    var parts = ['一致 ' + res.same.length + ' 件'];
    if (res.onlyInDraft.length) parts.push('下書きだけ: ' + res.onlyInDraft.join(', '));
    if (res.onlyInReal.length) parts.push('先輩だけ: ' + res.onlyInReal.join(', '));
    return parts.join(' / ');
  }

  return {
    KINDS: KINDS,
    kindLabel: kindLabel,
    coverage: coverage,
    materials: materials,
    draft: draft,
    noticeText: noticeText,
    docName: docName,
    compare: compare,
    compareText: compareText,
  };
})();
