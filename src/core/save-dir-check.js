'use strict';
window.MA = window.MA || {};

// save-dir-check — 保存先ディレクトリの欄に打った (貼った) パスを、反映する前に確かめる。
//
// バックスラッシュ区切りの絶対パスは保存・復元・URL の往復で壊れることがあり、
// 壊れた値のまま反映すると 📂 一覧が無言で空になる。直せる崩れ (\ 区切り・引用符・末尾の /) は直し、
// 直せない崩れ (制御文字が混じった・ドライブ名の後の区切りが落ちた) は反映する前に断る。
//
// DOM にも fetch にも触らない純関数だけを置き、結線は app.js (⚙ 設定の「設定を保存」と保存先を変える窓)。
window.MA.saveDirCheck = (function() {
  var LABEL = '保存先ディレクトリ';

  // Windows の絶対パス。`E:\01_Loop\...` の形。
  var DRIVE = /^[A-Za-z]:/;

  function _stripQuotes(s) {
    var t = s;
    if (t.length >= 2) {
      var a = t.charAt(0), b = t.charAt(t.length - 1);
      if ((a === '"' && b === '"') || (a === "'" && b === "'") ||
          (a === '`' && b === '`')) t = t.slice(1, -1);
    }
    return t;
  }

  // 制御文字は「バックスラッシュのエスケープが 1 度潰れた」しるし。
  // `E:\01_Loop` が JSON/JS の文字列として二重に解かれると `\0` が %01 相当の
  // 制御文字になり、以降のバックスラッシュは消える。元のパスは復元できない
  // ので、直すのではなく断る対象にする。
  function _hasControlChar(s) {
    for (var i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) < 0x20 || s.charCodeAt(i) === 0x7f) return true;
    }
    return false;
  }

  // ドライブレターの直後に区切りが無い (`E:00_workdiagramsprimary`) のは、
  // バックスラッシュが軒並み落ちた値。これも復元できない。
  function _driveLostSeparators(s) {
    if (!DRIVE.test(s)) return false;
    return !/^[A-Za-z]:[/\\]/.test(s);
  }

  // 反映する値の正準形。バックスラッシュはスラッシュに寄せる
  // (保存・復元・URL の往復でバックスラッシュだけが壊れるため)。
  function normalize(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = _stripQuotes(s).trim();
    s = s.replace(/\\/g, '/');
    s = s.replace(/\/{2,}/g, '/');
    // 末尾の区切りは落とす。ただし `/` や `E:/` だけになるなら残す。
    if (s.length > 1 && s.charAt(s.length - 1) === '/' && !/^[A-Za-z]:\/$/.test(s)) {
      s = s.replace(/\/+$/, '');
    }
    return s;
  }

  // 打った値を反映してよいか。
  // 返り値: { ok, value, changed, reason, notes: [] }
  //   ok=false のときは反映しない。reason は画面にそのまま出す 1 行。
  function check(raw) {
    var src = String(raw == null ? '' : raw).trim();
    if (!src) {
      return { ok: false, value: '', changed: false, notes: [], reason: LABEL + 'が空です。' };
    }
    var body = _stripQuotes(src).trim();
    if (_hasControlChar(body)) {
      return { ok: false, value: '', changed: false, notes: [],
        reason: 'バックスラッシュが壊れた値です (制御文字が混じっています)。'
          + 'スラッシュ区切りのパスを打ち直してください。' };
    }
    if (_driveLostSeparators(body)) {
      return { ok: false, value: '', changed: false, notes: [],
        reason: 'ドライブ名の後に区切りがありません (' + body + ')。'
          + 'バックスラッシュが落ちた値なので、元のパスを貼り直してください。' };
    }
    var value = normalize(body);
    if (!value) {
      return { ok: false, value: '', changed: false, notes: [], reason: LABEL + 'が空です。' };
    }
    var notes = [];
    if (/\\/.test(body)) notes.push('バックスラッシュをスラッシュに直しました。');
    if (body !== src) notes.push('引用符を外しました。');
    return { ok: true, value: value, changed: value !== src, reason: '', notes: notes };
  }

  return { LABEL: LABEL, normalize: normalize, check: check };
})();
