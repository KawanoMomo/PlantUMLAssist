'use strict';
window.MA = window.MA || {};

// app-version — 設定 → 情報 に出す版の 1 行 (BLK-human-20260916-0902)。
//
// 不具合を報告するとき「どの版で起きたか」を貼れるようにする。版の正本は git tag で、
// server.py の GET /version がブラウザ起動では git から、exe ではビルド時に焼いた
// src/version.json から {version, commit, date} を返す。ここは DOM に触らない純関数だけ。
window.MA.appVersion = (function() {
  var PRODUCT = 'PlantUMLAssist';

  function clean(s) { return String(s == null ? '' : s).trim(); }

  // 'v2.8' / '2.8' / 'v2.8-3-gabc' → 'v2.8…'。タグの形でないもの (空・ハッシュだけ) は ''。
  function normalizeVersion(v) {
    var s = clean(v);
    if (!/^v?\d+(\.\d+)*/.test(s)) return '';
    return s.charAt(0) === 'v' ? s : 'v' + s;
  }

  // 「PlantUMLAssist v2.8 (efe1cbf, 2026-09-16)」。欠けた項目は括弧から落とす。
  function formatLine(info) {
    info = info || {};
    var ver = normalizeVersion(info.version) || '(版不明)';
    var extra = [clean(info.commit), clean(info.date)].filter(function(x) { return x; });
    return PRODUCT + ' ' + ver + (extra.length ? ' (' + extra.join(', ') + ')' : '');
  }

  return { formatLine: formatLine, normalizeVersion: normalizeVersion, PRODUCT: PRODUCT };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MA.appVersion;
