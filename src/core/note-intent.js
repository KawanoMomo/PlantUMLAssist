'use strict';
window.MA = window.MA || {};

// note-intent — 「呼び先をクラス図に足すか、意図的な省略である旨を明記するか」の
// 後者を、指摘の行から当てられる形にする。
//
// BLK-primary-20260915-0007-friction: reviewer の依頼2 は「クラス図への追加、または
// irq_init_sequence.puml の note のように意図的省略である旨を明記してほしい」という
// 二択で来る。前者 (クラス追加 / メソッド追加) は [適用] 1 押しで当たるのに、後者を
// 選ぶと primary は図を開き、#editor の末尾へカーソルを運び、
// `note top of ClockCtrl : ...(reviewer依頼2への回答)` を全文タイプしていた
// (実測 keys=124)。同じ文面を irq で一度打っていても、対象クラスを変えるたびに
// 打ち直すしかない。
//
// 指摘文は「どのクラスのどのメソッドか」を `ClockCtrl.EnableClock()` の形で
// 名指ししている。名指しされているものを機械が読めば、note の本文は組み立てられる。
//
// ここは文字列だけを持つ (どの図に書くか・保存は app.js 側)。書き込み先を
// 「クラス図にそのクラスが宣言されている図」に限るのは、宣言の無い相手に
// `note top of X` を書くと PlantUML が描画ごと落ちるため — その場合は
// 先に [クラス追加] を当ててもらう (既にある操作へ送る)。
window.MA.noteIntent = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // 指摘文が二択のうち「明記する」側を差し出しているか。
  // 「意図」だけでは取らない (指摘文のどこにでも出る語)。
  var OFFER_RE = /意図[^\n]{0,12}(?:省略|除外)[^\n]{0,12}(?:明記|明示|書)|意図[^\n]{0,4}(?:を)?(?:明記|明示)|省略[^\n]{0,8}(?:である旨|の旨)[^\n]{0,8}(?:明記|明示)/;

  function offered(text) { return OFFER_RE.test(_s(text)); }

  // `ClockCtrl.EnableClock()` / `NVIC.SetPriority` / ClockCtrl.EnableClock。
  // バッククォートの有無は問わないが、クラス名は大文字始まりに限る
  // (`tools/audit.js -p primary` のようなパスやオプションを拾わないため)。
  var PAIR_RE = /\b([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?/g;

  // 拾った組をクラスごとにまとめる。並びは指摘文に出てきた順
  // (reviewer が並べた順のまま出すと、指摘と見比べる手が要らない)。
  function targets(text) {
    var s = _s(text);
    var out = [];
    var byClass = {};
    var m;
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(s))) {
      var cls = m[1];
      var method = m[2];
      // `foo.puml` `diagram1.svg` のようなファイル名は組ではない。
      if (/^(puml|pu|plantuml|svg|png|md|js|json|html)$/i.test(method)) continue;
      if (!byClass[cls]) {
        byClass[cls] = { cls: cls, methods: [] };
        out.push(byClass[cls]);
      }
      if (byClass[cls].methods.indexOf(method) < 0) byClass[cls].methods.push(method);
    }
    return out;
  }

  // note の本文。primary が手で打っていた文面と同じことを言う
  // (「意図して省略している」「誰のどの依頼への答えか」)。
  function bodyFor(target, opts) {
    var o = opts || {};
    var t = target || {};
    var methods = (t.methods || []).map(function(n) { return n + '()'; }).join('・');
    var head = methods
      ? methods + ' の呼び先はクラス図に置かず、意図して省略しています'
      : '呼び先はクラス図に置かず、意図して省略しています';
    var label = _s(o.heading) || '';
    return label ? head + '（' + label + 'への回答）' : head;
  }

  // 書き込む 1 行。note-block と同じ書式に寄せる (読む側の書式を増やさない)。
  function lineFor(target, opts) {
    var NB = window.MA.noteBlock;
    var cls = _s(target && target.cls);
    var body = bodyFor(target, opts);
    if (NB && NB.format) return NB.format('top', cls, body)[0];
    return 'note top of ' + cls + ' : ' + body;
  }

  // 既に同じクラス宛の note が書かれていれば足さない (tick のたびに同じ行が積まれる)。
  function hasNoteFor(dsl, cls) {
    var want = _s(cls);
    if (!want) return false;
    var re = new RegExp('^\\s*note\\s+(?:left|right|top|bottom)\\s+of\\s+"?' + want + '"?\\b', 'i');
    return _s(dsl).split('\n').some(function(line) { return re.test(line); });
  }

  // 書ける相手だけを返す。宣言の無いクラスに note を向けると描画ごと落ちるので、
  // そこは「先に [クラス追加] を当ててください」に回す。
  function plan(dsl, targets_, opts) {
    var CS = window.MA.classScaffold;
    var declared = (CS && CS.existingIds) ? CS.existingIds(dsl) : {};
    var write = [];
    var skipped = [];
    (targets_ || []).forEach(function(t) {
      if (!declared[t.cls]) { skipped.push({ cls: t.cls, why: 'クラス図に宣言がありません' }); return; }
      if (hasNoteFor(dsl, t.cls)) { skipped.push({ cls: t.cls, why: '既に note が書かれています' }); return; }
      write.push(t);
    });
    return { write: write, skipped: skipped, lines: write.map(function(t) { return lineFor(t, opts); }) };
  }

  // plan の結果を DSL へ入れる。足す場所は @enduml の直前
  // (クラス本体 `{ ... }` の内側に落ちない所。クラス追加と同じ入口を使う)。
  function apply(dsl, targets_, opts) {
    var CS = window.MA.classScaffold;
    var p = plan(dsl, targets_, opts);
    if (!p.lines.length || !CS || !CS.insertBeforeEnd) return { dsl: _s(dsl), added: [], skipped: p.skipped };
    return {
      dsl: CS.insertBeforeEnd(_s(dsl), p.lines),
      added: p.write.map(function(t) { return t.cls; }),
      skipped: p.skipped,
    };
  }

  // 押せない理由。読んだだけで次の一手が分かる言い方にする。
  function blockReason(p) {
    var sk = (p && p.skipped) || [];
    if (!sk.length) return '対象のクラスを指摘文が名指ししていません';
    var need = sk.filter(function(s) { return s.why.indexOf('宣言') >= 0; });
    if (need.length) {
      return need.map(function(s) { return s.cls; }).join('・')
        + ' はクラス図に宣言がありません (先に [クラス追加] を当ててください)';
    }
    return sk.map(function(s) { return s.cls; }).join('・') + ' には既に note が書かれています';
  }

  var api = {
    offered: offered,
    targets: targets,
    bodyFor: bodyFor,
    lineFor: lineFor,
    hasNoteFor: hasNoteFor,
    plan: plan,
    apply: apply,
    blockReason: blockReason,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
