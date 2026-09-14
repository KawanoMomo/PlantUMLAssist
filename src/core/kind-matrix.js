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

  return {
    order: order,
    kindLabel: kindLabel,
    subjectOf: subjectOf,
    subjects: subjects,
    scan: scan,
    summary: summary,
    rowTitle: rowTitle,
    openTarget: openTarget,
    MARKS: MARKS,
  };
})();
