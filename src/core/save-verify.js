'use strict';
window.MA = window.MA || {};

// save-verify — 「保存した」ではなく「保存先ファイルの中身が実際に変わったか」を持つ台帳
// (BLK-primary-20260914-1406-wish)。
//
// 今の画面は保存操作をしたことしか言わない。実際には錠 (source-lock) の問いに答えて
// いない・テンプレ宣言で書き込みを止めている・保存先がダウンロードのまま、のどれかで
// 黙って書かれない道がいくつもあり、引き継ぎ資料に「直したつもりの古い図」が混ざる。
// 保存を試すたびにここへ「何を書くつもりだったか」を控え、あとでディスクの中身と
// 突き合わせて、効いた図と効かなかった図を名指しできるようにする。
//
// DOM にも fetch にも触らない。読み比べと言葉だけ。
window.MA.saveVerify = (function() {

  // name -> { name, dsl, at, outcome, status, disk }
  var _notes = {};

  // 書こうとした結果。app.js の saveActiveDoc が通る道と 1 対 1。
  //   written  — server へ書きに行った (ディスクと突き合わせるのはこれ)
  //   asked    — 開いたままのファイルへの上書き確認が出て、答えるまで書いていない
  //   blocked  — テンプレ宣言のあるファイルなので書かない
  //   skipped  — 開いたときのまま。書く必要が無い (ディスクは既にこの内容)
  //   download — 保存先がファイルではないので、そもそもディスクに書かれない
  var OUTCOMES = ['written', 'asked', 'blocked', 'skipped', 'download'];

  var REASON = {
    asked: '「このファイルを書き換えるか」の問いに答えていないので書いていません',
    blocked: 'テンプレ宣言のあるファイルなので書き込みを止めています',
    skipped: '開いたときのままなので書いていません（ディスクは既にこの内容です）',
    download: '保存先がファイルではありません（⚙設定 → 自動保存 → ファイル）',
    stale: '保存操作は通ったのに、ディスクの中身が編集前のままです',
    missing: '保存操作は通ったのに、保存フォルダにファイルがありません',
    ok: 'ディスクの中身が編集後と一致しています',
    unknown: 'まだディスクと突き合わせていません',
  };

  // 比べる前に行末と前後の空白だけ揃える。server は改行を書き換えるので、
  // それだけの違いを「保存が効かなかった」と言うと、本物の未反映が埋もれる。
  function normalize(text) {
    if (text == null) return null;
    return String(text).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\s+$/, '');
  }

  function note(name, dsl, outcome, at) {
    if (!name) return null;
    var o = OUTCOMES.indexOf(outcome) >= 0 ? outcome : 'written';
    _notes[name] = {
      name: name,
      dsl: dsl == null ? '' : String(dsl),
      at: at || new Date().toISOString(),
      outcome: o,
      // 書きに行っていない道は、その場で答えが決まっている。
      status: o === 'written' ? 'unknown' : (o === 'skipped' ? 'ok' : o),
      disk: null,
    };
    return _notes[name];
  }

  function forget(name) { delete _notes[name]; }
  function clear() { _notes = {}; }
  function record(name) { return _notes[name] || null; }
  function names() {
    return Object.keys(_notes).sort();
  }

  // 突き合わせが要る図。書きに行った道だけをディスクと比べる
  // (答えていない・止めた道は、読み比べなくても結果が分かっている)。
  function pending() {
    return names().filter(function(n) { return _notes[n].outcome === 'written'; });
  }

  // ディスクの中身を当てる。null は「ファイルが無い」。
  function applyDisk(name, diskText) {
    var r = _notes[name];
    if (!r) return null;
    r.disk = diskText == null ? null : String(diskText);
    if (r.outcome !== 'written') return r.status;
    if (diskText == null) r.status = 'missing';
    else r.status = (normalize(diskText) === normalize(r.dsl)) ? 'ok' : 'stale';
    return r.status;
  }

  function statusOf(name) {
    var r = _notes[name];
    return r ? r.status : '';
  }

  function reasonText(status) { return REASON[status] || ''; }

  // 効かなかったのは失敗の側だけ。skipped は「書く必要が無かった」なので ok に入れる。
  function isBad(status) {
    return status === 'stale' || status === 'missing' || status === 'asked'
        || status === 'blocked' || status === 'download';
  }

  // 一覧に出す行。効かなかった図を上に出す (引き継ぐ前に見るのはそこだけ)。
  function rows() {
    var list = names().map(function(n) {
      var r = _notes[n];
      return { name: n, status: r.status, at: r.at, outcome: r.outcome,
               reason: reasonText(r.status), bad: isBad(r.status) };
    });
    list.sort(function(a, b) {
      if (a.bad !== b.bad) return a.bad ? -1 : 1;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return list;
  }

  function badNames() {
    return rows().filter(function(r) { return r.bad; }).map(function(r) { return r.name; });
  }

  // 引き継ぐ前に読む 1 行。0 枚でも黙らない (「まだ確かめていない」も言う)。
  function summary(list) {
    var rs = list || rows();
    if (!rs.length) return 'この周はまだ保存していません';
    var bad = rs.filter(function(r) { return r.bad; }).length;
    var unknown = rs.filter(function(r) { return r.status === 'unknown'; }).length;
    var ok = rs.length - bad - unknown;
    var s = 'この周の保存: 効いた ' + ok + ' 枚';
    if (bad) s += ' / 効かなかった ' + bad + ' 枚';
    if (unknown) s += ' / 未確認 ' + unknown + ' 枚';
    return s;
  }

  // 引き継ぎ資料に貼れる形。名指ししないと、受け取った側は 14 枚を開き直す。
  function handoffText(list) {
    var rs = list || rows();
    var lines = [summary(rs)];
    rs.forEach(function(r) {
      lines.push((r.bad ? '× ' : '○ ') + r.name + '（' + r.reason + '）');
    });
    return lines.join('\n');
  }

  function rowLabel(r) {
    return (r.bad ? '×' : (r.status === 'unknown' ? '?' : '○')) + ' ' + r.name;
  }

  return {
    note: note, forget: forget, clear: clear, record: record, names: names,
    pending: pending, applyDisk: applyDisk, statusOf: statusOf, rows: rows,
    badNames: badNames, summary: summary, handoffText: handoffText,
    reasonText: reasonText, isBad: isBad, normalize: normalize, rowLabel: rowLabel,
    OUTCOMES: OUTCOMES,
  };
})();
