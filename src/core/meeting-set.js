'use strict';
window.MA = window.MA || {};

// meeting-set — 会議で見せる図を自分で選んで並べる「会議セット」。
//
// BLK-primary-20260918-0249-wish: レビュー会議で変更前後を見せる場面では、その日の
// 対象は毎回変わる (今日は spi_init_sequence / spi_state / driver_common_class の 3 枚)。
// 変更サマリボードは「変わった図」を全部並べるので、会議で見せない図も混ざり、
// 見せたい 3 枚はタブを 1 枚ずつ開き直して ⇔見比べ・±差分・▤ を往復するしかなかった。
//
// ここでは「今日見せる図の名前の並び」だけを持つ。ボードはこの並びに載っている図だけを、
// 選んだ順に、変わっていなくても並べる (会議で「この図は変わっていません」と見せる場面がある)。
// 画面・localStorage の読み書きは app.js の職掌で、このモジュールは DOM に触らない。
window.MA.meetingSet = (function() {
  var KEY = 'plantuml-meeting-set';
  // 会議で 1 画面に並べて話せる枚数。下限は「1 枚ずつ開き直す」より得になる枚数、
  // 上限は画面を上下に繰らずに切り替えられる枚数 (台本の 3〜5 枚)。
  var MIN = 3;
  var MAX = 5;

  var _names = null;   // [ docName ]

  function _clean(list) {
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function(n) {
      var name = String(n == null ? '' : n).trim();
      if (!name || seen[name]) return;
      seen[name] = true;
      if (out.length < MAX) out.push(name);
    });
    return out;
  }

  // 保存形式。壊れていれば空の並びとして扱う (会議セットは作り直せる)。
  function parse(raw) {
    if (raw == null || raw === '') return [];
    var v;
    try { v = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return []; }
    if (Array.isArray(v)) return _clean(v);
    if (v && typeof v === 'object' && Array.isArray(v.names)) return _clean(v.names);
    return [];
  }

  function serialize(list) {
    return JSON.stringify({ names: _clean(list) });
  }

  function _load() {
    if (_names) return _names;
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    _names = parse(raw);
    return _names;
  }

  function _save() {
    try { window.localStorage.setItem(KEY, serialize(_names)); } catch (e) {}
  }

  function list() { return _load().slice(); }

  function has(name) {
    var n = String(name == null ? '' : name).trim();
    return !!n && _load().indexOf(n) >= 0;
  }

  function count() { return _load().length; }

  // 会議セットに入れる / 外す。戻り値は「入れた後に入っているか」。
  // 上限まで入っている状態でさらに足そうとしたときは何もせず false を返す
  // (黙って古い 1 枚を落とすと、会議で見せるつもりの図が消える)。
  function toggle(name) {
    var n = String(name == null ? '' : name).trim();
    if (!n) return false;
    var cur = _load();
    var at = cur.indexOf(n);
    if (at >= 0) {
      cur.splice(at, 1);
      _save();
      return false;
    }
    if (cur.length >= MAX) return false;
    cur.push(n);
    _save();
    return true;
  }

  function add(name) {
    var n = String(name == null ? '' : name).trim();
    if (!n || has(n)) return has(n);
    return toggle(n);
  }

  function remove(name) {
    if (!has(name)) return false;
    toggle(name);
    return true;
  }

  function clear() {
    _names = [];
    _save();
    return true;
  }

  // 図の一覧を会議セットの並び (選んだ順) に絞る。載っていない名前は落とす
  // (フォルダから消えた図を会議の一覧に空の枠として残さない)。
  function pickDocs(docs) {
    var by = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (d && d.name && !by[String(d.name)]) by[String(d.name)] = d;
    });
    var out = [];
    _load().forEach(function(n) { if (by[n]) out.push(by[n]); });
    return out;
  }

  // BLK-primary-20260924-2232-friction: 会議で見せる図を選ぶ欄の候補。開いているタブの図に加えて、
  // 保存先 (保存フォルダ) の図も並べる。ワークスペースは同時に開ける図が限られるので、開いている図だけだと
  // 1 枚ごとに「一覧を開く → 図を開く → ボードを開き直す」を繰り返すことになっていた。
  // 返すのは [{ name, group: 'open' | 'folder', picked }]。同名は開いている方だけ (未保存の編集を含む方)。
  function docOptions(openDocs, fileDocs) {
    var seen = {};
    var out = [];
    function push(d, group) {
      if (!d || !d.name) return;
      var n = String(d.name);
      if (seen[n]) return;
      seen[n] = true;
      out.push({ name: n, group: group, picked: has(n) });
    }
    (Array.isArray(openDocs) ? openDocs : []).forEach(function(d) { push(d, 'open'); });
    var files = (Array.isArray(fileDocs) ? fileDocs : []).slice().sort(function(a, b) {
      var x = String((a && a.name) || ''), y = String((b && b.name) || '');
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    files.forEach(function(d) { push(d, 'folder'); });
    return out;
  }

  // 会議セットに選んだのにボードの図 (開いている図 + 今日更新された保存フォルダの図) に無い図を、
  // 保存フォルダのファイルから補う。開き直さずに選んだ図も、変わっていなくても会議セットに並ぶ。
  // 返す形は change-board.folderExtras と同じ (origin: 'folder')。meetingPick を立てて、
  // 変更前が引けないときは今の中身を変更前として扱えるようにする (変更前 / 変更後が同じ図になる)。
  function folderPicks(fileDocs, boardDocs) {
    var inBoard = {};
    (Array.isArray(boardDocs) ? boardDocs : []).forEach(function(d) {
      if (d && d.name) inBoard[String(d.name)] = true;
    });
    var byName = {};
    (Array.isArray(fileDocs) ? fileDocs : []).forEach(function(f) {
      if (f && f.name && !byName[String(f.name)]) byName[String(f.name)] = f;
    });
    var out = [];
    _load().forEach(function(n) {
      var f = byName[n];
      if (!f || inBoard[n]) return;
      out.push({
        id: 'file:' + n, name: n,
        dsl: String(f.dsl == null ? '' : f.dsl),
        diagramType: f.diagramType || '',
        origin: 'folder', mtime: String(f.mtime == null ? '' : f.mtime),
        meetingPick: true,
      });
    });
    return out;
  }

  // 会議セットに入っているのに開いても保存フォルダにも無い名前。
  // 「3 枚選んだのに 2 枚しか並ばない」を黙って起こさないために外へ出す。
  function missing(docs) {
    var by = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (d && d.name) by[String(d.name)] = true;
    });
    return _load().filter(function(n) { return !by[n]; });
  }

  // ボードの見出しに出す 1 行。何枚を選んでいるかと、足りない分を言う。
  function summaryText(missingNames) {
    var cur = _load();
    if (cur.length === 0) {
      return '会議セットは空です (' + MIN + '〜' + MAX + ' 枚選ぶ)';
    }
    var txt = '会議セット ' + cur.length + ' 枚 ・ ' + cur.join(' → ');
    if (cur.length < MIN) txt += ' (あと ' + (MIN - cur.length) + ' 枚選べます)';
    var miss = Array.isArray(missingNames) ? missingNames : [];
    if (miss.length) txt += ' ・ 見つからない図: ' + miss.join(', ');
    return txt;
  }

  // 上限に達したときに押した人へ返す一言。
  function fullText() {
    return '会議セットは ' + MAX + ' 枚までです (外してから選び直してください)';
  }

  // テスト用。localStorage を差し替えた後に読み直す。
  function _reset() { _names = null; }

  return {
    KEY: KEY,
    MIN: MIN,
    MAX: MAX,
    parse: parse,
    serialize: serialize,
    list: list,
    has: has,
    count: count,
    toggle: toggle,
    add: add,
    remove: remove,
    clear: clear,
    pickDocs: pickDocs,
    docOptions: docOptions,
    folderPicks: folderPicks,
    missing: missing,
    summaryText: summaryText,
    fullText: fullText,
    _reset: _reset,
  };
})();
