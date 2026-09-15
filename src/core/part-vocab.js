'use strict';
window.MA = window.MA || {};

// part-vocab — 1 つの部品 (SPI) の 6 図種に散らばっている名前を 1 冊の名前帳にする。
//
// BLK-junior-20260915-0406-wish: 先輩の図を手本に SPI の状態遷移図を打ち直すとき、
// `Spi_Init` `Spi_Transmit` `TransferComplete` `Fault` `Spi_Reset` は先輩の
// シーケンス図 (spi_init_sequence) にも出てくるはずだが、GUI は図ごとに独立して
// いて名前の対応を教えてくれない。合っているかは先輩の図を別に開いて目で見比べる
// しかなく、その場で打ち間違えると 6 図種の表記が最初から割れる。
//
// ここは「同じ部品名を持つ図」を全部まとめて読み、出てくる名前を役割ごとに数える。
//   method … 呼べる操作 (`Spi_Init` `Spi_Transmit()`)。接頭辞が型を指す
//   event  … 接頭辞を持たないきっかけ (`TransferComplete` `Fault`)
//   state  … 状態遷移図の状態 (`Uninit` `Idle` `Busy`)
//   type   … クラス図 / participant の型 (`Spi_Driver`)
// 同じものの別表記 (`Spi_Init` ⇔ `SpiInit`) は 1 件にまとめず、両方を残したまま
// 「揺れている」と言う。どちらが正かは図を見た人にしか決められないので、
// 名前帳が勝手に片方を消すと、先輩の綴りが黙って消える。
//
// 解析は methodAudit の正規表現をそのまま使う (同じ図に対して名前帳と突合が
// 違うことを言わないように、規則を 2 つ持たない)。表記揺れの正規化は namePairing。
// DOM も fetch も触らない。読み込みと表示は app.js / properties。
window.MA.partVocab = (function() {

  var ROLES = ['method', 'event', 'state', 'type'];

  var ROLE_LABEL = {
    method: 'メソッド',
    event: 'きっかけ',
    state: '状態',
    type: '型',
  };

  // 状態宣言。`state "待機" as Idle` と `state Idle` の両方。
  var STATE_DECL_RE = /^\s*state\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;
  // 遷移行の端点。ラベルの有無は問わない (端点だけを拾う)。
  var TRANS_ENDS_RE = /^\s*(\[\*\]|"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*-+(?:up|down|left|right)?-*>\s*(\[\*\]|"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?::|$)/;
  // アクティビティの処理。`:Spi_Init();`
  var ACTIVITY_RE = /^\s*:(.+?);\s*$/;
  // 識別子だけの語。日本語のラベルは名前帳に載せない (突き合わせる形になっていない)。
  var IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  function _s(v) { return v == null ? '' : String(v); }
  function _lines(text) { return _s(text).split(/\r?\n/); }
  function _line(s) { return _s(s).replace(/\r$/, ''); }
  function _unquote(s) {
    var t = _s(s).trim();
    return (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') ? t.slice(1, -1) : t;
  }

  function _ma() { return window.MA.methodAudit; }

  // 表記揺れの判定キー。記号と大小を落とす (namePairing と同じ規則)。
  function normalize(name) {
    var NP = window.MA.namePairing;
    if (NP && NP.normalize) return NP.normalize(name);
    return _s(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function baseName(name) {
    return _s(name).replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // ファイル名から部品名を取る。`spi_state.puml` → `spi`。
  // 図種の綴りしか残らない名前 (`state.puml`) は部品名を名乗らない。
  function subjectOf(name) {
    var base = baseName(name).toLowerCase();
    var head = (base.match(/^[a-z0-9]+/) || [''])[0];
    if (head.length < 2) return '';
    var PR = window.MA.partReference;
    var kinds = (PR && PR.KINDS) || ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];
    if (kinds.indexOf(head) >= 0) return '';
    return head;
  }

  // その図がこの部品のものか。partReference と同じく、ファイル名だけで決める
  // (本文まで見ると、その部品を参照しているだけの他部品の図が紛れる)。
  function belongs(subject, name) {
    var PR = window.MA.partReference;
    if (PR && PR.matches) return PR.matches(subject, name);
    var id = _s(subject).toLowerCase();
    return id.length >= 2 && baseName(name).toLowerCase().indexOf(id) >= 0;
  }

  // 相乗り図の中にこの部品が居れば、その部品ぶんの DSL を返す (居なければ null)。
  // 「この部品の図か」の判定をもう 1 つ増やさないため、切り出しは part-slice に任せる。
  function _sliceFor(subject, dsl) {
    var PS = window.MA.partSlice;
    if (!PS || !PS.isComposite || !PS.slice) return null;
    if (!PS.isComposite(dsl)) return null;
    if (!PS.findPart(dsl, subject)) return null;
    var out = PS.slice(dsl, subject);
    return (out && _s(out.dsl).trim()) ? out.dsl : null;
  }

  // 接頭辞 (`Spi_`) を持つ名前はメソッド、持たない名前はきっかけ。
  // 見分けは methodAudit.isApiEvent と同じ規則にする。
  function roleOfEvent(name) {
    var MA_ = _ma();
    if (MA_ && MA_.isApiEvent) return MA_.isApiEvent(name) ? 'method' : 'event';
    return /^[A-Za-z0-9]+_/.test(_s(name)) ? 'method' : 'event';
  }

  // ── 1 図から名前を取り出す ───────────────────────────────────────────
  // 返り値: [{ name, role }]。重複はそのまま返す (数えるのは collect)。
  function namesIn(dsl, kind) {
    var MA_ = _ma();
    var out = [];
    var k = _s(kind);

    function push(name, role) {
      var n = _unquote(name).trim();
      if (!n || n === '[*]') return;
      if (!IDENT_RE.test(n)) return;
      out.push({ name: n, role: role });
    }

    // クラス図の宣言。メソッドと型を一度に取れる。
    if (MA_ && MA_.parseClassDoc) {
      var cd = MA_.parseClassDoc(dsl);
      (cd.classes || []).forEach(function(c) { push(c, 'type'); });
      (cd.methods || []).forEach(function(m) { push(m.method, 'method'); });
    }

    _lines(dsl).forEach(function(raw) {
      var line = _line(raw);
      if (/^\s*'/.test(line)) return;         // コメント

      var sd = line.match(STATE_DECL_RE);
      if (sd) push(sd[2] || sd[3], 'state');

      var te = line.match(TRANS_ENDS_RE);
      if (te) {
        // 端点が状態なのは状態遷移図だけ。シーケンスの `A -> B` は参加者 (型)。
        var endRole = (k === 'sequence') ? 'type' : 'state';
        push(te[1], endRole);
        push(te[2], endRole);
      }

      // シーケンスのメッセージ本文にある呼び出し (`Spi_Init()`)。
      if (MA_ && MA_.parseCall) {
        var call = MA_.parseCall(line);
        if (call) { push(call.method, 'method'); push(call.receiver, 'type'); }
      }

      // 状態遷移のきっかけ (`Idle --> Busy : Spi_Transmit`)。括弧の無い形。
      if (MA_ && MA_.parseStateEvent) {
        var ev = MA_.parseStateEvent(line);
        if (ev) push(ev.event, roleOfEvent(ev.event));
      }

      // 括弧を持たないシーケンス本文 (`Dev -> SpiDrv : TransferComplete`)。
      var msg = line.match(/^\s*(?:"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|<-+)\s*(?:"[^"]+"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/);
      if (msg) {
        var body = msg[1].trim();
        if (IDENT_RE.test(body)) push(body, roleOfEvent(body));
      }

      // 参加者宣言。
      var pa = line.match(/^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|([A-Za-z0-9_][A-Za-z0-9_.-]*))/);
      if (pa) push(pa[2] || pa[3], 'type');

      // アクティビティの処理。`:Spi_Init();`
      var ac = line.match(ACTIVITY_RE);
      if (ac) {
        var t = ac[1].trim().replace(/\(\s*\)$/, '');
        if (IDENT_RE.test(t)) push(t, roleOfEvent(t));
      }

      // コンポーネント。`[Spi_Driver]`
      var co = line.match(/^\s*\[([^\]]+)\]\s*(?:as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*))?\s*$/);
      if (co) push(co[2] || co[1], 'type');

      // 宣言語つきのコンポーネント・ユースケース。`component Spi_Driver`
      // `usecase "転送する" as UC_Transfer`。`[...]` 形と同じ役割 (型) に寄せる
      // — 同じ絵の要素が図種によって別の役割になると、名前の突合が割れる。
      var de = line.match(/^\s*(?:component|usecase|node|rectangle|folder|frame|cloud|storage)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|\[([^\]]+)\]\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|([A-Za-z0-9_][A-Za-z0-9_.-]*))/);
      if (de) push(de[2] || de[4] || de[5] || de[1] || de[3], 'type');
    });

    return out;
  }

  // ── 名前帳を組む ─────────────────────────────────────────────────────
  // docs: [{ name, kind, text|dsl, folder }]。subject に属する図だけを読む。
  // 返り値: {
  //   subject, docs: [{ name, kind, folder }],
  //   items: [item], byRole: { role: [item] }, byName: { name: item },
  //   variants: [[item, item, …]]   // 表記が揺れている組だけ
  // }
  // item = { name, role, count, sources: [{ name, kind, folder }] }
  function collect(subject, docs) {
    var id = _s(subject).toLowerCase();
    var byName = {};
    var items = [];
    var used = [];

    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var name = _s(d.name);
      var dsl = _s(d.text != null ? d.text : d.dsl);
      if (!dsl.trim()) return;
      // BLK-junior-20260915-0606: 名前を持っているのがファイル名に部品名の無い
      // 相乗り図 (`driver_common_class.puml` に 8 部品) のことがある。ファイル名だけで
      // 弾くと、活動図に打つ実在メソッド (Spi_Init / Spi_Reset / …) が名前帳に
      // 1 語も入らず、junior はその図を別タブで開いて絞って控えるしかなくなる。
      // 相乗り図はその部品ぶんを切り出して (part-slice と同じ規則) 読む —
      // 他部品のメソッドは切り出しが落とすので、名前帳に混ざらない。
      if (id && !belongs(id, name)) {
        var sliced = _sliceFor(id, dsl);
        if (!sliced) return;
        dsl = sliced;
      }
      var kind = _s(d.kind);
      if (!kind) {
        var PR = window.MA.partReference;
        if (PR && PR.kindOf) kind = PR.kindOf({ kind: '', text: dsl });
      }
      var src = { name: name, kind: kind, folder: _s(d.folder) };
      used.push(src);
      namesIn(dsl, kind).forEach(function(n) {
        var item = byName[n.name];
        if (!item) {
          item = { name: n.name, role: n.role, count: 0, sources: [] };
          byName[n.name] = item;
          items.push(item);
        }
        // 役割が割れたら「型 < 状態 < きっかけ < メソッド」の強い方を採る。
        // 同じ名前が participant と呼び出しの両方に出る図では、選ぶときに
        // 欲しいのは呼べる操作の方。
        if (ROLES.indexOf(n.role) < ROLES.indexOf(item.role)) item.role = n.role;
        item.count++;
        var hit = item.sources.some(function(s) { return s.name === src.name; });
        if (!hit) item.sources.push(src);
      });
    });

    // 出てくる図が多い名前を先に。同数なら綴り順 (並びが run ごとに揺れない)。
    items.sort(function(a, b) {
      if (a.sources.length !== b.sources.length) return b.sources.length - a.sources.length;
      if (a.count !== b.count) return b.count - a.count;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });

    var byRole = {};
    ROLES.forEach(function(r) { byRole[r] = []; });
    items.forEach(function(it) { byRole[it.role].push(it); });

    // 表記揺れ。正規化キーが同じで綴りが違う組だけを残す。
    var groups = {};
    items.forEach(function(it) {
      var k = normalize(it.name);
      if (!k) return;
      (groups[k] = groups[k] || []).push(it);
    });
    var variants = [];
    Object.keys(groups).forEach(function(k) {
      if (groups[k].length > 1) variants.push(groups[k]);
    });
    variants.sort(function(a, b) { return a[0].name < b[0].name ? -1 : 1; });

    return {
      subject: id,
      docs: used,
      items: items,
      byRole: byRole,
      byName: byName,
      variants: variants,
    };
  }

  // ── 引くための関数 ───────────────────────────────────────────────────
  // suggest(vocab, roles, opts) — 候補。roles は 'method' か ['method','event']。
  // opts: { prefix, limit, exclude }。prefix は前方一致 (大小を無視)。
  function suggest(vocab, roles, opts) {
    var o = opts || {};
    var want = Array.isArray(roles) ? roles : (roles ? [roles] : ROLES);
    var pre = _s(o.prefix).toLowerCase();
    var ex = Array.isArray(o.exclude) ? o.exclude : [];
    var out = [];
    ((vocab && vocab.items) || []).forEach(function(it) {
      if (want.indexOf(it.role) < 0) return;
      if (ex.indexOf(it.name) >= 0) return;
      if (pre && it.name.toLowerCase().indexOf(pre) !== 0) return;
      out.push(it);
    });
    var limit = o.limit | 0;
    return limit > 0 ? out.slice(0, limit) : out;
  }

  // その名前と表記が揺れている別の綴り (自分は含まない)。
  function variantsOf(vocab, name) {
    var k = normalize(name);
    if (!k) return [];
    return ((vocab && vocab.items) || []).filter(function(it) {
      return normalize(it.name) === k && it.name !== _s(name);
    });
  }

  // 打った名前に対する 1 行。名前帳に無ければ「新しい名前」と言い切る
  // (黙っていると、打ち間違いと新語の見分けが付かない)。
  function checkName(vocab, name) {
    var n = _s(name).trim();
    if (!n || !vocab) return '';
    if (vocab.byName && vocab.byName[n]) return '';
    var v = variantsOf(vocab, n);
    if (v.length) {
      return '表記が揺れています: この部品の図では ' + v.map(function(it) {
        return it.name + ' (' + sourceText(it) + ')';
      }).join('・') + ' と書かれています';
    }
    return '';
  }

  // その名前がどの図に出るか。名前帳の 1 件を 1 行にする。
  function sourceText(item) {
    if (!item || !item.sources.length) return '';
    return item.sources.map(function(s) {
      return (s.folder ? s.folder + '/' : '') + baseName(s.name);
    }).join('・');
  }

  function roleLabel(role) { return ROLE_LABEL[_s(role)] || _s(role); }

  // 名前帳の見出し 1 行。何枚の図から何語を集めたかを数で言う。
  function summary(vocab) {
    if (!vocab || !vocab.items.length) return '';
    var head = (vocab.subject ? vocab.subject.toUpperCase() + ' の名前帳: ' : '名前帳: ')
      + vocab.docs.length + ' 図種 ' + vocab.items.length + ' 語';
    if (vocab.variants.length) head += ' / 表記揺れ ' + vocab.variants.length + ' 組';
    return head;
  }

  // ── 現在の名前帳 ─────────────────────────────────────────────────────
  // 図種ごとのパネル (modules/*.js) は app.js の docs を持たないので、
  // app.js が組んだものをここに預ける (appBridge.setEnv と同じ約束)。
  var _current = null;
  function setCurrent(vocab) { _current = vocab || null; }
  function current() { return _current; }

  return {
    ROLES: ROLES,
    ROLE_LABEL: ROLE_LABEL,
    normalize: normalize,
    baseName: baseName,
    subjectOf: subjectOf,
    belongs: belongs,
    roleOfEvent: roleOfEvent,
    namesIn: namesIn,
    collect: collect,
    suggest: suggest,
    variantsOf: variantsOf,
    checkName: checkName,
    sourceText: sourceText,
    roleLabel: roleLabel,
    summary: summary,
    setCurrent: setCurrent,
    current: current,
  };
})();
