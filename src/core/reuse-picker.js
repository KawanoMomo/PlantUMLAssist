'use strict';
window.MA = window.MA || {};

// reuse-picker — 既に描いた図の行を、別の図の一括入力欄へ持ち込む。
//
// 一括入力欄は「1 手で 10 件入る」ようにはしたが、入る中身は利用者が全部
// 打つ設計のままなので、要素が少し増えるだけで入力量が増え続ける。実際の
// 仕事は「先輩の図を真似て自分の図を作る」ことが多く、そこで打ち直している
// のは既にどこかの図にある行 (participant 宣言・矢印・アクション) である。
//
// ここでは開いている全部の図から「その図種の一括欄にそのまま書ける行」を
// 集め、重複を落として候補として返す。選んだ候補を行のかたまりに組み直す
// ところまでが担当で、DOM には触らない。
window.MA.reusePicker = (function() {
  function _s(v) { return v == null ? '' : String(v); }

  // 図種ごとに「一括欄が受け付ける行」だけを拾う。構造行 (alt/end)、
  // @startuml、コメント、設定行は持ち込んでも意味が無いので落とす。
  var PICKABLE = {
    'plantuml-sequence': ['decl', 'arrow'],
    'plantuml-state': ['decl', 'arrow'],
    'plantuml-component': ['decl', 'arrow'],
    'plantuml-usecase': ['decl', 'arrow'],
    'plantuml-class': ['decl', 'arrow'],
    'plantuml-activity': ['action'],
  };

  // アクティビティ図の一括欄は「1 行 1 アクション」でラベルだけを書く欄なので、
  // `:ラベル;` から中身だけを取り出す。
  function _actionLabel(line) {
    var m = _s(line).trim().match(/^:(.*);$/);
    return m ? m[1].trim() : null;
  }

  function kindOfLine(diagramType, line) {
    var t = _s(line).trim();
    if (!t) return null;
    if (diagramType === 'plantuml-activity') {
      var label = _actionLabel(t);
      return label ? 'action' : null;
    }
    var k = window.MA.lineEdit.kindOf(t);
    var allowed = PICKABLE[diagramType] || ['decl', 'arrow'];
    return allowed.indexOf(k) >= 0 ? k : null;
  }

  // 一括欄に貼れる形にした 1 行。activity はラベルだけ、他は行そのまま。
  function lineFor(diagramType, line) {
    if (diagramType === 'plantuml-activity') return _actionLabel(line);
    return _s(line).trim();
  }

  // docs: workspace.list() が返す [{ id, name, diagramType, dsl }]。
  // diagramType が同じ図だけを見る (シーケンスの行を state 図へは持ち込めない)。
  // exceptId は「いま編集している図」で、自分自身は候補にしない。
  function collect(docs, diagramType, exceptId) {
    var out = [];
    var seen = {};
    (docs || []).forEach(function(d) {
      if (!d || d.diagramType !== diagramType) return;
      if (exceptId != null && d.id === exceptId) return;
      _s(d.dsl).split('\n').forEach(function(raw) {
        var kind = kindOfLine(diagramType, raw);
        if (!kind) return;
        var text = lineFor(diagramType, raw);
        if (!text || seen[text]) return;
        seen[text] = true;
        out.push({ text: text, kind: kind, from: _s(d.name) });
      });
    });
    crossKind(docs, diagramType, exceptId).forEach(function(it) {
      if (seen[it.text]) return;
      seen[it.text] = true;
      out.push(it);
    });
    return out;
  }

  // BLK-junior-20260909-0203-wish: 同じ図種の行だけでは、シーケンス図に書いてある
  // 処理順をアクティビティ図に持ち込めない。図種をまたいでそのまま Action に
  // なるものは、シーケンス図の「1 つの部品が送るメッセージ列」だけなので、
  // 出処 (図名 → 部品名) を付けてここで足す。順序が意味を持つので並べ替えない。
  function crossKind(docs, diagramType, exceptId) {
    if (diagramType !== 'plantuml-activity') return [];
    var s2a = window.MA && window.MA.seqToActivity;
    if (!s2a) return [];
    var out = [];
    s2a.candidates(docs, exceptId).forEach(function(c) {
      c.labels.forEach(function(label, i) {
        out.push({
          text: label, kind: 'action',
          from: c.docName + ' → ' + c.participant,
          group: c.docName + '/' + c.participant,
          seq: i,
        });
      });
    });
    return out;
  }

  // BLK-primary-20260929-2056-friction: クラス図の「⌗ クラス構成をまとめて追加」の窓へ、開いている他の図の部品名・呼び出し名を
  // 打ち直さずに持ち込む候補。系統を 1 つ足すたびに、シーケンス図に書いた参加者名・呼び出し名 (Pwm_Init() …) と
  // 状態遷移図に書いたきっかけ (Pwm_Start …) をクラス図に打ち直していた (綴りがずれると名前突合で食い違う)。
  //  - シーケンス図の参加者 (actor は除く) → クラス、その参加者が受ける呼び出し (応答の点線は除く) → そのクラスのメソッド
  //  - シーケンス図の呼び出し X -> Y (X・Y とも参加者、応答は除く) → 関連 X -- Y
  //  - 状態遷移図のきっかけ (A --> B : Pwm_Start) → 頭 (Pwm_) が同じクラスが 1 つだけあれば、そのクラスのメソッド
  // クラス図にもう有るメソッド・関連は候補から外す。もう有るクラスは exists を付けて示す (メソッドは足せる)。
  // 返す行: { kind: 'class'|'method'|'relation', cls, member?, to?, text, from, exists? }。DOM に触らない。
  var SEQ_DECL_RE = /^\s*(participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"\s+as\s+([A-Za-z_][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*))/i;
  var ST_TR_RE = /^\s*(\[\*\]|[A-Za-z_][A-Za-z0-9_.]*)\s*-+(?:\[[^\]]*\])?(?:left|right|up|down|l|r|u|d)?-*(?:\[[^\]]*\])?-*>\s*(\[\*\]|[A-Za-z_][A-Za-z0-9_.]*)\s*:\s*(.+)$/i;
  var CLASS_HEAD_RE = /^\s*(?:abstract\s+class|abstract|class|interface|enum|entity|struct)\s+(?:"[^"]*"\s+as\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<<[^>]*>>\s*)?(\{)?/;

  // クラス図の本文から { クラス名: { メソッド名: true } } と関連 ('A>B') の集合を読む。
  function _classIndex(text) {
    var classes = {}, rels = {}, cur = null, withType = 0, methods = 0;
    _s(text).split(/\r?\n/).forEach(function(raw) {
      var line = raw.trim();
      if (cur) {
        if (line === '}') { cur = null; return; }
        var mm = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (mm) {
          classes[cur][mm[1]] = true;
          methods++;
          if (/\)\s*:\s*\S/.test(line)) withType++;
        }
        return;
      }
      var h = line.match(CLASS_HEAD_RE);
      if (h) {
        classes[h[1]] = classes[h[1]] || {};
        if (h[2]) cur = h[1];
        return;
      }
      var r = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:"[^"]*"\s*)?([-.<>|*o+#x^]+)\s*(?:"[^"]*"\s*)?([A-Za-z_][A-Za-z0-9_]*)/);
      if (r && /[-.]/.test(r[2])) {
        classes[r[1]] = classes[r[1]] || {};
        classes[r[3]] = classes[r[3]] || {};
        rels[r[1] + '>' + r[3]] = true;
        rels[r[3] + '>' + r[1]] = true;
        return;
      }
      var mem = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*.*?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (mem && classes[mem[1]]) classes[mem[1]][mem[2]] = true;
    });
    // メソッドの書き方を図に合わせる (図のメソッドの過半が「: 型」付きなら「: void」を付ける)。
    return { classes: classes, rels: rels, typed: methods > 0 && withType * 2 > methods };
  }

  // 呼び出しの文言 → メソッド名と引数。名前として読めない文言 (日本語の説明・記号) は null。
  function _callOf(label) {
    var t = _s(label).trim();
    var m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\((.*)\))?\s*$/);
    return m ? { name: m[1], args: _s(m[2]).trim() } : null;
  }

  function classCandidates(docs, exceptId, currentText) {
    var idx = _classIndex(currentText);
    var out = [];
    var seenClass = {}, seenMethod = {}, seenRel = {};
    var order = [];
    var byClass = {};
    function cls(name, from) {
      if (seenClass[name]) return;
      seenClass[name] = true;
      order.push(name);
      byClass[name] = { item: { kind: 'class', cls: name, text: name, from: from, exists: !!idx.classes[name] }, methods: [], rels: [] };
    }
    function method(name, call, from) {
      var key = name + '.' + call.name;
      if (seenMethod[key] || (idx.classes[name] && idx.classes[name][call.name])) return;
      seenMethod[key] = true;
      var member = '+ ' + call.name + '(' + call.args + ')' + (idx.typed ? ' : void' : '');
      byClass[name].methods.push({ kind: 'method', cls: name, member: member, text: name + ' : ' + member, from: from });
    }
    function rel(a, b, from) {
      var key = a + '>' + b;
      if (seenRel[key] || idx.rels[key]) return;
      seenRel[key] = true;
      byClass[a].rels.push({ kind: 'relation', cls: a, to: b, text: a + ' -- ' + b, from: from });
    }
    var seqDocs = [], stDocs = [];
    (docs || []).forEach(function(d) {
      if (!d || (exceptId != null && d.id === exceptId)) return;
      if (d.diagramType === 'plantuml-sequence') seqDocs.push(d);
      else if (d.diagramType === 'plantuml-state') stDocs.push(d);
    });
    var s2a = window.MA && window.MA.seqToActivity;
    if (!s2a) return [];
    seqDocs.forEach(function(d) {
      var actors = {};
      var lines = _s(d.dsl).split(/\r?\n/);
      var from = function(p) { return _s(d.name) + ' → ' + p; };
      lines.forEach(function(raw) {
        var m = raw.match(SEQ_DECL_RE);
        if (!m) return;
        var name = m[3] || m[4];
        if (/^actor$/i.test(m[1])) actors[name] = true;
        else cls(name, from(name));
      });
      lines.map(s2a.message).filter(Boolean).forEach(function(m) {
        [m.from, m.to].forEach(function(p) { if (!actors[p]) cls(p, from(p)); });
      });
      lines.forEach(function(raw) {
        var m = s2a.message(raw);
        if (!m || actors[m.to]) return;
        // 応答 (点線 --> / ..>) は呼び出しではない (Ack・InitDone をメソッドにしない)。
        if (/--|\.\./.test(raw.replace(/:.*$/, ''))) return;
        var call = _callOf(m.label);
        if (call) method(m.to, call, from(m.to));
        if (m.from !== m.to && !actors[m.from]) rel(m.from, m.to, from(m.from));
      });
    });
    // 状態遷移図のきっかけは、頭 (最初の _ まで) が同じクラスが 1 つだけのときそのクラスへ。
    var known = order.concat(Object.keys(idx.classes).filter(function(n) { return !seenClass[n]; }));
    stDocs.forEach(function(d) {
      _s(d.dsl).split(/\r?\n/).forEach(function(raw) {
        var m = raw.match(ST_TR_RE);
        if (!m) return;
        var call = _callOf(_s(m[3]).split(/[\[\/]/)[0]);
        if (!call || call.name.indexOf('_') <= 0) return;
        var head = call.name.slice(0, call.name.indexOf('_') + 1);
        var owners = known.filter(function(n) { return n.indexOf(head) === 0; });
        if (owners.length !== 1) return;
        var src = _s(d.name) + ' → きっかけ';
        cls(owners[0], src);
        method(owners[0], { name: call.name, args: '' }, src);
      });
    });
    order.forEach(function(n) {
      var g = byClass[n];
      // もう有るクラスで、足すメソッドも関連も無いものは出さない (選ぶ意味が無い)。
      if (g.item.exists && !g.methods.length && !g.rels.length) return;
      out.push(g.item);
      Array.prototype.push.apply(out, g.methods);
      Array.prototype.push.apply(out, g.rels);
    });
    return out;
  }

  // 選んだ候補を窓の欄の形に畳む: { classes: [{ name, members: [] }], relations: [{ from, to }] }。
  // メソッドだけ選んでもそのクラスの行は立つ (クラスを別に選ばなくてよい)。
  function toClassSpec(items) {
    var classes = [], byName = {}, relations = [];
    function row(name) {
      if (!byName[name]) { byName[name] = { name: name, members: [] }; classes.push(byName[name]); }
      return byName[name];
    }
    (items || []).forEach(function(it) {
      if (!it) return;
      if (it.kind === 'class') row(it.cls);
      else if (it.kind === 'method') { var r = row(it.cls); if (r.members.indexOf(it.member) < 0) r.members.push(it.member); }
      else if (it.kind === 'relation') relations.push({ from: it.cls, to: it.to });
    });
    return { classes: classes, relations: relations };
  }

  // 宣言を先に、矢印を後に並べる。一括欄はこの順で読むのが自然で、
  // 貼ったあと並べ替える手間が要らない。
  function toBlock(items) {
    var decl = [], rest = [];
    (items || []).forEach(function(it) {
      if (!it || !it.text) return;
      (it.kind === 'decl' ? decl : rest).push(it.text);
    });
    return decl.concat(rest).join('\n');
  }

  // 既にある入力に足す。空行だけの欄なら置き換える。重複行は入れない。
  function appendTo(current, block) {
    var cur = _s(current).replace(/\s+$/, '');
    if (!_s(block).trim()) return cur;
    if (!cur.trim()) return block;
    var have = {};
    cur.split('\n').forEach(function(l) { have[l.trim()] = true; });
    var add = block.split('\n').filter(function(l) { return !have[l.trim()]; });
    return add.length === 0 ? cur : cur + '\n' + add.join('\n');
  }

  return {
    classCandidates: classCandidates,
    toClassSpec: toClassSpec,
    crossKind: crossKind,
    kindOfLine: kindOfLine,
    lineFor: lineFor,
    collect: collect,
    toBlock: toBlock,
    appendTo: appendTo,
  };
})();
