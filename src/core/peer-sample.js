'use strict';

// peer-sample — 先輩がその図種を持たないとき、自分の他部品で作り終えた同じ図種を
// 「見本」として横に出すための判断。
//
// BLK-junior-20260915-0007-wish: junior の手順 1 は「先輩の該当図を開いて粒度と
// 命名を見る」から始まるが、アクティビティ図のように先輩 (primary) が 1 枚も
// 持たない図種がある。senior-pane は 4 段のどれにも当たらなければ「当たる先輩の
// 図はありません」と言い切るので、そこで手本が絶える。junior 自身は GPIO/UART/CAN で
// 同じ図種を作り終えているのに、白紙から命名と粒度を自己判断することになっていた。
//
// ここは「自分のフォルダの、同じ図種で、別の部品の図」を見本の候補として選ぶ。
// 先輩の相手が決まっているときは何もしない (見本は手本が無いときの代役であって、
// 先輩より先に出る物ではない)。読むだけなので、選ぶのは名前だけ。
//
// 見本にしないもの:
//   - 自分自身 (いま開いている図)
//   - 同じ部品の図 (自分の TIMER の別図種を見ても、粒度の手本にならない)
//   - 書き出し用・作業中の控え (`(資料用)` `-編集中` `-{数字}` の付いた枝)。
//     これらは元の図の写しなので、見本に出すと同じ図が 2 枚並ぶだけになる
(function() {
  var SP = null;
  if (typeof module !== 'undefined' && module.exports) SP = require('./senior-pane.js');

  // 部品名を出すのに senior-slice の語出しをそのまま使う (同じ揺れを 2 通りに
  // 解釈すると、見本の部品と共通図の抜き出しで別の部品を指すことになる)。
  var SS = null;
  if (typeof module !== 'undefined' && module.exports) SS = require('./senior-slice.js');

  function _pane() { return SP || (typeof window !== 'undefined' && window.MA && window.MA.seniorPane); }
  function _slice() { return SS || (typeof window !== 'undefined' && window.MA && window.MA.seniorSlice); }

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  function baseOf(name) {
    var p = _pane();
    if (p && p.baseOf) return p.baseOf(name);
    var s = _s(name).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  function kindOf(name) {
    var p = _pane();
    return p && p.kindOf ? p.kindOf(name) : '';
  }

  // どの部品の図か。1 語目だけを見る (senior-slice と同じ語の出し方)。
  function partOf(name) {
    var s = _slice();
    var keys = s && s.partKeysOf ? s.partKeysOf(name) : [];
    return keys.length ? keys[0] : '';
  }

  // 書き出し用・作業中の控え。元の図の写しなので見本にしない。
  function isDerived(name) {
    var b = baseOf(name);
    if (b.indexOf('(資料用)') >= 0 || b.indexOf('（資料用）') >= 0) return true;
    if (b.indexOf('-編集中') >= 0) return true;
    // `diagram1_sequence-12` `..-20260914-124713` のような連番・時刻付きの枝。
    if (/-\d{2,}$/.test(b)) return true;
    return false;
  }

  // pickSample(active, ownNames, ownDir)
  //   active   : { name, dir } いま開いている図
  //   ownNames : 自分の保存フォルダのファイル名一覧
  //   ownDir   : 自分の保存フォルダ (枠に出すとき読みに行く先)
  //
  // 返すのは senior-pane の pickCounterpart と同じ形 + dir/part。
  // 見本が無ければ how='none' を返し、呼ぶ側は先輩の「ありません」をそのまま出す。
  function pickSample(active, ownNames, ownDir) {
    var mineName = _s(active && active.name);
    var out = {
      name: '', how: 'none', candidates: [], reason: '',
      dir: _s(ownDir), part: '', kind: '', mine: '',
    };
    var kind = kindOf(mineName);
    if (!mineName || !kind) {
      out.reason = mineName ? '図種が名前から読み取れないので見本を選べません' : 'まだ図を開いていません';
      return out;
    }
    var myPart = partOf(mineName);
    var myBase = baseOf(mineName).toLowerCase();

    var hits = (ownNames || []).map(_s).filter(function(n) {
      if (!n) return false;
      if (baseOf(n).toLowerCase() === myBase) return false;   // 自分自身
      if (kindOf(n) !== kind) return false;                   // 同じ図種だけ
      if (isDerived(n)) return false;                         // 写し・作業中は見本にしない
      var p = partOf(n);
      if (!p) return false;                                   // 部品の読めない図は手本にならない
      if (myPart && p === myPart) return false;               // 同じ部品は手本にならない
      return true;
    });

    if (!hits.length) {
      out.kind = kind;
      out.reason = '自分の他の部品にも同じ図種の図がありません';
      return out;
    }

    // 部品ごとに 1 枚に畳む (同じ部品で図が複数あっても、見本としては 1 枚でよい)。
    var seen = {};
    var picked = [];
    hits.sort(function(a, b) {
      var x = baseOf(a).toLowerCase(), y = baseOf(b).toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    hits.forEach(function(n) {
      var p = partOf(n);
      if (seen[p]) return;
      seen[p] = true;
      picked.push(n);
    });

    out.name = picked[0];
    out.how = 'peer-sample';
    out.candidates = picked;
    out.kind = kind;
    out.part = partOf(picked[0]).toUpperCase();
    out.mine = myPart.toUpperCase();
    out.reason = '自分の ' + out.part + ' の同じ図種';
    return out;
  }

  // 枠の上の 1 行。先輩がいないことと、代わりに何が出ているかを 1 行で言う
  // (「ありません」だけだと、横に出ている図を先輩の図と読み違える)。
  function noticeText(pick, seniorReason) {
    var head = _s(seniorReason) || '当たる先輩の図はありません';
    if (!pick || pick.how !== 'peer-sample' || !pick.name) return head;
    return head + '。代わりに自分の ' + baseOf(pick.name)
      + '（' + pick.reason + '）を見本に出しています・読むだけ';
  }

  // 下端の状態バーの 1 行。
  function statusText(pick) {
    if (!pick || pick.how !== 'peer-sample' || !pick.name) return null;
    return {
      label: '👀 見本 ' + baseOf(pick.name),
      title: '先輩にこの図種の図がないので、' + pick.reason + ' ' + baseOf(pick.name)
        + ' を見本として横に出します (読むだけ)',
      count: (pick.candidates || []).length,
    };
  }

  var api = {
    baseOf: baseOf, kindOf: kindOf, partOf: partOf, isDerived: isDerived,
    pickSample: pickSample, noticeText: noticeText, statusText: statusText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.peerSample = api;
  }
})();
