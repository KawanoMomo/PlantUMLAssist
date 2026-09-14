'use strict';
if (typeof window !== 'undefined') window.MA = window.MA || {};

// swap-queue — 下書き (`{name}-編集中.puml`) と本体の「差し替え待ちキュー」。
//
// BLK-reviewer-20260914-1806-wish: reviewer は手順1・5・7 で `-編集中` の付いた
// ファイルを ls して目で拾い、どれが本体反映待ちでどれがもう要らない残骸かを
// 毎回 diff を取って判断していた。sync-state は「反映漏れがある図」を名指しするが、
// 名指ししない図 (下書きと本体の中身が同じ = もう消してよい下書き) は一覧から
// 消えるので、「下書きが何枚あって、そのうち何枚が反映待ちで、何枚が削除予定か」
// という**キューの全体**が読めない。手順7 で primary に「下書きは用意済み、反映待ち」と
// 言い切るには、消してよい下書きまで含めた台帳が要る。
//
// ここが sync-state に足すのは 3 つ。
//   1. 下書きのある図を、反映漏れの有無にかかわらず全部キューに載せる
//   2. 各行に**次にする一手** (本体へ差し替える / 下書きを消す / 中身を確かめる) を付ける
//   3. ファイル名 1 つを渡すと「本体 / 下書き(差し替え待ち) / 削除予定」を返す
//      (手順1 の DSL 読み込み時に、ファイル名パターンの推測なしで役割が分かる)
//
// DOM にも fetch にも触らない純関数だけ。node からも require できる
// (reviewer は原則ブラウザを開かず、テキストと差分で済ませる)。
(function() {
  function _s(v) { return v == null ? '' : String(v); }

  function _sync() {
    if (typeof window !== 'undefined' && window.MA && window.MA.syncState) return window.MA.syncState;
    if (typeof require === 'function') { try { return require('./sync-state.js'); } catch (e) { /* ブラウザ専用 */ } }
    return null;
  }

  // 行の一手。sync-state の draftStatus からそのまま決まる。
  //   apply   下書きの方が新しい → 本体へ差し替える (これが「反映待ち」)
  //   restore 本体が無い         → 下書きを本体の名前で置き直す
  //   check   どちらが新しいか言えない → 中身を見てから決める
  //   drop    下書きはもう要らない (中身が同じ / 本体の方が新しい)
  var ACTION = {
    'draft-ahead': 'apply',
    orphan: 'restore',
    unknown: 'check',
    same: 'drop',
    'base-ahead': 'drop',
  };

  var ACTION_LABEL = {
    apply: '本体へ差し替え待ち',
    restore: '本体が無い（下書きを本体にする）',
    check: '中身を確かめる（前後不明）',
    drop: '削除予定',
  };

  // drop は 2 つの形を持つ。どちらも「消してよい」だが理由が違うので文面を分ける。
  var DROP_REASON = {
    same: '本体と中身が同じ',
    'base-ahead': '本体の方が新しい',
  };

  // 一覧に出す状態の語。手順1 はこの 3 語だけで役割が読める。
  var STATE = { base: '本体', queued: '差し替え待ち', drop: '削除予定' };

  // build — 保存フォルダの entries から差し替え待ちキューを作る。
  // entries は 📂 一覧がすでに持っている [{name, mtime, hash, ...}]。
  function build(entries, verified) {
    var SS = _sync();
    var out = { rows: [], counts: { total: 0, apply: 0, restore: 0, check: 0, drop: 0 }, byName: {} };
    if (!SS) return out;
    var scanned = SS.scan(entries || [], verified || {});
    (scanned.rows || []).forEach(function(r) {
      if (!r.draft) return;                       // 下書きの無い図はキューに載らない
      var st = r.baseMissing ? 'orphan' : r.draftStatus;
      var action = ACTION[st] || 'check';
      var row = {
        name: r.name,
        base: r.name + '.puml',
        draft: r.draftName + '.puml',
        draftName: r.draftName,
        status: st,
        action: action,
        baseMissing: !!r.baseMissing,
        label: ACTION_LABEL[action],
        reason: action === 'drop' ? (DROP_REASON[st] || '') : (SS.issueText(r) || ''),
      };
      out.rows.push(row);
      out.counts[action]++;
      out.byName[r.name] = row;
      out.byName[r.draftName] = row;
    });
    out.counts.total = out.rows.length;
    // 手を付ける順に並べる。反映待ちが先頭、消すだけの下書きは最後。
    var ORDER = { apply: 0, restore: 1, check: 2, drop: 3 };
    out.rows.sort(function(a, b) {
      var d = ORDER[a.action] - ORDER[b.action];
      return d !== 0 ? d : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    return out;
  }

  // 反映待ち = まだ本体に入っていない下書き (apply / restore / check)。
  function pending(queue) {
    return ((queue && queue.rows) || []).filter(function(r) { return r.action !== 'drop'; });
  }

  // fileState — ファイル名 1 つの役割。手順1 はこれだけで「本体/下書き/削除予定」が分かる
  // (`-編集中` の付き方を名前から推測しない。接尾辞の揺れは sync-state が吸収する)。
  function fileState(queue, name) {
    var n = _s(name).replace(/\.puml$/, '');
    var row = queue && queue.byName ? queue.byName[n] : null;
    if (!row) return { state: STATE.base, action: '', of: n, title: n + ' には編集中の下書きがありません' };
    if (row.draftName === n) {
      var drop = row.action === 'drop';
      return {
        state: drop ? STATE.drop : STATE.queued,
        action: row.action,
        of: row.name,
        title: row.draft + ': ' + row.label + (row.reason ? '（' + row.reason + '）' : ''),
      };
    }
    return {
      state: STATE.base,
      action: row.action,
      of: row.name,
      title: row.base + ': 下書き ' + row.draft + ' が ' + row.label,
    };
  }

  // 見出しの 1 行。0 件でも黙らない (「節が出ていない」を「確かめた」と読ませない)。
  function summary(queue) {
    var c = (queue && queue.counts) || { total: 0 };
    if (!c.total) return '編集中の下書きはありません';
    var parts = [];
    if (c.apply) parts.push('本体へ差し替え待ち ' + c.apply + ' 枚');
    if (c.restore) parts.push('本体の無い下書き ' + c.restore + ' 枚');
    if (c.check) parts.push('前後不明 ' + c.check + ' 枚');
    if (c.drop) parts.push('削除予定 ' + c.drop + ' 枚');
    return '下書き ' + c.total + ' 枚（' + parts.join('・') + '）';
  }

  // report — 手順7 で primary に返す行。ファイル名を機械的に並べる
  // (「下書きは用意済み、反映待ち」を目視の判断なしに言い切れる形)。
  function report(queue) {
    var rows = (queue && queue.rows) || [];
    if (!rows.length) return ['編集中の下書きはありません'];
    var out = [summary(queue)];
    rows.forEach(function(r) {
      var txt = '- ' + r.name + ': ' + r.draft + ' → ' + r.base + ' … ' + r.label;
      if (r.reason) txt += '（' + r.reason + '）';
      out.push(txt);
    });
    return out;
  }

  function reportText(queue) { return report(queue).join('\n'); }

  var api = {
    STATE: STATE,
    ACTION_LABEL: ACTION_LABEL,
    build: build,
    pending: pending,
    fileState: fileState,
    summary: summary,
    report: report,
    reportText: reportText,
  };
  if (typeof window !== 'undefined') window.MA.swapQueue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
