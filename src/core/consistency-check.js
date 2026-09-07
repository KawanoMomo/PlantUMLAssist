'use strict';
window.MA = window.MA || {};

// consistency-check — 参照図(先輩の図)と編集中の図を突き合わせ、
// 保存前に「食い違っている所」を挙げる。
//
// GPIO / UART / CAN のように同じ雛形を部品名だけ替えて書き写す業務では、
// 打ち間違い・並べ間違いは慣れの問題ではなく毎回起きる。目視で見比べてから
// 保存し、後で直す、という段取りをやめるために、突き合わせの規則をここに置く。
//
// 見るのは 3 つだけ。どれも「雛形をなぞっているはず」という前提から外れた所を指す。
//   order  — 要素と関係の並びが参照図とずれている (行の抜け・入れ違い)
//   suffix — ラベルの語尾が参照図で揃っている形から外れている (「〜を設定」の統一)
//   typo   — 参照図の名前と 1 文字だけ違う名前 (部品名の置換し損ね・打ち間違い)
// 部品名がまるごと違うのは置換した結果なので、指摘しない。
window.MA.consistencyCheck = (function() {

  // 突き合わせに使う節。title と、ブロックの開き閉じは並びの骨格に数えない。
  function _spine(nodes) {
    var out = [];
    (nodes || []).forEach(function(n) {
      if (!n || n.kind === 'title') return;
      out.push(n);
    });
    return out;
  }

  // 語尾。日本語は最後の「を」より後ろ、無ければ末尾 3 文字。
  // 英数字だけのラベルは最後の語。空なら語尾なしとして扱う。
  function suffixOf(label) {
    var s = String(label == null ? '' : label).trim();
    if (s === '') return '';
    var i = s.lastIndexOf('を');
    if (i >= 0 && i < s.length - 1) return s.slice(i + 1);
    if (/^[\x20-\x7E]+$/.test(s)) {
      var parts = s.split(/[\s()]+/).filter(function(p) { return p !== ''; });
      return parts.length ? parts[parts.length - 1] : '';
    }
    return s.length <= 3 ? s : s.slice(-3);
  }

  // outline の節は、宣言なら label が名前・relation なら label が「A -> B」で
  // detail が文言。語尾は文言について、打ち間違いは名前について見る。
  function _textOf(n) {
    return String((n && n.detail) || '').trim();
  }
  function _declName(n) {
    if (!n || n.kind === 'relation' || n.kind === 'block' || n.kind === 'title') return '';
    return String(n.label || '').trim();
  }

  // 参照図に一度でも出た語尾。写した行をそのまま残しただけの所を叩かないために使う。
  function _allSuffixes(nodes) {
    var out = [];
    _spine(nodes).forEach(function(n) {
      var suf = suffixOf(_textOf(n));
      if (suf !== '' && out.indexOf(suf) < 0) out.push(suf);
    });
    return out;
  }

  // 参照図で 2 回以上使われている語尾。1 回しか出ない語尾は「揃っている形」とは言えない。
  function suffixVocabulary(nodes) {
    var seen = {};
    _spine(nodes).forEach(function(n) {
      var suf = suffixOf(_textOf(n));
      if (suf === '') return;
      seen[suf] = (seen[suf] || 0) + 1;
    });
    var out = [];
    for (var k in seen) if (Object.prototype.hasOwnProperty.call(seen, k) && seen[k] >= 2) out.push(k);
    return out.sort();
  }

  // 1 文字違いか。挿入・削除・置換・隣り合う 2 文字の入れ替えのどれか 1 回で
  // 一致するときだけ真 (入れ替えは打ち間違いで最も多い形なので数える)。
  // 長さ 4 未満の名前は、別物どうしがたまたま 1 文字違いになりやすいので見ない。
  function isNearMiss(a, b) {
    var x = String(a == null ? '' : a);
    var y = String(b == null ? '' : b);
    if (x === y) return false;
    if (x.length < 4 || y.length < 4) return false;
    if (Math.abs(x.length - y.length) > 1) return false;
    if (x.length === y.length) {
      var at = [];
      for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) { at.push(i); if (at.length > 2) return false; }
      if (at.length === 1) return true;
      // 隣り合う 2 箇所が入れ替わっているだけなら 1 回の打ち間違い
      return at.length === 2 && at[1] === at[0] + 1
        && x[at[0]] === y[at[1]] && x[at[1]] === y[at[0]];
    }
    var lo = x.length < y.length ? x : y;
    var hi = x.length < y.length ? y : x;
    var j = 0;
    for (var k = 0; k < hi.length; k++) {
      if (j < lo.length && lo[j] === hi[k]) j++;
      else if (k - j > 0) return false;
    }
    return true;
  }

  // relation の label は「A -> B」の形。両端の名前を取り出す。
  function _endpoints(n) {
    if (!n || n.kind !== 'relation') return [];
    var m = String(n.label || '').split(/\s*(?:<\|?|<)?[-.]{1,2}(?:\|?>|>)?\s*/);
    var out = [];
    for (var i = 0; i < m.length; i++) {
      var v = String(m[i] || '').trim();
      if (v) out.push(v);
    }
    return out;
  }

  // 図の中で使われている名前を、宣言と関係の両端から集める。
  function namesUsed(nodes) {
    var out = [];
    _spine(nodes).forEach(function(n) {
      var d = _declName(n);
      if (d && out.indexOf(d) < 0) out.push(d);
      _endpoints(n).forEach(function(e) { if (out.indexOf(e) < 0) out.push(e); });
    });
    return out;
  }

  // check(refDsl, curDsl) — 参照図と編集中の図を突き合わせる。
  // 返すのは { findings, ok, summary }。findings の line は編集中の図の 0-based 行。
  function check(refDsl, curDsl) {
    var ol = window.MA.outline;
    var findings = [];
    if (!ol) return { findings: findings, ok: true, summary: summary(findings) };

    var ref = _spine(ol.build(refDsl).nodes);
    var cur = _spine(ol.build(curDsl).nodes);

    // 1. 並び。同じ位置の節が違う種類なら、雛形をなぞれていない。
    var n = Math.max(ref.length, cur.length);
    for (var i = 0; i < n; i++) {
      var r = ref[i], c = cur[i];
      if (r && c && r.kind !== c.kind) {
        findings.push({
          kind: 'order', line: c.line,
          message: (i + 1) + ' 番目が参照図と違います (参照: ' + r.kind + ' / こちら: ' + c.kind + ')',
        });
      } else if (r && !c) {
        findings.push({
          kind: 'order', line: null,
          message: '参照図の ' + (i + 1) + ' 番目 (' + r.kind + ' ' + (_declName(r) || _textOf(r)) + ') がこちらにありません',
        });
      } else if (!r && c) {
        findings.push({
          kind: 'order', line: c.line,
          message: '参照図に無い ' + c.kind + ' が余分にあります',
        });
      }
    }

    // 2. 語尾。参照図で揃っている語尾から外れたラベルを挙げる。
    var vocab = suffixVocabulary(ref);
    var known = _allSuffixes(ref);
    if (vocab.length > 0) {
      cur.forEach(function(c) {
        var label = _textOf(c);
        if (label === '') return;
        var suf = suffixOf(label);
        if (suf === '' || known.indexOf(suf) >= 0) return;
        findings.push({
          kind: 'suffix', line: c.line,
          message: '「' + label + '」の語尾が参照図の形 (' + vocab.join(' / ') + ') と揃っていません',
        });
      });
    }

    // 3. 打ち間違い。参照図の名前と 1 文字だけ違う名前は、置換し損ねか打ち間違い。
    var refNames = [];
    ref.forEach(function(r) {
      var s = _declName(r);
      if (s && refNames.indexOf(s) < 0) refNames.push(s);
    });
    var reported = {};
    cur.forEach(function(c) {
      var s = _declName(c);
      if (!s || reported[s]) return;
      for (var i2 = 0; i2 < refNames.length; i2++) {
        if (isNearMiss(s, refNames[i2])) {
          reported[s] = true;
          findings.push({
            kind: 'typo', line: c.line,
            message: '「' + s + '」は参照図の「' + refNames[i2] + '」と 1 文字だけ違います',
          });
          return;
        }
      }
    });

    // 3b. 部品名をまるごと替えた図では、参照図の名前と比べても打ち間違いは出ない。
    // 替えた新しい名前どうしが 1 文字違いで並んでいる所 (宣言は UartDvr、
    // 関係は UartDrv、のような置換し損ね) を、図の中だけで突き合わせて挙げる。
    var used = namesUsed(cur);
    for (var a = 0; a < used.length; a++) {
      for (var b = a + 1; b < used.length; b++) {
        if (!isNearMiss(used[a], used[b])) continue;
        var pairKey = used[a] + ' ' + used[b];
        if (reported[pairKey]) continue;
        reported[pairKey] = true;
        var at = null;
        for (var q = 0; q < cur.length; q++) {
          var dn = _declName(cur[q]);
          if (dn === used[a] || dn === used[b]) { at = cur[q].line; break; }
          if (_endpoints(cur[q]).indexOf(used[a]) >= 0 || _endpoints(cur[q]).indexOf(used[b]) >= 0) {
            if (at == null) at = cur[q].line;
          }
        }
        findings.push({
          kind: 'typo', line: at,
          message: 'この図の中で「' + used[a] + '」と「' + used[b] + '」が 1 文字だけ違う名前として並んでいます',
        });
      }
    }

    findings.sort(function(a, b) {
      var la = a.line == null ? 1e9 : a.line;
      var lb = b.line == null ? 1e9 : b.line;
      return la - lb;
    });
    return { findings: findings, ok: findings.length === 0, summary: summary(findings) };
  }

  // 見出しの一行。何件あるかを種類ごとに言う。
  function summary(findings) {
    var f = findings || [];
    if (f.length === 0) return '食い違いなし';
    var c = { order: 0, suffix: 0, typo: 0 };
    f.forEach(function(x) { if (c[x.kind] != null) c[x.kind]++; });
    var parts = [];
    if (c.order) parts.push('並び ' + c.order);
    if (c.suffix) parts.push('語尾 ' + c.suffix);
    if (c.typo) parts.push('打ち間違い ' + c.typo);
    return f.length + ' 件 (' + parts.join(' / ') + ')';
  }

  return {
    check: check,
    summary: summary,
    suffixOf: suffixOf,
    suffixVocabulary: suffixVocabulary,
    isNearMiss: isNearMiss,
    namesUsed: namesUsed,
  };
})();
