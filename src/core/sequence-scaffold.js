'use strict';
window.MA = window.MA || {};

// sequence-scaffold — シーケンス図の「参加者数人 + メッセージ数本」を
// 1 度の入力でまとめて組み立てる。
//
// 「末尾に追加」は 1 件ごとに種類 select を選び直すため、参加者 5・
// メッセージ 6 の図を起こすとフォームを 11 回開くことになる。逃げ道の
// 「一括 (複数行)」欄は `Dev -> SpiDrv : Spi_Init()` という構文ごと
// 打たせる設計なので、DSL エディタに直接打つのと打鍵数が変わらない。
// class-scaffold と同じ流儀で、名前・本文という短い値だけを受け取り、
// 宣言行と矢印構文はこちらで組み立てる。
//
// 生成する行の例:
//   title TIMER ドライバ初期化
//   actor Dev
//   participant "TIMER ドライバ" as P1
//   Dev -> P1 : Timer_Init()
//   P1 --> Dev : E_OK
window.MA.sequenceScaffold = (function() {
  var ASCII_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var DECL_RE = /^(?:actor|participant|boundary|control|entity|database|collections|queue)\s+(?:"[^"]*"\s+as\s+)?([A-Za-z_][A-Za-z0-9_]*)/i;
  var MSG_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:-+>>?|<<?-+|-+\\|-+\/|\\\\-+|\/\/-+)\s*([A-Za-z_][A-Za-z0-9_]*)/;

  // sequence モジュールが出す矢印と同じ記法。core は modules に依存しないので
  // 表をここに持つ (ずれると preview と実際の DSL が食い違うため、
  // sequence-scaffold.test.js で突き合わせている)。
  var ARROWS = {
    sync: '->',
    async: '->>',
    reply: '-->',
    asyncReply: '-->>',
    lost: '->x',
    create: '->',
  };

  // まとめて追加で囲める枠 (単発の「ブロック」と同じ語彙)。
  var BLOCK_KINDS = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group'];
  // else を置ける枠。
  var ELSE_KINDS = ['alt', 'par', 'critical', 'group'];

  var PARTICIPANT_TYPES = [
    'participant', 'actor', 'boundary', 'control',
    'entity', 'database', 'collections', 'queue',
  ];

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // text 中で既に宣言・参照されている参加者 ID。ASCII 別名の採番と
  // 「もう宣言済みか」の判定に使う。
  function existingIds(text) {
    var ids = {};
    _s(text).split('\n').forEach(function(raw) {
      var line = raw.trim();
      var d = line.match(DECL_RE);
      if (d) { ids[d[1]] = true; return; }
      var m = line.match(MSG_RE);
      if (m) { ids[m[1]] = true; ids[m[2]] = true; }
    });
    return ids;
  }

  // 日本語の参加者名を打たれても壊れないよう ASCII 別名へ寄せる
  // (id-normalizer と同じ約束: `participant "表示名" as ASCII別名`)。
  // used は同じ入力の中で既に払い出した別名。
  function normalizeId(rawInput, text, used) {
    var trimmed = _s(rawInput);
    if (!trimmed) return { id: '', label: '', valid: false };
    if (ASCII_ID_RE.test(trimmed)) return { id: trimmed, label: trimmed, valid: true };
    var taken = used || existingIds(text);
    for (var i = 1; i < 10000; i++) {
      if (!taken['P' + i]) return { id: 'P' + i, label: trimmed, valid: true };
    }
    return { id: 'P' + Date.now(), label: trimmed, valid: true };
  }

  function normalizeArrow(raw) {
    var k = _s(raw);
    return ARROWS[k] ? k : 'sync';
  }

  function normalizeType(raw) {
    var t = _s(raw).toLowerCase();
    for (var i = 0; i < PARTICIPANT_TYPES.length; i++) {
      if (PARTICIPANT_TYPES[i] === t) return t;
    }
    return 'participant';
  }

  function fmtMessage(arrow, from, to, text) {
    return from + ' ' + ARROWS[normalizeArrow(arrow)] + ' ' + to + (text ? ' : ' + text : '');
  }

  function _decl(type, id, label) {
    return normalizeType(type) + ' ' +
      ((label && label !== id) ? '"' + label + '" as ' + id : id);
  }

  // 空行 (名前の無い参加者行、From/To が欠けたメッセージ行) は捨てる。
  // フォームは既定で数行出すので、埋めなかった行が DSL に漏れない。
  function normalizeSpec(spec, text) {
    var src = spec || {};
    var used = existingIds(text);
    // 打たれた名前 → 払い出した ID。メッセージ側は表示名で書かれるので、
    // 参加者行と同じ ID に解決できるようにする。
    var byName = {};
    Object.keys(used).forEach(function(id) { byName[id] = id; });

    function take(raw) {
      var key = _s(raw);
      if (!key) return { id: '', label: '', valid: false };
      if (byName[key]) return { id: byName[key], label: key, valid: true };
      var n = normalizeId(key, text, used);
      if (n.id) { used[n.id] = true; byName[key] = n.id; }
      return n;
    }

    var participants = [];
    (src.participants || []).forEach(function(p) {
      var n = take(p && p.name);
      if (!n.id) return;
      participants.push({ id: n.id, label: n.label, type: normalizeType(p.type) });
    });

    var messages = [];
    (src.messages || []).forEach(function(m) {
      var from = _s(m && m.from);
      var to = _s(m && m.to);
      if (!from || !to) return;
      // メッセージだけに現れた名前もその場で参加者として解決する
      // (宣言を書き忘れても「未定義」で止まらない)。
      messages.push({
        from: take(from).id,
        to: take(to).id,
        arrow: normalizeArrow(m.arrow),
        text: _s(m.text),
        inBlock: _inBlock(m.inBlock),
      });
    });

    return { title: _s(src.title), participants: participants, messages: messages, block: _block(src.block) };
  }

  // BLK-human-20260923-2002: メッセージ行ごとの「枠」列。'' = 枠の外 / 'main' = 枠の中 / 'else' = else の後。
  function _inBlock(v) {
    var t = _s(v);
    return (t === 'main' || t === 'else') ? t : '';
  }

  function _block(b) {
    var src = b || {};
    var k = _s(src.kind).toLowerCase();
    return {
      kind: BLOCK_KINDS.indexOf(k) >= 0 ? k : 'alt',
      label: _s(src.label),
      elseLabel: _s(src.elseLabel),
    };
  }

  // BLK-human-20260923-1330:「PlantUML として正当な入力を GUI が拒まない」。
  // errors は本当に生成できないものだけ。意図を確かめたいだけのものは warnings に落とし、
  // ok は errors だけで決める (警告が出ていても「追加」は押せて、押せば追加される)。
  function validate(spec, text) {
    var s = normalizeSpec(spec, text);
    var errors = [];
    var warnings = [];
    if (s.participants.length === 0 && s.messages.length === 0) {
      errors.push('参加者かメッセージを 1 つ以上入れてください');
    }
    var seen = {};
    s.participants.forEach(function(p) {
      if (seen[p.id]) errors.push('参加者名が重複しています: ' + (p.label || p.id));
      seen[p.id] = true;
    });
    // 宣言のない参加者名は preview が participant 行を補うので生成はできる。
    var declared = existingIds(text);
    s.messages.forEach(function(m, i) {
      var no = 'メッセージ ' + (i + 1) + ': ';
      // 自己メッセージ (`A -> A`) は PlantUML の正当な記法。状態更新・タイマ処理で頻出する。
      if (m.from === m.to) warnings.push(no + 'From と To が同じです (自己メッセージとして追加されます)');
      [m.from, m.to].forEach(function(id) {
        if (!declared[id] && !seen[id]) warnings.push(no + '宣言のない参加者です: ' + id + ' (participant 行を補って追加されます)');
      });
      if (!m.text) warnings.push(no + 'ラベルが空です (矢印だけが追加されます)');
    });
    // 枠 (alt / loop …): else の行が枠の中の行より前にあると、else が枠を開く前に来て壊れる。
    var firstMain = -1, firstElse = -1;
    s.messages.forEach(function(m, i) {
      if (m.inBlock === 'main' && firstMain < 0) firstMain = i;
      if (m.inBlock === 'else' && firstElse < 0) firstElse = i;
    });
    if (firstElse >= 0 && firstMain >= 0 && firstElse < firstMain) {
      errors.push('else の行は、枠の中の行より後に置いてください');
    }
    if (firstElse >= 0 && ELSE_KINDS.indexOf(s.block.kind) < 0) {
      errors.push(s.block.kind + ' には else を置けません (alt / par を選んでください)');
    }
    var span = _blockSpan(s.messages);
    if (span) {
      for (var bi = span.first; bi <= span.last; bi++) {
        if (!s.messages[bi].inBlock) {
          warnings.push('メッセージ ' + (bi + 1) + ': 枠の中の行に挟まれているので、枠の中に入ります');
        }
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function _titleIndex(text) {
    var lines = _s(text).length ? String(text).split('\n') : [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+\S/i.test(lines[i])) return i;
    }
    return -1;
  }

  // 枠の中の行が並ぶ範囲 (先頭の枠行 〜 最後の枠行)。枠の行が無ければ null。
  function _blockSpan(messages) {
    var first = -1, last = -1;
    for (var i = 0; i < messages.length; i++) {
      if (!messages[i].inBlock) continue;
      if (first < 0) first = i;
      last = i;
    }
    return first < 0 ? null : { first: first, last: last };
  }

  // 追加される行を「題名 / 参加者の宣言 / 本文」に分けて返す。
  // BLK-human-20260923-2002: 宣言は参加者の欄へ、本文は挿入位置へ入るので、行き先ごとに分ける。
  function plan(text, spec) {
    var s = normalizeSpec(spec, text);
    var out = { title: '', decls: [], body: [] };
    if (s.participants.length === 0 && s.messages.length === 0) return out;
    var declared = existingIds(text);
    // タイトルを打ったなら、既定テンプレの `title Sample Sequence` は
    // その場で置き換える (白紙から起こす場面では雛形の題名は残らない)。
    if (s.title) out.title = 'title ' + s.title;

    var emitted = {};
    function emitParticipant(id, label, type) {
      if (declared[id] || emitted[id]) return;
      emitted[id] = true;
      out.decls.push(_decl(type, id, label));
    }
    s.participants.forEach(function(p) { emitParticipant(p.id, p.label, p.type); });
    // メッセージにだけ出てきた相手も宣言しておく (図に出る順を保つ)。
    s.messages.forEach(function(m) {
      emitParticipant(m.from, m.from, 'participant');
      emitParticipant(m.to, m.to, 'participant');
    });

    var span = _blockSpan(s.messages);
    var elseAt = -1;
    s.messages.forEach(function(m, i) { if (m.inBlock === 'else' && elseAt < 0) elseAt = i; });
    s.messages.forEach(function(m, i) {
      var inside = span && i >= span.first && i <= span.last;
      if (span && i === span.first) {
        out.body.push(s.block.label ? s.block.kind + ' ' + s.block.label : s.block.kind);
      }
      if (i === elseAt) out.body.push(s.block.elseLabel ? 'else ' + s.block.elseLabel : 'else');
      out.body.push((inside ? '  ' : '') + fmtMessage(m.arrow, m.from, m.to, m.text));
      if (span && i === span.last) out.body.push('end');
    });
    return out;
  }

  // 追加される行だけを返す。UI のプレビューと apply が同じ結果を見る。
  function preview(text, spec) {
    var p = plan(text, spec);
    return (p.title ? [p.title] : []).concat(p.decls, p.body);
  }

  function _insertBeforeEnd(text, newLines) {
    var lines = _s(text).length ? String(text).split('\n') : [];
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml\s*$/i.test(lines[i])) { endIdx = i; break; }
    }
    if (endIdx >= 0) {
      var args = [endIdx, 0].concat(newLines);
      lines.splice.apply(lines, args);
      return lines.join('\n');
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    var hasStart = lines.some(function(l) { return /^\s*@startuml/i.test(l); });
    if (!hasStart) lines.unshift('@startuml');
    return lines.concat(newLines, ['@enduml']).join('\n');
  }

  function _endumlIndex(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml\s*$/i.test(lines[i])) return i;
    }
    return -1;
  }

  function _hasFrame(text) {
    return /^\s*@(?:start|end)uml\b/im.test(_s(text));
  }

  // BLK-human-20260923-2002: 挿入位置を決める。anchor = { line, position: 'after'|'before', hint }
  // (hint はプレビューの当たり判定や「帯の外 / 中」の選択 { zone, bandLine })。
  // 単発の挿入と同じく sequence-activation-insert.resolve で帯の内 / 外を決める。
  // 返り値: { anchorLine, position, target (本文を入れる 1 始まりの行。その行の前に入る), zone, part, band,
  //           needsClose, bandEnd }
  //   bandEnd … 何も言われなければ帯の末尾 (deactivate の直前) に落ちる位置か。UI はそのとき「帯の外 / 中」を選ばせる。
  // anchor が無ければ null (= 図の末尾)。
  function resolveWhere(text, anchor) {
    if (!anchor || anchor.line == null) return null;
    var n = parseInt(anchor.line, 10);
    if (isNaN(n)) return null;
    var pos = anchor.position === 'before' ? 'before' : 'after';
    var AI = window.MA.sequenceActivationInsert;
    var res = AI ? AI.resolve(text, n, pos, anchor.hint) : null;
    var plain = AI ? AI.resolve(text, n, pos) : null;
    var bandEnd = !!(plain && plain.zone === 'inside' && plain.band &&
      plain.target === plain.band.deactivateLine && !plain.band.implicitEnd);
    if (!res) {
      return { anchorLine: n, position: pos, target: pos === 'before' ? n : n + 1, zone: 'none', part: null,
        band: null, needsClose: false, bandEnd: false };
    }
    return { anchorLine: n, position: pos, target: res.target, zone: res.zone, part: res.part, band: res.band,
      needsClose: res.needsClose, bandEnd: bandEnd };
  }

  // target 行 (1 始まり、その行の前に入る) を囲む枠 (alt / loop …) の開始行の文。無ければ ''。
  function _enclosingBlock(lines, target) {
    var stack = [];
    for (var i = 0; i < target - 1 && i < lines.length; i++) {
      var t = String(lines[i]).trim();
      if (/^(alt|opt|loop|par|break|critical|group)(\s|$)/.test(t)) stack.push(t);
      else if (/^end$/.test(t) && stack.length) stack.pop();
    }
    return stack.length ? stack[stack.length - 1] : '';
  }

  // フォームに出す挿入先の文。「`B --> A : res` の後、帯の外側 (B)」「図の末尾 (@enduml の前)」。
  function describeWhere(text, where) {
    if (!where) return '図の末尾 (@enduml の前)';
    var lines = _s(text).split('\n');
    var anchor = _s(lines[where.anchorLine - 1]).trim();
    var parts = ['`' + anchor + '` の' + (where.position === 'before' ? '前' : '後')];
    if (where.zone === 'inside' && where.band) parts.push('帯の内側 (' + where.part + ')');
    else if (where.zone === 'outside' && where.band) parts.push('帯の外側 (' + where.part + ')');
    var blk = _enclosingBlock(lines, where.target);
    if (blk) parts.push('「' + blk + '」の中');
    return parts.join('、');
  }

  // 1 手でシーケンス一式を書き込む。不正な spec なら text をそのまま返す
  // (呼び手が validate せずに呼んでも DSL を壊さない)。
  // where (resolveWhere の返り値) があれば本文はその位置に、無ければ図の末尾に入る。
  // 宣言はどちらでも参加者の欄 (BLK-human-20260915-1205) に入る。
  // 返り値: { text, bodyStart, bodyEnd } — 本文が入った 1 始まりの行範囲 (本文が無ければ 0)。
  function applyAt(text, spec, where) {
    var p = plan(text, spec);
    if (!p.title && p.decls.length === 0 && p.body.length === 0) return { text: text, bodyStart: 0, bodyEnd: 0 };
    // 枠の無い断片は、枠の補完ごと末尾に足す (宣言の欄も挿入位置も無い)。
    if (!_hasFrame(text)) {
      var t0 = _insertBeforeEnd(text, (p.title ? [p.title] : []).concat(p.decls, p.body));
      var e0 = _endumlIndex(t0.split('\n'));
      return { text: t0, bodyStart: p.body.length ? e0 - p.body.length + 1 : 0, bodyEnd: p.body.length ? e0 : 0 };
    }
    var lines = String(text).split('\n');
    // 本文の入る行 (0 始まりの index。この行の前に入る)。
    var at = where ? where.target - 1 : _endumlIndex(lines);
    if (at < 0 || at > lines.length) at = lines.length;
    var anchorIdx = where ? where.anchorLine - 1 : -1;
    function insertAt(idx, newLines) {
      lines.splice.apply(lines, [idx, 0].concat(newLines));
      if (idx <= at) at += newLines.length;
      if (anchorIdx >= 0 && idx <= anchorIdx) anchorIdx += newLines.length;
    }
    // title は 1 本しか置けないので、既にあれば差し替え、無ければ @startuml の直後に置く。
    if (p.title) {
      var ti = _titleIndex(lines.join('\n'));
      if (ti >= 0) {
        lines[ti] = lines[ti].match(/^(\s*)/)[1] + p.title;
      } else {
        var si = -1;
        for (var k = 0; k < lines.length; k++) { if (/^\s*@startuml/i.test(lines[k])) { si = k; break; } }
        insertAt(si + 1, [p.title]);
      }
    }
    var PZ = window.MA.seqParticipantZone;
    p.decls.forEach(function(d) {
      insertAt(PZ ? PZ.find(lines.join('\n')).insertAt : at, [d]);
    });
    if (p.body.length === 0) return { text: lines.join('\n'), bodyStart: 0, bodyEnd: 0 };
    // 閉じ忘れの帯の外に入れるときは、帯を新しい行まで伸ばさないよう先に閉じる (単発の挿入と同じ)。
    if (where && where.needsClose && where.part) {
      lines.splice(at, 0, 'deactivate ' + where.part);
      at += 1;
    }
    // 起点の行の字下げに揃える (alt の中などで既存の行が字下げされていれば、それに合わせる)。
    var indent = anchorIdx >= 0 ? (String(lines[anchorIdx] || '').match(/^(\s*)/) || ['', ''])[1] : '';
    var body = p.body.map(function(l) { return indent + l; });
    lines.splice.apply(lines, [at, 0].concat(body));
    return { text: lines.join('\n'), bodyStart: at + 1, bodyEnd: at + body.length };
  }

  function apply(text, spec, where) {
    return applyAt(text, spec, where).text;
  }

  return {
    ARROWS: ARROWS,
    PARTICIPANT_TYPES: PARTICIPANT_TYPES,
    BLOCK_KINDS: BLOCK_KINDS,
    ELSE_KINDS: ELSE_KINDS,
    existingIds: existingIds,
    normalizeId: normalizeId,
    normalizeSpec: normalizeSpec,
    fmtMessage: fmtMessage,
    validate: validate,
    plan: plan,
    preview: preview,
    resolveWhere: resolveWhere,
    describeWhere: describeWhere,
    applyAt: applyAt,
    apply: apply,
  };
})();
