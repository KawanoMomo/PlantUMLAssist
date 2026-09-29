'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlUsecase = (function() {
  var DU = window.MA.dslUtils;
  var RP = window.MA.regexParts;

  // ─── Regex 構築 ─────────────────────────────────────────────────────────
  var ID = RP.IDENTIFIER;             // [A-Za-z_][A-Za-z0-9_]*
  var QN = RP.QUOTED_NAME;            // "[^"]+"
  // Note: RP.QUOTED_NAME ('"[^"]+"') is non-capturing; for actor/usecase keyword
  // forms we need to capture the inner label, so we inline `"([^"]+)"` here.

  // actor: `actor X` / `actor "L" as X` / `actor X as "L"`
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var ACTOR_KW_RE = new RegExp(
    '^actor\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // actor short: `:X:` / `:Label: as Alias`
  var ACTOR_SHORT_RE = /^:([^:]+):(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  // usecase: `usecase X` / `usecase "L" as X` / `usecase X as "L"`
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var USECASE_KW_RE = new RegExp(
    '^usecase\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // usecase short: `(Label)` / `(Label) as Alias`
  var USECASE_SHORT_RE = /^\(([^)]+)\)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  // package open: `package "Label" {` / `package L {` / `rectangle "Label" {` / `rectangle L {`
  var PACKAGE_OPEN_RE = new RegExp(
    '^(?:package|rectangle)\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );
  var PACKAGE_CLOSE_RE = /^\s*\}\s*$/;

  // Relation arrows (longest first to avoid prefix matches):
  // <|-- / --|>  → generalization
  // ..> / <..    → dotted (association unless include/extend stereotype)
  // --> / <--    → solid association
  // -- / -       → undirected
  var RELATION_RE = new RegExp(
    '^(' + ID + '|' + QN + ')\\s+(<\\|--|--\\|>|\\.\\.>|<\\.\\.|-->|<--|--|<-)\\s+(' + ID + '|' + QN + ')(?:\\s*:\\s*(.+))?$'
  );

  // ─── Formatters (canonical emit, ADR-105 keyword-first) ───────────────
  function fmtActor(id, label) {
    if (label && label !== id) return 'actor "' + label + '" as ' + id;
    return 'actor ' + id;
  }
  function fmtUsecase(id, label) {
    if (label && label !== id) return 'usecase "' + label + '" as ' + id;
    return 'usecase ' + id;
  }
  // design 5d: 境界の表記 (UseCase は package / rectangle)。
  function fmtPackage(label, notation) {
    return window.MA.groupNotation.fmtOpen(notation, label, 'plantuml-usecase');
  }
  // rootFirst: 汎化を矢の根元 (子) から書く (`子 --|> 親`)。from / to は記法の左右 (from = 親) で渡す。
  function fmtRelation(kind, from, to, label, rootFirst) {
    var lbl = label || '';
    if (kind === 'generalization') return rootFirst ? to + ' --|> ' + from : from + ' <|-- ' + to;
    if (kind === 'include') return from + ' ..> ' + to + ' : <<include>>';
    if (kind === 'extend') return from + ' ..> ' + to + ' : <<extend>>';
    // association (default)
    return from + ' --> ' + to + (lbl ? ' : ' + lbl : '');
  }

  // ─── Add operations (pure: text + args → text) ────────────────────────
  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function _existingUsecaseIdSet(parsed) {
    var set = {};
    var elts = (parsed && parsed.elements) || [];
    elts.forEach(function(e) { if (e.id) set[e.id] = true; });
    return set;
  }

  function normalizeIdInput(rawInput, parsed, prefix) {
    return window.MA.idNormalizer.normalize(rawInput, _existingUsecaseIdSet(parsed), prefix || 'U');
  }

  function addActor(text, id, label) { return insertBeforeEnd(text, fmtActor(id, label || id)); }
  function addUsecase(text, id, label) { return insertBeforeEnd(text, fmtUsecase(id, label || id)); }
  function addPackage(text, label, notation) {
    var open = fmtPackage(label, notation);
    return insertBeforeEnd(insertBeforeEnd(text, open), '}');
  }
  // 本文の汎化の書き方 (`親 <|-- 子` / `子 --|> 親`) の多い方に揃えて書く (BLK-owner-20260929-0351-1)。
  function _rootFirstIn(text) {
    var R = window.MA.relationRoles;
    return !!(R && R.prefersRootFirst && R.prefersRootFirst(text));
  }
  function relationLine(text, kind, from, to, label) {
    return fmtRelation(kind, from, to, label, _rootFirstIn(text));
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, relationLine(text, kind, from, to, label));
  }

  // フォームの上の欄 (From) は矢の根元。汎化は子が根元なので、記法の左右と入れ替える。
  function _uiToModel(kind, uiFrom, uiTo) {
    return kind === 'generalization' ? { from: uiTo, to: uiFrom } : { from: uiFrom, to: uiTo };
  }
  function _fieldLabel(kind, side) {
    if (kind === 'generalization') return side === 'to' ? '親 (To)' : '子 (From)';
    return side === 'to' ? '終点 (To)' : '始点 (From)';
  }

  // design 5d: UseCase の「その他パレット」の ノート。書式は図種で変わらないので
  // src/core/note-block.js に置いた純関数をそのまま使う。
  function addNote(text, targetId, position, noteText) {
    var out = text;
    window.MA.noteBlock.format(position, targetId, noteText || '').forEach(function(l) {
      out = insertBeforeEnd(out, l);
    });
    return out;
  }
  function updateNote(text, startLine, endLine, fields) {
    return window.MA.noteBlock.update(text, startLine, endLine, fields);
  }
  function deleteNote(text, startLine, endLine) {
    return window.MA.noteBlock.remove(text, startLine, endLine);
  }

  // 既にある境界の表記だけを差し替える (ラベル・中身・閉じ括弧はそのまま)。
  function changeGroupNotation(text, lineNum, notation) {
    return window.MA.groupNotation.changeNotation(text, lineNum, notation, 'plantuml-usecase');
  }

  // ─── Bulk tail add (1 行 = 1 件) ──────────────────────────────────────
  // 要素は `actor User` / `:User:`(アクター)、`usecase 起動` / `(起動)` / 装飾なし(ユースケース)。
  // `Alias : Label` で表示名を指定できる。関係は
  //   `A --> B : label`(association) / `A <|-- B`(generalization) /
  //   `A ..> B : extend`(extend) / `A ..> B`(include)。
  var UC_BULK_ARROW_RE = /\s(<\|--|--\|>|\.\.>|\.\.|-->|->|--)\s/;

  function _ucStripDeco(s) {
    var t = String(s || '').trim();
    t = t.replace(/^:(.*):$/, '$1').replace(/^\((.*)\)$/, '$1')
         .replace(/^(actor|usecase)\s+/i, '');
    return t.replace(/^"(.*)"$/, '$1').trim();
  }

  function _ucArrowKind(arrow, label) {
    if (arrow === '<|--' || arrow === '--|>') return 'generalization';
    if (arrow === '..>' || arrow === '..') {
      return /extend/i.test(label || '') ? 'extend' : 'include';
    }
    return 'association';
  }

  function parseBulkLines(block) {
    var out = [];
    if (!block) return out;
    var lines = String(block).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s || s.indexOf("'") === 0 || s.indexOf('#') === 0) continue;
      var am = s.match(UC_BULK_ARROW_RE);
      if (am) {
        var pos = s.indexOf(am[0]);
        var left = s.slice(0, pos);
        var rest = s.slice(pos + am[0].length);
        var lbl = '';
        var ci = rest.indexOf(':');
        if (ci >= 0) { lbl = rest.slice(ci + 1).trim(); rest = rest.slice(0, ci); }
        var from = _ucStripDeco(left);
        var to = _ucStripDeco(rest);
        if (!from || !to) continue;
        var kind = _ucArrowKind(am[1], lbl);
        var arrow = am[1];
        if (arrow === '--|>') { var sw = from; from = to; to = sw; }
        out.push({
          op: 'relation', kind: kind, from: from, to: to,
          // include/extend/generalization のラベルは記法側に持つので捨てる
          label: kind === 'association' ? lbl : '',
        });
        continue;
      }
      var isActor = /^actor\s+/i.test(s) || /^:.*:$/.test(s);
      var body = s.replace(/^(actor|usecase)\s+/i, '').replace(/^:(.*):$/, '$1');
      var label2 = '';
      var ci2 = body.indexOf(':');
      if (ci2 >= 0) { label2 = body.slice(ci2 + 1).trim(); body = body.slice(0, ci2); }
      var id = _ucStripDeco(body);
      if (!id) continue;
      out.push({ op: isActor ? 'actor' : 'usecase', id: id, label: label2 });
    }
    return out;
  }

  // 要素を先に全部宣言してから関係を並べるので、入力順は問わない。
  function addBulk(text, block, parsed) {
    var ops = parseBulkLines(block);
    var out = text;
    var idMap = {};
    var taken = _existingUsecaseIdSet(parsed || { elements: [] });
    var i;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.op !== 'actor' && o.op !== 'usecase') continue;
      var norm = window.MA.idNormalizer.normalize(o.id, taken, o.op === 'actor' ? 'A' : 'U');
      if (!norm.valid) continue;
      idMap[o.id] = norm.id;
      taken[norm.id] = true;
      var lbl = o.label || norm.label || o.id;
      out = (o.op === 'actor') ? addActor(out, norm.id, lbl) : addUsecase(out, norm.id, lbl);
    }
    for (i = 0; i < ops.length; i++) {
      var r = ops[i];
      if (r.op !== 'relation') continue;
      out = addRelation(out, r.kind, idMap[r.from] || r.from, idMap[r.to] || r.to, r.label);
    }
    return out;
  }

  // ─── Update operations (pure: text + lineNum + field/value → text) ───
  function updateActor(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(ACTOR_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(ACTOR_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtActor(id, label);
    return lines.join('\n');
  }

  function updateUsecase(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(USECASE_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(USECASE_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + fmtUsecase(id, label);
    return lines.join('\n');
  }

  function updateRelation(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var deco = window.MA.relationOptions.decorationsOf(lines[idx]);
    var m = window.MA.relationOptions.readableLine(trimmed).match(RELATION_RE);
    if (!m) return text;
    var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
    var from = DU.unquote(fromRaw), to = DU.unquote(toRaw);
    var kind = 'association';
    // `子 --|> 親` は parse と同じく from = 親 / to = 子 に読み、直したあとも同じ書き方で書く
    // (従来は左右を読み替えずに `子 <|-- 親` と書き直し、親子が逆になっていた)。
    var rootFirst = (arrow === '--|>');
    if (rootFirst) { var sw0 = from; from = to; to = sw0; }
    if (arrow === '<|--' || arrow === '--|>') kind = 'generalization';
    else if (lbl === '<<include>>') kind = 'include';
    else if (lbl === '<<extend>>') kind = 'extend';

    if (field === 'kind') {
      kind = value;
      // When changing kind, also reset label appropriately
      if (kind === 'include') lbl = '<<include>>';
      else if (kind === 'extend') lbl = '<<extend>>';
      else if (kind === 'association') lbl = '';
    } else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') lbl = value;
    else if (field === 'swap') { var sw1 = from; from = to; to = sw1; }

    // 多重度・線の色は種別やラベルの書き換えでは失われない (design 3c)。
    lines[idx] = window.MA.relationOptions.applyDecorations(
      indent + fmtRelation(kind, from, to, lbl, rootFirst), deco);
    return lines.join('\n');
  }

  // ─── Line operations (delete / move / setTitle) ────────────────────────
  function deleteLine(text, lineNum) {
    return window.MA.textUpdater.deleteLine(text, lineNum);
  }

  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;

  // ─── renameWithRefs: rename id and update all references ──────────────
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

  function setTitle(text, newTitle) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+/.test(lines[i])) {
        var indent = lines[i].match(/^(\s*)/)[1];
        lines[i] = indent + 'title ' + newTitle;
        return lines.join('\n');
      }
    }
    for (var j = 0; j < lines.length; j++) {
      if (RP.isStartUml(lines[j])) {
        lines.splice(j + 1, 0, 'title ' + newTitle);
        return lines.join('\n');
      }
    }
    return text;
  }

  // ─── Parser ─────────────────────────────────────────────────────────────
  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [], notes: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    var packageStack = [];
    var packageCounter = 0;

    // 注釈は行を跨ぐ (`note left of X` … `end note`) ので、要素の走査とは別に
    // 1 回で拾う。注釈の中の本文行が actor / relation として読まれないよう、
    // 拾った範囲は下の走査で飛ばす。
    // note-block が読み込まれていない環境 (単体テストが window を差し替えた後など)
    // でも、注釈が出ないだけで要素と関係は読めるようにする。
    var NB = window.MA.noteBlock;
    result.notes = NB ? NB.collect(text) : [];
    var inNote = {};
    result.notes.forEach(function(n) {
      for (var ln = n.line; ln <= n.endLine; ln++) inNote[ln] = true;
    });

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (inNote[lineNum]) continue;
      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;

      // package open
      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var label0 = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var parent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', notation: (window.MA.groupNotation.notationOf(trimmed) || 'package'), id: pkgId, label: label0, startLine: lineNum, endLine: 0, parentId: parent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }
      // package close
      if (PACKAGE_CLOSE_RE.test(lines[i])) {
        if (packageStack.length > 0) {
          var closing = packageStack.pop();
          closing.endLine = lineNum;
        }
        continue;
      }

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;

      var m;
      var id, label;
      // actor keyword form
      m = trimmed.match(ACTOR_KW_RE);
      if (m) {
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'actor', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // actor short form
      m = trimmed.match(ACTOR_SHORT_RE);
      if (m) {
        label = m[1].trim();
        id = m[2] || label;
        result.elements.push({ kind: 'actor', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // usecase keyword form
      m = trimmed.match(USECASE_KW_RE);
      if (m) {
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'usecase', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // usecase short form
      m = trimmed.match(USECASE_SHORT_RE);
      if (m) {
        label = m[1].trim();
        id = m[2] || label;
        result.elements.push({ kind: 'usecase', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        continue;
      }
      // relation
      m = window.MA.relationOptions.readableLine(trimmed).match(RELATION_RE);
      if (m) {
        var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
        var from = DU.unquote(fromRaw);
        var to = DU.unquote(toRaw);
        var kind = 'association';
        if (arrow === '<|--' || arrow === '--|>') {
          kind = 'generalization';
          // canonicalize direction: parent <|-- child (swap if --|>)
          if (arrow === '--|>') { var tmp = from; from = to; to = tmp; arrow = '<|--'; }
        } else if (lbl === '<<include>>') {
          kind = 'include';
        } else if (lbl === '<<extend>>') {
          kind = 'extend';
        }
        result.relations.push({
          id: '__r_' + result.relations.length,
          kind: kind, from: from, to: to, arrow: arrow, label: lbl, line: lineNum,
        });
        continue;
      }
    }
    return result;
  }

  // ─── Property Panel ─────────────────────────────────────────────────────
  function renderProps(selData, parsedData, propsEl, ctx) {
    // 注釈は element でも relation でもないので、共通のディスパッチに乗る前に拾う
    // (class.js の note と同じ扱い)。
    if (selData && selData.length === 1 && selData[0].type === 'note') {
      var notes = parsedData.notes || [];
      for (var i = 0; i < notes.length; i++) {
        if (notes[i].id === selData[0].id) {
          _renderNoteEdit(notes[i], parsedData, propsEl, ctx);
          return;
        }
      }
    }
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(parsed, el) { _renderNoSelection(parsed, el, ctx); },
      onElement: function(elt, parsed, el) { _renderElementEdit(elt, parsed, el, ctx); },
      onRelation: function(rel, parsed, el) { _renderRelationEdit(rel, parsed, el, ctx); },
      onGroup: function(grp, parsed, el) { _renderGroupReadOnly(grp, parsed, el, ctx); },
      onMultiSelectConnect: function(sel, parsed, el) { _renderMultiSelectConnect(sel, parsed, el, ctx); },
      onMultiSelect: function(sel, parsed, el) { _renderMultiSelect(sel, el); },
    });
  }

  // BLK-junior-20260909-0403-wish: シーケンス図からアクター・ユースケース候補。
  // 判断は core/usecase-source.js に置き、ここは並べて選ばせるだけ。
  // アクターとユースケースを 1 枚の一覧に混ぜず 2 段に分けるのは、
  // 「誰が使うか」と「何をするか」が別の問いだから — 混ぜると選ぶ側が読み分ける。
  function _renderSourceCandidates(parsedData, ctx) {
    var US = window.MA.usecaseSource;
    var P = window.MA.properties;
    var esc = window.MA.htmlUtils.escHtml;
    var sumEl = document.getElementById('uc-src-summary');
    var bodyEl = document.getElementById('uc-src-body');
    if (!US || !sumEl || !bodyEl) return;

    var ws = window.MA.workspace;
    var docs = (ws && ws.list) ? ws.list() : [];
    var activeId = (ws && ws.getActiveId) ? ws.getActiveId() : null;
    var dsl = ctx.getMmdText();

    var subjOpts0 = US.subjects(docs, activeId);
    if (!subjOpts0.length) {
      sumEl.textContent = '同じ部品のシーケンス図がまだありません';
      sumEl.setAttribute('data-actors', '0');
      sumEl.setAttribute('data-usecases', '0');
      bodyEl.innerHTML = '';
      return;
    }

    // 起点になる部品。既定は今の図の名前と語が重なるもの。選び直したら引き直す。
    var activeName = '';
    for (var di = 0; di < docs.length; di++) {
      if (docs[di] && docs[di].id === activeId) activeName = docs[di].name || '';
    }
    var hint = activeName + ' ' + ((parsedData && parsedData.meta && parsedData.meta.title) || '');
    var subjEl0 = document.getElementById('uc-src-subject');
    var subject = (subjEl0 && subjEl0.value) || US.defaultSubject(docs, activeId, hint);
    var res = US.candidates(dsl, docs, activeId, subject);

    sumEl.textContent = US.summaryText(res);
    sumEl.setAttribute('data-actors', String(res.actors.length));
    sumEl.setAttribute('data-usecases', String(res.usecases.length));

    var rowsAll = res.actors.concat(res.usecases);
    var subjOpts = subjOpts0.map(function(s) {
      return { value: s.id, label: s.label, selected: s.id === subject };
    });

    function rowHtml(r) {
      var i = rowsAll.indexOf(r);
      return '<label class="uc-src-row" data-src-key="' + esc(r.key) + '" data-src-kind="' + esc(r.kind) + '"'
        + ' style="display:flex;align-items:flex-start;gap:6px;padding:3px 4px;border-radius:3px;cursor:pointer;">'
        + '<input type="checkbox" class="uc-src-check" data-i="' + i + '" style="margin-top:2px;">'
        + '<span style="flex:1;">'
          + '<span style="font-size:12px;color:var(--text-primary);">' + esc(r.name) + '</span>'
          + '<span style="display:block;font-size:10px;color:var(--text-secondary);line-height:1.4;">'
            + esc(r.why) + '</span>'
        + '</span>'
      + '</label>';
    }

    function section(title, list, emptyText, id) {
      return '<div style="margin-top:6px;">'
        + '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">' + title + '</div>'
        + '<div id="' + id + '" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);'
          + 'border-radius:3px;padding:4px;">'
        + (list.length ? list.map(rowHtml).join('')
            : '<div style="font-size:10px;color:var(--text-secondary);">' + emptyText + '</div>')
        + '</div></div>';
    }

    bodyEl.innerHTML =
      P.selectFieldHtml('部品 (起点)', 'uc-src-subject', subjOpts) +
      section('アクター候補 — 誰が使うか', res.actors, '候補はすべて図にあります', 'uc-src-actors') +
      section('ユースケース候補 — 何をするか', res.usecases, '候補はすべて図にあります', 'uc-src-usecases') +
      P.primaryButtonHtml('uc-src-add', '+ 選んだ候補を追加') +
      '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
        'アクターと、そのアクターが呼んでいるユースケースを一緒に選ぶと関連の線も引かれます</div>';

    P.bindEvent('uc-src-subject', 'change', function() {
      _renderSourceCandidates(parsedData, ctx);
    });

    P.bindEvent('uc-src-add', 'click', function() {
      var picks = [];
      var checks = document.querySelectorAll('#uc-src-body .uc-src-check');
      for (var i = 0; i < checks.length; i++) {
        if (checks[i].checked) picks.push(rowsAll[Number(checks[i].getAttribute('data-i'))]);
      }
      if (!picks.length) { alert('追加する候補を選んでください'); return; }
      var block = US.blockFor(picks);
      var t = ctx.getMmdText();
      var out = addBulk(t, block, parsedData);
      if (out === t) { alert('追加できる行がありません'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(out);
      ctx.onUpdate();
    });
  }

  // BLK-junior-20260909-0403: ひな形は「白紙 (新規タブのサンプルのまま)」に置く
  // ものなので、既に描き始めている図では黙って捨てない。3 件以上の要素があるときだけ
  // 確認する (サンプルの actor User / usecase Login は白紙とみなす)。
  function _bindStarter(parsedData, ctx) {
    var P = window.MA.properties;
    var DS = window.MA.driverUsecaseStarter;
    var inputEl = document.getElementById('uc-starter-subject');
    var hintEl = document.getElementById('uc-starter-hint');
    if (!DS || !inputEl || !hintEl) return;
    var refresh = function() {
      hintEl.textContent = DS.summary(DS.plan(inputEl.value));
    };
    inputEl.addEventListener('input', refresh);
    refresh();

    P.bindEvent('uc-starter-add', 'click', function() {
      var plan = DS.plan(inputEl.value);
      if (!plan) { alert('題材名を入れてください (例: GPIO)'); return; }
      var count = (parsedData.elements || []).length;
      if (count >= 3 && !window.confirm('今の図の ' + count + ' 件を、'
        + plan.display + ' ドライバのひな形で置き換えます。よろしいですか')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(DS.dsl(inputEl.value));
      ctx.onUpdate();
    });
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var GP = window.MA.groupPlace;
    var elements = parsedData.elements || [];
    var actors = elements.filter(function(e) { return e.kind === 'actor'; });
    var usecases = elements.filter(function(e) { return e.kind === 'usecase'; });

    var html =
      // design 7a / 2b (BLK-builder-20260924-1829-4): 英語の図種名の行は出さない (図種は左レールと HUD が言う)
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'uc-tail-kind', [
          { value: 'actor',    label: 'アクター (actor)', selected: true },
          { value: 'usecase',  label: 'ユースケース (usecase)' },
          { value: 'package',  label: '境界 (package / rectangle)' },
          { value: 'relation', label: '関係' },
          { value: 'note',     label: '注釈 (note)' },
          { value: 'bulk',     label: 'まとめて (複数行)' },
        ]) +
        '<div id="uc-tail-detail" style="margin-top:6px;"></div>' +
      '</div>' +
      // BLK-junior-20260909-0403-wish: 同じ部品のシーケンス図から、誰が使うか
      // (アクター) と何をするか (ユースケース) の候補を出す。白紙から考えて
      // 一括入力欄に打つ代わり。
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
          'シーケンス図から候補</label>' +
        '<div id="uc-src-summary" style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;line-height:1.5;"></div>' +
        '<div id="uc-src-body"></div>' +
      '</div>' +
      // BLK-junior-20260909-0403: 手本になる図が 1 枚も無いところから始まる場面。
      // ドライバのユースケース図は題材が替わっても骨格が同じなので、題材名 1 語で
      // 下書きを作る (アクター・ユースケース・関連の 15 行を打ち直させない)。
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
          '白紙から: ドライバのひな形</label>' +
        P.fieldHtml('題材名', 'uc-starter-subject', '', '例: GPIO / UART / CAN') +
        '<div id="uc-starter-hint" style="font-size:10px;color:var(--text-secondary);margin:-4px 0 6px;line-height:1.5;"></div>' +
        P.primaryButtonHtml('uc-starter-add', '＋ ひな形を作る') +
        '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
          '開発者・RTOS と、初期化 / ピンモード設定 / 読み取り / 書き込み / 割り込み設定 / 割り込み通知 の下書きです。' +
          '要らない行はそのまま消して使えます</div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">' +
        'DSL エディタで行をクリックすると編集パネルが開きます (v0.5.0 で SVG クリック対応予定)' +
      '</div>';
    propsEl.innerHTML = html;

    _bindStarter(parsedData, ctx);

    _renderSourceCandidates(parsedData, ctx);


    // 末尾追加 detail switcher
    var renderTailDetail = function() {
      var kind = document.getElementById('uc-tail-kind').value;
      var detailEl = document.getElementById('uc-tail-detail');
      // 表示名と識別子がずれている要素は「ラベル (id)」で出す。日本語を打つと
      // 識別子は自動採番されるので、プルダウンの表示が DSL のどの行を指すのか
      // 併記しないと選び直すときに確信が持てない (BLK-junior-20260908-0630)。
      var AH = window.MA.aliasHint;
      var actorOpts = actors.map(function(a) { return { value: a.id, label: AH.optionLabel(a.id, a.label) }; });
      var usecaseOpts = usecases.map(function(u) { return { value: u.id, label: AH.optionLabel(u.id, u.label) }; });
      // Alias 欄の下の 1 行。打った文字がどの識別子になるかを打っている最中に出す。
      function aliasHintHtml() {
        return '<div id="uc-tail-alias-hint" style="margin:-4px 0 8px;font-size:10px;' +
          'color:var(--text-secondary);line-height:1.5;min-height:1.4em;"></div>';
      }
      function bindAliasHint(prefix) {
        var inputEl = document.getElementById('uc-tail-alias');
        var hintEl = document.getElementById('uc-tail-alias-hint');
        if (!inputEl || !hintEl) return;
        var taken = _existingUsecaseIdSet(parsedData);
        var refresh = function() {
          hintEl.textContent = AH.hintFor(inputEl.value, taken, prefix).text;
        };
        inputEl.addEventListener('input', refresh);
        refresh();
      }
      var allOpts = actorOpts.concat(usecaseOpts);
      if (allOpts.length === 0) allOpts = [{ value: '', label: '（要素なし）' }];
      var html = '';
      if (kind === 'actor') {
        html =
          P.fieldHtml('名前 (識別子)', 'uc-tail-alias', '', '例: User（日本語は表示名になります）') +
          aliasHintHtml() +
          P.fieldHtml('表示名', 'uc-tail-label', '', '省略可、名前と異なる場合に表示用') +
          GP.fieldHtml('usecase', 'uc-tail', parsedData.groups) +
          P.primaryButtonHtml('uc-tail-add', '+ 追加');
      } else if (kind === 'usecase') {
        html =
          P.fieldHtml('名前 (識別子)', 'uc-tail-alias', '', '例: L1（日本語は表示名になります）') +
          aliasHintHtml() +
          P.fieldHtml('表示名', 'uc-tail-label', '', '省略可、名前と異なる場合に表示用') +
          GP.fieldHtml('usecase', 'uc-tail', parsedData.groups) +
          P.primaryButtonHtml('uc-tail-add', '+ 追加');
      } else if (kind === 'package') {
        html =
          P.fieldHtml('表示名', 'uc-tail-label', '', '例: Auth Module') +
          P.selectFieldHtml('表記', 'uc-tail-notation', window.MA.groupNotation
            .notationsFor('plantuml-usecase').map(function(n, i) {
              return { value: n.id, label: n.label + ' — ' + n.hint, selected: i === 0 };
            })) +
          P.primaryButtonHtml('uc-tail-add', '+ 追加');
      } else if (kind === 'relation') {
        html =
          P.selectFieldHtml('種類', 'uc-tail-rkind', [
            { value: 'association',    label: 'Association (-->)', selected: true },
            { value: 'generalization', label: 'Generalization (<|--)' },
            { value: 'include',        label: 'Include (..> <<include>>)' },
            { value: 'extend',         label: 'Extend (..> <<extend>>)' },
          ]) +
          P.selectFieldHtml(_fieldLabel('association', 'from'), 'uc-tail-from', allOpts) +
          P.selectFieldHtml(_fieldLabel('association', 'to'), 'uc-tail-to', allOpts) +
          P.fieldHtml('ラベル', 'uc-tail-rlabel', '', 'association のみ任意') +
          P.primaryButtonHtml('uc-tail-add', '+ 追加');
      } else if (kind === 'note') {
        // 注釈は必ず既存の要素に付く。付ける相手が無いうちは足させない
        // (`note left of` の後ろが空の DSL は PlantUML が描けない)。
        html =
          P.selectFieldHtml('付ける相手', 'uc-tail-ntarget', allOpts) +
          P.selectFieldHtml('位置', 'uc-tail-npos', [
            { value: 'left',   label: 'Left', selected: true },
            { value: 'right',  label: 'Right' },
            { value: 'top',    label: 'Top' },
            { value: 'bottom', label: 'Bottom' },
          ]) +
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">本文 (Enter で追加 / Shift+Enter で改行)</label>' +
          '<textarea id="uc-tail-ntext" style="width:100%;min-height:60px;font-family:inherit;font-size:12px;"></textarea>' +
          P.primaryButtonHtml('uc-tail-add', '+ 追加');
      } else if (kind === 'bulk') {
        html =
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">要素と関係を 1 行 1 件で</label>' +
          window.MA.reuseModal.buttonHtml('uc-tail-reuse') +
          '<textarea id="uc-tail-bulk" style="width:100%;min-height:90px;font-family:inherit;font-size:12px;"></textarea>' +
          P.primaryButtonHtml('uc-tail-add', '+ まとめて追加') +
          '<div id="uc-tail-bulk-hint" style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
            'actor 開発者 / :Tester: (アクター) / 起動 / (診断実行) : ラベル (ユースケース) /<br>' +
            'A --&gt; B : label / A ..&gt; B(include) / A ..&gt; B : extend / A &lt;|-- B。空行は無視されます</div>';
      }
      detailEl.innerHTML = html;
      // BLK-primary-20260923-2312-friction: 関係を続けて足すとき、種類と From は前回選んだまま
      // (次の 1 本は To を選ぶだけ)。カードは select の値で描くので、戻してから載せる。
      if (kind === 'relation' && window.MA.tailMemory) {
        window.MA.tailMemory.bindSelect('uc-tail-rkind');
        window.MA.tailMemory.bindSelect('uc-tail-from');
      }
      if (kind === 'relation') {
        window.MA.relationKindCards.mountForSelect('uc-tail-rkind', 'usecase');
        // 欄の呼び名は種類で替える (汎化は 子 (From) / 親 (To)。From は矢の根元)。
        var ucKindEl = document.getElementById('uc-tail-rkind');
        var ucRoleLabels = function() {
          ['from', 'to'].forEach(function(side) {
            var sel = document.getElementById('uc-tail-' + side);
            var lab = sel && sel.previousElementSibling;
            if (lab && lab.tagName === 'LABEL') lab.textContent = _fieldLabel(ucKindEl.value, side);
          });
        };
        if (ucKindEl) { ucKindEl.addEventListener('change', ucRoleLabels); ucRoleLabels(); }
      }
      if (kind === 'actor') bindAliasHint('A');
      else if (kind === 'usecase') bindAliasHint('U');
      // 一括欄は「既に他の図にある行」を打ち直させないためのボタンを持つ。
      window.MA.reuseModal.bindButton('uc-tail-reuse', 'plantuml-usecase', 'uc-tail-bulk');

      P.bindEvent('uc-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var out = t;
        if (kind === 'actor') {
          var rawAl = document.getElementById('uc-tail-alias').value;
          var normAc = normalizeIdInput(rawAl, parsedData, 'A');
          if (!normAc.valid) { alert('Alias 必須'); return; }
          var rawLbl = document.getElementById('uc-tail-label').value.trim();
          window.MA.history.pushHistory();
          out = addActor(t, normAc.id, rawLbl || normAc.label);
          out = GP.applyAdd('usecase', 'uc-tail', parsedData.groups, t, out);
        } else if (kind === 'usecase') {
          var rawAl2 = document.getElementById('uc-tail-alias').value;
          var normUc = normalizeIdInput(rawAl2, parsedData, 'U');
          if (!normUc.valid) { alert('Alias 必須'); return; }
          var rawLbl2 = document.getElementById('uc-tail-label').value.trim();
          window.MA.history.pushHistory();
          out = addUsecase(t, normUc.id, rawLbl2 || normUc.label);
          out = GP.applyAdd('usecase', 'uc-tail', parsedData.groups, t, out);
        } else if (kind === 'package') {
          var lbl = document.getElementById('uc-tail-label').value.trim();
          if (!lbl) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          var notaEl = document.getElementById('uc-tail-notation');
          out = addPackage(t, lbl, notaEl ? notaEl.value : 'package');
          // 作った直後の境界を次の「追加する位置」にする (続けて中身を足せる)。
          GP.remember('usecase', lbl);
        } else if (kind === 'relation') {
          var fr = document.getElementById('uc-tail-from').value;
          var to = document.getElementById('uc-tail-to').value;
          if (!fr || !to) { alert('From/To 必須 (先に actor/usecase を追加)'); return; }
          var rkind = document.getElementById('uc-tail-rkind').value;
          if (window.MA.tailMemory) {
            window.MA.tailMemory.setField('uc-tail-rkind', rkind);
            window.MA.tailMemory.setField('uc-tail-from', fr);
          }
          var ucEnds = _uiToModel(rkind, fr, to);
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, ucEnds.from, ucEnds.to, document.getElementById('uc-tail-rlabel').value.trim());
        } else if (kind === 'note') {
          var ntarget = document.getElementById('uc-tail-ntarget').value;
          if (!ntarget) { alert('Target 必須 (先に actor/usecase を追加)'); return; }
          window.MA.history.pushHistory();
          out = addNote(t, ntarget,
            document.getElementById('uc-tail-npos').value,
            document.getElementById('uc-tail-ntext').value);
        } else if (kind === 'bulk') {
          var block = document.getElementById('uc-tail-bulk').value;
          var bulkOut = addBulk(t, block, parsedData);
          if (bulkOut === t) { alert('追加できる行がありません'); return; }
          window.MA.history.pushHistory();
          out = bulkOut;
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('uc-tail-kind').addEventListener('change', renderTailDetail);
    // design 2b: 種別はチップ 1 クリックで決める。値の持ち主は上の select のまま。
    window.MA.tailKindChips.mount('uc-tail-kind');
    renderTailDetail();
  }

  // 注釈の編集。付ける相手 (Target) は動かさない — 付け替えは実質「別の注釈」なので、
  // 消して足す操作に寄せる (class.js の note パネルと同じ判断)。
  function _renderNoteEdit(note, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var esc = window.MA.htmlUtils.escHtml;
    propsEl.innerHTML =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Note (L' + note.line + ')</div>' +
      '<div style="margin-bottom:6px;font-size:11px;"><b>Target:</b> ' + esc(note.targetId) +
        ' <span style="color:var(--text-secondary);">(付け替えは削除して追加)</span></div>' +
      P.selectFieldHtml('Position', 'uc-note-pos', [
        { value: 'left',   label: 'Left',   selected: note.position === 'left' },
        { value: 'right',  label: 'Right',  selected: note.position === 'right' },
        { value: 'top',    label: 'Top',    selected: note.position === 'top' },
        { value: 'bottom', label: 'Bottom', selected: note.position === 'bottom' },
      ]) +
      '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label>' +
      '<textarea id="uc-note-text" style="width:100%;min-height:70px;font-family:inherit;font-size:12px;">' +
        esc(note.text || '') + '</textarea>' +
      P.primaryButtonHtml('uc-note-update', '更新') +
      P.primaryButtonHtml('uc-note-delete', '✕ 削除');

    P.bindEvent('uc-note-update', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(updateNote(ctx.getMmdText(), note.line, note.endLine, {
        position: document.getElementById('uc-note-pos').value,
        text: document.getElementById('uc-note-text').value,
      }));
      ctx.onUpdate();
    });
    P.bindEvent('uc-note-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNote(ctx.getMmdText(), note.line, note.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderElementEdit(element, parsedData, propsEl, ctx) {
    // dispatcher routes both actor/usecase elements here; legacy guard keeps
    // unexpected kinds from rendering an empty edit form.
    if (!(element.kind === 'actor' || element.kind === 'usecase')) return;
    var P = window.MA.properties;
    var GP = window.MA.groupPlace;
    var html =
      // design 7a / 2b (BLK-builder-20260924-1829-4): 英語の図種名の行は出さない (図種は左レールと HUD が言う)
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' + element.kind.toUpperCase() + ' (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'uc-edit-id', element.id) +
        P.fieldHtml('Label', 'uc-edit-label', element.label) +
        P.primaryButtonHtml('uc-edit-apply', '変更を反映') +
        '<div style="margin-top:6px;">' +
          P.primaryButtonHtml('uc-rename-refs', '名前を変えたら関係の行も付け替える') +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
          '<button id="uc-move-up" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
          '<button id="uc-move-down" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
          '<button id="uc-delete" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
        // BLK-owner-20260923-2332-2: 選んだ要素を境界の中へ移す / 外へ出す。
        GP.editFieldHtml('uc-edit', parsedData.groups, element.line) +
      '</div>';

    // この要素に付いている注釈。ここに出さないと、付けたあと編集・削除に
    // 辿り着く道が無い (注釈は SVG 上のクリック対象になっていない)。
    var esc = window.MA.htmlUtils.escHtml;
    var myNotes = (parsedData.notes || []).filter(function(n) { return n.targetId === element.id; });
    if (myNotes.length) {
      html += '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Note (注釈)</label>';
      myNotes.forEach(function(n, idx) {
        var preview = String(n.text || '').replace(/\n/g, ' ⏎ ').slice(0, 40);
        if (String(n.text || '').length > 40) preview += '…';
        html += '<div style="display:flex;align-items:center;gap:4px;font-size:11px;margin-bottom:2px;">' +
          '<span style="flex:1;">' + esc(n.position) + ' 「' + esc(preview) + '」 (L' + n.line + ')</span>' +
          '<button id="uc-note-edit-' + idx + '" data-id="' + esc(n.id) + '" data-line="' + n.line + '">edit</button>' +
          '<button id="uc-note-del-' + idx + '" data-line="' + n.line + '" data-end="' + n.endLine + '">✕</button>' +
          '</div>';
      });
      html += '</div>';
    }
    propsEl.innerHTML = html;
    GP.bindEdit('uc-edit', parsedData.groups, element.line, ctx, element.id);

    myNotes.forEach(function(n, idx) {
      P.bindEvent('uc-note-edit-' + idx, 'click', function(e) {
        var btn = e.currentTarget;
        window.MA.selection.setSelected([{
          type: 'note', id: btn.getAttribute('data-id'),
          line: parseInt(btn.getAttribute('data-line'), 10),
        }]);
      });
      P.bindEvent('uc-note-del-' + idx, 'click', function(e) {
        var btn = e.currentTarget;
        window.MA.history.pushHistory();
        ctx.setMmdText(deleteNote(ctx.getMmdText(),
          parseInt(btn.getAttribute('data-line'), 10),
          parseInt(btn.getAttribute('data-end'), 10)));
        ctx.onUpdate();
      });
    });

    P.bindEvent('uc-edit-apply', 'click', function() {
      var rawNewId = document.getElementById('uc-edit-id').value.trim();
      var rawNewLabel = document.getElementById('uc-edit-label').value.trim();
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var freshParsed = parse(t);
      var pfx = element.kind === 'actor' ? 'A' : 'U';
      var renameNorm = window.MA.idNormalizer.normalize(rawNewId, _existingUsecaseIdSet(freshParsed), pfx);
      var newId = renameNorm.valid ? renameNorm.id : rawNewId;
      var newLabel = (renameNorm.valid && renameNorm.id !== renameNorm.label)
        ? renameNorm.label
        : rawNewLabel;
      var fn = element.kind === 'actor' ? updateActor : updateUsecase;
      if (newId !== element.id) t = fn(t, element.line, 'id', newId);
      if (newLabel !== element.label) t = fn(t, element.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('uc-rename-refs', 'click', function() {
      var rawNewId = document.getElementById('uc-edit-id').value.trim();
      if (!rawNewId || rawNewId === element.id) { alert('Alias を変更してから実行してください'); return; }
      var freshParsed = parse(ctx.getMmdText());
      var pfx2 = element.kind === 'actor' ? 'A' : 'U';
      var refsNorm = window.MA.idNormalizer.normalize(rawNewId, _existingUsecaseIdSet(freshParsed), pfx2);
      var newId = refsNorm.valid ? refsNorm.id : rawNewId;
      window.MA.history.pushHistory();
      ctx.setMmdText(renameWithRefs(ctx.getMmdText(), element.id, newId));
      ctx.onUpdate();
    });
    P.bindEvent('uc-move-up', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineUp(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('uc-move-down', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineDown(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('uc-delete', 'click', function() {
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), element.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderRelationEdit(relation, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var RC = window.MA.relationKindCards;
    var uiEnds = _uiToModel(relation.kind, relation.from, relation.to);   // 入れ替えは対称
    var html =
      // design 7a / 2b (BLK-builder-20260924-1829-4): 英語の図種名の行は出さない (図種は左レールと HUD が言う)
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
        // design 3c: 関係の種類は記法ではなく「UML 名称 + 意味の説明」のカードで選ぶ
        RC.cardsHtml('uc-rel-card', RC.kindsOf('usecase'), relation.kind) +
        // BLK-owner-20260929-0351-1: 上の欄は矢の根元 (汎化なら子)。
        P.fieldHtml(relation.kind === 'generalization' ? _fieldLabel('generalization', 'from') : 'From', 'uc-rel-from', uiEnds.from) +
        '<button id="uc-rel-swap" type="button" style="font-size:11px;padding:4px 10px;margin:4px 0;cursor:pointer;">⇄ From/To 入替</button>' +
        P.fieldHtml(relation.kind === 'generalization' ? _fieldLabel('generalization', 'to') : 'To', 'uc-rel-to', uiEnds.to) +
        P.fieldHtml('Label', 'uc-rel-label', relation.label) +
        P.relationOptionsFor('uc-rel-more', ctx.getMmdText(), relation.line) +
        P.primaryButtonHtml('uc-rel-apply', '変更を反映') +
        '<div style="margin-top:8px;">' +
          '<button id="uc-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    // design 3c: 細かい指定は「その他の設定」に畳み、押した時点で DSL へ反映する。
    P.bindRelationOptionsFor('uc-rel-more', relation.line, ctx);

    // 種別はカードを押した時点で確定する (Component と同じ)。
    // From / To / Label は自由入力なので「変更を反映」に残す。
    RC.bindCards(propsEl, 'uc-rel-card', function(newKind) {
      if (newKind === relation.kind) return;
      window.MA.history.pushHistory();
      var t = updateRelation(ctx.getMmdText(), relation.line, 'kind', newKind);
      // 種類を替えても欄に見えている根元 (From) の相手は替えない (汎化とそれ以外で左右の読みが替わる)。
      if ((newKind === 'generalization') !== (relation.kind === 'generalization')) {
        t = updateRelation(t, relation.line, 'swap');
        var sw = relation.from; relation.from = relation.to; relation.to = sw;
      }
      ctx.setMmdText(t);
      relation.kind = newKind;   // 「変更を反映」での二重適用を防ぐ
      ctx.onUpdate();
    });
    P.bindEvent('uc-rel-apply', 'click', function() {
      var newEnds = _uiToModel(relation.kind,
        document.getElementById('uc-rel-from').value.trim(), document.getElementById('uc-rel-to').value.trim());
      var newFrom = newEnds.from;
      var newTo = newEnds.to;
      var newLabel = document.getElementById('uc-rel-label').value.trim();
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      if (newFrom !== relation.from) t = updateRelation(t, relation.line, 'from', newFrom);
      if (newTo !== relation.to) t = updateRelation(t, relation.line, 'to', newTo);
      if (newLabel !== relation.label) t = updateRelation(t, relation.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('uc-delete', 'click', function() {
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), relation.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindEvent('uc-rel-swap', 'click', function() {
      var fromEl = document.getElementById('uc-rel-from');
      var toEl = document.getElementById('uc-rel-to');
      var tmp = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = tmp;
    });
  }

  function _renderGroupReadOnly(pkg, parsedData, propsEl, ctx) {
    var html =
      // design 7a / 2b (BLK-builder-20260924-1829-4): 英語の図種名の行は出さない (図種は左レールと HUD が言う)
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">PACKAGE (L' + pkg.startLine + '-' + pkg.endLine + ')</label>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Label: ' + window.MA.htmlUtils.escHtml(pkg.label || '') + '</div>' +
        // design 5d: 表記を後から差し替える (中身と閉じ括弧はそのまま)
        window.MA.properties.selectFieldHtml('表記', 'uc-grp-notation',
          window.MA.groupNotation.notationsFor('plantuml-usecase').map(function(n) {
            return { value: n.id, label: n.label + ' — ' + n.hint, selected: n.id === (pkg.notation || 'package') };
          })) +
        window.MA.properties.primaryButtonHtml('uc-grp-notation-apply', '表記を変更') +
        '<div style="font-size:10px;color:var(--text-secondary);margin-top:8px;">v0.3.0: ラベル変更 / 範囲指定 wrap は v0.5.0 で対応</div>' +
      '</div>';
    propsEl.innerHTML = html;
    window.MA.properties.bindEvent('uc-grp-notation-apply', 'click', function() {
      var v = document.getElementById('uc-grp-notation').value;
      if (v === (pkg.notation || 'package')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(changeGroupNotation(ctx.getMmdText(), pkg.startLine, v));
      ctx.onUpdate();
    });
  }

  // ─── 関係を追加 / Add relation (design 3a) ───────────────────────────────
  // 2 要素を選ぶとここが開く。UML の名称を主・意味の説明を副にして並べ、矢印の
  // 見本を添える (relation-add.js のカタログ)。「追加される行」は実際に書き込む
  // fmtRelation をそのまま通すので、見えている行と DSL が食い違わない。
  function _renderMultiSelectConnect(selData, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var RA = window.MA.relationAdd;
    var esc = window.MA.htmlUtils.escHtml;
    var allElements = (parsedData.elements || []).filter(function(e) {
      return e.kind === 'actor' || e.kind === 'usecase';
    });
    var nameById = {};
    allElements.forEach(function(e) {
      nameById[e.id] = window.MA.aliasHint.optionLabel(e.id, e.label || e.id);
    });

    var swapped = false;
    var kind = RA.defaultKind('usecase');

    function nameOf(item) { return nameById[item.id] || item.id; }
    function ends() { return RA.orient(selData, swapped); }

    propsEl.innerHTML =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">関係を追加 / Add relation</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<div class="rel-ends">' +
          '<span class="rel-end"><span class="rel-end-cap">From</span>' +
            '<strong id="uc-conn-from">' + esc(nameOf(selData[0])) + '</strong></span>' +
          '<button id="uc-conn-swap" type="button" class="rel-swap" title="From と To を入れ替える">⇄</button>' +
          '<span class="rel-end"><span class="rel-end-cap">To</span>' +
            '<strong id="uc-conn-to">' + esc(nameOf(selData[1])) + '</strong></span>' +
        '</div>' +
        '<div class="rel-section-cap">関係の種類 / Relation</div>' +
        '<div id="uc-conn-kinds" class="rel-opts">' + RA.optionsHtml('usecase', 'uc-conn', kind) + '</div>' +
        P.fieldHtml('ラベル / Label（任意）', 'uc-conn-label', '', '任意') +
        '<div class="rel-section-cap">追加される行</div>' +
        '<pre id="uc-conn-preview" class="rel-preview"></pre>' +
        '<div class="rel-actions">' +
          P.primaryButtonHtml('uc-conn-create', '関係を追加') +
          '<button id="uc-conn-clear" type="button">選択解除</button>' +
        '</div>' +
      '</div>';

    function refreshPreview() {
      var e = ends();
      var label = (document.getElementById('uc-conn-label') || {}).value || '';
      var m = _uiToModel(kind, e.from.id, e.to.id);
      var rf = _rootFirstIn(ctx.getMmdText());
      var line = RA.previewLine(function(k, a, b, l) { return fmtRelation(k, a, b, l, rf); }, kind, m.from, m.to, label.trim());
      var pre = document.getElementById('uc-conn-preview');
      if (pre) pre.textContent = line;
    }

    P.bindEvent('uc-conn-swap', 'click', function() {
      swapped = !swapped;
      var e = ends();
      document.getElementById('uc-conn-from').textContent = nameOf(e.from);
      document.getElementById('uc-conn-to').textContent = nameOf(e.to);
      refreshPreview();
    });

    var kindsEl = document.getElementById('uc-conn-kinds');
    if (kindsEl) {
      kindsEl.addEventListener('change', function(ev) {
        if (!ev.target || ev.target.type !== 'radio') return;
        kind = ev.target.value;
        refreshPreview();
      });
    }
    P.bindEvent('uc-conn-label', 'input', refreshPreview);

    P.bindEvent('uc-conn-clear', 'click', function() {
      window.MA.selection.clearSelection();
    });

    P.bindEvent('uc-conn-create', 'click', function() {
      window.MA.history.pushHistory();
      var e = ends();
      var label = document.getElementById('uc-conn-label').value.trim();
      var m = _uiToModel(kind, e.from.id, e.to.id);
      ctx.setMmdText(addRelation(ctx.getMmdText(), kind, m.from, m.to, label));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });

    refreshPreview();
  }

  // 3+ selection 用
  function _renderMultiSelect(selData, propsEl) {
    propsEl.innerHTML =
      '<div style="padding:12px;color:var(--text-secondary);font-size:11px;">' +
      selData.length + ' elements selected。Connect は 2 elements まで。' +
      'Shift+クリックで解除できます。</div>';
  }

  return {
    type: 'plantuml-usecase',
    displayName: 'UseCase',
    parse: parse,
    fmtActor: fmtActor,
    fmtUsecase: fmtUsecase,
    fmtPackage: fmtPackage,
    fmtRelation: fmtRelation,
    addActor: addActor,
    normalizeIdInput: normalizeIdInput,
    addUsecase: addUsecase,
    addPackage: addPackage,
    addRelation: addRelation,
    addNote: addNote,
    updateNote: updateNote,
    deleteNote: deleteNote,
    parseBulkLines: parseBulkLines,
    addBulk: addBulk,
    updateActor: updateActor,
    updateUsecase: updateUsecase,
    updateRelation: updateRelation,
    deleteLine: deleteLine,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    renameWithRefs: renameWithRefs,
    renderProps: renderProps,
    capabilities: {
      overlaySelection: true,  // Phase B Task 9 で actor/usecase 対応
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: true,  // Task 13: 2-element connect form
    },
    buildOverlay: function(svgEl, parsedData, overlayEl, dslText) {
      if (!svgEl || !overlayEl) return { matched: {}, unmatched: {} };
      var OB = window.MA.overlayBuilder;
      OB.syncDimensions(svgEl, overlayEl);

      var actors = (parsedData.elements || []).filter(function(e) { return e.kind === 'actor'; });
      var usecases = (parsedData.elements || []).filter(function(e) { return e.kind === 'usecase'; });

      // PlantUML emits actor/usecase as <g class="entity" data-qualified-name="X">
      // (実機 SVG。test fixture は g.actor / g.usecase の旧形式も受理する fallback)。
      function _matchEntity(item) {
        var g = svgEl.querySelector('g.entity[data-qualified-name="' + item.id + '"]');
        if (g) return g;
        // legacy/fixture fallback
        return svgEl.querySelector('g.' + item.kind + '[data-source-line]');
      }
      function _entityBBox(g) {
        if (!g) return null;
        if (typeof g.getBBox === 'function') {
          try {
            var bb = g.getBBox();
            if (bb && (bb.width > 0 || bb.height > 0)) return bb;
          } catch (e) { /* jsdom fallback */ }
        }
        // jsdom fallback: union of inner ellipse/rect/text
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var found = false;
        Array.prototype.forEach.call(g.querySelectorAll('ellipse, rect, text'), function(el) {
          var x, y, w, h;
          if (el.tagName.toLowerCase() === 'ellipse') {
            var cx = parseFloat(el.getAttribute('cx')) || 0;
            var cy = parseFloat(el.getAttribute('cy')) || 0;
            var rx = parseFloat(el.getAttribute('rx')) || 0;
            var ry = parseFloat(el.getAttribute('ry')) || 0;
            x = cx - rx; y = cy - ry; w = rx * 2; h = ry * 2;
          } else if (el.tagName.toLowerCase() === 'rect') {
            x = parseFloat(el.getAttribute('x')) || 0;
            y = parseFloat(el.getAttribute('y')) || 0;
            w = parseFloat(el.getAttribute('width')) || 0;
            h = parseFloat(el.getAttribute('height')) || 0;
          } else {
            x = parseFloat(el.getAttribute('x')) || 0;
            y = parseFloat(el.getAttribute('y')) || 0;
            w = parseFloat(el.getAttribute('textLength')) || 0;
            h = 14;
          }
          if (w === 0 && h === 0) return;
          found = true;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        });
        if (!found) return null;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }

      // BLK-migrator-20260924-0012: 当て方は PlantUML が SVG に残す要素情報 (data-qualified-name /
      // data-source-line) を先に使う (class / component / state と同じ部品)。パッケージの中の要素は
      // `Restaurant.UC1` の修飾名で描かれ、`:User:` / `(Use)` / `"表示名" as (X)` の略記はパーサが
      // 読めないことがある。名前 → 書かれた行 の順に当て、どれにも当たらない要素・線・題・凡例も
      // addUnclaimed が書かれた行を指す枠にする (黙って枠を出さない、をやめる)。
      var claimed = [];
      function _entityByLine(line) {
        var all = svgEl.querySelectorAll('g.entity[data-source-line]');
        for (var i = 0; i < all.length; i++) {
          if (claimed.indexOf(all[i]) >= 0) continue;
          var n = parseInt(all[i].getAttribute('data-source-line'), 10);
          if (!isNaN(n) && n + 1 === Number(line)) return all[i];
        }
        return null;
      }
      function _svgEntity(item) {
        var g = OB.findEntityByName(svgEl, item.id);
        if (g && claimed.indexOf(g) >= 0) g = null;
        if (!g) g = _entityByLine(item.line);
        if (!g) g = _matchEntity(item);
        if (g) claimed.push(g);
        return g;
      }

      var actorMatched = 0;
      actors.forEach(function(actor) {
        var g = _svgEntity(actor);
        if (!g) return;
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 4, bb.width + 12, bb.height + 8, {
          'data-type': 'actor',
          'data-id': actor.id,
          'data-line': actor.line,
        });
        actorMatched++;
      });

      var ucMatched = 0;
      usecases.forEach(function(uc) {
        var g = _svgEntity(uc);
        if (!g) return;
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 4, bb.width + 12, bb.height + 8, {
          'data-type': 'usecase',
          'data-id': uc.id,
          'data-line': uc.line,
        });
        ucMatched++;
      });

      // package / rectangle: <g class="cluster">。開始行 → 表示名で当てる (並び順に頼らない)
      var packages = (parsedData.groups || []).filter(function(g) { return g.kind === 'package'; });
      var pkgGroups = OB.matchClusters(svgEl, packages);
      var pkgN = 0;
      for (var pi = 0; pi < packages.length; pi++) {
        var g = pkgGroups[pi];
        if (!g) continue;
        claimed.push(g);
        pkgN++;
        var pkgRect = g.querySelector('rect');
        var pbb = pkgRect ? {
          x: parseFloat(pkgRect.getAttribute('x')) || 0,
          y: parseFloat(pkgRect.getAttribute('y')) || 0,
          width: parseFloat(pkgRect.getAttribute('width')) || 0,
          height: parseFloat(pkgRect.getAttribute('height')) || 0,
        } : OB.extractUnionBBox(g, 'text, line, polygon, polyline, path, rect, ellipse');
        if (!pbb) continue;
        OB.addRect(overlayEl, pbb.x - 2, pbb.y - 2, pbb.width + 4, pbb.height + 4, {
          'data-type': 'package',
          'data-id': packages[pi].id,
          'data-line': packages[pi].startLine,
        });
      }

      // relation: <g class="link">。書かれた行で当てる (読めない線があっても以後がずれない)
      var relations = parsedData.relations || [];
      var linkGroups = OB.matchLinksByLine(svgEl, relations);
      var relN = 0;
      for (var ri = 0; ri < relations.length; ri++) {
        var lg = linkGroups[ri];
        if (!lg) continue;
        var lineEl = lg.querySelector('line, path');
        if (!lineEl) continue;
        claimed.push(lg);
        relN++;
        // BLK-human-20260912-2130: 線・矢じり・ラベル (<<include>> 等) をまとめて
        // 1 つの当たり判定にする
        var ucRelAttrs = {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        };
        // BLK-builder-20260925-0305-1: 中継点で割れた残りの線も同じ関係の 1 つの枠にする。
        var lgParts = (linkGroups.parts && linkGroups.parts[ri]) || [];
        lgParts.forEach(function(pg) { claimed.push(pg); });
        if (!OB.addLinkRects(overlayEl, lgParts.length ? [lg].concat(lgParts) : lg, ucRelAttrs, 8)) {
          var bb = OB.extractEdgeBBox(lineEl, 8);
          if (!bb) continue;
          OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, ucRelAttrs);
        }
      }

      // フォームが読めない記法の要素・線・題・凡例にも、書かれた行を指す枠を置く
      OB.addUnclaimed(svgEl, overlayEl, claimed, null, dslText);

      // BLK-human-20260912-2130: 小さい当たり判定を手前に。共通実装 (src/core)
      OB.raiseSmallestLast(overlayEl);

      return {
        matched: {
          actor: actorMatched,
          usecase: ucMatched,
          package: pkgN,
          relation: relN,
        },
        unmatched: {
          actor: actors.length - actorMatched,
          usecase: usecases.length - ucMatched,
          package: packages.length - pkgN,
          relation: relations.length - relN,
        },
      };
    },
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-usecase'; },
    template: function() {
      return [
        '@startuml',
        'title Sample UseCase',
        'actor User',
        'usecase Login',
        '',
        'User --> Login',
        '@enduml',
      ].join('\n');
    },
  };
})();
