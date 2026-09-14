'use strict';
window.MA = window.MA || {};

// selected-endpoints — 「直前に選んだメッセージの当事者」を憶えて、
// 末尾追加フォームの From / To の初期値にする。
//
// BLK-junior-20260907-2203: 応答メッセージ行をプレビュー / DSL で選び直しても、
// 「末尾に追加」の From / To は前回値 (既定は先頭の参加者) のままで、選んだ行の
// 当事者 (Gpio_Driver → App) に連動しなかった。応答を 1 本足すたびに
// プルダウンを 2 つ選び直すことになる。挿入フォーム (この前に / この後に) は
// アンカー行の当事者を初期選択している (FEAT-001/002) のに、末尾追加だけが
// 選択を捨てていた。
//
// DOM には触らない。憶えるのと初期値を決めるところだけ。
window.MA.selectedEndpoints = (function() {
  var _mem = null;

  function _s(v) { return v == null ? '' : String(v); }

  // 図の外 ([ / ]) は参加者一覧に無いので、初期値としては使えない。
  function _usable(id) {
    var s = _s(id);
    return s !== '' && s !== '[' && s !== ']';
  }

  // 選んだメッセージを憶える。当事者が読めないものは憶えない
  // (憶えられなかったときに古い当事者が残ると、選び直したのに前の値が出る)。
  function remember(msg) {
    if (!msg || (!_usable(msg.from) && !_usable(msg.to))) { _mem = null; return null; }
    _mem = { from: _s(msg.from), to: _s(msg.to) };
    return _mem;
  }

  function get() { return _mem ? { from: _mem.from, to: _mem.to } : null; }

  function clear() { _mem = null; }

  function _has(ids, id) {
    var list = ids && typeof ids.length === 'number' ? ids : [];
    for (var i = 0; i < list.length; i++) if (_s(list[i]) === _s(id)) return true;
    return false;
  }

  // 今いる図の参加者一覧に照らして初期値を決める。
  // source は selection (両方生きている) / partial (片方だけ) / none (憶えが無い・
  // 参加者が消えた)。none のときは null を返し、これまでどおり先頭の参加者に任せる。
  function defaultsFor(participantIds, mem) {
    var m = mem === undefined ? _mem : mem;
    var from = m && _usable(m.from) && _has(participantIds, m.from) ? _s(m.from) : null;
    var to = m && _usable(m.to) && _has(participantIds, m.to) ? _s(m.to) : null;
    var source = (from && to) ? 'selection' : ((from || to) ? 'partial' : 'none');
    return { from: from, to: to, source: source };
  }

  // 初期値の出どころを 1 行で言う。黙って埋めると、選んだ行と違う相手に
  // 送ってしまったときに気づけない。
  function noteText(defaults, labelOf) {
    var d = defaults || {};
    if (d.source !== 'selection' && d.source !== 'partial') return '';
    var name = function(id) {
      if (!id) return '（未定）';
      var l = typeof labelOf === 'function' ? labelOf(id) : null;
      return _s(l || id);
    };
    if (d.source === 'partial') {
      return '直前に選んだ行の当事者 ' + name(d.from || d.to) + ' を初期値にしています'
        + '（もう一方は図にいないので選び直してください）';
    }
    return '直前に選んだ ' + name(d.from) + ' → ' + name(d.to) + ' を初期値にしています';
  }

  return {
    remember: remember,
    get: get,
    clear: clear,
    defaultsFor: defaultsFor,
    noteText: noteText,
  };
})();
