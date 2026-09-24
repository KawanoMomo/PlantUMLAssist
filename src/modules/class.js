'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlClass = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;
  var ID = RP.IDENTIFIER;
  var ID_WITH_GENERICS = '(?:' + ID + '(?:<[^<>]*>)?)';
  var _ID_GENERICS_RE = new RegExp('^(' + ID + ')<([^<>]+)>$');
  function _splitIdGenerics(idWithGen) {
    var m = idWithGen.match(_ID_GENERICS_RE);
    if (!m) return { id: idWithGen, generics: null };
    var ids = m[2].split(',').map(function(s) { return s.trim(); });
    return { id: m[1], generics: ids };
  }

  // class declaration: keyword + id (with optional quoted label)
  // groups: 1=quoted label (with as), 2=alias ID, 3=bare ID, 4=quoted label (trailing as)
  var CLASS_KW_RE = new RegExp(
    '^class\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );

  var ATTRIBUTE_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?(' + ID + ')\\s*(?::\\s*(.+))?\\s*$'
  );

  var METHOD_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?(' + ID + ')\\s*\\(([^)]*)\\)\\s*(?::\\s*(.+))?\\s*$'
  );

  // C 風の「型 名前」(`- uint8 pinState` / `+ void Init(uint8 pin)`)。既存の .puml に多い書き方。
  // 型にコロンと括弧は含めない (`名前 : 型` は上の正規表現が先に取る)。
  var TYPE_FIRST = '([A-Za-z_][^:()]*?[\\w>\\]*&])';
  var ATTRIBUTE_TYPE_FIRST_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?' + TYPE_FIRST + '\\s+(' + ID + ')\\s*$'
  );
  var METHOD_TYPE_FIRST_RE = new RegExp(
    '^([+\\-#~])?\\s*(?:\\{(static|abstract)\\}\\s*)?' + TYPE_FIRST + '\\s+(' + ID + ')\\s*\\(([^)]*)\\)\\s*$'
  );
  // 型先頭の行を \`名前 : 型\` と同じ組 [全体, 可視性, 修飾, 名前, (引数,) 型] に揃える。typeFirst で書き方を覚える。
  function _matchAttribute(trimmed) {
    var am = trimmed.match(ATTRIBUTE_RE);
    if (am) return am;
    var tf = trimmed.match(ATTRIBUTE_TYPE_FIRST_RE);
    if (!tf) return null;
    var r = [tf[0], tf[1], tf[2], tf[4], tf[3]]; r.typeFirst = true; return r;
  }
  function _matchMethod(trimmed) {
    var mm = trimmed.match(METHOD_RE);
    if (mm) return mm;
    var tf = trimmed.match(METHOD_TYPE_FIRST_RE);
    if (!tf) return null;
    var r = [tf[0], tf[1], tf[2], tf[4], tf[5], tf[3]]; r.typeFirst = true; return r;
  }

  var INTERFACE_KW_RE = new RegExp(
    '^interface\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );

  var ABSTRACT_KW_RE = new RegExp(
    '^abstract\\s+class\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );

  var ENUM_KW_RE = new RegExp(
    '^enum\\s+(?:"([^"]+)"\\s+as\\s+(' + ID + ')|(' + ID + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );
  var ENUM_VALUE_RE = /^([A-Z_][A-Z0-9_]*)\s*;?\s*$/;

  // BLK-migrator-20260918-0049: 実物の class 図にある struct / annotation も要素として読む
  // (読まないと図には描かれるのに選択枠が 1 つも出ない)。
  var STRUCT_ANNOT_KW_RE = new RegExp(
    '^(struct|annotation)\\s+(?:"([^"]+)"\\s+as\\s+(' + ID_WITH_GENERICS + ')|(' + ID_WITH_GENERICS + ')(?:\\s+as\\s+"([^"]+)")?)\\s*(?:<<([^>]+)>>)?\\s*\\{?\\s*$'
  );
  // クラス本体の区切り線。`..private..` のように文字を挟んだものは SVG に 1 行の text として描かれる。
  var SEPARATOR_RE = /^(--|\.\.|==|__)(.*?)(--|\.\.|==|__)?$/;

  var PACKAGE_OPEN_RE = new RegExp(
    '^package\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );

  var NAMESPACE_OPEN_RE = new RegExp(
    '^namespace\\s+(?:"([^"]+)"|(' + ID + '))\\s*\\{\\s*$'
  );

  var NOTE_INLINE_RE = new RegExp(
    '^note\\s+(left|right|top|bottom)\\s+of\\s+(' + ID + ')\\s*:\\s*(.*)$',
    'i'
  );

  var NOTE_BLOCK_OPEN_RE = new RegExp(
    '^note\\s+(left|right|top|bottom)\\s+of\\s+(' + ID + ')\\s*$',
    'i'
  );
  var END_NOTE_RE = /^end\s+note\s*$/i;

  // BLK-migrator-20260918-0049: `hide Actuator fields` で隠れたメンバーは SVG に描かれない。
  // 隠れた分を数えずに行を当てると、描かれているメンバーに 1 つ前のメンバーの行番号が付く。
  var HIDE_SHOW_RE = new RegExp(
    '^(hide|show)\\s+(?:(' + ID + ')\\s+)?(fields|attributes|methods|members)$',
    'i'
  );

  // Relation arrow tokens, longest first to avoid prefix matches
  var RELATION_RE = new RegExp(
    '^(' + ID_WITH_GENERICS + '|"[^"]+")\\s+' +
    // BLK-builder-20260907-1050-2: 「その他の設定」の向きが作る `-->` / `<--` も関連として読む。
    // design 4a「内部クラス」: PlantUML の入れ子表記 `+--` も関連として読む。
    '(<\\|--|--\\|>|<\\|\\.\\.|\\.\\.\\|>|\\*-->|<--\\*|\\*--|--\\*|o-->|<--o|o--|--o|' +
    '\\+-->|<--\\+|\\+--|--\\+|' +
    '\\.\\.>|<\\.\\.|-->|<--|--)\\s+' +
    '(' + ID_WITH_GENERICS + '|"[^"]+")(?:\\s*:\\s*(.+))?\\s*$'
  );

  function parse(text) {
    var result = { meta: { title: '', startUmlLine: null }, elements: [], relations: [], groups: [], notes: [], hideShow: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var openClassStack = [];
    var packageStack = [];
    var packageCounter = 0;
    var openNote = null;  // { startLine, position, targetId, bodyLines: [] }

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var rawLine = lines[i];
      var trimmed = rawLine.trim();

      // Inside multi-line note block: handle BEFORE empty/comment skip
      if (openNote) {
        if (END_NOTE_RE.test(trimmed)) {
          result.notes.push({
            kind: 'note',
            id: '__n_' + result.notes.length,
            position: openNote.position,
            targetId: openNote.targetId,
            text: openNote.bodyLines.join('\n'),
            line: openNote.startLine,
            endLine: lineNum,
          });
          openNote = null;
          continue;
        }
        openNote.bodyLines.push(rawLine.replace(/^  /, ''));
        continue;
      }

      if (!trimmed || DU.isPlantumlComment(trimmed)) continue;
      if (RP.isStartUml(trimmed)) {
        if (result.meta.startUmlLine === null) result.meta.startUmlLine = lineNum;
        continue;
      }
      if (RP.isEndUml(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      if (openClassStack.length === 0) {
        var hs = trimmed.match(HIDE_SHOW_RE);
        if (hs) {
          result.hideShow.push({
            hide: hs[1].toLowerCase() === 'hide',
            targetId: hs[2] || null,
            what: hs[3].toLowerCase(),
            line: lineNum,
          });
          continue;
        }
      }

      // closing brace for class block
      if (trimmed === '}' && openClassStack.length > 0) {
        var closing = openClassStack.pop();
        closing.element.endLine = lineNum;
        continue;
      }
      if (trimmed === '}' && packageStack.length > 0) {
        var pkgClosing = packageStack.pop();
        pkgClosing.endLine = lineNum;
        continue;
      }

      // member parsing: only inside an open class block
      if (openClassStack.length > 0) {
        var parent = openClassStack[openClassStack.length - 1].element;
        var sep = trimmed.match(SEPARATOR_RE);
        if (sep && (sep[2] === '' ? !sep[3] : sep[3] === sep[1])) {
          // 文字を挟んだ区切りは描画上 1 行を取るので、次のメンバーの前に 1 行あると控える。
          if (sep[2].trim()) {
            if (!parent.labelledSeparators) parent.labelledSeparators = [];
            parent.labelledSeparators.push(parent.members.length);
          }
          continue;
        }
        if (parent.kind === 'enum') {
          var ev = trimmed.match(ENUM_VALUE_RE);
          if (ev) {
            parent.members.push({
              kind: 'enum-value',
              visibility: null, static: false, abstract: false,
              name: ev[1], type: '', params: null, line: lineNum,
            });
            continue;
          }
        }
        var mm = _matchMethod(trimmed);
        if (mm) {
          parent.members.push({
            kind: 'method',
            visibility: mm[1] || null,
            static: mm[2] === 'static',
            abstract: mm[2] === 'abstract',
            name: mm[3],
            type: mm[5] ? mm[5].trim() : '',
            params: mm[4] || '',
            line: lineNum,
          });
          continue;
        }
        var am = _matchAttribute(trimmed);
        if (am && trimmed.indexOf('(') < 0) {  // method は別 regex (params にカッコ)
          parent.members.push({
            kind: 'attribute',
            visibility: am[1] || null,
            static: am[2] === 'static',
            abstract: false,
            name: am[3],
            type: am[4] ? am[4].trim() : '',
            params: null,
            line: lineNum,
          });
          continue;
        }
      }

      if (openClassStack.length === 0) {
        var noteMatch = trimmed.match(NOTE_INLINE_RE);
        if (noteMatch) {
          result.notes.push({
            kind: 'note',
            id: '__n_' + result.notes.length,
            position: noteMatch[1].toLowerCase(),
            targetId: noteMatch[2],
            text: noteMatch[3],
            line: lineNum,
            endLine: lineNum,
          });
          continue;
        }
        var blockMatch = trimmed.match(NOTE_BLOCK_OPEN_RE);
        if (blockMatch) {
          openNote = {
            startLine: lineNum,
            position: blockMatch[1].toLowerCase(),
            targetId: blockMatch[2],
            bodyLines: [],
          };
          continue;
        }
        var rm = window.MA.relationOptions.plainLine(trimmed).match(RELATION_RE);
        if (rm) {
          var arrow = rm[2];
          var fromTok = rm[1].replace(/^"|"$/g, '');
          var toTok = rm[3].replace(/^"|"$/g, '');
          var lbl = rm[4] ? rm[4].trim() : null;
          var rkind, rfrom, rto;
          if (arrow === '<|--') { rkind = 'inheritance'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--|>') { rkind = 'inheritance'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '<|..') { rkind = 'implementation'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '..|>') { rkind = 'implementation'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '*--' || arrow === '*-->') { rkind = 'composition'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--*' || arrow === '<--*') { rkind = 'composition'; rfrom = toTok; rto = fromTok; }
          else if (arrow === 'o--' || arrow === 'o-->') { rkind = 'aggregation'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--o' || arrow === '<--o') { rkind = 'aggregation'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '+--' || arrow === '+-->') { rkind = 'nested'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '--+' || arrow === '<--+') { rkind = 'nested'; rfrom = toTok; rto = fromTok; }
          else if (arrow === '..>') { rkind = 'dependency'; rfrom = fromTok; rto = toTok; }
          else if (arrow === '<..') { rkind = 'dependency'; rfrom = toTok; rto = fromTok; }
          // 「その他の設定」で向きを反転した関連は、矢の先が指す側を to として読む。
          else if (arrow === '<--') { rkind = 'association'; rfrom = toTok; rto = fromTok; }
          else { rkind = 'association'; rfrom = fromTok; rto = toTok; }

          result.relations.push({
            id: '__r_' + result.relations.length,
            kind: rkind, from: rfrom, to: rto, label: lbl, line: lineNum,
          });
          continue;
        }
      }

      var pm = trimmed.match(PACKAGE_OPEN_RE);
      if (pm) {
        var pkgLabel = pm[1] !== undefined ? pm[1] : pm[2];
        var pkgId = '__pkg_' + (packageCounter++);
        var pkgParent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var pkg = { kind: 'package', id: pkgId, label: pkgLabel, startLine: lineNum, endLine: 0, parentId: pkgParent };
        result.groups.push(pkg);
        packageStack.push(pkg);
        continue;
      }

      var nm = trimmed.match(NAMESPACE_OPEN_RE);
      if (nm) {
        var nsLabel = nm[1] !== undefined ? nm[1] : nm[2];
        var nsId = '__pkg_' + (packageCounter++);
        var nsParent = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var ns = { kind: 'namespace', id: nsId, label: nsLabel, startLine: lineNum, endLine: 0, parentId: nsParent };
        result.groups.push(ns);
        packageStack.push(ns);
        continue;
      }

      var em = trimmed.match(ENUM_KW_RE);
      if (em) {
        var eid, elabel;
        if (em[2] !== undefined) { eid = em[2]; elabel = em[1]; }
        else { eid = em[3]; elabel = em[4] !== undefined ? em[4] : em[3]; }
        var eHasBlock = /\{\s*$/.test(trimmed);
        var eCurrentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var eEl = {
          kind: 'enum', id: eid, label: elabel,
          stereotype: em[5] || null, generics: null, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: eCurrentPackageId,
        };
        eEl = _pushElement(result, eEl);
        if (eHasBlock) openClassStack.push({ element: eEl });
        continue;
      }

      var abm = trimmed.match(ABSTRACT_KW_RE);
      if (abm) {
        var aRawId, alabel;
        if (abm[2] !== undefined) { aRawId = abm[2]; alabel = abm[1]; }
        else { aRawId = abm[3]; alabel = abm[4] !== undefined ? abm[4] : abm[3]; }
        var aSplit = _splitIdGenerics(aRawId);
        var aHasBlock = /\{\s*$/.test(trimmed);
        var aCurrentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var aEl = {
          kind: 'abstract', id: aSplit.id,
          label: aSplit.generics ? aSplit.id : alabel,
          stereotype: abm[5] || null, generics: aSplit.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: aCurrentPackageId,
        };
        aEl = _pushElement(result, aEl);
        if (aHasBlock) openClassStack.push({ element: aEl });
        continue;
      }

      var im = trimmed.match(INTERFACE_KW_RE);
      if (im) {
        var iRawId, ilabel;
        if (im[2] !== undefined) { iRawId = im[2]; ilabel = im[1]; }
        else { iRawId = im[3]; ilabel = im[4] !== undefined ? im[4] : im[3]; }
        var iSplit = _splitIdGenerics(iRawId);
        var iHasBlock = /\{\s*$/.test(trimmed);
        var iCurrentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var iEl = {
          kind: 'interface', id: iSplit.id,
          label: iSplit.generics ? iSplit.id : ilabel,
          stereotype: im[5] || null, generics: iSplit.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: iCurrentPackageId,
        };
        iEl = _pushElement(result, iEl);
        if (iHasBlock) openClassStack.push({ element: iEl });
        continue;
      }

      var sam = trimmed.match(STRUCT_ANNOT_KW_RE);
      if (sam) {
        var sRawId = sam[3] !== undefined ? sam[3] : sam[4];
        var sLabel = sam[3] !== undefined ? sam[2] : (sam[5] !== undefined ? sam[5] : sam[4]);
        var sSplit = _splitIdGenerics(sRawId);
        var sEl = {
          kind: sam[1], id: sSplit.id,
          label: sSplit.generics ? sSplit.id : sLabel,
          stereotype: sam[6] || null, generics: sSplit.generics, members: [],
          line: lineNum, endLine: lineNum,
          parentPackageId: packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null,
        };
        sEl = _pushElement(result, sEl);
        if (/\{\s*$/.test(trimmed)) openClassStack.push({ element: sEl });
        continue;
      }

      var m = trimmed.match(CLASS_KW_RE);
      if (m) {
        var rawId, label;
        if (m[2] !== undefined) { rawId = m[2]; label = m[1]; }
        else { rawId = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
        var split = _splitIdGenerics(rawId);
        var hasBlock = /\{\s*$/.test(trimmed);
        var currentPackageId = packageStack.length > 0 ? packageStack[packageStack.length - 1].id : null;
        var el = {
          kind: 'class', id: split.id,
          label: split.generics ? split.id : label,
          stereotype: m[5] || null, generics: split.generics, members: [],
          line: lineNum, endLine: lineNum, parentPackageId: currentPackageId,
        };
        el = _pushElement(result, el);
        if (hasBlock) openClassStack.push({ element: el });
        continue;
      }
    }
    _applyHideShow(result);
    return result;
  }

  // BLK-migrator-20260918-0049: `together { class TaskA }` のように同じクラスを 2 回宣言しても
  // 図には 1 つしか描かれない。2 件の要素にすると同じ図形へ枠が二重に出て、
  // 押したとき本体 (メンバーを持つ方) ではなく先の空宣言が開く。同じ id は 1 件にまとめ、
  // 本体を持つ宣言の行を正とする。
  function _pushElement(result, el) {
    for (var i = 0; i < result.elements.length; i++) {
      var ex = result.elements[i];
      if (ex.id !== el.id) continue;
      // 後から来た宣言の方が情報を持つなら、そちらを正とする。
      if (el.stereotype) ex.stereotype = el.stereotype;
      if (el.generics && el.generics.length > 0) ex.generics = el.generics;
      if (el.label && el.label !== el.id) ex.label = el.label;
      if (el.parentPackageId) ex.parentPackageId = el.parentPackageId;
      if (ex.kind === 'class' && el.kind !== 'class') ex.kind = el.kind;
      ex.line = el.line;
      ex.endLine = el.endLine;
      return ex;
    }
    result.elements.push(el);
    return el;
  }

  // BLK-migrator-20260918-0049: `hide`/`show` を後から順に当てる。target 無しは全要素。
  // `fields`/`attributes` は属性、`methods` はメソッド、`members` は両方。
  function _applyHideShow(result) {
    var dirs = result.hideShow || [];
    if (dirs.length === 0) return;
    dirs.forEach(function(d) {
      result.elements.forEach(function(el) {
        if (d.targetId && el.id !== d.targetId) return;
        (el.members || []).forEach(function(m) {
          var isAttr = m.kind === 'attribute' || m.kind === 'enum-value';
          var hit = d.what === 'members' ||
            ((d.what === 'fields' || d.what === 'attributes') && isAttr) ||
            (d.what === 'methods' && m.kind === 'method');
          if (hit) m.hidden = d.hide;
        });
      });
    });
  }

  function _fmtIdGenerics(id, generics) {
    return generics && generics.length > 0 ? id + '<' + generics.join(', ') + '>' : id;
  }

  function fmtClass(id, label, stereotype, generics) {
    var idPart = _fmtIdGenerics(id, generics);
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + idPart : idPart;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'class ' + labelPart + stereoPart;
  }

  function fmtInterface(id, label, stereotype, generics) {
    var idPart = _fmtIdGenerics(id, generics);
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + idPart : idPart;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'interface ' + labelPart + stereoPart;
  }

  function fmtAbstract(id, label, stereotype, generics) {
    var idPart = _fmtIdGenerics(id, generics);
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + idPart : idPart;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'abstract class ' + labelPart + stereoPart;
  }

  function fmtEnum(id, label, stereotype) {
    var labelPart = (label && label !== id) ? '"' + label + '" as ' + id : id;
    var stereoPart = stereotype ? ' <<' + stereotype + '>>' : '';
    return 'enum ' + labelPart + stereoPart;
  }

  function fmtRelation(kind, from, to, label) {
    var lbl = label ? ' : ' + label : '';
    if (kind === 'inheritance')   return from + ' <|-- ' + to + lbl;
    if (kind === 'implementation') return from + ' <|.. ' + to + lbl;
    if (kind === 'composition')   return from + ' *-- ' + to + lbl;
    if (kind === 'aggregation')   return from + ' o-- ' + to + lbl;
    if (kind === 'nested')        return from + ' +-- ' + to + lbl;
    if (kind === 'dependency')    return from + ' ..> ' + to + lbl;
    return from + ' -- ' + to + lbl;
  }

  function fmtAttribute(visibility, name, type, isStatic) {
    var v = visibility || '';
    var stat = isStatic ? '{static} ' : '';
    var typ = type ? ' : ' + type : '';
    return (v ? v + ' ' : '') + stat + name + typ;
  }

  function fmtMethod(visibility, name, params, returnType, isStatic, isAbstract) {
    var v = visibility || '';
    var mod = isStatic ? '{static} ' : (isAbstract ? '{abstract} ' : '');
    var ret = returnType ? ' : ' + returnType : '';
    return (v ? v + ' ' : '') + mod + name + '(' + (params || '') + ')' + ret;
  }

  function fmtEnumValue(name) { return name; }
  function fmtPackage(label) { return 'package "' + label + '" {'; }
  function fmtNamespace(label) { return 'namespace ' + label + ' {'; }

  function fmtNote(position, targetId, text) {
    var pos = (position || 'left').toLowerCase();
    if (typeof text !== 'string') text = '';
    if (text.indexOf('\n') < 0) {
      return 'note ' + pos + ' of ' + targetId + ' : ' + text;
    }
    var bodyLines = text.split('\n');
    var out = ['note ' + pos + ' of ' + targetId];
    bodyLines.forEach(function(l) { out.push(l); });
    out.push('end note');
    return out;
  }

  var insertBeforeEnd = window.MA.dslUpdater.insertBeforeEnd;

  function _existingClassIdSet(parsed) {
    var set = {};
    var elts = (parsed && parsed.elements) || [];
    elts.forEach(function(e) { if (e.id) set[e.id] = true; });
    return set;
  }

  function normalizeIdInput(rawInput, parsed) {
    return window.MA.idNormalizer.normalize(rawInput, _existingClassIdSet(parsed), 'C');
  }

  function addClass(text, id, label, stereotype, generics) {
    return insertBeforeEnd(text, fmtClass(id, label || id, stereotype, generics));
  }
  function addInterface(text, id, label, stereotype, generics) {
    return insertBeforeEnd(text, fmtInterface(id, label || id, stereotype, generics));
  }
  function addAbstract(text, id, label, stereotype, generics) {
    return insertBeforeEnd(text, fmtAbstract(id, label || id, stereotype, generics));
  }
  function addEnum(text, id, label, values) {
    var lines = [fmtEnum(id, label || id) + ' {'];
    (values || []).forEach(function(v) { lines.push('  ' + v); });
    lines.push('}');
    var out = text;
    lines.forEach(function(l) { out = insertBeforeEnd(out, l); });
    return out;
  }
  function addRelation(text, kind, from, to, label) {
    return insertBeforeEnd(text, fmtRelation(kind, from, to, label));
  }
  function addPackage(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtPackage(label)), '}');
  }
  function addNamespace(text, label) {
    return insertBeforeEnd(insertBeforeEnd(text, fmtNamespace(label)), '}');
  }
  function addNote(text, targetId, position, noteText) {
    var pos = position || 'left';
    var formatted = fmtNote(pos, targetId, noteText || '');
    if (Array.isArray(formatted)) {
      var out = text;
      formatted.forEach(function(l) { out = insertBeforeEnd(out, l); });
      return out;
    }
    return insertBeforeEnd(text, formatted);
  }

  function _parseSingleLine(line) {
    var trimmed = line.trim();
    var indent = line.match(/^(\s*)/)[1];
    var match;
    if ((match = trimmed.match(ABSTRACT_KW_RE)))
      return { kind: 'abstract', indent: indent, match: match };
    if ((match = trimmed.match(INTERFACE_KW_RE)))
      return { kind: 'interface', indent: indent, match: match };
    if ((match = trimmed.match(ENUM_KW_RE)))
      return { kind: 'enum', indent: indent, match: match };
    if ((match = trimmed.match(CLASS_KW_RE)))
      return { kind: 'class', indent: indent, match: match };
    return null;
  }

  function updateClass(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var info = _parseSingleLine(lines[idx]);
    if (!info) return text;
    var m = info.match;
    var rawId, label, stereotype;
    if (m[2] !== undefined) { rawId = m[2]; label = m[1]; }
    else { rawId = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
    var split = _splitIdGenerics(rawId);
    var id = split.id, generics = split.generics;
    stereotype = m[5] || null;
    var wasBareLabel = (label === split.id);

    if (field === 'id') { id = value; if (wasBareLabel) label = value; }
    else if (field === 'label') label = value;
    else if (field === 'stereotype') stereotype = value || null;
    else if (field === 'generics') generics = value && value.length > 0 ? value : null;

    var hasBlock = /\{\s*$/.test(lines[idx]);
    var openBrace = hasBlock ? ' {' : '';
    var fmtFn;
    if (info.kind === 'interface') fmtFn = fmtInterface;
    else if (info.kind === 'abstract') fmtFn = fmtAbstract;
    else if (info.kind === 'enum') fmtFn = function(i, l, s) { return fmtEnum(i, l, s); };
    else fmtFn = fmtClass;
    lines[idx] = info.indent + fmtFn(id, label, stereotype, generics) + openBrace;
    return lines.join('\n');
  }

  function _findClassEndLine(lines, classLineIdx) {
    if (!/\{\s*$/.test(lines[classLineIdx])) return -1;
    for (var i = classLineIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '}') return i;
    }
    return -1;
  }

  // design 4a「Class — メンバー編集」: 属性・メソッドはフォームから足せなければならない。
  // 本体 { } を持たない `class Foo` に足そうとすると挿入位置が無く、これまでは
  // 何も起きずに握り潰していた (クラス定義全体を打ち直すしかなかった)。
  // 足す直前に本体を開いて、どの宣言でも同じ手順で足せるようにする。
  function ensureBlock(text, classLineNum) {
    var lines = text.split('\n');
    var idx = classLineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    if (!_parseSingleLine(lines[idx])) return text;
    if (/\{\s*$/.test(lines[idx])) return text;   // 既に本体がある
    var indent = lines[idx].match(/^(\s*)/)[1];
    lines[idx] = lines[idx].replace(/\s*$/, '') + ' {';
    lines.splice(idx + 1, 0, indent + '}');
    return lines.join('\n');
  }

  // design 4a「種別 / Kind」: class / abstract class / interface / enum の切り替え。
  // 宣言のキーワードだけを差し替え、id・表示名・ステレオタイプ・ジェネリクス・本体は
  // そのまま残す。従来は宣言行を手で打ち直すしかなかった。
  function changeKind(text, lineNum, newKind) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var info = _parseSingleLine(lines[idx]);
    if (!info || info.kind === newKind) return text;
    var m = info.match;
    var rawId, label;
    if (m[2] !== undefined) { rawId = m[2]; label = m[1]; }
    else { rawId = m[3]; label = m[4] !== undefined ? m[4] : m[3]; }
    var split = _splitIdGenerics(rawId);
    var stereotype = m[5] || null;
    // `class Box<T>` のような素の宣言では label に生の `Box<T>` が入る。
    // そのまま渡すと `"Box<T>" as Box` と引用名に化けるので、id に揃える。
    if (label === rawId) label = split.id;
    // enum はジェネリクスを持たない (PlantUML が解釈しない)。落として残りを保つ。
    var generics = (newKind === 'enum') ? null : split.generics;
    var openBrace = /\{\s*$/.test(lines[idx]) ? ' {' : '';
    var fmtFn;
    if (newKind === 'interface') fmtFn = fmtInterface;
    else if (newKind === 'abstract') fmtFn = fmtAbstract;
    else if (newKind === 'enum') fmtFn = function(i, l, s) { return fmtEnum(i, l, s); };
    else if (newKind === 'class') fmtFn = fmtClass;
    else return text;
    lines[idx] = info.indent + fmtFn(split.id, label, stereotype, generics) + openBrace;
    return lines.join('\n');
  }

  function addAttribute(text, classLineNum, visibility, name, type, isStatic) {
    text = ensureBlock(text, classLineNum);
    var lines = text.split('\n');
    var classIdx = classLineNum - 1;
    var closeIdx = _findClassEndLine(lines, classIdx);
    if (closeIdx < 0) return text;
    var indent = lines[classIdx].match(/^(\s*)/)[1] + '  ';
    lines.splice(closeIdx, 0, indent + fmtAttribute(visibility, name, type, isStatic));
    return lines.join('\n');
  }

  function addMethod(text, classLineNum, visibility, name, params, returnType, isStatic, isAbstract) {
    text = ensureBlock(text, classLineNum);
    var lines = text.split('\n');
    var classIdx = classLineNum - 1;
    var closeIdx = _findClassEndLine(lines, classIdx);
    if (closeIdx < 0) return text;
    var indent = lines[classIdx].match(/^(\s*)/)[1] + '  ';
    lines.splice(closeIdx, 0, indent + fmtMethod(visibility, name, params, returnType, isStatic, isAbstract));
    return lines.join('\n');
  }

  // design 4a「その他（constructor / static / abstract / ジェネリクス / 内部クラス）」:
  // constructor はクラス名と同じ名前で戻り型を持たないメソッド。名前を手で打たせない。
  // 宣言行から id を読むので、クラス名を後から変えても打ち直しの元にならない。
  function classNameAt(text, classLineNum) {
    var lines = text.split('\n');
    var idx = classLineNum - 1;
    if (idx < 0 || idx >= lines.length) return null;
    var info = _parseSingleLine(lines[idx]);
    if (!info) return null;
    var m = info.match;
    var rawId = m[2] !== undefined ? m[2] : m[3];
    return _splitIdGenerics(rawId).id;
  }

  function addConstructor(text, classLineNum, visibility, params) {
    var name = classNameAt(text, classLineNum);
    if (!name) return text;
    return addMethod(text, classLineNum, visibility, name, params, '', false, false);
  }

  // 内部クラス: 本体つきの `class Inner` を足し、`Outer +-- Inner` で入れ子であることを示す。
  // PlantUML はクラス本体の中に class を書けないので、この 2 行が入れ子の表し方になる。
  function addNestedClass(text, outerId, innerName) {
    if (!outerId || !innerName) return text;
    var out = insertBeforeEnd(text, fmtClass(innerName, innerName, null, null) + ' {');
    out = insertBeforeEnd(out, '}');
    return insertBeforeEnd(out, outerId + ' +-- ' + innerName);
  }

  function addEnumValue(text, enumLineNum, name) {
    text = ensureBlock(text, enumLineNum);
    var lines = text.split('\n');
    var enumIdx = enumLineNum - 1;
    var closeIdx = _findClassEndLine(lines, enumIdx);
    if (closeIdx < 0) return text;
    var indent = lines[enumIdx].match(/^(\s*)/)[1] + '  ';
    lines.splice(closeIdx, 0, indent + name);
    return lines.join('\n');
  }

  function updateAttribute(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var am = _matchAttribute(trimmed);
    if (!am) return text;
    var visibility = am[1] || null;
    var isStatic = am[2] === 'static';
    var name = am[3];
    var type = am[4] ? am[4].trim() : '';
    if (field === 'visibility') visibility = value;
    else if (field === 'name') name = value;
    else if (field === 'type') type = value;
    else if (field === 'static') isStatic = !!value;
    lines[idx] = indent + (am.typeFirst && type
      ? (visibility ? visibility + ' ' : '') + (isStatic ? '{static} ' : '') + type + ' ' + name
      : fmtAttribute(visibility, name, type, isStatic));
    return lines.join('\n');
  }

  function updateMethod(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var mm = _matchMethod(trimmed);
    if (!mm) return text;
    var visibility = mm[1] || null;
    var isStatic = mm[2] === 'static';
    var isAbstract = mm[2] === 'abstract';
    var name = mm[3];
    var params = mm[4] || '';
    var returnType = mm[5] ? mm[5].trim() : '';
    if (field === 'visibility') visibility = value;
    else if (field === 'name') name = value;
    else if (field === 'params') params = value;
    else if (field === 'type') returnType = value;
    else if (field === 'static') { isStatic = !!value; if (isStatic) isAbstract = false; }
    else if (field === 'abstract') { isAbstract = !!value; if (isAbstract) isStatic = false; }
    lines[idx] = indent + (mm.typeFirst && returnType
      ? (visibility ? visibility + ' ' : '') + (isStatic ? '{static} ' : (isAbstract ? '{abstract} ' : '')) +
        returnType + ' ' + name + '(' + (params || '') + ')'
      : fmtMethod(visibility, name, params, returnType, isStatic, isAbstract));
    return lines.join('\n');
  }

  function deleteMember(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    lines.splice(idx, 1);
    return lines.join('\n');
  }

  function _swapLines(text, lineA, lineB) {
    var lines = text.split('\n');
    var ia = lineA - 1, ib = lineB - 1;
    if (ia < 0 || ib < 0 || ia >= lines.length || ib >= lines.length) return text;
    var tmp = lines[ia]; lines[ia] = lines[ib]; lines[ib] = tmp;
    return lines.join('\n');
  }

  function _findElementById(parsed, classId) {
    for (var i = 0; i < parsed.elements.length; i++) {
      if (parsed.elements[i].id === classId) return parsed.elements[i];
    }
    return null;
  }

  function moveMemberUpByIndex(text, classId, memberIndex) {
    var elt = _findElementById(parse(text), classId);
    if (!elt || !elt.members) return text;
    if (memberIndex <= 0 || memberIndex >= elt.members.length) return text;
    return _swapLines(text, elt.members[memberIndex - 1].line, elt.members[memberIndex].line);
  }

  function moveMemberDownByIndex(text, classId, memberIndex) {
    var elt = _findElementById(parse(text), classId);
    if (!elt || !elt.members) return text;
    if (memberIndex < 0 || memberIndex >= elt.members.length - 1) return text;
    return _swapLines(text, elt.members[memberIndex].line, elt.members[memberIndex + 1].line);
  }

  function deleteMemberByIndex(text, classId, memberIndex) {
    var elt = _findElementById(parse(text), classId);
    if (!elt || !elt.members) return text;
    if (memberIndex < 0 || memberIndex >= elt.members.length) return text;
    return deleteMember(text, elt.members[memberIndex].line);
  }

  var moveLineUp = window.MA.dslUpdater.moveLineUp;
  var moveLineDown = window.MA.dslUpdater.moveLineDown;
  var renameWithRefs = window.MA.dslUpdater.renameWithRefs;

  function deleteLine(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    lines.splice(idx, 1);
    return lines.join('\n');
  }

  function deleteClassWithNotes(text, classId) {
    var parsed = parse(text);
    // Find target element
    var elt = null;
    for (var i = 0; i < parsed.elements.length; i++) {
      if (parsed.elements[i].id === classId) { elt = parsed.elements[i]; break; }
    }
    if (!elt) return text;

    // Collect line ranges to delete: element + its notes (descending order to avoid index shift)
    var ranges = [];
    var elStart = elt.line;
    var elEnd = elt.endLine && elt.endLine > elt.line ? elt.endLine : elt.line;
    ranges.push({ start: elStart, end: elEnd });
    parsed.notes.forEach(function(n) {
      if (n.targetId === classId) {
        ranges.push({ start: n.line, end: n.endLine });
      }
    });
    ranges.sort(function(a, b) { return b.start - a.start; });

    var lines = text.split('\n');
    ranges.forEach(function(r) {
      var startIdx = r.start - 1;
      var endIdx = r.end - 1;
      lines.splice(startIdx, endIdx - startIdx + 1);
    });
    return lines.join('\n');
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

  function updateRelation(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var trimmed = lines[idx].trim();
    var deco = window.MA.relationOptions.decorationsOf(lines[idx]);
    var rm = window.MA.relationOptions.plainLine(trimmed).match(RELATION_RE);
    if (!rm) return text;
    var arrow = rm[2];
    var from = rm[1].replace(/^"|"$/g, '');
    var to = rm[3].replace(/^"|"$/g, '');
    var label = rm[4] || null;
    var kind;
    if (arrow === '<|--' || arrow === '--|>') kind = 'inheritance';
    else if (arrow === '<|..' || arrow === '..|>') kind = 'implementation';
    else if (arrow === '*--' || arrow === '--*' || arrow === '*-->' || arrow === '<--*') kind = 'composition';
    else if (arrow === 'o--' || arrow === '--o' || arrow === 'o-->' || arrow === '<--o') kind = 'aggregation';
    else if (arrow === '+--' || arrow === '--+' || arrow === '+-->' || arrow === '<--+') kind = 'nested';
    else if (arrow === '..>' || arrow === '<..') kind = 'dependency';
    else kind = 'association';
    if (arrow === '--|>' || arrow === '..|>' || arrow === '--*' || arrow === '--o' || arrow === '--+' ||
        arrow === '<..' || arrow === '<--' || arrow === '<--*' || arrow === '<--o' || arrow === '<--+') {
      var tmp = from; from = to; to = tmp;
    }

    if (field === 'kind') kind = value;
    else if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'label') label = value;
    else if (field === 'swap') { var s = from; from = to; to = s; }

    // 多重度・線の色は種別やラベルの書き換えでは失われない (design 3c)。
    lines[idx] = window.MA.relationOptions.applyDecorations(
      indent + fmtRelation(kind, from, to, label), deco);
    return lines.join('\n');
  }

  function updateNote(text, startLine, endLine, fields) {
    var lines = text.split('\n');
    var startIdx = startLine - 1;
    var endIdx = endLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;

    // Parse current note state from start line
    var startTrimmed = lines[startIdx].trim();
    var inlineMatch = startTrimmed.match(NOTE_INLINE_RE);
    var blockMatch = startTrimmed.match(NOTE_BLOCK_OPEN_RE);
    var current = null;
    if (inlineMatch) {
      current = { position: inlineMatch[1].toLowerCase(), targetId: inlineMatch[2], text: inlineMatch[3] };
    } else if (blockMatch) {
      var bodyLines = [];
      for (var k = startIdx + 1; k <= endIdx - 1; k++) {
        bodyLines.push(lines[k].replace(/^  /, ''));
      }
      current = { position: blockMatch[1].toLowerCase(), targetId: blockMatch[2], text: bodyLines.join('\n') };
    }
    if (!current) return text;

    var newPos = fields.position != null ? fields.position : current.position;
    var newText = fields.text != null ? fields.text : current.text;

    var newTarget = fields.targetId ? fields.targetId : current.targetId;
    var formatted = fmtNote(newPos, newTarget, newText);
    var newLines;
    if (Array.isArray(formatted)) {
      newLines = formatted;
    } else {
      newLines = [formatted];
    }

    // Replace [startIdx..endIdx] with newLines
    var before = lines.slice(0, startIdx);
    var after = lines.slice(endIdx + 1);
    return before.concat(newLines).concat(after).join('\n');
  }

  function deleteNote(text, startLine, endLine) {
    var lines = text.split('\n');
    var startIdx = startLine - 1;
    var endIdx = endLine - 1;
    if (startIdx < 0 || startIdx >= lines.length) return text;
    var before = lines.slice(0, startIdx);
    var after = lines.slice(endIdx + 1);
    return before.concat(after).join('\n');
  }

  function template() {
    return [
      '@startuml',
      'title Sample Class',
      'class User {',
      '  - id : int',
      '  + name : String',
      '  + login() : void',
      '}',
      'interface IAuth {',
      '  + verify() : bool',
      '}',
      'User ..|> IAuth',
      '@enduml',
    ].join('\n');
  }

  function renderProps(selData, parsedData, propsEl, ctx) {
    if (!propsEl) return;
    // Custom dispatch for 'note' selection
    if (selData && selData.length === 1 && selData[0].type === 'note') {
      var notesArr = parsedData.notes || [];
      var note = null;
      for (var i = 0; i < notesArr.length; i++) {
        if (notesArr[i].id === selData[0].id) { note = notesArr[i]; break; }
      }
      if (note) {
        _renderNoteEdit(note, parsedData, propsEl, ctx);
        return;
      }
    }
    // Custom dispatch for 'member' selection — render parent class with focused member
    if (selData && selData.length === 1 && selData[0].type === 'member') {
      var sel = selData[0];
      var parent = null;
      var elsArr = parsedData.elements || [];
      for (var j = 0; j < elsArr.length; j++) {
        if (elsArr[j].id === sel.parentId) { parent = elsArr[j]; break; }
      }
      if (parent) {
        _renderElementEdit(parent, parsedData, propsEl, ctx, { focusMemberIndex: sel.memberIndex });
        return;
      }
    }
    window.MA.propsRenderer.renderByDispatch(selData, parsedData, propsEl, {
      onNoSelection: function(p, e) { _renderNoSelection(p, e, ctx); },
      onElement: function(elt, p, e) { _renderElementEdit(elt, p, e, ctx); },
      onRelation: function(rel, p, e) { _renderRelationEdit(rel, p, e, ctx); },
      onGroup: function(grp, p, e) { _renderGroupReadOnly(grp, p, e, ctx); },
      onMultiSelectConnect: function(s, p, e) { _renderMultiSelectConnect(s, p, e, ctx); },
      onMultiSelect: function(s, p, e) { _renderMultiSelect(s, p, e); },
    });
  }

  // BLK-junior-20260909-0703-wish: 手本のクラス図で親を選んだまま、派生を 1 つ起こす。
  // 親の宣言とメンバは原文のまま引き継ぎ (打ち直さない)、親が既に引いている関連は
  // 「同じ関連を引く」のチェックで派生にも引ける。埋めるのは名前と固有メンバだけ。
  function _showDeriveModal(element, parsedData, ctx) {
    var modal = document.getElementById('cl-sc-modal');
    var content = document.getElementById('cl-sc-modal-content');
    if (!modal || !content) return;
    var CD = window.MA.classDerive;
    var esc = window.MA.htmlUtils.escHtml;
    var P = window.MA.properties;
    var text0 = ctx.getMmdText();

    var inherited = CD.memberSource(text0, element);
    var cands = CD.relationCandidates(text0, parsedData, element.id);
    var INPUT = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;';
    var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 4px 0;';

    var relHtml = cands.length
      ? cands.map(function(c, i) {
          return '<label class="cl-dv-rel" style="display:block;font-size:11px;color:var(--text-primary);margin-bottom:3px;cursor:pointer;">' +
            '<input type="checkbox" id="cl-dv-rel-' + i + '" data-i="' + i + '" checked> ' +
            esc(CD.candidateText(c, element.id)) + '</label>';
        }).join('')
      : '<div style="font-size:11px;color:var(--text-secondary);">この親から出ている関連はありません</div>';

    content.innerHTML =
      '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">この親から派生を 1 つ作る</h3>' +
      '<div id="cl-dv-parent" style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">' +
        esc(CD.declOf(element)) + ' を継承します</div>' +
      '<div style="' + SECTION + '">派生クラス名</div>' +
      '<input id="cl-dv-name" type="text" placeholder="例: Timer_Driver" style="width:100%;box-sizing:border-box;' + INPUT + '">' +
      '<div style="' + SECTION + '">メンバ (親の分を引き継いでいます。要らない行は消す)</div>' +
      '<textarea id="cl-dv-members" rows="5" style="width:100%;box-sizing:border-box;font-family:Consolas,monospace;' + INPUT + '">' +
        esc(inherited) + '</textarea>' +
      '<div style="' + SECTION + '">同じ関連を引く</div>' +
      '<div id="cl-dv-rels">' + relHtml + '</div>' +
      '<div style="' + SECTION + '">追加される行</div>' +
      '<pre id="cl-dv-preview" style="margin:0;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;padding:6px;font-family:Consolas,monospace;font-size:11px;color:var(--text-primary);white-space:pre-wrap;min-height:34px;"></pre>' +
      '<div id="cl-dv-errors" style="font-size:11px;color:var(--accent-red);margin-top:6px;min-height:14px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="cl-dv-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="cl-dv-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

    function collectSpec() {
      var picked = [];
      for (var i = 0; i < cands.length; i++) {
        var cb = document.getElementById('cl-dv-rel-' + i);
        if (cb && cb.checked) picked.push(i);
      }
      return {
        parentId: element.id,
        parentKind: element.kind,
        name: val('cl-dv-name'),
        members: val('cl-dv-members'),
        picked: picked,
      };
    }

    function refresh() {
      var spec = collectSpec();
      var text = ctx.getMmdText();
      var pre = document.getElementById('cl-dv-preview');
      if (pre) pre.textContent = CD.preview(text, parsedData, spec).join('\n');
      var v = CD.validate(text, parsedData, spec);
      var errEl = document.getElementById('cl-dv-errors');
      // BLK-human-20260923-1330: errors は赤で止め、warnings は橙で出したまま追加は通す。
      if (errEl) errEl.innerHTML = spec.name ? window.MA.scaffoldNotice.html(v) : '';
      var btn = document.getElementById('cl-dv-confirm');
      if (btn) {
        btn.disabled = !v.ok;
        btn.style.opacity = v.ok ? '1' : '0.5';
        btn.style.cursor = v.ok ? 'pointer' : 'not-allowed';
      }
    }

    ['cl-dv-name', 'cl-dv-members'].forEach(function(id) { P.bindEvent(id, 'input', refresh); });
    for (var i = 0; i < cands.length; i++) P.bindEvent('cl-dv-rel-' + i, 'change', refresh);
    P.bindEvent('cl-dv-cancel', 'click', function() { modal.style.display = 'none'; });
    P.bindEvent('cl-dv-confirm', 'click', function() {
      var spec = collectSpec();
      var text = ctx.getMmdText();
      if (!CD.validate(text, parsedData, spec).ok) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(CD.apply(text, parsedData, spec));
      modal.style.display = 'none';
      ctx.onUpdate();
    });
    refresh();
    var nameEl = document.getElementById('cl-dv-name');
    if (nameEl && nameEl.focus) nameEl.focus();
  }

  // BLK-junior-20260909-0703-wish: 選んだ矢印と同じ種類・同じラベルの関連をもう 1 本引く。
  // 種類はこの矢印のものに固定なので、カードから選び直す手が要らない。
  function _showSameRelationModal(relation, parsedData, ctx) {
    var modal = document.getElementById('cl-sc-modal');
    var content = document.getElementById('cl-sc-modal-content');
    if (!modal || !content) return;
    var CS = window.MA.classScaffold;
    var esc = window.MA.htmlUtils.escHtml;
    var P = window.MA.properties;
    // 記法は kind から組み直さず、選んだ行に書かれているものをそのまま見せる
    // (`-->` を `--` と出したら「同じ関連」を引いたことにならない)。
    var arrow = window.MA.classDerive.arrowBetween(ctx.getMmdText(), relation)
      || CS.ARROWS[relation.kind] || '--';
    var kindCard = window.MA.relationKindCards.kindsOf('class').filter(function(k) {
      return k.value === relation.kind;
    })[0];
    var names = (parsedData.elements || []).map(function(e) { return e.id; });
    var INPUT = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;';

    function pick(id, selected) {
      return '<select id="' + id + '" style="flex:1;' + INPUT + '">' +
        names.map(function(n) {
          return '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>';
        }).join('') + '</select>';
    }

    content.innerHTML =
      '<h3 style="margin:0 0 4px 0;color:var(--text-primary);">同じ関連を引く</h3>' +
      '<div id="cl-sr-kind" style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">' +
        esc((kindCard ? kindCard.name : relation.kind) + ' ' + arrow) + ' のまま引きます</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
        pick('cl-sr-from', relation.from) +
        '<span style="font-family:Consolas,monospace;font-size:12px;color:var(--text-secondary);">' + esc(arrow) + '</span>' +
        pick('cl-sr-to', relation.to) +
      '</div>' +
      '<input id="cl-sr-label" type="text" placeholder="ラベル" value="' + esc(relation.label || '') + '" style="width:100%;box-sizing:border-box;' + INPUT + '">' +
      '<pre id="cl-sr-preview" style="margin:10px 0 0 0;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;padding:6px;font-family:Consolas,monospace;font-size:11px;color:var(--text-primary);white-space:pre-wrap;min-height:20px;"></pre>' +
      '<div id="cl-sr-errors" style="font-size:11px;color:var(--accent-red);margin-top:6px;min-height:14px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="cl-sr-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="cl-sr-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    // 元の行を写して端点とラベルだけ差し替える (矢印の記法・多重度はそのまま残す。
    // kind から組み直すと手本の `-->` が `--` に化けて「同じ関連」にならない)。
    function newLine(text) {
      var line = window.MA.classDerive.sameRelationLine(text, relation, val('cl-sr-from'), val('cl-sr-to'));
      if (!line) return '';
      var label = val('cl-sr-label');
      var cut = line.indexOf(' : ');
      var head = cut >= 0 ? line.slice(0, cut) : line;
      return label ? head + ' : ' + label : head;
    }

    function refresh() {
      var text = ctx.getMmdText();
      var pre = document.getElementById('cl-sr-preview');
      if (pre) pre.textContent = newLine(text);
      var same = val('cl-sr-from') === val('cl-sr-to');
      var errEl = document.getElementById('cl-sr-errors');
      if (errEl) errEl.textContent = same ? '元と先が同じクラスです' : '';
      var btn = document.getElementById('cl-sr-confirm');
      if (btn) {
        btn.disabled = same;
        btn.style.opacity = same ? '0.5' : '1';
        btn.style.cursor = same ? 'not-allowed' : 'pointer';
      }
    }

    ['cl-sr-from', 'cl-sr-to'].forEach(function(id) { P.bindEvent(id, 'change', refresh); });
    P.bindEvent('cl-sr-label', 'input', refresh);
    P.bindEvent('cl-sr-cancel', 'click', function() { modal.style.display = 'none'; });
    P.bindEvent('cl-sr-confirm', 'click', function() {
      if (val('cl-sr-from') === val('cl-sr-to')) return;
      var text = ctx.getMmdText();
      var line = newLine(text);
      if (!line) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(CS.insertBeforeEnd(text, [line]));
      modal.style.display = 'none';
      ctx.onUpdate();
    });
    refresh();
  }

  // 親 1 つ + 派生クラス数個 + 関連数本を 1 つのフォームで組む。
  // class 追加フォームと Relation 追加フォームを開き直す回数が
  // クラス数 + 関連数に比例してしまい、DSL を直接打つ方が早くなるため、
  // クラスと関連を行として並べて一括で確定する。
  function _showScaffoldModal(parsedData, ctx) {
    var modal = document.getElementById('cl-sc-modal');
    var content = document.getElementById('cl-sc-modal-content');
    if (!modal || !content) return;
    var CS = window.MA.classScaffold;
    var esc = window.MA.htmlUtils.escHtml;
    var P = window.MA.properties;

    var existing = (parsedData.elements || []).map(function(e) { return e.id; });
    var datalist = '<datalist id="cl-sc-names">' +
      existing.map(function(n) { return '<option value="' + esc(n) + '"></option>'; }).join('') +
      '</datalist>';

    var INPUT = 'background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;';
    var REL_OPTS = [
      ['inheritance', '継承 <|--'],
      ['implementation', '実装 <|..'],
      ['composition', 'コンポジション *--'],
      ['aggregation', '集約 o--'],
      ['nested', '内部クラス +--'],
      ['association', '関連 --'],
      ['dependency', '依存 ..>'],
    ];

    function relSelect(id, selected) {
      return '<select id="' + id + '" style="' + INPUT + '">' +
        REL_OPTS.map(function(o) {
          return '<option value="' + o[0] + '"' + (o[0] === selected ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>';
    }

    function classRowHtml(i) {
      return '<div class="cl-sc-row" data-i="' + i + '" style="display:flex;gap:6px;margin-bottom:5px;align-items:center;">' +
        '<input id="cl-sc-name-' + i + '" type="text" placeholder="クラス名" style="flex:1;' + INPUT + '">' +
        '<input id="cl-sc-mem-' + i + '" type="text" placeholder="メンバ (カンマ/改行区切り 例: +send(), -id : int)" style="flex:2;' + INPUT + '">' +
        '<select id="cl-sc-rel-' + i + '" style="' + INPUT + '">' +
          REL_OPTS.map(function(o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') +
          '<option value="none">親と結ばない</option>' +
        '</select>' +
        '<button id="cl-sc-del-' + i + '" title="この行を削除" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 7px;">✕</button>' +
      '</div>';
    }

    // BLK-junior-20260907-0823: 関連の元 / 先は、このモーダルで作る親・子と
    // 図に既にあるクラスからの選択にする。名前を打ち直す手が要らず、
    // 「関連の元が未定義です」で確定できない状態にも落ちない。
    function namePickHtml(id) {
      return '<select id="' + id + '" class="cl-sc-name-pick" style="flex:1;' + INPUT + '">' +
        '<option value="">（選ぶ）</option></select>';
    }

    function relRowHtml(j) {
      return '<div class="cl-sc-rel-row" data-j="' + j + '" style="display:flex;gap:6px;margin-bottom:5px;align-items:center;">' +
        namePickHtml('cl-sc-rfrom-' + j) +
        relSelect('cl-sc-rkind-' + j, 'association') +
        namePickHtml('cl-sc-rto-' + j) +
        '<input id="cl-sc-rlabel-' + j + '" type="text" placeholder="ラベル" style="flex:1;' + INPUT + '">' +
        '<button id="cl-sc-rdel-' + j + '" title="この行を削除" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;padding:2px 7px;">✕</button>' +
      '</div>';
    }

    var SECTION = 'font-size:10px;color:var(--accent);font-weight:bold;margin:10px 0 4px 0;';
    content.innerHTML = datalist +
      '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">クラス構成をまとめて追加</h3>' +
      '<div style="' + SECTION + '">親クラス (省略可)</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:5px;align-items:center;">' +
        '<select id="cl-sc-pkind" style="' + INPUT + '">' +
          '<option value="class">class</option>' +
          '<option value="abstract" selected>abstract class</option>' +
          '<option value="interface">interface</option>' +
        '</select>' +
        '<input id="cl-sc-parent" list="cl-sc-names" type="text" placeholder="親クラス名 (例: CanDrv)" style="flex:1;' + INPUT + '">' +
        '<input id="cl-sc-pmembers" type="text" placeholder="メンバ (カンマ/改行区切り)" style="flex:2;' + INPUT + '">' +
      '</div>' +
      '<div style="' + SECTION + '">クラス (名前 / メンバ / 親との関連)</div>' +
      '<div id="cl-sc-rows">' + classRowHtml(0) + classRowHtml(1) + classRowHtml(2) + '</div>' +
      '<button id="cl-sc-add-row" style="font-size:11px;padding:3px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">＋ クラスを追加</button>' +
      '<div style="' + SECTION + '">親以外の関連 (省略可)</div>' +
      // BLK-junior-20260907-0823: 派生クラス図は子どうしの関連も一緒に引くので、
      // クラスの行と同じく最初から 3 行出す (「＋ 関連を追加」を押す手を省く)。
      '<div id="cl-sc-rel-rows">' + relRowHtml(0) + relRowHtml(1) + relRowHtml(2) + '</div>' +
      '<button id="cl-sc-add-rel" style="font-size:11px;padding:3px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">＋ 関連を追加</button>' +
      '<div style="' + SECTION + '">追加される行</div>' +
      '<pre id="cl-sc-preview" style="margin:0;background:var(--bg-primary);border:1px solid var(--border);border-radius:3px;padding:6px;font-family:Consolas,monospace;font-size:11px;color:var(--text-primary);white-space:pre-wrap;min-height:34px;"></pre>' +
      '<div id="cl-sc-errors" style="font-size:11px;color:var(--accent-red);margin-top:6px;min-height:14px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="cl-sc-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="cl-sc-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    modal.style.display = 'flex';

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

    function collectSpec() {
      var classes = [];
      var rows = content.querySelectorAll('.cl-sc-row');
      for (var i = 0; i < rows.length; i++) {
        var idx = rows[i].getAttribute('data-i');
        classes.push({
          name: val('cl-sc-name-' + idx),
          members: val('cl-sc-mem-' + idx),
          relation: val('cl-sc-rel-' + idx),
        });
      }
      var relations = [];
      var rrows = content.querySelectorAll('.cl-sc-rel-row');
      for (var j = 0; j < rrows.length; j++) {
        var jdx = rrows[j].getAttribute('data-j');
        relations.push({
          from: val('cl-sc-rfrom-' + jdx),
          kind: val('cl-sc-rkind-' + jdx),
          to: val('cl-sc-rto-' + jdx),
          label: val('cl-sc-rlabel-' + jdx),
        });
      }
      return {
        parent: val('cl-sc-parent'),
        parentKind: val('cl-sc-pkind'),
        parentMembers: val('cl-sc-pmembers'),
        classes: classes,
        relations: relations,
      };
    }

    // 関連の元 / 先に出す名前。このモーダルで作る親・子を先に、図に既にある
    // クラスを後に並べる (今まさに打っている名前がすぐ選べる方が探さずに済む)。
    function knownNames() {
      var out = [];
      var seen = {};
      function push(n) {
        var v = String(n == null ? '' : n).trim();
        if (!v || seen[v]) return;
        seen[v] = true;
        out.push(v);
      }
      push(val('cl-sc-parent'));
      var rows = content.querySelectorAll('.cl-sc-row');
      for (var i = 0; i < rows.length; i++) push(val('cl-sc-name-' + rows[i].getAttribute('data-i')));
      existing.forEach(push);
      return out;
    }

    // 選択中の値は残す。まだ名前を打っていない行は「（選ぶ）」のまま。
    function refreshNamePickers() {
      var names = knownNames();
      var picks = content.querySelectorAll('.cl-sc-name-pick');
      for (var i = 0; i < picks.length; i++) {
        var sel = picks[i];
        var cur = sel.value;
        var html = '<option value="">（選ぶ）</option>';
        for (var k = 0; k < names.length; k++) {
          html += '<option value="' + esc(names[k]) + '">' + esc(names[k]) + '</option>';
        }
        sel.innerHTML = html;
        sel.value = names.indexOf(cur) >= 0 ? cur : '';
      }
    }

    function refresh() {
      refreshNamePickers();
      var spec = collectSpec();
      var text = ctx.getMmdText();
      var pre = document.getElementById('cl-sc-preview');
      if (pre) pre.textContent = CS.preview(text, spec).join('\n');
      var v = CS.validate(spec, text);
      var errEl = document.getElementById('cl-sc-errors');
      // BLK-human-20260923-1330: errors は赤で止め、warnings は橙で出したまま追加は通す。
      if (errEl) errEl.innerHTML = window.MA.scaffoldNotice.html(v);
      var confirmBtn = document.getElementById('cl-sc-confirm');
      if (confirmBtn) {
        confirmBtn.disabled = !v.ok;
        confirmBtn.style.opacity = v.ok ? '1' : '0.5';
        confirmBtn.style.cursor = v.ok ? 'pointer' : 'not-allowed';
      }
    }

    // 行の削除は「最低 1 行は残す」。全部消えると追加ボタンの位置が
    // 分からなくなるため。
    function bindRemovable(btnId, selector, key, keyVal) {
      P.bindEvent(btnId, 'click', function() {
        var rows = content.querySelectorAll(selector);
        if (rows.length <= 1) return;
        for (var k = 0; k < rows.length; k++) {
          if (rows[k].getAttribute(key) === String(keyVal)) {
            rows[k].parentNode.removeChild(rows[k]);
            break;
          }
        }
        refresh();
      });
    }

    function bindClassRow(i) {
      ['cl-sc-name-' + i, 'cl-sc-mem-' + i].forEach(function(id) { P.bindEvent(id, 'input', refresh); });
      P.bindEvent('cl-sc-rel-' + i, 'change', refresh);
      bindRemovable('cl-sc-del-' + i, '.cl-sc-row', 'data-i', i);
    }

    function bindRelRow(j) {
      P.bindEvent('cl-sc-rlabel-' + j, 'input', refresh);
      // 元 / 先はプルダウンなので change で拾う (BLK-junior-20260907-0823)。
      ['cl-sc-rfrom-' + j, 'cl-sc-rto-' + j, 'cl-sc-rkind-' + j].forEach(function(id) { P.bindEvent(id, 'change', refresh); });
      bindRemovable('cl-sc-rdel-' + j, '.cl-sc-rel-row', 'data-j', j);
    }

    var rowCount = 3, relCount = 3;
    bindClassRow(0); bindClassRow(1); bindClassRow(2);
    bindRelRow(0); bindRelRow(1); bindRelRow(2);
    ['cl-sc-parent', 'cl-sc-pmembers'].forEach(function(id) { P.bindEvent(id, 'input', refresh); });
    P.bindEvent('cl-sc-pkind', 'change', refresh);

    P.bindEvent('cl-sc-add-row', 'click', function() {
      var rows = document.getElementById('cl-sc-rows');
      if (!rows) return;
      var i = rowCount++;
      rows.insertAdjacentHTML('beforeend', classRowHtml(i));
      bindClassRow(i);
      var el = document.getElementById('cl-sc-name-' + i);
      if (el && el.focus) el.focus();
      refresh();
    });

    P.bindEvent('cl-sc-add-rel', 'click', function() {
      var rows = document.getElementById('cl-sc-rel-rows');
      if (!rows) return;
      var j = relCount++;
      rows.insertAdjacentHTML('beforeend', relRowHtml(j));
      bindRelRow(j);
      var el = document.getElementById('cl-sc-rfrom-' + j);
      if (el && el.focus) el.focus();
      refresh();
    });

    function close() { modal.style.display = 'none'; content.innerHTML = ''; }
    P.bindEvent('cl-sc-cancel', 'click', close);
    P.bindEvent('cl-sc-confirm', 'click', function() {
      var spec = collectSpec();
      var text = ctx.getMmdText();
      if (!CS.validate(spec, text).ok) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(CS.apply(text, spec));
      ctx.onUpdate();
      close();
    });

    refresh();
    // BLK-junior-20260907-0823: 開いた直後は必ず親クラス名から打ち始めるので、
    // その欄に置きに行くクリックを省いて最初からフォーカスを載せる。
    var first = document.getElementById('cl-sc-parent');
    if (first && first.focus) first.focus();
  }

  function _renderNoSelection(parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var GP = window.MA.groupPlace;
    var elements = parsedData.elements || [];
    var allOpts = elements.map(function(e) { return { value: e.id, label: e.label || e.id }; });
    if (allOpts.length === 0) allOpts = [{ value: '', label: '（要素なし）' }];

    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
        P.selectFieldHtml('種類', 'cl-tail-kind', [
          { value: 'class',     label: 'Class', selected: true },
          { value: 'interface', label: 'Interface' },
          { value: 'abstract',  label: 'Abstract Class' },
          { value: 'enum',      label: 'Enum' },
          { value: 'package',   label: 'Package境界' },
          { value: 'namespace', label: 'Namespace' },
          { value: 'relation',  label: 'Relation (関係)' },
          { value: 'note',      label: 'Note (注釈)' },
        ]) +
        '<div id="cl-tail-detail" style="margin-top:6px;"></div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<button id="cl-scaffold-open" style="width:100%;font-size:11px;padding:5px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:3px;cursor:pointer;">⌗ クラス構成をまとめて追加</button>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('cl-scaffold-open', 'click', function() {
      _showScaffoldModal(parsedData, ctx);
    });


    var renderTailDetail = function() {
      var kind = document.getElementById('cl-tail-kind').value;
      var detailEl = document.getElementById('cl-tail-detail');
      var html2 = '';
      if (kind === 'class' || kind === 'interface' || kind === 'abstract') {
        html2 =
          P.fieldHtml('Alias', 'cl-tail-alias', '', '例: User') +
          P.fieldHtml('Label', 'cl-tail-label', '', '省略可') +
          P.fieldHtml('Stereotype', 'cl-tail-stereo', '', '<<X>> の X 部分のみ') +
          P.fieldHtml('Generics (カンマ区切り)', 'cl-tail-generics', '', '例: T,K,V') +
          GP.fieldHtml('class', 'cl-tail', parsedData.groups) +
          P.primaryButtonHtml('cl-tail-add', '+ ' + kind + ' 追加');
      } else if (kind === 'enum') {
        html2 =
          P.fieldHtml('Alias', 'cl-tail-alias', '', '例: Color') +
          P.fieldHtml('値 (改行区切り)', 'cl-tail-values', '', 'RED\\nGREEN\\nBLUE') +
          GP.fieldHtml('class', 'cl-tail', parsedData.groups) +
          P.primaryButtonHtml('cl-tail-add', '+ enum 追加');
      } else if (kind === 'package' || kind === 'namespace') {
        html2 =
          P.fieldHtml('Label', 'cl-tail-label', '', '例: domain') +
          P.primaryButtonHtml('cl-tail-add', '+ ' + kind + ' 追加');
      } else if (kind === 'relation') {
        // BLK-junior-20260908-1203: From/To のどちらが親かがフォームから読めず、
        // 継承を逆向きに張ってしまう。種類ごとの呼び名を見出しに出し、
        // 「押すとこう入る」の 1 行と ⇄ 入替を添えて、追加する前に確かめられるようにする。
        html2 =
          P.selectFieldHtml('Kind', 'cl-tail-rkind', [
            { value: 'association',    label: 'Association (--)', selected: true },
            { value: 'inheritance',    label: 'Inheritance (<|--)' },
            { value: 'implementation', label: 'Implementation (<|..)' },
            { value: 'composition',    label: 'Composition (*--)' },
            { value: 'aggregation',    label: 'Aggregation (o--)' },
            { value: 'nested',         label: 'Nested (+--)' },
            { value: 'dependency',     label: 'Dependency (..>)' },
          ]) +
          _roleSelectHtml('cl-tail-from', 'from', 'association', allOpts) +
          '<button id="cl-tail-rswap" type="button" style="font-size:11px;padding:3px 10px;margin:0 0 8px;cursor:pointer;">⇄ 入替</button>' +
          _roleSelectHtml('cl-tail-to', 'to', 'association', allOpts) +
          '<div id="cl-tail-rpreview" style="margin-bottom:8px;padding:4px 6px;font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);background:var(--bg-tertiary);border-radius:3px;word-break:break-all;"></div>' +
          P.fieldHtml('Label', 'cl-tail-rlabel', '', '任意') +
          P.primaryButtonHtml('cl-tail-add', '+ Relation 追加');
      } else if (kind === 'note') {
        var noteTargets = elements.map(function(e) { return { value: e.id, label: e.label || e.id }; });
        if (noteTargets.length === 0) noteTargets = [{ value: '', label: '（要素なし）' }];
        html2 =
          P.selectFieldHtml('Target', 'cl-tail-ntarget', noteTargets) +
          P.selectFieldHtml('Position', 'cl-tail-npos', [
            { value: 'left', label: 'Left', selected: true },
            { value: 'right', label: 'Right' },
            { value: 'top', label: 'Top' },
            { value: 'bottom', label: 'Bottom' },
          ]) +
          '<div style="margin-bottom:6px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">Text (改行可)</label>' +
            '<textarea id="cl-tail-ntext" style="width:100%;min-height:60px;font-family:inherit;font-size:12px;"></textarea>' +
          '</div>' +
          P.primaryButtonHtml('cl-tail-add', '+ Note 追加');
      }
      detailEl.innerHTML = html2;
      if (kind === 'relation') _bindRelationRoles();

      P.bindEvent('cl-tail-add', 'click', function() {
        var t = ctx.getMmdText();
        var out = t;
        var k = document.getElementById('cl-tail-kind').value;
        if (k === 'class' || k === 'interface' || k === 'abstract') {
          var rawAl = document.getElementById('cl-tail-alias').value;
          var normCl = normalizeIdInput(rawAl, parsedData);
          if (!normCl.valid) { alert('Alias 必須'); return; }
          var rawLbl = document.getElementById('cl-tail-label').value.trim();
          var lbl = rawLbl || normCl.label;
          var st = document.getElementById('cl-tail-stereo').value.trim() || null;
          var genStr = document.getElementById('cl-tail-generics').value.trim();
          var gen = genStr ? genStr.split(',').map(function(s) { return s.trim(); }) : null;
          window.MA.history.pushHistory();
          if (k === 'class') out = addClass(t, normCl.id, lbl, st, gen);
          else if (k === 'interface') out = addInterface(t, normCl.id, lbl, st, gen);
          else out = addAbstract(t, normCl.id, lbl, st, gen);
          out = GP.applyAdd('class', 'cl-tail', parsedData.groups, t, out);
        } else if (k === 'enum') {
          var rawAl2 = document.getElementById('cl-tail-alias').value;
          var normEn = normalizeIdInput(rawAl2, parsedData);
          if (!normEn.valid) { alert('Alias 必須'); return; }
          var valsStr = document.getElementById('cl-tail-values').value;
          var vals = valsStr.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(function(s) { return s; });
          window.MA.history.pushHistory();
          out = addEnum(t, normEn.id, normEn.label, vals);
          out = GP.applyAdd('class', 'cl-tail', parsedData.groups, t, out);
        } else if (k === 'package' || k === 'namespace') {
          var lbl3 = document.getElementById('cl-tail-label').value.trim();
          if (!lbl3) { alert('Label 必須'); return; }
          window.MA.history.pushHistory();
          out = k === 'package' ? addPackage(t, lbl3) : addNamespace(t, lbl3);
          // 作った直後の境界を次の「追加する位置」にする (続けて中身を足せる)。
          GP.remember('class', lbl3);
        } else if (k === 'relation') {
          var fr = document.getElementById('cl-tail-from').value;
          var to = document.getElementById('cl-tail-to').value;
          if (!fr || !to) { alert('From/To 必須 (先に要素を追加)'); return; }
          var rkind = document.getElementById('cl-tail-rkind').value;
          window.MA.history.pushHistory();
          out = addRelation(t, rkind, fr, to, document.getElementById('cl-tail-rlabel').value.trim() || null);
        } else if (k === 'note') {
          var ntg = document.getElementById('cl-tail-ntarget').value;
          if (!ntg) { alert('Target 必須'); return; }
          var npos = document.getElementById('cl-tail-npos').value;
          var ntext = document.getElementById('cl-tail-ntext').value || '';
          window.MA.history.pushHistory();
          out = addNote(t, ntg, npos, ntext);
        }
        ctx.setMmdText(out);
        ctx.onUpdate();
      });
    };
    document.getElementById('cl-tail-kind').addEventListener('change', renderTailDetail);
    // design 2b: 種別はチップ 1 クリックで決める。値の持ち主は上の select のまま。
    window.MA.tailKindChips.mount('cl-tail-kind');
    renderTailDetail();
  }

  // design 4a: 種別は select ではなくトグル。今の種別が押された状態で出る。
  var _KINDS = [
    { kind: 'class', label: 'class' },
    { kind: 'abstract', label: 'abstract class' },
    { kind: 'interface', label: 'interface' },
    { kind: 'enum', label: 'enum' },
  ];

  function _kindToggleHtml(current) {
    var html = '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">種別 / Kind</div>' +
               '<div id="cl-kind-toggle" style="display:flex;gap:3px;margin-bottom:8px;flex-wrap:wrap;">';
    _KINDS.forEach(function(k) {
      var on = k.kind === current;
      html += '<button class="cl-kind-btn" data-kind="' + k.kind + '"' +
              ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
              ' style="flex:1 1 auto;padding:4px 6px;font-size:10px;border-radius:3px;cursor:pointer;' +
              'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';' +
              'background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';' +
              'color:' + (on ? '#fff' : 'var(--text-primary)') + ';">' + k.label + '</button>';
    });
    return html + '</div>';
  }

  // design 4a: 可視性は記号を打つのではなく + − # ~ のトグルで選ぶ。
  var _VIS = [
    { value: '+', label: '+ public' },
    { value: '-', label: '− private' },
    { value: '#', label: '# prot.' },
    { value: '~', label: '~ pkg' },
  ];

  function _visToggleHtml(idPrefix, current) {
    var html = '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">可視性 / Visibility</div>' +
               '<div class="cl-vis-toggle" data-vis-for="' + idPrefix + '" style="display:flex;gap:3px;margin-bottom:6px;">';
    _VIS.forEach(function(v) {
      var on = v.value === current;
      html += '<button class="cl-vis-btn" data-vis-for="' + idPrefix + '" data-vis="' + v.value + '"' +
              ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
              ' style="flex:1;padding:3px 2px;font-size:10px;border-radius:3px;cursor:pointer;' +
              'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';' +
              'background:' + (on ? 'var(--accent)' : 'var(--bg-tertiary)') + ';' +
              'color:' + (on ? '#fff' : 'var(--text-primary)') + ';">' + v.label + '</button>';
    });
    return html + '<input type="hidden" id="' + idPrefix + '" value="' + (current || '') + '">' + '</div>';
  }

  // トグル群の押下を 1 本のハンドラで受け、hidden input に値を落とす。
  function _bindVisToggle(propsEl, idPrefix, onPick) {
    var btns = propsEl.querySelectorAll('.cl-vis-btn[data-vis-for="' + idPrefix + '"]');
    Array.prototype.forEach.call(btns, function(b) {
      b.addEventListener('click', function() {
        var hidden = document.getElementById(idPrefix);
        var picked = b.getAttribute('data-vis');
        if (hidden) hidden.value = picked;
        Array.prototype.forEach.call(btns, function(o) {
          var on = o === b;
          o.setAttribute('aria-pressed', on ? 'true' : 'false');
          o.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
          o.style.background = on ? 'var(--accent)' : 'var(--bg-tertiary)';
          o.style.color = on ? '#fff' : 'var(--text-primary)';
        });
        if (onPick) onPick(picked);
      });
    });
  }

  function _renderElementEdit(element, parsedData, propsEl, ctx, opts) {
    var P = window.MA.properties;
    var GP = window.MA.groupPlace;
    if (element.kind === 'enum') return _renderEnumEdit(element, parsedData, propsEl, ctx, opts);
    var focusIdx = opts && typeof opts.focusMemberIndex === 'number' ? opts.focusMemberIndex : -1;

    var kindLabel = element.kind === 'interface' ? 'Interface'
                  : element.kind === 'abstract' ? 'Abstract Class'
                  : 'Class';
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
        kindLabel + ' (L' + element.line + ')</label>' +
        // design 4a「種別 / Kind」: 宣言のキーワードをその場で切り替える
        _kindToggleHtml(element.kind) +
        P.fieldHtml('Alias (id)', 'cl-edit-id', element.id) +
        // BLK-reviewer-20260915-0506-wish: クラス名を打つのはここ。登録簿の
        // 正式表記を欄の下に出し、揺れた綴りならその場で揃える先を言う。
        P.vocabPickerHtml('cl-edit-id-vocab', { roles: ['type'] }) +
        P.fieldHtml('Label', 'cl-edit-label', element.label || '') +
        P.fieldHtml('Stereotype', 'cl-edit-stereo', element.stereotype || '') +
        P.primaryButtonHtml('cl-edit-apply', '変更を反映') +
        ' ' + P.primaryButtonHtml('cl-rename-refs', 'Alias 変更を関連 Relation にも追従') +
        '<div style="margin-top:8px;display:flex;gap:6px;">' +
          '<button id="cl-move-up" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
          '<button id="cl-move-down" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
          '<button id="cl-delete" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        '</div>' +
        // BLK-junior-20260909-0703-wish: 手本の親を選んだまま派生を 1 つ起こす。
        '<button id="cl-derive-open" style="width:100%;margin-top:8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">⬇ この親から派生を 1 つ作る</button>' +
        // BLK-owner-20260923-2332-2: 選んだクラスを境界の中へ移す / 外へ出す。
        GP.editFieldHtml('cl-edit', parsedData.groups, element.line) +
      '</div>';

    // design 4a: 属性 / Attributes と メソッド / Methods を別の節に分け、
    // それぞれに「+ 追加」を置く。1 行 1 レコードで、クリックするとその場で開く。
    // 行の並び (member index) は元の DSL 順のまま持つので ↑↓✕ の宛先は変わらない。
    var members = element.members || [];
    function _memberSectionHtml(sectionKind, title, addBtnId) {
      var rows = '';
      var count = 0;
      members.forEach(function(m, mi) {
        if (m.kind !== sectionKind) return;
        count++;
        var isSel = mi === focusIdx;
        var rowCls = isSel ? 'cl-member-row cl-member-selected' : 'cl-member-row';
        var rowStyle = isSel ? 'background:var(--accent-bg, rgba(0,128,255,0.15));padding:4px;border-radius:3px;' : 'padding:2px;';
        var preview = (m.visibility || '') + ' ' + m.name +
                      (m.kind === 'method' ? '(' + (m.params || '') + ')' : '') +
                      (m.type ? ' : ' + m.type : '');
        rows += '<div class="' + rowCls + '" data-member-idx="' + mi + '" data-member-kind="' + m.kind + '" style="' + rowStyle + 'font-size:11px;margin-bottom:2px;">' +
                  window.MA.htmlUtils.escHtml(preview) +
                  ' <button id="cl-mem-up-' + mi + '" data-line="' + m.line + '">↑</button>' +
                  ' <button id="cl-mem-down-' + mi + '" data-line="' + m.line + '">↓</button>' +
                  ' <button id="cl-mem-del-' + mi + '" data-line="' + m.line + '">✕</button>';
        if (isSel) {
          // 選んだ行だけをその場で展開して編集する
          rows += '<div style="margin-top:4px;padding:4px;background:var(--bg);border:1px solid var(--border);">' +
                    _visToggleHtml('cl-mem-vis-' + mi, m.visibility || '') +
                    P.fieldHtml('名前', 'cl-mem-name-' + mi, m.name) +
                    P.fieldHtml('型', 'cl-mem-type-' + mi, m.type || '') +
                    (m.kind === 'method' ? P.fieldHtml('引数', 'cl-mem-params-' + mi, m.params || '') : '') +
                    '<div style="margin-top:4px;">' +
                      '<label><input type="checkbox" id="cl-mem-static-' + mi + '"' + (m.static ? ' checked' : '') + '> static にする</label>' +
                      (m.kind === 'method' ? ' <label><input type="checkbox" id="cl-mem-abstract-' + mi + '"' + (m.abstract ? ' checked' : '') + '> abstract にする</label>' : '') +
                    '</div>' +
                    P.primaryButtonHtml('cl-mem-update-' + mi, '更新') +
                  '</div>';
        }
        rows += '</div>';
      });
      if (count === 0) {
        rows = '<div style="font-size:11px;color:var(--text-secondary);font-style:italic;">（まだありません）</div>';
      }
      return '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
               '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
                 '<span style="font-size:10px;color:var(--accent);font-weight:bold;">' + title + '</span>' +
                 '<button id="' + addBtnId + '" style="font-size:11px;padding:2px 8px;">+ 追加</button>' +
               '</div>' + rows;
    }

    html += _memberSectionHtml('attribute', '属性 / Attributes', 'cl-add-attr') +
            '<div id="cl-add-attr-form" style="display:none;margin-top:6px;"></div></div>' +
            _memberSectionHtml('method', 'メソッド / Methods', 'cl-add-method') +
            '<div id="cl-add-method-form" style="display:none;margin-top:6px;"></div></div>';

    // design 4a: 細かい指定は「その他」に畳む。よく使う 属性 / メソッド を上に残し、
    // constructor・ジェネリクス・内部クラスはここを開いたときだけ出す。
    // static / abstract は各メンバー行と「+ 追加」フォームのチェックで指定する。
    // 3c と同じ流儀で、畳んだ中の値が既定から外れていれば (ジェネリクスを持つクラス)
    // 開いた状態で出す。閉じたままだと型引数が画面のどこにも見えなくなるため。
    var moreOpen = (element.generics || []).length > 0;
    html += '<details id="cl-more"' + (moreOpen ? ' open' : '') +
              ' style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px;">' +
              '<summary id="cl-more-summary" style="font-size:11px;color:var(--text-secondary);cursor:pointer;">' +
                'その他（constructor / static / abstract / ジェネリクス / 内部クラス）…' +
              '</summary>' +
              '<div style="margin-top:6px;">' +
                '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:2px;">constructor</div>' +
                _visToggleHtml('cl-ctor-vis', '+') +
                P.fieldHtml('引数', 'cl-ctor-params', '', '例: radius : double') +
                P.primaryButtonHtml('cl-ctor-go', '+ ' + window.MA.htmlUtils.escHtml(element.id) + '() を追加') +
                '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">' +
                  'static / abstract は各メンバーの行、または属性・メソッドの「+ 追加」で指定します</div>' +
                '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:8px;">' +
                  '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:2px;">ジェネリクス</div>' +
                  P.fieldHtml('型引数 (カンマ区切り)', 'cl-edit-generics', (element.generics || []).join(','), '例: T, K') +
                  '<div style="font-size:10px;color:var(--text-secondary);">上の「変更を反映」で書き込まれます</div>' +
                '</div>' +
                '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:8px;">' +
                  '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:2px;">内部クラス</div>' +
                  P.fieldHtml('名前', 'cl-nested-name', '', '例: Builder') +
                  P.primaryButtonHtml('cl-nested-go', '+ 内部クラスを追加') +
                '</div>' +
              '</div>' +
            '</details>';

    // Notes section
    var classNotes = (parsedData.notes || []).filter(function(n) { return n.targetId === element.id; });
    html += '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">' +
            '<div style="font-size:10px;color:var(--accent);font-weight:bold;margin-bottom:4px;">Notes</div>';
    if (classNotes.length === 0) {
      html += '<div style="font-size:11px;color:var(--text-secondary);font-style:italic;">（このクラスへの note なし）</div>';
    } else {
      classNotes.forEach(function(n, idx) {
        var preview = (n.text || '').replace(/\n/g, ' ⏎ ').slice(0, 40);
        if ((n.text || '').length > 40) preview += '...';
        html += '<div style="display:flex;align-items:center;gap:4px;font-size:11px;margin-bottom:2px;">' +
                  '<span style="flex:1;">' + n.position + ' "' + preview.replace(/[<>&]/g, '') + '" (L' + n.line + ')</span>' +
                  '<button id="cl-note-edit-' + idx + '" data-line="' + n.line + '" data-end="' + n.endLine + '" data-id="' + n.id + '">edit</button>' +
                  '<button id="cl-note-del-' + idx + '" data-line="' + n.line + '" data-end="' + n.endLine + '">✕</button>' +
                '</div>';
      });
    }
    html += '<div id="cl-add-note-form" style="margin-top:6px;"></div>' +
            '<button id="cl-add-note-btn" style="margin-top:4px;">+ Note 追加</button>' +
          '</div>';

    propsEl.innerHTML = html;
    GP.bindEdit('cl-edit', parsedData.groups, element.line, ctx);

    // BLK-junior-20260909-0703-wish: 選んでいるクラスを親にして派生を 1 つ起こす。
    P.bindEvent('cl-derive-open', 'click', function() {
      _showDeriveModal(element, parsedData, ctx);
    });

    P.bindVocabPicker('cl-edit-id-vocab', 'cl-edit-id');

    P.bindEvent('cl-edit-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var rawNewId = document.getElementById('cl-edit-id').value.trim();
      var rawNewLabel = document.getElementById('cl-edit-label').value.trim();
      // Non-ASCII alias: normalize to ASCII alias and promote the typed alias
      // string to the label so parser+SVG matching stays consistent.
      var freshParsed = parse(t);
      var renameNorm = window.MA.idNormalizer.normalize(rawNewId, _existingClassIdSet(freshParsed), 'C');
      var newId = renameNorm.valid ? renameNorm.id : rawNewId;
      var newLabel = (renameNorm.valid && renameNorm.id !== renameNorm.label)
        ? renameNorm.label
        : rawNewLabel;
      var newStereo = document.getElementById('cl-edit-stereo').value.trim() || null;
      var genEl = document.getElementById('cl-edit-generics');
      var genStr = genEl ? genEl.value.trim() : (element.generics || []).join(',');
      var newGen = genStr ? genStr.split(',').map(function(s) { return s.trim(); }) : null;
      if (newId !== element.id) t = updateClass(t, element.line, 'id', newId);
      if (newLabel !== element.label) t = updateClass(t, element.line, 'label', newLabel);
      if (newStereo !== element.stereotype) t = updateClass(t, element.line, 'stereotype', newStereo);
      var oldGen = (element.generics || []).join(',');
      if (genStr !== oldGen) t = updateClass(t, element.line, 'generics', newGen);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('cl-rename-refs', 'click', function() {
      var rawNewId = document.getElementById('cl-edit-id').value.trim();
      if (!rawNewId || rawNewId === element.id) { alert('Alias を変更してから実行してください'); return; }
      // renameWithRefs rewrites references, so we MUST end up with an ASCII
      // alias (otherwise refs become unparseable). Normalize first.
      var freshParsed = parse(ctx.getMmdText());
      var refsNorm = window.MA.idNormalizer.normalize(rawNewId, _existingClassIdSet(freshParsed), 'C');
      var newId = refsNorm.valid ? refsNorm.id : rawNewId;
      window.MA.history.pushHistory();
      ctx.setMmdText(renameWithRefs(ctx.getMmdText(), element.id, newId));
      ctx.onUpdate();
    });
    // 種別トグル: 押した種別へ宣言のキーワードを差し替える (id・表示名・本体は残る)
    Array.prototype.forEach.call(propsEl.querySelectorAll('.cl-kind-btn'), function(b) {
      b.addEventListener('click', function() {
        var next = b.getAttribute('data-kind');
        if (next === element.kind) return;
        window.MA.history.pushHistory();
        ctx.setMmdText(changeKind(ctx.getMmdText(), element.line, next));
        window.MA.selection.clearSelection();
        ctx.onUpdate();
      });
    });
    P.bindEvent('cl-move-up', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineUp(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('cl-move-down', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(moveLineDown(ctx.getMmdText(), element.line));
      ctx.onUpdate();
    });
    P.bindEvent('cl-delete', 'click', function() {
      if (!confirm('このクラスと紐付く note も削除します。続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteClassWithNotes(ctx.getMmdText(), element.id));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    // Per-member row handlers (click row to focus, ↑↓✕ buttons, update button when focused)
    (element.members || []).forEach(function(m, mi) {
      // Row click → switch selection to that member (if not already focused)
      var row = propsEl.querySelector('.cl-member-row[data-member-idx="' + mi + '"]');
      if (row && mi !== focusIdx) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function(e) {
          // Avoid hijacking clicks on inner buttons
          if (e.target && e.target.tagName === 'BUTTON') return;
          window.MA.selection.setSelected([{
            type: 'member',
            id: element.id + '::__m_' + mi,
            parentId: element.id,
            parentKind: element.kind,
            memberIndex: mi,
            memberKind: m.kind,
            line: m.line
          }]);
        });
      }
      P.bindEvent('cl-mem-up-' + mi, 'click', function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.MA.history.pushHistory();
        ctx.setMmdText(moveMemberUpByIndex(ctx.getMmdText(), element.id, mi));
        ctx.onUpdate();
      });
      P.bindEvent('cl-mem-down-' + mi, 'click', function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.MA.history.pushHistory();
        ctx.setMmdText(moveMemberDownByIndex(ctx.getMmdText(), element.id, mi));
        ctx.onUpdate();
      });
      P.bindEvent('cl-mem-del-' + mi, 'click', function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.MA.history.pushHistory();
        ctx.setMmdText(deleteMemberByIndex(ctx.getMmdText(), element.id, mi));
        window.MA.selection.clearSelection();
        ctx.onUpdate();
      });
      if (mi === focusIdx) {
        _bindVisToggle(propsEl, 'cl-mem-vis-' + mi);
        P.bindEvent('cl-mem-update-' + mi, 'click', function() {
          var vis = document.getElementById('cl-mem-vis-' + mi).value || null;
          var name = document.getElementById('cl-mem-name-' + mi).value;
          var typ = document.getElementById('cl-mem-type-' + mi).value;
          var stat = !!document.getElementById('cl-mem-static-' + mi).checked;
          window.MA.history.pushHistory();
          var t = ctx.getMmdText();
          if (m.kind === 'attribute') {
            t = updateAttribute(t, m.line, 'visibility', vis);
            t = updateAttribute(t, m.line, 'name', name);
            t = updateAttribute(t, m.line, 'type', typ);
            t = updateAttribute(t, m.line, 'static', stat);
            ctx.setMmdText(t);
          } else if (m.kind === 'method') {
            var pms = document.getElementById('cl-mem-params-' + mi).value;
            var abs = !!document.getElementById('cl-mem-abstract-' + mi).checked;
            t = updateMethod(t, m.line, 'visibility', vis);
            t = updateMethod(t, m.line, 'name', name);
            t = updateMethod(t, m.line, 'params', pms);
            t = updateMethod(t, m.line, 'type', typ);
            t = updateMethod(t, m.line, 'static', stat);
            t = updateMethod(t, m.line, 'abstract', abs);
            ctx.setMmdText(t);
          }
          ctx.onUpdate();
        });
        // Auto-scroll selected row into view
        setTimeout(function() {
          var r = propsEl.querySelector('.cl-member-selected');
          if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
        }, 0);
      }
    });
    P.bindEvent('cl-add-attr', 'click', function() {
      document.getElementById('cl-add-attr-form').style.display = 'block';
      document.getElementById('cl-add-attr-form').innerHTML =
        _visToggleHtml('cl-aa-vis', '+') +
        '<label style="font-size:11px;"><input type="checkbox" id="cl-aa-static"> static にする</label>' +
        P.fieldHtml('名前', 'cl-aa-name', '', '例: count') +
        P.fieldHtml('型', 'cl-aa-type', '', '例: int') +
        P.primaryButtonHtml('cl-aa-go', '追加');
      _bindVisToggle(propsEl, 'cl-aa-vis');
      P.bindEvent('cl-aa-go', 'click', function() {
        var vis = document.getElementById('cl-aa-vis').value;
        var stat = document.getElementById('cl-aa-static').checked;
        var name = document.getElementById('cl-aa-name').value.trim();
        var typ = document.getElementById('cl-aa-type').value.trim();
        if (!name) { alert('Name 必須'); return; }
        window.MA.history.pushHistory();
        ctx.setMmdText(addAttribute(ctx.getMmdText(), element.line, vis, name, typ, stat));
        ctx.onUpdate();
      });
    });
    P.bindEvent('cl-add-method', 'click', function() {
      document.getElementById('cl-add-method-form').style.display = 'block';
      document.getElementById('cl-add-method-form').innerHTML =
        _visToggleHtml('cl-am-vis', '+') +
        '<label style="font-size:11px;"><input type="checkbox" id="cl-am-static"> static にする</label>' +
        '<label style="font-size:11px;"><input type="checkbox" id="cl-am-abstract"> abstract にする</label>' +
        P.fieldHtml('名前', 'cl-am-name', '', '例: login') +
        P.fieldHtml('引数', 'cl-am-params', '', '例: a : int, b : str') +
        P.fieldHtml('戻り値の型', 'cl-am-ret', '', '例: void') +
        P.primaryButtonHtml('cl-am-go', '追加');
      _bindVisToggle(propsEl, 'cl-am-vis');
      P.bindEvent('cl-am-go', 'click', function() {
        var vis = document.getElementById('cl-am-vis').value;
        var stat = document.getElementById('cl-am-static').checked;
        var abs = document.getElementById('cl-am-abstract').checked;
        var name = document.getElementById('cl-am-name').value.trim();
        var params = document.getElementById('cl-am-params').value.trim();
        var ret = document.getElementById('cl-am-ret').value.trim();
        if (!name) { alert('Name 必須'); return; }
        window.MA.history.pushHistory();
        ctx.setMmdText(addMethod(ctx.getMmdText(), element.line, vis, name, params, ret, stat, abs));
        ctx.onUpdate();
      });
    });

    _bindVisToggle(propsEl, 'cl-ctor-vis');
    P.bindEvent('cl-ctor-go', 'click', function() {
      var vis = document.getElementById('cl-ctor-vis').value;
      var params = document.getElementById('cl-ctor-params').value.trim();
      window.MA.history.pushHistory();
      ctx.setMmdText(addConstructor(ctx.getMmdText(), element.line, vis, params));
      ctx.onUpdate();
    });
    P.bindEvent('cl-nested-go', 'click', function() {
      var raw = document.getElementById('cl-nested-name').value.trim();
      if (!raw) { alert('内部クラスの名前を入れてください'); return; }
      var norm = normalizeIdInput(raw, parse(ctx.getMmdText()));
      var innerId = norm.valid ? norm.id : raw;
      window.MA.history.pushHistory();
      ctx.setMmdText(addNestedClass(ctx.getMmdText(), element.id, innerId));
      ctx.onUpdate();
    });

    classNotes.forEach(function(n, idx) {
      P.bindEvent('cl-note-edit-' + idx, 'click', function(e) {
        var btn = e.currentTarget;
        var ln = parseInt(btn.getAttribute('data-line'), 10);
        // Switch to note selection (selection.setSelected triggers synchronous renderProps via init callback)
        window.MA.selection.setSelected([{ type: 'note', id: btn.getAttribute('data-id'), line: ln }]);
      });
      P.bindEvent('cl-note-del-' + idx, 'click', function(e) {
        var btn = e.currentTarget;
        var sl = parseInt(btn.getAttribute('data-line'), 10);
        var el = parseInt(btn.getAttribute('data-end'), 10);
        window.MA.history.pushHistory();
        ctx.setMmdText(deleteNote(ctx.getMmdText(), sl, el));
        ctx.onUpdate();
      });
    });

    P.bindEvent('cl-add-note-btn', 'click', function() {
      var f = document.getElementById('cl-add-note-form');
      f.innerHTML =
        P.selectFieldHtml('Position', 'cl-new-npos', [
          { value: 'left', label: 'Left', selected: true },
          { value: 'right', label: 'Right' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
        ]) +
        '<div style="margin-bottom:6px;">' +
          '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label>' +
          '<textarea id="cl-new-ntext" style="width:100%;min-height:50px;"></textarea>' +
        '</div>' +
        P.primaryButtonHtml('cl-new-nadd', '+ 追加');
      P.bindEvent('cl-new-nadd', 'click', function() {
        var pos = document.getElementById('cl-new-npos').value;
        var txt = document.getElementById('cl-new-ntext').value || '';
        window.MA.history.pushHistory();
        ctx.setMmdText(addNote(ctx.getMmdText(), element.id, pos, txt));
        ctx.onUpdate();
      });
    });
  }

  function _renderEnumEdit(element, parsedData, propsEl, ctx, opts) {
    var P = window.MA.properties;
    var GP = window.MA.groupPlace;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Enum (L' + element.line + ')</label>' +
        P.fieldHtml('Alias (id)', 'cl-edit-id', element.id) +
        P.fieldHtml('Stereotype', 'cl-edit-stereo', element.stereotype || '') +
        P.primaryButtonHtml('cl-edit-apply', '変更を反映') +
        '<button id="cl-delete" style="margin-left:8px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        GP.editFieldHtml('cl-edit', parsedData.groups, element.line) +
      '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Values</label>';
    (element.members || []).forEach(function(v) {
      html += '<div style="font-size:11px;margin:3px 0;">• ' + window.MA.htmlUtils.escHtml(v.name) +
              ' <button class="cl-mem-del" data-line="' + v.line + '" style="background:var(--accent-red);color:#fff;border:none;padding:2px 6px;font-size:10px;border-radius:3px;cursor:pointer;">✕</button></div>';
    });
    html += P.fieldHtml('新しい値', 'cl-add-val-name', '', '例: PURPLE') +
            P.primaryButtonHtml('cl-add-val', '+ Value 追加') +
            '</div>';
    propsEl.innerHTML = html;
    GP.bindEdit('cl-edit', parsedData.groups, element.line, ctx);

    P.bindEvent('cl-edit-apply', 'click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var newId = document.getElementById('cl-edit-id').value.trim();
      var newStereo = document.getElementById('cl-edit-stereo').value.trim() || null;
      if (newId !== element.id) t = updateClass(t, element.line, 'id', newId);
      if (newStereo !== element.stereotype) t = updateClass(t, element.line, 'stereotype', newStereo);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('cl-delete', 'click', function() {
      if (!confirm('このクラスと紐付く note も削除します。続行しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteClassWithNotes(ctx.getMmdText(), element.id));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
    P.bindEvent('cl-add-val', 'click', function() {
      var name = document.getElementById('cl-add-val-name').value.trim();
      if (!name) { alert('値 必須'); return; }
      window.MA.history.pushHistory();
      ctx.setMmdText(addEnumValue(ctx.getMmdText(), element.line, name));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'cl-mem-del', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteMember(ctx.getMmdText(), ln));
      ctx.onUpdate();
    });
  }

  // 関係の From/To を「親/子」「全体/部分」のように呼ぶ (BLK-junior-20260908-1203)。
  // 呼び名の表は relation-roles が持ち、ここは見出しと 1 行の下書きに使うだけ。
  function _roleSelectHtml(id, side, kind, opts) {
    var esc = window.MA.htmlUtils.escHtml;
    var optsHtml = '';
    for (var i = 0; i < opts.length; i++) {
      optsHtml += '<option value="' + esc(opts[i].value) + '"'
        + (opts[i].selected ? ' selected' : '') + '>' + esc(opts[i].label) + '</option>';
    }
    return '<div style="margin-bottom:8px;">' +
      '<label id="' + id + '-label" style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">'
        + esc(window.MA.relationRoles.fieldLabel(kind, side)) + '</label>' +
      '<select id="' + id + '" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:3px;font-size:12px;">'
        + optsHtml + '</select>' +
    '</div>';
  }

  function _bindRelationRoles() {
    var kindEl = document.getElementById('cl-tail-rkind');
    var fromEl = document.getElementById('cl-tail-from');
    var toEl = document.getElementById('cl-tail-to');
    var fromLabel = document.getElementById('cl-tail-from-label');
    var toLabel = document.getElementById('cl-tail-to-label');
    var prevEl = document.getElementById('cl-tail-rpreview');
    if (!kindEl || !fromEl || !toEl) return;

    function refresh() {
      var k = kindEl.value;
      if (fromLabel) fromLabel.textContent = window.MA.relationRoles.fieldLabel(k, 'from');
      if (toLabel) toLabel.textContent = window.MA.relationRoles.fieldLabel(k, 'to');
      if (prevEl) prevEl.textContent = window.MA.relationRoles.preview(k, fromEl.value, toEl.value);
    }
    kindEl.addEventListener('change', refresh);
    fromEl.addEventListener('change', refresh);
    toEl.addEventListener('change', refresh);
    var swap = document.getElementById('cl-tail-rswap');
    if (swap) {
      swap.addEventListener('click', function() {
        var tmp = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = tmp;
        refresh();
      });
    }
    refresh();
  }

  function _renderRelationEdit(relation, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var RC = window.MA.relationKindCards;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">RELATION (L' + relation.line + ')</label>' +
        // design 3c: 関係の種類は記法ではなく「UML 名称 + 意味の説明」のカードで選ぶ
        RC.cardsHtml('cl-rel-card', RC.kindsOf('class'), relation.kind) +
        // BLK-junior-20260908-1203: 追加フォームと同じ呼び名で出す。既にある関係を
        // 直すときも、親子のどちらを触っているかが見出しから読める。
        P.fieldHtml(window.MA.relationRoles.fieldLabel(relation.kind, 'from'), 'cl-rel-from', relation.from) +
        '<button id="cl-rel-swap" type="button" style="font-size:11px;padding:4px 10px;margin:4px 0;cursor:pointer;">⇄ From/To 入替</button>' +
        P.fieldHtml(window.MA.relationRoles.fieldLabel(relation.kind, 'to'), 'cl-rel-to', relation.to) +
        P.fieldHtml('Label', 'cl-rel-label', relation.label || '') +
        P.relationOptionsFor('cl-rel-more', ctx.getMmdText(), relation.line) +
        P.primaryButtonHtml('cl-rel-apply', '変更を反映') +
        ' <button id="cl-rel-delete" type="button" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
        // BLK-junior-20260909-0703-wish: 手本の矢印から種類を選び直さずに同じ関連を引く。
        '<button id="cl-rel-same" type="button" style="width:100%;margin-top:8px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">⇢ この関連と同じものを引く</button>' +
      '</div>';
    propsEl.innerHTML = html;

    P.bindEvent('cl-rel-same', 'click', function() {
      _showSameRelationModal(relation, parsedData, ctx);
    });

    // design 3c: 細かい指定は「その他の設定」に畳み、押した時点で DSL へ反映する。
    P.bindRelationOptionsFor('cl-rel-more', relation.line, ctx);

    // FEAT-139 (resolves HFR-076): 種別だけはカードを押した時点で即時反映する。
    // 処理を二重に書かないよう、種別更新をここへ切り出す。
    // 🔴 From / To / Label は自由入力であり、誤爆と履歴汚染を避けるため即時反映しない。
    function _applyRelationKind(newKind) {
      if (newKind === relation.kind) return false;   // 値が変わらないなら DSL も履歴も触らない
      window.MA.history.pushHistory();               // DSL 書換の直前に 1 回だけ
      ctx.setMmdText(updateRelation(ctx.getMmdText(), relation.line, 'kind', newKind));
      relation.kind = newKind;                       // 「変更を反映」での二重適用を防ぐ
      ctx.onUpdate();
      return true;
    }

    RC.bindCards(propsEl, 'cl-rel-card', function(newKind) {
      _applyRelationKind(newKind);
    });
    P.bindEvent('cl-rel-apply', 'click', function() {
      var newFrom = document.getElementById('cl-rel-from').value.trim();
      var newTo = document.getElementById('cl-rel-to').value.trim();
      var newLabel = document.getElementById('cl-rel-label').value.trim() || null;
      // 種別はカードで反映済みなので、実際に変わる項目が無ければ履歴も積まない。
      if (newFrom === relation.from && newTo === relation.to && newLabel === relation.label) return;
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      if (newFrom !== relation.from) t = updateRelation(t, relation.line, 'from', newFrom);
      if (newTo !== relation.to) t = updateRelation(t, relation.line, 'to', newTo);
      if (newLabel !== relation.label) t = updateRelation(t, relation.line, 'label', newLabel);
      ctx.setMmdText(t);
      ctx.onUpdate();
    });
    P.bindEvent('cl-rel-swap', 'click', function() {
      var f = document.getElementById('cl-rel-from');
      var to = document.getElementById('cl-rel-to');
      var tmp = f.value; f.value = to.value; to.value = tmp;
    });
    P.bindEvent('cl-rel-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), relation.line));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderNoteEdit(note, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Note (target: ' + note.targetId + ', L' + note.line + ')</div>' +
      // BLK-human-20260916-0900: 置いた後でも対象と上下の順を変えられる (シーケンス図と揃える)。
      P.selectFieldHtml('対象 (Target)', 'cl-note-target', (parsedData.elements || []).filter(function(e) { return e.id; }).map(function(e) {
        return { value: e.id, label: e.id, selected: e.id === note.targetId };
      })) +
      '<div style="margin-bottom:8px;display:flex;gap:4px;align-items:center;"><span style="font-size:10px;color:var(--text-secondary);">上下の順</span>' +
        '<button id="cl-note-up" type="button" style="font-size:11px;padding:2px 8px;cursor:pointer;">↑ 上へ</button>' +
        '<button id="cl-note-down" type="button" style="font-size:11px;padding:2px 8px;cursor:pointer;">↓ 下へ</button></div>' +
      P.selectFieldHtml('Position', 'cl-note-pos', [
        { value: 'left', label: 'Left', selected: note.position === 'left' },
        { value: 'right', label: 'Right', selected: note.position === 'right' },
        { value: 'top', label: 'Top', selected: note.position === 'top' },
        { value: 'bottom', label: 'Bottom', selected: note.position === 'bottom' },
      ]) +
      '<div style="margin-bottom:6px;">' +
        '<label style="display:block;font-size:10px;color:var(--text-secondary);">Text</label>' +
        '<textarea id="cl-note-text" style="width:100%;min-height:80px;">' + (note.text || '').replace(/[<>&]/g, '') + '</textarea>' +
      '</div>' +
      P.primaryButtonHtml('cl-note-update', '更新') +
      P.primaryButtonHtml('cl-note-delete', '✕ 削除');
    propsEl.innerHTML = html;

    var _clApply = function() {
      var pos = document.getElementById('cl-note-pos').value;
      var txt = document.getElementById('cl-note-text').value;
      var tgEl = document.getElementById('cl-note-target');
      window.MA.history.pushHistory();
      ctx.setMmdText(updateNote(ctx.getMmdText(), note.line, note.endLine, { position: pos, targetId: tgEl ? tgEl.value : null, text: txt }));
      ctx.onUpdate();
    };
    P.bindEvent('cl-note-update', 'click', _clApply);
    P.bindEvent('cl-note-pos', 'change', _clApply);
    P.bindEvent('cl-note-target', 'change', _clApply);
    [['cl-note-up', -1], ['cl-note-down', 1]].forEach(function(pair) {
      P.bindEvent(pair[0], 'click', function() {
        var moved = window.MA.noteEdit.moveBlock(ctx.getMmdText(), note.line, note.endLine, pair[1]);
        if (!moved) return;
        window.MA.history.pushHistory();
        ctx.setMmdText(moved.text);
        var np = (parse(moved.text).notes || []).filter(function(n) { return n.line === moved.line; })[0];
        if (np) window.MA.selection.setSelected([{ type: 'note', id: np.id, line: np.line }]);
        ctx.onUpdate();
      });
    });
    P.bindEvent('cl-note-delete', 'click', function() {
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteNote(ctx.getMmdText(), note.line, note.endLine));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderGroupReadOnly(group, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var html =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class Diagram</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">' +
        (group.kind === 'namespace' ? 'NAMESPACE' : 'PACKAGE') +
        ' (L' + group.startLine + '-' + group.endLine + ')</label>' +
        P.fieldHtml('Label', 'cl-grp-label', group.label) +
        P.primaryButtonHtml('cl-grp-apply', '変更を反映') +
        ' <button id="cl-grp-delete" style="background:var(--accent-red);color:#fff;border:none;padding:6px 10px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 境界削除</button>' +
      '</div>';
    propsEl.innerHTML = html;
    P.bindEvent('cl-grp-apply', 'click', function() {
      var newLabel = document.getElementById('cl-grp-label').value.trim();
      if (!newLabel) { alert('Label 必須'); return; }
      window.MA.history.pushHistory();
      var lines = ctx.getMmdText().split('\n');
      var openIdx = group.startLine - 1;
      var indent = lines[openIdx].match(/^(\s*)/)[1];
      lines[openIdx] = indent + (group.kind === 'namespace' ? fmtNamespace(newLabel) : fmtPackage(newLabel));
      ctx.setMmdText(lines.join('\n'));
      ctx.onUpdate();
    });
    P.bindEvent('cl-grp-delete', 'click', function() {
      if (!confirm('この境界を削除しますか？(中身は保持)')) return;
      window.MA.history.pushHistory();
      var lines = ctx.getMmdText().split('\n');
      lines.splice(group.endLine - 1, 1);
      lines.splice(group.startLine - 1, 1);
      ctx.setMmdText(lines.join('\n'));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  function _renderMultiSelectConnect(selData, parsedData, propsEl, ctx) {
    var P = window.MA.properties;
    var allElements = (parsedData.elements || []);
    var nameById = {};
    var typeById = {};
    allElements.forEach(function(e) { nameById[e.id] = e.label || e.id; typeById[e.id] = e.kind; });
    var fromOpt = nameById[selData[0].id] || selData[0].id;
    var toOpt = nameById[selData[1].id] || selData[1].id;

    propsEl.innerHTML =
      '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Class - Connect 2 elements</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
        '<div style="margin:8px 0;">' +
          'From: <strong id="cl-conn-from">' + window.MA.htmlUtils.escHtml(fromOpt) + '</strong> ' +
          '<button id="cl-conn-swap" type="button">⇄ swap</button> ' +
          'To: <strong id="cl-conn-to">' + window.MA.htmlUtils.escHtml(toOpt) + '</strong>' +
        '</div>' +
        P.selectFieldHtml('Kind', 'cl-conn-kind', [
          { value: 'association',    label: 'Association (--)', selected: true },
          { value: 'inheritance',    label: 'Inheritance (<|--, parent <|-- child)' },
          { value: 'implementation', label: 'Implementation (<|.., interface <|.. class)' },
          { value: 'composition',    label: 'Composition (*--, container *-- contained)' },
          { value: 'aggregation',    label: 'Aggregation (o--, container o-- part)' },
          { value: 'nested',         label: 'Nested (+--, outer +-- inner)' },
          { value: 'dependency',     label: 'Dependency (..>)' },
        ]) +
        P.fieldHtml('Label', 'cl-conn-label', '', '任意') +
        P.primaryButtonHtml('cl-conn-create', '+ Connect') +
      '</div>';

    var swapped = false;
    function _doSwap() {
      swapped = !swapped;
      var f = document.getElementById('cl-conn-from');
      var to = document.getElementById('cl-conn-to');
      var tmp = f.textContent; f.textContent = to.textContent; to.textContent = tmp;
    }
    P.bindEvent('cl-conn-swap', 'click', _doSwap);

    P.bindEvent('cl-conn-kind', 'change', function() {
      var k = document.getElementById('cl-conn-kind').value;
      if (k !== 'implementation') return;
      var fromId = swapped ? selData[1].id : selData[0].id;
      var fromType = typeById[fromId];
      if (fromType !== 'interface') {
        var otherId = swapped ? selData[0].id : selData[1].id;
        if (typeById[otherId] === 'interface') _doSwap();
      }
    });

    P.bindEvent('cl-conn-create', 'click', function() {
      window.MA.history.pushHistory();
      var fromId = swapped ? selData[1].id : selData[0].id;
      var toId = swapped ? selData[0].id : selData[1].id;
      var kind = document.getElementById('cl-conn-kind').value;
      var label = document.getElementById('cl-conn-label').value.trim() || null;
      ctx.setMmdText(addRelation(ctx.getMmdText(), kind, fromId, toId, label));
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

  return {
    type: 'plantuml-class',
    displayName: 'Class',
    parse: parse,
    template: template,
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

      function _entityBBox(g) {
        if (!g) return null;
        if (typeof g.getBBox === 'function') {
          try { var bb = g.getBBox(); if (bb && (bb.width > 0 || bb.height > 0)) return bb; }
          catch (e) { /* jsdom fallback */ }
        }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var found = false;
        Array.prototype.forEach.call(g.querySelectorAll('ellipse, rect, text'), function(el) {
          var x, y, w, h;
          if (el.tagName.toLowerCase() === 'rect') {
            x = parseFloat(el.getAttribute('x')) || 0;
            y = parseFloat(el.getAttribute('y')) || 0;
            w = parseFloat(el.getAttribute('width')) || 0;
            h = parseFloat(el.getAttribute('height')) || 0;
          } else if (el.tagName.toLowerCase() === 'ellipse') {
            var cx = parseFloat(el.getAttribute('cx')) || 0;
            var cy = parseFloat(el.getAttribute('cy')) || 0;
            var rx = parseFloat(el.getAttribute('rx')) || 0;
            var ry = parseFloat(el.getAttribute('ry')) || 0;
            x = cx - rx; y = cy - ry; w = rx * 2; h = ry * 2;
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

      function _polygonBBox(p) {
        if (!p) return null;
        if (typeof p.getBBox === 'function') {
          try { var bb = p.getBBox(); if (bb && (bb.width > 0 || bb.height > 0)) return bb; }
          catch (e) { /* jsdom fallback */ }
        }
        var raw = (p.getAttribute('points') || '').trim();
        if (!raw) return null;
        var pts = raw.split(/\s+/);
        var pminX = Infinity, pminY = Infinity, pmaxX = -Infinity, pmaxY = -Infinity;
        var ok = false;
        pts.forEach(function(pt) {
          var xy = pt.split(',');
          if (xy.length !== 2) return;
          var x = parseFloat(xy[0]); var y = parseFloat(xy[1]);
          if (isNaN(x) || isNaN(y)) return;
          ok = true;
          if (x < pminX) pminX = x;
          if (y < pminY) pminY = y;
          if (x > pmaxX) pmaxX = x;
          if (y > pmaxY) pmaxY = y;
        });
        if (!ok) return null;
        return { x: pminX, y: pminY, width: pmaxX - pminX, height: pmaxY - pminY };
      }

      var matched = { class: 0, interface: 0, abstract: 0, enum: 0, struct: 0, annotation: 0, relation: 0, package: 0 };

      var usedG = [];
      (parsedData.elements || []).forEach(function(el) {
        // BLK-migrator-20260918-0049: package / namespace の中の要素は `BSW..GpioDriver` /
        // `App.MainTask` のように修飾名で描かれる。末尾が `.{id}` のものがちょうど 1 つならそれ。
        var g = OB.findEntityByName(svgEl, el.id);
        if (!g) return;
        usedG.push(g);
        var bb = _entityBBox(g);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 6, bb.y - 6, bb.width + 12, bb.height + 12, {
          'data-type': el.kind,
          'data-id': el.id,
          'data-line': el.line,
        });
        matched[el.kind]++;

        // Member rects: one per class member, mapped to <text> lines after header
        if (el.members && el.members.length > 0) {
          var lines = OB.extractMultiLineTextBBoxes(g);
          // 区切り線の文字は、その下のメンバーより後に SVG へ書かれる。上から見た順に並べ直す。
          lines = lines.map(function(l, k) { return { l: l, k: k }; }).sort(function(p, q) {
            return (p.l.bbox.y - q.l.bbox.y) || (p.k - q.k);
          }).map(function(o) { return o.l; });
          // Header skip count: 1 (label) + (stereotype ? 1 : 0) + (generics ? 1 : 0)
          var headerSkip = 1;
          if (el.stereotype) headerSkip++;
          if (el.generics && el.generics.length > 0) headerSkip++;
          var memberLines = lines.slice(headerSkip);
          // 文字を挟んだ区切り線 (`..private..`) の行は飛ばしてメンバーに当てる。
          var seps = el.labelledSeparators || [];
          var slotOf = function(k) {
            var n = 0;
            for (var si = 0; si < seps.length; si++) if (seps[si] <= k) n++;
            return k + n;
          };
          // BLK-migrator-20260918-0049: `hide ... fields` で隠したメンバーは描かれない。
          // 描かれているものだけを順に当て、data-id / data-line は元の並びの番号を保つ。
          var shown = [];
          el.members.forEach(function(m, k) { if (!m.hidden) shown.push({ m: m, i: k }); });
          var matchCount = 0;
          while (matchCount < shown.length && slotOf(matchCount) < memberLines.length) matchCount++;
          for (var si2 = 0; si2 < matchCount; si2++) {
            var ml = memberLines[slotOf(si2)];
            var mem = shown[si2].m;
            var mi = shown[si2].i;
            var mbb = ml.bbox;
            var rectW = mbb.width || 80;
            OB.addRect(overlayEl, mbb.x, mbb.y, rectW, mbb.height || 14, {
              'data-type': 'member',
              'data-id': el.id + '::__m_' + mi,
              'data-parent-id': el.id,
              'data-parent-kind': el.kind,
              'data-member-index': String(mi),
              'data-member-kind': mem.kind,
              'data-line': String(mem.line),
            });
          }
          if (matchCount !== shown.length && typeof console !== 'undefined' && console.warn) {
            console.warn('[class.buildOverlay] member line mismatch for ' + el.id +
              ': model=' + shown.length + ' svg=' + memberLines.length);
          }
        }
      });

      // package + namespace
      // BLK-migrator-20260923-1909: 並び順でなく開始行・表示名で当てる。
      var packages = (parsedData.groups || []);
      var pkgGroups = OB.matchClusters(svgEl, packages);
      for (var pi = 0; pi < packages.length; pi++) {
        var pg = pkgGroups[pi];
        if (!pg) continue;
        usedG.push(pg);
        var pkgRect = pg.querySelector('rect');
        if (!pkgRect) {
          // 枠が rect でなく path / polygon で描かれる package (タブ付き) は外接矩形で囲う。
          var pbb = _entityBBox(pg);
          if (!pbb) {
            try { pbb = pg.getBBox(); } catch (e) { pbb = null; }
          }
          if (!pbb || !(pbb.width > 0)) continue;
          OB.addRect(overlayEl, pbb.x - 2, pbb.y - 2, pbb.width + 4, pbb.height + 4, {
            'data-type': 'package', 'data-id': packages[pi].id, 'data-line': packages[pi].startLine,
          });
          matched.package++;
          continue;
        }
        OB.addRect(overlayEl,
          (parseFloat(pkgRect.getAttribute('x')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('y')) || 0) - 2,
          (parseFloat(pkgRect.getAttribute('width')) || 0) + 4,
          (parseFloat(pkgRect.getAttribute('height')) || 0) + 4, {
            'data-type': 'package',
            'data-id': packages[pi].id,
            'data-line': packages[pi].startLine,
          });
        matched.package++;
      }

      // relations
      var relations = parsedData.relations || [];
      // BLK-migrator-20260923-1909: 線は書かれた行で当てる。並び順で当てていたので、パーサが
      // 読めない線 (`<|-` など) が 1 本あるだけで以後の関係の枠が隣の線にずれた。
      var linkGroups = OB.matchLinksByLine(svgEl, relations);
      for (var ri = 0; ri < relations.length; ri++) {
        var lg = linkGroups[ri];
        if (!lg) continue;
        usedG.push(lg);
        var lineEl = lg.querySelector('line, path');
        if (!lineEl) continue;
        // BLK-human-20260912-2130: ラベル (contains) や多重度 (1 / 0..*) も
        // 同じ関係の当たり判定に入れる。どれを押しても同じ関係が選べる。
        var relAttrs2 = {
          'data-type': 'relation',
          'data-id': relations[ri].id,
          'data-line': relations[ri].line,
          'data-relation-kind': relations[ri].kind,
        };
        if (!OB.addLinkRects(overlayEl, lg, relAttrs2, 8)) {
          var bb2 = OB.extractEdgeBBox(lineEl, 8);
          if (!bb2) continue;
          OB.addRect(overlayEl, bb2.x, bb2.y, bb2.width, bb2.height, relAttrs2);
        }
        matched.relation++;
      }

      // Notes: BLK-migrator-20260918-0049 — note は今の PlantUML では折り返し角を持つ
      // `<path>` を含む `g.entity` として描かれる (5 点 `<polygon>` ではない)。
      // polygon だけを探していたので、どの図でも note に枠が 1 つも出なかった。
      // どの要素にも取られなかった `g.entity` を文書順に note へ当て、
      // それで数が合わないときだけ旧来の 5 点 polygon を見る。
      var notes = parsedData.notes || [];
      if (notes.length > 0) {
        // どの要素にも取られず、かつ note の形 (箱でも丸でもなく折り返し角の path) のものだけ。
        // 引き当てられなかったクラス (ロリポップ表記の interface など) を note と取り違えない。
        var noteGroups = Array.prototype.filter.call(
          svgEl.querySelectorAll('g.entity'), function(ge) {
            if (usedG.indexOf(ge) >= 0) return false;
            return !!ge.querySelector('path') &&
              !ge.querySelector('rect') && !ge.querySelector('ellipse');
          });
        var notePolys = noteGroups;
        var bboxOf = _entityBBox;
        if (notePolys.length !== notes.length) {
          notePolys = [];
          Array.prototype.forEach.call(svgEl.querySelectorAll('polygon'), function(p) {
            var pts = (p.getAttribute('points') || '').trim().split(/\s+/);
            if (pts.length === 5) notePolys.push(p);
          });
          bboxOf = _polygonBBox;
        }
        if (notePolys.length === notes.length) {
          notes.forEach(function(n, idx) {
            var p = notePolys[idx];
            var pg2 = p;
            while (pg2 && pg2.tagName && pg2.tagName.toLowerCase() !== 'g') pg2 = pg2.parentNode;
            if (pg2) usedG.push(pg2);
            var bb = bboxOf(p);
            if (!bb) return;
            OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
              'data-type': 'note',
              'data-id': n.id,
              'data-line': n.line,
              'data-target-id': n.targetId,
            });
          });
        } else if (typeof console !== 'undefined' && console.warn) {
          console.warn('[class.buildOverlay] note shape count mismatch: model=' + notes.length + ' svg=' + notePolys.length);
        }
      }

      // BLK-migrator-20260923-1909: フォームが読めない記法 (`abstract X` / circle / diamond / 題 …) にも
      // 書かれた行を指す枠を置く。
      OB.addUnclaimed(svgEl, overlayEl, usedG);

      // BLK-human-20260912-2130: 小さい当たり判定を手前に。共通実装 (src/core)
      OB.raiseSmallestLast(overlayEl);

      return { matched: matched, unmatched: {} };
    },
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-class'; },
    fmtClass: fmtClass,
    fmtInterface: fmtInterface,
    fmtAbstract: fmtAbstract,
    fmtEnum: fmtEnum,
    fmtRelation: fmtRelation,
    fmtAttribute: fmtAttribute,
    fmtMethod: fmtMethod,
    fmtEnumValue: fmtEnumValue,
    fmtPackage: fmtPackage,
    fmtNamespace: fmtNamespace,
    fmtNote: fmtNote,
    addClass: addClass,
    normalizeIdInput: normalizeIdInput,
    addInterface: addInterface,
    addAbstract: addAbstract,
    addEnum: addEnum,
    addRelation: addRelation,
    addPackage: addPackage,
    addNamespace: addNamespace,
    addNote: addNote,
    updateClass: updateClass,
    updateInterface: updateClass,
    updateAbstract: updateClass,
    updateEnum: updateClass,
    updateRelation: updateRelation,
    updateNote: updateNote,
    deleteNote: deleteNote,
    ensureBlock: ensureBlock,
    changeKind: changeKind,
    addAttribute: addAttribute,
    addMethod: addMethod,
    classNameAt: classNameAt,
    addConstructor: addConstructor,
    addNestedClass: addNestedClass,
    addEnumValue: addEnumValue,
    updateAttribute: updateAttribute,
    updateMethod: updateMethod,
    deleteMember: deleteMember,
    deleteMemberByIndex: deleteMemberByIndex,
    moveMemberUpByIndex: moveMemberUpByIndex,
    moveMemberDownByIndex: moveMemberDownByIndex,
    deleteLine: deleteLine,
    deleteClassWithNotes: deleteClassWithNotes,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    setTitle: setTitle,
    renameWithRefs: renameWithRefs,
  };
})();
