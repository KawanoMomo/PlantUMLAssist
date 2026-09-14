'use strict';
window.MA = window.MA || {};

// finding-variant — 指摘 1 件が指している「図種」と「版」を読み取り、
// 同じ名前で並ぶ複数の版の中からその 1 枚を決める。
//
// BLK-junior-20260914-1106-wish: 指摘.md には「対象は本番用か資料用か」
// 「対象は状態遷移かシーケンスか」まで書いてある場面が増えたのに、開く側は
// 図種単位でしか「あり/なし」を区別しない。同じ図種の枠に
// 「GPIOドライバ初期化アクティビティ図」と「〜(資料用)」が並ぶと、どちらが
// 今回の対象かはボタンの文字を読み比べるしかなかった。読み比べの手間は
// 図種数 × 同居ファイル数で増える。
//
// 版はファイル名の括弧に書かれている (component-pack の variantOf と同じ読み方)。
// 指摘文が版を名指ししていれば、その版のファイルを対象にする。名指しが無ければ
// 無印 (本番用) を対象にする — 「書いていない」を「資料用でもよい」に広げると、
// 資料用の図を本番の指摘で書き換えてしまう。
//
// DOM にも fetch にも触らない。選んだ 1 枚をどう開くか・どう光らせるかは app.js。
window.MA.findingVariant = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _cp() { return window.MA.componentPack; }

  // 版。production は括弧の付かない名前そのもの (指摘が何も言わないときの既定)。
  // words は指摘文と括弧の中の両方を同じ語で見る (reviewer は同じ言葉で書く)。
  var VARIANTS = [
    // 語は「版を名指ししたと言い切れる」ものだけ置く。「資料」「旧」のような
    // 普通の語を合図にすると、設計書の話をしただけの指摘が資料用の図を指す。
    { key: 'production', label: '本番用', mark: '本', words: ['本番用', '正式版', '正本'] },
    { key: 'material', label: '資料用', mark: '資', words: ['資料用'] },
    { key: 'editing', label: '編集中', mark: '編', words: ['編集中', '作業中', '下書き'] },
    { key: 'old', label: '旧版', mark: '旧', words: ['旧版', '前バージョン', '前版'] },
  ];

  function variantByKey(key) {
    var k = _s(key);
    for (var i = 0; i < VARIANTS.length; i++) if (VARIANTS[i].key === k) return VARIANTS[i];
    return null;
  }

  function label(key) {
    var v = variantByKey(key);
    return v ? v.label : '';
  }

  // 語 → 版。長い語を優先し、同じ長さなら先に書かれている方を取る。
  // 1 件の指摘が 2 つの版に触れる書き方 (「資料用が本番用と食い違う」) は珍しくないが、
  // reviewer は直してほしい方を先に書く。先に出た方を対象にする。
  function _keyOfWords(text) {
    var s = _s(text);
    if (!s) return '';
    var best = null;
    VARIANTS.forEach(function(v) {
      v.words.forEach(function(w) {
        var at = s.indexOf(w);
        if (at < 0) return;
        if (!best || w.length > best.len || (w.length === best.len && at < best.at)) {
          best = { key: v.key, len: w.length, at: at };
        }
      });
    });
    return best ? best.key : '';
  }

  // ファイル名の版。括弧が無ければ本番用。括弧はあるが知らない語なら '' (分類しない
  // — 知らない語を本番用に混ぜると、別物が本番用の対象として選ばれる)。
  function variantOf(name) {
    var CP = _cp();
    var paren = CP ? CP.variantOf(name) : '';
    if (!paren) return 'production';
    return _keyOfWords(paren);
  }

  // 名前から版の括弧を落とした形。同じ図の別の版どうしを結ぶ鍵になる。
  function stemOf(name) {
    return _s(name).replace(/\.[A-Za-z0-9]+$/, '')
      .replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, '').trim();
  }

  // 一覧の行に出す版の印。本番用 (無印) には出さない — 全行に印が付くと
  // 印であることをやめる。分類できない括弧付きは「版」とだけ言う。
  function badge(name) {
    var CP = _cp();
    var paren = CP ? CP.variantOf(name) : '';
    if (!paren) return null;
    var v = variantByKey(variantOf(name));
    return {
      key: v ? v.key : '',
      mark: v ? v.mark : '版',
      label: v ? v.label : paren,
      title: (v ? v.label : paren) + ' の版です（同じ図の別の版と見分けるための印）',
    };
  }

  // ── 指摘文の読み取り ──────────────────────────────────────────────────
  // 指摘文が名指しする版。書いていなければ ''。
  function wantedVariant(text) {
    return _keyOfWords(text);
  }

  // 指摘文が名指しする図種 (component-pack の図種名)。書いていなければ ''。
  // 図種の語は component-pack の名前解釈をそのまま借りる (一覧の図種と
  // 指摘の図種が別の語彙になると、突き合わせが画面ごとにずれる)。
  function wantedKind(text) {
    var CP = _cp();
    var s = _s(text);
    if (!CP || !s) return '';
    var order = CP.KIND_ORDER || [];
    var best = null;
    order.forEach(function(kind) {
      // 「アクティビティ図」でも「アクティビティ」でも当てる。
      var word = kind.replace(/図$/, '');
      var at = s.indexOf(word);
      if (at < 0) return;
      if (!best || at < best.at) best = { at: at, kind: kind };
    });
    return best ? best.kind : '';
  }

  // ── 対象の 1 枚を決める ───────────────────────────────────────────────
  // 同じ図の版ぞろい。names は保存フォルダにある図名の並び。
  function familyOf(names, base) {
    var stem = stemOf(base).toLowerCase();
    if (!stem) return [];
    var out = [];
    (Array.isArray(names) ? names : []).forEach(function(n) {
      var name = _s(n);
      if (!name || stemOf(name).toLowerCase() !== stem) return;
      if (out.indexOf(name) < 0) out.push(name);
    });
    // 本番用を先に、あとは名前順 (押す前の一覧が run ごとに入れ替わらない)。
    out.sort(function(a, b) {
      var av = variantOf(a) === 'production' ? 0 : 1;
      var bv = variantOf(b) === 'production' ? 0 : 1;
      if (av !== bv) return av - bv;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return out;
  }

  // 指摘が挙げた図名が複数あるとき、指摘文の図種に合う 1 つを選ぶ。
  // 図種が書かれていない / どれも合わないなら先頭 (本文に先に出てきたもの)。
  function pickBase(bases, text) {
    var list = (Array.isArray(bases) ? bases : []).filter(function(b) { return _s(b) !== ''; });
    if (!list.length) return '';
    var CP = _cp();
    var kind = wantedKind(text);
    if (kind && CP) {
      for (var i = 0; i < list.length; i++) {
        if (CP.kindOf(list[i]) === kind) return list[i];
      }
    }
    return list[0];
  }

  // choose({bases, names, text}) — 指摘 1 件の対象。
  //   name     選んだ 1 枚 (無ければ '')
  //   variant  その版のキー、kind その図種
  //   family   同じ図の版ぞろい (選ばなかった版も返す。画面で並べて出せる)
  //   byText   版を指摘文から決めたか (false = 名指しが無いので本番用にした)
  function choose(opts) {
    var o = opts || {};
    var text = _s(o.text);
    var CP = _cp();
    var base = pickBase(o.bases, text);
    if (!base) {
      return { name: '', variant: '', kind: wantedKind(text), family: [],
               wanted: wantedVariant(text), byText: false, base: '' };
    }
    var family = familyOf(o.names, base);
    if (family.indexOf(base) < 0) family = family.concat([base]);
    var want = wantedVariant(text);
    var name = '';
    if (want) {
      for (var i = 0; i < family.length; i++) {
        if (variantOf(family[i]) === want) { name = family[i]; break; }
      }
    }
    var byText = !!name;
    if (!name) {
      // 名指しが無い / その版が無い → 本番用 (無印)。それも無ければ当たった名前。
      for (var j = 0; j < family.length; j++) {
        if (variantOf(family[j]) === 'production') { name = family[j]; break; }
      }
      if (!name) name = base;
    }
    return {
      name: name,
      base: base,
      variant: variantOf(name),
      kind: (CP ? CP.kindOf(name) : '') || wantedKind(text),
      family: family,
      wanted: want,
      byText: byText,
    };
  }

  // 押す前に読む 1 行。「どの図種の、どの版を開くのか」を言い切る。
  function targetText(pick) {
    if (!pick || !pick.name) return '対象: 指摘に図の名前が書かれていません';
    var parts = [];
    if (pick.kind) parts.push(pick.kind);
    parts.push(label(pick.variant) || '版の分からない図');
    var s = '対象: ' + parts.join(' / ') + ' — ' + pick.name;
    if (pick.family.length > 1) {
      s += '（同じ図の版 ' + pick.family.length + ' 枚から'
        + (pick.byText ? '指摘の指す版' : '本番用') + 'を選びました）';
    }
    return s;
  }

  // 版が複数あるのに指摘が版を名指ししていないときだけ出す注意書き。
  // 1 枚しか無い図では出さない (読むものを増やさない)。
  function ambiguousText(pick) {
    if (!pick || !pick.name || pick.byText) return '';
    if (!pick.family || pick.family.length < 2) return '';
    var others = pick.family.filter(function(n) { return n !== pick.name; });
    return '指摘は版を書いていません。ほかの版: ' + others.join(' / ');
  }

  var api = {
    VARIANTS: VARIANTS,
    label: label,
    variantOf: variantOf,
    stemOf: stemOf,
    badge: badge,
    wantedVariant: wantedVariant,
    wantedKind: wantedKind,
    familyOf: familyOf,
    pickBase: pickBase,
    choose: choose,
    targetText: targetText,
    ambiguousText: ambiguousText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
