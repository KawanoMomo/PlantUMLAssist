'use strict';
window.MA = window.MA || {};

// target-set — 保存フォルダに「この一式が揃っていること」を対象 set として登録し、
// 📂 一覧の見出しで期待枚数と突き合わせる。
//
// BLK-primary-20260908-1703: 台本の手順 1 は「対象 14 枚が揃っているか確認する」だが、
// 一覧は今そこにあるものを並べるだけで、期待している枚数を持っていない。
// 「14 枚あるか」は一覧をスクロールして名前を目で数えるしかなく、図が 1 枚増減しても
// 数え直すまで気付けない。名前の規約で数えようとすると、規約から外れた図を取りこぼす。
// ここでは利用者が「今の一覧を対象 set にする」と決めた瞬間の名前の集合を正本にし、
// 以降は開いた瞬間に 過不足 を言い切る。
//
// 印はフォルダごとに localStorage へ置く (フォルダを分ければ対象 set も分かれる)。
// DOM にも fetch にも触らない純関数だけ。描画は app.js。
window.MA.targetSet = (function() {
  var KEY_PREFIX = 'pua.target.set:';

  function _s(v) { return v == null ? '' : String(v); }

  function _dir(fileDir) {
    var d = _s(fileDir);
    return d === '' ? './autosave' : d;
  }

  function storageKey(fileDir) { return KEY_PREFIX + _dir(fileDir); }

  // 対象 set の名前。重複と空文字は落として、登録した並びを保つ
  // (並びは「一覧で数えた順」であり、足りない図を探すときの手掛かりになる)。
  function normalize(names) {
    var out = [];
    (names || []).forEach(function(n) {
      var v = _s(typeof n === 'string' ? n : (n && n.name));
      if (v !== '' && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  function has(names, name) { return normalize(names).indexOf(_s(name)) >= 0; }

  function toggle(names, name) {
    var v = _s(name);
    if (v === '') return normalize(names);
    var out = normalize(names);
    var i = out.indexOf(v);
    if (i >= 0) out.splice(i, 1);
    else out.push(v);
    return out;
  }

  // 一覧と対象 set を突き合わせる。足りない (missing) と 対象外 (extra) を分けて返す。
  // 対象外を「余り」と呼ばないのは、下書きや別件の図が同じフォルダにあるのは
  // 普通のことで、それ自体は異常ではないため。数えるのは対象 set の側だけ。
  function reconcile(names, entries) {
    var want = normalize(names);
    var here = {};
    var order = [];
    (entries || []).forEach(function(e) {
      if (e == null) return;
      var nm = _s(typeof e === 'string' ? e : e.name);
      if (nm === '' || here[nm]) return;
      here[nm] = true;
      order.push(nm);
    });
    var wantMap = {};
    want.forEach(function(n) { wantMap[n] = true; });

    var present = [], missing = [];
    want.forEach(function(n) { (here[n] ? present : missing).push(n); });
    var extra = order.filter(function(n) { return !wantMap[n]; });

    return {
      configured: want.length > 0,
      expected: want.length,
      present: present.length,
      presentNames: present,
      missing: missing,
      extra: extra,
      complete: want.length > 0 && missing.length === 0,
    };
  }

  // 見出しの 1 行。開いた瞬間にここだけ読めば過不足が分かることが要件なので、
  // 足りない図の名前まで出す (数だけだと結局スクロールして探すことになる)。
  function summary(rec) {
    var r = rec || {};
    if (!r.configured) return '対象set: 未登録（この一覧を対象setにすると過不足が出ます）';
    var head = '対象set: ' + r.present + '/' + r.expected;
    if (r.complete) {
      var tail = r.extra && r.extra.length
        ? '（対象外 ' + r.extra.length + ' 枚）'
        : '';
      return head + ' 揃っています' + tail;
    }
    return head + ' — 足りない: ' + (r.missing || []).join('、');
  }

  // 揃っている / 欠けている を色で言い分けるための印。
  function summaryClass(rec) {
    var r = rec || {};
    if (!r.configured) return 'target-set-none';
    return r.complete ? 'target-set-ok' : 'target-set-short';
  }

  function buttonLabel(rec) {
    var r = rec || {};
    return r.configured
      ? '対象setを今の一覧で取り直す'
      : '今の一覧を対象setにする';
  }

  function buttonTitle(rec) {
    var r = rec || {};
    return r.configured
      ? '対象set (' + r.expected + ' 枚) を、今この一覧にある図で登録し直す'
      : '今この一覧にある図を「揃っているべき一式」として登録する。'
        + '次に開いたときは、この枚数との過不足が見出しに出る';
  }

  function clearLabel() { return '対象setを外す'; }

  // 行に出す印のボタン。1 枚だけ後から足す / 外すために使う
  // (14 枚のうち 1 枚を足し忘れたときに、取り直しをしなくて済む)。
  function rowLabel(inSet) { return inSet ? '対象' : '対象にする'; }

  function rowTitle(inSet) {
    return inSet
      ? 'この図を対象setから外す'
      : 'この図を対象setに加える';
  }

  function load(storage, fileDir) {
    if (!storage || !storage.getItem) return [];
    var raw = null;
    try { raw = storage.getItem(storageKey(fileDir)); } catch (e) { return []; }
    if (!raw) return [];
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!arr || typeof arr.length !== 'number' || typeof arr === 'string') return [];
    return normalize(arr);
  }

  function save(storage, fileDir, names) {
    if (!storage || !storage.setItem) return false;
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(normalize(names)));
      return true;
    } catch (e) { return false; }
  }

  function clear(storage, fileDir) {
    if (!storage || !storage.removeItem) return false;
    try { storage.removeItem(storageKey(fileDir)); return true; } catch (e) { return false; }
  }

  return {
    storageKey: storageKey,
    normalize: normalize,
    has: has,
    toggle: toggle,
    reconcile: reconcile,
    summary: summary,
    summaryClass: summaryClass,
    buttonLabel: buttonLabel,
    buttonTitle: buttonTitle,
    clearLabel: clearLabel,
    rowLabel: rowLabel,
    rowTitle: rowTitle,
    load: load,
    save: save,
    clear: clear,
  };
})();
