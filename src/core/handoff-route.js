'use strict';
window.MA = window.MA || {};

// handoff-route — 引き継ぎパッケージを「受け取る側が辿る順」に並べ直す。
//
// BLK-primary-20260915-2346-wish: zip は図・SVG・突合結果を詰めただけで、新人が
// 「今日どの図から見ればよいか」「どの変更が今回分か」を辿る順序が付いていない。
// index.html は 6 つの節を材料の種類 (変更 / 系統 / 名前 / サマリ / 申し送り / 図一式)
// で並べており、24 枚の図はフォルダの並び順で出る。新人は展開してファイル名から
// 中身を推測するしかなかった。
//
// ここでは同じスナップショットから「①この図から見る → ②ここが今回変わった →
// ③次はこれ」の 1 本道を組む。順序は材料から決まり、恣意的に並べない:
//   1. 今回変わっていて、まだ指摘が残っている図 (直す手が残っている = 最優先)
//   2. 今回変わった図 (何が変わったかを読めばよい)
//   3. 今回は変えていないが、指摘が残っている図 (引き継いだ宿題)
//   4. それ以外 (参考。順番は付けない)
// 各停留所は junior 台本の手順番号にひも付ける (手順1 確認 / 手順2 直す / 手順7 見返す)。
//
// このモジュールは DOM にもブラウザ API にも触らない (renderHtml は文字列を返すだけ)。
window.MA.handoffRoute = (function() {

  var STEP_CHECK = '手順1';   // 指摘と先輩の図を確認する
  var STEP_FIX = '手順2';     // 指摘どおりに直す
  var STEP_REVIEW = '手順7';  // 開き直して反映を確かめる

  // 段の定義。why は「なぜこの順なのか」を受け取る側の言葉で言う。
  var TIERS = [
    {
      key: 'changed-todo', step: STEP_FIX,
      why: '今回変わっていて、まだ直っていない指摘が残っています。ここから手を付けます',
    },
    {
      key: 'changed', step: STEP_CHECK,
      why: '今回変わった図です。どこが変わったかを読んでください',
    },
    {
      key: 'todo', step: STEP_FIX,
      why: '今回は変えていませんが、指摘が残ったままです (引き継ぐ宿題)',
    },
  ];

  var TIER_BY_KEY = {};
  TIERS.forEach(function(t) { TIER_BY_KEY[t.key] = t; });

  function esc(s) {
    if (window.MA.htmlUtils && window.MA.htmlUtils.escHtml) return window.MA.htmlUtils.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _s(v) { return String(v == null ? '' : v); }

  // 図の名前から HTML の錨を作る。index.html の中で図の塊へ飛ぶために使う。
  // 同名が 2 枚あっても別の錨になるよう連番を添える (zip の SVG 名と同じ考え)。
  function anchorId(name, i) {
    var base = _s(name).replace(/[^0-9A-Za-z぀-ヿ一-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return 'd-' + (i + 1) + (base ? '-' + base : '');
  }

  // 「ここが今回変わった」の中身。差分そのものではなく、読む人が拾う点だけを出す。
  function _points(row) {
    var out = [];
    var line = _s(row.changeLine).trim();
    if (line) out.push(line);
    (row.reasons || []).forEach(function(r) {
      var t = _s(r).trim();
      if (t) out.push('反映した指摘: ' + t);
    });
    if (row.fixCount) out.push('変更サマリに「要修正」が ' + row.fixCount + ' 行残っています');
    return out;
  }

  function _tierOf(row) {
    var open = (row.openPins || []).length;
    if (row.changed && open > 0) return 'changed-todo';
    if (row.changed) return 'changed';
    if (open > 0) return 'todo';
    return '';
  }

  // build — スナップショットから 1 本道を組む。
  // stops は辿る順、rest は順番を付けない参考の図。
  function build(snapshot) {
    var s = snapshot || {};
    var sum = s.summary || {};
    var rows = (sum.changed || []).concat(sum.rest || []);
    var diagrams = s.diagrams || [];

    // 図の並び (= zip の svg/ の並び) を錨に使う。名前で引けるようにしておく。
    var anchorOf = {};
    diagrams.forEach(function(d, i) {
      var key = _s(d.name);
      if (!Object.prototype.hasOwnProperty.call(anchorOf, key)) anchorOf[key] = anchorId(key, i);
    });

    var buckets = { 'changed-todo': [], 'changed': [], 'todo': [] };
    var restRows = [];
    rows.forEach(function(row) {
      var tier = _tierOf(row);
      if (tier) buckets[tier].push(row); else restRows.push(row);
    });

    var stops = [];
    TIERS.forEach(function(t) {
      buckets[t.key].forEach(function(row) {
        var name = _s(row.name);
        stops.push({
          no: 0,
          name: name,
          diagramType: _s(row.diagramType),
          anchor: Object.prototype.hasOwnProperty.call(anchorOf, name)
            ? anchorOf[name] : anchorId(name, stops.length),
          tier: t.key,
          step: t.step,
          why: t.why,
          changeLine: _s(row.changeLine),
          points: _points(row),
          todo: (row.openPins || []).map(function(p) { return _s(p); }),
          next: '',
        });
      });
    });

    stops.forEach(function(st, i) {
      st.no = i + 1;
      st.next = (i + 1 < stops.length) ? stops[i + 1].name : '';
    });

    var rest = restRows.map(function(row) {
      var name = _s(row.name);
      return {
        name: name,
        diagramType: _s(row.diagramType),
        anchor: Object.prototype.hasOwnProperty.call(anchorOf, name) ? anchorOf[name] : '',
        step: STEP_REVIEW,
      };
    });

    return {
      createdAt: _s(s.createdAt),
      stops: stops,
      rest: rest,
      total: stops.length,
      restCount: rest.length,
      line: line({ stops: stops, rest: rest }),
    };
  }

  // line — 受け取る側がまず読む 1 行。「何枚を順に見るのか」だけを言う。
  function line(route) {
    var r = route || {};
    var n = (r.stops || []).length;
    var rest = (r.rest || []).length;
    if (n === 0) {
      return rest === 0
        ? '辿る図はありません。'
        : '今回の変更も残っている指摘もありません。参考の図が ' + rest + ' 枚あります。';
    }
    var todo = (r.stops || []).filter(function(st) { return (st.todo || []).length > 0; }).length;
    var txt = '①から順に ' + n + ' 枚を見てください';
    if (todo > 0) txt += ' (うち ' + todo + ' 枚は直す手が残っています)';
    if (rest > 0) txt += '。残り ' + rest + ' 枚は参考です';
    return txt + '。';
  }

  // progressLine — 何枚まで辿ったか。index.html の中と、渡した側の画面で同じ文を使う。
  function progressLine(total, seen) {
    var t = Number(total) || 0;
    var n = Number(seen) || 0;
    if (t === 0) return '辿る図はありません';
    if (n >= t) return '順路 ' + t + ' 枚すべてを辿りました';
    return '順路 ' + n + ' / ' + t + ' 枚を辿りました';
  }

  // ── 受け取り側 → 渡し側 に返す「辿った記録」 ─────────────────────────────
  // 申し送りの返信 (handover-reply.json) と同じ 1 ファイルに相乗りする。
  // 新人が別のファイルを 2 つ返す形にはしない (渡す手が増えるだけなので)。

  function serializeRoute(total, seen, at) {
    return {
      total: Number(total) || 0,
      seen: Number(seen) || 0,
      at: _s(at),
    };
  }

  function parseRoute(raw) {
    var v = raw;
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (e) { return null; }
    }
    if (!v || typeof v !== 'object') return null;
    var total = Number(v.total);
    var seen = Number(v.seen);
    if (!isFinite(total) || total < 0) return null;
    if (!isFinite(seen) || seen < 0) seen = 0;
    if (seen > total) seen = total;
    return { total: total, seen: seen, at: _s(v.at) };
  }

  // ── index.html に差し込む節 ──────────────────────────────────────────────

  function renderHtml(route) {
    var r = route || {};
    var stops = r.stops || [];
    if (stops.length === 0 && (r.rest || []).length === 0) {
      return '<p class="muted">辿る図がありません。</p>';
    }
    var out = '<p class="muted">見た図は □ を押して印を付けてください。'
      + '最後に「返信を保存」で、どこまで辿ったかが先輩に返ります。</p>';
    out += '<ol class="hr" id="hr-list" data-total="' + esc(String(stops.length)) + '">';
    stops.forEach(function(st) {
      out += '<li data-stop-no="' + esc(String(st.no)) + '">';
      out += '<button type="button" class="hr-seen" aria-pressed="false" title="見たら押す">□</button>';
      out += '<div class="hr-body">';
      out += '<div class="hr-head"><span class="hr-no">' + esc(String(st.no)) + '</span> '
        + '<a href="#' + esc(st.anchor) + '">' + esc(st.name) + '</a>'
        + '<span class="hr-step">' + esc(st.step) + '</span>'
        + '<small>' + esc(st.diagramType) + '</small></div>';
      out += '<div class="hr-why">' + esc(st.why) + '</div>';
      if (st.points.length > 0) {
        out += '<div class="hr-sub">ここが今回変わった</div><ul class="hr-points">';
        st.points.forEach(function(p) { out += '<li>' + esc(p) + '</li>'; });
        out += '</ul>';
      }
      if (st.todo.length > 0) {
        out += '<div class="hr-sub">残っている指摘 ' + st.todo.length + ' 件</div><ul class="hr-todo">';
        st.todo.forEach(function(p) { out += '<li>' + esc(p) + '</li>'; });
        out += '</ul>';
      }
      out += '<div class="hr-next">'
        + (st.next ? '次はこれ → ' + esc(st.next) : 'ここで順路は終わりです')
        + '</div>';
      out += '</div></li>';
    });
    out += '</ol>';
    out += '<p id="hr-state" class="hr-state" data-seen="0"></p>';
    if ((r.rest || []).length > 0) {
      out += '<div class="hr-sub">参考 (今回の変更も残っている指摘もない図 '
        + (r.rest || []).length + ' 枚)</div><ul class="hr-rest">';
      r.rest.forEach(function(d) {
        out += '<li>' + (d.anchor
          ? '<a href="#' + esc(d.anchor) + '">' + esc(d.name) + '</a>'
          : esc(d.name)) + '</li>';
      });
      out += '</ul>';
    }
    return out;
  }

  var CSS = [
    'ol.hr{list-style:none;padding:0;margin:8px 0 4px;counter-reset:none;}',
    'ol.hr li{display:flex;gap:8px;background:#fff;border:1px solid #d5d5da;border-radius:4px;',
    'padding:8px 10px;margin-bottom:6px;}',
    'ol.hr li[data-seen="1"]{background:#f1f7f2;border-color:#9ac9ad;}',
    'ol.hr .hr-seen{flex:0 0 auto;align-self:flex-start;font-size:13px;line-height:1;',
    'width:24px;height:24px;border:1px solid #b5b5bd;background:#f3f3f6;border-radius:4px;cursor:pointer;}',
    'ol.hr .hr-seen[aria-pressed="true"]{background:#d6f5e0;border-color:#4a9a6a;}',
    'ol.hr .hr-body{flex:1 1 auto;min-width:0;}',
    'ol.hr .hr-head{font-size:13px;font-weight:600;}',
    'ol.hr .hr-head a{color:#1d4f8a;}',
    'ol.hr .hr-no{display:inline-block;min-width:18px;height:18px;line-height:18px;text-align:center;',
    'background:#1d4f8a;color:#fff;border-radius:9px;font-size:11px;margin-right:4px;}',
    'ol.hr .hr-step{background:#e6ecf5;color:#1d4f8a;font-size:11px;border-radius:9px;',
    'padding:1px 8px;margin-left:6px;font-weight:600;}',
    'ol.hr .hr-head small{font-weight:400;color:#6a6a72;margin-left:6px;}',
    'ol.hr .hr-why{font-size:12px;color:#4a4a52;margin:3px 0;}',
    '.hr-sub{font-size:12px;font-weight:600;margin:6px 0 2px;}',
    'ul.hr-points,ul.hr-todo,ul.hr-rest{margin:2px 0 4px;padding-left:20px;font-size:12px;}',
    'ul.hr-todo li{color:#8a4b06;}',
    'ol.hr .hr-next{font-size:12px;color:#1d4f8a;margin-top:6px;}',
    '.hr-state{font-size:12px;font-weight:600;margin:2px 0 12px;}',
  ].join('\n');

  // index.html の中で動く印付け。辿った枚数は #hr-state の data-seen に置き、
  // 申し送りの「返信を保存」がそれを拾って 1 つの JSON に入れる。
  var SCRIPT = [
    '(function(){',
    '  var box = document.getElementById("hr-list"); if (!box) return;',
    '  var state = document.getElementById("hr-state");',
    '  var total = parseInt(box.getAttribute("data-total"), 10) || 0;',
    '  function refresh(){',
    '    var seen = box.querySelectorAll(\'li[data-seen="1"]\').length;',
    '    if (state) {',
    '      state.setAttribute("data-seen", String(seen));',
    '      state.textContent = seen >= total && total > 0',
    '        ? ("順路 " + total + " 枚すべてを辿りました")',
    '        : ("順路 " + seen + " / " + total + " 枚を辿りました");',
    '    }',
    '  }',
    '  box.addEventListener("click", function(ev){',
    '    var b = ev.target && ev.target.closest ? ev.target.closest("button.hr-seen") : null;',
    '    if (!b) return;',
    '    var li = b.closest("li"); if (!li) return;',
    '    var on = li.getAttribute("data-seen") === "1";',
    '    li.setAttribute("data-seen", on ? "0" : "1");',
    '    b.setAttribute("aria-pressed", on ? "false" : "true");',
    '    b.textContent = on ? "□" : "✓";',
    '    refresh();',
    '  });',
    '  refresh();',
    '})();',
  ].join('\n');

  function styleCss() { return CSS; }
  function scriptHtml() { return '<script>\n' + SCRIPT + '\n</' + 'script>'; }

  return {
    STEP_CHECK: STEP_CHECK,
    STEP_FIX: STEP_FIX,
    STEP_REVIEW: STEP_REVIEW,
    anchorId: anchorId,
    build: build,
    line: line,
    progressLine: progressLine,
    serializeRoute: serializeRoute,
    parseRoute: parseRoute,
    renderHtml: renderHtml,
    styleCss: styleCss,
    scriptHtml: scriptHtml,
  };
})();
