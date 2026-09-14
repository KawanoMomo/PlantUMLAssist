'use strict';
window.MA = window.MA || {};

// review-carry — 「前回の review から DSL が 1 行も変わっていない」と確かめられた日に、
// 前回の指摘一覧をそのまま今回の指摘として確定する。
//
// BLK-reviewer-20260907-2203-wish: review-diff で「変更図 0 枚」は一目で分かるように
// なったが、その後も名前突合・シーケンスと状態遷移の突合・命名規約・未使用 participant・
// 粒度・章立て・シグネチャの確認を毎回フルで流していた。図が変わっていないなら
// 突合の結果も変わらないので、前回の指摘を複製して「前回から無変更のため再突合なし」と
// 1 行付けて確定できればよい。
//
// ただし無条件に複製してはいけない。図が変わっていなくても監査ツール側が変われば
// 新しい指摘が出る (event-sync でイベントカテゴリが増えたときの Adc_Ack が実例)。
// そこで「監査の構え」= 出しうる指摘カテゴリの一覧を控えに一緒に入れ、
// 構えが変わっていたら複製を断って再突合を促す。
//
// DOM には触らない。描画と結線は app.js。
window.MA.reviewCarry = (function() {
  var KEY_PREFIX = 'pua.review.carry:';

  // 複製したときに一覧の末尾に足す 1 行。
  var NOTE = '前回から無変更のため再突合なし';

  // 控えは保存フォルダごと。review-watch / review-diff と同じ区切り方にする。
  function storageKey(fileDir) {
    return KEY_PREFIX + String(fileDir == null || fileDir === '' ? './autosave' : fileDir);
  }

  function _s(v) { return v == null ? '' : String(v); }

  // ---- 監査の構え ----------------------------------------------------------

  // 監査ツールが「出しうる指摘の種類」を並べた文字列。版番号ではなくカテゴリ名で見る。
  // 版番号はモジュールが名乗らないと取れないが、カテゴリ名は実際に出る指摘の種類
  // そのものなので、名乗り忘れで「変わっていない」と誤判定しない。
  function signature(MA) {
    var ns = MA && typeof MA === 'object' ? MA : {};
    var out = [];
    if (ns.nameAudit) out.push('name');
    if (ns.methodAudit) out.push('method');
    if (ns.familyAudit) out.push('family');
    if (ns.traceCoverage) out.push('trace');
    if (ns.consistency && typeof ns.consistency.check === 'function') {
      var keys = [];
      // 空の図一式で 1 回回してカテゴリ名だけ取る (指摘は 0 件なので中身は見ない)。
      try {
        var r = ns.consistency.check([]);
        if (r && typeof r === 'object') {
          Object.keys(r).forEach(function(k) {
            if (k === 'count') return;              // 件数は構えではない
            if (typeof r[k] === 'object' && r[k] && typeof r[k].length === 'number') keys.push(k);
          });
        }
      } catch (e) { keys = ['?']; }                 // 回らないなら「不明」として毎回ちがう扱いにはしない
      keys.sort();
      out.push('consistency[' + keys.join(',') + ']');
    }
    out.sort();
    return out.join(',');
  }

  function _sigParts(sig) {
    var s = _s(sig);
    if (!s) return [];
    // consistency[...] の中のカンマで割らないように、括弧の中は数えない。
    var out = [], cur = '', depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '[') depth++;
      if (c === ']') depth--;
      if (c === ',' && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  // 構えの違いを人が読める 1 行にする。「何が増えたか」が言えないと、
  // 再突合を促されても reviewer はどこを見ればよいか分からない。
  function signatureDiffText(oldSig, newSig) {
    var a = _sigParts(oldSig), b = _sigParts(newSig);
    var added = b.filter(function(x) { return a.indexOf(x) < 0; });
    var removed = a.filter(function(x) { return b.indexOf(x) < 0; });
    var parts = [];
    if (added.length) parts.push('増えた監査: ' + added.join(' / '));
    if (removed.length) parts.push('消えた監査: ' + removed.join(' / '));
    return parts.length ? parts.join('、') : '中身が変わっています';
  }

  // ---- 指摘の集め方 --------------------------------------------------------

  // 図名 → 本文 の控えから、図をまたいだ指摘一覧を作る。
  // 並びは図名順・その中は指摘 id 順にして、複製前後で見た目が動かないようにする。
  function collectPins(reviewPins, bodies) {
    var RP = reviewPins;
    var src = bodies && typeof bodies === 'object' ? bodies : {};
    if (!RP || typeof RP.list !== 'function') return [];
    var out = [];
    Object.keys(src).sort().forEach(function(doc) {
      if (typeof src[doc] !== 'string') return;
      var pins = [];
      try { pins = RP.list(src[doc]) || []; } catch (e) { pins = []; }
      pins.forEach(function(p) {
        if (!p) return;
        out.push({
          doc: doc, id: _s(p.id), state: p.state === 'read' ? 'read' : 'open',
          author: _s(p.author), at: _s(p.at), text: _s(p.text), anchor: _s(p.anchor),
        });
      });
    });
    return out;
  }

  function makeRecord(pins, sig, at) {
    return {
      at: _s(at),
      signature: _s(sig),
      pins: (pins || []).slice(),
      notes: [],
      carriedFrom: null,
    };
  }

  // ---- 出し入れ ------------------------------------------------------------

  function _cleanRecord(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var pins = [];
    if (obj.pins && typeof obj.pins.length === 'number') {
      for (var i = 0; i < obj.pins.length; i++) {
        var p = obj.pins[i];
        if (!p || typeof p !== 'object') continue;
        pins.push({
          doc: _s(p.doc), id: _s(p.id), state: p.state === 'read' ? 'read' : 'open',
          author: _s(p.author), at: _s(p.at), text: _s(p.text), anchor: _s(p.anchor),
        });
      }
    }
    var notes = [];
    if (obj.notes && typeof obj.notes.length === 'number') {
      for (var k = 0; k < obj.notes.length; k++) {
        if (typeof obj.notes[k] === 'string') notes.push(obj.notes[k]);
      }
    }
    return {
      at: _s(obj.at), signature: _s(obj.signature), pins: pins, notes: notes,
      carriedFrom: obj.carriedFrom == null ? null : _s(obj.carriedFrom),
    };
  }

  function load(storage, fileDir) {
    if (!storage || !storage.getItem) return null;
    var raw = null;
    try { raw = storage.getItem(storageKey(fileDir)); } catch (e) { return null; }
    if (!raw) return null;
    try { return _cleanRecord(JSON.parse(raw)); } catch (e) { return null; }
  }

  function save(storage, fileDir, record) {
    if (!storage || !storage.setItem) return false;
    var rec = _cleanRecord(record);
    if (!rec) return false;
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(rec));
      return true;
    } catch (e) { return false; }
  }

  // ---- 複製できるか --------------------------------------------------------

  // now = { rows, signature }。rows は review-watch.diff の戻り
  // ({name, status})、または {changed, added} の数え上げでもよい。
  function _counts(now) {
    var n = now && typeof now === 'object' ? now : {};
    if (n.rows && typeof n.rows.length === 'number') {
      var changed = 0, added = 0;
      for (var i = 0; i < n.rows.length; i++) {
        var r = n.rows[i];
        if (!r) continue;
        if (r.status === 'changed') changed++;
        else if (r.status === 'new') added++;
      }
      return { changed: changed, added: added };
    }
    return {
      changed: typeof n.changed === 'number' ? n.changed : 0,
      added: typeof n.added === 'number' ? n.added : 0,
    };
  }

  // 返すのは { ok, reason, message, recheck, count }。
  // reason は none / no-record / changed / audit-changed。
  function plan(prev, now) {
    var c = _counts(now);
    var sig = _s((now || {}).signature);
    // 控えが無い日は全図が「新規」になる。そこで「変更がある」と言うと、
    // 図を直した覚えのない reviewer が変更を探しに行くので、控えの無さを先に言う。
    if (!prev || !prev.pins) {
      return {
        ok: false, reason: 'no-record', recheck: false, count: 0,
        message: '前回の指摘一覧の控えがありません（「ここまで見たことにする」で控えを取ってください）',
      };
    }
    if (c.changed || c.added) {
      var parts = [];
      if (c.changed) parts.push('変更 ' + c.changed + ' 枚');
      if (c.added) parts.push('新規 ' + c.added + ' 枚');
      return {
        ok: false, reason: 'changed', recheck: true, count: 0,
        message: parts.join(' / ') + 'あります。無変更ではないので複製できません',
      };
    }
    if (sig && prev.signature && sig !== prev.signature) {
      return {
        ok: false, reason: 'audit-changed', recheck: true, count: prev.pins.length,
        message: '監査ツールが前回から変わっています（' + signatureDiffText(prev.signature, sig)
          + '）。図は無変更でも新しい指摘が出るので再突合してください',
      };
    }
    return {
      ok: true, reason: 'none', recheck: false, count: prev.pins.length,
      message: '前回の指摘 ' + prev.pins.length + ' 件をそのまま今回の指摘にできます',
    };
  }

  // 前回の記録をそのまま今回の記録として複製し、末尾に注記を 1 行足す。
  // 前回が既に複製だった場合も注記は 1 行だけにする (無変更が続いた日数分
  // 同じ行が積み上がると、一覧の末尾が注記で埋まって指摘が読めなくなる)。
  function carry(prev, at, sig) {
    if (!prev || !prev.pins) return null;
    var notes = (prev.notes || []).filter(function(n) { return n !== NOTE; });
    notes.push(NOTE);
    return {
      at: _s(at),
      signature: _s(sig || prev.signature),
      pins: prev.pins.slice(),
      notes: notes,
      carriedFrom: _s(prev.at),
    };
  }

  // ---- 一覧の文字起こし ----------------------------------------------------

  // 指摘一覧をそのまま貼り出せる形にする。注記は必ず末尾。
  function formatList(record) {
    var rec = _cleanRecord(record);
    if (!rec) return '';
    var lines = [];
    var lastDoc = null;
    rec.pins.forEach(function(p) {
      if (p.doc !== lastDoc) { lines.push('# ' + p.doc); lastDoc = p.doc; }
      lines.push('- #' + p.id + ' ' + (p.state === 'read' ? '[既読]' : '[未読]') + ' ' + p.text
        + (p.anchor ? ('  — ' + p.anchor) : ''));
    });
    if (!rec.pins.length) lines.push('- 指摘なし');
    rec.notes.forEach(function(n) { lines.push(n); });
    return lines.join('\n');
  }

  // 確定済みの記録を 1 行で言う。
  function statusText(record) {
    var rec = _cleanRecord(record);
    if (!rec) return '今回の確定はまだありません';
    var head = '指摘 ' + rec.pins.length + ' 件';
    if (rec.carriedFrom) head += '（' + rec.carriedFrom + ' から複製）';
    return head + (rec.notes.length ? ' / ' + rec.notes.join(' / ') : '');
  }

  return {
    NOTE: NOTE,
    storageKey: storageKey,
    signature: signature,
    signatureDiffText: signatureDiffText,
    collectPins: collectPins,
    makeRecord: makeRecord,
    load: load,
    save: save,
    plan: plan,
    carry: carry,
    formatList: formatList,
    statusText: statusText,
  };
})();
