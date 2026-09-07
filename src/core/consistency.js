'use strict';
window.MA = window.MA || {};

// consistency — レビューで毎回手作業だった突合を 1 か所に集める。
//
// 命名規約の逸脱 (CanDrv と Can_Driver の混在)、どの矢印にも出てこない
// participant、sequence で呼んでいるのに class に無いメソッド、sequence と
// state の粒度不一致 (family-audit に委譲) の 4 種を 1 本の警告一覧にする。
// 「17 枚を読んで突合パターンごとに探す」を「一覧を見る」に変える。
// DOM には触らない。
window.MA.consistency = (function() {
  // 同義の接尾辞。同じ組の綴りが 2 通り以上使われていたら、多数派を規約とみなす。
  // 規約そのものは図の中の多数決で決める (外から規約表を渡す作りにはしない)。
  var SUFFIX_SYNONYMS = [
    ['driver', 'drv'],
    ['controller', 'ctrl', 'ctl'],
    ['manager', 'mgr'],
    ['handler', 'hdl', 'hdlr'],
    ['service', 'svc'],
    ['adapter', 'adp'],
  ];

  var DECL_RE = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue|abstract\s+class|class|interface|enum|struct)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;
  var PARTICIPANT_RE = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;
  var CLASS_RE = /^\s*(?:abstract\s+class|class|interface|enum|struct)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)|"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;
  // 3 = 矢印そのもの。呼び出し (`->`) と応答 (`-->` / `..>`) を見分けるために捕まえる
  // (BLK-reviewer-20260907-1703)。
  var MSG_RE = /^\s*(?:"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*(-+>+|<-+|\.+>|<\.+)\s*(?:"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*:\s*(.+?)\s*$/;
  var ARROW_ANY_RE = /^\s*(?:"([^"]+)"|\[\*\]|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*(?:-+>+|<-+|<\|-+|-+\|>|\*-+|o-+|-+\*|-+o|\.+>|<\.+|-{2,})\s*(?:"([^"]+)"|\[\*\]|([A-Za-z0-9_][A-Za-z0-9_.-]*))/;
  // クラス本体の 1 行。`+ read(ch) : int` や `read()` のような行からメソッド名を取る。
  var MEMBER_RE = /^\s*[-+#~]?\s*(?:\{static\}\s*|\{abstract\}\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
  var SKIP_RE = /^\s*(?:@|'|note|end|alt|else|opt|loop|par|break|critical|group|ref|activate|deactivate|title|header|footer|legend|skinparam|hide|show|autonumber|newpage|scale|caption|return|package|namespace)/i;

  function _pick(m) { return m ? (m[2] || m[4] || m[1] || m[3] || '') : ''; }

  function normalizeKey(name) {
    return String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // 名前の末尾にある役割語。Can_Driver → driver、GpioDrv → drv、Adc → ''。
  function suffixOf(name) {
    var n = normalizeKey(name);
    var best = '';
    SUFFIX_SYNONYMS.forEach(function(group) {
      group.forEach(function(s) {
        // 長い綴りを優先する (driver は drv より先に確定させる)。
        if (n.length > s.length && n.slice(-s.length) === s && s.length > best.length) best = s;
      });
    });
    return best;
  }

  function _groupOf(suffix) {
    for (var i = 0; i < SUFFIX_SYNONYMS.length; i++) {
      if (SUFFIX_SYNONYMS[i].indexOf(suffix) >= 0) return SUFFIX_SYNONYMS[i][0];
    }
    return '';
  }

  // 1 枚から宣言名・参照名・メッセージ・クラスのメンバーを取り出す。
  function scanDoc(doc) {
    var name = (doc && doc.name) || '';
    var participants = [];
    var classes = {};      // クラス名 → メソッド名の配列
    var declared = [];
    var referenced = {};
    var messages = [];
    var currentClass = null;

    String((doc && doc.dsl) || '').split(/\r?\n/).forEach(function(line) {
      var cls = line.match(CLASS_RE);
      if (cls) {
        var cn = _pick(cls);
        if (cn) {
          declared.push(cn);
          if (!classes[cn]) classes[cn] = [];
          // `class X {` なら以降の行はそのクラスの本体。
          currentClass = /\{\s*$/.test(line) ? cn : null;
        }
        return;
      }
      if (/^\s*\}/.test(line)) { currentClass = null; return; }
      if (currentClass) {
        var mem = line.match(MEMBER_RE);
        if (mem) { classes[currentClass].push(mem[1]); return; }
      }
      var par = line.match(PARTICIPANT_RE);
      if (par) {
        var pn = _pick(par);
        if (pn) { participants.push(pn); declared.push(pn); }
        return;
      }
      // `X : + read()` 形式のメンバー行 (本体を持たないクラスへの追記)。
      var flat = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
      if (flat && classes[flat[1]] !== undefined && !ARROW_ANY_RE.test(line)) {
        var fm = flat[2].match(MEMBER_RE);
        if (fm) { classes[flat[1]].push(fm[1]); return; }
      }
      if (SKIP_RE.test(line)) return;
      var msg = line.match(MSG_RE);
      if (msg) {
        var left = msg[1] || msg[2];
        var right = msg[4] || msg[5];
        var arrow = msg[3];
        // 矢印が左を向いていれば送り手は右側。応答の対を見るときだけこの向きを使う
        // (from / to は既存の突合がそのまま使うので並びを変えない)。
        var back = arrow.charAt(0) === '<';
        messages.push({
          from: left, to: right, label: msg[6], arrow: arrow,
          // 破線 (`-->` / `..>`) は PlantUML では戻りの線。呼び出しは実線。
          dashed: /--|\.\./.test(arrow) || arrow.indexOf('.') >= 0,
          src: back ? right : left,
          dst: back ? left : right,
        });
      }
      var a = line.match(ARROW_ANY_RE);
      if (a) {
        var l = a[1] || a[2];
        var r = a[3] || a[4];
        if (l) referenced[l] = true;
        if (r) referenced[r] = true;
      }
    });

    return {
      name: name,
      participants: participants,
      classes: classes,
      declared: declared,
      referenced: referenced,
      messages: messages,
    };
  }

  // ① 命名規約の逸脱。同義の接尾辞が混ざっていたら、多数派に対する少数派を挙げる。
  function namingViolations(docs) {
    var scans = (docs || []).map(scanDoc);
    var byGroup = {};
    scans.forEach(function(s) {
      s.declared.forEach(function(n) {
        var suf = suffixOf(n);
        if (!suf) return;
        var g = _groupOf(suf);
        if (!g) return;
        if (!byGroup[g]) byGroup[g] = { group: g, bySuffix: {}, order: [] };
        var e = byGroup[g];
        if (!e.bySuffix[suf]) { e.bySuffix[suf] = { suffix: suf, names: [], docs: [] }; e.order.push(suf); }
        if (e.bySuffix[suf].names.indexOf(n) === -1) e.bySuffix[suf].names.push(n);
        if (e.bySuffix[suf].docs.indexOf(s.name) === -1) e.bySuffix[suf].docs.push(s.name);
      });
    });

    var out = [];
    Object.keys(byGroup).forEach(function(g) {
      var e = byGroup[g];
      if (e.order.length < 2) return;                 // 混在していなければ規約違反ではない
      var sorted = e.order.slice().sort(function(a, b) {
        var d = e.bySuffix[b].names.length - e.bySuffix[a].names.length;
        return d !== 0 ? d : (a < b ? -1 : 1);        // 同数なら綴り順で決め打ち (結果を安定させる)
      });
      var majority = sorted[0];
      sorted.slice(1).forEach(function(suf) {
        e.bySuffix[suf].names.forEach(function(n) {
          out.push({
            name: n, suffix: suf, expected: majority, group: g,
            docs: e.bySuffix[suf].docs.slice(),
          });
        });
      });
    });
    out.sort(function(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    return out;
  }

  // ② 未使用 participant。宣言だけあってどの矢印にも出てこないもの。
  function unusedParticipants(docs) {
    var out = [];
    (docs || []).map(scanDoc).forEach(function(s) {
      s.participants.forEach(function(p) {
        if (!s.referenced[p]) out.push({ name: p, doc: s.name });
      });
    });
    return out;
  }

  // 呼び出しへの応答か。破線の矢印で、同じ 2 者の間に「先に出された逆向きの
  // 呼び出し」があるものを応答とみなす (BLK-reviewer-20260907-1703)。
  //
  // 応答のラベル (Ack / Ready / 完了) はクラスのメソッドではないので、メソッド突合に
  // 掛けると必ず「クラスに無い」と出る。レビューのたびに 12 件を目で読んで
  // 「これは戻り矢印だから違う」とふるい分けていたのがこの過検出。
  // 破線というだけでは足りない (破線で呼ぶ書き方もある) ので、対になる呼び出しが
  // 先にあることまで見る。対の無い破線は今までどおり突合に掛ける。
  function isReply(messages, i) {
    var m = messages[i];
    if (!m || !m.dashed || !m.src || !m.dst) return false;
    for (var j = 0; j < i; j++) {
      var c = messages[j];
      if (!c.dashed && c.src === m.dst && c.dst === m.src) return true;
    }
    return false;
  }

  // ③ メソッド不一致。sequence で呼んでいるのに、同名クラスの側に無いメソッド。
  // クラスが 1 枚も無い名前は対象外 (そこは name-audit の「宣言なし」の職掌)。
  // 応答のラベルは除外し、除外した分は replies に残す (見ていない訳ではないと分かるように)。
  function methodGapsDetail(docs) {
    var scans = (docs || []).map(scanDoc);
    var methodsOf = {};      // クラス名 → メソッド名 (正規化) の集合
    scans.forEach(function(s) {
      Object.keys(s.classes).forEach(function(cn) {
        if (!methodsOf[cn]) methodsOf[cn] = {};
        s.classes[cn].forEach(function(m) { methodsOf[cn][normalizeKey(m)] = m; });
      });
    });

    var out = [];
    var replies = [];
    var seen = {};
    scans.forEach(function(s) {
      s.messages.forEach(function(m, i) {
        if (!m.to || !methodsOf[m.to]) return;
        var label = String(m.label || '').replace(/\([^)]*\)/g, '').trim();
        var key = normalizeKey(label);
        if (!key || methodsOf[m.to][key]) return;
        var dedup = s.name + '|' + m.to + '|' + key;
        if (seen[dedup]) return;
        seen[dedup] = true;
        var row = { doc: s.name, target: m.to, method: label };
        if (isReply(s.messages, i)) replies.push(row);
        else out.push(row);
      });
    });
    return { gaps: out, replies: replies };
  }

  function methodGaps(docs) { return methodGapsDetail(docs).gaps; }

  // 応答として突合から外したもの。「見ていない」ではないことを示すために数を出す。
  function methodReplies(docs) { return methodGapsDetail(docs).replies; }

  // ⑤ イベント名不一致。state の遷移ラベル (括弧なし) に対応する
  // クラスメソッドが無いもの。判断は method-audit に任せる。同じ突合を
  // 2 つ持つと、バッジと名前突合の表で数が食い違う。
  function eventGaps(docs) {
    var ma = window.MA.methodAudit;
    if (!ma) return [];
    return ma.audit(docs || []).issues
      .filter(function(i) { return i.via === 'state'; })
      .map(function(i) {
        return { event: i.method, cls: i.cls || '', owner: i.owner || '', kind: i.kind, docs: i.docs || [] };
      });
  }

  // ④ 粒度不一致は family-audit の職掌。ここでは同じ一覧に載せるためだけに畳む。
  function granularityGaps(docs) {
    var fa = window.MA.familyAudit;
    if (!fa) return [];
    var out = [];
    fa.audit(docs || []).forEach(function(f) {
      if (!f.comparable) return;
      f.mismatches.forEach(function(m) {
        out.push({ family: f.key, label: m.label, onlyIn: m.onlyIn });
      });
    });
    return out;
  }

  function check(docs) {
    var naming = namingViolations(docs);
    var unused = unusedParticipants(docs);
    var md = methodGapsDetail(docs);
    var methods = md.gaps;
    var granularity = granularityGaps(docs);
    var events = eventGaps(docs);
    return {
      naming: naming,
      unused: unused,
      methods: methods,
      // 呼び出しへの応答として突合から外したもの。count には数えない。
      methodReplies: md.replies,
      granularity: granularity,
      events: events,
      count: naming.length + unused.length + methods.length + granularity.length + events.length,
    };
  }

  // ステータスバーのバッジ。0 件は「⚠ 0」ではなく「整合 OK」と言い切る。
  function badgeLabel(result) {
    if (!result) return '整合 —';
    return result.count === 0 ? '整合 OK' : '⚠ ' + result.count;
  }

  return {
    SUFFIX_SYNONYMS: SUFFIX_SYNONYMS,
    normalizeKey: normalizeKey,
    suffixOf: suffixOf,
    scanDoc: scanDoc,
    namingViolations: namingViolations,
    unusedParticipants: unusedParticipants,
    isReply: isReply,
    methodGaps: methodGaps,
    methodGapsDetail: methodGapsDetail,
    methodReplies: methodReplies,
    granularityGaps: granularityGaps,
    eventGaps: eventGaps,
    check: check,
    badgeLabel: badgeLabel,
  };
})();
