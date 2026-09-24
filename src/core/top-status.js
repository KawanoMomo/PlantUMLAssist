'use strict';
// top-status — 上部バーに残す 2 つの表示を文字列に落とす (design 1a)
//
// 1a の上部バーは「状態表示と Export だけ」で、状態表示は編集中のファイル名と
// `online · 24ms` の 2 つである。どちらも「今どうなっているか」を一目で言う短い文で、
// 組み立ての規則だけをここに置いて DOM から切り離す。
window.MA = window.MA || {};
window.MA.topStatus = (function() {

  // fileName: タブ名から上部バーに出すファイル名を作る。
  // 保存先は {name}.puml なので、画面にもその名前をそのまま出す。
  function fileName(name) {
    var n = (typeof name === 'string' ? name : '').trim();
    if (!n) return '(無題).puml';
    return /\.puml$/i.test(n) ? n : n + '.puml';
  }

  // formatDuration: レンダリング所要時間。1 秒を超えたら ms を並べても読めないので秒にする。
  function formatDuration(ms) {
    var v = Number(ms);
    if (!isFinite(v) || v < 0) return '';
    if (v < 1000) return Math.round(v) + 'ms';
    return (Math.round(v / 100) / 10) + 's';
  }

  // render: `{mode} · {所要}` の状態表示。
  // phase: 'idle' 未実行 / 'rendering' 実行中 / 'ok' 成功 / 'error' 失敗
  // 所要時間は 'ok' のときだけ数字になる。それ以外は数字を出さず、記号で今の相を言う。
  function render(state) {
    var s = state || {};
    var mode = (typeof s.mode === 'string' && s.mode) ? s.mode : 'local';
    var phase = s.phase || 'idle';
    var tail;
    if (phase === 'rendering') tail = '…';
    else if (phase === 'error') tail = 'error';
    else if (phase === 'ok') tail = formatDuration(s.ms) || '—';
    else tail = '—';
    return mode + ' · ' + tail;
  }

  // previewHead: プレビュー見出しの成功表示 (design 7a / 10a「Rendered · 32ms」)。
  // 描画方法 (local / online) は上部バーにだけ出すので、ここには書かない。
  function previewHead(ms) {
    var t = formatDuration(ms);
    return 'Rendered · ' + (t || '—');
  }

  // isError: 状態表示を赤くするかどうか。
  function isError(phase) {
    return phase === 'error';
  }

  return {
    fileName: fileName,
    formatDuration: formatDuration,
    render: render,
    previewHead: previewHead,
    isError: isError,
  };
})();
