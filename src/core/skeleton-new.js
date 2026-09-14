'use strict';
window.MA = window.MA || {};

// skeleton-new — 同じ図種で既に描いた図の「骨格」をそのまま土台にして、
// 中心の部品名 1 語だけを打ち替えた図を作る。
//
// BLK-junior-20260907-1903-wish: 同じ構成のコンポーネント図 (本体 1 + 周辺 3 +
// 依存 6 本) を題材ごとに毎回ゼロから組み直していた。テンプレートからの新規作成は
// あるが、そこで打つのは「テンプレートの選択・置換元・置換先・新しい図の名前」の
// 4 か所で、置換元を選び損ねると骨格が割れる。
//
// ここは「同じ図種の図」に絞り、置換元 (= その図の中心の部品名) と新しい図の名前を
// 図の中身から決める。利用者が打つのは題材名の 1 語だけになる。
// 置換そのものは template-new の instantiate (大小の族ごと・語の頭一致) に委ねる。
// 置換の規則を 2 つ持たない。ここは DOM に触らない。
window.MA.skeletonNew = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _tn() { return window.MA.templateNew; }

  function _baseName(name) {
    return _s(name).replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // 骨格の大きさ。宣言 (component / participant / class …) と、関係の行数。
  // 「どれを土台にするか」を名前だけで選べないときの手がかりとして出す。
  var REL_RE = /(-{1,2}\|?>|<\|?-{1,2}|\.{2,}>|<\.{2,}|-{2,}|\.{2,})/;

  function shape(dsl) {
    var tn = _tn();
    var decls = tn ? tn.declaredNames(dsl).length : 0;
    var rels = 0;
    _s(dsl).split('\n').forEach(function(line) {
      var t = line.trim();
      if (!t || t.charAt(0) === '@' || t.charAt(0) === "'") return;
      if (/^(?:title|note|skinparam|hide|show|header|footer|legend|caption|scale)\b/i.test(t)) return;
      if (REL_RE.test(t)) rels++;
    });
    return { decls: decls, relations: rels };
  }

  // 識別子の頭のひとかたまり (GpioDrv → Gpio、UART_START → UART)。
  // template-new の候補と同じ切り方。
  function _headSegment(word) {
    var m = word.match(/^([A-Z][a-z0-9]+)(?=[_A-Z])/)
      || word.match(/^([A-Z0-9]+?)(?=_)/)
      || word.match(/^([a-z][a-z0-9]*)(?=[_A-Z])/);
    return m ? m[1] : '';
  }

  // その図の中心の部品名。template-new の候補のうち、いちばん多く出てくる語を採り、
  // その語に一族の頭 (GpioDrv → Gpio) があればそちらを中心にする。
  // GpioDrv を中心にすると title の「GPIO」やラベルの gpio_* が取り残され、
  // 同じ図の中で綴りが割れる。骨格を丸ごと題材替えするには頭で替える。
  // 1 回しか出てこない語は骨格の中心ではないので採らない。
  function subjectOf(dsl) {
    var tn = _tn();
    if (!tn) return '';
    var cands = tn.candidates(dsl);
    var top = '';
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].count > 1) { top = cands[i].name; break; }
    }
    if (!top) top = cands.length ? cands[0].name : '';
    if (!top) return '';
    var head = _headSegment(top);
    return head || top;
  }

  // 土台にできる図。同じ図種で、中心の部品名が決まるものだけ。
  // excludeId は「今開いている白紙のタブ」を外すために使う。
  // 骨格の大きい順、同数なら元の並び順 (新しく作った図ほど後ろ)。
  function sources(docs, diagramType, excludeId) {
    var t = _s(diagramType);
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d, i) {
      if (!d || !d.dsl) return;
      if (t && _s(d.diagramType) !== t) return;
      if (excludeId != null && String(d.id) === String(excludeId)) return;
      var subject = subjectOf(d.dsl);
      if (!subject) return;
      var sh = shape(d.dsl);
      if (!sh.decls) return;
      out.push({
        id: d.id, name: d.name, dsl: d.dsl, subject: subject,
        decls: sh.decls, relations: sh.relations, i: i,
      });
    });
    return out.sort(function(a, b) {
      return (b.decls + b.relations) - (a.decls + a.relations) || a.i - b.i;
    });
  }

  // 1 行の見出し。何を土台にするのかと、その骨格の大きさ。
  function sourceLabel(src) {
    if (!src) return '';
    return _baseName(src.name) + ' — 中心 ' + src.subject
      + ' / 要素 ' + src.decls + '・関係 ' + src.relations;
  }

  // 土台 + 題材名 → 新しい図。名前も骨格から決める (打つのは題材名だけ)。
  // remaining は置換のあとも元の系統の綴りで残った宣言名。
  function plan(src, subject) {
    var tn = _tn();
    var to = _s(subject).trim();
    if (!src || !tn) return { ok: false, reason: 'no-source', changed: 0, remaining: [] };
    if (!to) return { ok: false, reason: 'no-subject', changed: 0, remaining: [] };
    var from = src.subject;
    if (to === from) return { ok: false, reason: 'same-subject', changed: 0, remaining: [] };
    var dsl = tn.instantiate(src.dsl, from, to);
    var changed = tn.previewLines(src.dsl, from, to).length;
    if (!changed) return { ok: false, reason: 'no-change', changed: 0, remaining: [] };
    return {
      ok: true,
      from: from,
      to: to,
      name: tn.suggestName(_baseName(src.name), from, to),
      dsl: dsl,
      changed: changed,
      remaining: leftovers(dsl, from),
    };
  }

  // 置換のあとも元の題材の綴りを持ったまま残っている宣言名。
  // 骨格の共通部品 (Reg_Access / Clock_Ctrl のような題材に依らない名前) は
  // 残って当たり前なので数えない。数えるのは「替わり損ねた名前」だけ。
  function leftovers(resultDsl, from) {
    var tn = _tn();
    if (!tn || !from) return [];
    var variants = tn.caseVariants(from, from).map(function(v) { return v.from; });
    return tn.declaredNames(resultDsl).filter(function(n) {
      for (var i = 0; i < variants.length; i++) {
        if (n.indexOf(variants[i]) >= 0) return true;
      }
      return false;
    });
  }

  // 作る前の確認文。作れない理由も同じ場所に出す (画面で 2 通りの文面を持たない)。
  function summaryText(p, src) {
    if (!src) return '土台にできる同じ図種の図がありません';
    if (!p || !p.ok) {
      if (p && p.reason === 'same-subject') return '題材名が土台と同じです';
      if (p && p.reason === 'no-change') return '「' + src.subject + '」がこの図に出てきません';
      return '題材名を入れると、' + _baseName(src.name) + ' と同じ骨格の図を作ります';
    }
    var s = p.changed + ' 行が ' + p.from + ' → ' + p.to + ' に変わります (要素 '
      + src.decls + '・関係 ' + src.relations + ' はそのまま)';
    if (p.remaining.length) s += ' / 元の名前が残ります: ' + p.remaining.join(', ');
    return s;
  }

  return {
    shape: shape,
    subjectOf: subjectOf,
    sources: sources,
    sourceLabel: sourceLabel,
    plan: plan,
    leftovers: leftovers,
    summaryText: summaryText,
  };
})();
