'use strict';
window.MA = window.MA || {};

// tab-reveal — タブ列を横に送って、選ばれているタブを見える所に出す (design 10a)。
//
// BLK-builder-20260924-2325-2: タブ列 (#tab-bar) は横に流れ、右端に「＋」「ツール ▾」を貼り付けている。
// FILES ツリーから図を開いてタブが増えると、今開いた図のタブがその貼り付けの下に潜り、
// どのタブが選ばれているかをタブ列で読めなかった。VS Code と同じく、選んだタブが全部見える所まで送る
// (もう見えていれば動かさない)。ここは DOM に触らない純関数だけ。結線は app.js の renderTabs。
window.MA.tabReveal = (function() {
  function _n(v) { var x = Number(v); return isFinite(x) ? x : 0; }

  // o: {
  //   scrollLeft   … 今の横送り量
  //   viewWidth    … タブ列の見える幅 (clientWidth)
  //   contentWidth … 中身の幅 (scrollWidth)
  //   itemLeft     … 選ばれたタブの左端 (中身の左端から)
  //   itemWidth    … 選ばれたタブの幅
  //   reserveRight … 右端に貼り付いて中身を隠す幅 (「＋」「ツール ▾」)
  //   pad          … タブの両脇に空ける余白 (既定 4)
  // }
  // 戻り値は新しい横送り量 (0 〜 contentWidth − viewWidth)。
  function scrollFor(o) {
    var s = _n(o && o.scrollLeft);
    var view = _n(o && o.viewWidth);
    var content = _n(o && o.contentWidth);
    var left = _n(o && o.itemLeft);
    var width = _n(o && o.itemWidth);
    var reserve = Math.max(0, _n(o && o.reserveRight));
    var pad = (o && o.pad != null) ? Math.max(0, _n(o.pad)) : 4;
    var max = Math.max(0, content - view);
    if (view <= 0 || max <= 0) return Math.min(Math.max(s, 0), max);
    var avail = Math.max(0, view - reserve);
    var right = left + width;
    var next = s;
    if (left - pad < s || width + pad * 2 > avail) {
      // 左に切れている、または見える幅に収まらない: タブの左端をそろえる。
      next = left - pad;
    } else if (right + pad > s + avail) {
      // 右の貼り付けの下に潜っている: タブの右端が貼り付けの手前に来るまで送る。
      next = right + pad - avail;
    }
    if (next < 0) next = 0;
    if (next > max) next = max;
    return next;
  }

  return { scrollFor: scrollFor };
})();
