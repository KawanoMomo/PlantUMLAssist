'use strict';
// TICKET-roadmap-20261123-0857-1 (roadmap v8.0 必須 2): 右パネル (「+ 追加」「まとめて」・選んだ要素の反映・削除など) から
// 本文を書き換えた手の後始末の 1 本道。6 図種で共通 (図種モジュールは ctx.setMmdText → ctx.onUpdate を呼ぶだけ)。
//
// 以前は本文を書き換えた後、右パネルの組み直しは少し後の refresh (描き直しの待ち 150ms〜1s) まで来なかった。
// その間に打った次の手は、古い読み (parsedData) と古いフォームに対して働き、
//   - 古い読みから別名・始点 / 終点の候補・入れる位置を決める (別名の重なり・候補に今足した要素が無い)
//   - 確定の直後に選んだ欄が、後から来る組み直しで空に戻り、次の「+ 追加」が空振りする
// ことがあった。ここでは
//   1. setMmdText で本文を入れたらその場で読み直す (次の手は今の本文の読みを使う)
//   2. onUpdate でその場で右パネルを今の読みから組み直し、何に対して組み直したか (本文・選択・図種) を控える
//   3. 後から来る refresh は、控えと同じ本文・選択・図種なら組み直さない (組み直した後に利用者が選んだ・打った欄を消さない)
// とする。本文が変わった (本文欄で打った・Undo) なら refresh は今までどおり組み直す。
window.MA = window.MA || {};
window.MA.propsRebuild = (function() {
  function sameKey(a, b) {
    return !!a && !!b && a.text === b.text && a.sel === b.sel && a.module === b.module;
  }

  // 組み直しの控え。keyFn は今の { text, sel, module } を返す (sel は比べられる文字列。無選択は '[]')。
  function tracker(keyFn) {
    var built = null;
    var fresh = false;
    return {
      // 右パネルを組み直したことを控える。fromUpdate: 右パネルの書き換えの直後にその場で組み直した。
      markBuilt: function(fromUpdate) { built = keyFn(); fresh = !!fromUpdate; },
      // refresh が組み直すか。本文・選択・図種が控えと違えば組み直す。同じなら、
      //   - 無選択 (「末尾に追加」) は組み直さない (図種を選んだ直後・描き直しの後の refresh で、打ち始めた欄を消さない)
      //   - 選んだ要素の右パネルは、書き換えの直後の 1 回だけ組み直さない (それ以外は今までどおり組み直す)
      needRebuild: function() {
        var k = keyFn();
        var f = fresh;
        fresh = false;
        if (!sameKey(built, k)) return true;
        return !(f || k.sel === '[]');
      },
    };
  }

  // 右パネルに渡す ctx。h = { getText(), write(s), reparse(), rebuildNow(), schedule() }
  //   write: 本文を入れる (本文欄・選択の持ち越しの控えなど画面側の後始末)
  //   reparse: 今の本文を読み直す (同期)
  //   rebuildNow: 右パネルを今の読みから組み直す (同期。tracker.markBuilt も呼ぶ)
  //   schedule: 描き直し・一覧・保存など後から来る refresh を予約する
  function makeCtx(h) {
    return {
      getMmdText: function() { return h.getText(); },
      setMmdText: function(s) {
        h.write(s);
        h.reparse();
      },
      onUpdate: function() {
        h.rebuildNow();
        h.schedule();
      },
    };
  }

  return { sameKey: sameKey, tracker: tracker, makeCtx: makeCtx };
})();
