'use strict';
window.MA = window.MA || {};

// blank-doc — 「白紙の図」を 1 か所で決める。
//
// BLK-junior-20260909-0703: 先輩の図を手本に Class 図を白紙から起こそうとして
// 図種を Class にし ＋ (新規タブ) を押すと、雛形にサンプルの User / IAuth クラスと
// 関連が最初から入っていた。手本にも部品にも無いクラスなので、打ち始める前に
// 一旦全消去する一手間が要る。雛形は「何もない画面で何をすればいいか分からない」
// 人への見本であって、手本を持っている人には邪魔でしかない。
//
// 新規タブは白紙にする。図種の見本 (module.template()) は初回起動と、
// 中身のある図の図種を切り替えたときにだけ出す。
//
// DOM も fetch も触らない。
window.MA.blankDoc = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 図種ごとの「骨だけ」。活動図の start / stop は見本ではなく図の骨格で、
  // 末尾追加はこの 2 行の間に工程を入れる。ここまで消すと白紙から 1 工程足すのに
  // start / stop を手で打つことになり、かえって手数が増える。
  var SKELETON = {
    'plantuml-activity': '@startuml\nstart\nstop\n@enduml',
  };

  function blankDsl(diagramType) {
    return SKELETON[_s(diagramType)] || '@startuml\n@enduml';
  }

  // 中身のある行だけを残す。@start/@end・コメント・空行は「中身」ではない。
  function bodyLines(dsl) {
    return _s(dsl).split(/\r?\n/).map(function(l) { return l.trim(); })
      .filter(function(l) {
        if (!l) return false;
        if (l.charAt(0) === "'") return false;
        if (/^@(start|end)/i.test(l)) return false;
        return true;
      });
  }

  // 白紙 = 図として何も言っていない。空文字も白紙に数える
  // (まだ何も入っていないタブを「中身あり」と読むと、切り替えで見本が降ってくる)。
  function isBlank(dsl, diagramType) {
    var body = bodyLines(dsl);
    if (body.length === 0) return true;
    // 骨だけの図も「まだ中身が無い」(活動図の start / stop だけ等)。
    return body.join('\n') === bodyLines(blankDsl(diagramType)).join('\n');
  }

  // その図種の見本のまま、まだ 1 文字も直していない状態。
  // 見本を消してから打ち始める人と、見本の上から打ち替える人を区別しない
  // (どちらも「自分の中身はまだ無い」)。
  function isUntouched(dsl, templateDsl, diagramType) {
    if (isBlank(dsl, diagramType)) return true;
    var a = bodyLines(dsl).join('\n');
    var b = bodyLines(templateDsl).join('\n');
    return !!a && a === b;
  }

  // 図種を切り替えたときに出す DSL。
  //   1. その図種で前に書いたものが残っていればそれ (従来どおり)
  //   2. 今の図が白紙・見本のままなら白紙 (見本を押し付けない)
  //   3. 中身があれば、切り替え先の見本 (従来どおり)
  function dslForTypeSwitch(currentDsl, savedForType, nextTemplate, currentTemplate, opts) {
    var o = opts || {};
    if (savedForType != null && savedForType !== '') return savedForType;
    if (isUntouched(currentDsl, currentTemplate, o.fromType)) return blankDsl(o.toType);
    return _s(nextTemplate);
  }

  return {
    blankDsl: blankDsl,
    bodyLines: bodyLines,
    isBlank: isBlank,
    isUntouched: isUntouched,
    dslForTypeSwitch: dslForTypeSwitch,
  };
})();
