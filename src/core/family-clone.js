'use strict';
window.MA = window.MA || {};

// family-clone — 同じ系統の図を「1 セット」として選び、対応表を 1 回だけ入れて
// 全部まとめて別の題材に複製する。
//
// BLK-junior-20260907-1203-wish: 題材替え (GPIO → UART) は 6 図種ぶん、
// 「先輩の図を開く → テンプレートを選ぶ → 置換元と置換先を打つ → 作る」を
// 図種の数だけ繰り返していた。系統でまとまった 1 セットに対して対応表を 1 回
// 入れれば、6 枚が 1 操作で揃う。
//
// 系統の切り分けは family-audit の familyKeyOf (図の名前の頭) をそのまま使う。
// 置換は template-new の instantiateAll (大小の族ごと・語の頭一致) をそのまま使う。
// ここは DOM に触らない。
window.MA.familyClone = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _fa() { return window.MA.familyAudit; }
  function _tn() { return window.MA.templateNew; }

  function _baseName(name) {
    return _s(name).replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // groups: 図を系統ごとに束ねる。1 枚しかない系統も「セット」として出す
  // (1 枚から始まった系統でも、題材替えの起点にはなる)。
  // 枚数の多い順、同数なら系統名の順。
  function groups(docs) {
    var fa = _fa();
    if (!fa) return [];
    var map = {};
    var order = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || !d.name) return;
      var key = fa.familyKeyOf(d.name);
      if (!key) return;
      if (!map[key]) { map[key] = { key: key, docs: [], types: [] }; order.push(key); }
      map[key].docs.push(d);
      var t = _s(d.diagramType);
      if (t && map[key].types.indexOf(t) < 0) map[key].types.push(t);
    });
    return order.map(function(k) { return map[k]; }).sort(function(a, b) {
      return b.docs.length - a.docs.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    });
  }

  // groupLabel: セット 1 行の見出し。何枚あって、どの図種が揃っているか。
  function groupLabel(group) {
    if (!group) return '';
    return group.key + ' — ' + group.docs.length + ' 枚'
      + (group.types.length ? ' (' + group.types.map(shortType).join(' / ') + ')' : '');
  }

  var TYPE_SHORT = {
    'plantuml-sequence': 'シーケンス',
    'plantuml-state': '状態遷移',
    'plantuml-class': 'クラス',
    'plantuml-activity': 'アクティビティ',
    'plantuml-component': 'コンポーネント',
    'plantuml-usecase': 'ユースケース',
  };

  function shortType(t) {
    return TYPE_SHORT[_s(t)] || _s(t);
  }

  // suggestFrom: 置換元の既定。系統キー (uart) ではなく、図の中で実際に使われている
  // 綴り (Uart) を出す。打ち直させないための欄の初期値。
  function suggestFrom(group) {
    if (!group || !group.docs.length) return '';
    var tn = _tn();
    var key = _s(group.key).toLowerCase();
    if (tn) {
      var all = group.docs.map(function(d) { return _s(d.dsl); }).join('\n');
      var hits = (tn.candidates(all) || []).filter(function(c) {
        return _s(c.name).toLowerCase().indexOf(key) === 0;
      });
      // 系統の頭そのもの (Gpio) を最優先。GpioHal のような一族の 1 人を選ぶと、
      // その 1 人しか題材替えされない。同じ長さなら出現数の多いほうを採る。
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].name.toLowerCase() === key) return hits[i].name;
      }
      if (hits.length) {
        return hits.slice().sort(function(a, b) {
          return a.name.length - b.name.length || b.count - a.count;
        })[0].name;
      }
    }
    // DSL から拾えないときは図の名前の頭をそのまま使う。
    var head = _baseName(group.docs[0].name).split(/[\s_\-.]+/)[0];
    return head || group.key;
  }

  // 名前がぶつからないようにする。既にある名前と、この計画の中で先に決まった名前の両方を見る。
  function _uniqueName(name, taken) {
    var base = _s(name) || 'diagram';
    if (!taken[base.toLowerCase()]) return base;
    var n = 2;
    while (taken[(base + '-' + n).toLowerCase()]) n++;
    return base + '-' + n;
  }

  // plan: セットと対応表から「何がどんな名前で作られるか」を全部先に出す。
  // pairs は [{from, to}]。1 組目が図の名前の付け替えにも使われる。
  // existingNames は既にある図の名前 (タブ + 保存フォルダ)。
  function plan(group, pairs, existingNames) {
    var tn = _tn();
    var out = { key: group ? group.key : '', items: [], docs: 0, changed: 0, remaining: 0, ready: false };
    if (!group || !tn) return out;
    var ps = (pairs || []).filter(function(p) { return p && p.from && p.to; });
    var taken = {};
    (existingNames || []).forEach(function(n) { taken[_s(n).replace(/\.puml$/i, '').toLowerCase()] = true; });

    group.docs.forEach(function(d) {
      var before = _s(d.dsl);
      var after = ps.length ? tn.instantiateAll(before, ps) : before;
      var beforeLines = before.split('\n');
      var afterLines = after.split('\n');
      var changed = 0;
      for (var i = 0; i < beforeLines.length; i++) {
        if (beforeLines[i] !== afterLines[i]) changed++;
      }
      var name = ps.length
        ? tn.suggestName(_baseName(d.name), ps[0].from, ps[0].to)
        : _baseName(d.name);
      name = _uniqueName(name, taken);
      taken[name.toLowerCase()] = true;
      var remaining = ps.length ? tn.remainingNames(before, after) : [];
      out.items.push({
        sourceName: _baseName(d.name),
        name: name,
        diagramType: _s(d.diagramType),
        dsl: after,
        changed: changed,
        remaining: remaining,
      });
      out.docs++;
      out.changed += changed;
      out.remaining += remaining.length;
    });
    // 1 枚でも「1 行も変わらない」図があれば、その図には置換元が出てこない。
    // 気付かずに複製すると元の題材の図がもう 1 枚増えるだけなので、作らせない。
    var allTouched = out.items.length > 0 && out.items.every(function(it) { return it.changed > 0; });
    out.untouched = out.items.filter(function(it) { return it.changed === 0; })
      .map(function(it) { return it.sourceName; });
    out.hasPairs = ps.length > 0;
    // 置換元が出てこない図があるときだけ止める。そのまま残る名前 (App のような
    // 題材に依らない相手役) は、対応表に足すかどうかを利用者が決めればよく、
    // ここで止めると「1 操作で 6 枚」という目的が崩れる。
    out.ready = ps.length > 0 && allTouched;
    return out;
  }

  // summaryText: 確定ボタンの上に出す 1 行。作る枚数と、止まっている理由。
  function summaryText(p) {
    if (!p || !p.docs) return 'セットを選ぶと、複製する図がここに並びます';
    if (!p.items.length) return 'セットを選ぶと、複製する図がここに並びます';
    if (!p.hasPairs) return '置換元と置換先を入れると、作る図がここに並びます';
    if (p.untouched && p.untouched.length) {
      return '置換元が出てこない図があります: ' + p.untouched.join(', ');
    }
    if (!p.ready) return '置換元と置換先を入れると、作る図がここに並びます';
    var head = p.docs + ' 枚を作ります (' + p.changed + ' 行が変わります)';
    if (p.remaining) {
      head += '。元の名前のまま残る部品が ' + remainingNames(p).length
        + ' 件あります: ' + remainingNames(p).join(', ');
    }
    return head;
  }

  // 対応表に足すべき名前。1 組目を当てたあとに残った宣言名を、重複なく挙げる。
  function remainingNames(p) {
    var seen = {};
    var out = [];
    ((p && p.items) || []).forEach(function(it) {
      (it.remaining || []).forEach(function(n) {
        if (seen[n]) return;
        seen[n] = true;
        out.push(n);
      });
    });
    return out;
  }

  return {
    groups: groups,
    groupLabel: groupLabel,
    shortType: shortType,
    suggestFrom: suggestFrom,
    plan: plan,
    summaryText: summaryText,
    remainingNames: remainingNames,
  };
})();
