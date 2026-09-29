'use strict';
window.MA = window.MA || {};

// text-sync — 本文を書き換えた後始末を 1 本にするための判定 (BLK-owner-20260925-0312-1)。
//
// 本文欄で打ったときだけタブの本文 (workspace) と自動保存が追い、フォーム・選択パネル・窓・
// 一括操作・元に戻すで書き換えた本文は、タブを替えるまでどこにも書かれていなかった。
// そのままリロードや終了をすると、フォームだけで起こした図が消えた。
//
// app.js は本文を書き換えたら必ず scheduleRefresh() を呼ぶ (ctx.onUpdate もそれ)。
// そこでこの判定を 1 回通し、書き換えの出どころを問わず同じ後始末をする。
//
//   decide(last, doc, text)
//     last: 前回この判定を通したときの { id, text } (初回は null)
//     doc : 今のタブ { id, dsl } (無ければ null)
//     text: エディタに今入っている本文
//   返り値 { writeDoc, save, next }
//     writeDoc: タブの本文 (workspace) を text で書き戻すか
//     save    : 自動保存に載せるか (タブの印・保存状態もこの時に引き直す)
//     next    : 次の判定に渡す last
//
// 本文が変わったと見るのは、(1) タブの本文と違う、または (2) 同じタブのまま前回の判定から
// 本文が動いた (一括操作のように workspace を先に書き換えた経路) のどちらか。
// タブを替えた・開いただけ (前回と別のタブ) は、中身がタブの本文と同じなら書かない
// (開いただけの図をディスクへ書き直さない)。
//
// DOM も fetch も触らない。
window.MA.textSync = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function decide(last, doc, text) {
    var t = _s(text);
    if (!doc || doc.id == null) {
      return { writeDoc: false, save: false, next: last || null };
    }
    var writeDoc = _s(doc.dsl) !== t;
    var moved = !!(last && last.id === doc.id && _s(last.text) !== t);
    return {
      writeDoc: writeDoc,
      save: writeDoc || moved,
      next: { id: doc.id, text: t },
    };
  }

  // 本文を入れ替えたが「利用者の編集」ではない経路 (図種の切り替えで見本・下書きを入れた等) が、
  // 次の判定で保存に載らないよう、今の本文を基準として控える。
  function baseline(doc, text) {
    if (!doc || doc.id == null) return null;
    return { id: doc.id, text: _s(text) };
  }

  return { decide: decide, baseline: baseline };
})();
