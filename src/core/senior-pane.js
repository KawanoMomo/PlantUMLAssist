'use strict';

// senior-pane — 「先輩の図」を読み専用の 2 枠目として画面に据えたままにする。
//
// BLK-junior-20260914-1406-wish: 先輩の変更を自分の図へ取り込む手順は、
// 先輩の図を見る → 自分の図に反映、の往復になる。いまの入口 (👀 他フォルダ) は
// ツール折りたたみの奥にあり、開くまでに 5 クリックかかるうえ、開いた画面は
// 前面のモーダルなので自分の図を編集する間は閉じることになる。継承元は
// 同名判定がファイル名だけなので、別フォルダの同名図を「自分自身」とみなして使えない。
//
// ここは、先輩のフォルダを 1 回決めておけば、いま開いている図の相手を自動で選び、
// 画面の横に置いたままにするための判断を持つ。DOM と通信は app.js。
//
// 相手の選び方は 4 段。フォルダを跨いだ同名 (= パスまで見れば別物) を最優先にする。
//   1. 同じファイル名          → その 1 枚
//   2. 同じドメイン + 同じ図種 → その 1 枚 (名前の付け方が違っても対になる)
//   3. 同じドメインだけ        → 候補として並べる (複合図はここに来る)
//   4. 同じ図種の共通図        → その中から自分の部品の所だけを抜き出す (senior-slice)
// どれにも当たらなければ「この図に当たる先輩の図はありません」と言い切る
// (先頭の 1 枚を黙って出すと、別ドメインの図を相手と読み違える)。
(function() {
  var STORE_KEY = 'pua.senior.pane';

  // 図種を表す語。ファイル名の末尾に付く順に並べる (junior / primary の置き方)。
  var KINDS = [
    { key: 'sequence', words: ['sequence', 'seq', 'シーケンス'] },
    { key: 'state', words: ['state', 'statemachine', '状態遷移', '状態'] },
    { key: 'class', words: ['class', 'クラス'] },
    { key: 'usecase', words: ['usecase', 'ユースケース'] },
    { key: 'component', words: ['component', 'コンポーネント'] },
    { key: 'activity', words: ['activity', 'アクティビティ'] },
  ];

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  // 拡張子とフォルダを落とした名前。
  function baseOf(name) {
    var s = _s(name).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  function _tokens(name) {
    return baseOf(name).toLowerCase().split(/[\s_\-.]+/).filter(function(t) { return !!t; });
  }

  // ドメイン名 = 先頭の語 (family-audit の系統キーと同じ置き方)。
  function domainOf(name) {
    var t = _tokens(name);
    return t.length ? t[0] : '';
  }

  // 図種 = 名前に出てくる図種の語。無ければ ''。
  //
  // ASCII の語は区切りで切れるので語の一致で見るが、`TimerDrv派生クラス図` のように
  // 日本語の名前は区切りが無く 1 語に潰れる。カナ・漢字の語だけは名前に含まれるかで
  // 見る (英字を含みで見ると `classic` のような語を図種と読み違える)。
  function kindOf(name) {
    var t = _tokens(name);
    var base = baseOf(name).toLowerCase();
    for (var i = 0; i < KINDS.length; i++) {
      for (var j = 0; j < t.length; j++) {
        if (KINDS[i].words.indexOf(t[j]) >= 0) return KINDS[i].key;
      }
    }
    for (i = 0; i < KINDS.length; i++) {
      for (var k = 0; k < KINDS[i].words.length; k++) {
        var w = KINDS[i].words[k];
        if (!/^[\x20-\x7e]*$/.test(w) && base.indexOf(w) >= 0) return KINDS[i].key;
      }
    }
    return '';
  }

  // フォルダ込みの同一パスかどうか。継承元がファイル名だけで「自分自身」と
  // みなしていたのがこの BLK の詰まりなので、判定はここに 1 つだけ置く。
  function samePath(a, b) {
    function norm(p) {
      return _s(p).split('\\').join('/').replace(/\/+$/, '').toLowerCase();
    }
    return !!a && !!b && norm(a) === norm(b);
  }

  // 別フォルダの同名図は「自分自身」ではない。
  function isSelf(mine, theirs) {
    return samePath(mine && mine.dir, theirs && theirs.dir)
      && baseOf(mine && mine.name).toLowerCase() === baseOf(theirs && theirs.name).toLowerCase();
  }

  // 共通図 = 1 枚に複数の部品をまとめた図。部品名で 1:1 に引けないので、
  // 名前で相手を決める 3 段には掛からない。名前だけで見分ける (中身は
  // 相手が決まってから読むので、ここでは読めない)。
  function isCommonSheet(name) {
    var b = baseOf(name).toLowerCase();
    return b.indexOf('common') >= 0 || b.indexOf('共通') >= 0 || b.indexOf('全体') >= 0;
  }

  // いま開いている図 (active) に当たる先輩の図を選ぶ。
  // active: { name, dir }、names: 先輩フォルダのファイル名一覧。
  // pickCounterpart(active, names, seniorDir, partKeys)
  //
  // partKeys は「自分の図がどの部品の図か」を表す語 (senior-slice.partKeysOf)。
  // 渡すと 4 段目 (共通図の抜き出し) を試す。渡さなければ 3 段で止まる。
  function pickCounterpart(active, names, seniorDir, partKeys) {
    var mine = { name: _s(active && active.name), dir: _s(active && active.dir) };
    var list = (names || []).map(_s).filter(function(n) { return !!n; });
    var out = { name: '', how: 'none', candidates: [], reason: '', key: '', keys: [] };
    if (!mine.name || !list.length) {
      out.reason = list.length ? 'まだ図を開いていません' : '比較相手のフォルダに図がありません';
      return out;
    }

    // 先輩として自分の保存先そのものを選んでしまったときのために、
    // 自分自身は最初に落とす (どの段でも相手にしない)。
    list = list.filter(function(n) { return !isSelf(mine, { name: n, dir: seniorDir }); });

    var base = baseOf(mine.name).toLowerCase();
    var dom = domainOf(mine.name);
    var kind = kindOf(mine.name);

    var same = list.filter(function(n) { return baseOf(n).toLowerCase() === base; });
    // 同名でも、先輩のフォルダが自分の保存先と同じなら自分自身なので相手にしない。
    same = same.filter(function(n) { return !isSelf(mine, { name: n, dir: seniorDir }); });
    if (same.length) {
      out.name = same[0];
      out.how = 'same-name';
      out.candidates = same;
      out.reason = '同じファイル名';
      return out;
    }

    var domHit = dom ? list.filter(function(n) { return domainOf(n) === dom; }) : [];
    var kindHit = kind ? domHit.filter(function(n) { return kindOf(n) === kind; }) : [];
    if (kindHit.length === 1) {
      out.name = kindHit[0];
      out.how = 'same-kind';
      out.candidates = kindHit;
      out.reason = '同じドメイン (' + dom + ') の同じ図種';
      return out;
    }
    if (kindHit.length) {
      out.name = kindHit[0];
      out.how = 'domain';
      out.candidates = kindHit;
      out.reason = '同じドメイン (' + dom + ') の図';
      return out;
    }

    // 4. 同じ図種の共通図 → その中から自分の部品の所だけを抜き出す。
    //    BLK-junior-20260914-2206-wish: 先輩のクラス図は全ドライバ共通の 1 枚で、
    //    部品名で 1:1 に引けないため 1〜3 段のどれにも掛からず常に「−」だった。
    //    BLK-junior-20260923-2012: 同じ部品 (adc) の別の図種 (adc_init_sequence /
    //    adc_state) があると 3 段目が先に効き、図種の違う候補だけを並べて相手を
    //    決めず、共通図まで降りてこなかった。同じ図種が部品名で引けなければ、
    //    図種の違う同部品の図より先に共通図を見る。
    var keys = (partKeys || []).filter(function(k) { return !!_s(k); });
    if (kind && keys.length) {
      var common = list.filter(function(n) {
        return kindOf(n) === kind && isCommonSheet(n);
      });
      if (common.length) {
        out.name = common[0];
        out.how = 'common-slice';
        out.candidates = common;
        out.key = keys[0];
        out.keys = keys;
        out.reason = '共通図から「' + keys[0] + '」の部分';
        return out;
      }
    }

    // 3'. 同じドメインで図種の読めない図だけは候補として並べる (中身を見ないと
    //     図種が分からないので、人に選ばせる)。図種が読めて違う図は相手ではない
    //     (クラス図の相手にシーケンス図を並べると、比べる物が無いのに候補が出る)。
    var domCands = domHit.filter(function(n) { return !kind || !kindOf(n); });
    if (domCands.length) {
      out.how = 'domain';
      out.candidates = domCands;
      out.reason = '同じドメイン (' + dom + ') の図';
      return out;
    }

    // 相手のフォルダにその図種はあるが、どれもこの部品の図ではない (共通図も無い)。
    // 「無い」と言い切る。枚数も言うのは、フォルダを目で走査し直させないため
    // (cross-ref-diff の「TIMER のクラス図がありません (3 枚中 0 枚)」と同じ言い方)。
    var sameKind = kind ? list.filter(function(n) { return kindOf(n) === kind; }).length : 0;
    if (sameKind) {
      var P = (keys[0] || dom || baseOf(mine.name)).toUpperCase();
      var word = kindWord(kind);
      out.part = P;
      out.sameKind = sameKind;
      out.reason = 'この図 (' + baseOf(mine.name) + ') に当たる相手の図はありません。'
        + P + ' の' + word + 'は ' + list.length + ' 枚中 0 枚 (' + word + 'は ' + sameKind
        + ' 枚ありますが、どれも ' + P + ' の図ではありません)';
      return out;
    }

    out.reason = 'この図 (' + baseOf(mine.name) + ') に当たる相手の図はありません';
    return out;
  }

  // 図種の呼び名 (「クラス図」)。diagram-kind が読めなければ図種の語のまま。
  var KIND_WORD = { sequence: 'シーケンス図', state: '状態遷移図', class: 'クラス図',
    usecase: 'ユースケース図', component: 'コンポーネント図', activity: 'アクティビティ図' };
  function kindWord(kind) {
    var DK = (typeof window !== 'undefined' && window.MA) ? window.MA.diagramKind : null;
    var lab = (DK && DK.label) ? DK.label(kind) : '';
    return lab ? lab + '図' : (KIND_WORD[kind] || 'この図種');
  }

  // 枠の上に出す 1 行。押す前に「いま何が横にあるか」が読める。
  function noticeText(pick, seniorLabel) {
    var who = _s(seniorLabel) || '比較相手';
    if (!pick) return who + ' のフォルダを選んでください';
    if (pick.how === 'none') return pick.reason;
    if (pick.name) {
      return who + ' の ' + baseOf(pick.name) + '（' + pick.reason + '・読むだけ）';
    }
    return who + ' に ' + pick.candidates.length + ' 枚の候補（' + pick.reason + '）。選んでください';
  }

  // statusText(pick, opts) — 下端の状態バーに出す 1 行 (design 7b: 件数を持つものは
  // タブ列に置かず下端に寄せ、押せばそのパネルが開く)。
  //
  // BLK-junior-20260908-1103: 先輩の図を見る入口 (👀 他フォルダ / 先輩の枠) は
  // 🧰 ツールの折りたたみの奥にあり、図種ごとの初回は毎回そこを通っていた。
  // 常に見えている下端に「いま横に出る先輩の図」を出し、押せば 1 クリックで枠が開く。
  function statusText(pick, opts) {
    var o = opts || {};
    if (!o.ready) {
      return { label: '並べて比較 −', title: '別のフォルダの図を読むだけで横に並べます (押すと開きます)', count: 0 };
    }
    if (!pick || pick.how === 'none') {
      return { label: '並べて比較 −', title: (pick && pick.reason) || '比較相手のフォルダを選んでください', count: 0 };
    }
    if (pick.how === 'common-slice' && pick.name) {
      return {
        label: '並べて比較 ' + baseOf(pick.name) + '（' + pick.key + '）',
        title: '比較相手の共通図 ' + baseOf(pick.name) + ' から「' + pick.key
          + '」に当たる所だけを抜き出して横に出します (読むだけ)',
        count: 1,
      };
    }
    if (pick.name) {
      return {
        label: '並べて比較 ' + baseOf(pick.name),
        title: '横に並ぶ相手の図: ' + baseOf(pick.name) + ' (' + pick.reason + '・読むだけ)',
        count: 1,
      };
    }
    var n = (pick.candidates || []).length;
    return {
      label: '並べて比較 ' + n + ' 候補',
      title: pick.reason + ' が ' + n + ' 枚あります (押すと枠が開き、選べます)',
      count: n,
    };
  }

  // ---- 覚えておくもの -------------------------------------------------------
  // 「開いたままにする」が値打ちなので、開閉と選んだフォルダは覚える。
  //
  // BLK-human-20260915-1203: 閉じた状態と幅も覚える。既定は閉じ (open: false)。
  // 幅と初回説明の扱いは参照ペインと揃えたいので side-pane に寄せる
  // (side-pane を読み込んでいない場での単体使用に備えて、無ければ自前で丸める)。
  var DEFAULT_WIDTH = 360;
  var MIN_WIDTH = 220;

  function _sidePane() {
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./side-pane.js'); } catch (e) { /* 単体で読まれたとき */ }
    }
    return (typeof window !== 'undefined' && window.MA && window.MA.sidePane) || null;
  }

  function _width(v) {
    var SD = _sidePane();
    if (SD) return SD.clampWidth(v === undefined || v === null || v === '' ? DEFAULT_WIDTH : v);
    var n = Number(v);
    return isFinite(n) ? Math.round(Math.max(MIN_WIDTH, n)) : DEFAULT_WIDTH;
  }

  function normalize(state) {
    var s = state || {};
    return {
      open: !!s.open,
      dir: _s(s.dir),
      name: _s(s.name),
      width: _width(s.width),
      seen: !!s.seen,
      // design 9a: この枠は「並べて比較」1 つの入口の実体になる。相手を据え置いて
      // 図の切り替えに追従させる 'keep' と、いま出している 1 枚だけを見る 'once' を
      // 枠の中で切り替える (別画面を増やさない)。
      mode: s.mode === 'once' ? 'once' : 'keep',
    };
  }

  // 枠内の切り替えの呼び名。画面と unit の両方がここを見る。
  var MODE_LABELS = { keep: '据え置く', once: '1 回だけ' };

  // 初めて開いたときだけ出す 1 行。この枠が何かを言い切る (読むだけだと分かること)。
  var FIRST_NOTE = 'この枠は、別のフォルダの図を手本として横に出すものです（読むだけ・書き換えません）。'
    + '× で閉じられます。';

  // firstOpenNote(state) — まだ説明を出していなければ文言を返す。出したなら ''。
  function firstOpenNote(state) {
    return normalize(state).seen ? '' : FIRST_NOTE;
  }

  function load(store) {
    var st = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st) return normalize(null);
    try {
      return normalize(JSON.parse(st.getItem(STORE_KEY) || '{}'));
    } catch (e) { return normalize(null); }
  }

  function save(state, store) {
    var st = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st) return normalize(state);
    var v = normalize(state);
    try { st.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* 保存できなくても画面は動く */ }
    return v;
  }

  var api = {
    STORE_KEY: STORE_KEY,
    baseOf: baseOf, domainOf: domainOf, kindOf: kindOf,
    samePath: samePath, isSelf: isSelf, isCommonSheet: isCommonSheet,
    pickCounterpart: pickCounterpart, noticeText: noticeText, statusText: statusText,
    normalize: normalize, load: load, save: save,
    FIRST_NOTE: FIRST_NOTE, firstOpenNote: firstOpenNote,
    MODE_LABELS: MODE_LABELS,
    DEFAULT_WIDTH: DEFAULT_WIDTH, MIN_WIDTH: MIN_WIDTH,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.seniorPane = api;
  }
})();
