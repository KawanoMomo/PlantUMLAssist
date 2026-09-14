'use strict';
window.MA = window.MA || {};

// activity-branch-pattern — アクティビティ図の「よく使う分岐パターン」を
// 1 手でその位置に入れる。
//
// ドライバ初期化系のアクティビティ図は題材が変わっても
// 「クロック有効化→レジスタ設定→有効化→割込み設定→(初期化失敗?)分岐→異常/正常」
// という同じ形に収束する。今の挿入メニューで if を選ぶと condition / then / else を
// 毎回打ち直したうえ、枝の中身は空アクション (`:;`) なので分岐の中身も打ち直しになる。
//
// ここは「条件と両枝の中身がそろった型」を候補として持ち、選ぶだけで
// if / else / endif と枝のアクションまで入った行のかたまりを返す純関数を置く。
// 候補は組み込みの型と、開いている他のアクティビティ図から採ってきた型
// (先輩や自分の過去図) の 2 種類。DOM には触らない。
window.MA.activityBranchPattern = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // 組み込みの型。cond は「?」で終わる問い、then / else は枝ラベル、
  // thenActions / elseActions は枝に入るアクション本文。
  var BUILTINS = [
    {
      id: 'init-fail',
      label: '初期化失敗時の分岐',
      cond: '初期化に失敗?',
      thenLabel: 'はい',
      thenActions: ['エラーコードを返す'],
      elseLabel: 'いいえ',
      elseActions: ['初期化完了を記録する'],
    },
    {
      id: 'param-check',
      label: '引数チェックの分岐',
      cond: '引数が範囲内?',
      thenLabel: 'はい',
      thenActions: ['処理を続行する'],
      elseLabel: 'いいえ',
      elseActions: ['E_PARAM を返す'],
    },
    {
      id: 'state-check',
      label: '未初期化チェックの分岐',
      cond: '初期化済み?',
      thenLabel: 'はい',
      thenActions: ['処理を続行する'],
      elseLabel: 'いいえ',
      elseActions: ['E_UNINIT を返す'],
    },
    {
      id: 'timeout',
      label: 'タイムアウト判定の分岐',
      cond: 'タイムアウト?',
      thenLabel: 'はい',
      thenActions: ['タイムアウトを通知する'],
      elseLabel: 'いいえ',
      elseActions: ['応答を読み出す'],
    },
  ];

  function builtins() {
    return BUILTINS.map(function(p) { return _clone(p); });
  }

  function _clone(p) {
    return {
      id: p.id,
      label: p.label,
      cond: p.cond,
      thenLabel: p.thenLabel,
      thenActions: (p.thenActions || []).slice(),
      elseLabel: p.elseLabel,
      elseActions: (p.elseActions || []).slice(),
      from: p.from || null,
    };
  }

  // 型が同じかどうかは「条件 + 両枝のアクション」で見る。枝ラベルの
  // yes/はい の揺れだけで別候補が 2 つ並ぶと、選ぶ手数がかえって増える。
  function signature(p) {
    if (!p) return '';
    return [
      _s(p.cond).trim(),
      (p.thenActions || []).join('|'),
      (p.elseActions || []).join('|'),
    ].join('/');
  }

  var IF_RE = /^if\s*\((.*)\)\s*then\s*\(([^)]*)\)\s*$/i;
  var ELSE_RE = /^else\s*(?:\(([^)]*)\))?\s*$/i;
  var ENDIF_RE = /^endif\s*$/i;
  var ACTION_RE = /^:(.*);$/;

  // 1 枚の DSL から if…endif の型を採る。else を持たない if、入れ子の if を
  // 含む if は「型」として繰り返し使える形ではないので落とす。
  function harvestFrom(dsl, fromName) {
    var out = [];
    var lines = _s(dsl).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = IF_RE.exec(lines[i].trim());
      if (!m) continue;
      var cur = {
        id: 'harvest-' + i,
        label: _s(m[1]).trim(),
        cond: _s(m[1]).trim(),
        thenLabel: _s(m[2]).trim() || 'yes',
        thenActions: [],
        elseLabel: '',
        elseActions: [],
        from: _s(fromName) || null,
      };
      var branch = 'then';
      var ok = false;
      for (var j = i + 1; j < lines.length; j++) {
        var t = lines[j].trim();
        if (!t) continue;
        if (ENDIF_RE.test(t)) { ok = !!cur.elseLabel; break; }
        var em = ELSE_RE.exec(t);
        if (em) {
          if (branch === 'else') break;             // else が 2 つ = 解釈しない
          branch = 'else';
          cur.elseLabel = _s(em[1]).trim() || 'no';
          continue;
        }
        var am = ACTION_RE.exec(t);
        if (!am) break;                             // 入れ子や while が混ざる型は採らない
        (branch === 'then' ? cur.thenActions : cur.elseActions).push(_s(am[1]).trim());
      }
      if (ok && cur.cond && (cur.thenActions.length || cur.elseActions.length)) out.push(cur);
    }
    return out;
  }

  // docs: workspace.list() が返す [{ id, name, diagramType, dsl }]。
  // 編集中の図 (exceptId) は「過去の図」ではないので候補にしない。
  function harvest(docs, exceptId) {
    var out = [];
    var seen = {};
    (docs || []).forEach(function(d) {
      if (!d || d.diagramType !== 'plantuml-activity') return;
      if (exceptId != null && d.id === exceptId) return;
      harvestFrom(d.dsl, d.name).forEach(function(p) {
        var sig = signature(p);
        if (seen[sig]) return;
        seen[sig] = true;
        p.id = 'past-' + out.length;
        out.push(p);
      });
    });
    return out;
  }

  // 並びは「組み込み → 過去図」。過去図の型が組み込みと同じ形なら組み込みを残す。
  function patterns(docs, exceptId) {
    var out = builtins();
    var seen = {};
    out.forEach(function(p) { seen[signature(p)] = true; });
    harvest(docs, exceptId).forEach(function(p) {
      var sig = signature(p);
      if (seen[sig]) return;
      seen[sig] = true;
      out.push(p);
    });
    return out;
  }

  function byId(docs, exceptId, id) {
    var list = patterns(docs, exceptId);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // 一覧に出す 1 行の要約。「何が入るか」を読まずに選べる長さに切る。
  function summary(p) {
    if (!p) return '';
    var t = (p.thenActions || []).join(' / ');
    var e = (p.elseActions || []).join(' / ');
    return _s(p.cond) + ' → ' + _s(p.thenLabel) + ': ' + t + ' / ' + _s(p.elseLabel) + ': ' + e;
  }

  // 挿入する行のかたまり。indent は挿入位置の字下げ、枝の中はその 2 つ内側。
  // 空アクションの型でも枝が空にならないよう `:;` を 1 行置く。
  function linesFor(p, indent) {
    if (!p) return [];
    var ind = _s(indent);
    var inner = ind + '  ';
    var out = [];
    out.push(ind + 'if (' + _s(p.cond) + ') then (' + (_s(p.thenLabel) || 'yes') + ')');
    var th = (p.thenActions || []).filter(function(a) { return _s(a).trim(); });
    if (th.length) th.forEach(function(a) { out.push(inner + ':' + _s(a).trim() + ';'); });
    else out.push(inner + ':;');
    out.push(ind + 'else (' + (_s(p.elseLabel) || 'no') + ')');
    var el = (p.elseActions || []).filter(function(a) { return _s(a).trim(); });
    if (el.length) el.forEach(function(a) { out.push(inner + ':' + _s(a).trim() + ';'); });
    else out.push(inner + ':;');
    out.push(ind + 'endif');
    return out;
  }

  return {
    builtins: builtins,
    signature: signature,
    harvestFrom: harvestFrom,
    harvest: harvest,
    patterns: patterns,
    byId: byId,
    summary: summary,
    linesFor: linesFor,
  };
})();
