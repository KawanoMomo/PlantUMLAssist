'use strict';
window.MA = window.MA || {};

// part-board — 1 つの部品 (SPI) の 6 図種を、先輩と自分の 2 列で 1 画面に並べる。
//
// BLK-junior-20260915-0606-wish: 今の GUI は図 (ファイル) ごとにタブを開く作りなので、
// 1 部品の 6 図種を見比べるには毎回タブを行き来する。先輩のクラス図でメソッド名を
// 確かめてから自分の活動図に打ち直す、という手順は「タブ切替 → フィルタ → 名前を控える
// → タブ切替 → 打ち直す」の往復になり、図種をまたぐ参照のたびに繰り返される
// (BLK-junior-20260915-0606 の実測は タブ切替 2 + フィルタ 4 + 控え書き)。
//
// ここは kind-matrix と同じ材料 (自分のフォルダの一覧・覗いているフォルダの一覧) を
// 使って、行 = 図種、左 = 先輩の本文、右 = 自分の本文の表を組む。違うのは
// 「対応要否の印」ではなく本文そのものを並べること。先輩の欄からは名前帳
// (part-vocab) と同じ規則で名前を拾って出すので、控え書きは「押して挿す」に変わる。
//
// 部品の判定・図種の並びは kind-matrix / diagram-kind をそのまま借りる
// (同じ部品・同じ図種の数え方を 2 つ持たない)。DOM も fetch も触らない。
// 本文の読み込みと描画は app.js。
window.MA.partBoard = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _KM() { return window.MA.kindMatrix; }
  function _DK() { return window.MA.diagramKind; }
  function _PV() { return window.MA.partVocab; }

  function order() {
    var DK = _DK();
    return (DK && DK.ORDER) ? DK.ORDER.slice() : ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];
  }

  function kindLabel(slug) {
    var DK = _DK();
    return (DK && DK.label) ? (DK.label(slug) || _s(slug)) : _s(slug);
  }

  function nameOf(e) { return (e && typeof e === 'object') ? _s(e.name || e.type) : _s(e); }

  function kindOf(e) {
    if (!e || typeof e !== 'object') return '';
    return _s(e.savedKind) || _s(e.kind);
  }

  function textOf(e) {
    return (e && typeof e === 'object') ? _s(e.text || e.dsl) : '';
  }

  function partOf(name) {
    var KM = _KM();
    if (KM && KM.subjectOf) return KM.subjectOf(name);
    return nameOf(name).split(/[\s_\-.]+/)[0].toLowerCase();
  }

  // 選べる部品。自分と相手の両方から集める (どちらか片方にしか無い部品も並べる。
  // 「先輩にはあるが自分にまだ無い」を選べないと、起こす前に手本が読めない)。
  function parts(mine, theirs) {
    var KM = _KM();
    if (KM && KM.subjects) return KM.subjects(mine, theirs);
    return [];
  }

  // その部品・その図種の 1 枚を選ぶ。複数あれば名前の短い順 (相乗り図より
  // 部品ごとの図を先に出す) → 名前順で 1 枚目。
  function _pick(list, part, kind) {
    var hit = (list || []).filter(function(e) {
      if (kindOf(e) !== kind) return false;
      return partOf(e) === part;
    });
    hit.sort(function(a, b) {
      var an = nameOf(a), bn = nameOf(b);
      if (an.length !== bn.length) return an.length - bn.length;
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    return hit.length ? hit[0] : null;
  }

  // 相乗り図 (driver_common_class のような 8 部品 1 枚) は部品名で拾えないが、
  // その部品の名前が本文に出ていれば手本になる。自分のフォルダは本文つきで
  // 来るので、部品ごとの図が無い図種に限って本文で拾い直す。
  function _pickShared(list, part, kind) {
    var want = _s(part).toLowerCase();
    if (!want) return null;
    var re = new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    var hit = (list || []).filter(function(e) {
      return kindOf(e) === kind && re.test(textOf(e));
    });
    return hit.length ? hit[0] : null;
  }

  function _cell(entry, shared) {
    if (!entry) return { name: '', text: '', shared: false, missing: true };
    return { name: nameOf(entry), text: textOf(entry), shared: !!shared, missing: false };
  }

  function _side(list, part, kind) {
    var e = _pick(list, part, kind);
    if (e) return _cell(e, false);
    return _cell(_pickShared(list, part, kind), true);
  }

  // 部品 1 つぶんの表。行は 6 図種で固定 (無い図種も行として残す。
  // 「その図種はまだ無い」が画面から消えると、起こす所が分からなくなる)。
  function board(part, mine, theirs) {
    var p = _s(part).toLowerCase();
    var rows = order().map(function(kind) {
      var ref = _side(theirs, p, kind);
      var own = _side(mine, p, kind);
      return {
        kind: kind,
        label: kindLabel(kind),
        ref: ref,
        mine: own,
        state: (!ref.missing && own.missing) ? 'mine-missing'
          : (ref.missing && !own.missing) ? 'no-model'
          : (ref.missing && own.missing) ? 'none' : 'pair',
      };
    });
    return { part: p, rows: rows };
  }

  function counts(bd) {
    var c = { pair: 0, mineMissing: 0, noModel: 0, none: 0 };
    ((bd && bd.rows) || []).forEach(function(r) {
      if (r.state === 'pair') c.pair++;
      else if (r.state === 'mine-missing') c.mineMissing++;
      else if (r.state === 'no-model') c.noModel++;
      else c.none++;
    });
    return c;
  }

  function summary(bd) {
    if (!bd) return '';
    var c = counts(bd);
    var parts_ = [_s(bd.part).toUpperCase() + ': 6 図種のうち 手本と対 ' + c.pair];
    if (c.mineMissing) parts_.push('自分に無し ' + c.mineMissing);
    if (c.noModel) parts_.push('手本なし ' + c.noModel);
    if (c.none) parts_.push('どちらも無し ' + c.none);
    return parts_.join(' / ');
  }

  // 先輩の欄から拾う名前。役割ごとにまとめ、同じ綴りは 1 回だけ出す。
  // 並びは method → event → state → type (打ち写す側が探すのはまずメソッド名)。
  var ROLE_ORDER = ['method', 'event', 'state', 'type'];

  function names(dsl, kind) {
    var PV = _PV();
    if (!PV || !PV.namesIn) return [];
    var seen = {};
    var out = [];
    (PV.namesIn(dsl, kind) || []).forEach(function(n) {
      var key = n.role + '::' + n.name;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ name: n.name, role: n.role, roleLabel: PV.roleLabel ? PV.roleLabel(n.role) : n.role });
    });
    out.sort(function(a, b) {
      var ai = ROLE_ORDER.indexOf(a.role), bi = ROLE_ORDER.indexOf(b.role);
      if (ai !== bi) return (ai < 0 ? 9 : ai) - (bi < 0 ? 9 : bi);
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return out;
  }

  // 名前を押したときの差し込み。控え書き (紙に書き写して持ち歩く) を消すのが目的なので、
  // 装飾は付けず綴りだけを入れる。選択範囲があればそれを置き換える。
  function insertName(text, start, end, name) {
    var t = _s(text);
    var n = _s(name);
    var a = (typeof start === 'number' && start >= 0) ? Math.min(start, t.length) : t.length;
    var b = (typeof end === 'number' && end >= a) ? Math.min(end, t.length) : a;
    return { text: t.slice(0, a) + n + t.slice(b), caret: a + n.length };
  }

  // 画面に出す 1 行ぶんの見出し。どちらの欄が空かを文字でも言う
  // (色だけだと、行が 6 本あるとき「手本が無い」のか「読み込み中」なのか分からない)。
  function rowLabel(r) {
    if (!r) return '';
    if (r.state === 'pair') return r.label + ': ' + r.ref.name + ' → ' + r.mine.name;
    if (r.state === 'mine-missing') return r.label + ': 手本 ' + r.ref.name + ' / 自分にまだ無い';
    if (r.state === 'no-model') return r.label + ': 自分 ' + r.mine.name + ' / 手本なし';
    return r.label + ': どちらにも無い';
  }

  return {
    parts: parts,
    partOf: partOf,
    order: order,
    kindLabel: kindLabel,
    board: board,
    counts: counts,
    summary: summary,
    names: names,
    insertName: insertName,
    rowLabel: rowLabel,
  };
})();
