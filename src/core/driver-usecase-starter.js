'use strict';
window.MA = window.MA || {};

// driver-usecase-starter — 題材名 1 語から、ドライバのユースケース図の下書きを作る。
//
// BLK-junior-20260909-0403: ユースケース図は「手本になる図が 1 枚も無い」ところから
// 始まる場面がある (自分のフォルダにも先輩のフォルダにも実在しない)。テンプレート
// からの新規作成・骨格流用・題材プリセットはどれも「元の図」を要求するので、この
// 場面では使えず、新規タブのサンプル (actor User / usecase Login) を全選択して
// アクター・ユースケース・関連の 15 行を一括入力欄に打ち直すことになる (実測 280 打鍵)。
//
// ドライバのユースケース図は題材が替わっても骨格が同じ — 使うのは開発者と RTOS、
// することは初期化・設定・読み取り・書き込み・割り込み設定・割り込み通知 — なので、
// その骨格を持っておけば打つのは題材名 (GPIO / UART / CAN) の 1 語で済む。
//
// ここが持つのは骨格と DSL の組み立てだけ。DOM にも localStorage にも触らない。
// 出来上がりは下書きであり、要らないユースケースは普通に消して使う。
window.MA.driverUsecaseStarter = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 題材名。識別子の頭に置くので、英数字と _ 以外は落とす。
  // 「GPIO ドライバ」「gpio_drv.puml」のような打ち方もそのまま受ける。
  function normalizeSubject(subject) {
    var s = _s(subject).trim();
    s = s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
    s = s.replace(/[ 　]*(?:ドライバ|driver|drv)[ 　]*$/i, '');
    s = s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return s;
  }

  // 表示名に使う綴り。識別子は Subject_Init のように連結するが、
  // ラベルは打った綴りをそのまま見せる (GPIO は GPIO のまま出す)。
  function displaySubject(subject) {
    var n = normalizeSubject(subject);
    return n.replace(/_+/g, ' ');
  }

  var ACTORS = [
    { key: 'dev',  id: 'Developer', label: '開発者' },
    { key: 'rtos', id: 'RTOS',      label: 'RTOS' },
  ];

  // ドライバのユースケース。id は題材名を頭に付けて一意にする。
  var USECASES = [
    { key: 'init',      id: 'Init',      label: 'を初期化する' },
    { key: 'config',    id: 'Config',    label: 'のピンモードを設定する' },
    { key: 'read',      id: 'Read',      label: 'の値を読み取る' },
    { key: 'write',     id: 'Write',     label: 'に値を書き込む' },
    { key: 'irqSetup',  id: 'IrqSetup',  label: 'の割り込みを設定する' },
    { key: 'irqNotify', id: 'IrqNotify', label: 'の割り込みを通知する' },
  ];

  var RELATIONS = [
    { from: 'dev',  to: 'init',      kind: 'association' },
    { from: 'dev',  to: 'config',    kind: 'association' },
    { from: 'dev',  to: 'read',      kind: 'association' },
    { from: 'dev',  to: 'write',     kind: 'association' },
    { from: 'dev',  to: 'irqSetup',  kind: 'association' },
    { from: 'rtos', to: 'irqNotify', kind: 'association' },
    // 割り込み通知は「割り込みを設定してあるときだけ起きる」ので extend。
    { from: 'irqNotify', to: 'irqSetup', kind: 'extend' },
  ];

  // plan(subject) — 何が作られるかを、DSL にする前の形で返す。
  // 画面で「アクター 2 / ユースケース 6 / 関連 7」と見せるためのもの。
  function plan(subject) {
    var id = normalizeSubject(subject);
    if (!id) return null;
    var disp = displaySubject(subject);
    var byKey = {};
    var actors = ACTORS.map(function(a) {
      var e = { key: a.key, id: a.id, label: a.label };
      byKey[a.key] = e;
      return e;
    });
    var usecases = USECASES.map(function(u) {
      var e = { key: u.key, id: id + '_' + u.id, label: disp + ' ' + u.label };
      byKey[u.key] = e;
      return e;
    });
    var relations = RELATIONS.map(function(r) {
      return { kind: r.kind, from: byKey[r.from].id, to: byKey[r.to].id };
    });
    return { subject: id, display: disp, actors: actors, usecases: usecases, relations: relations };
  }

  function summary(p) {
    if (!p) return '題材名を入れてください';
    return 'アクター ' + p.actors.length + ' / ユースケース ' + p.usecases.length
      + ' / 関連 ' + p.relations.length + ' 本の下書きを作ります';
  }

  // 新しい図の名前の下書き。保存名にそのまま使える形にする。
  function docName(subject) {
    var id = normalizeSubject(subject);
    return id ? id.toLowerCase() + '_usecase' : '';
  }

  function _relLine(r) {
    if (r.kind === 'extend') return r.from + ' ..> ' + r.to + ' : <<extend>>';
    if (r.kind === 'include') return r.from + ' ..> ' + r.to + ' : <<include>>';
    return r.from + ' --> ' + r.to;
  }

  // dsl(subject) — 下書きの DSL。左→右で読ませる (アクターが左、ユースケースが右)。
  function dsl(subject) {
    var p = plan(subject);
    if (!p) return '';
    var out = ['@startuml', 'left to right direction', 'title ' + p.display + ' ドライバ'];
    p.actors.forEach(function(a) { out.push('actor ' + a.id + ' as "' + a.label + '"'); });
    out.push('rectangle "' + p.display + ' Driver" {');
    p.usecases.forEach(function(u) { out.push('  usecase ' + u.id + ' as "' + u.label + '"'); });
    out.push('}');
    p.relations.forEach(function(r) { out.push(_relLine(r)); });
    out.push('@enduml');
    return out.join('\n');
  }

  return {
    normalizeSubject: normalizeSubject,
    displaySubject: displaySubject,
    plan: plan,
    summary: summary,
    docName: docName,
    dsl: dsl,
  };
})();
