'use strict';
window.MA = window.MA || {};

// save-prefs — 保存先を「このマシンの設定」として server 側に覚えさせる。
//
// BLK-junior-20260907-0843: 保存先ディレクトリ (backend / fileDir) は
// localStorage にしか無かった。ペルソナは図種を変えるたびに新しいタブ・
// 新しいブラウザプロファイルで開くので、そのたびに設定が既定へ戻り、
// ⚙設定 → ファイル → パス再入力 → OK を打ち直すことになっていた。
//
// 保存先はブラウザの好みではなくマシンの置き場所なので、server.py の
// `/prefs` (`.assist-prefs.json`) に置き、localStorage に指定が無いときだけ
// そこから引き継ぐ。localStorage に既に指定があればそちらを優先する
// (同じマシンでブラウザごとに別の保存先を使う運用を壊さない)。
//
// ここは fetch と純関数だけ。DOM には触らない。
window.MA.savePrefs = (function() {
  var KEYS = ['backend', 'fileDir'];

  // server に置いてよい値だけを取り出す。空文字・非文字列は落とす。
  function pick(cfg) {
    var out = {};
    if (!cfg || typeof cfg !== 'object') return out;
    KEYS.forEach(function(k) {
      if (typeof cfg[k] === 'string' && cfg[k]) out[k] = cfg[k];
    });
    return out;
  }

  // localStorage に入っている設定 (stored) に対し、server の prefs のうち
  // 実際に引き継ぐべきものを返す。stored が既に持っているキーは触らない。
  function applicable(stored, serverPrefs) {
    var have = (stored && typeof stored === 'object') ? stored : {};
    var from = pick(serverPrefs);
    var out = {};
    Object.keys(from).forEach(function(k) {
      if (typeof have[k] === 'string' && have[k]) return;   // このブラウザの指定が勝つ
      out[k] = from[k];
    });
    return out;
  }

  function load() {
    try {
      if (!window.fetch) return Promise.resolve({});
      return window.fetch('/prefs')
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(j) { return pick(j); })
        .catch(function() { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }

  // 保存は投げっぱなし。ここで失敗しても localStorage 側の保存は済んでいる。
  function save(cfg) {
    var body = pick(cfg);
    if (Object.keys(body).length === 0) return;
    try {
      if (!window.fetch) return;
      window.fetch('/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(function() {});
    } catch (e) { /* server が居なくても設定画面は閉じられる */ }
  }

  return { KEYS: KEYS, pick: pick, applicable: applicable, load: load, save: save };
})();
