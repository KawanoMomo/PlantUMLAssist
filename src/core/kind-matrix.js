'use strict';
window.MA = window.MA || {};

// kind-matrix — 1 つの題材 (ドメイン) について、6 図種すべての「相手に追いついているか」を
// 1 画面で出す。
//
// BLK-junior-20260914-1806-wish: 「先輩の図の変更を取り込む」場面は、シーケンス → 状態遷移 →
// クラス → アクティビティ → コンポーネント → ユースケースと図種を 1 つずつ担当する進め方なので、
// 👀 他フォルダでの対応要否の確認が 6 周にまたがって 1 枚ずつになる。GPIO だけで 9 周目の今も
// 3 図種目。控え (peek-verdict) のおかげで同じ組を二度確かめずには済むが、
// 「残りの図種はどうなのか」は画面のどこにも出ないので、周が来るまで分からない。
//
// ここは 3 つの材料 —— 自分のフォルダの一覧・相手のフォルダの一覧・自分の図に書かれた
// @peek の控え —— を図種ごとに 1 行に畳むだけ。フォルダを読みに行くのも描くのも app.js。
//
// 図種ごとの状態は 5 つ。
//   recheck      … 控えはあるが相手に図が増えた (確かめ直す)
//   check        … 相手に図があり、控えがまだ無い (これから見る)
//   noted        … 控え済み。相手は今も 0 枚 (この周ですることは無い)
//   no-model     … 相手に 0 枚で控えもまだ無い (その場で控えを取れる)
//   mine-missing … 相手にはあるが自分にその図種が無い (取り込む前に起こす)
window.MA.kindMatrix = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _DK() { return window.MA.diagramKind; }
  function _PV() { return window.MA.peekVerdict; }
  function _DC() { return window.MA.domainCohort; }

  function order() {
    var DK = _DK();
    return (DK && DK.ORDER) ? DK.ORDER.slice() : ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];
  }

  function kindLabel(slug) {
    var DK = _DK();
    return (DK && DK.label) ? (DK.label(slug) || _s(slug)) : _s(slug);
  }

  function nameOf(e) { return (e && typeof e === 'object') ? _s(e.name) : _s(e); }

  function kindOf(e) {
    if (!e || typeof e !== 'object') return '';
    // 保存したときの控えがあればそれを採る (本文からの判定より確か)。
    return _s(e.savedKind) || _s(e.kind);
  }

  // 題材 (ドメイン)。名前の付け方は family-audit と同じ規則を借りる
  // (GUI と CLI で「同じ題材」の判定がずれない)。
  function subjectOf(name) {
    var DC = _DC();
    if (DC && DC.domainOf) return DC.domainOf(nameOf(name));
    return nameOf(name).split(/[\s_\-.]+/)[0].toLowerCase();
  }

  // 選べる題材の一覧。自分と相手の両方から集め、枚数の多い順 → 名前順。
  function subjects(mine, theirs) {
    var count = {};
    function add(list, w) {
      (list || []).forEach(function(e) {
        var s = subjectOf(e);
        if (!s) return;
        count[s] = (count[s] || 0) + w;
      });
    }
    add(mine, 1);
    add(theirs, 1);
    return Object.keys(count).sort(function(a, b) {
      if (count[b] !== count[a]) return count[b] - count[a];
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function _pick(list, subject, kind) {
    var want = _s(subject);
    return (list || []).filter(function(e) {
      if (kindOf(e) !== kind) return false;
      return want === '' || subjectOf(e) === want;
    }).map(nameOf);
  }

  // 自分の図に書かれた控え。相手のフォルダ (dir) についての行だけを見る。
  function _verdictFor(mine, subject, kind, dir) {
    var PV = _PV();
    if (!PV) return null;
    var found = null;
    (mine || []).forEach(function(e) {
      if (found || !e || typeof e !== 'object') return;
      if (subject && subjectOf(e) !== subject) return;
      var text = _s(e.text);
      if (text === '') return;
      var rec = PV.find(text, kind, dir || null);
      if (rec) found = rec;
    });
    return found;
  }

  var MARKS = {
    recheck: '👀要確認',
    check: '👀未確認',
    noted: '👀手本なし',
    'no-model': '手本なし（未控え）',
    'mine-missing': '自分に無し',
  };

  function _stateOf(theirCount, mineCount, rec) {
    var PV = _PV();
    if (theirCount > 0) {
      if (rec && PV && PV.isStale(rec, theirCount)) return 'recheck';
      if (mineCount === 0) return 'mine-missing';
      return 'check';
    }
    return rec ? 'noted' : 'no-model';
  }

  // scan — 題材 1 つぶんの 6 行。
  //   mine   … 自分のフォルダの entries ({name, kind, savedKind, text})
  //   theirs … 相手のフォルダの entries
  //   dir    … 相手のフォルダ (控えの突き合わせに使う)
  function scan(subject, mine, theirs, dir) {
    var want = _s(subject);
    var rows = order().map(function(kind) {
      var mineNames = _pick(mine, want, kind);
      var theirNames = _pick(theirs, want, kind);
      var rec = _verdictFor(mine, want, kind, dir);
      var state = _stateOf(theirNames.length, mineNames.length, rec);
      return {
        kind: kind,
        label: kindLabel(kind),
        mine: mineNames,
        theirs: theirNames,
        mineCount: mineNames.length,
        theirCount: theirNames.length,
        verdict: rec,
        state: state,
        mark: MARKS[state] || '',
        done: state === 'noted',
        todo: state === 'recheck' || state === 'check' || state === 'mine-missing',
      };
    });
    var counts = { recheck: 0, check: 0, noted: 0, 'no-model': 0, 'mine-missing': 0 };
    rows.forEach(function(r) { counts[r.state]++; });
    return { subject: want, dir: _s(dir), rows: rows, counts: counts,
             todo: rows.filter(function(r) { return r.todo; }).length };
  }

  // 見出しの 1 行。残りが何図種あるかを先に言う (周が来るまで分からない、を無くす)。
  function summary(sc) {
    if (!sc || !sc.rows.length) return '';
    var c = sc.counts;
    var parts = [];
    if (c.recheck) parts.push('要確認 ' + c.recheck);
    if (c.check) parts.push('未確認 ' + c.check);
    if (c['mine-missing']) parts.push('自分に無し ' + c['mine-missing']);
    if (c.noted) parts.push('控え済み ' + c.noted);
    if (c['no-model']) parts.push('手本なし ' + c['no-model']);
    var head = (sc.subject ? sc.subject.toUpperCase() : 'すべて') + ': '
      + sc.rows.length + ' 図種のうち ';
    return head + parts.join('・');
  }

  // 1 行の説明。押す前に「何が何枚あるか」を読ませる。
  function rowTitle(row, dir) {
    if (!row) return '';
    var who = _s(dir) || '相手';
    if (row.state === 'noted') {
      return who + ' に ' + row.label + '図は 0 枚と控えてあります（'
        + ((row.verdict && row.verdict.at) || '時刻不明') + ' 時点）。この周ですることはありません';
    }
    if (row.state === 'no-model') {
      return who + ' に ' + row.label + '図は 0 枚です。「対応不要（手本なし）」として控えられます';
    }
    if (row.state === 'recheck') {
      return who + ' の ' + row.label + '図が ' + row.theirCount + ' 枚に増えました（控えは '
        + ((row.verdict && row.verdict.count) || 0) + ' 枚の時点）。確かめ直してください';
    }
    if (row.state === 'mine-missing') {
      return who + ' に ' + row.label + '図が ' + row.theirCount + ' 枚ありますが、自分にはありません';
    }
    return who + ' の ' + row.label + '図 ' + row.theirCount + ' 枚（自分は ' + row.mineCount + ' 枚）';
  }

  // その行で最初に開く 1 枚。相手の図が無ければ開くものも無い。
  function openTarget(row) {
    return (row && row.theirs.length) ? row.theirs[0] : '';
  }

  // ── 部品をまたいだ表 (BLK-junior-20260914-1906-wish) ──────────────────
  // 題材を 1 つずつ選び直すと、担当している部品の数だけ 6 図種の確認を周回する
  // ことになる (GPIO で 6 回、UART / CAN / TIMER でまた 6 回ずつ)。縦に部品・
  // 横に図種の 1 枚にすれば、「次はどの部品のどの図種か」が選び直さずに読める。
  // 中身は scan() をそのまま並べるだけ —— 判定を 2 か所に書かない。

  // 表のセルは 1〜2 文字にする。言葉は行の title と凡例が持つ。
  var CELL_MARKS = {
    recheck: '👀!',
    check: '👀',
    noted: '✓',
    'no-model': '·',
    'mine-missing': '△',
  };

  function cellMark(row) {
    return (row && CELL_MARKS[row.state]) || '';
  }

  function _addCounts(into, from) {
    Object.keys(into).forEach(function(k) { into[k] += (from[k] || 0); });
    return into;
  }

  // scanAll — 部品 × 図種の表。残りの多い部品を上に出す (次に着手する順)。
  function scanAll(mine, theirs, dir) {
    var subs = subjects(mine, theirs);
    var rows = subs.map(function(sub) { return scan(sub, mine, theirs, dir); });
    rows.sort(function(a, b) {
      if (b.todo !== a.todo) return b.todo - a.todo;
      return a.subject < b.subject ? -1 : (a.subject > b.subject ? 1 : 0);
    });
    var counts = { recheck: 0, check: 0, noted: 0, 'no-model': 0, 'mine-missing': 0 };
    rows.forEach(function(r) { _addCounts(counts, r.counts); });
    return {
      dir: _s(dir),
      kinds: order().map(function(k) { return { kind: k, label: kindLabel(k) }; }),
      rows: rows,
      counts: counts,
      todo: rows.reduce(function(n, r) { return n + r.todo; }, 0),
      subjectsTodo: rows.filter(function(r) { return r.todo > 0; }).length,
    };
  }

  // 見出し。残り件数と、残っている部品の数を先に言う。
  function summaryAll(all) {
    if (!all || !all.rows.length) return '';
    var c = all.counts;
    var parts = [];
    if (c.recheck) parts.push('要確認 ' + c.recheck);
    if (c.check) parts.push('未確認 ' + c.check);
    if (c['mine-missing']) parts.push('自分に無し ' + c['mine-missing']);
    if (c.noted) parts.push('控え済み ' + c.noted);
    if (c['no-model']) parts.push('手本なし ' + c['no-model']);
    return all.rows.length + ' 部品 × ' + all.kinds.length + ' 図種: 残り ' + all.todo
      + ' 件 / ' + all.subjectsTodo + ' 部品（' + parts.join('・') + '）';
  }

  // 次に着手する 1 マス。要確認 → 未確認 → 自分に無し の順に、表の上から探す。
  function nextCell(all) {
    var ORDER = ['recheck', 'check', 'mine-missing'];
    for (var i = 0; i < ORDER.length; i++) {
      for (var r = 0; r < ((all && all.rows) || []).length; r++) {
        var sc = all.rows[r];
        for (var k = 0; k < sc.rows.length; k++) {
          if (sc.rows[k].state === ORDER[i]) {
            return { subject: sc.subject, kind: sc.rows[k].kind, row: sc.rows[k] };
          }
        }
      }
    }
    return null;
  }

  // 凡例。表のセルだけでは印の意味が読めない。
  function legend() {
    return ['👀! 要確認', '👀 未確認', '△ 自分に無し', '✓ 控え済み', '· 手本なし'].join(' / ');
  }

  // ── 相手の作成進捗 (BLK-junior-20260917-0423-wish) ────────────────────
  // 上の印は「自分が確かめたか」を言うもので、「相手がその図を作ってあるか」は
  // 言わない。取り込む場面の手順 1 は相手の図を開くところから始まるので、
  // 先に要るのは「相手にその 1 枚があるか」の 1 文字。無い組を目で探して初めて
  // 「まだ無い」と分かる、をここで無くす (判定は scanAll の theirCount だけ)。
  var MADE_MARKS = { made: '済', none: '未' };

  function madeState(row) {
    return (row && row.theirCount > 0) ? 'made' : 'none';
  }

  function madeMark(row) {
    return MADE_MARKS[madeState(row)];
  }

  // 1 マスの説明。押す前に「何が何枚あるか / 無いのか」を読ませる。
  function madeTitle(row, subject, dir) {
    if (!row) return '';
    var who = _s(dir) || '相手';
    var sub = _s(subject).toUpperCase();
    var head = who + ' の ' + sub + ' ' + row.label + '図';
    if (row.theirCount > 0) {
      return head + ' は ' + row.theirCount + ' 枚あります（' + row.theirs.join('・') + '）';
    }
    return head + 'はまだありません（自分は ' + row.mineCount + ' 枚）';
  }

  // 表ぜんぶの 済/未 の数。
  function madeCounts(all) {
    var made = 0, none = 0;
    ((all && all.rows) || []).forEach(function(sc) {
      sc.rows.forEach(function(r) {
        if (madeState(r) === 'made') made++; else none++;
      });
    });
    return { made: made, none: none, total: made + none };
  }

  // 見出しの 1 行。「相手がどこまで作ってあるか」を先に言い切る。
  function madeSummary(all, dir) {
    if (!all || !all.rows.length) return '';
    var c = madeCounts(all);
    return (_s(dir) || '相手') + ' の作りかけ: ' + all.rows.length + ' 部品 × '
      + all.kinds.length + ' 図種のうち 済 ' + c.made + ' / 未 ' + c.none;
  }

  // まだ無い 1 マス。表の上から、図種の並び順に探す
  // (「次に取り込めるものが無い」と分かれば、その場で起票に回れる)。
  function firstMissing(all) {
    var rows = (all && all.rows) || [];
    for (var r = 0; r < rows.length; r++) {
      for (var k = 0; k < rows[r].rows.length; k++) {
        if (madeState(rows[r].rows[k]) === 'none') {
          return {
            subject: rows[r].subject,
            kind: rows[r].rows[k].kind,
            label: rows[r].rows[k].label,
            row: rows[r].rows[k],
          };
        }
      }
    }
    return null;
  }

  // 未のマスを全部。起票の下書きに、どの組が無いかを並べて書ける。
  function missingCells(all) {
    var out = [];
    ((all && all.rows) || []).forEach(function(sc) {
      sc.rows.forEach(function(r) {
        if (madeState(r) === 'none') out.push({ subject: sc.subject, kind: r.kind, label: r.label });
      });
    });
    return out;
  }

  function madeLegend() {
    return '済 = 相手にその図がある / 未 = まだ無い（押せば読むだけで開きます）';
  }

  return {
    order: order,
    kindLabel: kindLabel,
    subjectOf: subjectOf,
    subjects: subjects,
    scan: scan,
    summary: summary,
    rowTitle: rowTitle,
    openTarget: openTarget,
    scanAll: scanAll,
    summaryAll: summaryAll,
    cellMark: cellMark,
    nextCell: nextCell,
    legend: legend,
    MADE_MARKS: MADE_MARKS,
    madeState: madeState,
    madeMark: madeMark,
    madeTitle: madeTitle,
    madeCounts: madeCounts,
    madeSummary: madeSummary,
    firstMissing: firstMissing,
    missingCells: missingCells,
    madeLegend: madeLegend,
    MARKS: MARKS,
    CELL_MARKS: CELL_MARKS,
  };
})();
