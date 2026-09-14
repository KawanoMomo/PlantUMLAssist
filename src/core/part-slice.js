'use strict';
window.MA = window.MA || {};

// part-slice — 複合クラス図から、1 つの部品に関わる所だけを切り出す。
//
// BLK-junior-20260914-1006-wish: 先輩 (primary) は GPIO 単独のクラス図を持たず、
// `driver_common_class.puml` (共通基底 + Spi/Can/Gpio/Uart/Timer/Adc の 8 クラス)
// にまとめている。junior が見たいのは Gpio の所だけなのに、並べて見る機能は
// ファイル名で対をなすため (`GpioDrv派生クラス図` ⇔ `driver_common_class`) この組は
// 自動では並ばず、複合図を開いて Gpio_Driver を目で探すしかなかった。
// 複合図が部品を増やすほど、この探索が毎回起きる。
//
// 部品名を 1 つ選べば、その部品のクラス・継承の元・直接つながる相手だけを残した
// 図を作る。残す相手のメンバも、別の部品の接頭辞を持つものは落とす
// (IRQCtrl の `Spi_*` は Gpio を読むときには要らない)。どの部品のものでもない
// メンバ (EnableIrq 等) は落とさない。
//
// DOM も fetch も触らない (切り出しと組み方だけ)。表示は app.js。
window.MA.partSlice = (function() {

  var CLASS_RE = /^\s*(?:abstract\s+|static\s+)?(?:class|entity|interface|abstract)\s+([A-Za-z0-9_]+)/;
  var REL_RE = /^\s*([A-Za-z0-9_]+)\s*([-.|<>o*+#]{2,})\s*([A-Za-z0-9_]+)\s*(?::.*)?$/;

  function _s(v) { return v == null ? '' : String(v); }

  function _lines(dsl) { return _s(dsl).split(/\r?\n/); }

  // 部品名の引き。`Gpio_Driver` も `GpioDrv` も `gpio` に寄せる
  // (図ごとに `_Driver` / `Drv` / 無しが混ざるため)。
  function partKey(name) {
    var s = _s(name).toLowerCase().replace(/[\s_\-.]+/g, '');
    s = s.replace(/(driver|drv|module|mod)$/, '');
    return s;
  }

  // ── 読み取り ──────────────────────────────────────────────────────────
  function classesOf(dsl) {
    var out = [];
    var cur = null;
    _lines(dsl).forEach(function(line, i) {
      if (cur) {
        if (/^\s*\}/.test(line)) { cur.end = i; cur = null; return; }
        var mem = line.replace(/^\s*[+\-#~]\s*/, '').trim();
        if (mem) cur.members.push({ line: i, text: mem });
        return;
      }
      var m = line.match(CLASS_RE);
      if (!m) return;
      cur = { name: m[1], start: i, end: i, members: [], open: /\{\s*$/.test(line) };
      out.push(cur);
      if (!cur.open) { cur.end = i; cur = null; }
    });
    return out;
  }

  function relationsOf(dsl) {
    var names = {};
    classesOf(dsl).forEach(function(c) { names[c.name] = true; });
    var out = [];
    _lines(dsl).forEach(function(line, i) {
      if (CLASS_RE.test(line)) return;
      var m = line.match(REL_RE);
      if (!m) return;
      var a = m[1], arrow = m[2], b = m[3];
      if (!names[a] || !names[b]) return;
      var kind = 'assoc', from = a, to = b;
      if (arrow.indexOf('|>') >= 0) kind = 'extends';
      else if (arrow.indexOf('<|') >= 0) { kind = 'extends'; from = b; to = a; }
      out.push({ line: i, from: from, to: to, kind: kind, raw: line });
    });
    return out;
  }

  // ── 部品 ──────────────────────────────────────────────────────────────
  // 部品 = 継承の子。子が 1 つも無ければクラスそのものを部品とみなす
  // (継承の無い並びの図でも切り出しは効く)。基底は部品にしない。
  function parts(dsl) {
    var cls = classesOf(dsl);
    var rels = relationsOf(dsl);
    var isBase = {}, isChild = {};
    rels.forEach(function(r) {
      if (r.kind !== 'extends') return;
      isChild[r.from] = true;
      isBase[r.to] = true;
    });
    var pick = cls.filter(function(c) { return isChild[c.name]; });
    if (!pick.length) pick = cls.filter(function(c) { return !isBase[c.name]; });
    return pick.map(function(c) {
      return { name: c.name, key: partKey(c.name), methods: c.members.length };
    });
  }

  // 「1 枚に複数の部品が同居している図」。2 つ以上の部品があればそう扱う。
  function isComposite(dsl) {
    return parts(dsl).length >= 2;
  }

  function findPart(dsl, part) {
    var key = partKey(part);
    var list = parts(dsl);
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === _s(part) || list[i].key === key) return list[i];
    }
    return null;
  }

  // ── 切り出し ──────────────────────────────────────────────────────────
  // メンバの接頭辞が他の部品のものなら落とす (`Spi_Transmit` は Gpio の図に要らない)。
  // どの部品にも属さないメンバ (`EnableIrq`) は残す — 落とすと基底の役目が読めなくなる。
  function _memberOwner(text, keys) {
    var name = _s(text).replace(/^[+\-#~]\s*/, '').split('(')[0].trim();
    var head = name.split('_')[0];
    var k = partKey(head);
    return keys[k] ? k : '';
  }

  function slice(dsl, part) {
    var target = findPart(dsl, part);
    if (!target) return null;
    var cls = classesOf(dsl);
    var rels = relationsOf(dsl);
    var byName = {};
    cls.forEach(function(c) { byName[c.name] = c; });

    var keep = {};
    keep[target.name] = true;
    // 継承の元をたどる (基底の基底まで)。
    var moved = true;
    while (moved) {
      moved = false;
      rels.forEach(function(r) {
        if (r.kind !== 'extends') return;
        if (keep[r.from] && !keep[r.to]) { keep[r.to] = true; moved = true; }
      });
    }
    // 部品クラスが直接つながる相手 (継承以外)。
    rels.forEach(function(r) {
      if (r.kind === 'extends') return;
      if (r.from === target.name) keep[r.to] = true;
      if (r.to === target.name) keep[r.from] = true;
    });

    var otherKeys = {};
    parts(dsl).forEach(function(p) {
      if (p.key !== target.key) otherKeys[p.key] = true;
    });

    var dropRel = {}, dropClassLine = {}, keepMember = {};
    rels.forEach(function(r) {
      if (!keep[r.from] || !keep[r.to]) dropRel[r.line] = true;
    });
    cls.forEach(function(c) {
      if (!keep[c.name]) { for (var i = c.start; i <= c.end; i++) dropClassLine[i] = true; return; }
      c.members.forEach(function(m) {
        var owner = c.name === target.name ? '' : _memberOwner(m.text, otherKeys);
        keepMember[m.line] = !owner;
      });
    });

    var out = [];
    var dropped = [];
    cls.forEach(function(c) { if (!keep[c.name]) dropped.push(c.name); });
    _lines(dsl).forEach(function(line, i) {
      if (dropClassLine[i]) return;
      if (dropRel[i]) return;
      if (keepMember.hasOwnProperty(i) && !keepMember[i]) return;
      out.push(line);
    });

    var kept = cls.filter(function(c) { return keep[c.name]; }).map(function(c) { return c.name; });
    return { dsl: out.join('\n'), part: target, kept: kept, dropped: dropped };
  }

  // 切り出した中身を 1 行で言う。押す前に「何が残るか」が読める。
  function sliceLabel(res) {
    if (!res) return '';
    return res.part.name + ': ' + res.kept.length + ' クラス'
      + (res.dropped.length ? ' (' + res.dropped.length + ' クラスを外しました)' : '');
  }

  // ── 自分側の図を探す ──────────────────────────────────────────────────
  // ファイル名が対をなさないのがこの穴の元なので、名前は手掛かりにするだけで
  // 決め手にはしない。名前で順を付けて数枚だけ読み、本文にその部品のクラスが
  // 有るものを採る (無ければ「自分の図が見つからない」と言い切る)。
  function candidates(names, part, opts) {
    var key = partKey(part);
    var lim = (opts && opts.limit) || 5;
    var scored = [];
    (names || []).forEach(function(n) {
      var base = _s(n).replace(/\.(puml|plantuml|uml|txt)$/i, '');
      var norm = partKey(base);
      // 部品名を名前に含まないものは候補にしない (名前は手掛かり。
      // 含まない図まで読みに行くと、読み込みが保存フォルダの枚数ぶんに膨らむ)。
      if (!key || norm.indexOf(key) < 0) return;
      var score = 4;
      if (/クラス|class/i.test(base)) score += 3;
      if (/派生|derive|drv/i.test(base)) score += 1;
      if (/資料用/.test(base)) score += 1;
      if (/^plantuml-/.test(base)) score -= 3;      // 同梱サンプル
      if (score <= 0) return;
      scored.push({ name: n, score: score });
    });
    scored.sort(function(a, b) {
      return b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    return scored.slice(0, lim).map(function(x) { return x.name; });
  }

  // ── 相手のフォルダから「その部品が載っている図」を探す ────────────────
  // BLK-junior-20260914-1006: 自分の図と先輩の図はファイル名が対をなさないので
  // (`GpioDrv派生クラス図(資料用)` ⇔ `driver_common_class`)、「本当に見るべき
  // 先輩の図はこれで合っているか」を複合図を開いて目で確かめるしかなかった。
  // 自分の図の部品名で相手のフォルダの本文を引き、載っている図を名指しする。
  function findInFolder(docs, parts_) {
    var want = (Array.isArray(parts_) ? parts_ : [parts_]).map(function(p) {
      return { name: _s(p), key: partKey(p) };
    }).filter(function(p) { return p.key; });
    if (!want.length) return [];
    var out = [];
    (docs || []).forEach(function(d) {
      if (!d || !_s(d.dsl)) return;
      var cls = classesOf(d.dsl);
      if (!cls.length) return;
      want.forEach(function(p) {
        var hit = null;
        cls.forEach(function(c) { if (!hit && partKey(c.name) === p.key) hit = c.name; });
        if (!hit) return;
        out.push({
          name: _s(d.name), mine: p.name, part: hit,
          composite: isComposite(d.dsl), classes: cls.length,
        });
      });
    });
    // 複合図を先に出す (単独図が既にあるならそれが先、という並べ方では
    // 「どちらを見るか」がまた読む側の判断になる。件数の多い方を先に置かない)。
    out.sort(function(a, b) {
      if (a.mine !== b.mine) return a.mine < b.mine ? -1 : 1;
      if (a.composite !== b.composite) return a.composite ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return out;
  }

  function foundLabel(hit) {
    if (!hit) return '';
    return hit.part + ' は ' + hit.name
      + (hit.composite ? ' (複合図・' + hit.classes + ' クラス) にあります' : ' (単独図) にあります');
  }

  // 読んだ候補のうち、その部品のクラスを本文に持つ 1 枚。
  function pickOwn(docs, part) {
    var key = partKey(part);
    var list = (docs || []).filter(function(d) { return d && _s(d.dsl); });
    for (var i = 0; i < list.length; i++) {
      var hit = classesOf(list[i].dsl).some(function(c) { return partKey(c.name) === key; });
      if (hit) return list[i];
    }
    return null;
  }

  return {
    partKey: partKey,
    classesOf: classesOf,
    relationsOf: relationsOf,
    parts: parts,
    isComposite: isComposite,
    findPart: findPart,
    slice: slice,
    sliceLabel: sliceLabel,
    candidates: candidates,
    pickOwn: pickOwn,
    findInFolder: findInFolder,
    foundLabel: foundLabel,
  };
})();
