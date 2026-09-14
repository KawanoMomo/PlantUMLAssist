'use strict';
window.MA = window.MA || {};

// svg-cross — {name}.svg が、その名前の puml ではなく「別の図」の絵になっていないか。
//
// BLK-reviewer-20260914-0906-wish: server は svg を書き出すとき元 puml の sha1 を
// 末尾に刻む (entry.svgSource) ので、svg-freshness は「今の puml の絵ではない」
// までは言える。だが言えるのはそこまでで、driver_common_class.svg と
// plantuml-class.svg の絵が丸ごと入れ替わった事故では、どちらも同じ「内容ずれ」に
// 見え、「どちらの絵なのか」は reviewer が render API を 1 枚ずつ叩いて
// plantuml-src 埋め込みをデコードして初めて分かった。
//
// 刻まれた印は「どの puml バイト列から書き出したか」そのものなので、同じ
// 保存フォルダの他の図の sha1 と突き合わせれば、相手を名指しできる。
// 判定は 2 つ。
//   cross   — この svg は {of}.puml の絵。相手の絵がこちらに来ているだけ
//   swapped — 2 枚が互いの絵を持っている (入れ替わり)。組で直すもの
//
// 印が無い svg (unstamped) と、印が今の自分の puml と一致する svg はここでは扱わない
// (前者は svg-freshness の「未刻印」、後者は正常)。DOM も fetch も見ない。
window.MA.svgCross = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // sha1 → その中身を持つ図の名前。同じ中身の図が複数あることもあるので配列。
  function ownersByHash(entries) {
    var map = {};
    _list(entries).forEach(function(e) {
      var name = _s(e && e.name), hash = _s(e && e.hash);
      if (!name || !hash) return;
      (map[hash] = map[hash] || []).push(name);
    });
    Object.keys(map).forEach(function(h) { map[h].sort(); });
    return map;
  }

  // entries: GET /autosave の一覧 ({name, hash, svgSource, ...})
  function scan(entries) {
    var list = _list(entries);
    var owners = ownersByHash(list);
    var rows = [], byName = {};
    list.forEach(function(e) {
      var name = _s(e && e.name);
      var stamp = _s(e && e.svgSource);
      var hash = _s(e && e.hash);
      if (!name || !stamp) return;         // 印の無い svg はここでは何も言わない
      if (stamp === hash) return;          // 自分の puml の絵。正常
      var of = (owners[stamp] || []).filter(function(n) { return n !== name; });
      if (!of.length) return;              // ずれてはいるが、相手はこのフォルダに居ない
      var row = { name: name, of: of[0], others: of.slice(1), kind: 'cross' };
      rows.push(row);
      byName[name] = row;
    });
    // 互いの絵を持っている組は「入れ替わり」。片側ずつ直すと必ず取り違えるので、
    // 組であることを判定の側で言う。
    var pairs = [];
    rows.forEach(function(r) {
      var back = byName[r.of];
      if (!back || back.of !== r.name) return;
      r.kind = 'swapped';
      if (r.name < r.of) pairs.push([r.name, r.of]);
    });
    pairs.sort(function(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    rows.sort(function(a, b) {
      if (a.kind !== b.kind) return a.kind === 'swapped' ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return { rows: rows, byName: byName, pairs: pairs, crossed: rows.length };
  }

  function nameOf(scanned, name) {
    return (scanned && scanned.byName && scanned.byName[_s(name)]) || null;
  }

  // 一覧の行に出す印。相手の名前まで入れる — 「ずれている」ではなく
  // 「どの図の絵が来ているか」がこの機能の答えなので、印の側に書く。
  function badge(row) {
    if (!row) return null;
    var extra = row.others && row.others.length
      ? '（同じ中身の図が他にも: ' + row.others.join(', ') + '）' : '';
    if (row.kind === 'swapped') {
      return {
        mark: '絵が入れ替わり',
        title: 'この SVG は ' + row.of + '.puml の絵で、' + row.of + '.svg には'
          + 'この図の絵が入っています。2 枚は組で入れ替わっているので、'
          + '両方を開いて SVG を書き出し直してください' + extra,
      };
    }
    return {
      mark: '他図の絵',
      title: 'この SVG は ' + row.of + '.puml の絵です（' + row.name + '.puml の絵ではありません）。'
        + 'この図を開いて SVG を書き出し直すと直ります' + extra,
    };
  }

  // 一覧の見出しに出す 1 行。クロスが無ければ空 (無い話を毎回出さない)。
  function summaryLine(scanned) {
    var s = scanned || { rows: [], pairs: [] };
    if (!s.rows.length) return '';
    var out = 'SVG の出力先クロス: ' + s.rows.length + ' 枚';
    if (s.pairs.length) {
      out += '（うち入れ替わり ' + s.pairs.length + ' 組: '
        + s.pairs.map(function(p) { return p[0] + ' ⇄ ' + p[1]; }).join('、') + '）';
    }
    return out;
  }

  // 保存の直後にステータスバーへ足す 1 行。保存した図が巻き込まれていれば
  // その図のことを、そうでなければフォルダ全体の件数を言う。
  function saveLine(scanned, savedName) {
    var s = scanned || { rows: [] };
    var row = nameOf(s, savedName);
    if (row) {
      return row.kind === 'swapped'
        ? '⚠ この図の SVG は ' + row.of + ' と入れ替わっています'
        : '⚠ この図の SVG は ' + row.of + '.puml の絵です';
    }
    if (!s.rows.length) return '';
    return '⚠ SVG の出力先クロス ' + s.rows.length + ' 枚（📂一覧で確認）';
  }

  return {
    ownersByHash: ownersByHash, scan: scan, nameOf: nameOf,
    badge: badge, summaryLine: summaryLine, saveLine: saveLine,
  };
})();
