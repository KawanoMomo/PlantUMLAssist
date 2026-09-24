'use strict';
window.MA = window.MA || {};

// save-target — 「保存」が何をする操作なのかを 1 箇所で決める。
//
// BLK-primary-20260907-0823: 保存先ディレクトリを設定していても、上部バーの
// 「保存」はブラウザのダウンロードしか起こさず、保存フォルダに .puml が
// 作られなかった。保存先を設定して運用している間は、保存先へ書くのが
// 「保存」であるべきで、フォルダ運用でないときだけダウンロードに落ちる。
// ここは DOM にも fetch にも触らない判定だけを置き、実行は app.js。
window.MA.saveTarget = (function() {

  // cfg: autoSave.getConfig() 相当 ({ backend, fileDir })
  // doc: workspace のアクティブなドキュメント ({ name, dsl })
  //
  // 返り値:
  //   { mode: 'file',     name, dir }  … 保存フォルダへ書く
  //   { mode: 'download',  name }      … 従来どおりブラウザに落とす
  //
  // backend が file でも、フォルダのファイル名にできない名前 (空白や記号入り) の
  // ドキュメントは書けないのでダウンロードに落とす。黙って何も起きない状態を作らない。
  function decide(cfg, doc, fallbackName) {
    var name = (doc && doc.name) || '';
    var backend = cfg && cfg.backend;
    var canName = !!(window.MA.workspace && window.MA.workspace.isValidName)
      && window.MA.workspace.isValidName(name);
    if (backend === 'file' && canName) {
      return { mode: 'file', name: name, dir: (cfg && cfg.fileDir) || './autosave' };
    }
    return { mode: 'download', name: name || fallbackName || 'untitled' };
  }

  // 保存後にステータスバーへ出す 1 行。何が・どこに書かれたかを必ず言う。
  function messageFor(target, ok) {
    if (!target) return '';
    if (target.mode === 'download') return '⬇ ' + target.name + '.puml をダウンロードしました';
    return ok
      ? target.dir + '/' + target.name + '.puml に保存しました'
      : '⚠ ' + target.dir + '/' + target.name + '.puml に保存できませんでした';
  }

  // パスの末尾のフォルダ名。上部バーは狭いので、フルパスではなく
  // 「どの置き場所か」が分かる 1 語だけを出す (全体は title に入れる)。
  function tailOf(dir) {
    var d = String(dir == null ? '' : dir).replace(/[\\/]+$/, '');
    if (!d) return '';
    var parts = d.split(/[\\/]/);
    var last = parts[parts.length - 1] || '';
    return (last === '.' || last === '..') ? d : last;
  }

  // BLK-junior-20260907-2009: 保存先が既に覚えられていても、画面のどこにも
  // 出ていないので「設定済みであること」に気づけず、図種を変えるたびに
  // ⚙設定 → ファイル → パス再入力 → OK を習慣で打ち直していた。
  // 上部バーに常時出す 1 語を返し、「もう設定されている」を見えるようにする。
  //
  // 返り値: { mode, text, title, configured }
  function label(cfg) {
    var backend = cfg && cfg.backend;
    if (backend === 'file') {
      var dir = (cfg && cfg.fileDir) || './autosave';
      var tail = tailOf(dir) || dir;
      return {
        mode: 'file',
        text: '📁 ' + tail,
        title: '保存先は設定済みです: ' + dir + '\n保存は隣の [保存] を押すだけです (このチップを押すと設定を開きます)',
        configured: true,
      };
    }
    return {
      mode: 'download',
      text: '⬇ ダウンロード',
      title: '保存先フォルダは未設定です。保存するとブラウザのダウンロードになります (押すと設定を開きます)',
      configured: false,
    };
  }

  // BLK-junior-20260913-0306: 保存だけが上部バーにボタンを持たず、Ctrl+K で
  // 「ファイルを保存」と打つ経路しか無かった。一覧・覗く・書き出すはボタンを
  // 押せるのに、毎周必ず通る保存だけがコマンド名を思い出す手順になっていた。
  // 保存先の隣に常時出すボタンの文言を決める。押したときに何がどこへ書かれるかを
  // title で言い切る (押してから「どこへ行ったのか」を探さないで済むように)。
  function saveButton(cfg, doc, fallbackName) {
    var t = decide(cfg, doc, fallbackName);
    if (t.mode === 'file') {
      return {
        mode: 'file',
        text: '上書き保存',
        title: t.dir + '/' + t.name + '.puml に上書き保存します (Ctrl+S)',
      };
    }
    return {
      mode: 'download',
      text: '保存',
      title: t.name + '.puml をダウンロードします。保存先フォルダを決めると上書き保存になります (Ctrl+S)',
    };
  }

  // BLK-human-20260923-1600 (design 9a): ファイル名が上部バーとアクティブタブの
  // 2 か所に出ていて、保存先は別のチップに分かれていた。上部バーは
  // 「{フォルダ} / {ファイル名}」のパンくず 1 本にし、フォルダ名を押すと保存先を
  // 変えられるようにする (保存先チップは無くす)。絵文字は使わず文字だけで出す。
  //
  // 返り値: { folder, folderTitle, name, mode, configured }
  function breadcrumb(cfg, doc, fallbackName) {
    var backend = cfg && cfg.backend;
    var name = (doc && doc.name) || fallbackName || '(無題)';
    var file = name + '.puml';
    if (backend === 'file') {
      var dir = (cfg && cfg.fileDir) || './autosave';
      return {
        mode: 'file',
        folder: tailOf(dir) || dir,
        folderTitle: '保存先: ' + dir + ' (押すと保存先を変えられます)',
        name: file,
        configured: true,
      };
    }
    return {
      mode: 'download',
      folder: 'ダウンロード',
      folderTitle: '保存先フォルダは未設定です。保存するとブラウザのダウンロードになります'
        + ' (押すと保存先を決められます)',
      name: file,
      configured: false,
    };
  }

  // design 9a: 保存ボタンは常に同じ見た目ではなく、保存の状態そのものを出す。
  // 未保存のときだけ「● 保存」とキーを添えてアクセント色にし、保存済みのときは
  // 淡色の「保存済み」に落とす (押せることは変えない)。
  //
  // dirty: 前回保存版といまの中身が違うか (呼ぶ側が判定して渡す)
  // 返り値: { text, title, state, dirty }
  function saveState(cfg, doc, dirty, fallbackName) {
    var t = decide(cfg, doc, fallbackName);
    var where = t.mode === 'file'
      ? t.dir + '/' + t.name + '.puml に上書き保存します'
      : t.name + '.puml をダウンロードします';
    if (dirty) {
      return {
        text: '● 保存',
        key: 'Ctrl+S',
        title: '保存していない変更があります。' + where + ' (Ctrl+S)',
        state: 'dirty',
        dirty: true,
      };
    }
    return {
      text: '保存済み',
      key: '',
      title: '前回保存版と同じ中身です。' + where + ' (Ctrl+S)',
      state: 'saved',
      dirty: false,
    };
  }

  return { decide: decide, messageFor: messageFor, tailOf: tailOf, label: label,
    saveButton: saveButton, breadcrumb: breadcrumb, saveState: saveState };
})();
