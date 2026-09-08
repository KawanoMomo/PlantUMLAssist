'use strict';
window.MA = window.MA || {};

// export-log — 「いつ・どの版で・どの図を客先に出したか」の控えを保存フォルダに置く。
//
// BLK-primary-20260909-0003-wish: 納品パッケージの控え (前回提出の基準) は
// localStorage にしか無かった。ブラウザを開き直す・別の端末で開く・プロファイルが
// 変わると控えごと消えるので、同じフォルダで何度出していても毎回
// 「初回提出 (23 枚すべて新規)・要確認 19 件」になり、前回提出以降に変わった図だけを
// 確かめる、という読み方ができなかった。同じ穴は「全図を SVG で保存」にもある。
//
// 控えは図と同じ保存フォルダに置く (図が正本の置き場なので、控えもそこに従う)。
// 書き出しの種類を channel で分ける: 'delivery' = 納品パッケージ、'svg' = SVG 一括出力。
//
// 中身は判定と組み立てだけ。fetch も DOM も localStorage も見ない
// (保存フォルダとのやり取りは workspace、描画は app.js の職掌)。
window.MA.exportLog = (function() {

  var MAX_ENTRIES = 20;
  var CHANNELS = ['delivery', 'svg'];
  var CHANNEL_LABEL = { delivery: '納品パッケージ', svg: 'SVG 一括出力' };

  function _norm(dsl) {
    var SD = window.MA.saveDiff;
    if (SD && SD.normalize) return SD.normalize(dsl);
    return String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function _str(v) { return String(v == null ? '' : v); }

  function normalizeChannel(ch) {
    return CHANNELS.indexOf(ch) >= 0 ? ch : 'delivery';
  }

  function empty() {
    return { version: 1, channels: { delivery: { entries: [] }, svg: { entries: [] } } };
  }

  // parse — 保存フォルダから読んだ JSON (文字列でもオブジェクトでも) を控えにする。
  // 壊れていたら「まだ 1 度も出していない」から始める (読めない控えで止めない)。
  function parse(raw) {
    var log = empty();
    var data = raw;
    if (typeof raw === 'string') {
      if (raw.trim() === '') return log;
      try { data = JSON.parse(raw); } catch (e) { return log; }
    }
    if (!data || typeof data !== 'object') return log;
    var src = (data.channels && typeof data.channels === 'object') ? data.channels : data;
    CHANNELS.forEach(function(ch) {
      var node = src[ch];
      var list = node && Array.isArray(node.entries) ? node.entries
                                                     : (Array.isArray(node) ? node : []);
      var out = [];
      list.forEach(function(e) {
        if (!e || typeof e !== 'object') return;
        var marks = {};
        if (e.marks && typeof e.marks === 'object') {
          for (var k in e.marks) {
            if (!Object.prototype.hasOwnProperty.call(e.marks, k)) continue;
            var m = e.marks[k];
            if (m && typeof m.dsl === 'string') marks[k] = { dsl: m.dsl };
          }
        }
        var names = Array.isArray(e.names) ? e.names.map(_str).filter(function(n) { return n; })
                                           : Object.keys(marks);
        out.push({
          at: _str(e.at),
          title: _str(e.title),
          revision: _str(e.revision),
          file: _str(e.file),
          count: typeof e.count === 'number' ? e.count : names.length,
          names: names,
          marks: marks,
        });
      });
      log.channels[ch] = { entries: out.slice(0, MAX_ENTRIES) };
    });
    return log;
  }

  function serialize(log) {
    return JSON.stringify(log && log.channels ? log : empty(), null, 1);
  }

  function entries(log, channel) {
    var l = (log && log.channels) ? log : empty();
    var node = l.channels[normalizeChannel(channel)];
    return (node && node.entries) ? node.entries : [];
  }

  // latest(log, channel) — 直近に出した 1 件。まだ出していなければ at が ''。
  function latest(log, channel) {
    var list = entries(log, channel);
    return list.length ? list[0] : { at: '', title: '', revision: '', file: '', count: 0, names: [], marks: {} };
  }

  // baselineOf(log, channel, name) — change-board.build / save-diff.baselineOf と
  // 同じ形。直近に出した版の DSL が基準 (保存のたびに動く基準では
  // 「前回顧客に出した版からの差分」にならない)。
  function baselineOf(log, channel, name) {
    var m = latest(log, channel).marks[String(name)];
    return m ? { dsl: m.dsl, at: latest(log, channel).at } : null;
  }

  // statusOf(log, channel, name, dsl) — 前回書き出しから見たその図の状態。
  // 出したことが無い図は 'new' (渡していないものは必ず渡す側に入れる)。
  function statusOf(log, channel, name, dsl) {
    var base = baselineOf(log, channel, name);
    if (!base) return 'new';
    return _norm(base.dsl) === _norm(dsl) ? 'same' : 'changed';
  }

  // changedNames(log, channel, docs) — 前回書き出し以降に変わった / 増えた図の名前。
  // 「前回提出以降に変わった図だけを確認する」の的になる。
  function changedNames(log, channel, docs) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || !d.name) return;
      if (statusOf(log, channel, d.name, d.dsl) !== 'same') out.push(String(d.name));
    });
    return out;
  }

  // record(log, channel, entry) — 出した時点を控えに足す。DSL 本文を持つのは
  // 直近の 1 件だけ (それが次の差分の基準)。古い件は「いつ・何を出したか」だけ残す。
  function record(log, channel, entry) {
    var ch = normalizeChannel(channel);
    var l = parse(log && log.channels ? log : empty());
    var o = entry || {};
    var docs = Array.isArray(o.docs) ? o.docs : [];
    var marks = {};
    var names = [];
    docs.forEach(function(d) {
      if (!d || !d.name) return;
      var n = String(d.name);
      if (marks[n]) return;
      marks[n] = { dsl: _norm(d.dsl) };
      names.push(n);
    });
    var rec = {
      at: _str(o.at) || new Date().toISOString(),
      title: _str(o.title),
      revision: _str(o.revision),
      file: _str(o.file),
      count: names.length,
      names: names,
      marks: marks,
    };
    var old = entries(l, ch).map(function(e) {
      return { at: e.at, title: e.title, revision: e.revision, file: e.file,
               count: e.count, names: e.names, marks: {} };
    });
    l.channels[ch] = { entries: [rec].concat(old).slice(0, MAX_ENTRIES) };
    return l;
  }

  function shortAt(at) {
    return _str(at).replace('T', ' ').slice(0, 16);
  }

  // historyLine(entry, channel) — 履歴一覧の 1 行。
  function historyLine(entry, channel) {
    var e = entry || {};
    if (!e.at) return 'まだ 1 度も出していません';
    var parts = [shortAt(e.at)];
    if (e.revision) parts.push(e.revision);
    parts.push(e.count + ' 枚');
    if (e.file) parts.push(e.file);
    return parts.join(' ・ ');
  }

  // sinceLine(log, channel, docs) — 「前回いつ出したか」と「そこから何枚変わったか」。
  // 出したことが無ければ初回と言い切る (毎回それしか出ないのが元の不満なので、
  // 出したことがあるときは必ず基準の日時を添える)。
  function sinceLine(log, channel, docs) {
    var last = latest(log, channel);
    var label = CHANNEL_LABEL[normalizeChannel(channel)];
    var list = Array.isArray(docs) ? docs : [];
    if (!last.at) return '前回の' + label + 'はありません（今回が初回）';
    var changed = 0;
    var added = 0;
    list.forEach(function(d) {
      if (!d || !d.name) return;
      var st = statusOf(log, channel, d.name, d.dsl);
      if (st === 'changed') changed++;
      else if (st === 'new') added++;
    });
    var head = '前回' + label + ' ' + shortAt(last.at)
      + (last.revision ? ' (' + last.revision + ')' : '') + ' から';
    if (changed === 0 && added === 0) return head + '変わった図はありません（' + list.length + ' 枚すべて前回同一）';
    return head + '変更 ' + changed + ' 枚 ・ 新規 ' + added + ' 枚（残り '
      + (list.length - changed - added) + ' 枚は前回同一）';
  }

  return {
    MAX_ENTRIES: MAX_ENTRIES,
    CHANNELS: CHANNELS,
    CHANNEL_LABEL: CHANNEL_LABEL,
    normalizeChannel: normalizeChannel,
    empty: empty,
    parse: parse,
    serialize: serialize,
    entries: entries,
    latest: latest,
    baselineOf: baselineOf,
    statusOf: statusOf,
    changedNames: changedNames,
    record: record,
    shortAt: shortAt,
    historyLine: historyLine,
    sinceLine: sinceLine,
  };
})();
