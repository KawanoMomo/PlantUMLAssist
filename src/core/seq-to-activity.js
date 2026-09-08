'use strict';
window.MA = window.MA || {};

// seq-to-activity — シーケンス図の呼び出し列から、アクティビティ図のたたき台を起こす。
//
// BLK-junior-20260909-0203-wish: 「設計書に貼る資料」でアクティビティ図を描くとき、
// 処理順 (EnableClock → WriteConfig → EnableIrq → InitDone) は先輩の
// gpio_init_sequence.puml に既にメッセージとして書かれている。それでも
// アクティビティ図側にはそれを取り込む口が無く、シーケンス図を見ながら同じ順序の
// Action を一覧欄に打ち直していた。図種が違うだけで、同じ情報を二度書いている。
//
// アクティビティ図は「1 つの部品が何をするか」を順に並べた図なので、
// シーケンス図から起こすときの単位は **その部品が送るメッセージ** になる。
// 受け取ったメッセージ (Gpio_Init()) や返ってきた応答 (Ack) は、その部品の
// 「やること」ではないので入れない。GPIO で言えば
//   App -> Gpio_Driver : Gpio_Init()      ← 受け (入れない)
//   Gpio_Driver -> ClockCtrl : EnableClock()  ← 送り (入れる)
//   IRQCtrl --> Gpio_Driver : Ack         ← 受け (入れない)
//   Gpio_Driver --> App : InitDone        ← 送り (入れる)
// で、ちょうど利用者が手で打ち直した 4 個になる。
//
// DOM も fetch も触らない (行の読み取りと組み立てだけ)。
window.MA.seqToActivity = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // シーケンス図のメッセージ行。実線・点線・片矢印を同じ 1 本として読む。
  var MSG_RE = /^\s*("[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(-+>+|<-+|-+->+|\.+>|<\.+)\s*("[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?::\s*(.*))?$/;

  function _name(tok) { return _s(tok).replace(/^"|"$/g, '').trim(); }

  // 1 行 → { from, to, label }。矢印が左向き (<-) なら送り手は右側。
  function message(line) {
    var raw = _s(line);
    if (/^\s*'/.test(raw) || /^\s*@/.test(raw) || /^\s*note\b/.test(raw)) return null;
    var m = raw.match(MSG_RE);
    if (!m) return null;
    var left = _name(m[1]);
    var right = _name(m[3]);
    var back = m[2].indexOf('<') === 0;
    var label = _s(m[4]).trim();
    if (!left || !right) return null;
    return {
      from: back ? right : left,
      to: back ? left : right,
      label: label,
    };
  }

  function messages(dsl) {
    var out = [];
    _s(dsl).split('\n').forEach(function(line) {
      var m = message(line);
      if (m) out.push(m);
    });
    return out;
  }

  // 送り手ごとの本数。既定の対象を「いちばん多く送っている部品」にするため
  // (図の主役はたいていそれで、利用者が選び直す回数が減る)。
  function participants(dsl) {
    var order = [];
    var count = {};
    messages(dsl).forEach(function(m) {
      if (!m.label) return;
      if (count[m.from] == null) { count[m.from] = 0; order.push(m.from); }
      count[m.from] += 1;
    });
    return order.map(function(n, i) { return { name: n, sends: count[n], order: i }; })
      .sort(function(a, b) { return b.sends - a.sends || a.order - b.order; });
  }

  function mainParticipant(dsl) {
    var p = participants(dsl);
    return p.length ? p[0].name : '';
  }

  // 対象が送るメッセージのラベルを順に。`Gpio_Init()` の括弧は落とす
  // (アクティビティ図の Action は処理名で、呼び出し記法ではないため)。
  // 同じ処理を 2 回呼ぶ図もあるので、重複はそのまま残す (順序が意味を持つ)。
  function actions(dsl, name) {
    var who = _s(name);
    return messages(dsl).filter(function(m) {
      return m.label && (!who || m.from === who);
    }).map(function(m) {
      return m.label.replace(/\(\s*\)$/, '').trim();
    }).filter(function(l) { return l; });
  }

  // アクティビティ図 1 枚。一括欄ではなくタブごと起こすときに使う。
  function draft(dsl, name, title) {
    var labels = actions(dsl, name || mainParticipant(dsl));
    var out = ['@startuml'];
    if (_s(title).trim()) out.push('title ' + _s(title).trim());
    out.push('start');
    labels.forEach(function(l) { out.push(':' + l + ';'); });
    out.push('stop');
    out.push('@enduml');
    return out.join('\n');
  }

  // 起こした図の名前。「GPIO_Init_Sequence」→「GPIO_Init_Activity」。
  // 元の図の題が分かる名前にしないと、タブが増えたときに元が辿れない。
  function draftName(docName, who) {
    var base = _s(docName).replace(/\.puml$/i, '');
    if (/sequence/i.test(base)) return base.replace(/sequence/i, 'Activity');
    return (base || _s(who) || 'activity') + '_activity';
  }

  // 一括欄に出す候補。開いているシーケンス図 × 送り手ごとに 1 組。
  // docs: workspace.list() の形 ([{ id, name, dsl, diagramType }])。
  function candidates(docs, exceptId) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || d.diagramType !== 'plantuml-sequence') return;
      if (exceptId != null && d.id === exceptId) return;
      participants(d.dsl).forEach(function(p) {
        var labels = actions(d.dsl, p.name);
        if (!labels.length) return;
        out.push({
          docId: d.id, docName: _s(d.name), participant: p.name,
          labels: labels, count: labels.length,
        });
      });
    });
    return out;
  }

  return {
    message: message,
    messages: messages,
    participants: participants,
    mainParticipant: mainParticipant,
    actions: actions,
    draft: draft,
    draftName: draftName,
    candidates: candidates,
  };
})();
