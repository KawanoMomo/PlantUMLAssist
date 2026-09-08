'use strict';
window.MA = window.MA || {};

// domain-verdict — 同じドメインの図がフォルダ (ペルソナ) 間で食い違っていたとき、
// その場で「共有ドメインとして統一する」か「別物として title に明示する」かを
// 決めて、自分の図にだけ書き戻す。
//
// BLK-primary-20260909-0503-wish: レビュー指摘「junior の GPIO 図と primary の
// GPIO 図が別物」を反映するとき、domain-cohort の突合で差分は見えるようになったが、
// 見えた後にできることが無かった。統一するなら綴りの違う部品名を自分の図で
// 手で打ち替え、別物とするなら title を手で書き足すしかなく、しかも「この食い違いは
// 見たうえで別物と決めた」ことがファイルのどこにも残らないので、次に突合すると
// 同じ食い違いが同じ顔でまた出てくる。
//
// 書き換えるのは常に自分のフォルダの図 1 枚だけ (相手の図には触らない)。
// 置換は bulk-rename の識別子単位の規則をそのまま使うので、画面の一括置換と
// 同じ範囲だけが変わる。
//
// DOM も fetch も触らない。保存は app.js。
window.MA.domainVerdict = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _dc() { return window.MA.domainCohort; }
  function _br() { return window.MA.bulkRename; }

  function _names(doc) {
    var dc = _dc();
    return dc ? dc.namesOf(doc) : [];
  }

  function _dsl(doc) {
    var du = window.MA.dslUtils;
    if (du && du.docDsl) return du.docDsl(doc);
    return _s(doc && doc.dsl);
  }

  // ── 統一案 ──────────────────────────────────────────────────────────
  // 役どころの語の略し方。Gpio_Driver と GpioDrv は name-audit の正規化キー
  // (大小と区切りだけを落とす) では別物になるが、現場では同じ部品の綴り違い。
  // 綴りを寄せる相手を探すときだけ、この対応で長い方を短い方に寄せて比べる。
  var ABBREV = [
    [/driver/g, 'drv'], [/controller/g, 'ctrl'], [/control/g, 'ctrl'],
    [/manager/g, 'mgr'], [/handler/g, 'hdl'], [/hardware/g, 'hw'],
    [/interrupt/g, 'irq'], [/peripheral/g, 'periph'],
    [/configuration/g, 'cfg'], [/config/g, 'cfg'],
    [/initialization/g, 'init'], [/initialize/g, 'init'],
    [/register/g, 'reg'], [/module/g, 'mod'], [/service/g, 'svc'],
  ];

  // 綴りを寄せるときの照合キー。
  function matchKey(name) {
    var na = window.MA.nameAudit;
    var k = na ? na.normalizeKey(name) : _s(name).toLowerCase().replace(/[_\-.\s]/g, '');
    ABBREV.forEach(function(p) { k = k.replace(p[0], p[1]); });
    return k;
  }

  // 同じ部品を指していると読める名前 (Gpio_Driver / GpioDrv) を、相手の綴りへ
  // 寄せる置換の一覧。相手の候補が 2 つ以上ある名前は置換にしない (どちらへ寄せる
  // かは機械では決まらない)。片方にしか無い名前も置換にせず、数だけ添えて人が見る。
  function unifyPlan(mineDoc, otherDoc) {
    var br = _br();
    var mine = _names(mineDoc);
    var other = _names(otherDoc);
    var byKey = {};
    other.forEach(function(o) {
      var k = matchKey(o.name);
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(o.name);
    });
    var dsl = _dsl(mineDoc);
    var renames = [];
    var mineKeys = {};
    mine.forEach(function(m) {
      var k = matchKey(m.name);
      mineKeys[k] = true;
      var cands = byKey[k];
      if (!cands || cands.length !== 1) return;
      var to = cands[0];
      if (to === m.name) return;
      renames.push({ from: m.name, to: to, count: br ? br.countIn(dsl, m.name) : 0 });
    });
    return {
      renames: renames,
      // 相手にしか無い / 自分にしか無い名前。統一しても消えない差として見せる。
      missing: other.filter(function(o) { return !mineKeys[matchKey(o.name)]; })
        .map(function(o) { return o.name; }),
      extra: mine.filter(function(m) { return !byKey[matchKey(m.name)]; })
        .map(function(m) { return m.name; }),
    };
  }

  function applyUnify(dsl, renames) {
    var br = _br();
    var out = _s(dsl);
    if (!br) return out;
    (renames || []).forEach(function(r) {
      if (!r || !_s(r.from) || !_s(r.to) || r.from === r.to) return;
      out = br.replaceIn(out, r.from, r.to);
    });
    return out;
  }

  // ── 別物として明示 ──────────────────────────────────────────────────
  var TITLE_RE = /^(\s*title\s+)(.*)$/i;
  // 前に付けた但し書き。付け直しても二重にならないよう毎回落としてから足す。
  var SUFFIX_RE = /\s*\([^()]*とは別のドメイン\)\s*$/;

  function titleOf(dsl) {
    var lines = _s(dsl).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(TITLE_RE);
      if (m) return m[2].trim();
    }
    return '';
  }

  function _suffix(otherFolder, domain) {
    return ' (' + _s(otherFolder) + ' の ' + _s(domain) + ' とは別のドメイン)';
  }

  // title が無い図には、ファイル名 (base) を土台にした title を作る。
  // 「別物と決めた」ことは title に出ていないと、図を開いた人には伝わらない。
  function distinguishPlan(mineDoc, opts) {
    var o = opts || {};
    var dsl = _dsl(mineDoc);
    var cur = titleOf(dsl);
    var base = cur ? cur.replace(SUFFIX_RE, '') : _s(o.base || (_dc() ? _dc().baseOf(mineDoc && mineDoc.name) : ''));
    var to = base + _suffix(o.otherFolder, o.domain);
    return { from: cur, to: to, hadTitle: !!cur };
  }

  function applyDistinguish(dsl, plan) {
    var text = _s(dsl);
    var to = _s(plan && plan.to);
    if (!to) return text;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(TITLE_RE);
      if (m) { lines[i] = m[1] + to; return lines.join('\n'); }
    }
    // @startuml の直後に置く。無ければ先頭。
    var at = -1;
    for (var j = 0; j < lines.length; j++) {
      if (/^\s*@startuml\b/i.test(lines[j])) { at = j; break; }
    }
    lines.splice(at + 1, 0, 'title ' + to);
    return lines.join('\n');
  }

  // ── 判断の印 ────────────────────────────────────────────────────────
  // ファイル自身に残す (突合の画面は毎回ファイルから作り直すので、別に控えを
  // 持つと「印はあるが図は直っていない」がすぐ生まれる)。
  var MARK_RE = /^\s*'\s*domain-verdict:\s*(shared|separate)\s+(\S+)\s+vs\s+(\S+)\s*$/i;

  function markLine(kind, domain, otherFolder) {
    return "' domain-verdict: " + _s(kind) + ' ' + _s(domain) + ' vs ' + _s(otherFolder);
  }

  function readVerdict(dsl, otherFolder) {
    var lines = _s(dsl).split(/\r?\n/);
    var want = _s(otherFolder).toLowerCase();
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(MARK_RE);
      if (!m) continue;
      if (want && m[3].toLowerCase() !== want) continue;
      return { kind: m[1].toLowerCase(), domain: m[2], other: m[3] };
    }
    return null;
  }

  // 同じ相手についての印は 1 本だけ残す (前の判断を消してから足す)。
  function applyMark(dsl, kind, domain, otherFolder) {
    var lines = _s(dsl).split(/\r?\n/);
    var want = _s(otherFolder).toLowerCase();
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(MARK_RE);
      if (m && (!want || m[3].toLowerCase() === want)) continue;
      kept.push(lines[i]);
    }
    var at = -1;
    for (var j = 0; j < kept.length; j++) {
      if (/^\s*@startuml\b/i.test(kept[j])) { at = j; break; }
    }
    kept.splice(at + 1, 0, markLine(kind, domain, otherFolder));
    return kept.join('\n');
  }

  // ── 実行 ────────────────────────────────────────────────────────────
  // kind: 'shared' = 相手の綴りへ寄せる / 'separate' = title に但し書きを足す。
  // どちらでも印を 1 本足す。返すのは新しい DSL と、何が変わったかの説明。
  function apply(kind, mineDoc, otherDoc, opts) {
    var o = opts || {};
    var dsl = _dsl(mineDoc);
    var out = dsl;
    var detail = { kind: kind, renames: [], title: null };
    if (kind === 'shared') {
      var plan = unifyPlan(mineDoc, otherDoc);
      detail.renames = plan.renames;
      detail.missing = plan.missing;
      detail.extra = plan.extra;
      out = applyUnify(out, plan.renames);
    } else if (kind === 'separate') {
      var tp = distinguishPlan(mineDoc, o);
      detail.title = tp;
      out = applyDistinguish(out, tp);
    } else {
      return null;
    }
    out = applyMark(out, kind, o.domain, o.otherFolder);
    return { dsl: out, changed: out !== dsl, detail: detail };
  }

  // 画面と run ログに出す 1 行。
  function summaryLine(result) {
    var d = result && result.detail;
    if (!d) return '';
    if (d.kind === 'shared') {
      if (!d.renames.length) return '統一: 綴りの違う部品名はありませんでした (印だけ付けました)';
      return '統一: ' + d.renames.length + ' 語を相手の綴りに揃えました ('
        + d.renames.map(function(r) { return r.from + ' → ' + r.to; }).join(', ') + ')';
    }
    return '別物: title を「' + (d.title ? d.title.to : '') + '」にしました';
  }

  return {
    unifyPlan: unifyPlan,
    applyUnify: applyUnify,
    titleOf: titleOf,
    distinguishPlan: distinguishPlan,
    applyDistinguish: applyDistinguish,
    markLine: markLine,
    readVerdict: readVerdict,
    applyMark: applyMark,
    apply: apply,
    summaryLine: summaryLine,
  };
})();
