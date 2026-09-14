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
      out.reason = list.length ? 'まだ図を開いていません' : '先輩のフォルダに図がありません';
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
    if (domHit.length) {
      out.name = kindHit.length ? kindHit[0] : '';
      out.how = 'domain';
      out.candidates = kindHit.length ? kindHit : domHit;
      out.reason = '同じドメイン (' + dom + ') の図';
      return out;
    }

    // 4. 同じ図種の共通図 → その中から自分の部品の所だけを抜き出す。
    //    BLK-junior-20260914-2206-wish: 先輩のクラス図は全ドライバ共通の 1 枚で、
    //    部品名で 1:1 に引けないため 1〜3 段のどれにも掛からず常に「−」だった。
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

    out.reason = 'この図 (' + baseOf(mine.name) + ') に当たる先輩の図はありません';
    return out;
  }

  // 枠の上に出す 1 行。押す前に「いま何が横にあるか」が読める。
  function noticeText(pick, seniorLabel) {
    var who = _s(seniorLabel) || '先輩';
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
      return { label: '👀 先輩 −', title: '先輩の図を読むだけで横に出します (押すと開きます)', count: 0 };
    }
    if (!pick || pick.how === 'none') {
      return { label: '👀 先輩 −', title: (pick && pick.reason) || '先輩のフォルダを選んでください', count: 0 };
    }
    if (pick.how === 'common-slice' && pick.name) {
      return {
        label: '👀 先輩 ' + baseOf(pick.name) + '（' + pick.key + '）',
        title: '先輩の共通図 ' + baseOf(pick.name) + ' から「' + pick.key
          + '」に当たる所だけを抜き出して横に出します (読むだけ)',
        count: 1,
      };
    }
    if (pick.name) {
      return {
        label: '👀 先輩 ' + baseOf(pick.name),
        title: '横に出る先輩の図: ' + baseOf(pick.name) + ' (' + pick.reason + '・読むだけ)',
        count: 1,
      };
    }
    var n = (pick.candidates || []).length;
    return {
      label: '👀 先輩 ' + n + ' 候補',
      title: pick.reason + ' が ' + n + ' 枚あります (押すと枠が開き、選べます)',
      count: n,
    };
  }

  // ---- 覚えておくもの -------------------------------------------------------
  // 「開いたままにする」が値打ちなので、開閉と選んだフォルダは覚える。
  function normalize(state) {
    var s = state || {};
    return { open: !!s.open, dir: _s(s.dir), name: _s(s.name) };
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
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.seniorPane = api;
  }
})();
