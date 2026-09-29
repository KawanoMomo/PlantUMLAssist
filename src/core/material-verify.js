'use strict';
window.MA = window.MA || {};

// material-verify — 資料化した 1 枚が「保存先に本当に置けたか」を、資料化した
// その場で言う。
//
// BLK-junior-20260915-0007: 「1 枚を資料化…」は実行するとモーダルが自動で閉じ、
// 根拠は一瞬出るトーストだけだった。見落とせば、保存先に置けたかを確かめる手段は
// モーダル内に何も残らず、📂一覧を開き直して名前で探すまで確信が持てない
// (フォルダタブ → フィルタ入力 → クリック、が資料化 1 枚ごとに付く)。
//
// ここは「保存フォルダの一覧」と「置いたはずの名前」を突き合わせて言葉にする
// 純関数だけ。fetch も DOM も触らない (一覧を取るのは app.js)。
window.MA.materialVerify = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 一覧から 1 図を引く。一覧の name は拡張子の無い図名 (server の p.stem)。
  function find(entries, docName) {
    var want = _s(docName);
    if (!want) return null;
    var list = entries || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      var n = (typeof e === 'object') ? _s(e.name) : _s(e);
      if (n === want) return (typeof e === 'object') ? e : { name: n };
    }
    return null;
  }

  // ISO の時刻を hh:mm:ss にする。日付は資料化の直後にしか出さないので落とす
  // (「今しがた書けた」ことが読めればよく、日付は一覧側が持っている)。
  function clockText(iso) {
    var m = /T(\d{2}):(\d{2}):(\d{2})/.exec(_s(iso));
    return m ? (m[1] + ':' + m[2] + ':' + m[3]) : '';
  }

  // 「いつ書けたか」は時刻そのものより新しさで読む。server が返す mtime は UTC
  // なので、画面にそのまま出すと手元の時計と 9 時間ずれて「古いファイル」に見える。
  // 同じ一覧が返す server の「今」と引き算して、ずれない言葉にする。
  function freshText(mtime, now) {
    var a = Date.parse(_s(mtime));
    var b = Date.parse(_s(now));
    if (!isFinite(a) || !isFinite(b)) return '';
    var sec = Math.round((b - a) / 1000);
    if (sec < 0) sec = 0;
    if (sec < 90) return 'たった今';
    if (sec < 3600) return Math.round(sec / 60) + ' 分前';
    if (sec < 86400) return Math.round(sec / 3600) + ' 時間前';
    return Math.round(sec / 86400) + ' 日前';
  }

  function sizeText(size) {
    var n = Number(size);
    if (!isFinite(n) || n <= 0) return '';
    if (n < 1024) return n + ' バイト';
    return (Math.round(n / 102.4) / 10) + ' KB';
  }

  // 資料化した直後の突き合わせ。
  //   plan:  { docName, filename, formatLabel, source }
  //   info:  workspace.listFolder() の返り値 ({ entries, dir, exists })
  // status は 'ok' (置けた) / 'missing' (一覧に無い) / 'unknown' (一覧を読めなかった)。
  // done (任意): runMaterialPlan の結果 { imageSize }。画像の実体を保存先に書けた大きさ (BLK-junior-20260928-2255)。
  function verdict(info, plan, done) {
    var p = plan || {};
    var docName = _s(p.docName);
    var dir = _s(info && info.dir);
    if (!info || !info.entries) {
      return {
        status: 'unknown', found: false, docName: docName, dir: dir,
        text: '保存先の一覧を読めませんでした。保存先の一覧で ' + docName + ' を確かめてください',
      };
    }
    var hit = find(info.entries, docName);
    if (!hit) {
      return {
        status: 'missing', found: false, docName: docName, dir: dir,
        text: docName + '.puml が保存先' + (dir ? ' ' + dir : '') + ' にありません。'
          + '保存先の設定 (⚙設定 → 自動保存) を確かめてください',
      };
    }
    var when = freshText(hit.mtime, info.now) || clockText(hit.mtime);
    var size = sizeText(hit.size);
    var detail = [];
    if (when) detail.push(when);
    if (size) detail.push(size);
    var text = '保存先' + (dir ? ' ' + dir : '') + ' に ' + docName + '.puml を置けました'
      + (detail.length ? '（' + detail.join(' · ') + '）' : '');
    var imgSize = done ? sizeText(done.imageSize) : '';
    if (_s(p.filename) && imgSize) text += '。画像 ' + _s(p.filename) + ' も置けました（' + imgSize + '）';
    else if (_s(p.filename)) text += '。画像は ' + _s(p.filename) + ' で書き出しました';
    return {
      status: 'ok', found: true, docName: docName, dir: dir,
      mtime: _s(hit.mtime), size: hit.size, when: when, text: text,
    };
  }

  return {
    find: find,
    clockText: clockText,
    freshText: freshText,
    sizeText: sizeText,
    verdict: verdict,
  };
})();
