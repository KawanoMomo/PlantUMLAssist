'use strict';
window.MA = window.MA || {};

// save-dir-handoff — 保存先ディレクトリの値を「渡せる 1 行」にして、
// 受け取った側が打ち直さずに反映できるようにする。
//
// BLK-primary-20260908-0103-wish: 14 枚を 1 プロジェクトとして渡せるように
// なった (xrefGraph) 後も、「どのディレクトリを見ればその 14 枚が揃うか」は
// 各自のブラウザ/サーバー個別の ⚙設定に閉じており、引き継ぎ資料に入らない。
// 受け取った側は自分の環境で保存先を一から入力し直すことになり、書式を 1 文字
// 誤ると (BLK-primary-20260908-0103 のバックスラッシュ破損) 一覧が無言で空になる。
//
// ここが引き受けるのは 3 つ:
//   - 渡す側: 保存先を xref.md に載せる形にする (toBlock)
//   - 受ける側: 貼られた xref.md 全文からでも値だけ拾う (fromText)
//   - 受ける側: 反映する前に検証し、直せる崩れは直し、直せない崩れは
//     「無言で空になる」前に断る (check)
//
// DOM にも fetch にも触らない純関数だけを置き、結線は app.js。
window.MA.saveDirHandoff = (function() {
  var LABEL = '保存先ディレクトリ';
  // xref.md 側の見出し。fromText はこの見出しに頼らず値の形でも拾えるが、
  // 見出しがあるときはそこを最優先で見る。
  var HEAD = '## ' + LABEL;

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

  // 制御文字は「バックスラッシュのエスケープが 1 度潰れた」痕跡。
  // `E:\01_Loop` が JSON/JS の文字列として二重に解かれると `\0` が %01 相当の
  // 制御文字になり、以降のバックスラッシュは消える。元のパスは復元できない
  // ので、直すのではなく断る対象にする。
  function _hasControlChar(s) {
    for (var i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) < 0x20 || s.charCodeAt(i) === 0x7f) return true;
    }
    return false;
  }

  // ドライブレターの直後に区切りが無い (`E:01_Looppersona-dataprimary`) のは、
  // バックスラッシュが軒並み落ちた値。これも復元できない。
  function _driveLostSeparators(s) {
    if (!DRIVE.test(s)) return false;
    return !/^[A-Za-z]:[/\\]/.test(s);
  }

  // 反映する値の正準形。バックスラッシュはスラッシュに寄せる
  // (保存・復元・URL の往復でバックスラッシュだけが壊れるため、
  //  渡す時点でスラッシュにしておけば受け取った側で壊れない)。
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

  // 貼られた値を反映してよいか。
  // 返り値: { ok, value, changed, reason, notes: [] }
  //   ok=false のときは反映しない。reason は画面にそのまま出す 1 行。
  function check(raw) {
    var src = String(raw == null ? '' : raw).trim();
    if (!src) {
      return { ok: false, value: '', changed: false, notes: [],
        reason: LABEL + 'が空です。渡された xref.md ごと貼っても構いません。' };
    }
    var body = _stripQuotes(src).trim();
    if (_hasControlChar(body)) {
      return { ok: false, value: '', changed: false, notes: [],
        reason: 'バックスラッシュが壊れた値です (制御文字が混じっています)。'
          + '渡す側でスラッシュ区切りに直してもらってください。' };
    }
    if (_driveLostSeparators(body)) {
      return { ok: false, value: '', changed: false, notes: [],
        reason: 'ドライブ名の後に区切りがありません (' + body + ')。'
          + 'バックスラッシュが落ちた値なので、元のパスを貼り直してください。' };
    }
    var value = normalize(body);
    if (!value) {
      return { ok: false, value: '', changed: false, notes: [],
        reason: LABEL + 'が空です。' };
    }
    var notes = [];
    if (/\\/.test(body)) notes.push('バックスラッシュをスラッシュに直しました。');
    if (body !== src) notes.push('引用符を外しました。');
    return { ok: true, value: value, changed: value !== src, reason: '', notes: notes };
  }

  // 渡す側。xref.md に足す行。保存先が未設定 (localStorage 運用) なら
  // 「渡せる保存先が無い」ことをそのまま書く。黙って落とさない。
  function toBlock(cfg) {
    var out = [HEAD, ''];
    var backend = cfg && cfg.backend;
    if (backend !== 'file') {
      out.push('- 保存先フォルダは未設定です (localStorage 運用)。'
        + 'この図は渡す側のブラウザの中にしかありません。');
      out.push('');
      return out;
    }
    var dir = normalize((cfg && cfg.fileDir) || '');
    if (!dir) {
      out.push('- 保存先フォルダが空です。');
      out.push('');
      return out;
    }
    out.push('- ' + LABEL + ': `' + dir + '`');
    out.push('- 受け取った側は、上部のパンくずのフォルダ名 (FILES の「保存先」の一番上でも同じ) を押して'
      + ' ⚙設定の「保存先ディレクトリ」にこの値 (この xref.md ごとでも可) を貼り、「設定を保存」を押してください。');
    out.push('');
    return out;
  }

  // 受ける側。xref.md 全文を貼られても、パス 1 行だけを貼られても拾う。
  function fromText(text) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) return '';
    var lines = s.split(/\r?\n/);
    // 1) `- 保存先ディレクトリ: \`...\`` の行
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/保存先ディレクトリ\s*[:：]\s*(.+)$/);
      if (m) {
        // 1 行の入力欄に xref.md を貼ると改行が落ちて後ろの節まで同じ行に続く。
        // 値がバッククォートで括られていれば、その中だけを取る。
        var bq = m[1].trim().match(/^`([^`]+)`/);
        if (bq && bq[1].trim()) return bq[1].trim();
        var v = m[1].trim().replace(/^`+/, '').replace(/`+$/, '').trim();
        if (v) return v;
      }
    }
    // 2) 見出しの直後にある最初のバッククォート付きの値
    var head = -1;
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].trim() === HEAD) { head = j; break; }
    }
    if (head >= 0) {
      for (var k = head + 1; k < lines.length; k++) {
        if (/^##\s/.test(lines[k].trim())) break;
        var q = lines[k].match(/`([^`]+)`/);
        if (q && q[1].trim()) return q[1].trim();
      }
    }
    // 3) パス 1 行だけを貼られた場合
    var only = lines.filter(function(l) { return l.trim() !== ''; });
    if (only.length === 1) return only[0].trim();
    return '';
  }

  // 反映後にステータスバーへ出す 1 行。何が設定されたかを必ず言う。
  function messageFor(res) {
    if (!res) return '';
    if (!res.ok) return '⚠ ' + res.reason;
    return '📁 保存先を ' + res.value + ' にしました'
      + (res.notes.length ? ' (' + res.notes.join(' ') + ')' : '');
  }

  return {
    LABEL: LABEL, HEAD: HEAD,
    normalize: normalize, check: check,
    toBlock: toBlock, fromText: fromText, messageFor: messageFor,
  };
})();
