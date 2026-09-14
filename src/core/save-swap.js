'use strict';
window.MA = window.MA || {};

// save-swap — 「この保存で、図の中身が別名の図と入れ替わっていないか」を保存の
// その場で見る (BLK-reviewer-20260912-2103-wish)。
//
// reviewer が見つけた事故: driver_common_class.puml が 7 クラス・メソッド 35 個超から
// 3 行に激減し、その 3 行が plantuml-class.puml とバイト完全一致していた。
// diagram1.puml も同様に plantuml-sequence.puml のテンプレに戻っていた。
// 中身がファイルをまたいで入れ替わったように見えるのに、GUI にはどの保存操作が
// それを起こしたかの記録が無く、reviewer は puml のバイト比較から推測するしかなかった。
// 書いた本人 (primary) も気付いていない。
//
// ここで見るのは 2 つだけ。どちらも「雛形に戻った / 別の図になった」を指す形。
//   twin   — 保存した中身が、保存フォルダの別名のファイルと完全一致した
//            (図が違うのに中身が同じなら、どちらかは上書き事故か雛形の取り違え)
//   shrink — 直前に保存した自分の中身から、行が大きく減った
//            (書き足した図が雛形に戻ると必ずこの形になる)
//
// あわせて保存 1 回ぶんを控えに積む。事故が起きた後でも「いつ・どのファイルを
// 保存して・何行になり・どのファイルと一致したか」を名前ごと読み返せるようにする
// (_versions/ の退避は中身は残るが「どの操作で」が残らない)。
//
// ここは DOM も fetch も見ない純関数と、渡された store (localStorage) の読み書きだけ。
(function() {
  var KEY_PREFIX = 'pua.saveswap:';
  var MAX_ENTRIES = 30;

  // 行がこの割合より減ったら「大きく減った」。半分は偶然の書き直しでも起きるが、
  // 2/3 が消えるのは書き直しではなく取り違えの形 (reviewer の実例は 35 行超 → 3 行)。
  var SHRINK_RATIO = 0.66;
  // 元が数行しか無い図は、1 行消しただけで割合が跳ねる。雛形に戻った事故は
  // 必ずまとまった行数を失うので、失った行数の下限も置く。
  var SHRINK_MIN_LOST = 5;

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  function storageKey(fileDir) {
    return KEY_PREFIX + _s(fileDir === '' || fileDir == null ? './autosave' : fileDir);
  }

  // 突合の単位。空白と行末・末尾の空行の違いは「別の中身」ではない。
  // save-diff があればその規約に従う (同じ図を別の規約で二度判定しない)。
  function normalize(dsl) {
    var SD = window.MA.saveDiff;
    if (SD && SD.normalize) return SD.normalize(dsl);
    return _s(dsl).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function _lineCount(dsl) {
    var t = normalize(dsl);
    return t === '' ? 0 : t.split('\n').length;
  }

  // @startuml/@enduml とコメントしか無い図は、別名どうしで一致していて
  // 当たり前なので twin に数えない。逆に本文が 1 行でもあれば数える:
  // reviewer の実例 (`class Foo` だけの 3 行) がまさにその形で、
  // ここを「2 行以上」にすると事故そのものを見逃す。
  function _tooThin(dsl) {
    var t = normalize(dsl);
    if (t === '') return true;
    var body = t.split('\n').filter(function(l) {
      var s = l.trim();
      return s !== '' && !/^@/.test(s) && !/^'/.test(s);
    });
    return body.length < 1;
  }

  // 1 回の保存を見る。
  //   opts.name       保存した図の名前
  //   opts.dsl        保存した中身
  //   opts.prev       同じ図の直前の中身 (無ければ null。初回保存では shrink を見ない)
  //   opts.folderDocs 保存フォルダの他のファイル [{ name, dsl }]
  // → { name, twins: [名前...], shrink: {before, after, lost} | null, warn, lines: [文...] }
  function inspect(opts) {
    var o = opts || {};
    var name = _s(o.name);
    var dsl = _s(o.dsl);
    var norm = normalize(dsl);
    var out = { name: name, twins: [], shrink: null, warn: false, lines: [] };
    if (!name) return out;

    if (!_tooThin(dsl)) {
      _list(o.folderDocs).forEach(function(f) {
        if (!f || !f.name || _s(f.name) === name) return;
        if (normalize(f.dsl) === norm) out.twins.push(_s(f.name));
      });
    }
    out.twins.sort();

    if (o.prev != null && _s(o.prev) !== '') {
      var before = _lineCount(o.prev);
      var after = _lineCount(dsl);
      var lost = before - after;
      if (before > 0 && lost >= SHRINK_MIN_LOST && (lost / before) >= SHRINK_RATIO) {
        out.shrink = { before: before, after: after, lost: lost };
      }
    }

    if (out.twins.length) {
      out.lines.push('保存した中身が ' + out.twins.join('・')
        + ' と完全に同じです (別の図と入れ替わった / 雛形で上書きした可能性)');
    }
    if (out.shrink) {
      out.lines.push('この保存で ' + out.shrink.before + ' 行から ' + out.shrink.after
        + ' 行に減りました (−' + out.shrink.lost + ' 行)');
    }
    out.warn = out.lines.length > 0;
    return out;
  }

  function summaryLine(res) {
    if (!res || !res.warn) return '';
    return '⚠ ' + res.name + ': 保存した中身が別の図と入れ替わっていないか確かめてください';
  }

  // ── 保存操作の控え ─────────────────────────────────────────────────────
  // 「どの操作で入れ替わったか」を後から読むための記録。事故が起きてからでないと
  // 読まれないので、警告が出なかった保存も含めて全部積む (積まないと、事故の
  // 直前に何を保存したかが欠ける)。
  function load(store, fileDir) {
    try {
      var raw = store && store.getItem(storageKey(fileDir));
      var data = raw ? JSON.parse(raw) : null;
      return { entries: _list(data && data.entries) };
    } catch (e) { return { entries: [] }; }
  }

  function save(store, fileDir, log) {
    try {
      if (!store) return false;
      store.setItem(storageKey(fileDir), JSON.stringify({ entries: _list(log && log.entries) }));
      return true;
    } catch (e) { return false; }
  }

  // 新しいものが先頭。MAX_ENTRIES を超えた分は落とす。
  // lines は保存後の行数 (inspect は行数を持ち歩かないので、呼び出し側が渡す)。
  function record(log, res, at, lines) {
    var entries = _list(log && log.entries).slice();
    entries.unshift({
      at: _s(at), name: _s(res && res.name),
      lines: (typeof lines === 'number') ? lines : 0,
      twins: _list(res && res.twins),
      lost: res && res.shrink ? res.shrink.lost : 0,
    });
    return { entries: entries.slice(0, MAX_ENTRIES) };
  }

  // 控えの 1 行。ファイル名を必ず含める (名前が無いと事故を追えない)。
  function logLine(entry) {
    if (!entry) return '';
    var at = _s(entry.at).replace('T', ' ').slice(0, 19);
    var txt = at + '  ' + _s(entry.name) + '  ' + (entry.lines || 0) + ' 行';
    if (entry.lost) txt += ' (−' + entry.lost + ')';
    if (_list(entry.twins).length) txt += '  = ' + _list(entry.twins).join('・');
    return txt;
  }

  var api = {
    storageKey: storageKey,
    normalize: normalize,
    inspect: inspect,
    summaryLine: summaryLine,
    load: load,
    save: save,
    record: record,
    logLine: logLine,
    lineCount: _lineCount,
    SHRINK_RATIO: SHRINK_RATIO,
    SHRINK_MIN_LOST: SHRINK_MIN_LOST,
    MAX_ENTRIES: MAX_ENTRIES,
  };
  window.MA.saveSwap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
