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

  // テンプレートとして開けるかどうかの 1 行。押せないときは理由を出す。
  function seedNotice(seed) {
    if (!seed) return '図を選ぶとテンプレートとして開けます';
    return seed.folder + ' の ' + seed.name + ' をテンプレートにして新しい図を作ります';
  }

  return {
    baseName: baseName,
    choices: choices,
    others: others,
    label: label,
    samePath: samePath,
    noticeText: noticeText,
    step: step,
    templateSeed: templateSeed,
    seedNotice: seedNotice,
    seedHint: seedHint,
  };
})();
