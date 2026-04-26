'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlComponent = (function() {
  var DU = window.MA.dslUtils;
  var RP = window.MA.regexParts;
  var ID = RP.IDENTIFIER;

  // component: keyword form (with capturing label group inlined since RP.QUOTED_NAME is non-capturing)
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var COMPONENT_KW_RE = new RegExp(
    '^component\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*\\{?\\s*$'
  );
  // component: [X] / [Label] as Alias
  var COMPONENT_SHORT_RE = /^\[([^\]]+)\](?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\{?\s*$/;

  // interface: keyword form
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var INTERFACE_KW_RE = new RegExp(
    '^interface\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );
  // interface: () X / () X as I
  var INTERFACE_SHORT_RE = /^\(\)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

  var PACKAGE_OPEN_RE = new RegExp(
    '^(?:package|folder|frame|node|rectangle)\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );
  var PACKAGE_CLOSE_RE = /^\s*\}\s*$/;

  var PORT_KW_RE = new RegExp(
    '^port\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );

  var RELATION_RE = new RegExp(
    '^(' + ID + '|"[^"]+")\\s+(-\\(\\)|\\(\\)-|\\)-|-\\(|\\.\\.>|<\\.\\.|-->|<--|--|<-|->)\\s+(' + ID + '|"[^"]+")(?:\\s*:\\s*(.+))?$'
  );

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function fmtComponent(id, label) {
    if (label && label !== id) return 'component "' + label + '" as ' + id;
    return 'component ' + id;
  }
  function fmtInterface(id, label) {
    if (label && label !== id) return 'interface "' + label + '" as ' + id;
    return 'interface ' + id;
  }
  function fmtPort(id, label) {
    if (label && label !== id) return 'port "' + label + '" as ' + id;
    return 'port ' + id;
  }
  function fmtPackage(label) {
    return 'package "' + label + '" {';
  }
  function fmtRelation(kind, from, to, label) {
    var lbl = label || '';
    if (kind === 'dependency') return from + ' ..> ' + to + (lbl ? ' : ' + lbl : '');
    if (kind === 'provides') return from + ' -() ' + to;
    if (kind === 'requires') return from + ' )- ' + to;
    return from + ' -- ' + to + (lbl ? ' : ' + lbl : '');
  }

  function addComponent(text, id, label) { return insertBeforeEnd(text, fmtComponent(id, label || id)); }
  function addInterface(text, id, label) { return insertBeforeEnd(text, fmtInterface(id, label || id)); }
  function addPort(text, id, label) { return insertBeforeEnd(text, fmtPort(id, label || id)); }
  // Port must live inside a component { ... } block. If the parent component is
  // in single-line form, convert it to block form first; if it already has a
  // block, insert the port before the matching close brace.
  function addPortToComponent(text, parentId, portId, portLabel) {
    var lines = text.split('\n');
    var parentIdx = -1;
    var parentIsBlock = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t.indexOf("'") === 0) continue;
      var km = t.match(COMPONENT_KW_RE);
      var matchedId = null;
      if (km) {
        matchedId = (km[2] !== undefined) ? km[2] : km[3];
      } else {
        var sm = t.match(COMPONENT_SHORT_RE);
        if (sm) matchedId = sm[2] || sm[1].trim();
      }
      if (matchedId === parentId) {
        parentIdx = i;
        parentIsBlock = /\{\s*$/.test(lines[i]);
        break;
      }
    }
    if (parentIdx < 0) return addPort(text, portId, portLabel);
    var indent = lines[parentIdx].match(/^(\s*)/)[1];
    var portLine = indent + '  ' + fmtPort(portId, portLabel || portId);
    if (parentIsBlock) {
      var depth = 1;
      for (var j = parentIdx + 1; j < lines.length; j++) {
        var lt = lines[j].trim();
        if (/\{\s*$/.test(lines[j])) depth++;
        if (lt === '}') {
          depth--;
          if (depth === 0) {
            lines.splice(j, 0, portLine);
            return lines.join('\n');
          }
        }
      }
      return text;
    }
    lines[parentIdx] = lines[parentIdx].replace(/\s*$/, '') + ' {';
    lines.splice(parentIdx + 1, 0, portLine, indent + '}');
    return lines.join('\n');
  }
  function addPackage(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtPackage(label)), '}');
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }

  function updateComponent(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label;
    var km = trimmed.match(COMPONENT_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
    } else {
      var sm = trimmed.match(COMPONENT_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    var openBrace = /\{\s*$/.test(lines[idx]) ? ' {' : '';
    lines[idx] = indent + fmtComponent(id, label) + openBrace;
    return lines.join('\n');
  }

  function updateInterface(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label, labelImplicit = false;
    var km = trimmed.match(INTERFACE_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else {
        id = km[3];
        if (km[4] !== undefined) { label = km[4]; }
        else { label = km[3]; labelImplicit = true; }
      }
    } else {
      var sm = trimmed.match(INTERFACE_SHORT_RE);
      if (!sm) return text;
      // () X / () X as I:  m[1] = X (token), m[2] = I (alias)
      var firstToken = sm[1].trim();
      id = sm[2] || firstToken;
      label = firstToken;
    }
    if (field === 'id') {
      id = value;
      if (labelImplicit) label = value;
    } else if (field === 'label') label = value;
    lines[idx] = indent + fmtInterface(id, label);
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
    if (arrow === '-()' || arrow === '()-') kind = 'provides';
    else if (arrow === ')-' || arrow === '-(') kind = 'requires';
    else if (arrow === '..>' || arrow === '<..' || arrow === '.>') kind = 'dependency';

    if (field === 'kind') kind = value;
    else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') lbl = value;

    lines[idx] = indent + fmtRelation(kind, from, to, lbl);
    return lines.join('\n');
  }

  function deleteLine(text, lineNum) { return window.MA.textUpdater.deleteLine(text, lineNum); }
  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
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

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    var packageStack = [];
    var packageCounter = 0;
    var lastComponentId = null;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var pkgLabel = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var parent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', id: pkgId, label: pkgLabel, startLine: lineNum, endLine: 0, parentId: parent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }
      if (PACKAGE_CLOSE_RE.test(lines[i])) {
        if (packageStack.length > 0) {
          var closing = packageStack.pop();
          closing.endLine = lineNum;
        }
        continue;
      }
      var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;

      var m;
      // component keyword
      m = trimmed.match(COMPONENT_KW_RE);
      if (m) {
        var id, label;
        if (m[2] !== undefined) { id = m[2]; label = m[1]; }
        else { id = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'component', id: id, label: label, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = id;  // track for port adjacency
        continue;
      }
      // component short [X] / [Label] as Alias
      m = trimmed.match(COMPONENT_SHORT_RE);
      if (m) {
        var label2 = m[1].trim();
        var id2 = m[2] || label2;
        result.elements.push({ kind: 'component', id: id2, label: label2, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = id2;  // track for port adjacency
        continue;
      }
      // interface keyword
      m = trimmed.match(INTERFACE_KW_RE);
      if (m) {
        var id3, label3;
        if (m[2] !== undefined) { id3 = m[2]; label3 = m[1]; }
        else { id3 = m[3]; label3 = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'interface', id: id3, label: label3, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = null;  // interface breaks component adjacency
        continue;
      }
      // interface short () X / () X as I
      // - `() X`        → id=X, label=X  (no `as` clause)
      // - `() X as I`   → id=I, label=X  (alias replaces id; first token becomes label)
      m = trimmed.match(INTERFACE_SHORT_RE);
      if (m) {
        var firstTok = m[1].trim();
        var alias = m[2];
        var realId = alias || firstTok;
        var realLabel = firstTok;
        result.elements.push({ kind: 'interface', id: realId, label: realLabel, stereotype: null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = null;  // interface breaks component adjacency
        continue;
      }
      // port (keyword form): port ID | port "Label" as ID | port ID as "Label"
      m = trimmed.match(PORT_KW_RE);
      if (m) {
        var portId, portLabel;
        if (m[2] !== undefined) { portId = m[2]; portLabel = m[1]; }
        else { portId = m[3]; portLabel = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({
          kind: 'port', id: portId, label: portLabel,
          parentComponentId: lastComponentId,
          line: lineNum, parentPackageId: currentPackageId
        });
        // port does NOT reset lastComponentId — multiple ports can follow
        continue;
      }
      // relations: --, -->, ..>, lollipop -()/()-/)-/-(, with optional ": label"
      m = trimmed.match(RELATION_RE);
      if (m) {
        var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
        var from = DU.unquote(fromRaw);
        var to = DU.unquote(toRaw);
        var kind = 'association';

        if (arrow === '-()') {
          kind = 'provides';
        } else if (arrow === '()-') {
          kind = 'provides';
          var tmp = from; from = to; to = tmp; arrow = '-()';
        } else if (arrow === ')-') {
          kind = 'requires';
        } else if (arrow === '-(') {
          kind = 'requires';
          var tmp2 = from; from = to; to = tmp2; arrow = ')-';
        } else if (arrow === '..>' || arrow === '.>') {
          kind = 'dependency';
        } else if (arrow === '<..') {
          kind = 'dependency';
          var tmp3 = from; from = to; to = tmp3; arrow = '..>';
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

  function renderProps(selData, parsedData, propsEl, ctx) {
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(parsed, el) { _renderNoSelection(parsed, el, ctx); },
      onElement: function(elt, parsed, el) { _renderElementEdit(elt, parsed, el, ctx); },
      onRelation: function(rel, parsed, el) { _renderRelationEdit(rel, parsed, el, ctx); },
      onGroup: function(grp, parsed, el) { _renderGroupReadOnly(grp, parsed, el, ctx); },
      onMultiSelectConnect: function(s, parsed, el) { _renderMultiSelectConnect(s, parsed, el, ctx); },
      onMultiSelect: function(s, parsed, el) { _renderMultiSelect(s, parsed, el); },
    });
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var elements = parsedData.elements || [];
    var components = elements.filter(function(e) { return e.kind === 'component'; });
    var interfaces = elements.filter(function(e) { return e.kind === 'interface'; });
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
        P.fieldHtml('Title', 'co-title', parsedData.meta.title) +
        P.primaryButtonHtml('co-set-title', 'Title 適用') +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'co-tail-kind', [
          { value: 'component', label: 'Component', selected: true },
          { value: 'interface', label: 'Interface' },
          { value: 'port',      label: 'Port' },
          { value: 'package',   label: 'Package境界' },
          { value: 'relation',  label: 'Relation (関係)' },
        ]) +
        '<div id="co-tail-detail" style="margin-top:6px;"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('co-set-title', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('co-title').value.trim()));
      ctx.onUpdate();
    });

    var renderTailDetail = function() {
      var kind = document.getElementById('co-tail-kind').value;
      var detailEl = document.getElementById('co-tail-detail');
      var compOpts = components.map(function(c) { return { value: c.id, label: c.label }; });
      var intfOpts = interfaces.map(function(i) { return { value: i.id, label: i.label }; });
      var allOpts = compOpts.concat(intfOpts);
      if (allOpts.length === 0) allOpts = [{ value: '', label: '（要素なし）' }];

      var html = '';
      if (kind === 'component') {
        html =
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: WebApp') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.primaryButtonHtml('co-tail-add', '+ Component 追加');
      } else if (kind === 'interface') {
        html =
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: IAuth') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.primaryButtonHtml('co-tail-add', '+ Interface 追加');
      } else if (kind === 'port') {
        var portParentOpts = compOpts.length > 0 ? compOpts : [{ value: '', label: '（component なし）' }];
        html =
          P.selectFieldHtml('Parent component', 'co-tail-parent', portParentOpts) +
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: p1') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.primaryButtonHtml('co-tail-add', '+ Port 追加');
      } else if (kind === 'package') {
        html =
          P.fieldHtml('Label', 'co-tail-label', '', '例: Backend') +
          P.primaryButtonHtml('co-tail-add', '+ Package 追加');
      } else if (kind === 'relation') {
        html =
          P.selectFieldHtml('Kind', 'co-tail-rkind', [
            { value: 'association', label: 'Association (--)', selected: true },
            { value: 'dependency',  label: 'Dependency (..>)' },
            { value: 'provides',    label: 'Provides (lollipop -())' },
            { value: 'requires',    label: 'Requires (lollipop )-)' },
          ]) +
          P.selectFieldHtml('From', 'co-tail-from', allOpts) +
          P.selectFieldHtml('To', 'co-tail-to', allOpts) +
          P.fieldHtml('Label', 'co-tail-rlabel', '', 'association/dependency のみ任意') +
          P.primaryButtonHtml('co-tail-add', '+ Relation 追加');
      }
      detailEl.innerHTML = html;

      P.bindEvent('co-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var out = t;
        if (kind === 'component') {
          var al = document.getElementById('co-tail-alias').value.trim();
          if (!al) { alert('Alias 必須'); return; }
          window.MA.history.pushHistory();
          out = addComponent(t, al, document.getElementById('co-tail-label').value.trim() || al);
        } else if (kind === 'interface') {
          var al2 = document.getElementById('co-tail-alias').value.trim();
          if (!al2) { alert('Alias 必須'); return; }
          window.MA.history.pushHistory();
          out = addInterface(t, al2, document.getElementById('co-tail-label').value.trim() || al2);
        } else if (kind === 'port') {
          var al3 = document.getElementById('co-tail-alias').value.trim();
          if (!al3) { alert('Alias 必須'); return; }
          var parentEl = document.getElementById('co-tail-parent');
          var parentId = parentEl ? parentEl.value : '';
          if (!parentId) { alert('Parent component 必須 (port は component の中に配置)'); return; }
          window.MA.history.pushHistory();
          out = addPortToComponent(t, parentId, al3, document.getElementById('co-tail-label').value.trim() || al3);
        } else if (kind === 'package') {
          var lbl = document.getElementById('co-tail-label').value.trim();
          if (!lbl) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          out = addPackage(t, lbl);
        } else if (kind === 'relation') {
          var fr = document.getElementById('co-tail-from').value;
          var to = document.getElementById('co-tail-to').value;
          if (!fr || !to) { alert('From/To 必須'); return; }
          var rkind = document.getElementById('co-tail-rkind').value;
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, fr, to, document.getElementById('co-tail-rlabel').value.trim());
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('co-tail-kind').addEventListener('change', renderTailDetail);
    renderTailDetail();
  }

  function _renderElementEdit(element, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    if (element.kind !== 'component' && element.kind !== 'interface') {
      // port / unknown: read-only display
      propsEl.innerHTML =
        '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
        '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
          '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' + element.kind.toUpperCase() + ' (L' + element.line + ')</label>' +
          '<div style="font-size:11px;color:var(--text-secondary);">id: ' + element.id + '</div>' +
        '</div>';
      return;
    }
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' + element.kind.toUpperCase() + ' (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'co-edit-id', element.id) +
        P.fieldHtml('Label', 'co-edit-label', element.label) +
        P.primaryButtonHtml('co-edit-apply', '変更を反映') +
        '<div style="margin-top:6px;">' +
          P.primaryButtonHtml('co-rename-refs', 'Alias 変更を関連 Relation にも追従') +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
          '<button id="co-move-up" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
          '<button id="co-move-down" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
          '<button id="co-delete" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('co-edit-apply', 'click', function() {
      var newId = document.getElementById('co-edit-id').value.trim();
      var newLabel = document.getElementById('co-edit-label').value.trim();
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var fn = element.kind === 'component' ? updateComponent : updateInterface;
      if (newId !== element.id) t = fn(t, element.line, 'id', newId);
      if (newLabel !== element.label) t = fn(t, element.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('co-rename-refs', 'click', function() {
      var newId = document.getElementById('co-edit-id').value.trim();
      if (!newId || newId === element.id) { alert('Alias を変更してから実行してください'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(renameWithRefs(ctx.getMmdText(), element.id, newId));
      ctx.onUpdate();
    });
    P.bindEvent('co-move-up', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineUp(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('co-move-down', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineDown(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('co-delete', 'click', function() {
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
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
        P.selectFieldHtml('Kind', 'co-rel-kind', [
          { value: 'association', label: 'Association (--)', selected: relation.kind === 'association' },
          { value: 'dependency',  label: 'Dependency (..>)', selected: relation.kind === 'dependency' },
          { value: 'provides',    label: 'Provides (-())', selected: relation.kind === 'provides' },
          { value: 'requires',    label: 'Requires ()-)', selected: relation.kind === 'requires' },
        ]) +
        P.fieldHtml('From', 'co-rel-from', relation.from) +
        '<button id="co-rel-swap" type="button" style="font-size:11px;padding:4px 10px;margin:4px 0;cursor:pointer;">⇄ From/To 入替</button>' +
        P.fieldHtml('To', 'co-rel-to', relation.to) +
        P.fieldHtml('Label', 'co-rel-label', relation.label) +
        P.primaryButtonHtml('co-rel-apply', '変更を反映') +
        '<div style="margin-top:8px;">' +
          '<button id="co-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('co-rel-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newKind = document.getElementById('co-rel-kind').value;
      var newFrom = document.getElementById('co-rel-from').value.trim();
      var newTo = document.getElementById('co-rel-to').value.trim();
      var newLabel = document.getElementById('co-rel-label').value.trim();
      if (newKind !== relation.kind) t = updateRelation(t, relation.line, 'kind', newKind);
      if (newFrom !== relation.from) t = updateRelation(t, relation.line, 'from', newFrom);
      if (newTo !== relation.to) t = updateRelation(t, relation.line, 'to', newTo);
      if (newLabel !== relation.label) t = updateRelation(t, relation.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('co-delete', 'click', function() {
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), relation.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindEvent('co-rel-swap', 'click', function() {
      var fromEl = document.getElementById('co-rel-from');
      var toEl = document.getElementById('co-rel-to');
      var tmp = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = tmp;
    });
  }

  function _renderMultiSelectConnect(selData, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var allElements = (parsedData.elements || []).filter(function(e) {
      return e.kind === 'component' || e.kind === 'interface';
    });
    var nameById = {};
    var typeById = {};
    allElements.forEach(function(e) {
      nameById[e.id] = e.label || e.id;
      typeById[e.id] = e.kind;
    });
    var fromOpt = nameById[selData[0].id] || selData[0].id;
    var toOpt = nameById[selData[1].id] || selData[1].id;

    propsEl.innerHTML =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component - Connect 2 elements</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<div style="margin:8px 0;">' +
          'From: <strong id="co-conn-from">' + window.MA.htmlUtils.escHtml(fromOpt) + '</strong> ' +
          '<button id="co-conn-swap" type="button">⇄ swap</button> ' +
          'To: <strong id="co-conn-to">' + window.MA.htmlUtils.escHtml(toOpt) + '</strong>' +
        '</div>' +
        P.selectFieldHtml('Kind', 'co-conn-kind', [
          { value: 'association', label: 'Association (--)', selected: true },
          { value: 'dependency',  label: 'Dependency (..>)' },
          { value: 'provides',    label: 'Provides (lollipop -())' },
          { value: 'requires',    label: 'Requires (lollipop )-)' },
        ]) +
        P.fieldHtml('Label', 'co-conn-label', '', '任意') +
        P.primaryButtonHtml('co-conn-create', '+ Connect') +
      '</div>';

    var swapped = false;
    function _doSwap() {
      swapped = !swapped;
      var fromEl = document.getElementById('co-conn-from');
      var toEl = document.getElementById('co-conn-to');
      var tmp = fromEl.textContent;
      fromEl.textContent = toEl.textContent;
      toEl.textContent = tmp;
    }
    P.bindEvent('co-conn-swap', 'click', _doSwap);

    // lollipop の方向制約: provides は component → interface、requires は interface → component
    P.bindEvent('co-conn-kind', 'change', function() {
      var kind = document.getElementById('co-conn-kind').value;
      if (kind !== 'provides' && kind !== 'requires') return;
      var fromId = swapped ? selData[1].id : selData[0].id;
      var fromType = typeById[fromId];
      var needSwap = (kind === 'provides' && fromType !== 'component') ||
                     (kind === 'requires' && fromType !== 'interface');
      if (needSwap) _doSwap();
    });

    P.bindEvent('co-conn-create', 'click', function() {
      window.MA.history.pushHistory();
      var fromId = swapped ? selData[1].id : selData[0].id;
      var toId = swapped ? selData[0].id : selData[1].id;
      var kind = document.getElementById('co-conn-kind').value;
      var label = document.getElementById('co-conn-label').value.trim();
      var t = ctx.getMmdText();
      var out = addRelation(t, kind, fromId, toId, label);
      ctx.setMmdText(out);
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderMultiSelect(selData, parsedData, propsEl) {
    propsEl.innerHTML =
      '<div style="padding:12px;color:var(--text-secondary);font-size:11px;">' +
      selData.length + ' elements selected。Connect は 2 elements まで。' +
      'Shift+クリックで解除できます。</div>';
  }

  function _renderGroupReadOnly(group, parsedData, propsEl, ctx) {
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">PACKAGE (L' + group.startLine + '-' + group.endLine + ')</label>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Label: ' + group.label + '</div>' +
        '<div style="font-size:10px;color:var(--text-secondary);">v0.4.0: package ラベル変更 / 範囲指定 wrap は v0.5.0 で対応</div>' +
      '</div>';
    propsEl.innerHTML = html;
  }

  return {
    type: 'plantuml-component',
    displayName: 'Component',
    parse: parse,
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-component'; },
    template: function() {
      return [
        '@startuml',
        'title Sample Component',
        'component WebApp',
        'interface IAuth',
        '',
        'WebApp -() IAuth',
        '@enduml',
      ].join('\n');
    },
    fmtComponent: fmtComponent,
    fmtInterface: fmtInterface,
    fmtPort: fmtPort,
    fmtPackage: fmtPackage,
    fmtRelation: fmtRelation,
    addComponent: addComponent,
    addInterface: addInterface,
    addPort: addPort,
    addPortToComponent: addPortToComponent,
    addPackage: addPackage,
    addRelation: addRelation,
    updateComponent: updateComponent,
    updateInterface: updateInterface,
    updateRelation: updateRelation,
    deleteLine: deleteLine,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    renameWithRefs: renameWithRefs,
    renderProps: renderProps,
    capabilities: {
      overlaySelection: true,
      hoverInsert: false,
      participantDrag: false,
      showInsertForm: false,
      multiSelectConnect: true,
    },
    buildOverlay: function(svgEl, parsedData, overlayEl) {
      if (!svgEl || !overlayEl) return { matched: {}, unmatched: {} };
      var OB = window.MA.overlayBuilder;
      OB.syncDimensions(svgEl, overlayEl);

      var components = (parsedData.elements || []).filter(function(e) { return e.kind === 'component'; });
      var interfaces = (parsedData.elements || []).filter(function(e) { return e.kind === 'interface'; });

      // PlantUML emits component/interface as <g class="entity" data-qualified-name="X">
      // (実機 SVG)。test fixture は g.component / g.interface の旧形式も受理する fallback。
      function _matchEntity(item) {
        var g = svgEl.querySelector('g.entity[data-qualified-name="' + item.id + '"]');
        if (g) return g;
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

      var compMatched = 0;
      components.forEach(function(c) {
        var g = _matchEntity(c);
        if (!g) return;
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 8, bb.y - 6, bb.width + 16, bb.height + 12, {
          'data-type': 'component',
          'data-id': c.id,
          'data-line': c.line,
        });
        compMatched++;
      });

      var ifMatched = 0;
      interfaces.forEach(function(i) {
        var g = _matchEntity(i);
        if (!g) return;
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 6, bb.width + 12, bb.height + 12, {
          'data-type': 'interface',
          'data-id': i.id,
          'data-line': i.line,
        });
        ifMatched++;
      });

      // candidates for port matching (still uses data-source-line)
      var startUml = (parsedData.meta && parsedData.meta.startUmlLine) || 0;
      var candidates = [];
      function _push(v) { if (candidates.indexOf(v) === -1) candidates.push(v); }
      if (startUml > 0) _push(startUml);
      _push(0);
      _push(1);

      var packages = (parsedData.groups || []).filter(function(g) { return g.kind === 'package'; });
      var pkgGroups = svgEl.querySelectorAll('g.cluster');
      var pkgN = Math.min(packages.length, pkgGroups.length);
      for (var pi = 0; pi < pkgN; pi++) {
        var pg = pkgGroups[pi];
        var pkgRect = pg.querySelector('rect');
        if (!pkgRect) continue;
        OB.addRect(overlayEl,
          (parseFloat(pkgRect.getAttribute('x')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('y')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('width')) || 0) + 4,
          (parseFloat(pkgRect.getAttribute('height')) || 0) + 4, {
            'data-type': 'package',
            'data-id': packages[pi].id,
            'data-line': packages[pi].startLine,
          });
      }

      var ports = (parsedData.elements || []).filter(function(e) { return e.kind === 'port'; });
      var portMatched = 0;
      ports.forEach(function(p) {
        // port も entity name で引いて、なければ legacy fallback
        var g = svgEl.querySelector('g.entity[data-qualified-name="' + p.id + '"]')
             || svgEl.querySelector('g.port[data-source-line]');
        if (!g) return;
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 4, bb.y - 4, bb.width + 8, bb.height + 8, {
          'data-type': 'port',
          'data-id': p.id,
          'data-line': p.line,
        });
        portMatched++;
      });

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
          component: compMatched,
          interface: ifMatched,
          port: portMatched,
          package: pkgN,
          relation: relN,
        },
        unmatched: {
          component: components.length - compMatched,
          interface: interfaces.length - ifMatched,
          port: ports.length - portMatched,
          package: packages.length - pkgN,
          relation: relations.length - relN,
        },
      };
    },
  };
})();
