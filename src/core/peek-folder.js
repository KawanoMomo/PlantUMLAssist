'use strict';
window.MA = window.MA || {};

// peek-folder — 他の保存フォルダの図を「読むだけ」で見る。
//
// BLK-junior-20260908-0723: 先輩 (primary) の図を読むために、設定ダイアログで
// 保存先を `persona-data\primary` に打ち替え、読んだ後また `persona-data\junior`
// へ打ち戻していた。往復でフルパスを 2 回打つことになり (60 字超)、戻し忘れると
// 自分の図が他人のフォルダに紛れ込む。
//
// 読むだけなら保存先は動かさなくていい。隣のフォルダを一覧から選び、
// 中の図をその場で表示する。保存先の設定には一切触らない。
//
// DOM も fetch も触らない (行き先の組み立てと表示名だけ)。読み込みは app.js。
window.MA.peekFolder = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function baseName(dir) {
    var s = _s(dir).split('\\').join('/').replace(/\/+$/, '');
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  // server の /peek-dirs の答え → 選べる行き先。
  // 自分の保存先を先頭に置き、残りは名前順。図が 0 枚のフォルダは行き先にしない
  // (押しても何も出ないものを並べると、押して確かめる手が増える)。
  function choices(payload) {
    var dirs = (payload && payload.dirs) || [];
    var cur = [], rest = [];
    dirs.forEach(function(d) {
      if (!d || !_s(d.path)) return;
      var item = {
        name: _s(d.name) || baseName(d.path),
        path: _s(d.path),
        files: d.files | 0,
        current: !!d.current,
      };
      if (item.current) cur.push(item);
      else if (item.files > 0) rest.push(item);
    });
    rest.sort(function(a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    return cur.concat(rest);
  }

  // 自分の保存先以外の行き先。「他のフォルダを見る」で並べるのはこちら。
  function others(list) {
    return (list || []).filter(function(d) { return !d.current; });
  }

  // BLK-owner-20260924-1836-prune: 覗く窓を開いたときに見るフォルダ。フォルダの一覧は窓から外し
  // (ツリーの「読むだけ」で選ぶ)、開いた時点で 1 つに決めておく。
  //   want (右クリックしたフォルダ) → comparing (右の枠に並べている相手) → last (前に覗いていたフォルダ) → 先頭
  // どれも隣に無ければ ''。自分の保存先は選ばない。
  function defaultDir(list, want, comparing, last) {
    var cand = others(list);
    var pick = [want, comparing, last];
    for (var i = 0; i < pick.length; i++) {
      if (!_s(pick[i])) continue;
      for (var j = 0; j < cand.length; j++) {
        if (samePath(cand[j].path, pick[i])) return cand[j].path;
      }
    }
    return cand.length ? cand[0].path : '';
  }

  function label(item) {
    if (!item) return '';
    return item.name + ' (' + (item.files | 0) + ' 枚)' + (item.current ? ' — 自分の保存先' : '');
  }

  // 閲覧中であることの 1 行。保存先が動いていないことを必ず言う
  // (「切り替えたつもりで保存して紛れ込む」がこの機能で起きないため)。
  function noticeText(peekDir, saveDir) {
    if (!peekDir) return '';
    if (samePath(peekDir, saveDir)) return baseName(peekDir) + ' を見ています (自分の保存先)';
    return baseName(peekDir) + ' を読むだけで見ています。保存先は '
      + baseName(saveDir) + ' のままです';
  }

  function samePath(a, b) {
    return _s(a).split('\\').join('/').replace(/\/+$/, '').toLowerCase()
      === _s(b).split('\\').join('/').replace(/\/+$/, '').toLowerCase();
  }

  // 一覧の中の 1 つ前 / 次。読むだけの画面では、閉じて選び直さずに隣の図へ行けると
  // 「先輩の図を何枚か見る」がクリック 1 回ずつで進む。
  function step(names, current, delta) {
    var list = (names || []).map(_s);
    if (list.length === 0) return null;
    var i = list.indexOf(_s(current));
    if (i < 0) return list[0];
    var n = (i + delta) % list.length;
    if (n < 0) n += list.length;
    return list[n];
  }


  // 覗いている 1 枚を、そのままテンプレート新規作成の材料にする。
  // BLK-junior-20260909-0503-wish: 読むだけで見た先輩の図は画面上のテキストの
  // ままで自分のタブへは何も引き継がれず、見た構成を覚えて新しいタブに打ち直す
  // (実測 360 字) しかなかった。覗いた図そのものをテンプレートの選択肢にすれば、
  // 打つのは部品名だけになり、写し違いも起きない。
  // 中身が空の図は材料にならない (置換する語が無く、押しても何も作れない)。
  function templateSeed(dir, name, dsl) {
    var n = _s(name), text = _s(dsl);
    if (!n || !text.replace(/\s/g, '')) return null;
    var folder = baseName(dir);
    return {
      value: 'peek:' + folder + '/' + n,
      folder: folder,
      dir: _s(dir),
      name: n,
      label: folder + ' / ' + n + '（他のフォルダ）',
      dsl: text,
    };
  }

  // 置換元にいちばん近い候補。ファイル名 (timer_init_sequence.puml) に出てくる語を
  // 優先する。図の本文だけで数えると、どの図にも出る App のような語が
  // 出現数で勝ってしまい、写したい部品名 (Timer) が選ばれない。
  // 候補は templateNew.candidates の並び (出現数の多い順) をそのまま受ける。
  function seedHint(fileName, candidates) {
    var base = _s(fileName).toLowerCase();
    var list = candidates || [];
    for (var i = 0; i < list.length; i++) {
      var n = _s(list[i] && list[i].name);
      if (n && base.indexOf(n.toLowerCase()) >= 0) return n;
    }
    return list.length ? _s(list[0].name) : '';
  }

  // 覗き一覧の 1 行に出す図種の印 (BLK-junior-20260912-2206)。
  // junior は先輩のフォルダにコンポーネント図があるかを見に行くのに、名前だけの
  // 一覧を 30 行読んで語尾 (_state / _sequence) から図種を推測していた。
  // 自分の 📂 一覧と同じ決め方にする: 保存したときの図種の控え (savedKind) が
  // あればそれ、無ければ server の本文判定 (kind)。どちらも無ければ印を出さない
  // (当てずっぽうの印は、無い図種を「有る」と読ませる)。
  function kindBadge(entry) {
    var SK = window.MA.savedKind, DK = window.MA.diagramKind;
    var e = entry || {};
    var saved = (SK && SK.label(e.savedKind)) ? _s(e.savedKind) : '';
    if (saved && SK) {
      var b = SK.badge(saved);
      return { slug: saved, source: 'saved', text: b.mark + ' ' + b.label,
               title: '保存したときの図種は' + b.label + '図' };
    }
    var label = DK ? DK.label(e.kind) : '';
    if (!label) return null;
    return { slug: _s(e.kind), source: 'guess', text: label,
             title: 'この図の図種（本文から判定）' };
  }

  // テンプレートとして開けるかどうかの 1 行。押せないときは理由を出す。
  function seedNotice(seed) {
    if (!seed) return '図を選ぶとテンプレートとして開けます';
    return seed.folder + ' の ' + seed.name + ' をテンプレートにして新しい図を作ります';
  }

  return {
    baseName: baseName,
    choices: choices,
    others: others,
    defaultDir: defaultDir,
    label: label,
    samePath: samePath,
    noticeText: noticeText,
    step: step,
    kindBadge: kindBadge,
    templateSeed: templateSeed,
    seedNotice: seedNotice,
    seedHint: seedHint,
  };
})();
