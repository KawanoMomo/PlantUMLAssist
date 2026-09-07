'use strict';
window.MA = window.MA || {};

// component-deps — ドライバのコンポーネント図で「定石の依存先のうち、この図に無いもの」を出す。
//
// BLK-junior-20260908-0203-wish: 「電源系との依存が抜けている」と指摘されても、
// ドライバの設計として他にどんな依存が定石なのか (電源・割り込み・クロック・ボード設定) を
// 知らないと自分では気づけない。今までは先輩の UART / CAN のコンポーネント図を 1 枚ずつ
// 開いて見比べるしかなく、手数が「他部品の図の枚数」に比例し、見落としも残った。
//
// ここは 2 つの出所から候補を集める。
//   定石 (catalog): ドライバなら普通ある依存先。図が 1 枚しか無くても出る。
//   実績 (peer):    開いている他のコンポーネント図で実際に依存先になっている名前。
//                   「先輩の図と見比べる」をそのまま機械にやらせる部分。
// 出すのは「この図に無いもの」だけ。既にある依存を並べても棚卸しにならない。
//
// 名前の一致はゆるく見る (Power_Ctrl / PowerCtrl / PWR_Manager は同じ依存先)。
// 厳密に見ると「表記が違うだけで既にある依存」を欠けとして出してしまい、
// 追加すると同じ相手が 2 つ並ぶ。DOM には触らない。表示と結線は modules/component.js。
window.MA.componentDeps = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // 表記ゆれを吸収した比較用の形。区切りと大小を落とす。
  function normName(s) {
    return _s(s).toLowerCase().replace(/[^a-z0-9぀-ヿ一-鿿]/g, '');
  }

  // 定石の依存先。name は図に書き込む名前、aliases は「もう在る」と見なす別表記。
  // why はチェックリストに添える理由 — 候補が出た訳が読めないと、
  // 「言われたから足す」になって図が意味の無い矢印で埋まる。
  var CATALOG = [
    {
      id: 'power', name: 'Power_Ctrl', label: '電源制御',
      why: '動作前の電源ドメイン投入と低消費電力状態への遷移を要求するため',
      aliases: ['power', 'powerctrl', 'powermanager', 'pwr', 'pwrctrl', 'pmu', '電源'],
    },
    {
      id: 'irq', name: 'IrqCtrl', label: '割り込み制御',
      why: '完了・エラーの通知を割り込みで受けるドライバは割り込み設定を依頼するため',
      aliases: ['irq', 'irqctrl', 'interrupt', 'interruptctrl', 'nvic', 'intc', '割り込み'],
    },
    {
      id: 'clock', name: 'Clock_Ctrl', label: 'クロック制御',
      why: '周辺の動作クロックの供給と分周設定に依存するため',
      aliases: ['clock', 'clockctrl', 'clk', 'clkctrl', 'mcuclock', 'クロック'],
    },
    {
      id: 'board', name: 'Board_Cfg', label: 'ボード設定',
      why: 'ピン割り当て・外部部品の実装差をボード設定から受け取るため',
      aliases: ['board', 'boardcfg', 'boardconfig', 'pincfg', 'portcfg', 'ボード設定'],
    },
    {
      id: 'det', name: 'Det', label: 'エラー通知',
      why: '引数異常・状態異常を検出したときの通報先が要るため',
      aliases: ['det', 'errorhandler', 'errreport', 'dem', 'diag', 'エラー通知'],
    },
    {
      id: 'schm', name: 'SchM', label: '排他制御',
      why: '割り込みとタスクから同じレジスタを触るドライバは排他区間を依頼するため',
      aliases: ['schm', 'exclusive', 'criticalsection', 'osif', 'mutex', '排他'],
    },
  ];

  function catalog() { return CATALOG.slice(); }

  function findEntry(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return null;
  }

  function _parse(dsl) {
    var mod = window.MA.modules && window.MA.modules.plantumlComponent;
    if (!mod || !_s(dsl).trim()) return { elements: [], relations: [] };
    var p = mod.parse(_s(dsl));
    return { elements: p.elements || [], relations: p.relations || [] };
  }

  // 図に出てくる名前全部 (要素の別名・表示名と、関係の両端)。
  // 関係行にしか出ない名前も PlantUML では要素なので、依存の有無はここで見る。
  function namesIn(dsl) {
    var p = _parse(dsl);
    var out = [];
    var seen = {};
    function push(n) {
      var t = _s(n).trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    }
    p.elements.forEach(function(e) { push(e.id); push(e.label); });
    p.relations.forEach(function(r) { push(r.from); push(r.to); });
    return out;
  }

  // 名前を語に割る。`PWR_MANAGER` `PowerCtrl` `power-ctrl` はどれも 2 語。
  // 短い別表記 (pwr / det) は語として合ったときだけ拾いたい —
  // 中に含まれるだけで拾うと Detector が Det になる。
  function _tokens(s) {
    return _s(s)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9぀-ヿ一-鿿]+/)
      .map(normName)
      .filter(function(t) { return !!t; });
  }

  function _isAscii(s) { return /^[a-z0-9]*$/.test(s); }

  // 定石 1 件がこの図に既にあるか。別表記も同じものと見なす。
  // 部分一致を許すのは 4 文字以上の英数の別表記と、2 文字以上の日本語だけ。
  // 日本語は語の区切りが無いので「電源管理」の中の「電源」を拾う必要がある。
  function hasEntry(names, entry) {
    var keys = [entry.name].concat(entry.aliases || []).map(normName)
      .filter(function(k) { return !!k; });
    var list = names || [];
    for (var i = 0; i < list.length; i++) {
      var norm = normName(list[i]);
      var toks = _tokens(list[i]);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (norm === k || toks.indexOf(k) >= 0) return true;
        var long = _isAscii(k) ? k.length >= 4 : k.length >= 2;
        if (long && norm.indexOf(k) >= 0) return true;
      }
    }
    return false;
  }

  // 「依存の主体」の候補。出ていく関係が多い順 — ドライバ本体は普通いちばん
  // 多くの相手を使う側なので、選び直さずに済むことが多い。
  function subjects(dsl) {
    var p = _parse(dsl);
    var out = [];
    var byId = {};
    p.elements.forEach(function(e) {
      if (e.kind !== 'component') return;
      var row = { id: e.id, label: e.label || e.id, outCount: 0 };
      byId[e.id] = row;
      out.push(row);
    });
    p.relations.forEach(function(r) {
      if (byId[r.from]) byId[r.from].outCount++;
    });
    out.sort(function(a, b) { return b.outCount - a.outCount; });
    return out;
  }

  function defaultSubject(dsl) {
    var list = subjects(dsl);
    return list.length ? list[0].id : '';
  }

  // 他のコンポーネント図で実際に依存先になっている名前。
  // 見るのは「出ていく関係の相手」だけ — 使われる側の名前が定石なので、
  // 主体側 (ドライバ本体の名前) を候補に出しても足す意味が無い。
  function peerTargets(docs, exceptId) {
    var acc = {};
    (docs || []).forEach(function(d) {
      if (!d || d.diagramType !== 'plantuml-component') return;
      if (exceptId != null && d.id === exceptId) return;
      var dsl = window.MA.dslUtils ? window.MA.dslUtils.docDsl(d) : _s(d.dsl);
      var p = _parse(dsl);
      var here = {};
      p.relations.forEach(function(r) {
        var to = _s(r.to).trim();
        if (!to || here[to]) return;
        here[to] = true;
        var k = normName(to);
        if (!k) return;
        if (!acc[k]) acc[k] = { name: to, docs: [], count: 0 };
        acc[k].count++;
        acc[k].docs.push(_s(d.name));
      });
    });
    return Object.keys(acc).map(function(k) { return acc[k]; })
      .sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }

  // チェックリスト本体。
  // rows: この図に無い候補 (定石が先、実績が後)。present: 既にある定石。
  function check(dsl, docs, exceptId) {
    var names = namesIn(dsl);
    var rows = [];
    var present = [];
    var takenKeys = {};

    CATALOG.forEach(function(e) {
      var row = {
        key: 'cat:' + e.id, source: 'catalog', id: e.id, name: e.name,
        label: e.label, why: e.why, docs: [],
      };
      [e.name].concat(e.aliases || []).forEach(function(a) {
        var k = normName(a);
        if (k) takenKeys[k] = true;
      });
      if (hasEntry(names, e)) present.push(row);
      else rows.push(row);
    });

    var have = {};
    names.forEach(function(n) { have[normName(n)] = true; });

    peerTargets(docs, exceptId).forEach(function(t) {
      var k = normName(t.name);
      if (!k || have[k] || takenKeys[k]) return;
      takenKeys[k] = true;
      rows.push({
        key: 'peer:' + t.name, source: 'peer', id: t.name, name: t.name,
        label: t.name, docs: t.docs,
        why: '他の図 ' + t.docs.length + ' 枚 (' + t.docs.join(' / ') + ') で依存先になっています',
      });
    });

    return {
      rows: rows, present: present,
      catalogMissing: rows.filter(function(r) { return r.source === 'catalog'; }).length,
      peerMissing: rows.filter(function(r) { return r.source === 'peer'; }).length,
    };
  }

  function findRow(res, key) {
    var rows = (res && res.rows) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i];
    return null;
  }

  // 選んだ候補を、component.js の一括入力がそのまま読める行にする。
  // 宣言を先に、依存の矢印を後に — 一括側が同じ順で処理するので、
  // 名前の正規化 (別名の衝突回避) がそのまま矢印にも効く。
  function blockFor(subject, rows) {
    var subj = _s(subject).trim();
    var list = (rows || []).filter(function(r) { return r && _s(r.name).trim(); });
    if (!subj || !list.length) return '';
    var decl = list.map(function(r) { return 'component ' + _s(r.name).trim(); });
    var rel = list.map(function(r) {
      return subj + ' ..> ' + _s(r.name).trim() + ' : ' + (r.source === 'peer' ? '依存' : r.label);
    });
    return decl.concat(rel).join('\n');
  }

  // 見出し 1 行。「まだ見るところがあるのか」がここだけで分かるようにする。
  function summaryText(res) {
    if (!res) return '';
    if (!res.rows.length) {
      return '定石の依存先はすべて図にあります (' + res.present.length + ' 件)';
    }
    var parts = [];
    if (res.catalogMissing) parts.push('定石 ' + res.catalogMissing + ' 件');
    if (res.peerMissing) parts.push('他の図にあって無い依存 ' + res.peerMissing + ' 件');
    return '図に無い依存先: ' + parts.join(' / ')
      + ' (既にある定石 ' + res.present.length + ' 件)';
  }

  return {
    CATALOG: CATALOG,
    catalog: catalog,
    findEntry: findEntry,
    normName: normName,
    namesIn: namesIn,
    hasEntry: hasEntry,
    subjects: subjects,
    defaultSubject: defaultSubject,
    peerTargets: peerTargets,
    check: check,
    findRow: findRow,
    blockFor: blockFor,
    summaryText: summaryText,
  };
})();
