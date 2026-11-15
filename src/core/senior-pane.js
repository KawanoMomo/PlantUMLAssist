'use strict';

// senior-pane — 右の枠 (読むだけ) の覚えておくものと名前の扱い。
//
// 右の枠に出るのは 2 つだけ:
//   - FILES「読むだけ」節で押した隣のフォルダの図 1 枚 (書かずに見る)
//   - GIT 節の「この図の履歴」で選んだ版 (app.js の _seniorGit)
// 図を切り替えるたびに相手を名前で選び直す追従・据え置く / 1 回だけ・共通図から部品を抜き出す・
// 相手が無いときに自分の他部品を見本に出す仕組みは TICKET-owner-20261115-2141-prune で外した
// (2 枚を比べるのは「この図の履歴」の版との比較だけ)。DOM と通信は app.js。
(function() {
  var STORE_KEY = 'pua.senior.pane';

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  // 拡張子とフォルダを落とした名前。
  function baseOf(name) {
    var s = _s(name).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // フォルダ込みの同一パスかどうか。
  function samePath(a, b) {
    function norm(p) {
      return _s(p).split('\\').join('/').replace(/\/+$/, '').toLowerCase();
    }
    return !!a && !!b && norm(a) === norm(b);
  }

  // 枠の上に出す 1 行。どのフォルダのどの図を、書かずに出しているかを言う。
  function noticeText(dir, name) {
    var folder = _s(dir).split(/[\\/]/).filter(Boolean).pop() || _s(dir);
    if (!_s(name)) return '「読むだけ」のフォルダを開いて、図を押してください';
    return folder + ' の ' + baseOf(name) + '（読むだけ・書き換えません）';
  }

  // ---- 覚えておくもの -------------------------------------------------------
  // 幅と初回説明の扱いは参照ペインと揃えたいので side-pane に寄せる
  // (side-pane を読み込んでいない場での単体使用に備えて、無ければ自前で丸める)。
  // 前の版が覚えていた mode (据え置く / 1 回だけ) などの知らない値は読み捨てる。
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
    };
  }

  // 初めて開いたときだけ出す 1 行。この枠が何かを短く言う (読むだけだと分かること)。
  var FIRST_NOTE = 'この枠は、読むだけのフォルダの図や、この図の履歴の版を横に出すものです'
    + '（読むだけ・書き換えません）。× で閉じられます。';

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
    baseOf: baseOf, samePath: samePath, noticeText: noticeText,
    normalize: normalize, load: load, save: save,
    FIRST_NOTE: FIRST_NOTE, firstOpenNote: firstOpenNote,
    DEFAULT_WIDTH: DEFAULT_WIDTH, MIN_WIDTH: MIN_WIDTH,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.seniorPane = api;
  }
})();
