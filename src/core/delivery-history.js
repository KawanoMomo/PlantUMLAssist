'use strict';
window.MA = window.MA || {};

// delivery-history — 「どの回に何を渡したか」と「その回と今で何が変わったか」を
// 1 つの表にする。
//
// BLK-primary-20260914-2106-wish: 納品パッケージは毎回「今の状態から新しい zip を
// 作る」だけで、どの版を顧客に渡したかは保存フォルダのファイル名を目で数えるしか
// なかった。履歴の行はあっても日時と枚数しか言わないので、「前回渡した版と比べて
// どの図が変わったか」は zip を開いて中を見るしかない。
//
// ここは export-log の控え 1 件と今の図を突き合わせ、図ごとの状態
// (新規 / 変更 / 変更なし / 今は無い) を返す。控えに DSL を持つのは直近の 1 件だけ
// なので、それより古い回は名前の増減までしか言えない (言えないことを
// 「変更なし」と言わないために exact で区別する)。
// 判定だけ。DOM も fetch も localStorage も見ない。
window.MA.deliveryHistory = (function() {

  function _str(v) { return String(v == null ? '' : v); }

  function _norm(dsl) {
    var SD = window.MA.saveDiff;
    if (SD && SD.normalize) return SD.normalize(dsl);
    return _str(dsl).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function _entries(log, channel) {
    var EL = window.MA.exportLog;
    return EL ? EL.entries(log, channel) : [];
  }

  function _hasMarks(entry) {
    var m = entry && entry.marks;
    if (!m) return false;
    for (var k in m) { if (Object.prototype.hasOwnProperty.call(m, k)) return true; }
    return false;
  }

  // label(entry, index) — 履歴の 1 行の見出し。0 件目は「前回」と言う
  // (同じ並びの中で基準がどれかを、日時を読まずに分かるようにする)。
  function label(entry, index) {
    var EL = window.MA.exportLog;
    var e = entry || {};
    var head = index === 0 ? '前回' : (index + 1) + ' 回前';
    var at = EL ? EL.shortAt(e.at) : _str(e.at).slice(0, 16);
    var parts = [head, at];
    if (e.revision) parts.push(e.revision);
    parts.push((e.count || 0) + ' 枚');
    return parts.join(' ・ ');
  }

  // compare(log, channel, index, docs) — 履歴の index 回目と今の図を突き合わせる。
  // docs は [{ name, dsl }]。返す rows は履歴側にしか無い図も含む。
  function compare(log, channel, index, docs) {
    var list = _entries(log, channel);
    var i = typeof index === 'number' && index >= 0 ? index : 0;
    var entry = list[i];
    var now = (Array.isArray(docs) ? docs : []).filter(function(d) { return d && d.name; });
    if (!entry) {
      return {
        found: false, exact: false, index: i, at: '', revision: '', file: '',
        label: '', rows: [], counts: { new: 0, changed: 0, same: 0, removed: 0, kept: 0 },
        line: 'この回の控えがありません',
      };
    }
    var exact = _hasMarks(entry);
    var names = Array.isArray(entry.names) ? entry.names.map(_str) : [];
    var marks = entry.marks || {};
    var counts = { new: 0, changed: 0, same: 0, removed: 0, kept: 0 };
    var rows = [];
    var seen = {};

    now.forEach(function(d) {
      var n = _str(d.name);
      seen[n] = true;
      var st;
      if (names.indexOf(n) === -1) st = 'new';
      else if (!exact) st = 'kept';
      else st = _norm(marks[n] ? marks[n].dsl : '') === _norm(d.dsl) ? 'same' : 'changed';
      counts[st]++;
      rows.push({ name: n, status: st });
    });

    names.forEach(function(n) {
      if (seen[n]) return;
      counts.removed++;
      rows.push({ name: n, status: 'removed' });
    });

    return {
      found: true, exact: exact, index: i, at: _str(entry.at),
      revision: _str(entry.revision), file: _str(entry.file),
      label: label(entry, i), rows: rows, counts: counts,
      line: summaryLine(counts, exact),
    };
  }

  // summaryLine — 表の上に出す 1 行。数えなくても読めるようにする。
  function summaryLine(counts, exact) {
    var c = counts || { new: 0, changed: 0, same: 0, removed: 0, kept: 0 };
    var parts = [];
    if (exact) {
      if (!c.changed && !c.new && !c.removed) return 'この回から変わった図はありません';
      if (c.changed) parts.push('変更 ' + c.changed + ' 枚');
      if (c['new']) parts.push('新規 ' + c['new'] + ' 枚');
      if (c.removed) parts.push('今は無い ' + c.removed + ' 枚');
      if (c.same) parts.push('変更なし ' + c.same + ' 枚');
      return parts.join(' ・ ');
    }
    // 古い回は本文の控えを持たない。増減だけを言い、変わったかどうかは言わない。
    if (c['new']) parts.push('新規 ' + c['new'] + ' 枚');
    if (c.removed) parts.push('今は無い ' + c.removed + ' 枚');
    parts.push('この回にもある ' + c.kept + ' 枚（本文の控えが無いので変更の有無は不明）');
    return parts.join(' ・ ');
  }

  // pickNames(result) — その回から変わった / 増えた図の名前。
  // 対象の選び直しに使う (履歴を見た流れのまま、その差分だけを zip にできる)。
  // 本文の控えが無い回は、その回に無かった図だけを返す (不明を変更と言わない)。
  function pickNames(result) {
    var out = [];
    ((result && result.rows) || []).forEach(function(r) {
      if (r.status === 'new' || r.status === 'changed') out.push(r.name);
    });
    return out;
  }

  var STATUS_LABEL = {
    'new': '新規', changed: '変更', same: '変更なし',
    removed: '今は無い', kept: 'この回にもある',
  };

  function statusLabel(status) {
    return STATUS_LABEL[status] || '';
  }

  return {
    label: label,
    compare: compare,
    summaryLine: summaryLine,
    pickNames: pickNames,
    statusLabel: statusLabel,
    STATUS_LABEL: STATUS_LABEL,
  };
})();
