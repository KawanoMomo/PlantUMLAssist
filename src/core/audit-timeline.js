'use strict';

// audit-timeline — 監査の指摘を「欠陥の実体」で追い、run をまたいで
// どのカテゴリに分類されていたかを 1 本の帯に並べる。
//
// BLK-reviewer-20260907-2303-wish: audit-diff は指摘 1 件に安定 id を与えたが、
// その id はカテゴリごとに形が違う (メソッドは `no-method:Adc.Adc_Ack`、粒度は
// `adc:Adc_Ack@...`)。監査ツール側が同じ欠陥を別カテゴリへ移すと、
// 「メソッドから 4 件消えて粒度に 4 件増えた」= 解消 4 件・新規 4 件に見える。
// DSL が 1 行も変わっていない run でも件数が動くので、reviewer は run ごとに
// node -e で JSON を開いて中身を突き合わせるしかなかった。
//
// そこで、カテゴリに依らない「欠陥の実体 id」(誰の・何が) を別に作る。
// メソッド突合の Adc.Adc_Ack と粒度の adc:Adc_Ack は同じ実体として 1 行に並び、
// 「解消」ではなく「再分類」として出る。
//
// DOM には触らない。描画と結線は app.js。node からも require できる
// (tools/audit-diff が id 生成をここから借りる)。
(function() {
  // 画面と同じ呼び名。カテゴリ名そのものが差分の単位になる。
  var CATEGORY = {
    'name.variants': '名前/表記揺れ',
    'name.undeclared': '名前/宣言なし',
    'method.issues': 'メソッド',
    'consistency.naming': '整合/命名',
    'consistency.unused': '整合/未使用',
    'consistency.methods': '整合/メソッド',
    'consistency.granularity': '整合/粒度',
    'consistency.events': '整合/イベント',
    'family.mismatches': '系統/食い違い',
    'trace.missing': 'トレース/漏れ',
    // BLK-reviewer-20260907-2303: 「除外した」も 1 つのカテゴリとして数える。
    // 除外は指摘を消すことではなく別の箱へ移すことなので、箱を数えていないと
    // 「移った」が「解消した」に見え、件数表を見た側が図を疑う羽目になる。
    'consistency.methodReplies': '整合/メソッド(応答として除外)',
    'trace.outOfScope': 'トレース/除外',
    // BLK-reviewer-20260908-0823-wish: DSL ではなく出力物の欠落。直し方が
    // 「図を直す」ではなく「書き出す」なので、指摘とは別カテゴリで数える。
    'svg.missing': '出力物/SVG 無',
    'svg.stale': '出力物/SVG 古',
  };

  // 除外バケツ。ここへ移った指摘は「消えた」ではなく「見ないことにした」。
  var EXCLUDED = {
    'consistency.methodReplies': true,
    'trace.outOfScope': true,
  };

  // 除外の理由を人の言葉に。trace の outOfScope だけが reason を持つ。
  var REASON = {
    grain: '粒度違い',
    declared: '宣言により対象外',
  };

  function _s(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.slice().sort().join('|');
    return String(v);
  }

  // 指摘 1 件の id。同じ指摘が別 run でも同じ文字列になるように、
  // 「どこの何が」を決めている項目だけを並べる (件数や順序は入れない)。
  function itemId(kind, item) {
    var it = item || {};
    switch (kind) {
      case 'name.variants': return _s(it.key || it.suggested);
      case 'name.undeclared': return _s(it.name) + '@' + _s(it.doc || it.docs);
      // 引数の数は「同じメソッドの別シグネチャ」を分ける材料だが、無いときは
      // 付けない (画面に出る id が `Adc.Adc_Ack/` のように尻切れに見えるため)。
      case 'method.issues': return _s(it.kind) + ':' + _s(it.owner) + '.' + _s(it.method)
        + (it.args === undefined || it.args === null || it.args === '' ? '' : '/' + _s(it.args));
      case 'consistency.naming': return _s(it.name) + '→' + _s(it.expected);
      case 'consistency.unused': return _s(it.name) + '@' + _s(it.doc);
      // 整合/メソッドの実体は { doc, target, method } で cls / owner を持たない。
      // target と doc を見ないと全件が `Ack@` に潰れ、増減がまるごと見えなくなる。
      case 'consistency.methods':
      case 'consistency.methodReplies': return _s(it.method || it.name) + '@'
        + _s(it.target || it.cls || it.owner) + (it.doc ? '@' + _s(it.doc) : '');
      case 'consistency.granularity': return _s(it.family) + ':' + _s(it.label) + '@' + _s(it.onlyIn);
      case 'consistency.events': return _s(it.event) + '@' + _s(it.cls || it.owner);
      case 'family.mismatches': return _s(it.family) + ':' + _s(it.key || it.label);
      case 'trace.missing':
      case 'trace.outOfScope': return _s(it.family) + ':' + _s(it.from) + '→' + _s(it.to) + ':' + _s(it.label || it.event);
      case 'svg.missing':
      case 'svg.stale': return _s(it.name);
      default: return JSON.stringify(it);
    }
  }

  // ---- 欠陥の実体 id -------------------------------------------------------

  // 名寄せ。同じ物が run ごとに `Adc` / `adc` / `Adc_Driver` と書かれるので、
  // 大小と区切り記号を落とし、駆動系の接尾辞だけ剥がす。それ以上は畳まない
  // (畳みすぎると別の欠陥まで 1 行にまとまり、再分類と読めなくなる)。
  function norm(v) {
    var s = _s(v).toLowerCase().replace(/[^a-z0-9]/g, '');
    s = s.replace(/(driver|drv|module|mod)$/, '');
    return s;
  }

  // カテゴリに依らない「誰の・何が」。カテゴリが変わっても同じ文字列になる。
  // 主語が取れない指摘 (表記揺れなど) は目的語だけで数える。
  function entitySubject(kind, it) {
    switch (kind) {
      case 'method.issues': return it.owner || it.cls;
      // 実体は target に入る (cls / owner は持たない)。ここを見ないと主語が
      // 空になり、除外バケツへ移った同じメソッドと結び付かない。
      case 'consistency.methods':
      case 'consistency.methodReplies': return it.target || it.cls || it.owner;
      case 'consistency.events': return it.cls || it.owner;
      case 'consistency.granularity': return it.family;
      case 'family.mismatches': return it.family;
      case 'trace.missing':
      case 'trace.outOfScope': return it.family;
      case 'consistency.unused': return it.doc;
      case 'name.undeclared': return it.doc || it.docs;
      case 'svg.missing':
      case 'svg.stale': return it.name;
      default: return '';
    }
  }

  function entityLabel(kind, it) {
    switch (kind) {
      case 'method.issues': return it.method;
      case 'consistency.methods':
      case 'consistency.methodReplies': return it.method || it.name;
      case 'consistency.events': return it.event;
      case 'consistency.granularity': return it.label;
      case 'family.mismatches': return it.key || it.label;
      case 'trace.missing':
      case 'trace.outOfScope': return it.label || it.event;
      case 'consistency.naming': return it.name;
      case 'consistency.unused': return it.name;
      case 'name.variants': return it.key || it.suggested;
      case 'name.undeclared': return it.name;
      case 'svg.missing': return 'SVG 無';
      case 'svg.stale': return 'SVG 古';
      default: return '';
    }
  }

  function entityId(kind, item) {
    var it = item || {};
    var subj = norm(entitySubject(kind, it));
    var label = norm(entityLabel(kind, it));
    if (!subj && !label) return 'x:' + itemId(kind, it);
    // 主語が無い指摘は目的語だけ。主語だけの指摘は目的語を空で並べる。
    return subj + '/' + label;
  }

  // 人が読む見出し。id は正規化済みで読みにくいので、元の綴りを 1 つ残す。
  function entityTitle(kind, item) {
    var it = item || {};
    var subj = _s(entitySubject(kind, it));
    var label = _s(entityLabel(kind, it));
    if (subj && label) return subj + '.' + label;
    return label || subj || itemId(kind, it);
  }

  // ---- 対象ファイル --------------------------------------------------------

  // BLK-reviewer-20260914-1306-wish: 指摘 1 件が「どの図の話か」は、カテゴリごとに
  // doc / docs / onlyIn / name と別々の項目に入っている。ここで 1 つの形に均す。
  // 行番号は監査結果が持っていないので、ここでは出さない (本文を持つ側で引く)。
  function docsOf(kind, item) {
    var it = item || {};
    var out = [];
    function add(v) {
      if (!v) return;
      if (Array.isArray(v)) { v.forEach(add); return; }
      var s = _s(v);
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    switch (kind) {
      case 'name.variants': (it.members || []).forEach(function(m) { add(m.docs || m.doc); }); break;
      case 'consistency.granularity': add(it.onlyIn); break;
      case 'svg.missing':
      case 'svg.stale': add(it.name); break;
      default: add(it.docs); add(it.doc); break;
    }
    return out;
  }

  // 本文でその指摘に当たる綴り。表記揺れは「揺れている綴り」そのものを探したいので、
  // 正規化した見出しだけでなく、実際に書かれている綴りも並べる。
  function termsOf(kind, item) {
    var it = item || {};
    var out = [];
    function add(v) {
      var s = _s(v);
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    if (kind === 'name.variants') {
      (it.members || []).forEach(function(m) { add(m && (m.name || m.label)); });
    }
    add(entityLabel(kind, it));
    return out;
  }

  function _ok(a) { return a && a.status === 'ok' && a.result; }

  // 監査結果 → [{ kind, category, id, entity, title }]。カテゴリが結果に
  // 現れなければその run では「見ていない」ことになり、後で新カテゴリとして出る。
  function itemsOf(audits) {
    var out = [];
    var a = audits || {};

    function push(kind, list) {
      (list || []).forEach(function(it) {
        out.push({
          kind: kind, category: CATEGORY[kind] || kind, id: itemId(kind, it),
          entity: entityId(kind, it), title: entityTitle(kind, it),
          // 指摘 1 件を図まで辿るための 2 つ。docs は対象ファイル、terms は本文中で
          // その指摘に当たる綴り (行番号はこれで引く)。
          docs: docsOf(kind, it), terms: termsOf(kind, it),
          // 除外先へ移った指摘は「解消」ではないので、そう読める印と理由を持たせる。
          excluded: !!EXCLUDED[kind],
          reason: (it && it.reason) || null,
        });
      });
    }

    if (_ok(a.name)) {
      push('name.variants', a.name.result.variants);
      push('name.undeclared', a.name.result.undeclared);
    }
    if (_ok(a.method)) push('method.issues', a.method.result.issues);
    if (_ok(a.consistency)) {
      var c = a.consistency.result;
      push('consistency.naming', c.naming);
      push('consistency.unused', c.unused);
      push('consistency.methods', c.methods);
      push('consistency.granularity', c.granularity);
      // イベントは後から新設されたカテゴリ。古い JSON には無いので、
      // 「増えたカテゴリ」として差分に出る。
      push('consistency.events', c.events);
      // 応答として突合から外した分。ここを数えないと、methods 5 → 0 が
      // 「4 件解消」に見えて、実際は箱を移っただけ、が起きる。
      push('consistency.methodReplies', c.methodReplies);
    }
    if (_ok(a.family)) {
      (a.family.result || []).forEach(function(g) {
        (g.mismatches || []).forEach(function(m) {
          push('family.mismatches', [{ family: g.family || g.name, key: m.key, label: m.label }]);
        });
      });
    }
    if (_ok(a.trace)) {
      (a.trace.result || []).forEach(function(g) {
        (g.missing || []).forEach(function(m) {
          push('trace.missing', [{ family: g.family || g.name, from: m.from, to: m.to, label: m.label || m.event }]);
        });
        // 粒度違い・宣言で外した遷移。件数だけは summary に出ていたが、
        // 中身を数えていないので「漏れ → 除外」の移動が差分に出なかった。
        (g.outOfScope || []).forEach(function(m) {
          push('trace.outOfScope', [{
            family: g.family || g.name, from: m.from, to: m.to,
            label: m.label || m.event, reason: m.reason,
          }]);
        });
      });
    }
    // 出力物の欠落。図を開かずに「どの図を書き出し忘れたか」が run 間で追える。
    if (_ok(a.svg)) {
      (a.svg.result.rows || []).forEach(function(r) {
        if (r.status === 'missing') push('svg.missing', [{ name: r.name }]);
        else if (r.status === 'stale') push('svg.stale', [{ name: r.name }]);
      });
    }
    return out;
  }

  // その run が「見た」カテゴリ。件数 0 でも見ていれば載る。
  function categoriesOf(audits) {
    var a = audits || {};
    var out = [];
    function add(kind, present) { if (present) out.push(CATEGORY[kind] || kind); }
    if (_ok(a.name)) {
      add('name.variants', !!a.name.result.variants);
      add('name.undeclared', !!a.name.result.undeclared);
    }
    if (_ok(a.method)) add('method.issues', !!a.method.result.issues);
    if (_ok(a.consistency)) {
      var c = a.consistency.result;
      add('consistency.naming', !!c.naming);
      add('consistency.unused', !!c.unused);
      add('consistency.methods', !!c.methods);
      add('consistency.granularity', !!c.granularity);
      add('consistency.events', !!c.events);
      add('consistency.methodReplies', !!c.methodReplies);
    }
    if (_ok(a.family)) add('family.mismatches', true);
    if (_ok(a.trace)) {
      add('trace.missing', true);
      add('trace.outOfScope', true);
    }
    if (_ok(a.svg)) {
      add('svg.missing', true);
      add('svg.stale', true);
    }
    return out;
  }

  // ---- 記録 ----------------------------------------------------------------

  var STORE_KEY = 'pua.audit.timeline';
  var MAX_SNAPSHOTS = 20;

  // 監査結果 1 回分を、後から並べられる形に畳む。生の JSON は持たない
  // (localStorage に 20 run 分入れるので、id とカテゴリだけあれば足りる)。
  function snapshot(audits, meta) {
    var m = meta || {};
    return {
      at: m.at || new Date().toISOString(),
      label: _s(m.label) || (m.at || new Date().toISOString()).slice(0, 16).replace('T', ' '),
      docs: m.docs == null ? null : Number(m.docs),
      items: itemsOf(audits),
      categories: categoriesOf(audits),
    };
  }

  // 同じ実体が同じ run で複数カテゴリに出ることがある (メソッドと粒度の両方)。
  // カテゴリ名を並べて 1 つの「その run での分類」にする。
  function _byEntity(snap) {
    var m = {};
    (snap && snap.items ? snap.items : []).forEach(function(it) {
      var e = m[it.entity];
      if (!e) { e = m[it.entity] = { cats: [], title: it.title, ids: [], docs: [], terms: [] }; }
      if (e.cats.indexOf(it.category) < 0) e.cats.push(it.category);
      if (e.ids.indexOf(it.id) < 0) e.ids.push(it.id);
      (it.docs || []).forEach(function(d) { if (e.docs.indexOf(d) < 0) e.docs.push(d); });
      (it.terms || []).forEach(function(t) { if (e.terms.indexOf(t) < 0) e.terms.push(t); });
    });
    Object.keys(m).forEach(function(k) { m[k].cats.sort(); });
    return m;
  }

  function _catText(cell) { return cell ? cell.cats.join('+') : ''; }

  // 主語が取れないカテゴリ (トレース漏れなど) の実体 id は `/adc_stop` の形になる。
  // 同じ目的語を持つ主語付きの実体がちょうど 1 つなら、それと同じ行に畳む
  // (畳まないと 1 つの欠陥が 2 行に割れ、片方が「解消」に見える)。
  // 候補が 2 つ以上なら、どちらに寄せても嘘になるので畳まない。
  function _foldKeys(maps) {
    var all = {};
    maps.forEach(function(m) { Object.keys(m).forEach(function(k) { all[k] = true; }); });
    var keys = Object.keys(all);
    var rename = {};
    keys.forEach(function(k) {
      if (k.charAt(0) !== '/') return;
      var label = k.slice(1);
      if (!label) return;
      var hosts = keys.filter(function(o) { return o !== k && o.indexOf('/') > 0 && o.slice(o.indexOf('/') + 1) === label; });
      if (hosts.length === 1) rename[k] = hosts[0];
    });
    if (!Object.keys(rename).length) return maps;
    return maps.map(function(m) {
      var out = {};
      // 畳まれる側を後に回す。見出しは主語付きの綴りを残す。
      Object.keys(m).sort(function(a, b) { return (rename[a] ? 1 : 0) - (rename[b] ? 1 : 0); }).forEach(function(k) {
        var to = rename[k] || k;
        var e = out[to];
        if (!e) {
          out[to] = { cats: m[k].cats.slice(), title: m[k].title, ids: m[k].ids.slice(),
            docs: (m[k].docs || []).slice(), terms: (m[k].terms || []).slice() };
          return;
        }
        m[k].cats.forEach(function(c) { if (e.cats.indexOf(c) < 0) e.cats.push(c); });
        m[k].ids.forEach(function(i) { if (e.ids.indexOf(i) < 0) e.ids.push(i); });
        (m[k].docs || []).forEach(function(d) { if (e.docs.indexOf(d) < 0) e.docs.push(d); });
        (m[k].terms || []).forEach(function(t) { if (e.terms.indexOf(t) < 0) e.terms.push(t); });
        e.cats.sort();
      });
      return out;
    });
  }

  // 直近 2 run の突き合わせ。解消 (もう出ない) と再分類 (出るがカテゴリが違う) を分ける。
  function statusOf(cells) {
    var last = cells[cells.length - 1];
    var prevIdx = -1;
    for (var i = cells.length - 2; i >= 0; i--) { if (cells[i]) { prevIdx = i; break; } }
    var prev = prevIdx >= 0 ? cells[prevIdx] : null;
    if (!last) return prev ? '解消' : '—';
    if (!prev) return '新規';
    return _catText(prev) === _catText(last) ? '継続' : '再分類';
  }

  // snapshots (古い順) → 画面に出す表。
  // rows は「実体 1 つ = 1 行」。cells は run 数と同じ長さで、その run での分類。
  function build(snapshots) {
    var snaps = (snapshots || []).slice();
    var maps = _foldKeys(snaps.map(_byEntity));
    var order = [];
    var seen = {};
    maps.forEach(function(m) {
      Object.keys(m).forEach(function(k) { if (!seen[k]) { seen[k] = true; order.push(k); } });
    });

    var rows = order.map(function(key) {
      var cells = maps.map(function(m) { return m[key] || null; });
      // 見出しは新しい run のものを使う。ただし主語付きの綴りがどこかにあれば
      // そちらを優先する (主語の取れないカテゴリに移った run が最後だと、
      // 見出しから「誰の」が消えてしまう)。
      var title = '', titled = '';
      for (var i = cells.length - 1; i >= 0; i--) {
        if (!cells[i]) continue;
        if (!title) title = cells[i].title;
        if (!titled && cells[i].title.indexOf('.') > 0) titled = cells[i].title;
      }
      title = titled || title;
      var moves = 0;
      var lastCat = null;
      cells.forEach(function(c) {
        if (!c) return;
        var t = _catText(c);
        if (lastCat !== null && lastCat !== t) moves++;
        lastCat = t;
      });
      return {
        entity: key, title: title, moves: moves,
        cells: cells.map(function(c) {
          return c ? { cats: c.cats.slice(), text: _catText(c), ids: c.ids.slice(),
            docs: (c.docs || []).slice(), terms: (c.terms || []).slice() } : null;
        }),
        status: statusOf(cells),
      };
    });

    var counts = { 解消: 0, 再分類: 0, 継続: 0, 新規: 0 };
    rows.forEach(function(r) { if (counts[r.status] !== undefined) counts[r.status]++; });

    // カテゴリの増減 (監査ツール側が動いた方)。DSL が無変更でもここは動く。
    var newCategories = [], goneCategories = [];
    if (snaps.length >= 2) {
      var pc = snaps[snaps.length - 2].categories || [];
      var cc = snaps[snaps.length - 1].categories || [];
      newCategories = cc.filter(function(c) { return pc.indexOf(c) < 0; });
      goneCategories = pc.filter(function(c) { return cc.indexOf(c) < 0; });
    }

    return {
      runs: snaps.map(function(s) { return { at: s.at, label: s.label, docs: s.docs, count: (s.items || []).length }; }),
      rows: rows, counts: counts,
      newCategories: newCategories, goneCategories: goneCategories,
    };
  }

  // 画面と CLI に共通の 1 行。件数だけを見て「減った = 直った」と読ませない。
  function summaryLine(built) {
    var c = (built && built.counts) || {};
    if (!built || !built.runs || built.runs.length < 2) return '記録が 1 回分だけです (2 回目から解消と再分類を区別できます)';
    return '解消 ' + (c['解消'] || 0) + ' 件 / 再分類 ' + (c['再分類'] || 0) + ' 件 / 継続 '
      + (c['継続'] || 0) + ' 件 / 新規 ' + (c['新規'] || 0) + ' 件';
  }

  // ---- localStorage ---------------------------------------------------------

  function _ls() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function load() {
    var ls = _ls();
    if (!ls) return [];
    try {
      var raw = ls.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(snaps) {
    var ls = _ls();
    if (!ls) return false;
    try { ls.setItem(STORE_KEY, JSON.stringify((snaps || []).slice(-MAX_SNAPSHOTS))); return true; }
    catch (e) { return false; }
  }

  // 同じ run を二重に積まない。ラベルが同じなら上書きする
  // (同じ日に監査を回し直したときに、行が 2 本に割れて見えないように)。
  function push(snaps, snap) {
    var out = (snaps || []).slice();
    for (var i = 0; i < out.length; i++) {
      if (out[i] && out[i].label === snap.label) { out[i] = snap; return out.slice(-MAX_SNAPSHOTS); }
    }
    out.push(snap);
    return out.slice(-MAX_SNAPSHOTS);
  }

  function clear() {
    var ls = _ls();
    if (ls) { try { ls.removeItem(STORE_KEY); } catch (e) {} }
  }

  var api = {
    CATEGORY: CATEGORY, EXCLUDED: EXCLUDED, REASON: REASON,
    STORE_KEY: STORE_KEY, MAX_SNAPSHOTS: MAX_SNAPSHOTS,
    itemId: itemId, itemsOf: itemsOf, categoriesOf: categoriesOf,
    entityId: entityId, entityTitle: entityTitle, norm: norm,
    docsOf: docsOf, termsOf: termsOf,
    snapshot: snapshot, build: build, statusOf: statusOf, summaryLine: summaryLine,
    load: load, save: save, push: push, clear: clear,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.auditTimeline = api;
  }
})();
