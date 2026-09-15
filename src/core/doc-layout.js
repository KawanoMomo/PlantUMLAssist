'use strict';
window.MA = window.MA || {};

// doc-layout — 資料セットを「貼る前の 1 枚物」として組む。
//
// BLK-primary-20260916-0100-wish: 資料セットは登録して zip で書き出すところまでは
// GUI で完結するが、実際に提案書やレビュー資料へ貼るときに要る
// 「どの順で並べるか」「各図にどんな見出し・1 行説明を添えるか」は zip を
// 開いた後に資料側のツールで手作業だった。順序を変えたい・説明を足したいと
// 気付くのが貼り込んだ後なので、毎回そこで手戻りが出る。
//
// 図の並びと、図に添える見出し・1 行説明は、資料の体裁であって図の中身ではない。
// だから DSL には書かず、資料セットの持ち物として保存フォルダ側に置く
// (図を書き換えずに資料の体裁だけ直せる。同じ図を別の資料に別の見出しで出せる)。
//
// ここは体裁の組み立てと突き合わせだけを持つ。保存は server、描画は app.js の職掌。
window.MA.docLayout = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _line(v) { return _s(v).replace(/[\r\n]+/g, ' ').trim(); }

  // 見出しと 1 行説明は資料に載る文なので、改行は畳んで 1 行に保つ
  // (複数行を許すと目次の 1 行が崩れ、貼った先で体裁が壊れる)。
  function normalizeItem(it) {
    var name = _line(it && (typeof it === 'string' ? it : it.name));
    return { name: name,
             heading: _line(it && it.heading),
             note: _line(it && it.note) };
  }

  // items(set) — 図の並び順そのままに {name, heading, note} を揃える。
  // 並びの正本は docs (資料に貼る順)。items は名前で引く添え物なので、
  // docs に無い item は落とし、items に無い図は空の見出し・説明で並べる
  // (図を足したときに体裁だけ消えるより、空欄で出て埋めさせる方が早い)。
  function items(set) {
    var DS = window.MA.docSet;
    var docs = DS ? DS.normalizeDocs(set && set.docs) : [];
    var by = {};
    ((set && set.items) || []).forEach(function(it) {
      var n = normalizeItem(it);
      if (n.name) by[n.name] = n;
    });
    return docs.map(function(n) {
      var it = by[n];
      return { name: n, heading: it ? it.heading : '', note: it ? it.note : '' };
    });
  }

  // 保存用。docs を並び順の正本にし、見出しも説明も空の図は items に残さない
  // (空の行を溜めると、何を書いたのか差分で読めなくなる)。
  function toSaved(rows) {
    var list = (rows || []).map(normalizeItem).filter(function(it) { return it.name; });
    var seen = {};
    var docs = [];
    var out = [];
    list.forEach(function(it) {
      if (seen[it.name]) return;
      seen[it.name] = true;
      docs.push(it.name);
      if (it.heading || it.note) out.push(it);
    });
    return { docs: docs, items: out };
  }

  // move(rows, index, delta) — 1 つ上/下へ。端は動かさない
  // (端で押しても黙って何も起きない方が、巻き戻って驚くより読みやすい)。
  function move(rows, index, delta) {
    var list = (rows || []).slice();
    var to = index + delta;
    if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
    var moved = list.splice(index, 1)[0];
    list.splice(to, 0, moved);
    return list;
  }

  function setField(rows, index, field, value) {
    var list = (rows || []).map(function(r) { return normalizeItem(r); });
    if (index < 0 || index >= list.length) return list;
    if (field === 'heading' || field === 'note') list[index][field] = _line(value);
    return list;
  }

  // 目次と図の見出しに出す文字列。見出しが空なら図の名前で代用する
  // (空欄のまま書き出して、貼った先で「無題」が並ぶのを防ぐ)。
  function headingOf(it) {
    var h = _line(it && it.heading);
    return h || _line(it && it.name);
  }

  // sheet(set, folderNames) — 貼る前に見る 1 枚物の中身。
  // 図番号は並び順どおりに 1 から振り直す (資料に貼る番号そのもの)。
  // 保存フォルダに無い図も落とさずに欠けとして並べる。目次から消えると
  // 「何枚のはずだったか」が分からなくなり、また貼ってから気付く形に戻る。
  function sheet(set, folderNames) {
    var DS = window.MA.docSet;
    var have = {};
    (DS ? DS.normalizeDocs(folderNames) : []).forEach(function(n) { have[n] = true; });
    var rows = items(set);
    var entries = rows.map(function(it, i) {
      return { no: i + 1, name: it.name, heading: headingOf(it), note: it.note,
               titled: !!_line(it.heading), present: !!have[it.name] };
    });
    var missing = entries.filter(function(e) { return !e.present; });
    var blank = entries.filter(function(e) { return e.present && !e.note; });
    return { title: _line(set && set.name), entries: entries,
             total: entries.length, present: entries.length - missing.length,
             missing: missing, blank: blank };
  }

  // 書き出す前に読ませる 1 文。欠けと、説明が空の図を先に名指しする
  // (どちらも貼ってから気付くと図の差し替え・書き足しになる)。
  function sheetSummary(sh) {
    var s = sh || {};
    var n = s.total || 0;
    if (!n) return '図が登録されていません';
    var parts = ['全 ' + n + ' 枚'];
    if (s.missing && s.missing.length) {
      parts.push('保存フォルダに無い図 ' + s.missing.length + ' 枚（'
        + s.missing.map(function(e) { return e.name; }).join('、') + '）');
    }
    if (s.blank && s.blank.length) {
      parts.push('1 行説明が空の図 ' + s.blank.length + ' 枚');
    }
    if (parts.length === 1) parts.push('見出しと 1 行説明は全部そろっています');
    return parts.join(' / ');
  }

  function sheetClass(sh) {
    var s = sh || {};
    if (!s.total) return 'dl-empty';
    if (s.missing && s.missing.length) return 'dl-short';
    if (s.blank && s.blank.length) return 'dl-blank';
    return 'dl-ready';
  }

  // 目次の 1 行。資料の目次にそのまま貼れる形にする。
  function tocLine(e) {
    var s = '図' + e.no + ' ' + e.heading;
    if (e.note) s += ' — ' + e.note;
    return s;
  }

  // 資料に貼る側へ渡す 1 枚物のテキスト (zip に同梱し、目次を打ち直さずに済ませる)。
  function sheetText(sh) {
    var s = sh || { entries: [] };
    var out = ['# ' + (s.title || '資料セット'), '', '## 目次', ''];
    s.entries.forEach(function(e) {
      out.push(e.no + '. ' + e.heading + (e.note ? ' — ' + e.note : '')
        + (e.present ? '' : '（保存フォルダに無い）'));
    });
    out.push('', '## 図', '');
    s.entries.forEach(function(e) {
      out.push('### 図' + e.no + ' ' + e.heading);
      if (e.note) out.push('', e.note);
      out.push('', 'ファイル: ' + e.name + '.svg' + (e.present ? '' : '（欠け）'), '');
    });
    return out.join('\n');
  }

  // 書き出す SVG の名前。資料に貼る順で並ぶように図番号を前に付ける
  // (名前順に並ぶフォルダの中で、貼る順を探し直さずに済む)。
  function fileNameOf(e) {
    var no = ('0' + (e && e.no ? e.no : 0)).slice(-2);
    return no + '_' + _line(e && e.name);
  }

  return {
    items: items,
    normalizeItem: normalizeItem,
    toSaved: toSaved,
    move: move,
    setField: setField,
    headingOf: headingOf,
    sheet: sheet,
    sheetSummary: sheetSummary,
    sheetClass: sheetClass,
    tocLine: tocLine,
    sheetText: sheetText,
    fileNameOf: fileNameOf,
  };
})();
