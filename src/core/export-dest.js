'use strict';
window.MA = window.MA || {};

// export-dest — 保存先から開いた図の書き出し (SVG / PNG / 透過 PNG) の置き場と、書いた結果の言い方
// (TICKET-primary-20261115-2240-wish)。
//
// 保存先から開いた図の Export ▾ はブラウザのダウンロードではなく保存先の中へ書く (server の POST /export-file)。
// 既定の置き場は図と同じフォルダ。保存先の下の別のフォルダ (sub。保存先からの相対) に替えられ、
// 替えた置き場は保存先ごとにブラウザの記憶 (localStorage) に覚える。保存先には設定を置かない。
// DOM も fetch も触らない (置き場の読み書き・URL・画面に出す文の組み立てだけ)。
window.MA.exportDest = (function() {

  var KEY_PREFIX = 'pua.export-sub:';
  // 書き出しの種類 → server の kind と、保存先に書く名前の末尾。通常の PNG と透過 PNG は別の名前。
  var KINDS = {
    'svg': '.svg',
    'png': '.png',
    'png-transparent': '.transparent.png',
  };

  function _s(v) { return String(v == null ? '' : v); }

  // normSub(sub) — 置き場を「a/b」の形に揃える。空は ''(図と同じフォルダ)。
  // 保存先の外へ出る (..)・隠しフォルダ (.始まり)・ファイル名に使えない字は null (使わない)。
  function normSub(sub) {
    var parts = _s(sub).replace(/\\/g, '/').split('/').map(function(p) { return p.trim(); })
      .filter(function(p) { return p !== ''; });
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '.' || p === '..' || p.charAt(0) === '.') return null;
      if (/[<>:"|?*\x00-\x1f]/.test(p) || /[ .]$/.test(p)) return null;
    }
    return parts.join('/');
  }

  function key(dir) { return KEY_PREFIX + _s(dir); }

  // loadSub(storage, dir) — 保存先 dir の置き場。覚えていない・読めないときは ''。
  function loadSub(storage, dir) {
    try {
      var v = storage ? storage.getItem(key(dir)) : null;
      var n = normSub(v);
      return n || '';
    } catch (e) { return ''; }
  }

  // saveSub(storage, dir, sub) — 置き場を覚える。'' は「図と同じフォルダ」に戻す (記憶を消す)。
  // 返り値は覚えた置き場 (使えない置き場は覚えず null)。
  function saveSub(storage, dir, sub) {
    var n = normSub(sub);
    if (n === null) return null;
    try {
      if (!storage) return n;
      if (n === '') storage.removeItem(key(dir));
      else storage.setItem(key(dir), n);
    } catch (e) {}
    return n;
  }

  // kindOf(format, transparent) — 'svg' / 'png' / 'png-transparent'。
  function kindOf(format, transparent) {
    if (format === 'svg') return 'svg';
    return transparent ? 'png-transparent' : 'png';
  }

  // fileName(name, kind) — 保存先に書く名前 (図の名前 + 拡張子)。
  function fileName(name, kind) { return _s(name) + (KINDS[kind] || ''); }

  function url(dir, name, kind, sub) {
    return '/export-file?dir=' + encodeURIComponent(_s(dir)) + '&name=' + encodeURIComponent(_s(name)) +
      '&kind=' + encodeURIComponent(_s(kind)) + '&sub=' + encodeURIComponent(normSub(sub) || '');
  }

  // placeLabel(sub) — 置き場の言い方。
  function placeLabel(sub) {
    var n = normSub(sub);
    return n ? '保存先の「' + n + '」フォルダ' : '図と同じフォルダ';
  }

  // message(res, sub) — 書いた直後に出す 1 行。名前・置き場・バイト数・新規 / 上書き。
  // 全文の末尾の（）にディスク上のパスを付ける (下端の短い形では落ち、title と読み上げに残る)。
  function message(res, sub) {
    var r = res || {};
    var rel = _s(r.rel);
    var name = rel.split('/').pop();
    return '書き出しました: ' + name + ' → ' + placeLabel(sub) + ' · ' + Number(r.bytes || 0) + ' バイト · ' +
      (r.existed ? '上書き' : '新規') + (r.path ? '（' + r.path + '）' : '');
  }

  // ── 保存先の一覧で印を付けた図をまとめて書き出す (TICKET-roadmap-20261122-0855-5) ──
  // 1 枚ずつの書き出しと同じ置き場・同じ名前の決まりで、印を付けた図を 1 回で書く。
  // 描けない図は書かずに名前を言う (空の画像・直前の図を書かない)。zip・控えは作らない。
  var KIND_LABELS = { 'svg': 'SVG', 'png': 'PNG', 'png-transparent': 'PNG（透過背景）' };
  var BATCH_KINDS = ['svg', 'png', 'png-transparent'];

  function kindLabel(kind) { return KIND_LABELS[kind] || ''; }

  // batchLabel(n) — 一覧の「選んだ図を書き出す」ボタンの文言。押す前に枚数が読める。
  function batchLabel(n) {
    var k = Number(n) || 0;
    return k > 0 ? '選んだ ' + k + ' 枚を書き出す' : '選んだ図を書き出す';
  }

  // batchMessage(results, kind, sub) — まとめて書いた後の 1 行。
  // results: [{ name, ok, error? }]。書いた枚数・形式・置き場と、書けなかった図の名前。
  function batchMessage(results, kind, sub) {
    var list = results || [];
    var done = list.filter(function(r) { return r && r.ok; });
    var fail = list.filter(function(r) { return r && !r.ok; });
    var head = done.length
      ? '書き出しました: ' + done.length + ' 枚 (' + kindLabel(kind) + ') → ' + placeLabel(sub)
      : '書き出せませんでした: 0 枚 (' + kindLabel(kind) + ')';
    if (!fail.length) return head;
    return head + ' ／ 書かなかった図: ' + fail.map(function(r) {
      return _s(r.name) + '（' + (_s(r.error) || '描けません') + '）';
    }).join('、');
  }

  return {
    KINDS: KINDS, normSub: normSub, key: key, loadSub: loadSub, saveSub: saveSub,
    kindOf: kindOf, fileName: fileName, url: url, placeLabel: placeLabel, message: message,
    BATCH_KINDS: BATCH_KINDS, kindLabel: kindLabel, batchLabel: batchLabel, batchMessage: batchMessage,
  };
})();
