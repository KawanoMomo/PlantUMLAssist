'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlComponent = (function() {
  var DU = window.MA.dslUtils;
  var RP = window.MA.regexParts;
  var ID = RP.IDENTIFIER;

  // component: keyword form (with capturing label group inlined since RP.QUOTED_NAME is non-capturing)
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  // 末尾の `<<stereotype>>` は任意 (design 5d)。付いていても要素として読めるようにする。
  var STEREO_OPT = '(?:\\s+<<\\s*([^>]+?)\\s*>>)?';
  var COMPONENT_KW_RE = new RegExp(
    '^component\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)' + STEREO_OPT + '\\s*\\{?\\s*$'
  );
  // component: [X] / [Label] as Alias
  var COMPONENT_SHORT_RE = /^\[([^\]]+)\](?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*\{?\s*$/;

  // interface: keyword form
  // groups: 1=quoted label (leading), 2=alias ID, 3=bare ID, 4=quoted label (trailing)
  var INTERFACE_KW_RE = new RegExp(
    '^interface\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)' + STEREO_OPT + '\\s*$'
  );
  // interface: () X / () X as I
  var INTERFACE_SHORT_RE = /^\(\)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?(?:\s+<<\s*([^>]+?)\s*>>)?\s*$/;

  // BLK-migrator-20260923-1409: 波括弧を伴わない要素宣言 (`agent "Published Event" as event`)。
  // PlantUML の component 図は component / [X] 以外にもこれらの語で部品を宣言できる。
  // 読めないと部品が要素の一覧から落ち、ホバーの選択枠が 1 つも出なかった
  // (aws-icons-for-plantuml の `examples__Basic Usage.puml`)。
  // 波括弧つきの同じ語は上の PACKAGE_OPEN_RE が先に拾うので、ここは波括弧無しだけ。
  var ELEM_KW = 'agent|node|artifact|cloud|storage|stack|card|file|hexagon|person|folder|frame|rectangle';
  var COMPONENT_ELEM_RE = new RegExp(
    '^(?:' + ELEM_KW + ')\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)' + STEREO_OPT + '\\s*$'
  );

  // BLK-migrator-20260923-1409: ライブラリの手続きで部品を宣言する行
  // (`IoTRule(iotRule, "Action Error Rule", "error if Kinesis fails")`)。1 番目の引数が
  // 部品の名前で、PlantUML はその名前を SVG に残す。読めないと枠が出ない。
  // 関係・配置・表示切替の手続き (Rel / Lay / Show ...) は部品ではないので除く。
  var MACRO_ELEM_RE = /^\$?([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*"([^"]*)")?[^{}]*\)\s*$/;
  var MACRO_NOT_ELEM_RE = /^(?:Bi)?Rel|^Lay|^Show|^Hide|^Update|^Add|^Set|^Skin|^Layout|^Legend|^Increment|^Include|^Boundary/i;
  var PREPROC_BLOCK_OPEN_RE = /^!(?:unquoted\s+)?(?:procedure|function|definelong)\b/i;
  var PREPROC_BLOCK_END_RE = /^!end(?:procedure|function|definelong)\b/i;

  var PACKAGE_OPEN_RE = new RegExp(
    '^(?:package|folder|frame|node|rectangle)\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );
  var PACKAGE_CLOSE_RE = /^\s*\}\s*$/;

  var PORT_KW_RE = new RegExp(
    '^port\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*$'
  );

  // BLK-migrator-20260918-0249: 関係行の両端は `[X]` の角括弧でも書ける
  // (component-04 のように `[X]` 単独の宣言が 1 行も無く、関係行だけで図が成り立つ)。
  // 矢印には置き方の指示 (-up-> / -right->) と双方向 (<-->) も入る。
  // どちらも読めないと行が関係として拾えず、その行にしか出てこない部品が
  // 要素の一覧から丸ごと落ちて、ホバーの選択枠が 1 つも出なくなる。
  var ENDPOINT = '(?:' + ID + '|"[^"]+"|\\[[^\\]]+\\])';
  var _LINE = '(?:-{1,2}|\\.{1,2})';
  var _BODY = _LINE + '(?:' + RP.ARROW_DIRECTION + _LINE + ')?';
  var ARROW = '(?:-\\(\\)|\\(\\)-|\\)-|-\\('
    + '|<' + _BODY + '>|' + _BODY + '>|<' + _BODY + '|' + _BODY + ')';
  var RELATION_RE = new RegExp(
    '^(' + ENDPOINT + ')\\s+(' + ARROW + ')\\s+(' + ENDPOINT + ')(?:\\s*:\\s*(.+))?$'
  );

  // `[X]` の角括弧を外して部品の id にする。引用名は DU.unquote と同じ扱い。
  function endpointId(raw) {
    var s = DU.unquote(String(raw == null ? '' : raw).trim());
    var m = s.match(/^\[([^\]]+)\]$/);
    return m ? m[1].trim() : s;
  }
  function isBracketEndpoint(raw) {
    return /^\[[^\]]+\]$/.test(String(raw == null ? '' : raw).trim());
  }

  // 矢印の種別。方向語 (-up->) や色は線の意味を変えないので、
  // 点線かどうかと lollipop の形だけで決める。
  function relationKindOf(arrow) {
    if (arrow === '-()' || arrow === '()-') return 'provides';
    if (arrow === ')-' || arrow === '-(') return 'requires';
    if (arrow.indexOf('.') >= 0) return 'dependency';
    return 'association';
  }

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  // design 5d: ステレオタイプは要素名の後ろに `<<...>>` で足す (空なら書かない)。
  function _stereoSuffix(stereotype) {
    var s = (stereotype == null ? '' : String(stereotype)).trim();
    return s ? ' <<' + s + '>>' : '';
  }
  function fmtComponent(id, label, stereotype) {
    var head = (label && label !== id) ? 'component "' + label + '" as ' + id : 'component ' + id;
    return head + _stereoSuffix(stereotype);
  }
  function fmtInterface(id, label, stereotype) {
    var head = (label && label !== id) ? 'interface "' + label + '" as ' + id : 'interface ' + id;
    return head + _stereoSuffix(stereotype);
  }
  function fmtPort(id, label) {
    if (label && label !== id) return 'port "' + label + '" as ' + id;
    return 'port ' + id;
  }
  // design 5d: 境界の表記 (package / folder / frame / node / rectangle)。
  // 書式は group-notation に 1 つだけ置く。
  function fmtPackage(label, notation) {
    return window.MA.groupNotation.fmtOpen(notation, label, 'plantuml-component');
  }
  function fmtRelation(kind, from, to, label) {
    var lbl = label || '';
    if (kind === 'dependency') return from + ' ..> ' + to + (lbl ? ' : ' + lbl : '');
    if (kind === 'provides') return from + ' -() ' + to;
    if (kind === 'requires') return from + ' )- ' + to;
    return from + ' -- ' + to + (lbl ? ' : ' + lbl : '');
  }

  function _existingComponentIdSet(parsed) {
    var set = {};
    var elts = (parsed && parsed.elements) || [];
    elts.forEach(function(e) { if (e.id) set[e.id] = true; });
    return set;
  }

  function normalizeIdInput(rawInput, parsed) {
    return window.MA.idNormalizer.normalize(rawInput, _existingComponentIdSet(parsed), 'C');
  }

  function addComponent(text, id, label, stereotype) { return insertBeforeEnd(text, fmtComponent(id, label || id, stereotype)); }
  function addInterface(text, id, label, stereotype) { return insertBeforeEnd(text, fmtInterface(id, label || id, stereotype)); }
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
  function addPackage(text, label, notation) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtPackage(label, notation)), '}');
  }

  // 既にある境界の表記だけを差し替える (ラベル・中身・閉じ括弧はそのまま)。
  function changeGroupNotation(text, lineNum, notation) {
    return window.MA.groupNotation.changeNotation(text, lineNum, notation, 'plantuml-component');
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }

  // 一括追加の 1 行を 1 操作に読み替える。要素は
  //   `Alias`, `component Alias`, `interface Alias : Label`, `[Alias]`, `()Alias`
  // 関係は
  //   `A -- B : label`(association) / `A ..> B`(dependency) / `A -() B`(provides) /
  //   `A )- B`(requires)。`->` `-->` は association、`..` は dependency として扱う。
  var BULK_ARROW_RE = /\s(-\(\)|\)-|\.\.>|\.\.|-->|->|--)\s/;
  var BULK_ARROW_KIND = {
    '-()': 'provides',
    ')-': 'requires',
    '..>': 'dependency',
    '..': 'dependency',
    '-->': 'association',
    '->': 'association',
    '--': 'association',
  };

  function _stripDeco(s) {
    var t = String(s || '').trim();
    t = t.replace(/^\[(.*)\]$/, '$1').replace(/^\(\)\s*/, '').replace(/^interface\s+/i, '')
         .replace(/^component\s+/i, '');
    return t.replace(/^"(.*)"$/, '$1').trim();
  }

  function parseBulkLines(block) {
    var out = [];
    if (!block) return out;
    var lines = String(block).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s || s.indexOf("'") === 0 || s.indexOf('#') === 0) continue;
      var am = s.match(BULK_ARROW_RE);
      if (am) {
        var pos = s.indexOf(am[0]);
        var left = s.slice(0, pos);
        var rest = s.slice(pos + am[0].length);
        var lbl = '';
        var ci = rest.indexOf(':');
        if (ci >= 0) { lbl = rest.slice(ci + 1).trim(); rest = rest.slice(0, ci); }
        var from = _stripDeco(left);
        var to = _stripDeco(rest);
        if (!from || !to) continue;
        out.push({ op: 'relation', kind: BULK_ARROW_KIND[am[1]], from: from, to: to, label: lbl });
        continue;
      }
      var isIntf = /^interface\s+/i.test(s) || /^\(\)/.test(s);
      var body = s.replace(/^(component|interface)\s+/i, '').replace(/^\(\)\s*/, '');
      var label2 = '';
      var ci2 = body.indexOf(':');
      if (ci2 >= 0) { label2 = body.slice(ci2 + 1).trim(); body = body.slice(0, ci2); }
      // BLK-junior-20260907-0943: `"表示名" as Alias` / `Alias as "表示名"` は
      // PlantUML の宣言そのもので、他の図から取り込んだ行にはこの形が普通に入る。
      // 名前と表示名に分けずに丸ごと名前として扱うと、`interface ""表示名" as I" as C1`
      // という壊れた行が書き出されてしまう。
      var asm = body.trim().match(/^"([^"]+)"\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/)
        || (function() {
          var m = body.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+"([^"]+)"$/);
          return m ? [m[0], m[2], m[1]] : null;
        })();
      var id;
      if (asm) {
        id = asm[2];
        if (!label2) label2 = asm[1];
      } else {
        id = _stripDeco(body);
      }
      if (!id) continue;
      out.push({ op: isIntf ? 'interface' : 'component', id: id, label: label2 });
    }
    return out;
  }

  // 要素は先に全部宣言してから関係を並べる。関係行に出てきただけの名前は
  // PlantUML 側で暗黙宣言されるので、こちらでは足さない。
  function addBulk(text, block, parsed) {
    var ops = parseBulkLines(block);
    var out = text;
    var idMap = {};
    var taken = _existingComponentIdSet(parsed || { elements: [] });
    var i;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.op !== 'component' && o.op !== 'interface') continue;
      var norm = window.MA.idNormalizer.normalize(o.id, taken, 'C');
      if (!norm.valid) continue;
      idMap[o.id] = norm.id;
      taken[norm.id] = true;
      var lbl = o.label || norm.label || o.id;
      out = (o.op === 'interface') ? addInterface(out, norm.id, lbl) : addComponent(out, norm.id, lbl);
    }
    for (i = 0; i < ops.length; i++) {
      var r = ops[i];
      if (r.op !== 'relation') continue;
      out = addRelation(out, r.kind, idMap[r.from] || r.from, idMap[r.to] || r.to, r.label);
    }
    return out;
  }

  function updateComponent(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label, stereo = null;
    var km = trimmed.match(COMPONENT_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else { id = km[3]; label = km[4] !== undefined ? km[4] : km[3]; }
      stereo = km[5] || null;
    } else {
      var sm = trimmed.match(COMPONENT_SHORT_RE);
      if (!sm) return text;
      label = sm[1].trim(); id = sm[2] || label;
      stereo = sm[3] || null;
    }
    if (field === 'id') id = value;
    else if (field === 'label') label = value;
    else if (field === 'stereotype') stereo = value;
    var openBrace = /\{\s*$/.test(lines[idx]) ? ' {' : '';
    lines[idx] = indent + fmtComponent(id, label, stereo) + openBrace;
    return lines.join('\n');
  }

  function updateInterface(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var id, label, labelImplicit = false, stereo = null;
    var km = trimmed.match(INTERFACE_KW_RE);
    if (km) {
      if (km[2] !== undefined) { id = km[2]; label = km[1]; }
      else {
        id = km[3];
        if (km[4] !== undefined) { label = km[4]; }
        else { label = km[3]; labelImplicit = true; }
      }
      stereo = km[5] || null;
    } else {
      var sm = trimmed.match(INTERFACE_SHORT_RE);
      if (!sm) return text;
      // () X / () X as I:  m[1] = X (token), m[2] = I (alias)
      var firstToken = sm[1].trim();
      id = sm[2] || firstToken;
      label = firstToken;
      stereo = sm[3] || null;
    }
    if (field === 'id') {
      id = value;
      if (labelImplicit) label = value;
    } else if (field === 'label') label = value;
    else if (field === 'stereotype') stereo = value;
    lines[idx] = indent + fmtInterface(id, label, stereo);
    return lines.join('\n');
  }

  function updateRelation(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var deco = window.MA.relationOptions.decorationsOf(lines[idx]);
    var m = window.MA.relationOptions.plainLine(trimmed).match(RELATION_RE);
    if (!m) return text;
    var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
    var from = endpointId(fromRaw), to = endpointId(toRaw);
    var kind = relationKindOf(arrow);

    if (field === 'kind') kind = value;
    else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') lbl = value;

    // 多重度・線の色は種別やラベルの書き換えでは失われない (design 3c)。
    lines[idx] = window.MA.relationOptions.applyDecorations(
      indent + fmtRelation(kind, from, to, lbl), deco);
    return lines.join('\n');
  }

  function deleteLine(text, lineNum) { return window.MA.textUpdater.deleteLine(text, lineNum); }
  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

  // BLK-junior-20260909-0303: 新規タブのサンプル (WebApp / IAuth) を自分の部品名へ
  // 付け替えるのに、要素ごとに「選択 → Alias/Label を打ち直す → 変更を反映 →
  // Alias 変更を関連 Relation にも追従」を繰り返していた。edits をまとめて当て、
  // 関連への追従も同時に済ませる。
  // edits: [{ line, id, label }]。空欄と同値は無視する。id は関連にも追従する。
  function renameElements(text, edits) {
    var out = String(text == null ? '' : text);
    if (!Array.isArray(edits) || !edits.length) return out;
    var byLine = {};
    parse(out).elements.forEach(function(e) { byLine[e.line] = e; });
    edits.forEach(function(ed) {
      if (!ed) return;
      var el = byLine[Number(ed.line)];
      if (!el || (el.kind !== 'component' && el.kind !== 'interface')) return;
      var newId = ed.id == null ? '' : String(ed.id).trim();
      var newLabel = ed.label == null ? '' : String(ed.label).trim();
      // Alias を先に当てる。宣言行の行番号は置換で動かないので Label は後から効く。
      if (newId && newId !== el.id) out = renameWithRefs(out, el.id, newId);
      if (newLabel && newLabel !== el.label) {
        var fn = el.kind === 'component' ? updateComponent : updateInterface;
        out = fn(out, el.line, 'label', newLabel);
      }
    });
    return out;
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

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');

    var packageStack = [];
    var packageCounter = 0;
    var lastComponentId = null;
    var implicit = [];
    var inPreproc = false;

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      // 手続き・関数の本体は展開前の型紙なので要素として読まない。
      if (inPreproc) { if (PREPROC_BLOCK_END_RE.test(trimmed)) inPreproc = false; continue; }
      if (PREPROC_BLOCK_OPEN_RE.test(trimmed)) { inPreproc = true; continue; }
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
        var pkg = { kind: 'package', notation: (window.MA.groupNotation.notationOf(trimmed) || 'package'), id: pkgId, label: pkgLabel, startLine: lineNum, endLine: 0, parentId: parent };
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
        result.elements.push({ kind: 'component', id: id, label: label, stereotype: m[5] || null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = id;  // track for port adjacency
        continue;
      }
      // component short [X] / [Label] as Alias
      m = trimmed.match(COMPONENT_SHORT_RE);
      if (m) {
        var label2 = m[1].trim();
        var id2 = m[2] || label2;
        result.elements.push({ kind: 'component', id: id2, label: label2, stereotype: m[3] || null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = id2;  // track for port adjacency
        continue;
      }
      // 波括弧を伴わない要素宣言 (agent / node / cloud / ...) も部品として読む。
      m = trimmed.match(COMPONENT_ELEM_RE);
      if (m) {
        var idE, labelE;
        if (m[2] !== undefined) { idE = m[2]; labelE = m[1]; }
        else { idE = m[3]; labelE = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'component', id: idE, label: labelE, stereotype: m[5] || null, line: lineNum, parentPackageId: currentPackageId });
        lastComponentId = idE;
        continue;
      }
      // ライブラリの手続きによる部品宣言
      m = trimmed.match(MACRO_ELEM_RE);
      if (m && !MACRO_NOT_ELEM_RE.test(m[1])) {
        result.elements.push({ kind: 'component', id: m[2], label: m[3] !== undefined ? m[3] : m[2], stereotype: m[1], line: lineNum, parentPackageId: currentPackageId, macro: true });
        lastComponentId = m[2];
        continue;
      }
      // interface keyword
      m = trimmed.match(INTERFACE_KW_RE);
      if (m) {
        var id3, label3;
        if (m[2] !== undefined) { id3 = m[2]; label3 = m[1]; }
        else { id3 = m[3]; label3 = m[4] !== undefined ? m[4] : m[3]; }
        result.elements.push({ kind: 'interface', id: id3, label: label3, stereotype: m[5] || null, line: lineNum, parentPackageId: currentPackageId });
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
        result.elements.push({ kind: 'interface', id: realId, label: realLabel, stereotype: m[3] || null, line: lineNum, parentPackageId: currentPackageId });
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
      m = window.MA.relationOptions.plainLine(trimmed).match(RELATION_RE);
      if (m) {
        var fromRaw = m[1], arrow = m[2], toRaw = m[3], lbl = (m[4] || '').trim();
        var from = endpointId(fromRaw);
        var to = endpointId(toRaw);
        // 角括弧で書かれた両端は、宣言行が無くても PlantUML が部品を描く。
        // 後で「まだ宣言されていないもの」だけを要素に足す (順序に依らない)。
        if (isBracketEndpoint(fromRaw)) implicit.push({ id: from, line: lineNum, pkg: currentPackageId });
        if (isBracketEndpoint(toRaw)) implicit.push({ id: to, line: lineNum, pkg: currentPackageId });
        var kind = relationKindOf(arrow);

        if (arrow === '()-') {
          var tmp = from; from = to; to = tmp; arrow = '-()';
        } else if (arrow === '-(') {
          var tmp2 = from; from = to; to = tmp2; arrow = ')-';
        } else if (kind === 'dependency' && arrow.charAt(0) === '<' && arrow.slice(-1) !== '>') {
          // `<..` / `<.up.` は向きだけ逆。始点と終点を入れ替えて `..>` 側に揃える。
          var tmp3 = from; from = to; to = tmp3; arrow = arrow.slice(1) + '>';
        }

        result.relations.push({
          id: '__r_' + result.relations.length,
          kind: kind, from: from, to: to, arrow: arrow, label: lbl, line: lineNum,
        });
        continue;
      }
    }

    // 宣言行が無いまま関係行の `[X]` にだけ出てくる部品を足す。
    // 宣言が後ろの行にあっても重複させない (走査後にまとめて判定する)。
    var known = {};
    result.elements.forEach(function(e) { if (e.id) known[e.id] = true; });
    implicit.forEach(function(c) {
      if (!c.id || known[c.id]) return;
      known[c.id] = true;
      result.elements.push({
        kind: 'component', id: c.id, label: c.id, stereotype: null,
        line: c.line, parentPackageId: c.pkg, implicit: true,
      });
    });
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

  // BLK-junior-20260908-0203-wish: 定石の依存チェック。
  // 判断は core/component-deps.js に置き、ここは並べて選ばせるだけ。
  // 候補は「この図に無いもの」しか来ないので、押した数だけ図が埋まる。
  // 候補の出所。実績 (usage) は自分の他の図、定石 (catalog) は一般論、
  // 他の図 (peer) は別部品の実績。どれを信じて押すかが分かれるので必ず出す。
  var SOURCE_TAG = { usage: '実際の呼び出し', catalog: '定石', peer: '他の図' };

  function _renderDepsCheck(parsedData, ctx) {
    var CD = window.MA.componentDeps;
    var P = window.MA.properties;
    var esc = window.MA.htmlUtils.escHtml;
    var sumEl = document.getElementById('co-deps-summary');
    var bodyEl = document.getElementById('co-deps-body');
    if (!CD || !sumEl || !bodyEl) return;

    var ws = window.MA.workspace;
    var docs = (ws && ws.list) ? ws.list() : [];
    var activeId = (ws && ws.getActiveId) ? ws.getActiveId() : null;
    var dsl = ctx.getMmdText();
    // BLK-junior-20260909-0303-wish: 実績は「依存の起点」ごとに変わるので、
    // 選び直したらチェックリストも引き直す。
    var subjEl0 = document.getElementById('co-deps-subject');
    var subject = (subjEl0 && subjEl0.value) || CD.defaultSubject(dsl);
    var res = CD.check(dsl, docs, activeId, subject);

    sumEl.textContent = CD.summaryText(res);
    sumEl.setAttribute('data-missing', String(res.rows.length));
    sumEl.setAttribute('data-usage-missing', String(res.usageMissing));
    sumEl.setAttribute('data-catalog-missing', String(res.catalogMissing));
    sumEl.setAttribute('data-peer-missing', String(res.peerMissing));

    if (!res.rows.length) { bodyEl.innerHTML = ''; return; }

    var subjOpts = CD.subjects(dsl).map(function(s) {
      return { value: s.id, label: s.label, selected: s.id === subject };
    });
    if (!subjOpts.length) {
      bodyEl.innerHTML = '<div id="co-deps-nosubject" style="font-size:10px;color:var(--text-secondary);">'
        + '依存の起点になる component がまだありません（先に上の「末尾に追加」で 1 つ作ってください）</div>';
      return;
    }

    var rows = res.rows.map(function(r, i) {
      return '<label class="co-dep-row" data-dep-key="' + esc(r.key) + '" data-dep-source="' + esc(r.source) + '"'
        + ' style="display:flex;align-items:flex-start;gap:6px;padding:3px 4px;border-radius:3px;cursor:pointer;">'
        + '<input type="checkbox" class="co-dep-check" data-i="' + i + '" style="margin-top:2px;">'
        + '<span style="flex:1;">'
          + '<span style="font-size:12px;color:var(--text-primary);">' + esc(r.name) + '</span>'
          + (r.label ? ' <span style="font-size:10px;color:var(--accent);">' + esc(r.label) + '</span>' : '')
          + '<span style="display:block;font-size:10px;color:var(--text-secondary);line-height:1.4;">' + esc(r.why) + '</span>'
        + '</span>'
        + '<span style="font-size:9px;color:var(--text-secondary);white-space:nowrap;">'
          + esc(SOURCE_TAG[r.source] || r.source) + '</span>'
      + '</label>';
    }).join('');

    bodyEl.innerHTML =
      P.selectFieldHtml('依存の起点', 'co-deps-subject', subjOpts) +
      '<div id="co-deps-list" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:3px;padding:4px;margin-top:6px;">'
        + rows + '</div>' +
      P.primaryButtonHtml('co-deps-add', '+ 選んだ依存を追加');

    // 起点を替えたら実績も替わる。押す前に候補が起点に追随しないと、
    // 他の部品の呼び出しを自分の依存として足してしまう。
    P.bindEvent('co-deps-subject', 'change', function() {
      _renderDepsCheck(parsedData, ctx);
    });

    P.bindEvent('co-deps-add', 'click', function() {
      var picks = [];
      var checks = document.querySelectorAll('#co-deps-list .co-dep-check');
      for (var i = 0; i < checks.length; i++) {
        if (checks[i].checked) picks.push(res.rows[Number(checks[i].getAttribute('data-i'))]);
      }
      if (!picks.length) { alert('追加する依存先を選んでください'); return; }
      var subjEl = document.getElementById('co-deps-subject');
      var block = CD.blockFor(subjEl ? subjEl.value : '', picks);
      if (!block) { alert('依存の起点を選んでください'); return; }
      var t = ctx.getMmdText();
      var out = addBulk(t, block, parsedData);
      if (out === t) { alert('追加できる行がありません'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(out);
      ctx.onUpdate();
    });
  }

  // BLK-junior-20260912-2206-wish: 手本になるコンポーネント図が 1 枚も無い部品を、
  // 部品名 1 語から起こす。判断は core/component-starter.js に置き、ここは
  // 「この部品の図はまだ無い」の確認と、押したときの引き渡しだけをする。
  function _bindStarter() {
    var CS = window.MA.componentStarter;
    var P = window.MA.properties;
    var inputEl = document.getElementById('co-starter-subject');
    var hintEl = document.getElementById('co-starter-hint');
    var haveEl = document.getElementById('co-starter-have');
    if (!CS || !inputEl || !hintEl || !haveEl) return;

    var refresh = function() {
      var ws = window.MA.workspace;
      var docs = (ws && ws.list) ? ws.list() : [];
      var plan = CS.plan(inputEl.value, docs);
      hintEl.textContent = CS.summary(plan);
      hintEl.setAttribute('data-deps', String(plan ? plan.rows.length : 0));
      hintEl.setAttribute('data-usage', String(plan ? plan.usageCount : 0));
      // 既にこの部品の図があるなら、下書きより先にそれを開く方が早い。
      var have = plan ? CS.existingDocs(inputEl.value, docs) : [];
      haveEl.setAttribute('data-have', String(have.length));
      haveEl.textContent = !plan ? ''
        : (have.length
          ? 'この部品のコンポーネント図は既にあります: ' + have.map(function(d) { return d.name; }).join(' / ')
          : 'この部品のコンポーネント図はまだありません');
    };
    inputEl.addEventListener('input', refresh);
    refresh();

    P.bindEvent('co-starter-add', 'click', function() {
      if (!window.MA.makeComponentDraft) { alert('下書きを作れませんでした'); return; }
      if (!CS.normalizeSubject(inputEl.value)) { alert('部品名を入れてください (例: TIMER)'); return; }
      window.MA.makeComponentDraft(inputEl.value);
    });
  }

  // BLK-junior-20260909-0303: 図の全要素の Alias / Label を 1 枚の表で書き換える。
  // 要素を 1 個ずつ選び直す往復と「関連にも追従」の押下を無くすため、反映は
  // 常に関連 Relation まで追従する。
  function _renameTableHtml(elements) {
    var esc = window.MA.htmlUtils.escHtml;
    var targets = elements.filter(function(e) {
      return e.kind === 'component' || e.kind === 'interface';
    });
    if (!targets.length) return '';
    var rows = targets.map(function(e) {
      return '<div class="co-rename-row" data-line="' + e.line + '"'
        + ' style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">'
        + '<span style="flex:0 0 34px;font-size:9px;color:var(--text-secondary);">'
          + (e.kind === 'interface' ? 'I/F' : 'Cmp') + '</span>'
        + '<input class="co-rename-id" type="text" value="' + esc(e.id) + '" placeholder="Alias"'
          + ' style="flex:1;min-width:0;font-size:11px;padding:3px;">'
        + '<input class="co-rename-label" type="text" value="' + esc(e.label) + '" placeholder="Label"'
          + ' style="flex:1;min-width:0;font-size:11px;padding:3px;">'
        + '</div>';
    }).join('');
    return '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">'
      + '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">'
        + '要素名をまとめて付け替え</label>'
      + '<div id="co-rename-list">' + rows + '</div>'
      + window.MA.properties.primaryButtonHtml('co-rename-apply', 'まとめて反映 (関連にも追従)')
      + '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">'
        + 'Tab で次の欄へ移れます。Alias の変更は関連 Relation にも自動で追従します</div>'
      + '</div>';
  }

  function _bindRenameTable(ctx) {
    window.MA.properties.bindEvent('co-rename-apply', 'click', function() {
      var rows = document.querySelectorAll('#co-rename-list .co-rename-row');
      var edits = [];
      for (var i = 0; i < rows.length; i++) {
        edits.push({
          line: Number(rows[i].getAttribute('data-line')),
          id: rows[i].querySelector('.co-rename-id').value,
          label: rows[i].querySelector('.co-rename-label').value,
        });
      }
      var t = ctx.getMmdText();
      var out = renameElements(t, edits);
      if (out === t) { alert('付け替える名前がありません'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(out);
      ctx.onUpdate();
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
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'co-tail-kind', [
          { value: 'component', label: 'Component', selected: true },
          { value: 'interface', label: 'Interface' },
          { value: 'port',      label: 'Port' },
          { value: 'package',   label: '境界 (package / folder / frame / node / rectangle)' },
          { value: 'relation',  label: 'Relation (関係)' },
          { value: 'bulk',      label: '一括 (複数行)' },
        ]) +
        '<div id="co-tail-detail" style="margin-top:6px;"></div>' +
      '</div>' +
      _renameTableHtml(elements) +
      // BLK-junior-20260912-2206-wish: 手本が 1 枚も無い部品は、本体を末尾に追加して
      // から依存チェックの起点を選び直す、という組み立てを毎回手でやることになる。
      // 部品名 1 語で「本体 + 依存」の下書きを別タブに起こす。
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
          '白紙から: 定石構成の下書き</label>' +
        P.fieldHtml('部品名', 'co-starter-subject', '', '例: TIMER / GPIO / CAN') +
        '<div id="co-starter-have" style="font-size:10px;color:var(--text-secondary);margin:-4px 0 2px;line-height:1.5;"></div>' +
        '<div id="co-starter-hint" style="font-size:10px;color:var(--text-secondary);margin:0 0 6px;line-height:1.5;"></div>' +
        P.primaryButtonHtml('co-starter-add', '＋ 定石構成から下書き') +
        '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
          '本体 1 つと、この部品のシーケンス図・状態遷移図に出てくる相手・定石の依存先を入れた' +
          '下書きを別タブで開きます。要らない依存はそのまま消して使えます</div>' +
      '</div>' +
      // BLK-junior-20260908-0203-wish: ドライバの図で「定石の依存先のうち今の図に
      // 無いもの」を出す。先輩の他部品の図を 1 枚ずつ開いて見比べる代わり。
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">依存チェック</label>' +
        '<div id="co-deps-summary" style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;line-height:1.5;"></div>' +
        '<div id="co-deps-body"></div>' +
      '</div>';
    propsEl.innerHTML = html;

    _renderDepsCheck(parsedData, ctx);
    _bindStarter();
    _bindRenameTable(ctx);


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
          P.fieldHtml('Stereotype', 'co-tail-stereo', '', '省略可 (例: service)') +
          P.primaryButtonHtml('co-tail-add', '+ Component 追加');
      } else if (kind === 'interface') {
        html =
          P.fieldHtml('Alias', 'co-tail-alias', '', '例: IAuth') +
          P.fieldHtml('Label', 'co-tail-label', '', '省略可') +
          P.fieldHtml('Stereotype', 'co-tail-stereo', '', '省略可 (例: api)') +
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
          P.selectFieldHtml('表記', 'co-tail-notation', window.MA.groupNotation
            .notationsFor('plantuml-component').map(function(n, i) {
              return { value: n.id, label: n.label + ' — ' + n.hint, selected: i === 0 };
            })) +
          P.primaryButtonHtml('co-tail-add', '+ 境界 追加');
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
      } else if (kind === 'bulk') {
        html =
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">要素と関係を 1 行 1 件で</label>' +
          window.MA.reuseModal.buttonHtml('co-tail-reuse') +
          '<textarea id="co-tail-bulk" style="width:100%;min-height:90px;font-family:inherit;font-size:12px;"></textarea>' +
          P.primaryButtonHtml('co-tail-add', '+ まとめて末尾に追加') +
          '<div id="co-tail-bulk-hint" style="font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">' +
            'CanDrv / interface ICan : CAN 送受信 / A -- B : label /<br>' +
            'A ..&gt; B(dependency) / A -() B(provides) / A )- B(requires)。空行は無視されます</div>';
      }
      detailEl.innerHTML = html;
      // 一括欄は「既に他の図にある行」を打ち直させないためのボタンを持つ。
      window.MA.reuseModal.bindButton('co-tail-reuse', 'plantuml-component', 'co-tail-bulk');

      P.bindEvent('co-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var out = t;
        if (kind === 'component') {
          var rawAl = document.getElementById('co-tail-alias').value;
          var normCo = normalizeIdInput(rawAl, parsedData);
          if (!normCo.valid) { alert('Alias 必須'); return; }
          var rawLbl = document.getElementById('co-tail-label').value.trim();
          window.MA.history.pushHistory();
          var stEl = document.getElementById('co-tail-stereo');
          out = addComponent(t, normCo.id, rawLbl || normCo.label, stEl ? stEl.value.trim() : '');
        } else if (kind === 'interface') {
          var rawAl2 = document.getElementById('co-tail-alias').value;
          var normIf = normalizeIdInput(rawAl2, parsedData);
          if (!normIf.valid) { alert('Alias 必須'); return; }
          var rawLbl2 = document.getElementById('co-tail-label').value.trim();
          window.MA.history.pushHistory();
          var stEl2 = document.getElementById('co-tail-stereo');
          out = addInterface(t, normIf.id, rawLbl2 || normIf.label, stEl2 ? stEl2.value.trim() : '');
        } else if (kind === 'port') {
          var rawAl3 = document.getElementById('co-tail-alias').value;
          var normPt = normalizeIdInput(rawAl3, parsedData);
          if (!normPt.valid) { alert('Alias 必須'); return; }
          var parentEl = document.getElementById('co-tail-parent');
          var parentId = parentEl ? parentEl.value : '';
          if (!parentId) { alert('Parent component 必須 (port は component の中に配置)'); return; }
          var rawLbl3 = document.getElementById('co-tail-label').value.trim();
          window.MA.history.pushHistory();
          out = addPortToComponent(t, parentId, normPt.id, rawLbl3 || normPt.label);
        } else if (kind === 'package') {
          var lbl = document.getElementById('co-tail-label').value.trim();
          if (!lbl) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          var notaEl = document.getElementById('co-tail-notation');
          out = addPackage(t, lbl, notaEl ? notaEl.value : 'package');
        } else if (kind === 'relation') {
          var fr = document.getElementById('co-tail-from').value;
          var to = document.getElementById('co-tail-to').value;
          if (!fr || !to) { alert('From/To 必須'); return; }
          var rkind = document.getElementById('co-tail-rkind').value;
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, fr, to, document.getElementById('co-tail-rlabel').value.trim());
        } else if (kind === 'bulk') {
          var block = document.getElementById('co-tail-bulk').value;
          var bulkOut = addBulk(t, block, parsedData);
          if (bulkOut === t) { alert('追加できる行がありません'); return; }
          window.MA.history.pushHistory();
          out = bulkOut;
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('co-tail-kind').addEventListener('change', renderTailDetail);
    // design 2b: 種別はチップ 1 クリックで決める。値の持ち主は上の select のまま。
    window.MA.tailKindChips.mount('co-tail-kind');
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
        // design 5d: ステレオタイプ (<<service>> など)。空にすれば外れる
        P.fieldHtml('Stereotype', 'co-edit-stereo', element.stereotype || '', '例: service (空で外す)') +
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
      var rawNewId = document.getElementById('co-edit-id').value.trim();
      var rawNewLabel = document.getElementById('co-edit-label').value.trim();
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var freshParsed = parse(t);
      var renameNorm = window.MA.idNormalizer.normalize(rawNewId, _existingComponentIdSet(freshParsed), 'C');
      var newId = renameNorm.valid ? renameNorm.id : rawNewId;
      var newLabel = (renameNorm.valid && renameNorm.id !== renameNorm.label)
        ? renameNorm.label
        : rawNewLabel;
      var stereoEl = document.getElementById('co-edit-stereo');
      var newStereo = stereoEl ? stereoEl.value.trim() : '';
      var fn = element.kind === 'component' ? updateComponent : updateInterface;
      if (newId !== element.id) t = fn(t, element.line, 'id', newId);
      if (newLabel !== element.label) t = fn(t, element.line, 'label', newLabel);
      if (newStereo !== (element.stereotype || '')) t = fn(t, element.line, 'stereotype', newStereo);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('co-rename-refs', 'click', function() {
      var rawNewId = document.getElementById('co-edit-id').value.trim();
      if (!rawNewId || rawNewId === element.id) { alert('Alias を変更してから実行してください'); return; }
      var freshParsed = parse(ctx.getMmdText());
      var refsNorm = window.MA.idNormalizer.normalize(rawNewId, _existingComponentIdSet(freshParsed), 'C');
      var newId = refsNorm.valid ? refsNorm.id : rawNewId;
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
    var RC = window.MA.relationKindCards;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Component Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        RC.headerHtml(relation.line, relation.from, relation.to) +
        RC.cardsHtml('co-rel-card', RC.kindsOf('component'), relation.kind) +
        RC.noteHtml() +
        P.fieldHtml('From', 'co-rel-from', relation.from) +
        '<button id="co-rel-swap" type="button" style="font-size:11px;padding:4px 10px;margin:4px 0;cursor:pointer;">⇄ 向きを入れ替え</button>' +
        P.fieldHtml('To', 'co-rel-to', relation.to) +
        P.fieldHtml('ラベル / Label（任意）', 'co-rel-label', relation.label) +
        P.relationOptionsFor('co-rel-more', ctx.getMmdText(), relation.line) +
        P.primaryButtonHtml('co-rel-apply', '変更を反映') +
        '<div style="margin-top:8px;">' +
          '<button id="co-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除 / Delete</button>' +
        '</div>' +
      '</div>';
    propsEl.innerHTML = html;

    // design 3c: 細かい指定は「その他の設定」に畳み、押した時点で DSL へ反映する。
    P.bindRelationOptionsFor('co-rel-more', relation.line, ctx);

    // FEAT-089: 種別は選んだ時点で確定する。From / To / Label は自由入力であり
    // 打鍵途中の反映が破壊的になり得るため、従来どおり「変更を反映」に残す。
    // 3b: 提供 / 要求 は向きが固定なので、選んだ時点で 部品 → インターフェース に並べ替える。
    RC.bindCards(propsEl, 'co-rel-card', function(newKind) {
      if (newKind === relation.kind) return;
      window.MA.history.pushHistory();
      var t = updateRelation(ctx.getMmdText(), relation.line, 'kind', newKind);
      var o = RC.orient(newKind, relation.from, relation.to, RC.kindOfFromParsed(parsedData));
      if (o.swapped) {
        t = updateRelation(t, relation.line, 'from', o.from);
        t = updateRelation(t, relation.line, 'to', o.to);
      }
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('co-rel-more', 'click', function() {
      var b = document.getElementById('co-rel-more');
      b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
    P.bindEvent('co-rel-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newKind = relation.kind;
      var newFrom = document.getElementById('co-rel-from').value.trim();
      var newTo = document.getElementById('co-rel-to').value.trim();
      var newLabel = document.getElementById('co-rel-label').value.trim();
      var o = RC.orient(newKind, newFrom, newTo, RC.kindOfFromParsed(parsedData));
      newFrom = o.from; newTo = o.to;
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
        '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Label: ' + window.MA.htmlUtils.escHtml(group.label || '') + '</div>' +
        // design 5d: 表記を後から差し替える (中身と閉じ括弧はそのまま)
        window.MA.properties.selectFieldHtml('表記', 'co-grp-notation',
          window.MA.groupNotation.notationsFor('plantuml-component').map(function(n) {
            return { value: n.id, label: n.label + ' — ' + n.hint, selected: n.id === (group.notation || 'package') };
          })) +
        window.MA.properties.primaryButtonHtml('co-grp-notation-apply', '表記を変更') +
        '<div style="font-size:10px;color:var(--text-secondary);margin-top:8px;">v0.4.0: ラベル変更 / 範囲指定 wrap は v0.5.0 で対応</div>' +
      '</div>';
    propsEl.innerHTML = html;
    window.MA.properties.bindEvent('co-grp-notation-apply', 'click', function() {
      var v = document.getElementById('co-grp-notation').value;
      if (v === (group.notation || 'package')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(changeGroupNotation(ctx.getMmdText(), group.startLine, v));
      ctx.onUpdate();
    });
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
    changeGroupNotation: changeGroupNotation,
    fmtRelation: fmtRelation,
    addComponent: addComponent,
    normalizeIdInput: normalizeIdInput,
    addInterface: addInterface,
    addPort: addPort,
    addPortToComponent: addPortToComponent,
    addPackage: addPackage,
    addRelation: addRelation,
    parseBulkLines: parseBulkLines,
    addBulk: addBulk,
    updateComponent: updateComponent,
    updateInterface: updateInterface,
    updateRelation: updateRelation,
    deleteLine: deleteLine,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    renameWithRefs: renameWithRefs,
    renameElements: renameElements,
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
        var bb = null;
        // BLK-junior-20260908-1703: 同じ部品から出る線は色も太さも同じで、
        // クリックして右パネルの From/To を読むまで相手が分からなかった。
        // 乗せた時点で相手が読めるよう、rect に相手を持たせる。
        var EH = window.MA.edgeHint;
        var relAttrs = {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        };
        if (EH) {
          var hintAttrs = EH.hintAttrs(relations[ri]);
          Object.keys(hintAttrs).forEach(function(k) { relAttrs[k] = hintAttrs[k]; });
        }
        // BLK-human-20260912-2130: 線・矢じり・ラベルをまとめて 1 つの当たり判定にする
        if (!OB.addLinkRects(overlayEl, lg, relAttrs, 8)) {
          bb = OB.extractEdgeBBox(lineEl, 8);
          if (!bb) continue;
          OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, relAttrs);
        }
      }

      // BLK-human-20260912-2130: 小さい当たり判定を手前に。共通実装 (src/core)
      OB.raiseSmallestLast(overlayEl);

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
