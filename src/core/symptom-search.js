'use strict';
window.MA = window.MA || {};

// symptom-search — 症状文をそのまま貼って、関連しそうな図を出す。
//
// 不具合対応では「DMA 転送の Fault 通知でリトライが動かない」のような症状文から
// 始まる。今までは、そこから関連しそうな部品名 (Spi_TransmitDma / Fault / …) を
// 自分の知識で思い付いて、一括置換の影響範囲プレビューに 1 つずつ打ち込んで
// いた。思い付ける部品名の数が探索の上限になるので、経験の浅い担当者は探索を
// 始められない。
//
// ここでは症状文を語に割り、DSL 側の「宣言された名前」と「矢印ラベル」に
// 突き合わせて、当たった語の重みの合計で図を並べる。照合の単位は形態素解析では
// なく、識別子の分割 (snake / camel) とカタカナ・漢字の連なりで足りる:
// 図に書かれている語は部品名と動作名で、助詞や活用を跨ぐ照合は要らない。
window.MA.symptomSearch = (function() {
  // 宣言行。役割は impactScan と同じ語彙で呼ぶ (画面で並べたときに揃うため)。
  var DECLS = [
    { re: /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'participant' },
    { re: /^\s*(?:abstract\s+class|class|interface|enum)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'class' },
    { re: /^\s*state\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'state' },
    { re: /^\s*(?:component|node|package|folder|rectangle)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'component' },
    { re: /^\s*usecase\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'usecase' },
  ];

  var ROLE_LABEL = {
    participant: 'participant',
    class: 'class 宣言',
    state: 'state 宣言',
    component: 'component 宣言',
    usecase: 'usecase 宣言',
    label: '矢印ラベル',
    title: 'タイトル',
  };

  // 宣言は「その図の登場人物」なので、ラベル (1 回の動作) より重い。
  var ROLE_WEIGHT = {
    participant: 3, class: 3, state: 3, component: 3, usecase: 3,
    title: 3, label: 2,
  };

  var ARROW_RE = /(?:<\|--|--\|>|\*--|--\*|o--|--o|<\.\.|\.\.>|<--|-->|<-|->|\.\.|--)/;

  // 症状文から語を取る。助詞・活用でしか現れないひらがなは落とす
  // (「動かない」「が」は図に書かれない)。1 文字の語も落とす: 「図」1 文字で
  // 全図が当たると順位が意味を失う。
  var KATA = /[ァ-ヶー]{2,}/g;
  var KANJI = /[一-鿿]{2,}/g;
  var ASCII = /[A-Za-z][A-Za-z0-9_]{1,}/g;

  function _push(out, seen, word) {
    var key = word.toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(word);
  }

  function terms(text) {
    var s = String(text == null ? '' : text);
    var out = [];
    var seen = {};
    [ASCII, KATA, KANJI].forEach(function(re) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(s)) !== null) _push(out, seen, m[0]);
    });
    return out;
  }

  // 識別子を照合できる粒に割る。Spi_TransmitDma → spi_transmitdma / spi /
  // transmit / dma。症状文の「DMA」が Spi_TransmitDma に当たるのはこの分割による。
  function parts(name) {
    var s = String(name == null ? '' : name);
    var out = [];
    var seen = {};
    if (s) _push(out, seen, s);
    s.split(/[^A-Za-z0-9ァ-ヶー一-鿿]+/).forEach(function(chunk) {
      if (!chunk) return;
      _push(out, seen, chunk);
      // camelCase / PascalCase / 連番付き (Spi2Hw) を割る。
      chunk.replace(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g, function(p) {
        if (p.length >= 2) _push(out, seen, p);
        return p;
      });
      // カタカナ・漢字の連なりもそのまま粒にする。
      (chunk.match(KATA) || []).forEach(function(p) { _push(out, seen, p); });
      (chunk.match(KANJI) || []).forEach(function(p) { _push(out, seen, p); });
    });
    return out;
  }

  // 1 本の DSL から照合対象を取る。宣言された名前・矢印ラベル・title。
  // コメント (') と @startuml/@enduml は対象にしない。
  function index(dsl) {
    var text = String(dsl == null ? '' : dsl);
    var out = [];
    text.split('\n').forEach(function(line, i) {
      var raw = String(line);
      if (/^\s*'/.test(raw) || /^\s*@/.test(raw)) return;
      var t = raw.match(/^\s*title\s+(.+)$/);
      if (t) {
        out.push({ text: t[1].trim(), role: 'title', line: i + 1, raw: raw });
        return;
      }
      var hit = null;
      for (var d = 0; d < DECLS.length; d++) {
        var m = raw.match(DECLS[d].re);
        if (m) { hit = { text: m[1], role: DECLS[d].role, line: i + 1, raw: raw }; break; }
      }
      if (hit) {
        out.push(hit);
        // `participant Spi "SPI ドライバ"` の別名も名前として扱う。
        var alias = raw.match(/"([^"]+)"/);
        if (alias) out.push({ text: alias[1], role: hit.role, line: i + 1, raw: raw });
        return;
      }
      if (ARROW_RE.test(raw)) {
        var lab = raw.split(':').slice(1).join(':').trim();
        if (lab) out.push({ text: lab, role: 'label', line: i + 1, raw: raw });
        // ラベルの無い矢印でも、両端の名前は宣言なしで登場することがある。
        raw.split(':')[0].split(ARROW_RE).forEach(function(side) {
          var nm = side.trim().replace(/^"|"$/g, '');
          if (/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(nm)) {
            out.push({ text: nm, role: 'label', line: i + 1, raw: raw });
          }
        });
      }
    });
    return out;
  }

  // 語 1 つが照合対象 1 つに当たるか。粒の完全一致を先に見て、無ければ
  // 部分一致 (3 文字以上の語のみ) を許す。2 文字の部分一致まで許すと
  // 「転送」が「再転送中止」に当たるような取りこぼしより、無関係な図の
  // 混入のほうが増える。
  function _match(term, entryParts, entryText) {
    var t = String(term).toLowerCase();
    if (!t) return 0;
    for (var i = 0; i < entryParts.length; i++) {
      if (entryParts[i].toLowerCase() === t) return 2;
    }
    if (t.length >= 3 && String(entryText).toLowerCase().indexOf(t) >= 0) return 1;
    return 0;
  }

  // 1 本の DSL に対する当たり。
  // { score, hits: [{ term, target, role, label, line }], matched: [語...] }
  function scoreDoc(dsl, termList) {
    var entries = index(dsl).map(function(e) {
      return { e: e, parts: parts(e.text) };
    });
    var hits = [];
    var matched = [];
    var score = 0;
    (termList || []).forEach(function(term) {
      var best = null;
      var bestScore = 0;
      entries.forEach(function(x) {
        var q = _match(term, x.parts, x.e.text);
        if (q === 0) return;
        var s = q * (ROLE_WEIGHT[x.e.role] || 1);
        if (s > bestScore) { bestScore = s; best = x.e; }
      });
      if (!best) return;
      score += bestScore;
      matched.push(term);
      hits.push({
        term: term, target: best.text, role: best.role,
        label: ROLE_LABEL[best.role] || best.role, line: best.line,
      });
    });
    return { score: score, hits: hits, matched: matched };
  }

  // docs: [{ id, name, dsl }] → 当たった図だけを関連度の高い順に。
  // 同点なら「当たった語の数が多い順」→ 元の並び順。
  function search(docs, text) {
    var termList = terms(text);
    if (!Array.isArray(docs) || termList.length === 0) return [];
    var is = window.MA && window.MA.impactScan;
    var rows = [];
    docs.forEach(function(d, i) {
      if (!d) return;
      var r = scoreDoc(d.dsl, termList);
      if (r.score === 0) return;
      var kind = is ? is.detectKind(d.dsl) : 'other';
      rows.push({
        id: d.id, name: d.name, order: i,
        kind: kind,
        kindLabel: is ? (is.KIND_LABEL[kind] || 'その他') : 'その他',
        score: r.score, hits: r.hits, matched: r.matched,
        summary: r.matched.join('・'),
      });
    });
    rows.sort(function(a, b) {
      return b.score - a.score || b.matched.length - a.matched.length || a.order - b.order;
    });
    return rows;
  }

  // 見出し用。「6 語で 3 図が該当 / 当たらなかった語: リトライ」。
  function overview(docs, text) {
    var termList = terms(text);
    var rows = search(docs, text);
    var hitSet = {};
    rows.forEach(function(r) { r.matched.forEach(function(t) { hitSet[t.toLowerCase()] = true; }); });
    var missed = termList.filter(function(t) { return !hitSet[t.toLowerCase()]; });
    return { terms: termList, docs: rows.length, missed: missed };
  }

  return {
    terms: terms,
    parts: parts,
    index: index,
    scoreDoc: scoreDoc,
    search: search,
    overview: overview,
    ROLE_LABEL: ROLE_LABEL,
  };
})();
