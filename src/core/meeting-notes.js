'use strict';
window.MA = window.MA || {};

// meeting-notes — 変更サマリボードの内容を「会議メモ」1 枚の Markdown にまとめる。
//
// BLK-primary-20260908-0923-wish: ボードは差分行ごとに「済 / 要修正」を付けられるが、
// 会議が終わった瞬間の「どの図に何件の要修正が残っているか」を持ち出す手段が無い。
// 閉じると画面の中にしか残らないので、直す担当がもう一度ボードを開いて同じ差分を
// 目で追い直すことになる。ここでボードの状態 (差分の件数・印の付いた行とその日時・
// 申し送り) を 1 枚のテキストに固め、議事録として次の人に渡せるようにする。
//
// 入力は変更サマリボードの board (change-board.build の戻り) と、印・申し送りの
// モジュール。どれが欠けていても残りで組み立てる (印だけ、申し送りだけの会議もある)。
// このモジュールは DOM に触らない。描画・書き出しは app.js の職掌。
window.MA.meetingNotes = (function() {

  function _str(v) { return String(v == null ? '' : v); }

  // ISO8601 を「2026-09-08 09:40」にする。日時が無ければ空文字。
  function fmtAt(at) {
    var s = _str(at);
    if (!s) return '';
    return s.replace('T', ' ').slice(0, 16);
  }

  // 書き出すファイル名。同じ会議で 2 度押しても分で区別が付く。
  function fileName(at) {
    var s = _str(at).replace(/[-:T]/g, '').slice(0, 13);   // YYYYMMDDhhmm (13 文字目は分の 2 桁目)
    if (s.length < 12) return '会議メモ.md';
    return '会議メモ-' + s.slice(0, 8) + '-' + s.slice(8, 12) + '.md';
  }

  // 印の付いた行の 1 行。行の文字列は Markdown の記号を避けてコード表記にする。
  function rowLine(r) {
    var text = _str(r && r.text);
    var kind = _str(r && r.key).slice(0, 3) === 'del' ? '−' : '+';
    var at = fmtAt(r && r.at);
    return '- [' + _str(r && r.verdict) + '] ' + kind + ' `' + text.replace(/`/g, "'") + '`'
      + (at ? ' (' + at + ')' : '');
  }

  function _countText(e) {
    if (!e) return '';
    if (e.status === 'same') return '変更なし';
    if (e.status === 'new') return '新規 +' + (e.added || 0);
    return '+' + (e.added || 0) + ' −' + (e.removed || 0);
  }

  // opts: { board, verdicts, notes, at, title }
  // verdicts は review-verdicts、notes は handover-notes をそのまま渡す
  // (どちらも null 可)。at は書き出した時刻 (ISO8601)。
  function build(opts) {
    var o = opts || {};
    var board = o.board || null;
    var RV = o.verdicts || null;
    var HN = o.notes || null;
    var at = _str(o.at);
    var title = _str(o.title) || 'レビュー会議メモ';

    var vDocs = RV && RV.docs ? RV.docs() : [];
    var totals = RV && RV.totals ? RV.totals() : { done: 0, fix: 0, docs: 0 };
    var noteList = HN && HN.list ? HN.list() : [];
    var entries = (board && Array.isArray(board.entries)) ? board.entries : [];

    var lines = [];
    lines.push('# ' + title);
    var head = [];
    if (fmtAt(at)) head.push(fmtAt(at));
    if (board) {
      head.push('開いた図 ' + (board.total || 0) + ' 枚 / 変わった図 ' + (board.changedCount || 0) + ' 枚');
      head.push('+' + (board.added || 0) + ' −' + (board.removed || 0) + ' 行');
    }
    head.push('要修正 ' + totals.fix + ' 件 / 済 ' + totals.done + ' 件');
    lines.push(head.join(' ・ '));
    lines.push('');

    // 会議直後に一番読まれるのはこの表。「次に誰が何枚直すか」がここで決まる。
    lines.push('## 要修正の残り');
    var withFix = vDocs.filter(function(d) { return d.fix > 0; });
    if (withFix.length === 0) {
      lines.push('要修正の印が付いた図はありません。');
    } else {
      lines.push('| 図 | 要修正 | 済 |');
      lines.push('|---|---:|---:|');
      withFix.forEach(function(d) {
        lines.push('| ' + d.name + ' | ' + d.fix + ' | ' + d.done + ' |');
      });
    }
    lines.push('');

    // 図ごとの中身。ボードに並んだ順 (会議で見せた順) に出す。
    var shown = {};
    lines.push('## 図ごとの内訳');
    if (entries.length === 0) {
      lines.push('ボードに並んだ図はありません。');
    }
    entries.forEach(function(e) {
      shown[e.name] = true;
      var t = _str(e.diagramType).replace('plantuml-', '');
      lines.push('');
      lines.push('### ' + _str(e.name) + (t ? ' (' + t + ')' : '') + ' — ' + _countText(e));
      if (e.markedAt) lines.push('基準 ' + fmtAt(e.markedAt));
      var note = HN && HN.get ? HN.get(e.name) : null;
      if (note && note.text) lines.push('申し送り: ' + note.text + (fmtAt(note.at) ? ' (' + fmtAt(note.at) + ')' : ''));
      var rows = RV && RV.listFor ? RV.listFor(e.name) : [];
      if (rows.length === 0) {
        lines.push('印の付いた行はありません。');
      } else {
        rows.forEach(function(r) { lines.push(rowLine(r)); });
      }
    });

    // ボードに並ばなかったが印や申し送りの残っている図。基準を取り直すと差分は
    // 消えるので、こちらを落とすと「直す担当への宿題」が丸ごと落ちる。
    var rest = [];
    vDocs.forEach(function(d) { if (!shown[d.name]) rest.push(d.name); });
    noteList.forEach(function(n) {
      if (!shown[n.name] && rest.indexOf(n.name) < 0) rest.push(n.name);
    });
    if (rest.length) {
      lines.push('');
      lines.push('## ボードに出ていない図');
      rest.forEach(function(name) {
        lines.push('');
        lines.push('### ' + name);
        var note = HN && HN.get ? HN.get(name) : null;
        if (note && note.text) lines.push('申し送り: ' + note.text + (fmtAt(note.at) ? ' (' + fmtAt(note.at) + ')' : ''));
        var rows = RV && RV.listFor ? RV.listFor(name) : [];
        rows.forEach(function(r) { lines.push(rowLine(r)); });
      });
    }

    var text = lines.join('\n') + '\n';
    return {
      text: text,
      fileName: fileName(at),
      fixTotal: totals.fix,
      doneTotal: totals.done,
      docCount: entries.length,
      restCount: rest.length,
    };
  }

  // 書き出したあとにボタンへ出す 1 行。何が入ったかを押した人に返す。
  function resultText(res) {
    if (!res) return '';
    return '会議メモを書き出しました (図 ' + res.docCount + ' 枚 ・ 要修正 ' + res.fixTotal
      + ' 件 / 済 ' + res.doneTotal + ' 件)';
  }

  return {
    fmtAt: fmtAt,
    fileName: fileName,
    rowLine: rowLine,
    build: build,
    resultText: resultText,
  };
})();
