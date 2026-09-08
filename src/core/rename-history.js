'use strict';
window.MA = window.MA || {};

// rename-history — 部品名の改名を「いつ・どの図で・何件」で残し、名前で引ける
// タイムラインにする (BLK-primary-20260908-2103-wish)。
//
// 一括置換のプレビューは「今」のヒット数しか出さない。不具合対応で過去の図を
// 探すとき、旧称が既に置換済みなのかまだ残っているのかは図を開いて中身を読む
// まで分からず、ヒット 0 件でも「置換したから 0」なのか「元から無いから 0」なのか
// 区別できない。この 2 つは意味が正反対なので、履歴として別に残す。
//
// 置換したときにだけ記録する (図を開いた・保存しただけでは増やさない)。
// 記録は保存フォルダごと。localStorage が使えない環境でも置換自体は通す。
window.MA.renameHistory = (function() {

  var KEY = 'plantuml-rename-history';
  var MAX = 200;   // 古い順に落とす。上限は「1 日 40 件の置換 × 5 日」の見当

  function _s(v) { return v == null ? '' : String(v); }

  function _all(store) {
    if (!store) return {};
    try {
      var raw = store.getItem(KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  function _write(store, obj) {
    if (!store) return false;
    try { store.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  // load(store, dir) — そのフォルダの改名履歴。新しいものが先頭。
  function load(store, dir) {
    var all = _all(store);
    var list = all[_s(dir)];
    return Array.isArray(list) ? list : [];
  }

  // makeEntry(from, to, docs, at) — 1 回の置換の記録。
  // docs は [{ name, count }]。件数 0 の図は残さない (当たっていないので履歴ではない)。
  function makeEntry(from, to, docs, at) {
    var rows = (Array.isArray(docs) ? docs : []).map(function(d) {
      return { name: _s(d && d.name), count: Number((d && d.count) || 0) };
    }).filter(function(d) { return d.name !== '' && d.count > 0; });
    rows.sort(function(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    return {
      from: _s(from),
      to: _s(to),
      at: _s(at) || new Date().toISOString(),
      docs: rows,
      total: rows.reduce(function(a, d) { return a + d.count; }, 0),
    };
  }

  // record(store, dir, entry) — 1 件足す。当たった図が 0 枚なら何も残さない。
  // 返すのは足した後の一覧 (呼び出し側が読み直さずに描けるように)。
  function record(store, dir, entry) {
    var list = load(store, dir);
    if (!entry || !entry.from || !entry.docs.length) return list;
    var next = [entry].concat(list).slice(0, MAX);
    var all = _all(store);
    all[_s(dir)] = next;
    _write(store, all);
    return next;
  }

  // names(list) — 履歴に出てくる部品名 (旧称・新称の両方)。選択肢に使う。
  function names(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(e) {
      [e.from, e.to].forEach(function(n) {
        if (n && !seen[n]) { seen[n] = true; out.push(n); }
      });
    });
    out.sort();
    return out;
  }

  // forName(list, name) — その名前が旧称か新称として関わる記録だけ。
  // 「SpiDrv → Spi_Driver」は SpiDrv で引いても Spi_Driver で引いても出す
  // (探しているのは「この部品の改名」であって、綴りの向きではない)。
  function forName(list, name) {
    var want = _s(name);
    if (!want) return [];
    return (Array.isArray(list) ? list : []).filter(function(e) {
      return e.from === want || e.to === want;
    });
  }

  // docNames(list) — その一覧で改名が起きた図の名前。開く枚数を絞るのに使う。
  function docNames(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(e) {
      (e.docs || []).forEach(function(d) {
        if (d.name && !seen[d.name]) { seen[d.name] = true; out.push(d.name); }
      });
    });
    out.sort();
    return out;
  }

  // formatAt(iso) — 一覧に出す日時。秒は要らない (同じ分の 2 件は並び順で読む)。
  function formatAt(iso) {
    var d = new Date(_s(iso));
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // summary(list, name) — 見出しの 1 行。
  // 「履歴が無い」は「改名されていない」であって「調べていない」ではないので、
  // 0 件でも黙らずにそう言い切る (今日の詰まりはここの取り違えから始まる)。
  function summary(list, name) {
    var want = _s(name);
    if (!want) {
      var n = (Array.isArray(list) ? list : []).length;
      return n ? '改名の記録が ' + n + ' 件あります（部品名を入れると絞り込みます）'
               : '改名の記録はまだありません';
    }
    var rows = forName(list, want);
    if (!rows.length) return '「' + want + '」の改名の記録はありません（この名前は置換されていません）';
    var docs = docNames(rows);
    var total = rows.reduce(function(a, e) { return a + e.total; }, 0);
    return '「' + want + '」は ' + rows.length + ' 回・' + docs.length + ' 枚・'
      + total + ' 件 改名されています（最新 ' + formatAt(rows[0].at) + '）';
  }

  function summaryClass(list, name) {
    if (!_s(name)) return 'rh-idle';
    return forName(list, name).length ? 'rh-found' : 'rh-none';
  }

  // line(entry) — 1 行の見出し。「いつ・何から何へ・何枚・何件」。
  function line(entry) {
    if (!entry) return '';
    return formatAt(entry.at) + '  ' + entry.from + ' → ' + entry.to
      + '  ' + entry.docs.length + ' 枚 / ' + entry.total + ' 件';
  }

  // text(list, name) — 不具合票にそのまま貼れる形。
  function text(list, name) {
    var rows = _s(name) ? forName(list, name) : (Array.isArray(list) ? list : []);
    var head = '# 改名履歴' + (_s(name) ? '（' + _s(name) + '）' : '');
    var out = [head, '', summary(list, name), ''];
    if (!rows.length) return out.join('\n') + '\n';
    out.push('| 日時 | 旧称 | 新称 | 図 | 件数 |');
    out.push('| --- | --- | --- | --- | --- |');
    rows.forEach(function(e) {
      out.push('| ' + formatAt(e.at) + ' | ' + e.from + ' | ' + e.to + ' | '
        + e.docs.map(function(d) { return d.name + '(' + d.count + ')'; }).join(' / ')
        + ' | ' + e.total + ' |');
    });
    return out.join('\n') + '\n';
  }

  function clear(store, dir) {
    var all = _all(store);
    delete all[_s(dir)];
    _write(store, all);
    return [];
  }

  return {
    load: load,
    makeEntry: makeEntry,
    record: record,
    names: names,
    forName: forName,
    docNames: docNames,
    formatAt: formatAt,
    summary: summary,
    summaryClass: summaryClass,
    line: line,
    text: text,
    clear: clear,
  };
})();
