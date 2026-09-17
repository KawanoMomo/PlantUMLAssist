'use strict';
window.MA = window.MA || {};

// update-check — 設定 → 情報 の「更新を確認」(BLK-human-20260917-0900)。
//
// GitHub Releases の latest と今の版を比べ、新しければ版番号・変更点へのリンク・インストーラの URL を返す。
// 自動では落とさない・実行しない。起動時の自動確認は設定で切れ、既定は切 (社内 PC で勝手に通信しない)。
// ここは DOM にも通信にも触らない純関数だけ。通信は server.py の GET /update-check が 1 回だけ行う。
window.MA.updateCheck = (function() {
  var REPO_URL = 'https://github.com/KawanoMomo/PlantUMLAssist';
  var AUTO_KEY = 'pua.update.auto-check';

  // 'v2.10' / '2.10.1' / 'v2.10-3-gabc' → [2, 10] / [2, 10, 1] / [2, 10]。版の形でなければ null。
  function parseVersion(v) {
    var m = /^v?(\d+(?:\.\d+)*)/.exec(String(v == null ? '' : v).trim());
    if (!m) return null;
    return m[1].split('.').map(function(x) { return parseInt(x, 10); });
  }

  // a < b → -1, a == b → 0, a > b → 1。2.10 は 2.9 より新しい (文字列比較しない)。取れなければ null。
  function compareVersions(a, b) {
    var pa = parseVersion(a), pb = parseVersion(b);
    if (!pa || !pb) return null;
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  // server の GET /update-check の応答 {current, release:{tag_name, html_url, assets}, error} を画面用に畳む。
  //   status: 'newer' (新版あり) / 'latest' (最新) / 'error' (確かめられない)
  function evaluate(resp) {
    resp = resp || {};
    var current = (resp.current && resp.current.version) || '';
    var rel = resp.release || null;
    if (resp.error || !rel || !rel.tag_name) {
      return { status: 'error', current: current, message: '更新を確認できませんでした' + (resp.error ? ' (' + resp.error + ')' : '') };
    }
    var latest = String(rel.tag_name);
    var notesUrl = isRepoUrl(rel.html_url) ? rel.html_url : REPO_URL + '/releases/tag/' + encodeURIComponent(latest);
    var installerUrl = '';
    (rel.assets || []).forEach(function(a) {
      if (!installerUrl && a && /setup\.exe$/i.test(a.name || '') && isRepoUrl(a.browser_download_url)) installerUrl = a.browser_download_url;
    });
    if (!installerUrl) installerUrl = notesUrl;
    var cmp = compareVersions(current, latest);
    if (cmp === null) {
      // 手元の版が不明 (開発中など) でも latest は見せる
      return { status: 'newer', current: current, latest: latest, notesUrl: notesUrl, installerUrl: installerUrl,
               message: '最新版は ' + latest + ' です (今の版は不明)' };
    }
    if (cmp < 0) {
      return { status: 'newer', current: current, latest: latest, notesUrl: notesUrl, installerUrl: installerUrl,
               message: '新しい版 ' + latest + ' があります (今は ' + current + ')' };
    }
    return { status: 'latest', current: current, latest: latest, notesUrl: notesUrl, message: '最新版です (' + current + ')' };
  }

  // 開いてよい URL はこのリポジトリの GitHub だけ (応答に何が入っていても他所へ飛ばない)
  function isRepoUrl(u) {
    return typeof u === 'string' && u.indexOf(REPO_URL + '/') === 0;
  }

  // 起動時の自動確認。明示的に '1' のときだけ (既定は切)。
  function autoCheckEnabled(stored) { return stored === '1'; }

  return { parseVersion: parseVersion, compareVersions: compareVersions, evaluate: evaluate,
           isRepoUrl: isRepoUrl, autoCheckEnabled: autoCheckEnabled, REPO_URL: REPO_URL, AUTO_KEY: AUTO_KEY };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MA.updateCheck;
