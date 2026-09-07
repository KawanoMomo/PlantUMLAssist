'use strict';

// audit-scope — 監査にかける .puml 1 枚ずつを「実データ」と「テンプレ」に分け、
// 内容の指紋を採る。
//
// BLK-reviewer-20260908-0203: --since は「監査対象になる指摘」の増減しか見て
// いないので、新規指摘が出たとき、それが実データ (ドメインの図) の変更による
// ものか、対象外扱いのテンプレ (アプリ同梱の plantuml-*.puml や新規タブの
// 既定サンプル diagram1.puml) の汚染によるものかを区別できない。さらに、
// テンプレの内容がまるごと差し替わっても、そこから指摘が出ない限り差分に
// 一切現れない。どちらの切り分けも 22 枚を 1 枚ずつ手で diff するしかなかった。
//
// 分類と指紋をレポートに載せておけば、次の run では「実データ 0 枚変化 /
// テンプレ 3 枚変化」と 1 行で読める。DOM には触らない。node からも browser
// からも require できる。
(function() {
  // テンプレの見分けは名前で決める。中身で判定すると、テンプレが汚染された
  // (= 中身が変わった) ときに分類まで変わってしまい、いちばん知りたい
  // 「テンプレが変わった」が「テンプレが 1 枚消えて実データが 1 枚増えた」に
  // 化ける。名前は汚染では変わらないので、分類の軸として安定する。
  var RULES = [
    { re: /^plantuml-[a-z0-9_-]+$/i, reason: 'アプリ同梱テンプレ' },
    { re: /^diagram\d*$/i, reason: '新規タブの既定サンプル' },
    { re: /^(sample|template|untitled)[\d_-]*$/i, reason: '既定名のまま' },
  ];

  function baseName(name) {
    var s = String(name || '').split('\\').join('/');
    var i = s.lastIndexOf('/');
    if (i >= 0) s = s.slice(i + 1);
    return s.replace(/\.(puml|pu|plantuml)$/i, '');
  }

  // { kind: 'data' | 'template', reason }。reason は実データなら null。
  function classify(name) {
    var b = baseName(name);
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(b)) return { kind: 'template', reason: RULES[i].reason };
    }
    return { kind: 'data', reason: null };
  }

  // 内容の指紋。crypto を使わないのは browser と node で同じ値にするため。
  // 衝突しても困るのは「変わったのに変わっていないと出る」ときだけなので、
  // 32bit を 2 本 (FNV-1a を向きを変えて 2 回) 並べて 16 桁にする。
  function fingerprint(text) {
    var s = String(text === null || text === undefined ? '' : text);
    var a = 0x811c9dc5, b = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      a = ((a ^ s.charCodeAt(i)) >>> 0) * 0x01000193 >>> 0;
      b = ((b ^ s.charCodeAt(s.length - 1 - i)) >>> 0) * 0x85ebca6b >>> 0;
    }
    function hex(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
    return hex(a) + hex(b);
  }

  // docs = [{ name, dsl }] → [{ name, kind, reason, hash, bytes, lines }]
  function fileEntries(docs) {
    return (docs || []).map(function(d) {
      var c = classify(d.name);
      var dsl = String(d.dsl === null || d.dsl === undefined ? '' : d.dsl);
      return {
        name: d.name, kind: c.kind, reason: c.reason,
        hash: fingerprint(dsl), bytes: dsl.length,
        lines: dsl ? dsl.split('\n').length : 0,
      };
    });
  }

  var KIND_LABEL = { data: '実データ', template: 'テンプレ' };

  // 前回 → 今回のファイル差分。前回に files が無ければ null を返す
  // (「変化なし」と「追えない」は読む側にとって別物なので混ぜない)。
  function diffFiles(prevFiles, curFiles) {
    if (!prevFiles || !prevFiles.length) return null;
    var pi = {}, ci = {};
    prevFiles.forEach(function(f) { pi[f.name] = f; });
    (curFiles || []).forEach(function(f) { ci[f.name] = f; });

    var changed = [], added = [], removed = [];
    (curFiles || []).forEach(function(f) {
      var p = pi[f.name];
      if (!p) { added.push(f); return; }
      if (p.hash !== f.hash) {
        changed.push({
          name: f.name, kind: f.kind, reason: f.reason,
          from: p.hash, to: f.hash, bytes: f.bytes - (p.bytes || 0),
          // 分類が変わった (= 名前で決めているので実際は起きない) 場合に
          // 黙って実データ側で数えないよう、前回の分類も持たせる。
          wasKind: p.kind,
        });
      }
    });
    prevFiles.forEach(function(f) { if (!ci[f.name]) removed.push(f); });

    function byKind(list, kind) { return list.filter(function(f) { return f.kind === kind; }); }
    return {
      changed: changed, added: added, removed: removed,
      dataChanged: byKind(changed, 'data'), templateChanged: byKind(changed, 'template'),
      dataAdded: byKind(added, 'data'), templateAdded: byKind(added, 'template'),
      dataRemoved: byKind(removed, 'data'), templateRemoved: byKind(removed, 'template'),
      touched: changed.length + added.length + removed.length,
    };
  }

  function _names(list, max) {
    var n = max || 5;
    var out = list.slice(0, n).map(function(f) { return f.name; });
    if (list.length > n) out.push('ほか ' + (list.length - n) + ' 枚');
    return out.join(', ');
  }

  // --summary に足す行。指摘の増減と並べて読めるように、必ず 1 行は返す。
  function formatFileDiff(fd, curFiles) {
    var cur = curFiles || [];
    var nData = cur.filter(function(f) { return f.kind === 'data'; }).length;
    var nTpl = cur.length - nData;
    var head = '内訳: 実データ ' + nData + ' 枚 / テンプレ ' + nTpl + ' 枚';
    if (!fd) return [head + ' (前回の JSON にファイル指紋が無く内容変化は追えない。次回から比較します)'];

    var lines = [head];
    if (!fd.touched) {
      lines.push('ファイル内容: 前回から変化なし (実データ・テンプレとも同一)');
      return lines;
    }
    var parts = [];
    parts.push('実データ ' + fd.dataChanged.length + ' 枚変化');
    parts.push('テンプレ ' + fd.templateChanged.length + ' 枚変化');
    lines.push('ファイル内容: ' + parts.join(' / '));
    if (fd.dataChanged.length) lines.push('  実データ変化: ' + _names(fd.dataChanged));
    if (fd.templateChanged.length) lines.push('  テンプレ変化: ' + _names(fd.templateChanged));
    if (fd.added.length) {
      lines.push('  追加: ' + _names(fd.added)
        + ' (実データ ' + fd.dataAdded.length + ' / テンプレ ' + fd.templateAdded.length + ')');
    }
    if (fd.removed.length) {
      lines.push('  消失: ' + _names(fd.removed)
        + ' (実データ ' + fd.dataRemoved.length + ' / テンプレ ' + fd.templateRemoved.length + ')');
    }
    // いちばん効くのはここ。新規指摘が出たときに実データが 1 枚も動いて
    // いなければ、図を 22 枚 diff する前に原因をテンプレ側へ寄せられる。
    if (!fd.dataChanged.length && !fd.dataAdded.length && !fd.dataRemoved.length) {
      lines.push('  → 実データは無変更。指摘が動いていれば原因は監査側かテンプレ側');
    } else if (!fd.templateChanged.length && !fd.templateAdded.length && !fd.templateRemoved.length) {
      lines.push('  → テンプレは無変更。指摘の増減は実データの変更によるもの');
    }
    return lines;
  }

  var api = {
    RULES: RULES, KIND_LABEL: KIND_LABEL,
    baseName: baseName, classify: classify, fingerprint: fingerprint,
    fileEntries: fileEntries, diffFiles: diffFiles, formatFileDiff: formatFileDiff,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.auditScope = api;
  }
})();
