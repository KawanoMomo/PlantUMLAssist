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
  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (RP.isEndUml(lines[i])) { endIdx = i; break; }
    }
    if (endIdx < 0) {
      var insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, newLine);
    } else {
      lines.splice(endIdx, 0, newLine);
    }
    return lines.join('\n');
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

  function moveLineUp(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx <= 0 || idx >= lines.length) return text;
    var tmp = lines[idx];
    lines[idx] = lines[idx - 1];
    lines[idx - 1] = tmp;
    return lines.join('\n');
  }

  function moveLineDown(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length - 1) return text;
    var tmp = lines[idx];
    lines[idx] = lines[idx + 1];
    lines[idx + 1] = tmp;
    return lines.join('\n');
  }

  // ─── renameWithRefs: rename id and update all references ──────────────
  // mirrors sequence.js renameWithRefs with sentinel-based label protection.
  //  /  sentinels temporarily replace "..." quoted labels so the
  // \b<id>\b word-boundary replace cannot touch label contents.
  function renameWithRefs(text, oldId, newId) {
    if (!oldId || !newId || oldId === newId) return text;
    var escaped = DU.escapeForRegex(oldId);
    var pattern = new RegExp('\\b' + escaped + '\\b', 'g');
    return text.split('\n').map(function(line) {
      if (DU.isPlantumlComment(line)) return line;
      var quoted = [];
      var stripped = line.replace(/"[^"]*"/g, function(m) {
        quoted.push(m);
        return '' + (quoted.length - 1) + '';
      });
      var replaced = stripped.replace(pattern, newId);
      return replaced.replace(/(\d+)/g, function(_, idx) {
        return quoted[parseInt(idx, 10)];
      });
    }).join('\n');
  }

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
    if (!propsEl) return;
    var P = window.MA.properties;
    var elements = parsedData.elements || [];
    var actors = elements.filter(function(e) { return e.kind === 'actor'; });
    var usecases = elements.filter(function(e) { return e.kind === 'usecase'; });

    if (!selData || selData.length === 0) {
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
            var al = document.getElementById('uc-tail-alias').value.trim();
            if (!al) { alert('Alias 必須'); return; }
            window.MA.history.pushHistory();
            out = addActor(t, al, document.getElementById('uc-tail-label').value.trim() || al);
          } else if (kind === 'usecase') {
            var al2 = document.getElementById('uc-tail-alias').value.trim();
            if (!al2) { alert('Alias 必須'); return; }
            window.MA.history.pushHistory();
            out = addUsecase(t, al2, document.getElementById('uc-tail-label').value.trim() || al2);
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
      return;
    }

    // selection 1 件のみ対応 (multi-select は v0.5.0)
    var sel = selData[0];
    var element = elements.find(function(e) { return e.id === sel.id && e.kind === sel.type; });
    var relation = (parsedData.relations || []).find(function(r) { return r.id === sel.id; });
    var pkg = (parsedData.groups || []).find(function(g) { return g.id === sel.id; });

    var html = '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">UseCase Diagram</div>';

    if (element && (element.kind === 'actor' || element.kind === 'usecase')) {
      html +=
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
    } else if (relation) {
      html +=
        '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
          '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
          P.selectFieldHtml('Kind', 'uc-rel-kind', [
            { value: 'association',    label: 'Association (-->)', selected: relation.kind === 'association' },
            { value: 'generalization', label: 'Generalization (<|--)', selected: relation.kind === 'generalization' },
            { value: 'include',        label: 'Include (..> <<include>>)', selected: relation.kind === 'include' },
            { value: 'extend',         label: 'Extend (..> <<extend>>)', selected: relation.kind === 'extend' },
          ]) +
          P.fieldHtml('From', 'uc-rel-from', relation.from) +
          P.fieldHtml('To', 'uc-rel-to', relation.to) +
          P.fieldHtml('Label', 'uc-rel-label', relation.label) +
          P.primaryButtonHtml('uc-rel-apply', '変更を反映') +
          '<div style="margin-top:8px;">' +
            '<button id="uc-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
          '</div>' +
        '</div>';
    } else if (pkg) {
      html +=
        '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
          '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">PACKAGE (L' + pkg.startLine + '-' + pkg.endLine + ')</label>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Label: ' + pkg.label + '</div>' +
          '<div style="font-size:10px;color:var(--text-secondary);">v0.3.0: package のラベル変更 / 範囲指定 wrap は v0.5.0 で対応</div>' +
        '</div>';
    }

    propsEl.innerHTML = html;

    // bindings
    if (element && (element.kind === 'actor' || element.kind === 'usecase')) {
      P.bindEvent('uc-edit-apply', 'click', function() {
        var newId = document.getElementById('uc-edit-id').value.trim();
        var newLabel = document.getElementById('uc-edit-label').value.trim();
        window.MA.history.pushHistory();
        var t = ctx.getMmdText();
        var fn = element.kind === 'actor' ? updateActor : updateUsecase;
        if (newId !== element.id) t = fn(t, element.line, 'id', newId);
        if (newLabel !== element.label) t = fn(t, element.line, 'label', newLabel);
        ctx.setMmdText(t);
        ctx.onUpdate();
      });
      P.bindEvent('uc-rename-refs', 'click', function() {
        var newId = document.getElementById('uc-edit-id').value.trim();
        if (!newId || newId === element.id) { alert('Alias を変更してから実行してください'); return; }
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
    } else if (relation) {
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
    }
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
    buildOverlay: function() { /* v0.3.0 では overlay なし */ },
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
