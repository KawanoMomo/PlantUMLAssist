'use strict';
window.MA = window.MA || {};

// driver-map — 図と図の対応関係 (どのシーケンス図がどの状態遷移図・クラス図の相手か) を
// 「系統」として宣言し、プロジェクトとして持ち続ける。
//
// BLK-reviewer-20260908-0103-wish: spi_init_sequence → spi_state、
// dma_transfer_sequence → dma_state のように、対応関係は現場では固定なのに、
// GUI はそれをどこにも持っていなかった。⇉ 系統チェックは毎回名前の頭から系統を
// 推測し直し、語彙が重ならない組は「粒度が違う」として黙って外す。つまり
// 「対応しているはずなのに中身が食い違っている」= いちばん見たい壊れ方が、
// 突き合わせから落ちて 0 件に見える。宣言があれば、その組は必ず突き合わせ、
// 揃っていなければ赤にできる。
//
// ここは判断だけを持ち、DOM も localStorage も触らない (保存は app.js の職掌)。
window.MA.driverMap = (function() {

  // 図の役どころを表す語。系統名 (spi / dma) を取り出すときに落とす。
  var ROLE_WORDS = {
    sequence: 'sequence', seq: 'sequence', シーケンス: 'sequence',
    state: 'state', states: 'state', statemachine: 'state', 状態: 'state', 状態遷移: 'state',
    class: 'class', classes: 'class', クラス: 'class',
    component: 'component', コンポーネント: 'component',
    usecase: 'usecase', ユースケース: 'usecase',
    activity: 'activity', アクティビティ: 'activity',
    object: 'object', diagram: null, 図: null,
  };

  // 系統名として意味を持たない語 (どの系統にも付く動作名)。stem には使わない。
  function _tokens(name) {
    return String(name == null ? '' : name)
      .replace(/\.(puml|pu|plantuml)$/i, '')
      .split(/[_\-\s.]+/)
      .filter(function(t) { return t !== ''; });
  }

  function _roleWordOf(token) {
    var k = String(token).toLowerCase();
    return Object.prototype.hasOwnProperty.call(ROLE_WORDS, k) ? ROLE_WORDS[k] : undefined;
  }

  // 系統名。役どころの語を落とした先頭のトークンを小文字で返す。
  // spi_init_sequence → spi、dma_transfer_sequence → dma、SPI_State → spi。
  function stemOf(name) {
    var ts = _tokens(name);
    for (var i = 0; i < ts.length; i++) {
      if (_roleWordOf(ts[i]) === undefined) return ts[i].toLowerCase();
    }
    return '';
  }

  // 図の役どころ。diagramType があればそれ、無ければ名前の語から拾う。
  function roleOf(doc) {
    if (!doc) return '';
    var dt = String(doc.diagramType || '').replace(/^plantuml-/, '').toLowerCase();
    if (dt) return dt;
    var ts = _tokens(doc.name);
    for (var i = ts.length - 1; i >= 0; i--) {
      var r = _roleWordOf(ts[i]);
      if (r) return r;
    }
    return '';
  }

  // ── 宣言 ────────────────────────────────────────────────────────────────

  function _emptyDecl() { return { version: 1, families: [] }; }

  // 外から来た宣言 (localStorage の中身・古い版) を安全な形に均す。
  // 壊れていたら黙って空にする (宣言が読めないことで画面が開かなくなる方が困る)。
  function normalize(decl) {
    var out = _emptyDecl();
    if (!decl || typeof decl !== 'object') return out;
    var fams = Array.isArray(decl.families) ? decl.families : [];
    var seenKey = {};
    fams.forEach(function(f) {
      if (!f || typeof f !== 'object') return;
      var members = [];
      var seenName = {};
      (Array.isArray(f.members) ? f.members : []).forEach(function(m) {
        var n = (typeof m === 'string') ? m : (m && m.name);
        if (typeof n !== 'string' || n === '') return;
        if (seenName[n]) return;          // 同じ図を 2 回宣言しても 1 枚として扱う
        seenName[n] = true;
        members.push(n);
      });
      if (members.length === 0) return;   // 相手のいない宣言は対応関係を表さない
      var key = (typeof f.key === 'string' && f.key !== '') ? f.key : stemOf(members[0]);
      if (key === '' || seenKey[key]) return;
      seenKey[key] = true;
      out.families.push({
        key: key,
        label: (typeof f.label === 'string' && f.label !== '') ? f.label : key.toUpperCase(),
        members: members,
      });
    });
    return out;
  }

  function parse(raw) {
    if (typeof raw !== 'string' || raw === '') return _emptyDecl();
    try { return normalize(JSON.parse(raw)); } catch (e) { return _emptyDecl(); }
  }

  function serialize(decl) {
    return JSON.stringify(normalize(decl));
  }

  // 開いている図から宣言の下書きを作る。系統名を共有する 2 枚以上を 1 系統にする。
  // 1 枚しかない系統は対応関係を持たないので出さない。
  // 既存の宣言にある label は引き継ぐ (付け直した系統名を作り直しで失わない)。
  function suggest(docs, prev) {
    var groups = {};
    var order = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || typeof d.name !== 'string') return;
      var k = stemOf(d.name);
      if (k === '') return;
      if (!groups[k]) { groups[k] = []; order.push(k); }
      if (groups[k].indexOf(d.name) < 0) groups[k].push(d.name);
    });
    var labels = {};
    normalize(prev).families.forEach(function(f) { labels[f.key] = f.label; });
    var out = _emptyDecl();
    order.forEach(function(k) {
      if (groups[k].length < 2) return;
      out.families.push({ key: k, label: labels[k] || k.toUpperCase(), members: groups[k] });
    });
    return out;
  }

  function familyOf(decl, name) {
    var fams = normalize(decl).families;
    for (var i = 0; i < fams.length; i++) {
      if (fams[i].members.indexOf(name) >= 0) return fams[i];
    }
    return null;
  }

  // その図の「宣言された相手」。1 枚開いたときに並べて開く相手はここから決まる。
  function partnersOf(decl, name) {
    var f = familyOf(decl, name);
    if (!f) return [];
    return f.members.filter(function(m) { return m !== name; });
  }

  // ── 突合 ────────────────────────────────────────────────────────────────

  function _byName(docs) {
    var map = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (d && typeof d.name === 'string') map[d.name] = d;
    });
    return map;
  }

  // その動作名が最初に書かれている行 (1 始まり)。表の行からその図のその行へ運ぶために要る。
  function _lineOfLabel(dsl, label) {
    var lines = String(dsl == null ? '' : dsl).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(label) >= 0) return i + 1;
    }
    return null;
  }

  // 宣言された組の動作名の食い違い。familyAudit に投げる (突合の規則を二重に持たない)。
  // 宣言済みの組は「粒度が違う」で外さない: 対応していると人が言っている以上、
  // 食い違いは見せるべきものなので、comparable の判定にかかわらず数える。
  function _mismatchRows(present) {
    var fa = window.MA.familyAudit;
    if (!fa || present.length < 2) return [];
    var sets = present.map(function(d) {
      var keys = {};
      (fa.actionsOf(d.dsl) || []).forEach(function(a) {
        keys[a.key] = { label: a.label, line: _lineOfLabel(d.dsl, a.label) };
      });
      return { doc: d, keys: keys };
    }).filter(function(s) { return Object.keys(s.keys).length > 0; });
    if (sets.length < 2) return [];
    var rows = [];
    var seen = {};
    sets.forEach(function(s, i) {
      Object.keys(s.keys).forEach(function(k) {
        var others = sets.filter(function(o, j) { return j !== i; });
        var missingIn = others.filter(function(o) { return !o.keys[k]; });
        if (missingIn.length === 0) return;
        var id = k + '@' + s.doc.name;
        if (seen[id]) return;
        seen[id] = true;
        rows.push({
          key: k,
          label: s.keys[k].label,
          onlyIn: s.doc.name,
          line: s.keys[k].line,
          missingIn: missingIn.map(function(o) { return o.doc.name; }),
        });
      });
    });
    return rows;
  }

  // 宣言 1 件ぶんの状態。
  //  - missing: 宣言に書いてあるのに開いていない図 (対応が崩れている)
  //  - mismatch: 対応している組の片方にしか無い動作名
  //  - status: どちらかがあれば 'red'
  function checkFamily(family, docs) {
    var map = _byName(docs);
    var members = family.members.map(function(n) {
      return { name: n, present: !!map[n], role: map[n] ? roleOf(map[n]) : '' };
    });
    var missing = members.filter(function(m) { return !m.present; }).map(function(m) { return m.name; });
    var present = family.members.filter(function(n) { return map[n]; }).map(function(n) { return map[n]; });
    var mismatch = _mismatchRows(present);
    var reasons = [];
    if (missing.length) reasons.push('宣言された図が開かれていません (' + missing.length + ' 枚)');
    if (mismatch.length) reasons.push('片方にしか無い動作名 ' + mismatch.length + ' 件');
    return {
      key: family.key,
      label: family.label,
      members: members,
      missing: missing,
      mismatch: mismatch,
      status: reasons.length ? 'red' : 'ok',
      reasons: reasons,
    };
  }

  // 宣言に入っていない図。プロジェクトの外に置き去りになった枚数が分かる。
  function undeclared(decl, docs) {
    var declared = {};
    normalize(decl).families.forEach(function(f) {
      f.members.forEach(function(m) { declared[m] = true; });
    });
    return (Array.isArray(docs) ? docs : [])
      .filter(function(d) { return d && typeof d.name === 'string' && !declared[d.name]; })
      .map(function(d) { return d.name; });
  }

  function check(decl, docs) {
    var d = normalize(decl);
    var families = d.families.map(function(f) { return checkFamily(f, docs); });
    return {
      families: families,
      red: families.filter(function(f) { return f.status === 'red'; }).length,
      undeclared: undeclared(d, docs),
    };
  }

  function summaryLine(result) {
    if (!result || !result.families.length) {
      return '系統が宣言されていません。「宣言を作り直す」で開いている図から下書きを作れます';
    }
    var n = result.families.length;
    if (result.red === 0) {
      return n + ' 系統すべてで、宣言された対応どおりに揃っています';
    }
    return n + ' 系統のうち ' + result.red + ' 系統で対応が崩れています';
  }

  return {
    ROLE_WORDS: ROLE_WORDS,
    stemOf: stemOf,
    roleOf: roleOf,
    normalize: normalize,
    parse: parse,
    serialize: serialize,
    suggest: suggest,
    familyOf: familyOf,
    partnersOf: partnersOf,
    checkFamily: checkFamily,
    undeclared: undeclared,
    check: check,
    summaryLine: summaryLine,
  };
})();
