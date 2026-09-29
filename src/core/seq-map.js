'use strict';
window.MA = window.MA || {};

// seq-map — シーケンス図どうしの対応表 (参加者 = 部品名、メッセージ = ラベル)。
//
// BLK-primary-20260925-0932-wish: 対応表は状態遷移図とクラス図にしか効かず、
// junior と primary のシーケンス図 (spi_sequence / spi_init_sequence) のように部品名が
// 総入れ替えの 2 枚は、どの部品がどの部品かを手で結ぶ場所が無かった。
// 参加者を「状態」、メッセージを「遷移」(きっかけ = ラベル) に読み替えて state-map の
// 対応の取り方・手で決める対応 (同じもの / 対応なし / 対応を選ぶ) をそのまま使う。
// 規則を 2 つ持たないので、状態遷移図と同じ操作で結べる。
//
// 参照図だけのメッセージを自分の図に足す (＋この図にも足す) は扱わない
// (シーケンス図の取り込みは「並べて比較」の増分の取り込みが持つ)。
window.MA.seqMap = (function() {
  function _sm() { return window.MA.stateMap; }
  function _s(v) { return v == null ? '' : String(v).trim(); }

  // シーケンス図の parse 結果 → state-map が読む形 ({states, transitions})。
  function toStateLike(parsed) {
    var els = ((parsed && parsed.elements) || []).filter(function(e) {
      return e && e.kind === 'participant' && _s(e.id) !== '';
    });
    var rels = ((parsed && parsed.relations) || []).filter(function(r) {
      return r && r.kind === 'message' && _s(r.from) !== '' && _s(r.to) !== '';
    });
    return {
      states: els.map(function(e) {
        return { id: _s(e.id), label: _s(e.label) || _s(e.id), line: e.line };
      }),
      transitions: rels.map(function(r) {
        return { id: r.id, from: _s(r.from), to: _s(r.to), trigger: _s(r.label), line: r.line };
      }),
    };
  }

  function build(refParsed, mineParsed, ov) {
    var map = _sm().build(toStateLike(refParsed), toStateLike(mineParsed), ov);
    map.kind = 'sequence';
    return map;
  }

  function summary(map) {
    var rows = ((map && map.states) || []).concat((map && map.transitions) || []);
    if (rows.length === 0) return 'シーケンス図が読めません';
    return _sm().summary(map);
  }

  function abstractionWarning(map) {
    return _sm().abstractionWarning(map).replace('状態名', '参加者名');
  }

  var api = {
    toStateLike: toStateLike,
    build: build,
    summary: summary,
    abstractionWarning: abstractionWarning,
    matchLabel: function(m) { return _sm().matchLabel(m); },
    supportsOverrides: true,
    // 参照図だけの行を自分の図に足す道は持たない (_mapRow が「＋この図にも足す」を出さない)。
    supportsAdopt: false,
    adoptPlan: function() { return { adoptable: false, reason: 'シーケンス図の取り込みは増分の取り込みで行います' }; },
    applyAdopt: function() { return null; },
    sectionTitles: {
      states: '参加者 = 部品名 (参照図 / 自分の図)',
      transitions: 'メッセージ (参照図 / 自分の図)',
    },
    emptyMessage: '参加者が読めません。どちらもシーケンス図にしてください。',
  };
  // 手で決める対応の道具は state-map のものをそのまま使う (決め方を 2 通りにしない)。
  ['EMPTY_OVERRIDES', 'overrides', 'withPair', 'withNone', 'without', 'decisionOf', 'isGuess',
    'guessCount', 'settled', 'addedByRef', 'decisionSummary', 'pairOptions', 'NEW_STATE'].forEach(function(k) {
    Object.defineProperty(api, k, {
      enumerable: true,
      get: function() { return _sm()[k]; },
    });
  });
  return api;
})();
