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
//
// BLK-human-20260915-1204: 「帯の下を押したのに帯が伸びる」を直す。
// DSL の行番号だけでは「帯の最後のメッセージの後」と「帯を抜けた先」が同じ行に見えるため、
// プレビューの当たり判定 (帯の矩形の内/外) を resolve の第 4 引数 hint で受け取り、
// hint.zone === 'outside' なら deactivate を残したままその後ろに入れる。
// 併せて、帯が `++` / `--` の省略記法や `destroy` で作られている場合も帯として拾う。
window.MA.sequenceActivationInsert = (function() {
  var ACTIVATE_RE = /^activate\s+(\S+)/;
  var DEACTIVATE_RE = /^(?:deactivate|destroy)(?:\s+(\S+))?\s*$/;
  // 矢印を含む行 = メッセージ。`activate` の直前がメッセージなら、その行が帯の trigger。
  var MESSAGE_RE = /(<-+|-+>|<<-+|-+>>)/;
  // 省略記法を読むときは長い矢印から先に当てる (`->>` を `->` で切らない)。
  var ARROW_RE = /(<<-+|-+>>|<-+|-+>)/;
  // メッセージ行の末尾に付く帯の省略記法。`++` 相手を起こす / `--` 送り手を閉じる /
  // `**` 相手を作る / `!!` 相手を壊す。`A -> B ++ : msg` のように : の前に並ぶ。
  var SHORTHAND_RE = /(\+\+|--|\*\*|!!)\s*$/;

  function _trim(s) { return String(s == null ? '' : s).trim(); }

  // メッセージ行から from / to と帯の省略記法を読む。メッセージでなければ null。
  function parseMessageLine(raw) {
    var s = _trim(raw);
    if (!s || /^(?:activate|deactivate|destroy|create)/.test(s)) return null;
    var colon = s.indexOf(':');
    var head = _trim(colon >= 0 ? s.slice(0, colon) : s);
    var am = head.match(ARROW_RE);
    if (!am) return null;
    var arrow = am[1];
    var from = _trim(head.slice(0, am.index));
    var rest = _trim(head.slice(am.index + arrow.length));
    var marks = [];
    var m;
    while ((m = rest.match(SHORTHAND_RE))) {
      marks.unshift(m[1]);
      rest = _trim(rest.slice(0, m.index));
    }
    // 送り手側に付く `A -- > B` のような形は扱わない (PlantUML も受けない)。
    return { from: from, to: _trim(rest), arrow: arrow, marks: marks };
  }

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

    function closeBand(want, ln, how) {
      var at = -1;
      for (var j = open.length - 1; j >= 0; j--) {
        if (!want || open[j].target === want) { at = j; break; }
      }
      if (at < 0) return false;   // 対応する activate が無い deactivate は無視する
      var b = open.splice(at, 1)[0];
      b.deactivateLine = ln;
      b.implicitEnd = false;
      b.closedBy = how;
      out.push(b);
      return true;
    }

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
          shorthand: false,
        });
        continue;
      }
      var dm = s.match(DEACTIVATE_RE);
      if (dm) {
        closeBand(dm[1] || null, ln, /^destroy/.test(s) ? 'destroy' : 'deactivate');
        continue;
      }
      // `A -> B ++ : msg` / `B --> A -- : res` の省略記法。activate の行が無いので、
      // メッセージ行そのものが帯の始まり (= trigger) になる。
      var msg = parseMessageLine(s);
      if (!msg || msg.marks.length === 0) continue;
      for (var mi = 0; mi < msg.marks.length; mi++) {
        var mark = msg.marks[mi];
        if (mark === '++' || mark === '**') {
          open.push({
            target: msg.to, activateLine: ln, triggerLine: ln, shorthand: true,
          });
        } else if (mark === '--') {
          closeBand(msg.from || null, ln, 'shorthand');
        } else if (mark === '!!') {
          closeBand(msg.to || null, ln, 'destroy');
        }
      }
    }
    // 閉じ忘れの帯も、図の終わりまで続く帯として扱う (挿入が帯を無視しないように)。
    for (var k = 0; k < open.length; k++) {
      open[k].deactivateLine = endLine;
      open[k].implicitEnd = true;
      open[k].closedBy = 'implicit';
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

  // 帯を activateLine で引く (プレビューの当たり判定から渡される帯の同定用)。
  function bandByActivateLine(bands, activateLine) {
    var n = parseInt(activateLine, 10);
    if (isNaN(n)) return null;
    for (var i = 0; i < bands.length; i++) {
      if (bands[i].activateLine === n) return bands[i];
    }
    return null;
  }

  // 「この帯を抜けた直後」の行。閉じ方で置き場所が変わる:
  //   deactivate / destroy / 省略記法 `--` … その行の次 (deactivate はそのまま残る)
  //   閉じ忘れ (implicitEnd)              … 図の終わり (@enduml) の直前。呼び手が
  //                                        `deactivate {part}` を先に足せるよう needsClose を立てる
  function _afterBand(band) {
    return band.implicitEnd
      ? { target: band.deactivateLine, needsClose: true }
      : { target: band.deactivateLine + 1, needsClose: false };
  }

  // resolve — 起点行 (line) と before/after から、実際に挿入する 1 始まりの行を決める。
  // hint (任意) はプレビューの当たり判定が決めた帯の内外:
  //   { zone: 'inside' | 'outside', bandLine: 帯の activateLine }
  // DSL の行番号だけでは「帯の最後のメッセージの後」と「帯を抜けた先」が同じ行に見えるので、
  // 押した点が帯の矩形の中だったか下だったかは hint でしか伝わらない。
  // 返り値: { line, position, target, zone: 'inside'|'outside'|'none', part, band, moved, needsClose }
  function resolve(text, line, position, hint) {
    var n = parseInt(line, 10);
    if (isNaN(n)) return null;
    var lines = String(text == null ? '' : text).split('\n');
    var pos = position === 'before' ? 'before' : 'after';
    var raw = pos === 'before' ? n : n + 1;
    var bands = parseBands(text);
    var wantZone = hint && (hint.zone === 'inside' || hint.zone === 'outside') ? hint.zone : null;
    var hintBand = hint ? bandByActivateLine(bands, hint.bandLine) : null;

    // 当たり判定が「帯の外」と言っているなら、帯は閉じたまま、その後ろに置く。
    // これが人間の報告 (帯の下を押したのに帯が伸びる) の直し所。
    if (wantZone === 'outside') {
      var leaving = hintBand || insideBandFor(bands, n, pos) || bandContainingTarget(bands, raw);
      if (leaving) {
        var after = _afterBand(leaving);
        return _result(n, pos, after.target, 'outside', leaving, raw, after.needsClose);
      }
      // 帯が見つからない (帯の無い所を押した) なら素朴な行のまま。
      return _result(n, pos, raw, 'none', null, raw, false);
    }

    var band = wantZone === 'inside'
      ? (hintBand || insideBandFor(bands, n, pos))
      : insideBandFor(bands, n, pos);
    if (band) {
      var t = raw;
      // trigger のメッセージと `activate` を引き離さない (= activate を一緒に動かす)。
      while (t <= lines.length && isActivateLine(lines[t - 1])) t++;
      var lo = band.activateLine + 1;
      if (t < lo) t = lo;
      if (t > band.deactivateLine) t = band.deactivateLine;
      return _result(n, pos, t, 'inside', band, raw, false);
    }

    var t2 = raw;
    // 帯の外への挿入でも、起点のメッセージに付いている activate / deactivate は一緒に動かす。
    if (pos === 'after') {
      while (t2 <= lines.length && isActivationLine(lines[t2 - 1])) t2++;
    }
    var crossed = bandContainingTarget(bands, t2);
    if (crossed) {
      var a2 = _afterBand(crossed);
      return _result(n, pos, a2.target, 'outside', crossed, raw, a2.needsClose);
    }
    // 帯を跨がないが、帯の直前 / 直後に接するなら「帯の外側」として見せる
    // (どちらとも関係ない位置は zone: 'none' で、帯の表示を出さない)。
    var adj = bandAdjacentTo(bands, t2);
    if (adj) return _result(n, pos, t2, 'outside', adj, raw, false);
    return _result(n, pos, t2, 'none', null, raw, false);
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

  function _result(line, position, target, zone, band, raw, needsClose) {
    if (target < 1) target = 1;
    return {
      line: line,
      position: position,
      target: target,
      zone: band ? zone : (zone === 'inside' ? 'none' : zone),
      part: band ? band.target : null,
      band: band,
      moved: target !== raw,
      // 閉じ忘れの帯を外側に抜けるときだけ立つ。呼び手は挿入の前に
      // `deactivate {part}` を 1 行足して帯を閉じる (帯を新しい矢印まで伸ばさない)。
      needsClose: !!needsClose && !!band,
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
    parseMessageLine: parseMessageLine,
    parseBands: parseBands,
    bandByActivateLine: bandByActivateLine,
    insideBandFor: insideBandFor,
    bandAdjacentTo: bandAdjacentTo,
    bandContainingTarget: bandContainingTarget,
    resolve: resolve,
    zoneLabel: zoneLabel,
  };
})();
