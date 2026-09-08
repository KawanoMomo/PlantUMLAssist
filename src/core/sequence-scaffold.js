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
      });
    });

    return { title: _s(src.title), participants: participants, messages: messages };
  }

  // 「何が足りないか」を返す。UI は確定ボタンの可否とメッセージに使う。
  function validate(spec, text) {
    var s = normalizeSpec(spec, text);
    var errors = [];
    if (s.participants.length === 0 && s.messages.length === 0) {
      errors.push('参加者かメッセージを 1 つ以上入れてください');
    }
    var seen = {};
    s.participants.forEach(function(p) {
      if (seen[p.id]) errors.push('参加者名が重複しています: ' + (p.label || p.id));
      seen[p.id] = true;
    });
    s.messages.forEach(function(m, i) {
      if (m.from === m.to) errors.push('メッセージ ' + (i + 1) + ': From と To が同じです');
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function _titleIndex(text) {
    var lines = _s(text).length ? String(text).split('\n') : [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+\S/i.test(lines[i])) return i;
    }
    return -1;
  }

  // 追加される行だけを返す。UI のプレビューと apply が同じ結果を見る。
  function preview(text, spec) {
    var s = normalizeSpec(spec, text);
    if (s.participants.length === 0 && s.messages.length === 0) return [];
    var declared = existingIds(text);
    var lines = [];
    // タイトルを打ったなら、既定テンプレの `title Sample Sequence` は
    // その場で置き換える (白紙から起こす場面では雛形の題名は残らない)。
    if (s.title) lines.push('title ' + s.title);

    var emitted = {};
    function emitParticipant(id, label, type) {
      if (declared[id] || emitted[id]) return;
      emitted[id] = true;
      lines.push(_decl(type, id, label));
    }
    s.participants.forEach(function(p) { emitParticipant(p.id, p.label, p.type); });
    // メッセージにだけ出てきた相手も宣言しておく (図に出る順を保つ)。
    s.messages.forEach(function(m) {
      emitParticipant(m.from, m.from, 'participant');
      emitParticipant(m.to, m.to, 'participant');
    });
    s.messages.forEach(function(m) {
      lines.push(fmtMessage(m.arrow, m.from, m.to, m.text));
    });
    return lines;
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

  // 1 手でシーケンス一式を書き込む。不正な spec なら text をそのまま返す
  // (呼び手が validate せずに呼んでも DSL を壊さない)。
  function apply(text, spec) {
    var lines = preview(text, spec);
    if (lines.length === 0) return text;
    var out = text;
    // title は 1 本しか置けないので、既にあれば差し替えて挿入行からは外す。
    if (lines.length && /^title\s/.test(lines[0])) {
      var idx = _titleIndex(out);
      if (idx >= 0) {
        var ls = String(out).split('\n');
        ls[idx] = ls[idx].match(/^(\s*)/)[1] + lines[0];
        out = ls.join('\n');
        lines = lines.slice(1);
      }
    }
    if (lines.length === 0) return out;
    return _insertBeforeEnd(out, lines);
  }

  return {
    ARROWS: ARROWS,
    PARTICIPANT_TYPES: PARTICIPANT_TYPES,
    existingIds: existingIds,
    normalizeId: normalizeId,
    normalizeSpec: normalizeSpec,
    fmtMessage: fmtMessage,
    validate: validate,
    preview: preview,
    apply: apply,
  };
})();
