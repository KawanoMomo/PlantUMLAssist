'use strict';
window.MA = window.MA || {};

// app-bridge — Web 版とアプリ版 (pywebview) の差を 1 箇所に閉じ込める。
//
// BLK-human-20260909-2200: 配布先には Python も Java も PlantUML も無い。
// アプリ版では
//   - plantuml.jar は同梱せず、利用者が選ぶ (または「公式から取得」で取る)
//   - Java も同梱せず、無ければ Temurin の URL を出す
//   - 保存・書き出しはブラウザのダウンロードではなくネイティブのダイアログ
// になる。Web 版の振る舞いは一切変えないので、判定はすべて `/env` の答え
// (`app` / `jar` / `java`) 1 つに寄せ、画面側は文言だけを受け取る。
//
// ここは純関数と fetch だけ。DOM には触らない。
window.MA.appBridge = (function() {
  var _env = null;

  // ── 純関数 ────────────────────────────────────────────────────────────
  // /env の答えから「アプリ版か」。答えが無い間は Web 版として振る舞う
  // (取りに行く前に保存を止めない)。
  function isApp(env) {
    var e = env === undefined ? _env : env;
    return !!(e && e.app);
  }

  // jar の状態を 1 行で言う。ok なら何も直す必要はない。
  function jarStatus(env) {
    var e = env || {};
    if (e.jar) {
      return { ok: true, canFetch: !!e.canFetchJar, text: 'plantuml.jar: ' + (e.jarPath || '同梱') };
    }
    return {
      ok: false,
      canFetch: !!e.canFetchJar,
      text: 'plantuml.jar がありません。「jar を選ぶ」で場所を指定するか「公式から取得」を押してください',
    };
  }

  // Java の状態を 1 行で言う。無ければ導入先の URL を添える。
  function javaStatus(env) {
    var e = env || {};
    var java = e.java || {};
    if (java.found) {
      return { ok: true, url: '', text: 'Java: ' + (java.version || '検出済み') };
    }
    return {
      ok: false,
      url: e.javaUrl || 'https://adoptium.net/temurin/releases/',
      text: 'Java がありません。ローカル描画には Java 11 以上が要ります',
    };
  }

  // jar が描画に使える状態か。/env の答えが無い間は「まだ分からない」= false。
  function jarReady(env) {
    var e = env === undefined ? _env : env;
    return !!(e && e.jar);
  }

  // BLK-human-20260915-1201: jar を入れる操作は「押した → 数十秒 → 結果」の
  // 3 拍あるのに、画面は押す前と押した後しか持っていなかった。取得中・完了・
  // 失敗を 1 つの純関数にまとめ、失敗のときは理由と「再試行の入口が要る」を
  // 呼び出し側へ渡す (文言と再試行ボタンの出し分けを 2 箇所で書かないため)。
  //   phase: 'fetching' | 'picking' | 'done' | 'canceled' | 'error'
  function engineProgress(phase, res) {
    var r = res || {};
    if (phase === 'fetching') {
      return { phase: 'fetching', text: '公式から取得しています… (数十 MB あります)', bad: false, retry: false, busy: true };
    }
    if (phase === 'picking') {
      return { phase: 'picking', text: '選んでいます…', bad: false, retry: false, busy: true };
    }
    if (phase === 'canceled') {
      return { phase: 'canceled', text: '選ばれませんでした', bad: false, retry: true, busy: false };
    }
    if (phase === 'error') {
      return {
        phase: 'error',
        text: '取得できませんでした: ' + (r.error || '理由が分かりません') + ' — もう一度試すか、jar のパスを直接入れてください',
        bad: true,
        retry: true,
        busy: false,
      };
    }
    return {
      phase: 'done',
      text: '完了しました。plantuml.jar: ' + (r.jarPath || '') + ' — 再起動せずにこのまま描画できます',
      bad: false,
      retry: false,
      busy: false,
    };
  }

  // 1 回の操作で jar が「無い」から「ある」に変わったか。変わったときだけ
  // 図を描き直せばよい (毎回描き直すと設定を開くたびに再描画が走る)。
  function jarTurnedReady(before, after) {
    return !jarReady(before) && jarReady(after);
  }

  // 応答から次の phase を決める。取れなかった理由は post() が error に入れる。
  function phaseOf(res) {
    if (!res) return 'error';
    if (res.canceled) return 'canceled';
    if (res.error) return 'error';
    return 'done';
  }

  // 保存要求の中身。文字列はそのまま、バイナリは base64 で渡す
  // (server 側は base64 があればそちらを優先して書く)。
  function saveBody(fileName, payload) {
    var body = { fileName: String(fileName || '') };
    if (payload && payload.base64 != null) body.base64 = String(payload.base64);
    else body.text = payload && payload.text != null ? String(payload.text) : String(payload == null ? '' : payload);
    return body;
  }

  // ── server とのやりとり ───────────────────────────────────────────────
  function loadEnv() {
    if (!window.fetch) return Promise.resolve(null);
    return window.fetch('/env')
      .then(function(r) { return r.json(); })
      .then(function(j) { _env = j; return j; })
      .catch(function() { return null; });
  }

  function setEnv(env) { _env = env || null; return _env; }
  function getEnv() { return _env; }

  // ネイティブ保存を試す。アプリ版でなければ、または失敗すれば
  // `{ fallback: true }` を返し、呼び出し側は従来のダウンロードに落ちる。
  function nativeSave(fileName, payload) {
    if (!isApp() || !window.fetch) return Promise.resolve({ fallback: true });
    return window.fetch('/native-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saveBody(fileName, payload)),
    }).then(function(r) {
      if (!r.ok) return { fallback: true };
      return r.json();
    }).then(function(j) {
      if (!j || j.fallback) return { fallback: true };
      if (j.canceled) return { canceled: true };
      return { path: j.path };
    }).catch(function() { return { fallback: true }; });
  }

  function post(path, body) {
    if (!window.fetch) return Promise.resolve({ error: 'fetch が使えません' });
    return window.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function(r) {
      return r.json().then(function(j) {
        if (j && j.env) setEnv(j.env);
        return j;
      });
    }).catch(function(e) { return { error: String(e && e.message || e) }; });
  }

  // 起動と同時に 1 回だけ聞く。設定画面を開く前に「保存」を押されても
  // アプリ版だと分かっている必要があるため (Web 版では app:false が入るだけ)。
  if (typeof window !== 'undefined' && window.fetch) {
    try { loadEnv(); } catch (e) { /* server が居なくても画面は開く */ }
  }

  return {
    isApp: isApp,
    jarStatus: jarStatus,
    jarReady: jarReady,
    jarTurnedReady: jarTurnedReady,
    engineProgress: engineProgress,
    phaseOf: phaseOf,
    javaStatus: javaStatus,
    saveBody: saveBody,
    loadEnv: loadEnv,
    setEnv: setEnv,
    getEnv: getEnv,
    nativeSave: nativeSave,
    pickJar: function() { return post('/pick-jar', {}); },
    setJarPath: function(p) { return post('/jar-path', { path: p }); },
    fetchJar: function() { return post('/fetch-jar', {}); },
  };
})();
