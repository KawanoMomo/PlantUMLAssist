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
  function fmtPackage(label) {
    return 'package "' + label + '" {';
  }
  function fmtRelation(kind, from, to, label) {
    var lbl = label || '';
    if (kind === 'generalization') return from + ' <|-- ' + to;
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
  function addPackage(text, label) {
    var open = fmtPackage(label);
    return insertBeforeEnd(insertBeforeEnd(text, open), '}');
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
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
    var m = trimmed.match(RELATION_RE);
    if (!m) return text;
    var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
    var from = DU.unquote(fromRaw), to = DU.unquote(toRaw);
    var kind = 'association';
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

    lines[idx] = indent + fmtRelation(kind, from, to, lbl);
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
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    var packageStack = [];
    var packageCounter = 0;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
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
        var pkg = { kind: 'package', id: pkgId, label: label0, startLine: lineNum, endLine: 0, parentId: parent };
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
      m = trimmed.match(RELATION_RE);
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
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(parsed, el) { _renderNoSelection(parsed, el, ctx); },
      onElement: function(elt, parsed, el) { _renderElementEdit(elt, parsed, el, ctx); },
      onRelation: function(rel, parsed, el) { _renderRelationEdit(rel, parsed, el, ctx); },
      onGroup: function(grp, parsed, el) { _renderGroupReadOnly(grp, parsed, el, ctx); },
      onMultiSelectConnect: function(sel, parsed, el) { _renderMultiSelectConnect(sel, parsed, el, ctx); },
      onMultiSelect: function(sel, parsed, el) { _renderMultiSelect(sel, el); },
    });
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var elements = parsedData.elements || [];
    var actors = elements.filter(function(e) { return e.kind === 'actor'; });
    var usecases = elements.filter(function(e) { return e.kind === 'usecase'; });

    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
        P.fieldHtml('Title', 'uc-title', parsedData.meta.title) +
        P.primaryButtonHtml('uc-set-title', 'Title 適用') +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'uc-tail-kind', [
          { value: 'actor',    label: 'Actor', selected: true },
          { value: 'usecase',  label: 'Usecase' },
          { value: 'package',  label: 'Package境界' },
          { value: 'relation', label: 'Relation (関係)' },
        ]) +
        '<div id="uc-tail-detail" style="margin-top:6px;"></div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">' +
        'DSL エディタで行をクリックすると編集パネルが開きます (v0.5.0 で SVG クリック対応予定)' +
      '</div>';
    propsEl.innerHTML = html;

    // Title button
    P.bindEvent('uc-set-title', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('uc-title').value.trim()));
      ctx.onUpdate();
    });

    // 末尾追加 detail switcher
    var renderTailDetail = function() {
      var kind = document.getElementById('uc-tail-kind').value;
      var detailEl = document.getElementById('uc-tail-detail');
      var actorOpts = actors.map(function(a) { return { value: a.id, label: a.label }; });
      var usecaseOpts = usecases.map(function(u) { return { value: u.id, label: u.label }; });
      var allOpts = actorOpts.concat(usecaseOpts);
      if (allOpts.length === 0) allOpts = [{ value: '', label: '（要素なし）' }];
      var html = '';
      if (kind === 'actor') {
        html =
          P.fieldHtml('Alias', 'uc-tail-alias', '', '例: User') +
          P.fieldHtml('Label', 'uc-tail-label', '', '省略可、Alias と異なる場合に表示用') +
          P.primaryButtonHtml('uc-tail-add', '+ Actor 追加');
      } else if (kind === 'usecase') {
        html =
          P.fieldHtml('Alias', 'uc-tail-alias', '', '例: L1') +
          P.fieldHtml('Label', 'uc-tail-label', '', '省略可、Alias と異なる場合に表示用') +
          P.primaryButtonHtml('uc-tail-add', '+ Usecase 追加');
      } else if (kind === 'package') {
        html =
          P.fieldHtml('Label', 'uc-tail-label', '', '例: Auth Module') +
          P.primaryButtonHtml('uc-tail-add', '+ Package 追加');
      } else if (kind === 'relation') {
        html =
          P.selectFieldHtml('Kind', 'uc-tail-rkind', [
            { value: 'association',    label: 'Association (-->)', selected: true },
            { value: 'generalization', label: 'Generalization (<|--)' },
            { value: 'include',        label: 'Include (..> <<include>>)' },
            { value: 'extend',         label: 'Extend (..> <<extend>>)' },
          ]) +
          P.selectFieldHtml('From', 'uc-tail-from', allOpts) +
          P.selectFieldHtml('To', 'uc-tail-to', allOpts) +
          P.fieldHtml('Label', 'uc-tail-rlabel', '', 'association のみ任意') +
          P.primaryButtonHtml('uc-tail-add', '+ Relation 追加');
      }
      detailEl.innerHTML = html;

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
        } else if (kind === 'usecase') {
          var rawAl2 = document.getElementById('uc-tail-alias').value;
          var normUc = normalizeIdInput(rawAl2, parsedData, 'U');
          if (!normUc.valid) { alert('Alias 必須'); return; }
          var rawLbl2 = document.getElementById('uc-tail-label').value.trim();
          window.MA.history.pushHistory();
          out = addUsecase(t, normUc.id, rawLbl2 || normUc.label);
        } else if (kind === 'package') {
          var lbl = document.getElementById('uc-tail-label').value.trim();
          if (!lbl) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          out = addPackage(t, lbl);
        } else if (kind === 'relation') {
          var fr = document.getElementById('uc-tail-from').value;
          var to = document.getElementById('uc-tail-to').value;
          if (!fr || !to) { alert('From/To 必須 (先に actor/usecase を追加)'); return; }
          var rkind = document.getElementById('uc-tail-rkind').value;
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, fr, to, document.getElementById('uc-tail-rlabel').value.trim());
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('uc-tail-kind').addEventListener('change', renderTailDetail);
    renderTailDetail();
  }

  function _renderElementEdit(element, parsedData, propsEl, ctx) {
    // dispatcher routes both actor/usecase elements here; legacy guard keeps
    // unexpected kinds from rendering an empty edit form.
    if (!(element.kind === 'actor' || element.kind === 'usecase')) return;
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' + element.kind.toUpperCase() + ' (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'uc-edit-id', element.id) +
        P.fieldHtml('Label', 'uc-edit-label', element.label) +
        P.primaryButtonHtml('uc-edit-apply', '変更を反映') +
        '<div style="margin-top:6px;">' +
          P.primaryButtonHtml('uc-rename-refs', 'Alias 変更を関連 Relation にも追従 (renameWithRefs)') +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
          '<button id="uc-move-up" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
          '<button id="uc-move-down" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
          '<button id="uc-delete" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

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
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
        P.selectFieldHtml('Kind', 'uc-rel-kind', [
          { value: 'association',    label: 'Association (-->)', selected: relation.kind === 'association' },
          { value: 'generalization', label: 'Generalization (<|--)', selected: relation.kind === 'generalization' },
          { value: 'include',        label: 'Include (..> <<include>>)', selected: relation.kind === 'include' },
          { value: 'extend',         label: 'Extend (..> <<extend>>)', selected: relation.kind === 'extend' },
        ]) +
        P.fieldHtml('From', 'uc-rel-from', relation.from) +
        '<button id="uc-rel-swap" type="button" style="font-size:11px;padding:4px 10px;margin:4px 0;cursor:pointer;">⇄ From/To 入替</button>' +
        P.fieldHtml('To', 'uc-rel-to', relation.to) +
        P.fieldHtml('Label', 'uc-rel-label', relation.label) +
        P.primaryButtonHtml('uc-rel-apply', '変更を反映') +
        '<div style="margin-top:8px;">' +
          '<button id="uc-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('uc-rel-apply', 'click', function() {
      var newKind = document.getElementById('uc-rel-kind').value;
      var newFrom = document.getElementById('uc-rel-from').value.trim();
      var newTo = document.getElementById('uc-rel-to').value.trim();
      var newLabel = document.getElementById('uc-rel-label').value.trim();
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      if (newKind !== relation.kind) t = updateRelation(t, relation.line, 'kind', newKind);
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
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">PACKAGE (L' + pkg.startLine + '-' + pkg.endLine + ')</label>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Label: ' + pkg.label + '</div>' +
        '<div style="font-size:10px;color:var(--text-secondary);">v0.3.0: package のラベル変更 / 範囲指定 wrap は v0.5.0 で対応</div>' +
      '</div>';
    propsEl.innerHTML = html;
  }

  // ─── Multi-select Connect (Phase B Task 13) ─────────────────────────────
  function _renderMultiSelectConnect(selData, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var allElements = (parsedData.elements || []).filter(function(e) {
      return e.kind === 'actor' || e.kind === 'usecase';
    });
    var nameById = {};
    allElements.forEach(function(e) { nameById[e.id] = e.label || e.id; });

    var fromOpt = nameById[selData[0].id] || selData[0].id;
    var toOpt = nameById[selData[1].id] || selData[1].id;

    propsEl.innerHTML =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase - Connect 2 elements</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<div style="margin:8px 0;">' +
          'From: <strong id="uc-conn-from">' + window.MA.htmlUtils.escHtml(fromOpt) + '</strong> ' +
          '<button id="uc-conn-swap" type="button">⇄ swap</button> ' +
          'To: <strong id="uc-conn-to">' + window.MA.htmlUtils.escHtml(toOpt) + '</strong>' +
        '</div>' +
        P.selectFieldHtml('Kind', 'uc-conn-kind', [
          { value: 'association', label: 'Association (-->)', selected: true },
          { value: 'generalization', label: 'Generalization (<|--)' },
          { value: 'include', label: 'Include (..>) <<include>>' },
          { value: 'extend', label: 'Extend (..>) <<extend>>' },
        ]) +
        P.fieldHtml('Label', 'uc-conn-label', '', '任意') +
        P.primaryButtonHtml('uc-conn-create', '+ Connect') +
      '</div>';

    var swapped = false;
    P.bindEvent('uc-conn-swap', 'click', function() {
      swapped = !swapped;
      var fromEl = document.getElementById('uc-conn-from');
      var toEl = document.getElementById('uc-conn-to');
      var tmp = fromEl.textContent;
      fromEl.textContent = toEl.textContent;
      toEl.textContent = tmp;
    });

    P.bindEvent('uc-conn-create', 'click', function() {
      window.MA.history.pushHistory();
      var fromId = swapped ? selData[1].id : selData[0].id;
      var toId = swapped ? selData[0].id : selData[1].id;
      var kind = document.getElementById('uc-conn-kind').value;
      var label = document.getElementById('uc-conn-label').value.trim();
      var t = ctx.getMmdText();
      var out = addRelation(t, kind, fromId, toId, label);
      ctx.setMmdText(out);
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
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
    buildOverlay: function(svgEl, parsedData, overlayEl) {
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

      var actorMatched = 0;
      actors.forEach(function(actor) {
        var g = _matchEntity(actor);
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
        var g = _matchEntity(uc);
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

      // package: <g class="cluster">
      var packages = (parsedData.groups || []).filter(function(g) { return g.kind === 'package'; });
      var pkgGroups = svgEl.querySelectorAll('g.cluster');
      var pkgN = Math.min(packages.length, pkgGroups.length);
      for (var pi = 0; pi < pkgN; pi++) {
        var g = pkgGroups[pi];
        var pkgRect = g.querySelector('rect');
        if (!pkgRect) continue;
        var px = parseFloat(pkgRect.getAttribute('x')) || 0;
        var py = parseFloat(pkgRect.getAttribute('y')) || 0;
        var pw = parseFloat(pkgRect.getAttribute('width')) || 0;
        var ph = parseFloat(pkgRect.getAttribute('height')) || 0;
        OB.addRect(overlayEl, px - 2, py - 2, pw + 4, ph + 4, {
          'data-type': 'package',
          'data-id': packages[pi].id,
          'data-line': packages[pi].startLine,
        });
      }

      // relation: <g class="link"> 内の line / path
      var relations = parsedData.relations || [];
      var linkGroups = svgEl.querySelectorAll('g.link, g[class*="link_"]');
      var relN = Math.min(relations.length, linkGroups.length);
      for (var ri = 0; ri < relN; ri++) {
        var lg = linkGroups[ri];
        var lineEl = lg.querySelector('line, path');
        if (!lineEl) continue;
        var bb = OB.extractEdgeBBox(lineEl, 8);
        if (!bb) continue;
        OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        });
      }

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
