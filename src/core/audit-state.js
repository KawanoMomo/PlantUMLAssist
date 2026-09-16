'use strict';

// audit-state — 前回比較用の控え (.assist-audit-last.json) を「対象ごと」に持つ。
//
// BLK-reviewer-20260914-2206: 控えは CLI を打つ場所に 1 個しか無く、どの対象を
// 渡した回でも同じファイルを上書きしていた。`-p primary` の次に `-p junior,primary`
// を打つ (どちらも reviewer の毎 tick の手順)、あるいはテストが一時フォルダを
// 対象に audit.js を回すと、次の素の回は「別の対象で採った控え」と比べることになり、
// 図はバイト無差分でも全枚が「前回控えから変わった図」に、指摘は全件が「新規」に出る。
// --board だけが食い違って見えたのはこれが根で、経路 (--names / findings.js /
// --only) を 1 つずつ塞いでも、控えを共有している限り次の run で別経路に出る。
//
// 対象の集合を鍵にして控えを分けて持てば、どの順で打っても各対象は自分の前回とだけ
// 比べる。鍵が一致しない控えは「無い」と同じ扱いにして、黙って比較しない。
// DOM に触らないので node からも browser からも require できる。
(function() {
  var MAX_SCOPES = 8;

  function _norm(p) {
    return String(p || '').split('\\').join('/').replace(/\/+$/, '').toLowerCase();
  }

  // FNV ベースの指紋は audit-scope が持っているので、それを借りる (2 か所で数えない)。
  function _scope() {
    if (typeof window !== 'undefined' && window.MA && window.MA.auditScope) return window.MA.auditScope;
    if (typeof require === 'function') { try { return require('./audit-scope.js'); } catch (e) {} }
    return null;
  }

  // 対象の集合の鍵。順番と表記 (区切り・末尾スラッシュ・大文字小文字) では変わらない。
  // 「同じフォルダを同じ組で渡した回」だけが同じ鍵になる。
  function scopeKey(targets) {
    var list = (targets || []).map(_norm).filter(Boolean).sort();
    var joined = list.join('\n');
    var sc = _scope();
    var h = sc ? sc.fingerprint(joined) : String(joined.length);
    return list.length + '-' + h;
  }

  // 控えファイルの中身 → store。壊れていれば空の store (「前回なし」と同じ)。
  // 対象ごとに分ける前の形 (トップレベルに audits を持つ 1 件だけの控え) も、
  // その JSON が名乗る targets の鍵で 1 件として読む。移行の回だけ比較を失わない。
  function readStore(text) {
    var raw = null;
    try { raw = JSON.parse(String(text || '')); } catch (e) { return { scopes: {} }; }
    if (!raw || typeof raw !== 'object') return { scopes: {} };
    if (raw.scopes && typeof raw.scopes === 'object') return { scopes: raw.scopes };
    if (raw.audits) {
      var s = {};
      s[scopeKey(raw.targets || [])] = {
        targets: raw.targets || [], savedAt: raw.generatedAt || null, report: raw,
      };
      return { scopes: s };
    }
    return { scopes: {} };
  }

  // その対象の控え。無ければ null。別対象の控えは覗かない。
  function pick(store, targets) {
    var e = store && store.scopes ? store.scopes[scopeKey(targets)] : null;
    return e && e.report && e.report.audits ? e : null;
  }

  // 控えを差し替える。古いものから落として MAX_SCOPES 件までに保つ
  // (対象の組は reviewer の手順の数だけで、無限には増えない)。
  function put(store, targets, report, now, max, mark) {
    var st = (store && store.scopes) ? { scopes: store.scopes } : { scopes: {} };
    var key = scopeKey(targets);
    // BLK-reviewer-20260917-0523: 無変化 tick の印は控えを差し替えても引き継ぐ。
    // 名指しが無ければ前回の印をそのまま残す (報告を書き替えただけで連続数が
    // 0 に戻ると、数えるのをやめるための数字がまた当てにならなくなる)。
    var keep = (mark === undefined && st.scopes[key]) ? st.scopes[key].mark : mark;
    st.scopes[key] = {
      targets: (targets || []).slice(),
      savedAt: now || new Date().toISOString(),
      report: report,
      mark: keep || null,
    };
    var keys = Object.keys(st.scopes);
    var cap = max || MAX_SCOPES;
    if (keys.length > cap) {
      keys.sort(function(a, b) {
        return String(st.scopes[a].savedAt || '').localeCompare(String(st.scopes[b].savedAt || ''));
      });
      for (var i = 0; i < keys.length - cap; i++) delete st.scopes[keys[i]];
    }
    return st;
  }

  // 無変化 tick の印だけを読む。控えの本文 (report) が古い形でも印は読める。
  function pickMark(store, targets) {
    var e = store && store.scopes ? store.scopes[scopeKey(targets)] : null;
    return (e && e.mark) ? e.mark : null;
  }

  // 印だけを差し替える。監査を回さずに降りた回 (入口で無変化と分かった回) は
  // 控えの本文を書き替えないので、印を進める口がここだけ要る。
  function putMark(store, targets, mark) {
    var st = (store && store.scopes) ? { scopes: store.scopes } : { scopes: {} };
    var key = scopeKey(targets);
    var e = st.scopes[key];
    if (!e) {
      st.scopes[key] = { targets: (targets || []).slice(), savedAt: null, report: null, mark: mark || null };
    } else {
      e.mark = mark || null;
    }
    return st;
  }

  function serialize(store) {
    return JSON.stringify({ version: 2, scopes: (store && store.scopes) || {} }, null, 2);
  }

  // 控えがどの対象のいつの物かを 1 行で言う。--board / --summary はこれを出して、
  // reviewer が「今の数字が何と比べた数字か」を手で確かめ直さずに済むようにする。
  function describe(entry) {
    if (!entry) return 'この対象の控えはありません (対象ごとに別々に持ちます。次の素の回から比較します)';
    var when = entry.savedAt || (entry.report && entry.report.generatedAt) || '(時刻不明)';
    var tg = (entry.targets && entry.targets.length) ? entry.targets.join(' / ') : '(対象不明)';
    return when + ' に ' + tg + ' で採った控え';
  }

  var api = {
    MAX_SCOPES: MAX_SCOPES,
    scopeKey: scopeKey, readStore: readStore, pick: pick, put: put,
    pickMark: pickMark, putMark: putMark,
    serialize: serialize, describe: describe,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.auditState = api;
  }
})();
