// impact-thumbs.js — 置換の影響ボードに並べる「変更前 / 変更後 (仮適用)」の図。
//
// BLK-primary-20260917-0223: 手順4「Spi_Driver 統一の変更前後を並べて見せる」で
// 「影響範囲を見る」を押すと、出現図・内訳・該当行テキストは出るが、会議の画面共有で
// 見せたいのは「置換前の図」と「置換後の見た目」。今は各図をエディタで開いて
// 描き直さないと見た目の差が分からず、3 図分をその場で開き直す手間が要る。
//
// ここは「何をどの順で描くか」だけを決める純関数。描画そのもの (/render への往復) と
// DOM は app.js 側。描く順と重複の除き方を単体で確かめられるようにする。
(function() {
  'use strict';

  var SIDES = [
    { side: 'before', label: '今' },
    { side: 'after', label: '置換後' },
  ];

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  // 同じ DSL は 1 度だけ描く。図の中身が同じなら図も同じなので、
  // 名前ではなく本文で引く (置換で 1 文字も変わらない図は 1 枚で足りる)。
  function key(dsl) {
    var s = _s(dsl);
    // 長い本文をそのまま持つと控えが膨らむので、長さ + 走査ハッシュで畳む。
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return s.length + '-' + h.toString(36);
  }

  // 影響ボードの entries → 描く順。図ごとに「今 → 置換後」で並べる
  // (会議では 1 図ずつ左右に見せるので、図をまたいで先に全部の「今」を描かない)。
  // 変更の無い図は entries に入らないので、ここには出ない。
  function renderPlan(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var plan = [];
    list.forEach(function(e) {
      if (!e) return;
      SIDES.forEach(function(s) {
        var dsl = s.side === 'before' ? e.before : e.after;
        if (!_s(dsl)) return;
        plan.push({
          id: _s(e.id),
          name: _s(e.name),
          side: s.side,
          label: s.label,
          dsl: _s(dsl),
          key: key(dsl),
        });
      });
    });
    return plan;
  }

  // 同じ本文を 2 度 /render に投げない。描く実体はこれだけ。
  function uniquePlan(entries) {
    var seen = {};
    return renderPlan(entries).filter(function(p) {
      if (seen[p.key]) return false;
      seen[p.key] = true;
      return true;
    });
  }

  // 置換で見た目が変わらない図。テキスト差分はあっても図が同じなら、
  // 会議で「この図は見た目は変わりません」と言い切れる。
  function unchangedNames(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var out = [];
    list.forEach(function(e) {
      if (!e) return;
      if (key(e.before) === key(e.after)) out.push(_s(e.name));
    });
    return out;
  }

  // 描いている間の 1 行。会議中に「止まっているのか描いているのか」が分かるように
  // 残り枚数を出す。
  function statusText(done, total) {
    var d = Math.max(0, Number(done) || 0);
    var t = Math.max(0, Number(total) || 0);
    if (t === 0) return '';
    if (d >= t) return '図 ' + t + ' 枚';
    return '図を描いています ' + d + '/' + t;
  }

  var api = {
    SIDES: SIDES,
    key: key,
    renderPlan: renderPlan,
    uniquePlan: uniquePlan,
    unchangedNames: unchangedNames,
    statusText: statusText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.impactThumbs = api;
  }
})();
