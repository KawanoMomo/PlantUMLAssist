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
      ? '💾 ' + target.dir + '/' + target.name + '.puml に保存しました'
      : '⚠ ' + target.dir + '/' + target.name + '.puml に保存できませんでした';
  }

  return { decide: decide, messageFor: messageFor };
})();
