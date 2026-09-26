'use strict';
window.MA = window.MA || {};

// req-trace — 図の要素 (クラス/メソッド/状態/遷移) と設計書の要求 ID
// (SWReq-xxx) の対応。図を作るのと要求 ID を付けるのを 1 回の作業にする。
//
// BLK-junior-20260909-0103-wish: 設計書に貼る資料では、クラス・メソッドの横に
// 対応する要求 ID を書く。今は図を作ったあとで別文書に対応表を手で作り直して
// いて、図と表が二重管理になり、名前を直すと表だけが古くなる。
//
// 対応は DSL 自身に注記行として持つ (`' @req Gpio_Driver.Init() = SWReq-101`)。
// 別ファイルの台帳にすると図を配っただけでは対応が伝わらず、保存・開き直し・
// 版管理の全部に別経路が要る。PlantUML の注記行なので描画には出ず、正本は
// あくまで DSL のまま。書き出しのときだけ脚注 (legend) と対応表に展開する。
//
// DOM・fetch・localStorage には触らない。node からも require できる。
(function() {

  var MARK = "' @req ";
  var MARK_RE = /^\s*'\s*@req\s+(.+?)\s*=\s*(.*)$/;

  // 要求 ID の綴り。ASPICE の SWReq-101 / SYS-12 / REQ_3 のような
  // 「英字の見出し + 区切り + 番号」を受ける。日本語や空白だけの語は
  // 要求 ID ではないので弾く (表に混ざると対応表として読めない)。
  var ID_RE = /^[A-Za-z][A-Za-z0-9]*[-_.][A-Za-z0-9_.-]*[A-Za-z0-9]$/;

  var KIND_LABEL = {
    'class': 'クラス',
    'method': 'メソッド',
    'attribute': '属性',
    'state': '状態',
    'transition': '遷移',
  };

  function _s(v) { return v == null ? '' : String(v); }
  function _lines(dsl) { return _s(dsl).split(/\r?\n/); }

  // ── 要素の取り出し ───────────────────────────────────────────
  // 図種ごとの本体パーサに寄せず、対応表に載る粒度 (クラス・メソッド・属性・
  // 状態・遷移) だけをここで拾う。要素の「鍵」は表と DSL 注記の両方で使うので、
  // 描画名ではなく DSL 上の綴りで作る (title を変えても対応が外れない)。

  var CLASS_RE = /^\s*(?:abstract\s+)?(class|interface|enum)\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.]*)|([A-Za-z0-9_][A-Za-z0-9_.]*))/;
  var METHOD_RE = /^\s*([+\-#~])?\s*(?:\{(?:static|abstract)\}\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?::\s*(.+?))?\s*$/;
  var ATTR_RE = /^\s*([+\-#~])\s*(?:\{(?:static|abstract)\}\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*(.+?))?\s*$/;
  var TRANSITION_RE = /^\s*("[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|\.+>)\s*("[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?::\s*(.*))?$/;
  var STATE_RE = /^\s*state\s+(?:"([^"]+)"\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.]*)|([A-Za-z0-9_][A-Za-z0-9_.]*))/;
  var SKIP_RE = /^\s*(?:@|'|note|end\s|end$|title|header|footer|legend|skinparam|hide|show|scale|caption|participant|actor|package|namespace|together|\})/i;

  function _push(out, seen, el) {
    if (seen[el.key]) return;
    seen[el.key] = true;
    out.push(el);
  }

  // targets(dsl) — 要求 ID を付けられる要素を、DSL に書かれた順に並べる。
  // クラス本体の中の行はそのクラスに属させる (Init() だけでは、どのクラスの
  // Init かが表から分からない)。
  function targets(dsl) {
    var out = [], seen = {};
    var cur = null;      // 直近のクラス (ブロック内のメソッド・属性の持ち主)
    var depth = 0;
    _lines(dsl).forEach(function(raw, i) {
      var line = raw.replace(/\s+$/, '');
      var num = i + 1;
      if (MARK_RE.test(line)) return;
      var m;
      if ((m = line.match(CLASS_RE))) {
        var id = m[3] || m[4];
        var label = m[2] || id;
        cur = id;
        depth = /\{\s*$/.test(line) ? 1 : 0;
        _push(out, seen, { key: id, kind: 'class', label: label, owner: '', line: num });
        return;
      }
      if (/^\s*\}\s*$/.test(line)) { depth = 0; cur = null; return; }
      if ((m = line.match(STATE_RE))) {
        var sid = m[2] || m[3];
        _push(out, seen, { key: sid, kind: 'state', label: m[1] || sid, owner: '', line: num });
        return;
      }
      if ((m = line.match(TRANSITION_RE))) {
        var from = _s(m[1]).replace(/^"|"$/g, '');
        var to = _s(m[2]).replace(/^"|"$/g, '');
        var lbl = _s(m[3]).trim();
        var tkey = from + ' -> ' + to + (lbl ? ' : ' + lbl : '');
        _push(out, seen, {
          key: tkey, kind: 'transition',
          label: lbl || (from + ' → ' + to), owner: '', line: num,
        });
        return;
      }
      if (SKIP_RE.test(line)) return;
      if (cur && depth > 0) {
        if ((m = line.match(METHOD_RE))) {
          var mk = cur + '.' + m[2] + '()';
          _push(out, seen, {
            key: mk, kind: 'method', label: m[2] + '(' + _s(m[3]).trim() + ')',
            owner: cur, line: num,
          });
          return;
        }
        if ((m = line.match(ATTR_RE))) {
          _push(out, seen, {
            key: cur + '.' + m[2], kind: 'attribute', label: m[2], owner: cur, line: num,
          });
        }
      }
    });
    return out;
  }

  // ── 注記の読み書き ───────────────────────────────────────────

  // normalizeIds(text) — 入力欄の文字列を要求 ID の並びにする。
  // 読点・カンマ・空白のどれで区切っても同じに読む (現場の書式が揃っていない)。
  function normalizeIds(text) {
    var out = [];
    _s(text).split(/[,、\s;／\/]+/).forEach(function(t) {
      var v = t.trim();
      if (!v || !ID_RE.test(v)) return;
      if (out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  // invalidIds(text) — 要求 ID として読めなかった語。捨てたことを黙っていると
  // 「入れたのに表に出ない」になるので、画面で名指しする。
  function invalidIds(text) {
    var out = [];
    _s(text).split(/[,、\s;／\/]+/).forEach(function(t) {
      var v = t.trim();
      if (!v || ID_RE.test(v)) return;
      if (out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  // parse(dsl) — 注記行から「要素の鍵 → 要求 ID の並び」。
  function parse(dsl) {
    var map = {};
    _lines(dsl).forEach(function(line) {
      var m = line.match(MARK_RE);
      if (!m) return;
      var key = m[1].trim();
      if (!key) return;
      var ids = normalizeIds(m[2]);
      if (!ids.length) { delete map[key]; return; }
      map[key] = ids;
    });
    return map;
  }

  function idsOf(dsl, key) {
    var map = parse(dsl);
    return map[_s(key).trim()] || [];
  }

  function _markLine(key, ids) { return MARK + key + ' = ' + ids.join(', '); }

  // setIds(dsl, key, ids) — 1 要素の対応を書き換える。注記は @enduml の直前に
  // まとめて置く (要素行の隣に散らすと、行を並べ替えたときに注記だけが残る)。
  // 空にすると行ごと消える。
  function setIds(dsl, key, ids) {
    var k = _s(key).trim();
    if (!k) return _s(dsl);
    var list = Array.isArray(ids) ? normalizeIds(ids.join(',')) : normalizeIds(ids);
    var lines = _lines(dsl);
    var out = [], done = false;
    lines.forEach(function(line) {
      var m = line.match(MARK_RE);
      if (m && m[1].trim() === k) {
        if (!done && list.length) { out.push(_markLine(k, list)); done = true; }
        return;   // 同じ鍵の重複行は 1 本にまとめる
      }
      out.push(line);
    });
    if (!done && list.length) {
      var at = -1;
      for (var i = out.length - 1; i >= 0; i--) {
        if (/^\s*@enduml/i.test(out[i])) { at = i; break; }
      }
      if (at < 0) out.push(_markLine(k, list));
      else out.splice(at, 0, _markLine(k, list));
    }
    return out.join('\n');
  }

  // ── 対応表 ───────────────────────────────────────────────────

  // rows(dsl) — 画面と対応表に出す行。要素の順のまま、付いていないものも出す
  // (「付け忘れがどれか」が表を見ただけで分かること)。DSL から消えた要素に
  // 付いたままの対応も末尾に残す (名前を変えたときに黙って落ちない)。
  function rows(dsl) {
    var map = parse(dsl);
    var used = {};
    var out = targets(dsl).map(function(t) {
      var ids = map[t.key] || [];
      used[t.key] = true;
      return {
        key: t.key, kind: t.kind, kindLabel: KIND_LABEL[t.kind] || t.kind,
        label: t.label, owner: t.owner, line: t.line,
        ids: ids, status: ids.length ? 'assigned' : 'none',
      };
    });
    Object.keys(map).forEach(function(k) {
      if (used[k]) return;
      out.push({
        key: k, kind: 'orphan', kindLabel: '図に無い', label: k, owner: '', line: 0,
        ids: map[k], status: 'orphan',
      });
    });
    return out;
  }

  function assignedRows(list) {
    return (Array.isArray(list) ? list : []).filter(function(r) { return r.ids && r.ids.length; });
  }

  // summary(rows) — 何件付いていて、何件残っているか。書き出す前に読む 1 行。
  function summary(list) {
    var all = (Array.isArray(list) ? list : []).filter(function(r) { return r.status !== 'orphan'; });
    var orphan = (Array.isArray(list) ? list : []).filter(function(r) { return r.status === 'orphan'; });
    if (!all.length && !orphan.length) return '要求 ID を付けられる要素がありません。';
    var done = all.filter(function(r) { return r.ids.length; }).length;
    var msg = all.length + ' 要素中 ' + done + ' 要素に要求 ID が付いています';
    if (done < all.length) msg += '（残り ' + (all.length - done) + ' 要素）';
    if (orphan.length) msg += '／図に無い要素への対応が ' + orphan.length + ' 件あります';
    return msg;
  }

  // tableFilename(name) — 対応表のファイル名。画像と並べて置くので、
  // 画像と同じ題名の後ろに用途を付ける。
  function tableFilename(name) {
    var base = _s(name).replace(/\.[A-Za-z0-9]+$/, '').trim();
    return (base || '図') + '_要求対応表.csv';
  }

  function _csvCell(v) {
    var s = _s(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // tableCsv(rows, title) — 設計書に貼る対応表。Excel で開くので CSV。
  // 付いていない要素も空欄で残す (表から消すと、付け忘れが表に出ない)。
  function tableCsv(list, title) {
    var head = ['図', '種別', '要素', '要求ID'];
    var out = [head.map(_csvCell).join(',')];
    (Array.isArray(list) ? list : []).forEach(function(r) {
      out.push([
        _s(title), r.kindLabel,
        (r.owner ? r.owner + '.' : '') + r.label,
        (r.ids || []).join(' '),
      ].map(_csvCell).join(','));
    });
    return out.join('\r\n') + '\r\n';
  }

  // footnoteLines(rows) — 画像の脚注に出す行。対応の付いた要素だけを出す
  // (空欄まで図に焼くと、脚注が図より大きくなる)。
  function footnoteLines(list) {
    return assignedRows(list).map(function(r) {
      return (r.owner ? r.owner + '.' : '') + r.label + ' : ' + r.ids.join(', ');
    });
  }

  // applyFootnote(dsl, rows) — 脚注 (legend) を差し込んだ DSL。書き出しのときだけ
  // 使う一時の DSL で、正本には残さない。既に同じ脚注があれば差し替える。
  function applyFootnote(dsl, list) {
    var text = stripFootnote(dsl);
    var body = footnoteLines(list);
    if (!body.length) return text;
    var block = ['legend bottom', "' --- 要求ID対応 (req-trace) ---", '要求ID対応']
      .concat(body).concat(['endlegend']);
    var lines = text.split('\n');
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml/i.test(lines[i])) {
        lines.splice.apply(lines, [i, 0].concat(block));
        return lines.join('\n');
      }
    }
    return lines.concat(block).join('\n');
  }

  // stripFootnote(dsl) — 前に差し込んだ脚注を取り除く。
  function stripFootnote(dsl) {
    var out = [], skip = false;
    _lines(dsl).forEach(function(line, i, all) {
      if (!skip && /^\s*legend\b/i.test(line)) {
        var next = _s(all[i + 1]);
        if (/@req|要求ID対応 \(req-trace\)/.test(next)) { skip = true; return; }
      }
      if (skip) {
        if (/^\s*endlegend/i.test(line)) skip = false;
        return;
      }
      out.push(line);
    });
    return out.join('\n');
  }

  // plan(dsl, name) — 「画像と一緒に確定するもの」を押す前に読める形にする。
  function plan(dsl, name) {
    var list = rows(dsl);
    return {
      title: _s(name).replace(/\.[A-Za-z0-9]+$/, ''),
      rows: list,
      assigned: assignedRows(list).length,
      total: list.filter(function(r) { return r.status !== 'orphan'; }).length,
      filename: tableFilename(name),
      summary: summary(list),
    };
  }

  function planText(p) {
    if (!p || !p.total) return '要求 ID を付けられる要素がありません。';
    if (!p.assigned) return '要求 ID がまだ 1 件も付いていません。付けてから書き出すと対応表になります。';
    return p.filename + ' に ' + p.assigned + ' 要素ぶんの対応表を書き出します（脚注にも入れられます）';
  }

  function doneMessage(p) {
    if (!p) return '対応表を書き出せませんでした';
    return '' + p.filename + ' に ' + p.assigned + ' 要素の要求 ID 対応表を書き出しました';
  }

  var api = {
    MARK: MARK,
    KIND_LABEL: KIND_LABEL,
    targets: targets,
    normalizeIds: normalizeIds,
    invalidIds: invalidIds,
    parse: parse,
    idsOf: idsOf,
    setIds: setIds,
    rows: rows,
    assignedRows: assignedRows,
    summary: summary,
    tableFilename: tableFilename,
    tableCsv: tableCsv,
    footnoteLines: footnoteLines,
    applyFootnote: applyFootnote,
    stripFootnote: stripFootnote,
    plan: plan,
    planText: planText,
    doneMessage: doneMessage,
  };
  window.MA.reqTrace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
