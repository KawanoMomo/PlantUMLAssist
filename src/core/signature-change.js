'use strict';
window.MA = window.MA || {};

// signature-change — 「この関数の戻り値型を変える」を、図をまたいで 1 回で当てる。
//
// 一括置換は綴りしか替えられないので、`Xxx_Reset() : void` を
// `Xxx_Reset() : StatusType` にする仕様変更では、影響範囲を洗い出したあとに
// 各図をタブで開いて `void` の書かれた行を自分で探して打ち直すしかなかった。
// 手数が対象図の枚数に比例して増える。
//
// ここは「宣言行を見つける / 書き換え後の行を返す」純関数だけを置く。DOM には触らない。
window.MA.signatureChange = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  function escapeRe(s) {
    return _s(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 矢印を含む行はメッセージ (`A -> B : Reset()`) なので宣言ではない。
  // ここで弾かないと、シーケンス図のラベルに戻り値型を足してしまう。
  var ARROW_RE = /(<\|--|--\|>|\*--|--\*|o--|--o|<\.\.|\.\.>|<--|-->|<-|->)/;

  // メンバー宣言行。`+ Xxx_Reset(uint8 ch) : void`、可視性・戻り値は無くてもよい。
  // {static} や {abstract} のような修飾子は行頭側にそのまま残す。
  function parseLine(line, name) {
    var text = _s(line);
    var want = _s(name).trim();
    if (!want) return null;
    if (ARROW_RE.test(text)) return null;
    var re = new RegExp(
      '^(\\s*)((?:(?:[+\\-#~]|\\{[a-z]+\\})\\s*)*)(' + escapeRe(want) + ')\\s*\\(([^)]*)\\)\\s*(?::\\s*(.*?))?\\s*$'
    );
    var m = re.exec(text);
    if (!m) return null;
    return {
      indent: m[1],
      prefix: m[2],
      name: m[3],
      params: _s(m[4]).trim(),
      returnType: m[5] == null ? null : _s(m[5]).trim(),
    };
  }

  // spec: { params, returnType }。指定の無い項目は今の値を残す
  // (戻り値だけ変える仕様変更で、引数を消してしまわないため)。
  function rewriteLine(line, name, spec) {
    var p = parseLine(line, name);
    if (!p) return null;
    var s = spec || {};
    var params = s.params == null ? p.params : _s(s.params).trim();
    var ret = s.returnType == null ? p.returnType : _s(s.returnType).trim();
    var out = p.indent + p.prefix + p.name + '(' + params + ')';
    if (ret) out += ' : ' + ret;
    return out;
  }

  // 1 枚の DSL の中の宣言行。行番号は 1 始まり (editor-jump と同じ数え方)。
  function findInDsl(dsl, name) {
    var out = [];
    _s(dsl).split('\n').forEach(function(raw, i) {
      var p = parseLine(raw, name);
      if (!p) return;
      out.push({
        line: i + 1,
        text: raw,
        params: p.params,
        returnType: p.returnType,
      });
    });
    return out;
  }

  // docs: [{ id, name, dsl }] → 宣言行のある図だけ。
  function findAll(docs, name) {
    var out = [];
    (docs || []).forEach(function(d) {
      if (!d) return;
      findInDsl(d.dsl, name).forEach(function(h) {
        out.push({
          docId: d.id, docName: _s(d.name),
          line: h.line, text: h.text,
          params: h.params, returnType: h.returnType,
        });
      });
    });
    return out;
  }

  // 今の戻り値型の一覧。仕様変更は「void を StatusType にする」形で来るので、
  // 変更前の型がひとつに揃っているかどうかを画面で先に見せる。
  function returnTypes(docs, name) {
    var seen = {};
    var out = [];
    findAll(docs, name).forEach(function(h) {
      var t = h.returnType || '(なし)';
      if (seen[t]) return;
      seen[t] = true;
      out.push(t);
    });
    return out;
  }

  // 当てる前の一覧。before と after が同じ行は status:'same' で残す
  // (対象から漏れたのか、既に直っているのかを画面で見分けられるようにする)。
  function plan(docs, name, spec) {
    return findAll(docs, name).map(function(h) {
      var after = rewriteLine(h.text, name, spec);
      return {
        docId: h.docId, docName: h.docName, line: h.line,
        before: h.text, after: after == null ? h.text : after,
        status: (after == null || after === h.text) ? 'same' : 'change',
      };
    });
  }

  // 選ばれた図だけに当てる。keys が空/未指定なら全対象。
  // 返すのは変わった図だけ (bulk-rename・bulk-apply と同じ形)。
  function apply(docs, name, spec, keys) {
    var sel = null;
    if (keys && keys.length) {
      sel = {};
      keys.forEach(function(k) { sel[k] = true; });
    }
    var changed = [];
    var updated = 0;
    (docs || []).forEach(function(d) {
      if (!d) return;
      var lines = _s(d.dsl).split('\n');
      var hit = false;
      for (var i = 0; i < lines.length; i++) {
        if (sel && !sel[d.id + '#' + (i + 1)]) continue;
        var after = rewriteLine(lines[i], name, spec);
        if (after == null || after === lines[i]) continue;
        lines[i] = after;
        updated++;
        hit = true;
      }
      if (hit) changed.push({ id: d.id, name: d.name, dsl: lines.join('\n') });
    });
    return { changed: changed, updated: updated };
  }

  return {
    parseLine: parseLine,
    rewriteLine: rewriteLine,
    findInDsl: findInDsl,
    findAll: findAll,
    returnTypes: returnTypes,
    plan: plan,
    apply: apply,
  };
})();
