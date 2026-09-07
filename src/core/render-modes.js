'use strict';
window.MA = window.MA || {};

// render-modes — 設定「レンダリング / Render」の中身 (design「1a 設定と網羅」5a)。
//
// 5a は local と online を「速度」と「外部送信」の 2 点だけで比べられる形にし、
// Java の検出結果をその場に出すことを求める。従来のラジオ 2 択 + 注記 1 行では、
//   - どちらが速いかが設定画面の中では分からない
//   - local を選んでも Java が無い環境では描画が落ちるまで気づけない
// の 2 つが残っていた。ここは DOM に触らない純関数だけを置き、結線は app.js。
//
// 「同梱エンジン」は 5a が枠だけ先に確保するとしている 3 つ目の選択肢。
// 選べない状態で出しておけば、用意できた時点で設定画面を作り直さずに済む。
window.MA.renderModes = (function() {
  var MODES = [
    {
      id: 'local',
      title: 'local（Java）',
      speed: '常駐 JVM で 10〜30ms',
      privacy: 'DSL は外部に出ません。',
      selectable: true,
    },
    {
      id: 'online',
      title: 'online（plantuml.com）',
      speed: '往復するので 200ms〜',
      privacy: 'DSL が外部サーバに送信されます。業務データでは避けてください。',
      selectable: true,
    },
    {
      id: 'bundled',
      title: '同梱エンジン（配布パッケージ）',
      speed: 'Java も外部通信も不要',
      privacy: 'PlantUML 記法に完全互換のまま、実行ファイル一式として配布できる形を想定。',
      selectable: false,
      note: 'この 3 択の枠だけ先に確保しておけば、同梱エンジンが用意できた時点で設定画面を作り直さずに差し込めます。',
    },
  ];

  // 入力を止めてから描画するまで。5a の 3 択。
  var DEBOUNCE_CHOICES = [
    { value: 0,    label: '即時' },
    { value: 300,  label: '300ms' },
    { value: 1000, label: '1s' },
  ];
  var DEBOUNCE_DEFAULT = 300;

  function normalizeMode(m) {
    var s = String(m);
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i].id === s && MODES[i].selectable) return s;
    }
    return 'local';
  }

  function normalizeDebounce(v) {
    // Number(null) / Number('') は 0 になる。「未指定」を「即時」と読み違えない。
    if (v === null || v === undefined || v === '') return DEBOUNCE_DEFAULT;
    var n = Number(v);
    if (!isFinite(n)) return DEBOUNCE_DEFAULT;
    // 一番近い選択肢に寄せる。保存済みの値が選択肢から外れても画面が空にならない。
    var best = DEBOUNCE_CHOICES[0];
    for (var i = 1; i < DEBOUNCE_CHOICES.length; i++) {
      if (Math.abs(DEBOUNCE_CHOICES[i].value - n) < Math.abs(best.value - n)) best = DEBOUNCE_CHOICES[i];
    }
    return best.value;
  }

  // `GET /env` の答え → local カードに出すバッジ。
  // env がまだ来ていない (null) 状態と「調べたが無かった」を区別する。
  function javaBadge(env) {
    if (!env || !env.java) return { text: 'Java 判定中…', tone: 'muted' };
    var j = env.java;
    if (!j.found) return { text: 'Java 未検出', tone: 'warn' };
    if (j.major) return { text: 'Java ' + j.major + ' 検出', tone: 'ok' };
    return { text: 'Java 検出', tone: 'ok' };
  }

  // 実測を持っていればそれも並べる。固定の目安だけだと、この環境で実際に
  // どちらが速いのかは分からないままになる。
  function speedText(modeId, timings) {
    var base = null;
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === modeId) base = MODES[i].speed;
    if (!base) return '';
    var t = timings && timings[modeId];
    var n = Number(t);
    if (isFinite(n) && n > 0) return base + '（この環境の前回: ' + Math.round(n) + 'ms）';
    return base;
  }

  // local を選んでいるのに Java が無い / jar が無いときだけ出す一文。
  function warningFor(modeId, env) {
    if (normalizeMode(modeId) !== 'local' || !env) return '';
    if (env.java && env.java.found === false) {
      return '⚠ この環境では Java が見つかりません。local を選ぶと描画に失敗します。Java 11+ を入れるか online にしてください。';
    }
    if (env.jar === false) {
      return '⚠ lib/plantuml.jar がありません。lib/fetch-plantuml.ps1 で取得してください。';
    }
    return '';
  }

  // 描画エラーの出し方 (design 5a「描画エラーを図の上に重ねて表示」)。
  // 既定は重ね表示。図を消してエラー 1 行に差し替えると、打ち間違えた瞬間に
  // 直前まで出ていた図が消えてしまい、どこを直せばよいか見比べられない。
  var ERROR_OVERLAY_DEFAULT = true;

  function normalizeErrorOverlay(v) {
    if (v === undefined || v === null || v === '') return ERROR_OVERLAY_DEFAULT;
    if (v === 'false' || v === '0') return false;
    if (v === 'true' || v === '1') return true;
    return !!v;
  }

  // 画面に出す 3 枚ぶんのモデル。app.js はこれを HTML にするだけにする。
  function cards(env, timings, selected) {
    var sel = normalizeMode(selected);
    return MODES.map(function(m) {
      return {
        id: m.id,
        title: m.title,
        speed: speedText(m.id, timings),
        privacy: m.privacy,
        note: m.note || '',
        selectable: m.selectable,
        checked: m.selectable && m.id === sel,
        badge: m.id === 'local' ? javaBadge(env)
             : m.selectable ? null
             : { text: '将来対応', tone: 'muted' },
      };
    });
  }

  return {
    MODES: MODES,
    DEBOUNCE_CHOICES: DEBOUNCE_CHOICES,
    DEBOUNCE_DEFAULT: DEBOUNCE_DEFAULT,
    ERROR_OVERLAY_DEFAULT: ERROR_OVERLAY_DEFAULT,
    normalizeErrorOverlay: normalizeErrorOverlay,
    normalizeMode: normalizeMode,
    normalizeDebounce: normalizeDebounce,
    javaBadge: javaBadge,
    speedText: speedText,
    warningFor: warningFor,
    cards: cards,
  };
})();
