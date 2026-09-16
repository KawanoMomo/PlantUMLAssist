'use strict';

// reply-tracker — reviewer の 指摘.md の各項目と、primary の run ログの応答を突き合わせ、
// 「回答済み / 未回答 (N tick 目) / 判定できない」を項目ごとに言い切る。
//
// BLK-reviewer-20260916-0629-wish: 指摘.md は自由記述の MD で、その中には監査カテゴリ
// (名前 / メソッド / 整合) の突合に乗らない「意図の確認依頼」が混ざる。audit.js --board は
// 突合に出ない項目を「解消」と数えるので、確認依頼が未回答のまま 4 tick 目まで
// 「解消」と表示され、reviewer は毎 tick 本文を読み直して継続に戻していた。
// ここは監査結果を見ず、指摘の文面 (対象の図名とキーワード) と primary の run ログだけで
// 応答の有無を判定する。語が拾えない項目は「解消」にも「未回答」にも倒さず
// 「判定できない」と名指しする (対象外と解消を混ぜない)。
//
// DOM には触らない。node から require する純関数だけ。入口は tools/replies.js。
(function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 見出しの飾り (【継続】、(4tick目)、(継続、…) など) を落とした項目の鍵。
  // tick ごとに回数だけ書き換わっても同じ項目として引けるようにする。
  function keyOf(title) {
    return _s(title)
      .replace(/【[^】]*】/g, '')
      .replace(/[（(][^）)]*(tick|回目|継続|保留|解消|変化)[^）)]*[）)]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // `F-01〜F-06` のような範囲を F-01..F-06 に開く。
  function _expandIds(text) {
    var out = [];
    var re = /\b([A-Z])-(\d+)(?:\s*[〜~～-]\s*(?:[A-Z]-)?(\d+))?/g;
    var m;
    while ((m = re.exec(text))) {
      var a = parseInt(m[2], 10);
      var b = m[3] ? parseInt(m[3], 10) : a;
      var w = m[2].length;
      if (b < a || b - a > 50) b = a;
      for (var i = a; i <= b; i++) {
        var n = String(i);
        while (n.length < w) n = '0' + n;
        out.push(m[1] + '-' + n);
      }
    }
    return out;
  }

  // BLK-reviewer-20260917-0023-wish: 台帳の id はカテゴリの頭文字を持つ
  // (F メソッド / N 表記揺れ・命名規約 / U 未使用participant / S SVG /
  //  T 章立て対応 / C 粒度ほか整合)。本文に書かれた id も項目の手掛かりにする。
  // 本文は自由文なので、頭文字は台帳が使う 6 つだけに絞る (`A-1` 等を拾わない)。
  var LEDGER_PREFIX = 'FNUSTC';

  function _expandLedgerIds(text) {
    var out = [];
    var re = new RegExp('\\b([' + LEDGER_PREFIX + '])-(\\d+)(?:\\s*[〜~～-]\\s*(?:['
      + LEDGER_PREFIX + ']-)?(\\d+))?', 'g');
    var m;
    while ((m = re.exec(text))) {
      var a = parseInt(m[2], 10);
      var b = m[3] ? parseInt(m[3], 10) : a;
      var w = m[2].length;
      if (b < a || b - a > 50) b = a;
      for (var i = a; i <= b; i++) {
        var n = String(i);
        while (n.length < w) n = '0' + n;
        out.push(m[1] + '-' + n);
      }
    }
    return out;
  }

  function _uniq(list) {
    var seen = {};
    return list.filter(function(x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }

  // コマンドやオプション (`audit.js --board` など) は応答の手掛かりにならない。
  function _isCommand(tok) {
    return /(^|\s)--?[a-z]/.test(tok) || /\.(js|json|md)\b/.test(tok) || /^(node|npm)\s/.test(tok);
  }

  // parseFindings(md) — `## ` 見出し 1 つを 1 項目にする。
  //   targets  : 本文と見出しに出る図のファイル名 (拡張子なしの名前)
  //   keywords : バッククォートの語 (コマンドを除く) と F-01 形式の番号
  function parseFindings(md) {
    var lines = _s(md).split(/\r?\n/);
    var items = [];
    var cur = null;
    lines.forEach(function(line) {
      var h = line.match(/^##\s+(.*)$/);
      if (h) {
        cur = { title: h[1].trim(), body: [] };
        items.push(cur);
        return;
      }
      if (cur) cur.body.push(line);
    });
    return items.map(function(it) {
      var text = it.title + '\n' + it.body.join('\n');
      var targets = [];
      var tre = /([^\s`'"()（）、,:：/\\]+)\.(puml|pu|plantuml)\b/g;
      var m;
      while ((m = tre.exec(text))) targets.push(m[1]);
      var keywords = [];
      var kre = /`([^`]+)`/g;
      while ((m = kre.exec(text))) {
        var tok = m[1].trim();
        if (!tok || _isCommand(tok) || /\.(puml|pu|plantuml)$/.test(tok)) continue;
        // `domain-verdict: separate` は `domain-verdict` の方が応答に出やすい。
        var head = tok.split(/[:：\s]/)[0];
        keywords.push(head.length >= 3 ? head : tok);
      }
      // 見出しの id は従来どおり (頭文字を問わない)。本文の id は台帳の頭文字だけ。
      keywords = keywords.concat(_expandIds(it.title))
                         .concat(_expandLedgerIds(it.body.join('\n')));
      return {
        key: keyOf(it.title),
        title: it.title,
        targets: _uniq(targets),
        keywords: _uniq(keywords),
      };
    });
  }

  function _mentions(text, words) {
    for (var i = 0; i < words.length; i++) {
      if (text.indexOf(words[i]) >= 0) return words[i];
    }
    return null;
  }

  // 1 行が応答か: キーワードを含み、対象の図があるならその図名も同じ行にある。
  function _replyLine(item, text) {
    var lines = _s(text).split(/\r?\n/);
    // run ログは 1 文を途中で折り返すので、図名とキーワードが隣の行に分かれる。次の行まで含めて見る。
    for (var i = 0; i < lines.length; i++) {
      if (!_mentions(lines[i], item.keywords) && !_mentions(lines[i], item.targets)) continue;
      var l = lines[i] + (i + 1 < lines.length ? ' ' + lines[i + 1] : '');
      var hit = _mentions(l, item.keywords);
      if (!hit) continue;
      // F-01 形式の番号はそれだけで項目を特定できるので、図名を求めない。
      if (!/^[A-Z]-\d+$/.test(hit) && item.targets.length && !_mentions(l, item.targets)) continue;
      return l.replace(/\s+/g, ' ').trim();
    }
    return null;
  }

  // judge(item, runs, opts) — runs は [{ ts, reviewer, primary }] (reviewer / primary は
  // その run のログ本文。無ければ null)。opts.firstSeen で初出 run を渡せる (控えから)。
  //   status: 'answered' | 'waiting' | 'unknown'
  function judge(item, runs, opts) {
    var o = opts || {};
    var list = (runs || []).slice().sort(function(a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; });
    if (!item.keywords.length) {
      return { key: item.key, title: item.title, status: 'unknown',
               reason: '応答を探す語 (`…` の語や F-01 形式の番号) が本文に無い' };
    }
    var reviewerRuns = list.filter(function(r) { return r.reviewer != null; });
    var first = o.firstSeen || null;
    if (!first) {
      // 初出は「直近の reviewer run から遡って、途切れずにこの項目に触れている最初の run」。
      // 同じ語が昔の別件で出ていても、間に触れない run があればそこで切る。
      // 直近の run ログが項目に触れていない (指摘.md に残したまま run ログでは略した) ときは、
      // 最後に触れた run から遡る。
      var i = reviewerRuns.length - 1;
      while (i >= 0 && !_replyLine(item, reviewerRuns[i].reviewer)) i--;
      for (; i >= 0; i--) {
        if (!_replyLine(item, reviewerRuns[i].reviewer)) break;
        first = reviewerRuns[i].ts;
      }
    }
    if (!first) first = reviewerRuns.length ? reviewerRuns[reviewerRuns.length - 1].ts : '';
    var answer = null;
    for (var j = 0; j < list.length && !answer; j++) {
      var p = list[j];
      if (p.ts <= first || p.primary == null) continue;
      var line = _replyLine(item, p.primary);
      if (line) answer = { ts: p.ts, line: line };
    }
    var ticks = reviewerRuns.filter(function(r) {
      return r.ts >= first && (!answer || r.ts < answer.ts);
    }).length;
    if (answer) {
      return { key: item.key, title: item.title, status: 'answered', firstSeen: first,
               waitedTicks: ticks, answer: answer };
    }
    return { key: item.key, title: item.title, status: 'waiting', firstSeen: first,
             waitingTicks: Math.max(ticks, 1) };
  }

  function judgeAll(md, runs, state) {
    var st = state || {};
    return parseFindings(md).map(function(it) {
      return judge(it, runs, { firstSeen: st[it.key] || null });
    });
  }

  // 控え: 項目の鍵 → 初出 run。次回以降の初出がログの掃除でずれないように持ち越す。
  function nextState(results, prev) {
    var out = {};
    Object.keys(prev || {}).forEach(function(k) { out[k] = prev[k]; });
    (results || []).forEach(function(r) {
      if (r.firstSeen && !out[r.key]) out[r.key] = r.firstSeen;
    });
    return out;
  }

  function format(results) {
    var rs = results || [];
    var waiting = rs.filter(function(r) { return r.status === 'waiting'; });
    var answered = rs.filter(function(r) { return r.status === 'answered'; });
    var unknown = rs.filter(function(r) { return r.status === 'unknown'; });
    var out = ['回答待ち ' + waiting.length + ' 件 / 回答済み ' + answered.length + ' 件 / 判定できない ' + unknown.length + ' 件'];
    if (waiting.length) {
      out.push('', '## 未回答');
      waiting.forEach(function(r) {
        out.push('- ' + r.key + ' — まだ回答なし（' + r.waitingTicks + ' tick 目、初出 runs/' + r.firstSeen + '）');
      });
    }
    if (answered.length) {
      out.push('', '## 回答済み');
      answered.forEach(function(r) {
        out.push('- ' + r.key + ' — runs/' + r.answer.ts + '/primary.md で回答（待ち ' + r.waitedTicks + ' tick）: ' + r.answer.line);
      });
    }
    if (unknown.length) {
      out.push('', '## 判定できない（解消ではない。本文を読む）');
      unknown.forEach(function(r) { out.push('- ' + r.key + ' — ' + r.reason); });
    }
    return out.join('\n');
  }

  var api = {
    keyOf: keyOf, parseFindings: parseFindings, judge: judge, judgeAll: judgeAll,
    nextState: nextState, format: format,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.replyTracker = api;
  }
})();
