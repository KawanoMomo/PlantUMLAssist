'use strict';
window.MA = window.MA || {};

// autosave-options — 設定「自動保存 / Autosave」タブの中身 (design 1a)。
//
// 1a は自動保存タブを、レンダリングタブと同じ語彙で組み立てる:
//   - 保存間隔は 4 つのチップのセグメント (500ms / 1s / 2s / 5s)
//   - 起動時の復元と保存先は、選択肢ごとに一行の説明が付くカード
// 従来の <select> + <fieldset> では「確認してから復元」がなぜ推奨なのか、
// ファイル保存が何をもたらすのかが設定画面の中では読めなかった。
//
// ここは DOM に触らない純関数だけを置き、結線は app.js。
window.MA.autosaveOptions = (function() {
  // 保存間隔。auto-save.js の既定 (1000ms) をこの並びの中に持つ。
  var DEBOUNCE_CHOICES = [
    { value: 500,  label: '500ms' },
    { value: 1000, label: '1s' },
    { value: 2000, label: '2s' },
    { value: 5000, label: '5s' },
  ];
  var DEBOUNCE_DEFAULT = 1000;

  var RESTORE_MODES = [
    {
      id: 'confirm',
      title: '確認してから復元',
      desc: '前回の DSL があればダイアログで尋ねます。',
      recommended: true,
    },
    {
      id: 'auto',
      title: '確認なしで自動復元',
      desc: '開いた時点で前回の DSL に戻します。テンプレートから始めたいときは手で消すことになります。',
      recommended: false,
    },
    {
      id: 'none',
      title: '復元しない（常にテンプレート）',
      desc: '保存はしますが、起動時には読み込みません。',
      recommended: false,
    },
  ];
  var RESTORE_DEFAULT = 'confirm';

  var BACKENDS = [
    {
      id: 'localStorage',
      title: 'localStorage',
      desc: 'ブラウザ内・高速。ブラウザを変えると引き継げません。',
    },
    {
      id: 'file',
      title: 'ファイル / File',
      desc: 'ディスク永続・git 管理可。server.py が動いている必要があります。',
    },
  ];
  var BACKEND_DEFAULT = 'localStorage';

  // 保存済みの値が選択肢から外れていても画面が空にならないよう、一番近い値に寄せる。
  function normalizeDebounce(v) {
    if (v === null || v === undefined || v === '') return DEBOUNCE_DEFAULT;
    var n = Number(v);
    if (!isFinite(n)) return DEBOUNCE_DEFAULT;
    var best = DEBOUNCE_CHOICES[0];
    for (var i = 1; i < DEBOUNCE_CHOICES.length; i++) {
      if (Math.abs(DEBOUNCE_CHOICES[i].value - n) < Math.abs(best.value - n)) best = DEBOUNCE_CHOICES[i];
    }
    return best.value;
  }

  function _normalizeIn(list, v, fallback) {
    var s = String(v);
    for (var i = 0; i < list.length; i++) if (list[i].id === s) return s;
    return fallback;
  }

  function normalizeRestoreMode(v) { return _normalizeIn(RESTORE_MODES, v, RESTORE_DEFAULT); }
  function normalizeBackend(v) { return _normalizeIn(BACKENDS, v, BACKEND_DEFAULT); }

  // 画面に出すカードのモデル。app.js はこれを DOM にするだけにする。
  function _cards(list, selected, normalize) {
    var sel = normalize(selected);
    return list.map(function(m) {
      return {
        id: m.id,
        title: m.title,
        desc: m.desc,
        badge: m.recommended ? { text: '推奨', tone: 'ok' } : null,
        checked: m.id === sel,
      };
    });
  }

  function restoreCards(selected) { return _cards(RESTORE_MODES, selected, normalizeRestoreMode); }
  function backendCards(selected) { return _cards(BACKENDS, selected, normalizeBackend); }

  // 保存先ディレクトリ欄を出すのは file のときだけ。
  function needsFileDir(backend) { return normalizeBackend(backend) === 'file'; }

  return {
    DEBOUNCE_CHOICES: DEBOUNCE_CHOICES,
    DEBOUNCE_DEFAULT: DEBOUNCE_DEFAULT,
    RESTORE_MODES: RESTORE_MODES,
    RESTORE_DEFAULT: RESTORE_DEFAULT,
    BACKENDS: BACKENDS,
    BACKEND_DEFAULT: BACKEND_DEFAULT,
    normalizeDebounce: normalizeDebounce,
    normalizeRestoreMode: normalizeRestoreMode,
    normalizeBackend: normalizeBackend,
    restoreCards: restoreCards,
    backendCards: backendCards,
    needsFileDir: needsFileDir,
  };
})();
