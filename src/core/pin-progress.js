'use strict';
window.MA = window.MA || {};

// pin-progress — 指摘 1 件ごとに「未着手 / 着手 / 解消」を機械で付ける。
//
// BLK-reviewer-20260908-1603-wish: 指摘箱 (pin-inbox) は「まだ直っていない指摘」を
// 図をまたいで並べるが、並ぶのは指摘そのものであって着手状況ではない。
// 前回の依頼が着手されたかを知るには `audit.js --since-files` で保存フォルダの
// 全図の指紋を前回の控えと突き合わせ、「変化なし = 未着手」と読むしかなかった。
// 依頼が何 tick 放置されているかも、run ログを読み返して数え直していた。
//
// 指摘ピンは既に「未読 / 既読 / 対応済み」を持つが、これは直す側が手で押す印であり、
// 押されなければ何も分からない。ここで出すのは押印ではなく観測:
//   解消  — 指摘した行がもう無い (書き換わった / 消えた)、または対応済みの印が付いた
//   着手  — 図は指摘のあとで書き換わったのに、指摘した行はそのまま。または応答が返っている
//   未着手 — 指摘のあとで対象図が 1 度も書き換わっていない
// 「図が書き換わったか」は控え (図ごとの指紋) との突き合わせで見る。指紋は指摘行と
// 応答行を外して取る。既読に印を付けただけで「直し始めた」と言わないため。
//
// 放置の長さは 2 つの数で言う。どちらも reviewer が数え直していたもの:
//   経過   — 指摘を書いた日時 (pin.at) から今まで。控えが無くても出せる
//   見送り — 指摘のあとで対象図が書き換わった回数。直す機会があったのに直っていない回数
//
// DOM にも localStorage にもサーバにも触らない。控えの出し入れと描画は app.js。
window.MA.pinProgress = (function() {

  // 3 状態だけ。増やすと「未解消だけ見る」が一目で引けなくなる。
  var STATUS = {
    untouched: {
      key: 'untouched', label: '未着手', open: true,
      title: '指摘したあと、この図はまだ 1 度も書き換わっていません',
    },
    started: {
      key: 'started', label: '着手', open: true,
      title: '図は書き換わりましたが、指摘した行はそのままです',
    },
    resolved: {
      key: 'resolved', label: '解消', open: false,
      title: '指摘した行が書き換わったか、対応済みの印が付いています',
    },
  };

  var ORDER = ['untouched', 'started', 'resolved'];

  function _s(v) { return v == null ? '' : String(v); }

  function _lines(dsl) {
    return _s(dsl).replace(/\r\n?/g, '\n').split('\n');
  }

  // FNV-1a 32bit。manual-findings と同じ作り (敵はいない。要るのは「同じなら同じ値」だけ)。
  function _hash(s) {
    var h = 0x811c9dc5;
    var t = _s(s);
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  // 図の指紋。指摘行 (' @pin) と応答行 (' @reply) は外す。
  // 既読を付ける・応答を返すだけで指紋が動くと、直していないのに「図が書き換わった」に
  // なり、見送り回数が水増しされる。整形だけの差 (インデント・空行) も数えない。
  function docFingerprint(dsl) {
    var RP = window.MA.reviewPins;
    var PR = window.MA.pinReply;
    var body = [];
    _lines(dsl).forEach(function(line) {
      if (RP && RP.isPinLine && RP.isPinLine(line)) return;
      if (PR && PR.isReplyLine && PR.isReplyLine(line)) return;
      var t = _s(line).replace(/\s+/g, ' ').trim();
      if (!t) return;
      body.push(t);
    });
    return _hash(body.join('\n'));
  }

  // 控えの鍵。図名 + 指摘 id。指摘 id は図の中で一意 (review-pins.nextId)。
  function keyOf(item) {
    if (!item) return '';
    return _s(item.doc) + '#' + _s(item.id);
  }

  // ---- 1 件の仕分け --------------------------------------------------------

  // ctx: { docFp, memo, reply }
  //   docFp — 対象図のいまの指紋
  //   memo  — この指摘の控え { docFp, passes, firstAt }。初めて見るなら null
  //   reply — pin-reply.latest の結果 (無ければ null)
  function classify(item, ctx) {
    var c = ctx || {};
    var reply = c.reply || null;
    if (item && item.state === 'done') {
      return { status: 'resolved', why: '対応済みの印が付いています' };
    }
    if (item && item.stale) {
      // anchor の行が見つからない = 指摘した行が書き換わったか消えた。
      // 指摘箱では「迷子」として扱う状態だが、着手状況としては直された証拠。
      return { status: 'resolved', why: '指摘した行が図から無くなっています' };
    }
    if (reply) {
      // 「直した」と返ってきていても、指摘した行がそのままなら解消にはしない。
      // 応答は直す側の申告であって観測ではない。reviewer が裏取りできるよう箱に残す
      // (BLK-reviewer-20260908-1303-wish が指摘箱に応答を並べたのはそのため)。
      return {
        status: 'started',
        why: reply.verdict === 'done'
          ? '「直した」と応答が返っていますが、指摘した行はそのままです'
          : '応答が返っています (' + _s(reply.verdict) + ')',
      };
    }
    var memo = c.memo || null;
    if (!memo || !memo.docFp) {
      // 初めて見た指摘。図が書き換わったかどうかはまだ比べようがない。
      return { status: 'untouched', why: 'この図を見るのは初めてです' };
    }
    if (memo.docFp !== _s(c.docFp)) {
      return { status: 'started', why: '図は書き換わりましたが、指摘した行はそのままです' };
    }
    if (memo.passes > 0) {
      return { status: 'started', why: '指摘のあと図が ' + memo.passes + ' 回書き換わりました' };
    }
    return { status: 'untouched', why: '指摘のあと、この図は書き換わっていません' };
  }

  // ---- まとめて観測する ----------------------------------------------------

  // items: pin-inbox.collect の結果 (doc 付きの指摘)
  // docs:  [{name, dsl}] 走査で読んだ図の束
  // memo:  前回までの控え { key: {docFp, passes, firstAt} }。渡さなければ空から始める
  // 戻り: { entries, memo } — memo は新しいオブジェクト (渡された控えは書き換えない)
  function observe(items, docs, memo, opts) {
    var o = opts || {};
    var PR = window.MA.pinReply;
    var byName = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (d && typeof d.name === 'string' && typeof d.dsl === 'string') byName[d.name] = d.dsl;
    });

    var fpCache = {};
    function fpOf(doc) {
      if (!Object.prototype.hasOwnProperty.call(fpCache, doc)) {
        fpCache[doc] = Object.prototype.hasOwnProperty.call(byName, doc)
          ? docFingerprint(byName[doc]) : '';
      }
      return fpCache[doc];
    }

    var prev = (memo && typeof memo === 'object') ? memo : {};
    var next = {};
    var entries = [];

    (Array.isArray(items) ? items : []).forEach(function(p) {
      if (!p) return;
      var key = keyOf(p);
      var docFp = fpOf(_s(p.doc));
      var was = prev[key] || null;
      var reply = (PR && Object.prototype.hasOwnProperty.call(byName, _s(p.doc)))
        ? PR.latest(byName[p.doc], p.id) : null;
      var verdict = classify(p, { docFp: docFp, memo: was, reply: reply });

      // 見送り回数は「指摘のあと図が書き換わった回数」。指紋が前回と違えば 1 増える。
      var passes = was && typeof was.passes === 'number' ? was.passes : 0;
      if (was && was.docFp && docFp && was.docFp !== docFp) passes += 1;

      var firstAt = (was && was.firstAt) ? was.firstAt : _s(o.now || '');
      // 解消したものは控えを持ち越さない。次に同じ id が使い回されたとき、
      // 前の指摘の見送り回数を引き継いで数えないため。
      if (verdict.status !== 'resolved') {
        next[key] = { docFp: docFp, passes: passes, firstAt: firstAt };
      }

      entries.push({
        item: p,
        key: key,
        status: verdict.status,
        label: STATUS[verdict.status].label,
        title: STATUS[verdict.status].title,
        why: verdict.why,
        passes: passes,
        reply: reply,
        age: ageText(p.at, o.now),
      });
    });

    return { entries: entries, memo: next };
  }

  // ---- 表示用 --------------------------------------------------------------

  // 経過。指摘に書かれた日時 (pin.at) から now まで。読めなければ空文字。
  function ageText(at, now) {
    var t = Date.parse(_s(at));
    if (isNaN(t)) return '';
    var n = now ? Date.parse(_s(now)) : Date.now();
    if (isNaN(n)) n = Date.now();
    var min = Math.floor((n - t) / 60000);
    if (min < 0) return '';
    if (min < 60) return min + ' 分前';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + ' 時間前';
    return Math.floor(hour / 24) + ' 日前';
  }

  // 1 件を 1 行で言う。「未着手 · 3 時間前 · 見送り 2 回」。
  function entryText(e) {
    if (!e) return '';
    var parts = [e.label];
    if (e.age) parts.push(e.age);
    if (e.passes > 0) parts.push('見送り ' + e.passes + ' 回');
    return parts.join(' · ');
  }

  function summary(entries) {
    var sum = { total: 0, untouched: 0, started: 0, resolved: 0, open: 0, stalled: 0, oldest: '' };
    var oldestMs = null;
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      if (!e || !STATUS[e.status]) return;
      sum.total += 1;
      sum[e.status] += 1;
      if (STATUS[e.status].open) {
        sum.open += 1;
        if (e.passes > 0) sum.stalled += 1;
        var t = Date.parse(_s(e.item && e.item.at));
        if (!isNaN(t) && (oldestMs === null || t < oldestMs)) {
          oldestMs = t;
          sum.oldest = e.age || '';
        }
      }
    });
    return sum;
  }

  function headText(sum) {
    var s = sum || summary([]);
    if (!s.total) return '追跡する指摘はありません';
    var t = '未着手 ' + s.untouched + ' · 着手 ' + s.started + ' · 解消 ' + s.resolved;
    if (s.stalled > 0) t += ' · 見送りあり ' + s.stalled;
    if (s.oldest) t += ' · 最古 ' + s.oldest;
    return t;
  }

  // 未解消 (未着手 + 着手) だけを残す。reviewer の手順 1 はこの並びをそのまま読む。
  function openOnly(entries) {
    return (Array.isArray(entries) ? entries : []).filter(function(e) {
      return e && STATUS[e.status] && STATUS[e.status].open;
    });
  }

  // 並べ替え: 未着手 → 着手 → 解消、同じ状況なら見送りが多い順、次に古い順。
  function sort(entries) {
    return (Array.isArray(entries) ? entries : []).slice().sort(function(a, b) {
      var ai = ORDER.indexOf(a.status), bi = ORDER.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      if (a.passes !== b.passes) return b.passes - a.passes;
      var at = Date.parse(_s(a.item && a.item.at));
      var bt = Date.parse(_s(b.item && b.item.at));
      if (isNaN(at) && isNaN(bt)) return 0;
      if (isNaN(at)) return 1;
      if (isNaN(bt)) return -1;
      return at - bt;
    });
  }

  return {
    STATUS: STATUS,
    docFingerprint: docFingerprint,
    keyOf: keyOf,
    classify: classify,
    observe: observe,
    ageText: ageText,
    entryText: entryText,
    summary: summary,
    headText: headText,
    openOnly: openOnly,
    sort: sort,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MA.pinProgress;
