'use strict';
window.MA = window.MA || {};

// export-target — 書き出す前に「何を対象にしているか」を確定させる。
//
// BLK-primary-20260908-2303-wish: 📦引き継ぎ は開いているタブだけを対象にして
// zip を作る。保存フォルダに 14 枚あってもタブが 2 枚なら 2 枚しか入らず、
// 受け取った新人が zip を開いて初めて欠落に気づく (同じ対象漏れは 📦納品でも
// 起きた: BLK-primary-20260908-1903)。書き出し系のボタンで共通に使える
// 「対象確認」の判定をここに置き、機能ごとの作り込みを増やさない。
//
// ここが答えるのは 3 つ:
//   - 今の対象は何枚で、保存フォルダには何枚あるか (差分)
//   - 「開いているタブだけ」と「保存フォルダ全体」のどちらを的にするか (mode)
//   - 出す前に警告すべきか (warn)
//
// DOM にも fetch にも触らない純関数だけを置き、結線は app.js。
window.MA.exportTarget = (function() {

  var MODE_OPEN = 'open';
  var MODE_FOLDER = 'folder';

  function _role(roles, name) {
    var rmap = roles && typeof roles === 'object' ? roles : {};
    var rec = rmap[name];
    var r = rec && typeof rec === 'object'
      ? String(rec.role == null ? '' : rec.role)
      : String(rec == null ? '' : rec);
    return (r === 'data' || r === 'template') ? r : 'unset';
  }

  // 開いているタブ + 保存フォルダを 1 本の候補一覧にする。
  // 同じ名前ならタブ側 (編集中の内容) を採る。
  function candidates(openDocs, folderDocs, roles, detectType) {
    var det = typeof detectType === 'function' ? detectType : function() { return ''; };
    var out = [];
    var seen = {};
    function push(d, open) {
      if (!d) return;
      var name = String(d.name == null ? '' : d.name);
      if (!name || seen[name]) return;
      seen[name] = true;
      var r = _role(roles, name);
      var dsl = String(d.dsl == null ? '' : d.dsl);
      out.push({
        id: open ? d.id : 'file:' + name,
        name: name,
        dsl: dsl,
        diagramType: d.diagramType || det(dsl) || '',
        open: !!open,
        role: r,
        deliverable: r !== 'template',
      });
    }
    (Array.isArray(openDocs) ? openDocs : []).forEach(function(d) { push(d, true); });
    (Array.isArray(folderDocs) ? folderDocs : []).forEach(function(d) { push(d, false); });
    return out;
  }

  // 既定の的。保存フォルダが読めているならフォルダ全体
  // (「開いているタブだけ」を既定にすると、今回の対象漏れがそのまま既定になる)。
  function defaultMode(opts) {
    var o = opts || {};
    return (o.folderAvailable && (o.folderDocs || []).length > 0) ? MODE_FOLDER : MODE_OPEN;
  }

  // 対象確認の材料一式。
  // 返り値: { mode, folderAvailable, folderDir, loading, all, targets, count,
  //           openCount, folderCount, missing, missingUnopened, template,
  //           line, warn, hint, canBuild }
  function model(opts) {
    var o = opts || {};
    var all = candidates(o.openDocs, o.folderDocs, o.roles, o.detectType);
    var folderAvailable = !!o.folderAvailable;
    var mode = (o.mode === MODE_FOLDER || o.mode === MODE_OPEN)
      ? o.mode : defaultMode({ folderAvailable: folderAvailable, folderDocs: o.folderDocs });
    if (mode === MODE_FOLDER && !folderAvailable) mode = MODE_OPEN;

    // テンプレは渡す相手の成果物ではないので、どちらの的でも外す。
    var pool = all.filter(function(d) { return d.deliverable; });
    var targets = mode === MODE_FOLDER ? pool : pool.filter(function(d) { return d.open; });

    var openCount = pool.filter(function(d) { return d.open; }).length;
    var folderCount = folderAvailable ? pool.length : 0;
    var template = all.length - pool.length;
    var missing = pool.length - targets.length;
    var missingUnopened = pool.filter(function(d) {
      return !d.open && targets.indexOf(d) === -1;
    }).length;

    var line;
    if (folderAvailable) {
      line = '対象 ' + targets.length + ' 枚 / 保存フォルダ ' + folderCount + ' 枚';
    } else {
      line = '対象 ' + targets.length + ' 枚（保存先フォルダが未設定のため、開いているタブが対象のすべてです）';
    }
    if (template > 0) line += '（テンプレ ' + template + ' 枚は対象外）';

    var names = [];
    pool.forEach(function(d) {
      if (targets.indexOf(d) === -1 && names.length < 5) names.push(d.name);
    });
    if (missing > 0) {
      line += ' — ' + missing + ' 枚が対象から外れています'
        + (missingUnopened > 0 ? '（うち ' + missingUnopened + ' 枚はタブを開いていない図）' : '')
        + ': ' + names.join(', ') + (missing > names.length ? ' ほか' : '');
    }

    var hint = missing > 0
      ? '「保存フォルダ全体」に切り替えると ' + pool.length + ' 枚すべてを入れて書き出せます。'
      : '';
    if (missing > 0 && !folderAvailable) hint = '';

    return {
      mode: mode,
      folderAvailable: folderAvailable,
      folderDir: String(o.folderDir == null ? '' : o.folderDir),
      loading: !!o.loading,
      all: all,
      targets: targets,
      count: targets.length,
      openCount: openCount,
      folderCount: folderCount,
      template: template,
      missing: missing,
      missingUnopened: missingUnopened,
      line: line,
      warn: missing > 0,
      hint: hint,
      canBuild: targets.length > 0,
    };
  }

  // 書き出した後にステータスへ出す 1 行。zip を開くまで気づけない欠落を作らない。
  function resultLine(m) {
    if (!m) return '';
    var s = m.count + ' 枚';
    if (m.folderAvailable) s += ' / 保存フォルダ ' + m.folderCount + ' 枚';
    if (m.missing > 0) s += ' ・ ⚠ ' + m.missing + ' 枚は対象外';
    return s;
  }

  return {
    MODE_OPEN: MODE_OPEN, MODE_FOLDER: MODE_FOLDER,
    candidates: candidates, defaultMode: defaultMode,
    model: model, resultLine: resultLine,
  };
})();
