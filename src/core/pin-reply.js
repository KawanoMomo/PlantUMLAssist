'use strict';
window.MA = window.MA || {};

// pin-reply — 指摘に「直す側の応答」を返す (BLK-reviewer-20260908-1303-wish)。
//
// 指摘は reviewer から primary への一方通行だった。指摘ピン (review-pins) には
// 未読 / 既読 / 対応済み の 3 状態しかなく、「読んだが今回は直さない」「別件待ちで
// 保留」を書く場所が無い。書けないので primary は何も返さず、reviewer は次の tick で
// また同じ 7 枚を render API で調べ直す。3 tick 連続で同じ指摘を書き直したのがそれ。
//
// 応答は指摘そのものとは別の行に書く。指摘の書式 (id|state|author|at|anchor|text|before)
// を増やすと、その書式を読む既存の道具が全部影響を受ける。応答は指摘 id を指す
// 別のコメント行にして、1 件の指摘に何度でも返せるようにする (やりとりが残る)。
//   ' @reply 1|held|primary|2026-09-08T13:40|SVG の作り直しは提出直前にまとめて行う
//
// verdict は 3 つだけ。
//   done    — 直した。reviewer は「本当に直ったか」だけ抜き打ちで裏取りすればよい
//   held    — 今は直さないが直す。理由が要る (いつ・何待ちか)
//   wontfix — 直さないと決めた。理由が要る (仕様である・別図が正しい など)
// 理由を必須にするのは、理由の無い「保留」は次の tick で結局ゼロから確かめ直しになるため。
//
// ここは DOM にもサーバにも触らない純関数だけを置き、描画と結線は app.js。
window.MA.pinReply = (function() {

  var PREFIX = "' @reply ";

  // 応答の種類。順は「返答として強いもの」から。
  var VERDICTS = ['done', 'held', 'wontfix'];

  var LABEL = {
    done: '対応した',
    held: '保留',
    wontfix: '直さない',
  };

  var TITLE = {
    done: '直した。reviewer は裏取りだけすればよい',
    held: '今は直さないが直す。いつ・何待ちかを書く',
    wontfix: '直さないと決めた。なぜそれでよいかを書く',
  };

  // 理由が要る種類。done は「直した」ことが図の差分に出るので理由は任意。
  var NEEDS_REASON = { held: true, wontfix: true };

  function _s(v) { return v == null ? '' : String(v); }
  function _t(v) { return _s(v).trim(); }

  // review-pins と同じ逃がし方。'|' 区切りの中に '|' や改行が入っても壊れない。
  function _esc(s) {
    return _s(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  }

  function _splitFields(s) {
    var out = [], cur = '', i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\' && i + 1 < s.length) { cur += s.charAt(i + 1); i += 2; continue; }
      if (c === '|') { out.push(cur); cur = ''; i++; continue; }
      cur += c; i++;
    }
    out.push(cur);
    return out;
  }

  function _lines(dsl) {
    return _s(dsl).replace(/\r\n?/g, '\n').split('\n');
  }

  function _join(lines, dsl) {
    return lines.join(/\r\n/.test(_s(dsl)) ? '\r\n' : '\n');
  }

  function normVerdict(v) {
    return VERDICTS.indexOf(_t(v)) >= 0 ? _t(v) : 'held';
  }

  function verdicts() { return VERDICTS.slice(); }
  function verdictLabel(v) { return LABEL[_t(v)] || ''; }
  function verdictTitle(v) { return TITLE[_t(v)] || ''; }
  function needsReason(v) { return !!NEEDS_REASON[_t(v)]; }

  function isReplyLine(line) {
    return _t(line).indexOf(_t(PREFIX)) === 0;
  }

  function format(reply) {
    return PREFIX + [
      _esc(reply.pinId), _esc(normVerdict(reply.verdict)), _esc(reply.author || ''),
      _esc(reply.at || ''), _esc(reply.text || ''),
    ].join('|');
  }

  function parseLine(line) {
    if (!isReplyLine(line)) return null;
    var body = _t(line).slice(_t(PREFIX).length).replace(/^\s+/, '');
    var f = _splitFields(body);
    if (!f[0]) return null;
    return {
      pinId: f[0],
      verdict: normVerdict(f[1]),
      author: f[2] || '',
      at: f[3] || '',
      text: f[4] || '',
    };
  }

  // 書かれている応答を、書かれた順に返す。
  function list(dsl) {
    var out = [];
    _lines(dsl).forEach(function(line, i) {
      var r = parseLine(line);
      if (!r) return;
      r.replyLine = i + 1;
      out.push(r);
    });
    return out;
  }

  function forPin(dsl, pinId) {
    var id = _s(pinId);
    return list(dsl).filter(function(r) { return r.pinId === id; });
  }

  // 最後の応答が今の答え。前の応答は履歴として残す (保留 → 対応した が読める)。
  function latest(dsl, pinId) {
    var all = forPin(dsl, pinId);
    return all.length ? all[all.length - 1] : null;
  }

  function byPin(dsl) {
    var map = {};
    list(dsl).forEach(function(r) { map[r.pinId] = r; });
    return map;
  }

  // 応答を書けるか。理由が要る種類で理由が空なら書かせない
  // (理由の無い保留は、次の tick でゼロから調べ直すことになるため)。
  function canReply(verdict, text) {
    if (VERDICTS.indexOf(_t(verdict)) < 0) return false;
    if (needsReason(verdict) && _t(text) === '') return false;
    return true;
  }

  function replyError(verdict, text) {
    if (VERDICTS.indexOf(_t(verdict)) < 0) return '応答の種類を選んでください';
    if (needsReason(verdict) && _t(text) === '') {
      return verdictLabel(verdict) + 'には理由が要ります (いつ・何待ちか)';
    }
    return '';
  }

  // 応答を 1 件足す。指摘行と同じく @end の直前に置く。
  function add(dsl, pinId, opts) {
    var o = opts || {};
    if (_t(pinId) === '' || !canReply(o.verdict, o.text)) return _s(dsl);
    var lines = _lines(dsl);
    var at = lines.length;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@end/.test(lines[i])) { at = i; break; }
    }
    lines.splice(at, 0, format({
      pinId: _t(pinId), verdict: normVerdict(o.verdict),
      author: _t(o.author) || 'primary', at: _t(o.at), text: _t(o.text),
    }));
    return _join(lines, dsl);
  }

  // 応答を取り消す (押し間違い)。その指摘への応答を全部消す。
  function removeFor(dsl, pinId) {
    var id = _t(pinId);
    var kept = _lines(dsl).filter(function(line) {
      var r = parseLine(line);
      return !(r && r.pinId === id);
    });
    return _join(kept, dsl);
  }

  // 画面に出す 1 行。応答が無ければ空文字 (何も足さない)。
  function statusText(dsl, pinId) {
    var r = latest(dsl, pinId);
    if (!r) return '';
    return (r.author || '?') + ': ' + verdictLabel(r.verdict)
      + (r.at ? ' (' + r.at + ')' : '')
      + (r.text ? ' — ' + r.text : '');
  }

  function answered(dsl, pinId) { return latest(dsl, pinId) !== null; }

  // reviewer が次に何をすればよいか。指摘の並びを 3 つに割る。
  //   recheck   — 「対応した」と言われた分。裏取りする対象
  //   waiting   — 保留・直さない。理由を読んで納得するかどうかだけ
  //   unanswered — 応答が無い分。ここだけが今までどおりゼロから調べ直しになる
  function triage(pins, dsl) {
    var res = { recheck: [], waiting: [], unanswered: [] };
    (Array.isArray(pins) ? pins : []).forEach(function(p) {
      var r = latest(dsl, p && p.id);
      if (!r) { res.unanswered.push(p); return; }
      if (r.verdict === 'done') { res.recheck.push(p); return; }
      res.waiting.push(p);
    });
    return res;
  }

  function summary(pins, dsl) {
    var t = triage(pins, dsl);
    return {
      total: (Array.isArray(pins) ? pins.length : 0),
      recheck: t.recheck.length,
      waiting: t.waiting.length,
      unanswered: t.unanswered.length,
    };
  }

  // 見出し。reviewer が最初に知りたいのは「全部見直すのか、裏取りだけでよいのか」。
  function headText(sum) {
    if (!sum || !sum.total) return '';
    if (sum.unanswered === sum.total) return '応答なし ' + sum.total + ' 件 (全部を確かめ直す)';
    return '裏取り ' + sum.recheck + ' ・ 保留/直さない ' + sum.waiting
      + ' ・ 応答なし ' + sum.unanswered;
  }

  return {
    PREFIX: PREFIX,
    VERDICTS: VERDICTS,
    verdicts: verdicts,
    verdictLabel: verdictLabel,
    verdictTitle: verdictTitle,
    needsReason: needsReason,
    normVerdict: normVerdict,
    isReplyLine: isReplyLine,
    format: format,
    parseLine: parseLine,
    list: list,
    forPin: forPin,
    latest: latest,
    byPin: byPin,
    canReply: canReply,
    replyError: replyError,
    add: add,
    removeFor: removeFor,
    statusText: statusText,
    answered: answered,
    triage: triage,
    summary: summary,
    headText: headText,
  };
})();
