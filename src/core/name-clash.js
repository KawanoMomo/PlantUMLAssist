'use strict';
window.MA = window.MA || {};

// name-clash — 表記揺れを「誰の図と誰の図の間の揺れか」まで分けて出す。
//
// BLK-reviewer-20260916-0326-wish: 表記揺れは今もグループ単位でしか出ないので、
// Clock_Ctrl ⇔ ClockCtrl が junior の中だけの揺れなのか、primary の図とぶつかって
// いるのかは、グループに入っている図を 1 枚ずつ開いて誰のフォルダの図かを見るまで
// 分からない。前回の run はそれを取り違えて「junior 内部だけの揺れ」と書いた
// (実際は primary 3 図・junior 3 図が混じっていた)。
//
// 揺れの中身は同じでも、「自分のフォルダの中で揃えればいい揺れ」と「相手に断らないと
// 揃えられない衝突」は、やることがまるで違う。だから図ごとに、その図が関わっている
// 揺れが persona をまたぐかどうかを 1 語で出す。
//
// 綴りの抽出そのものは name-audit の職掌なので持たない (規則を二重に持つと、
// 片方だけ直して食い違う)。ここは「その綴りがどの persona の図に出たか」を
// 束ね直すだけ。DOM も fetch も触らない。
window.MA.nameClash = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _uniq(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function(v) {
      var s = _s(v);
      if (s === '' || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    return out;
  }

  // docs: [{ name, dsl, persona }] — name は図の呼び名 (persona/図名 でよい)。
  // persona を持たない図は「持ち主不明」として扱い、衝突の判定には数えない
  // (持ち主が分からない図で「相手がいる」と言うと、また誤判定が生まれる)。
  function _personaMap(docs) {
    var map = {};
    (docs || []).forEach(function(d) {
      if (d && d.name) map[_s(d.name)] = _s(d.persona);
    });
    return map;
  }

  // groups(docs) — 表記揺れの組を、綴りごとの持ち主つきで出す。
  // cross=true は persona をまたぐ組 (相手に断らないと揃えられない)。
  function groups(docs) {
    var NA = window.MA.nameAudit;
    if (!NA) return [];
    var owner = _personaMap(docs);
    return NA.variants(docs || []).map(function(g) {
      var personas = [];
      var spellings = g.members.map(function(m) {
        var ps = _uniq((m.docs || []).map(function(n) { return owner[n]; }));
        ps.forEach(function(p) { if (personas.indexOf(p) < 0) personas.push(p); });
        return { name: m.name, personas: ps, docs: (m.docs || []).slice(), refs: m.refs };
      });
      // またいでいるかは「組に 2 人以上いる」ではなく「綴りの持ち主が割れている」で決める。
      // 同じ綴りを 2 人が使っているだけなら揺れていないので、衝突ではない。
      // 「違う綴りが、違う持ち主の図に出ている」ときだけ衝突とする。
      var cross = false;
      for (var i = 0; i < spellings.length && !cross; i++) {
        for (var j = i + 1; j < spellings.length && !cross; j++) {
          spellings[i].personas.forEach(function(p) {
            spellings[j].personas.forEach(function(q) {
              if (p && q && p !== q) cross = true;
            });
          });
        }
      }
      return { key: g.key, suggested: g.suggested, total: g.total,
               spellings: spellings, personas: personas.filter(function(p) { return p; }),
               cross: cross };
    });
  }

  // byDoc(docs) — 図ごとの判定。一覧の 1 行に付ける印はこれだけ見れば決まる。
  // verdict: 'cross' (他 persona と衝突) / 'internal' (自分の中の揺れ) / 'clean'。
  function byDoc(docs) {
    var owner = _personaMap(docs);
    var out = {};
    Object.keys(owner).forEach(function(n) {
      out[n] = { doc: n, persona: owner[n], verdict: 'clean', cross: [], internal: [], others: [] };
    });
    groups(docs).forEach(function(g) {
      g.spellings.forEach(function(sp) {
        sp.docs.forEach(function(n) {
          var row = out[n];
          if (!row) return;
          if (g.cross) {
            row.cross.push({ key: g.key, name: sp.name, suggested: g.suggested });
            g.personas.forEach(function(p) {
              if (p && p !== row.persona && row.others.indexOf(p) < 0) row.others.push(p);
            });
          } else {
            row.internal.push({ key: g.key, name: sp.name, suggested: g.suggested });
          }
        });
      });
    });
    Object.keys(out).forEach(function(n) {
      var row = out[n];
      // またぐ揺れが 1 件でもあれば cross。自分の中で揃えて済む話ではなくなる。
      row.verdict = row.cross.length ? 'cross' : (row.internal.length ? 'internal' : 'clean');
    });
    return out;
  }

  // 一覧の 1 行に付ける印。clean には何も付けない
  // (全部の行に印が付くと、付いている行を探す目の手数が戻ってくる)。
  function badge(entry) {
    var e = entry || {};
    if (e.verdict === 'cross') {
      var who = (e.others || []).join('・');
      return {
        severity: 'cross',
        mark: '⚠',
        label: who ? who + 'と衝突' : '他personaと衝突',
        title: 'この図の部品名が ' + (who || '他の persona')
          + ' の図と表記が割れています（' + (e.cross || []).map(function(c) {
              return c.name + ' → ' + c.suggested;
            }).join('、') + '）。相手に断らずに揃えると、相手の図と食い違ったままになります',
      };
    }
    if (e.verdict === 'internal') {
      return {
        severity: 'internal',
        mark: '・',
        label: '自分の中の揺れ',
        title: '表記が割れていますが、割れているのは自分の図の中だけです（'
          + (e.internal || []).map(function(c) { return c.name + ' → ' + c.suggested; }).join('、')
          + '）。相手に断らずに揃えられます',
      };
    }
    return null;
  }

  // 何枚を照合しての結果かを必ず言う。照合できていないだけの 0 件と読み分けられないと、
  // 「衝突なし」を信じてよいのか分からず、結局 audit を回し直すことになる。
  function summaryLine(res) {
    var r = res || {};
    var n = r.checked || 0;
    if (!n) return '他の persona の図と照合していません';
    var parts = [n + ' 枚を照合'];
    if (r.personas && r.personas.length) parts[0] += '（' + r.personas.join('・') + '）';
    if (r.crossDocs && r.crossDocs.length) {
      parts.push('他 persona と衝突 ' + r.crossDocs.length + ' 図');
    }
    if (r.internalDocs && r.internalDocs.length) {
      parts.push('自分の中の揺れ ' + r.internalDocs.length + ' 図');
    }
    if (parts.length === 1) parts.push('表記の割れなし');
    return parts.join(' / ');
  }

  function summaryClass(res) {
    var r = res || {};
    if (!r.checked) return 'nc-none';
    if (r.crossDocs && r.crossDocs.length) return 'nc-cross';
    if (r.internalDocs && r.internalDocs.length) return 'nc-internal';
    return 'nc-clean';
  }

  // 突合のひとまとめ。UI とテストはこれだけ見ればよい。
  function audit(docs) {
    var list = (docs || []).filter(function(d) { return d && d.name; });
    var rows = byDoc(list);
    var gs = groups(list);
    var crossDocs = [];
    var internalDocs = [];
    Object.keys(rows).forEach(function(n) {
      if (rows[n].verdict === 'cross') crossDocs.push(n);
      else if (rows[n].verdict === 'internal') internalDocs.push(n);
    });
    crossDocs.sort();
    internalDocs.sort();
    return {
      checked: list.length,
      personas: _uniq(list.map(function(d) { return d.persona; })).sort(),
      groups: gs,
      byDoc: rows,
      crossDocs: crossDocs,
      internalDocs: internalDocs,
      crossGroups: gs.filter(function(g) { return g.cross; }),
      clean: crossDocs.length === 0 && internalDocs.length === 0,
    };
  }

  // 衝突している組を、相手の綴りと図まで名指しで 1 行ずつ出す。
  // 「どの図が相手側か」をここで言い切るのが今回の肝 (言わないと全文を読み直す)。
  function crossLines(res) {
    var out = [];
    ((res && res.crossGroups) || []).forEach(function(g) {
      out.push(g.spellings.map(function(sp) { return sp.name; }).join(' ⇔ ')
        + ' — 揃える先: ' + g.suggested);
      g.spellings.forEach(function(sp) {
        sp.docs.forEach(function(d) {
          out.push('  ' + sp.name + '  ' + d
            + (sp.personas.length ? '（' + sp.personas.join('・') + '）' : ''));
        });
      });
    });
    return out;
  }

  return {
    groups: groups,
    byDoc: byDoc,
    badge: badge,
    summaryLine: summaryLine,
    summaryClass: summaryClass,
    crossLines: crossLines,
    audit: audit,
  };
})();
