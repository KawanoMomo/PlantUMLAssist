'use strict';
window.MA = window.MA || {};

// kind-mismatch — 「そのファイルが名乗っている図種」と「本文が実際に描く図種」の
// 食い違いを機械的に言う。
//
// BLK-reviewer-20260914-1406-wish: `plantuml-usecase.puml` の中身が丸ごと
// `dma_transfer_sequence.puml` と同じになっている事故を見つけたのは、reviewer が
// 31 枚の DSL を 1 枚ずつ読んだ結果だった。GUI の一覧にも tools/audit.js にも
// 「名乗り vs 本文」を突き合わせる口が無く、複製・貼り間違いは全文を読むまで出ない。
//
// 名乗りは 2 つある:
//   name  — ファイル名に図種が書いてある (plantuml-usecase / driver_common_class)。
//           保存した人が明示した図種なので、食い違えば事故として赤で出す。
//   saved — 保存したときの図種の控え (_kinds.json)。saved-kind.js が書くとおり、
//           本文からの判定は「別図種と紛らわしい書き方」で普通に外れるので、
//           こちらの食い違いは赤にせず注記に留める (毎回出る雑音にしない)。
window.MA.kindMismatch = (function() {

  // 名前に書いてあれば図種の名乗りと見なす語と、その日本語。diagram-kind.js と同じ 6 種。
  // ここは一覧・CLI のどちらからも、他のモジュールが読み込まれていない状態で
  // 呼ばれる (監査は src/core を選んで読む) ので、名前と図種の対応は自前で持つ。
  var LABELS = {
    sequence: 'シーケンス',
    state: '状態遷移',
    'class': 'クラス',
    usecase: 'ユースケース',
    component: 'コンポーネント',
    activity: 'アクティビティ',
  };
  var SLUGS = ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];

  function _s(v) { return v == null ? '' : String(v); }

  function _label(slug) { return LABELS[_s(slug)] || ''; }

  // 'plantuml-usecase.puml' → ['plantuml', 'usecase']。
  function _segments(name) {
    var n = _s(name).toLowerCase().replace(/\.(puml|txt|wsd|iuml)$/, '');
    return n.split(/[^a-z0-9]+/).filter(Boolean);
  }

  // ファイル名からの名乗り。2 種類以上を名乗っている名前 (gpio_state_sequence) は
  // どちらとも言えないので名乗り無しにする (推測で赤を出さない)。
  function nameKind(name) {
    var segs = _segments(name);
    var found = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      // 'use case' / 'use_case' のように割れている書き方も 1 つの名乗りとして読む。
      if (s === 'use' && segs[i + 1] === 'case') s = 'usecase';
      if (SLUGS.indexOf(s) >= 0 && found.indexOf(s) < 0) found.push(s);
    }
    return found.length === 1 ? found[0] : '';
  }

  // 本文から図種を当てる。server の dsl_kind / workspace.detectType と同じ見方だが、
  // 判定はここに持つ —— 一覧は server の判定を受け取り、CLI は server を通らず、
  // 開いている図の判定 (workspace) は「今の図種」に引きずられる。3 つの入口で
  // 同じ答えを出すために、名乗りの照合に使う判定は 1 か所に閉じる。
  // 先に見るのは他の図種と紛れない書き方 (状態・クラス・アクティビティ)。
  function detectKind(dsl) {
    var t = _s(dsl);
    if (!t) return '';
    if (/(^|\n)\s*\[\*\]\s*-->/.test(t) || /(^|\n)\s*state\s+/.test(t)) return 'state';
    if (/(^|\n)\s*(class|interface|abstract\s+class|enum)\s+/.test(t)) return 'class';
    if (/(^|\n)\s*start\s*$/m.test(t) || /(^|\n)\s*:.*;\s*$/m.test(t)) return 'activity';
    if (/(^|\n)\s*usecase\s+/.test(t)) return 'usecase';
    // メッセージ (`A -> B : x`) と participant 宣言はシーケンスにしかない。
    if (/(^|\n)\s*(participant|boundary|control|entity|database)\s+/.test(t)
      || /-+>+\s*[^\s:]+\s*:/.test(t)) return 'sequence';
    // actor + 丸括弧のユースケースは、メッセージが無いときだけユースケースと読む。
    if (/(^|\n)\s*actor\s+/.test(t) && /\([^)]*\)/.test(t)) return 'usecase';
    if (/(^|\n)\s*(component\s+|\[[^\]]+\]\s*(-|<))/.test(t)) return 'component';
    return '';
  }

  // 本文が実際に描く図種。server が判定済みなら (一覧の entry.kind) それを使い、
  // 無ければ本文から当てる (CLI は server を通らないのでこちら)。
  function bodyKind(entry) {
    var e = entry || {};
    var k = _s(e.kind);
    if (k && _label(k)) return k;
    return detectKind(e.dsl);
  }

  // 名乗り。ファイル名 > 控え (ファイル名は人が付けた明示、控えは保存の副産物)。
  function declaredOf(entry) {
    var e = entry || {};
    var byName = nameKind(e.name);
    if (byName) return { slug: byName, source: 'name' };
    var saved = _s(e.savedKind);
    if (saved && LABELS[saved]) return { slug: saved, source: 'saved' };
    return { slug: '', source: '' };
  }

  // 1 枚分の行。declared / actual のどちらかが空なら「照合できない」= 食い違いにしない
  // (名乗っていない図に名乗りの誤りは無い)。
  function rowOf(entry) {
    var e = entry || {};
    var name = _s(e.name);
    var dec = declaredOf(e);
    var body = bodyKind(e);
    var row = {
      name: name,
      declared: dec.slug,
      declaredSource: dec.source,
      declaredLabel: _label(dec.slug),
      actual: body,
      actualLabel: _label(body),
      comparable: !!(dec.slug && body),
      mismatch: false,
      severity: 'ok',
      text: '',
    };
    if (!row.comparable) {
      row.severity = 'unknown';
      row.text = name + ': ' + (dec.slug ? '本文から図種を当てられません' : '名前に図種がありません');
      return row;
    }
    if (dec.slug === body) {
      row.text = name + ': ' + row.declaredLabel + '図（名乗りどおり）';
      return row;
    }
    row.mismatch = true;
    row.severity = dec.source === 'name' ? 'mismatch' : 'note';
    row.text = name + ': 名乗りは' + row.declaredLabel + '図、本文は' + row.actualLabel + '図'
      + (dec.source === 'saved' ? '（名乗りは保存時の控え）' : '');
    return row;
  }

  function rows(entries) {
    var list = entries || [];
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(rowOf(list[i]));
    return out;
  }

  // 赤で出すのは名前の名乗りと食い違った図だけ。控えとの食い違いは notes へ。
  function mismatches(entries) {
    return rows(entries).filter(function(r) { return r.severity === 'mismatch'; });
  }

  function notes(entries) {
    return rows(entries).filter(function(r) { return r.severity === 'note'; });
  }

  // 一覧の下に出す 1 行。0 件でも「何枚を照合してのゼロか」を書く
  // (照合できていないだけの 0 件と区別が付かないと、この行は読む意味が無い)。
  function summaryLine(entries) {
    var all = rows(entries);
    var bad = all.filter(function(r) { return r.severity === 'mismatch'; });
    var note = all.filter(function(r) { return r.severity === 'note'; });
    var checked = all.filter(function(r) { return r.comparable; }).length;
    var head = bad.length
      ? '図種ずれ: ' + bad.length + ' 件（' + bad.map(function(r) { return r.name; }).join(', ') + '）'
      : '図種ずれ: なし';
    var tail = '（' + all.length + ' 枚中 ' + checked + ' 枚を照合）';
    if (note.length) tail += ' 控えとの差 ' + note.length + ' 件';
    return head + ' ' + tail;
  }

  // 行に付ける印。食い違った図だけに付く (全行に付く印は印でなくなる)。
  function badge(entry) {
    var r = rowOf(entry);
    if (!r.mismatch) return null;
    return {
      slug: r.actual,
      mark: '⚠',
      severity: r.severity,
      label: '名乗り ' + r.declaredLabel + ' / 本文 ' + r.actualLabel,
      title: r.text + '。中身が別の図で塗り潰されていないか確かめてください',
    };
  }

  // CLI (tools/audit.js) 用。docs は [{name, dsl}]。
  function audit(docs) {
    var list = docs || [];
    var all = rows(list);
    var bad = all.filter(function(r) { return r.severity === 'mismatch'; });
    var note = all.filter(function(r) { return r.severity === 'note'; });
    return {
      files: all.length,
      checked: all.filter(function(r) { return r.comparable; }).length,
      mismatched: bad.length,
      notes: note.length,
      mismatchedNames: bad.map(function(r) { return r.name; }),
      rows: all,
      summaryLine: summaryLine(list),
    };
  }

  return {
    LABELS: LABELS,
    SLUGS: SLUGS,
    nameKind: nameKind,
    detectKind: detectKind,
    bodyKind: bodyKind,
    declaredOf: declaredOf,
    rowOf: rowOf,
    rows: rows,
    mismatches: mismatches,
    notes: notes,
    summaryLine: summaryLine,
    badge: badge,
    audit: audit,
  };
})();
