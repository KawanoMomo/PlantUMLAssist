'use strict';
window.MA = window.MA || {};
// sequence-activation-insert — BLK-human-20260912-0901
// activate / deactivate (実行中の帯) があるシーケンス図で、途中挿入の行を決める。
//
// それまでの挿入は「クリックした行の前 / 後」だけで行を決めていたので、
//   - メッセージと、その直後の `activate B` の間に矢印が割り込む (帯が trigger から切れる)
//   - 帯の外から入れたつもりの矢印が `deactivate B` の手前に入って帯の中身になる
// という 2 つの化け方をしていた。ここは「帯の内側 / 外側」をまず決め、
// その範囲に挿入行を寄せる純関数だけを持つ (DOM には触らない)。
//
// 内側の範囲は [activateLine + 1, deactivateLine] — deactivateLine に挿入すると
// deactivate がそのまま 1 行下がるので、帯の最後の要素になる。
// 外側は deactivateLine + 1 (帯を飛び越した直後)。
window.MA.sequenceActivationInsert = (function() {
  var ACTIVATE_RE = /^activate\s+(\S+)/;
  var DEACTIVATE_RE = /^(?:deactivate|destroy)(?:\s+(\S+))?\s*$/;
  // 矢印を含む行 = メッセージ。`activate` の直前がメッセージなら、その行が帯の trigger。
  var MESSAGE_RE = /(<-+|-+>|<<-+|-+>>)/;

  function _trim(s) { return String(s == null ? '' : s).trim(); }

  function isActivateLine(raw) { return ACTIVATE_RE.test(_trim(raw)); }
  function isDeactivateLine(raw) { return DEACTIVATE_RE.test(_trim(raw)); }
  function isActivationLine(raw) { return isActivateLine(raw) || isDeactivateLine(raw); }

  function activateTargetOf(raw) {
    var m = _trim(raw).match(ACTIVATE_RE);
    return m ? m[1] : null;
  }

  // parseBands — activate / deactivate の対応を取り、帯の一覧を返す。
  // 同じ participant の入れ子は stack で内側から閉じる。deactivate が無いまま
  // 図が終わる帯は @enduml (無ければ最終行) までとして implicitEnd を立てる。
  function parseBands(text) {
    var lines = String(text == null ? '' : text).split('\n');
    var endLine = lines.length;
    for (var e = 0; e < lines.length; e++) {
      if (/^@enduml/.test(_trim(lines[e]))) { endLine = e + 1; break; }
    }
    var open = [];
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = i + 1;
      var s = _trim(lines[i]);
      var am = s.match(ACTIVATE_RE);
      if (am) {
        var prev = i > 0 ? _trim(lines[i - 1]) : '';
        open.push({
          target: am[1],
          activateLine: ln,
          triggerLine: MESSAGE_RE.test(prev) ? ln - 1 : null,
        });
        continue;
      }
      var dm = s.match(DEACTIVATE_RE);
      if (dm) {
        var want = dm[1] || null;
        var at = -1;
        for (var j = open.length - 1; j >= 0; j--) {
          if (!want || open[j].target === want) { at = j; break; }
        }
        if (at < 0) continue;   // 対応する activate が無い deactivate は無視する
        var b = open.splice(at, 1)[0];
        b.deactivateLine = ln;
        b.implicitEnd = false;
        out.push(b);
      }
    }
    // 閉じ忘れの帯も、図の終わりまで続く帯として扱う (挿入が帯を無視しないように)。
    for (var k = 0; k < open.length; k++) {
      open[k].deactivateLine = endLine;
      open[k].implicitEnd = true;
      out.push(open[k]);
    }
    out.sort(function(x, y) { return x.activateLine - y.activateLine; });
    return out;
  }

  // 「内側に入れたい」と読める帯を返す (入れ子なら内側を優先)。無ければ null。
  //   after  : activateLine 〜 deactivateLine - 1 の行を起点にした挿入、および trigger の直後
  //   before : activateLine + 1 〜 deactivateLine の行を起点にした挿入
  function insideBandFor(bands, line, position) {
    var n = parseInt(line, 10);
    if (isNaN(n)) return null;
    var best = null;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var hit = (position === 'before')
        ? (n > b.activateLine && n <= b.deactivateLine)
        : ((n >= b.activateLine && n < b.deactivateLine) || n === b.triggerLine);
      if (!hit) continue;
      if (!best || b.activateLine > best.activateLine) best = b;
    }
    return best;
  }

  // target 行がどこかの帯の内側 (activateLine の後 〜 deactivateLine 以前) に落ちる帯。
  function bandContainingTarget(bands, target) {
    var best = null;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (target > b.activateLine && target <= b.deactivateLine) {
        if (!best || b.activateLine > best.activateLine) best = b;
      }
    }
    return best;
  }

  // resolve — 起点行 (line) と before/after から、実際に挿入する 1 始まりの行を決める。
  // 返り値: { line, position, target, zone: 'inside'|'outside'|'none', part, band, moved }
  // moved は素朴な計算 (before ならその行 / after なら次の行) から動かしたかどうか。
  function resolve(text, line, position) {
    var n = parseInt(line, 10);
    if (isNaN(n)) return null;
    var lines = String(text == null ? '' : text).split('\n');
    var pos = position === 'before' ? 'before' : 'after';
    var raw = pos === 'before' ? n : n + 1;
    var bands = parseBands(text);

    var band = insideBandFor(bands, n, pos);
    if (band) {
      var t = raw;
      // trigger のメッセージと `activate` を引き離さない (= activate を一緒に動かす)。
      while (t <= lines.length && isActivateLine(lines[t - 1])) t++;
      var lo = band.activateLine + 1;
      if (t < lo) t = lo;
      if (t > band.deactivateLine) t = band.deactivateLine;
      return _result(n, pos, t, 'inside', band, raw);
    }

    var t2 = raw;
    // 帯の外への挿入でも、起点のメッセージに付いている activate / deactivate は一緒に動かす。
    if (pos === 'after') {
      while (t2 <= lines.length && isActivationLine(lines[t2 - 1])) t2++;
    }
    var crossed = bandContainingTarget(bands, t2);
    if (crossed) return _result(n, pos, crossed.deactivateLine + 1, 'outside', crossed, raw);
    // 帯を跨がないが、帯の直前 / 直後に接するなら「帯の外側」として見せる
    // (どちらとも関係ない位置は zone: 'none' で、帯の表示を出さない)。
    var adj = bandAdjacentTo(bands, t2);
    if (adj) return _result(n, pos, t2, 'outside', adj, raw);
    return _result(n, pos, t2, 'none', null, raw);
  }

  // target が帯に接する (帯が始まる直前 = activate の行 / 帯を抜けた直後) 帯。
  function bandAdjacentTo(bands, target) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (b.activateLine === target) return b;
      if (!b.implicitEnd && b.deactivateLine + 1 === target) return b;
    }
    return null;
  }

  function _result(line, position, target, zone, band, raw) {
    if (target < 1) target = 1;
    return {
      line: line,
      position: position,
      target: target,
      zone: band ? zone : (zone === 'inside' ? 'none' : zone),
      part: band ? band.target : null,
      band: band,
      moved: target !== raw,
    };
  }

  // ガイド線 / メニュー見出しに出す「帯の内側 / 外側」。帯と無関係なら ''。
  function zoneLabel(res) {
    if (!res) return '';
    if (res.zone === 'inside') return '帯の内側' + (res.part ? ' · ' + res.part : '');
    if (res.zone === 'outside' && res.band) return '帯の外側' + (res.part ? ' · ' + res.part : '');
    return '';
  }

  return {
    ACTIVATE_RE: ACTIVATE_RE,
    DEACTIVATE_RE: DEACTIVATE_RE,
    isActivateLine: isActivateLine,
    isDeactivateLine: isDeactivateLine,
    isActivationLine: isActivationLine,
    activateTargetOf: activateTargetOf,
    parseBands: parseBands,
    insideBandFor: insideBandFor,
    bandAdjacentTo: bandAdjacentTo,
    bandContainingTarget: bandContainingTarget,
    resolve: resolve,
    zoneLabel: zoneLabel,
  };
})();
