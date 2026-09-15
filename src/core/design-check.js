'use strict';

// design-check — `design/` の仕様と、いま開いている GUI の現在値を突き合わせる。
//
// BLK-primary-20260915-2240-wish: 手順 11 で「design/README.md の 7a/7b が言う
// 『タブ列は図だけ』と、実際のタブ列が食い違って見える」ところまでは分かっても、
// それが *仕様からの後退* なのか *この環境の設定がたまたま既定と違う* のかを
// GUI から判定できず、原因の切り分けができないまま終わっていた。
// (.dc.html を grep → タブを目で数える → 自分で比べて言語化、の 3 手)
//
// ここは「仕様項目 1 つ = 期待値 + 現在値の測り方 + その項目に効く設定」を 1 表に置き、
// 不一致を必ず次の 3 つのどれかに落とす:
//   ok      一致している
//   setting 設定差 — この環境の設定が既定と違うだけ。既定に戻せば仕様どおりになる
//   gap     仕様後退 — 設定は既定なのに満たしていない。BLK にする値打ちがある
// 判定に人の目を挟まないので、手順 11 は「不一致の一覧を開く」1 手で済む。
//
// 現在値の測り方 (probe) も document を受け取る純関数としてここに置く。
// DOM の付け外しと画面の描画は app.js。
(function() {
  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  function _all(doc, sel) {
    if (!doc || !doc.querySelectorAll) return [];
    return Array.prototype.slice.call(doc.querySelectorAll(sel));
  }

  // 画面に出ているか。jsdom には実レイアウトが無いので、この画面が「消す」ときに
  // 使う手立て (hidden 属性・display:none・親に付く畳みクラス) だけを見る。
  function _shown(el) {
    if (!el) return false;
    if (el.hidden) return false;
    var st = el.style || {};
    if (st.display === 'none') return false;
    var cl = el.className || '';
    if (typeof cl === 'string' && cl.indexOf('tool-folded') >= 0) {
      var bar = el.parentNode;
      var bc = (bar && bar.className) || '';
      if (typeof bc === 'string' && bc.indexOf('tools-folded') >= 0) return false;
    }
    return true;
  }

  // 「畳む対象の機能ボタンか」の正本は tool-menu。タブ列に残す ＋ / 📂 一覧 / ⇔ 先輩 と、
  // 静かなタブ列で入口を残す「他 N 件」の札は道具ではないので機能ボタンに数えない
  // (数えると 7b をどう作っても永久に不一致になり、判定が信用されなくなる)。
  var NOT_A_TOOL = ['btn-tab-new', 'btn-tab-folder', 'btn-tab-senior', 'btn-tab-tools',
    'btn-tab-tools-mini'];

  function _toolMenu() {
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./tool-menu.js'); } catch (e) { /* 単体で読まれたとき */ }
    }
    return (typeof window !== 'undefined' && window.MA && window.MA.toolMenu) || null;
  }

  function _isTool(el) {
    var id = _s(el && el.id);
    if (NOT_A_TOOL.indexOf(id) >= 0) return false;
    var tm = _toolMenu();
    if (tm && tm.isFoldable) return tm.isFoldable(id);
    return true;
  }

  // ---- 仕様項目 -------------------------------------------------------------
  // spec/plan は出典 (design/README.md の「対象の仕様」の何番の何案か)。
  // settings は「その項目に効く設定」の一覧。key が localStorage の鍵、isDefault が
  // 「何も触っていない人」の値かどうか (null = まだ書かれていない = 既定)。
  // 1 つの項目に効く設定は 1 つとは限らない。タブ列の見た目は「畳むか」と「静かか」の
  // 両方で決まるので、片方だけ見ると畳みを解いた環境を仕様後退と読み違える。
  var CHECKS = [
    {
      id: '7b-tab-bar-diagrams-only',
      spec: 'PlantUMLAssist - 実装現況.dc.html',
      plan: '7b',
      title: 'タブ列に並ぶのは図のタブだけ',
      expect: '畳める機能ボタンがタブ列に 0 個',
      settings: [
        {
          key: 'plantuml-tools-quiet',
          label: 'ツール ▾ をタブ列に出す',
          defaultText: '静か (既定)',
          // '0' = 「ツール ▾ をタブ列に出す」を自分で押した人。7b の既定は静か。
          isDefault: function(v) { return v == null || v === '' || v !== '0'; },
        },
        {
          key: 'plantuml-tools-folded',
          label: '機能ボタンを畳む',
          defaultText: '畳む (既定)',
          isDefault: function(v) { return v == null || v === '' || v === '1'; },
        },
      ],
      probe: function(doc) {
        var shown = _all(doc, '#tab-bar .tab-tool').filter(_isTool).filter(_shown);
        return { ok: shown.length === 0, actual: '機能ボタン ' + shown.length + ' 個' };
      },
    },
    {
      id: '7a-tools-folded',
      spec: 'PlantUMLAssist - 実装現況.dc.html',
      plan: '7a',
      title: '機能は 1 か所 (🧰 ツール ▾ のメニュー) に畳む',
      expect: 'タブ列が畳んだ状態',
      settings: [
        {
          key: 'plantuml-tools-folded',
          label: '機能ボタンを畳む',
          defaultText: '畳む (既定)',
          isDefault: function(v) { return v == null || v === '' || v === '1'; },
        },
      ],
      probe: function(doc) {
        var bar = doc && doc.getElementById && doc.getElementById('tab-bar');
        var cl = (bar && bar.className) || '';
        var folded = typeof cl === 'string' && cl.indexOf('tools-folded') >= 0;
        return { ok: folded, actual: folded ? '畳んだ状態' : '機能ボタンが展開されたまま' };
      },
    },
    {
      id: '7b-command-palette',
      spec: 'PlantUMLAssist - 実装現況.dc.html',
      plan: '7b',
      title: '畳んだ機能は Ctrl+K (コマンドパレット) から引ける',
      expect: 'Ctrl+K の入口が画面にある',
      settings: [],
      probe: function(doc) {
        var has = !!(doc && doc.getElementById && doc.getElementById('cp-modal'));
        return { ok: has, actual: has ? 'Ctrl+K あり' : 'Ctrl+K の入口が無い' };
      },
    },
    {
      id: '7b-mini-entry',
      spec: 'PlantUMLAssist - 実装現況.dc.html',
      plan: '7b',
      title: '静かなタブ列でも、畳んだ機能への 1 クリックの入口が残る',
      expect: '「他 N 件」の札が出ている',
      settings: [],
      probe: function(doc) {
        var mini = doc && doc.getElementById && doc.getElementById('btn-tab-tools-mini');
        var bar = doc && doc.getElementById && doc.getElementById('tab-bar');
        var bc = (bar && bar.className) || '';
        var hidden = typeof bc === 'string' && bc.indexOf('tools-hide-mini-btn') >= 0;
        var shown = !!mini && !hidden && _shown(mini);
        return {
          ok: shown,
          actual: shown ? _s(mini.textContent).trim() : '札が出ていない',
        };
      },
    },
    {
      id: '1a-three-panes',
      spec: 'PlantUMLAssist - リデザイン案.dc.html',
      plan: '1a',
      title: '左に DSL、中央にプレビュー、右に設定の 3 枠',
      expect: '3 枠とも画面にある',
      settings: [],
      probe: function(doc) {
        var ids = ['editor-pane', 'preview-pane', 'props-pane'];
        var missing = ids.filter(function(id) {
          var el = doc && doc.getElementById && doc.getElementById(id);
          return !_shown(el);
        });
        return {
          ok: missing.length === 0,
          actual: missing.length ? '無い枠: ' + missing.join(', ') : '3 枠とも出ている',
        };
      },
    },
    {
      id: '1a-diagram-rail',
      spec: 'PlantUMLAssist - リデザイン案.dc.html',
      plan: '1a',
      title: '図種は左端の縦レールから選ぶ (6 図種)',
      expect: 'レールに 6 図種',
      settings: [],
      probe: function(doc) {
        var n = _all(doc, '#rail-types .rail-btn').filter(_shown).length;
        return { ok: n >= 6, actual: 'レールの図種 ' + n + ' 種' };
      },
    },
  ];

  function checks() { return CHECKS.slice(); }

  function checkById(id) {
    for (var i = 0; i < CHECKS.length; i++) if (CHECKS[i].id === _s(id)) return CHECKS[i];
    return null;
  }

  // ---- 判定 -----------------------------------------------------------------
  // 不一致を「設定差」と「仕様後退」に必ず振り分ける。ここが手順 11 の肝で、
  // どちらか分からないまま保留にできないようにするためにある。
  //
  // judge(check, probe, readSetting)
  //   probe:       { ok, actual }  — その項目の現在値
  //   readSetting: key → localStorage の生の値 (無ければ null)。値を 1 つ渡しても
  //                よい (設定が 1 つだけの項目を単体で試すとき)。
  function judge(check, probe, readSetting) {
    var c = check || {};
    var p = probe || { ok: false, actual: '測れなかった' };
    var sets = c.settings || [];
    var read = typeof readSetting === 'function'
      ? readSetting
      : function() { return readSetting === undefined ? null : readSetting; };
    var off = sets.filter(function(st) {
      var v = read(st.key);
      return !st.isDefault(v == null ? null : _s(v));
    });
    var isDefault = off.length === 0;
    var row = {
      id: _s(c.id),
      spec: _s(c.spec),
      plan: _s(c.plan),
      title: _s(c.title),
      expect: _s(c.expect),
      actual: _s(p.actual),
      settingKeys: off.map(function(st) { return st.key; }),
      settingKey: off.length ? off[0].key : '',
      settingLabel: off.length ? off[0].label : '',
      settingIsDefault: isDefault,
      verdict: 'ok',
      reason: '',
    };
    if (p.ok) {
      row.verdict = 'ok';
      row.reason = isDefault ? '仕様どおり' : '仕様どおり (設定は既定と違うが、満たしている)';
      return row;
    }
    if (off.length) {
      row.verdict = 'setting';
      row.reason = '設定差: この環境の「'
        + off.map(function(st) { return st.label; }).join('」「')
        + '」が既定 (' + off.map(function(st) { return st.defaultText; }).join('・')
        + ') と違う。既定に戻せば仕様どおりになる';
      return row;
    }
    row.verdict = 'gap';
    row.reason = '仕様後退: 設定は既定なのに ' + _s(c.expect) + ' を満たしていない';
    return row;
  }

  // run(doc, readSetting) — 全項目を突き合わせて行にする。
  // readSetting(key) は localStorage の読み出し (テストでは差し替える)。
  function run(doc, readSetting) {
    var read = typeof readSetting === 'function' ? readSetting : function() { return null; };
    return CHECKS.map(function(c) {
      var p;
      try { p = c.probe(doc); } catch (e) { p = { ok: false, actual: '測れなかった: ' + e.message }; }
      return judge(c, p, read);
    });
  }

  function summary(rows) {
    var r = rows || [];
    var out = { total: r.length, ok: 0, setting: 0, gap: 0 };
    r.forEach(function(x) { if (out[x.verdict] !== undefined) out[x.verdict] += 1; });
    return out;
  }

  // 上に出す 1 行。開いた瞬間に「BLK にすべき不一致が何件か」が読める。
  function summaryText(rows) {
    var s = summary(rows);
    if (!s.total) return '突き合わせる仕様項目がありません';
    if (!s.gap && !s.setting) return s.total + ' 項目すべて仕様どおり';
    var parts = [];
    if (s.gap) parts.push('仕様後退 ' + s.gap + ' 件');
    if (s.setting) parts.push('設定差 ' + s.setting + ' 件');
    return s.total + ' 項目中 ' + parts.join('・') + '（一致 ' + s.ok + ' 件）';
  }

  // 並べ替え: 仕様後退 → 設定差 → 一致。同じ判定なら出典の順 (README の並び) のまま。
  var ORDER = { gap: 0, setting: 1, ok: 2 };
  function sortRows(rows) {
    return (rows || []).slice().sort(function(a, b) {
      return (ORDER[a.verdict] || 0) - (ORDER[b.verdict] || 0);
    });
  }

  // blockerDraft(row) — 仕様後退 1 件を、そのまま BLK 本文にできる文にする。
  // 手順 11 の成果物は BLK なので、言語化まで機械で済ませる。
  function blockerDraft(row) {
    var r = row || {};
    if (r.verdict !== 'gap') return '';
    return [
      'design ' + _s(r.plan) + ' (' + _s(r.spec) + ') の「' + _s(r.title) + '」を GUI が満たしていない。',
      '期待: ' + _s(r.expect),
      '現在: ' + _s(r.actual),
      '設定は既定のままなので、設定差ではなく仕様からの後退。',
    ].join('\n');
  }

  var api = {
    CHECKS: CHECKS, checks: checks, checkById: checkById,
    judge: judge, run: run,
    summary: summary, summaryText: summaryText, sortRows: sortRows,
    blockerDraft: blockerDraft,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.designCheck = api;
  }
})();
