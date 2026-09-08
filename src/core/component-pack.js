'use strict';
window.MA = window.MA || {};

// component-pack — 1 つの部品の図を「設計書に貼る資料」としてまとめて書き出す。
//
// 設計書には同じ部品 (例: GPIO ドライバ) のシーケンス・状態遷移・クラス… を並べて
// 貼る。今までは 1 枚ずつ「開き直す → Export → PNG」を図種の数だけ繰り返していた。
// 保存フォルダのファイル名は部品名で始まるので (GPIOドライバユースケース.puml,
// GPIOドライバ状態遷移.puml …)、名前から部品を割り出せば「この部品の図」を人が
// 選び直さずに集められる。図番号・図名を通し番号で振るところまでやって初めて
// 設計書に貼れる資料になるので、番号付けもここで行う。
//
// ファイル I/O と描画には触らない。名前の解釈と割り当てだけを持つので単体テストできる。
window.MA.componentPack = (function() {

  // 図種の語。長いものから順に照合する (「派生クラス」を「クラス」より先に取る)。
  var KINDS = [
    ['コンポーネント構成', 'コンポーネント図'],
    ['ユースケース', 'ユースケース図'],
    ['アクティビティ', 'アクティビティ図'],
    ['コンポーネント', 'コンポーネント図'],
    ['オブジェクト', 'オブジェクト図'],
    ['シーケンス', 'シーケンス図'],
    ['状態遷移', '状態遷移図'],
    ['派生クラス', 'クラス図'],
    ['クラス', 'クラス図'],
    ['配置', '配置図'],
    ['usecase', 'ユースケース図'],
    ['component', 'コンポーネント図'],
    ['activity', 'アクティビティ図'],
    ['sequence', 'シーケンス図'],
    ['state', '状態遷移図'],
    ['class', 'クラス図'],
  ];

  // 設計書に並べる順。読み手は「何のための部品か → 構造 → 動き」で読む。
  var KIND_ORDER = ['ユースケース図', 'コンポーネント図', 'クラス図', 'オブジェクト図',
                    '配置図', 'シーケンス図', 'アクティビティ図', '状態遷移図'];

  function _stripExt(name) {
    return String(name == null ? '' : name).replace(/\.[A-Za-z0-9]+$/, '');
  }

  // 版の別 (「(先輩反映)」「(資料用)」…)。部品の区別ではないので分類からは外し、
  // 図名には残す (どの版を貼ったか設計書側で分かる必要がある)。
  function variantOf(name) {
    var base = _stripExt(name);
    var parts = base.match(/[(（][^)）]*[)）]/g);
    if (!parts || !parts.length) return '';
    return parts.map(function(p) { return p.slice(1, -1).trim(); })
                .filter(function(s) { return s !== ''; }).join('・');
  }

  function _withoutVariant(name) {
    return _stripExt(name).replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, '').trim();
  }

  // kindOf(name) — 名前に含まれる図種の語から図種を決める。分からなければ ''。
  function kindOf(name) {
    var s = _withoutVariant(name).toLowerCase();
    var best = null;
    for (var i = 0; i < KINDS.length; i++) {
      var at = s.lastIndexOf(KINDS[i][0].toLowerCase());
      if (at < 0) continue;
      // 末尾に近いものを図種とみなす (「GPIO状態ドライバシーケンス」なら シーケンス)。
      if (!best || at > best.at) best = { at: at, kind: KINDS[i][1], word: KINDS[i][0] };
    }
    return best ? best.kind : '';
  }

  // baseOf(name) — 図種の語と区切り記号を落として「部品らしい部分」を残す。
  // GPIOドライバ初期化シーケンス → GPIOドライバ初期化 / gpio_state → gpio
  function baseOf(name) {
    var s = _withoutVariant(name);
    var low = s.toLowerCase();
    var cut = s.length;
    for (var i = 0; i < KINDS.length; i++) {
      var w = KINDS[i][0].toLowerCase();
      var at = low.lastIndexOf(w);
      if (at >= 0 && at + w.length === low.length && at < cut) cut = at;
    }
    return s.slice(0, cut).replace(/[-_.\s]+$/, '');
  }

  // groupByComponent(names) — 部品ごとにまとめる。
  //
  // baseOf だけでは「GPIOドライバ初期化」と「GPIOドライバ」が別の部品になる
  // (初期化はその部品の中の場面であって別部品ではない)。片方が他方の先頭に
  // 完全一致するときだけ短いほうへ寄せる。先頭の一部が同じだけ (can_init と
  // candrv) では寄せない — 別部品を 1 つに混ぜるほうが害が大きい。
  function groupByComponent(names) {
    // server の一覧は拡張子を落とした名前を返し、フォルダを直接読んだときは
    // .puml が付く。どちらの形でも図として拾い、.png や .json など別の拡張子を
    // 持つものだけを外す (資料の PNG が図として混ざらないように)。
    var list = (Array.isArray(names) ? names : []).filter(function(n) {
      if (typeof n !== 'string' || n === '') return false;
      if (/\.puml$/i.test(n)) return true;
      return !/\.[A-Za-z0-9]+$/.test(n);
    });

    var bases = [];
    var byBase = {};
    for (var i = 0; i < list.length; i++) {
      var b = baseOf(list[i]);
      if (b === '') b = _withoutVariant(list[i]);
      var key = b.toLowerCase();
      if (!byBase[key]) { byBase[key] = { name: b, files: [] }; bases.push(key); }
      byBase[key].files.push(list[i]);
    }

    // 短い base から順に見て、それを先頭に持つ長い base を吸収する。
    bases.sort(function(a, b) { return a.length - b.length || (a < b ? -1 : 1); });
    var roots = [];
    for (var j = 0; j < bases.length; j++) {
      var k = bases[j];
      var parent = null;
      for (var r = 0; r < roots.length; r++) {
        if (k !== roots[r] && k.indexOf(roots[r]) === 0 && roots[r].length >= 2) { parent = roots[r]; break; }
      }
      if (parent) {
        byBase[parent].files = byBase[parent].files.concat(byBase[k].files);
      } else {
        roots.push(k);
      }
    }

    var out = roots.map(function(k) {
      return { component: byBase[k].name, files: byBase[k].files.slice().sort() };
    });
    out.sort(function(a, b) { return a.component < b.component ? -1 : (a.component > b.component ? 1 : 0); });
    return out;
  }

  function _rank(kind) {
    var at = KIND_ORDER.indexOf(kind);
    return at < 0 ? KIND_ORDER.length : at;
  }

  // ファイル名に使えない文字を落とす (zip の項目名にもそのまま入る)。
  function safeName(s) {
    return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  }

  // planPack(component, files) — 図種の順に並べ、図1, 図2 … を振る。
  // 返り値の各件: { no, figure, kind, source, title, filename }
  function planPack(component, files) {
    var comp = String(component == null ? '' : component);
    var list = (Array.isArray(files) ? files : []).filter(function(f) { return typeof f === 'string' && f !== ''; });

    var items = list.map(function(f, i) {
      return { source: f, kind: kindOf(f) || '図', variant: variantOf(f), at: i };
    });
    items.sort(function(a, b) {
      var d = _rank(a.kind) - _rank(b.kind);
      if (d !== 0) return d;
      if (a.source !== b.source) return a.source < b.source ? -1 : 1;
      return a.at - b.at;
    });

    var used = {};
    return items.map(function(it, i) {
      var no = i + 1;
      var figure = '図' + no;
      // name は図番号を含まない図名。title は設計書に置くキャプション (図番号 + 図名)。
      var nm = (comp + ' ' + it.kind + (it.variant ? '（' + it.variant + '）' : '')).replace(/\s+/g, ' ').trim();
      var title = figure + ' ' + nm;
      var stem = safeName(figure + '_' + comp + '_' + it.kind + (it.variant ? '_' + it.variant : ''));
      var name = stem;
      var n = 2;
      while (used[name.toLowerCase()]) { name = stem + '-' + n; n++; }
      used[name.toLowerCase()] = true;
      return {
        no: no,
        figure: figure,
        name: nm,
        kind: it.kind,
        variant: it.variant,
        source: it.source,
        title: title.replace(/\s+/g, ' ').trim(),
        filename: name + '.png',
      };
    });
  }

  // indexText(component, items) — 設計書にそのまま貼れる図一覧 (図番号 → 図名 → ファイル)。
  // 資料は「図の束」だけでは使えない。図番号と図名の対応表が要る。
  function indexText(component, items) {
    var list = Array.isArray(items) ? items : [];
    var lines = ['# ' + String(component == null ? '' : component) + ' 図一覧', ''];
    if (!list.length) {
      lines.push('書き出せる図がありません。');
      return lines.join('\n') + '\n';
    }
    lines.push('| 図番号 | 図名 | ファイル |');
    lines.push('| --- | --- | --- |');
    for (var i = 0; i < list.length; i++) {
      lines.push('| ' + list[i].figure + ' | ' + list[i].name + ' | ' + list[i].filename + ' |');
    }
    return lines.join('\n') + '\n';
  }

  // summarize(results) — 各件 { filename, ok } を 1 行にする。
  function summarize(component, results) {
    var list = Array.isArray(results) ? results : [];
    var ok = 0;
    var failed = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].ok) ok++;
      else if (list[i]) failed.push(list[i].filename);
    }
    var comp = String(component == null ? '' : component);
    var message;
    if (list.length === 0) message = comp + ' の図が見つかりません';
    else if (!failed.length) message = comp + ' の図 ' + list.length + ' 枚を PNG で書き出しました';
    else message = comp + ' の図 ' + list.length + ' 枚中 ' + ok + ' 枚を書き出しました（失敗: ' + failed.join(', ') + '）';
    return { total: list.length, ok: ok, failed: failed.length, failedNames: failed, message: message };
  }

  // packName(component, now) — 添付として見分けが付く zip 名。
  function packName(component, now) {
    var d = now || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var comp = safeName(component) || 'diagrams';
    return comp + '-資料-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes()) + '.zip';
  }

  return {
    kindOf: kindOf,
    baseOf: baseOf,
    variantOf: variantOf,
    groupByComponent: groupByComponent,
    planPack: planPack,
    indexText: indexText,
    summarize: summarize,
    packName: packName,
    safeName: safeName,
  };
})();
