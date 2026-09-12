'use strict';
window.MA = window.MA || {};

// part-starter — 新しい部品を起こす作業を、図種ごとの 6 回ではなく 1 部品ぶんの
// 1 回にする。
//
// BLK-junior-20260913-0206-wish: 手本がまったく無い部品 (TIMER) を起こす周では、
// シーケンス → 状態遷移 → クラス → アクティビティ → コンポーネント → ユースケースの
// 6 図種を、その都度別のタブを新規に開いて手順 1〜7 をやり直していた。下書きを作る
// 機能は図種ごとに別々 (定石カタログ・依存チェック・driver-usecase-starter …) なので、
// 図種を移るたびに「今回はどの機能で下書きするか」を思い出し、部品名を打ち直すことに
// なる。打ち直すぶんだけ図種を跨いだ命名が割れる (Timer_Driver / TIMER_Driver)。
//
// ここは部品名 1 語から 6 図ぶんの下書きをまとめて組む。名前の作り方は 1 か所
// (identifiers) に置き、6 図がそこから名前を引く。図種ごとに綴りが割れる余地を
// 残さないのがこのモジュールの主目的で、「6 回押すのを 1 回にする」のはその結果。
//
// コンポーネント図とユースケース図は既にある下書き機能 (component-starter /
// driver-usecase-starter) をそのまま呼ぶ。同じ図の組み立て規則を 2 つ持たない。
// 部品名の正規化も component-starter のものを使う (「TIMER ドライバ」「timer_drv.puml」
// のような打ち方を、ここだけ別の受け方にしない)。
//
// DOM にも localStorage にも触らない。出来上がりは下書きで、要らない図は
// そのタブを閉じれば済む。
window.MA.partStarter = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _cs() { return window.MA.componentStarter; }
  function _us() { return window.MA.driverUsecaseStarter; }

  function normalizeSubject(subject) {
    var cs = _cs();
    if (cs && cs.normalizeSubject) return cs.normalizeSubject(subject);
    return _s(subject).trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function displaySubject(subject) {
    var cs = _cs();
    if (cs && cs.displaySubject) return cs.displaySubject(subject);
    return normalizeSubject(subject).replace(/_+/g, ' ');
  }

  // ── 名前 ──────────────────────────────────────────────────────────────
  // 6 図が引く名前はここだけで作る。動作名はユースケース図の骨格
  // (初期化・設定・読み取り・書き込み・割り込み設定・割り込み通知) と同じ並びに
  // して、ユースケースとシーケンスとクラスで動作の呼び方がずれないようにする。
  var OPS = [
    { key: 'init',      id: 'Init',      label: 'を初期化する' },
    { key: 'config',    id: 'Config',    label: 'のピンモードを設定する' },
    { key: 'read',      id: 'Read',      label: 'の値を読み取る' },
    { key: 'write',     id: 'Write',     label: 'に値を書き込む' },
    { key: 'irqSetup',  id: 'IrqSetup',  label: 'の割り込みを設定する' },
    { key: 'irqNotify', id: 'IrqNotify', label: 'の割り込みを通知する' },
  ];

  // 状態遷移図の状態。ドライバは「未初期化 → 待機 → 実行中」で、割り込みは
  // 待機から入って待機へ戻る。異常は 1 つだけ持つ (種類を増やすのは実物を見てから)。
  var STATES = [
    { key: 'uninit', id: 'Uninit', label: '未初期化' },
    { key: 'idle',   id: 'Idle',   label: '待機' },
    { key: 'busy',   id: 'Busy',   label: '実行中' },
    { key: 'error',  id: 'Error',  label: '異常' },
  ];

  function identifiers(subject) {
    var id = normalizeSubject(subject);
    if (!id) return null;
    var cs = _cs();
    var body = cs && cs.bodyName ? cs.bodyName(subject) : (id + '_Driver');
    var ops = {};
    OPS.forEach(function(o) { ops[o.key] = id + '_' + o.id; });
    var states = {};
    STATES.forEach(function(s) { states[s.key] = s.id; });
    return {
      subject: id,
      display: displaySubject(subject),
      body: body,
      hw: id + '_Hw',            // レジスタ側 (相手がいないと図にならない)
      caller: 'Dev',             // 呼び手。ユースケース図の Developer と同じ人
      ops: ops,
      opList: OPS.map(function(o) { return { key: o.key, id: ops[o.key], label: o.label }; }),
      states: states,
      stateList: STATES.map(function(s) { return { key: s.key, id: s.id, label: s.label }; }),
    };
  }

  // ── 6 図 ──────────────────────────────────────────────────────────────
  // 並びは台本の周り方 (シーケンスから起こして、最後にユースケースで俯瞰する)。
  function _seqDsl(n) {
    return ['@startuml', 'title ' + n.display + ' ドライバ シーケンス',
      'actor ' + n.caller,
      'participant "' + n.display + ' ドライバ" as ' + n.body,
      'participant "' + n.display + ' レジスタ" as ' + n.hw,
      n.caller + ' -> ' + n.body + ' : ' + n.ops.init + '()',
      n.body + ' -> ' + n.hw + ' : reset()',
      n.hw + ' --> ' + n.body + ' : E_OK',
      n.body + ' --> ' + n.caller + ' : E_OK',
      n.caller + ' -> ' + n.body + ' : ' + n.ops.config + '(mode)',
      n.body + ' --> ' + n.caller + ' : E_OK',
      n.caller + ' -> ' + n.body + ' : ' + n.ops.read + '()',
      n.body + ' -> ' + n.hw + ' : read()',
      n.hw + ' --> ' + n.body + ' : value',
      n.body + ' --> ' + n.caller + ' : value',
      n.hw + ' -> ' + n.body + ' : irq',
      n.body + ' --> ' + n.caller + ' : ' + n.ops.irqNotify + '()',
      '@enduml'].join('\n');
  }

  function _stateDsl(n) {
    var S = n.states;
    // 状態は本体の名前の合成状態に入れる。誰の状態機械かを図の中の名前で言えるように
    // する (アクティビティ図の partition と同じ考え方)。
    return ['@startuml', 'title ' + n.display + ' ドライバ 状態遷移',
      'state ' + n.body + ' {',
      '  state "' + n.stateList[0].label + '" as ' + S.uninit,
      '  state "' + n.stateList[1].label + '" as ' + S.idle,
      '  state "' + n.stateList[2].label + '" as ' + S.busy,
      '  state "' + n.stateList[3].label + '" as ' + S.error,
      '  [*] --> ' + S.uninit,
      '  ' + S.uninit + ' --> ' + S.idle + ' : ' + n.ops.init + ' / E_OK',
      '  ' + S.idle + ' --> ' + S.idle + ' : ' + n.ops.config,
      '  ' + S.idle + ' --> ' + S.busy + ' : ' + n.ops.read,
      '  ' + S.idle + ' --> ' + S.busy + ' : ' + n.ops.write,
      '  ' + S.busy + ' --> ' + S.idle + ' : done',
      '  ' + S.idle + ' --> ' + S.idle + ' : ' + n.ops.irqSetup,
      '  ' + S.idle + ' --> ' + S.idle + ' : ' + n.ops.irqNotify,
      '  ' + S.busy + ' --> ' + S.error + ' : timeout',
      '  ' + S.error + ' --> ' + S.uninit + ' : ' + n.ops.init,
      '}',
      '@enduml'].join('\n');
  }

  function _classDsl(n) {
    var out = ['@startuml', 'title ' + n.display + ' ドライバ クラス',
      'class ' + n.body + ' {'];
    n.opList.forEach(function(o) { out.push('  +' + o.id + '() : Std_ReturnType'); });
    out.push('}');
    out.push('class ' + n.hw + ' {');
    out.push('  +read() : uint32');
    out.push('  +write(value : uint32) : void');
    out.push('}');
    out.push(n.body + ' --> ' + n.hw + ' : uses');
    out.push('@enduml');
    return out.join('\n');
  }

  function _activityDsl(n) {
    // 工程を本体の名前の箱に入れる。どの部品の流れかを図の中の名前で言えるように
    // する (title だけだと、図を切り出して貼ったときに持ち主が消える)。
    return ['@startuml', 'title ' + n.display + ' ドライバ 初期化フロー',
      'start',
      'partition ' + n.body + ' {',
      '  :' + n.ops.init + '();',
      '  if (レジスタは応答したか?) then (はい)',
      '    :' + n.ops.config + '();',
      '    :' + n.ops.irqSetup + '();',
      '  else (いいえ)',
      '    :E_NOT_OK を返す;',
      '    stop',
      '  endif',
      '  :' + n.ops.read + '();',
      '}',
      'stop',
      '@enduml'].join('\n');
  }

  // key は状態遷移・クラス … の並び順で固定する。画面はこの順で 6 行出し、
  // タブもこの順で開く (押すたびに並びが変わると、どれが開いたか数え直しになる)。
  var KINDS = [
    { key: 'sequence',  type: 'plantuml-sequence',  label: 'シーケンス',     suffix: '_sequence' },
    { key: 'state',     type: 'plantuml-state',     label: '状態遷移',       suffix: '_state' },
    { key: 'class',     type: 'plantuml-class',     label: 'クラス',         suffix: '_class' },
    { key: 'activity',  type: 'plantuml-activity',  label: 'アクティビティ', suffix: '_activity' },
    { key: 'component', type: 'plantuml-component', label: 'コンポーネント', suffix: '_component' },
    { key: 'usecase',   type: 'plantuml-usecase',   label: 'ユースケース',   suffix: '_usecase' },
  ];

  function kinds() { return KINDS.map(function(k) { return { key: k.key, type: k.type, label: k.label }; }); }

  function docName(subject, kindKey) {
    var id = normalizeSubject(subject);
    if (!id) return '';
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].key === kindKey) return id.toLowerCase() + KINDS[i].suffix;
    }
    return '';
  }

  function _dslFor(kindKey, n, subject, docs) {
    if (kindKey === 'sequence') return _seqDsl(n);
    if (kindKey === 'state') return _stateDsl(n);
    if (kindKey === 'class') return _classDsl(n);
    if (kindKey === 'activity') return _activityDsl(n);
    if (kindKey === 'component') {
      var cs = _cs();
      return cs ? cs.dsl(subject, docs || []) : '';
    }
    if (kindKey === 'usecase') {
      var us = _us();
      return us ? us.dsl(subject) : '';
    }
    return '';
  }

  // 既に開いている / 保存してある同じ図種の図。「まだ無い」と言い切ってから
  // 6 枚作らせないための確認で、既にある図種は既定で外して作る
  // (書きかけを別タブで二重に持つと、どちらを直したか分からなくなる)。
  function _existing(kind, n, docs) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || _s(d.diagramType) !== kind.type) return;
      var base = _s(d.name).toLowerCase().replace(/\.(puml|plantuml|uml|txt)$/i, '');
      if (base.indexOf(n.subject.toLowerCase()) < 0) return;
      out.push(d.name);
    });
    return out;
  }

  // plan(subject, docs) — 何が作られるかを、開く前の形で返す。
  function plan(subject, docs) {
    var n = identifiers(subject);
    if (!n) return null;
    var sheets = KINDS.map(function(k) {
      var had = _existing(k, n, docs);
      return {
        key: k.key,
        type: k.type,
        label: k.label,
        name: docName(subject, k.key),
        dsl: _dslFor(k.key, n, subject, docs),
        existing: had,
      };
    });
    return {
      subject: n.subject,
      display: n.display,
      body: n.body,
      names: n,
      sheets: sheets,
      newCount: sheets.filter(function(s) { return !s.existing.length; }).length,
      existingCount: sheets.filter(function(s) { return s.existing.length; }).length,
    };
  }

  // 押す前に「何枚できて、何の名前で揃うか」が 1 行で読める。
  function summary(p) {
    if (!p) return '部品名を入れてください (例: TIMER)';
    var head = p.body + ' の名前で ' + p.newCount + ' 図種の下書きを開きます';
    if (!p.existingCount) return head;
    return head + ' (' + p.existingCount + ' 図種は既にあるので開きません)';
  }

  // 選んだ図種だけを作る、を画面から決められるようにする。
  // keys が空 (未指定) なら「まだ無い図種」を既定にする。
  function selected(p, keys) {
    if (!p) return [];
    var want = Array.isArray(keys) ? keys : null;
    return p.sheets.filter(function(s) {
      return want ? want.indexOf(s.key) >= 0 : !s.existing.length;
    });
  }

  return {
    OPS: OPS,
    STATES: STATES,
    normalizeSubject: normalizeSubject,
    displaySubject: displaySubject,
    identifiers: identifiers,
    kinds: kinds,
    docName: docName,
    plan: plan,
    summary: summary,
    selected: selected,
  };
})();
