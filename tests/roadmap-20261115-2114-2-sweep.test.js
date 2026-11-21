'use strict';
// TICKET-roadmap-20261115-2114-2: 整理の締め。外した機能の痕跡 (呼ばれないモジュール・使われない CSS 規則・
// 宛先の無い Ctrl+K の行・外した窓の配線・注釈に残った名前) を掃き、戻らないようにする。
// 同じ票で TICKET-owner-20261115-2240-1 (Ctrl+K の「提出前チェックを開く」) も外した。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

function srcFiles() {
  var out = [];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function(f) {
      var p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.js$/.test(f)) out.push({ rel: path.relative(ROOT, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') });
    });
  })(path.join(ROOT, 'src'));
  return out;
}
var SRC = srcFiles();

function styleRanges(html) {
  var out = [], re = /<style[^>]*>([\s\S]*?)<\/style>/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function withoutStyles(html) { return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ''); }

// Ctrl+K の行のうち、押す先 (button: / clickById) が HTML にも src にも宣言されていないもの。
function paletteOrphans(app, html) {
  var i = app.indexOf('function commands()');
  if (i < 0) return ['commands() が無い'];
  var seg = app.slice(i, app.indexOf('\n  }\n', i) > 0 ? app.indexOf('\n  }\n', i) : i + 60000);
  var ids = [], re = /button: '([^']+)'|clickById\('([^']+)'\)/g, m;
  while ((m = re.exec(seg))) ids.push(m[1] || m[2]);
  return ids.filter(function(id) {
    if (html.indexOf('id="' + id + '"') >= 0) return false;
    var decl = new RegExp("\\.id\\s*=\\s*['\"]" + id.replace(/[-]/g, '\\-') + "['\"]");
    return !decl.test(app);
  });
}

// src/core のモジュールのうち、HTML が読み込むのに、定義する window.MA.* をどこからも呼ばないもの。
// connection-mode と formatter-interface は MermaidAssist と共有する DiagramModule の契約の部品として置く。
var CONTRACT = ['src/core/connection-mode.js', 'src/core/formatter-interface.js'];
function deadModules(html, files) {
  var loaded = {};
  (html.match(/<script src="([^"]+)"/g) || []).forEach(function(s) { loaded[s.slice(13, -1)] = true; });
  var defs = {};
  files.forEach(function(f) {
    var names = [], re = /(?:window\.)?MA\.([A-Za-z_$][\w$]*)\s*=(?!=)/g, m;
    while ((m = re.exec(f.text))) if (names.indexOf(m[1]) < 0) names.push(m[1]);
    defs[f.rel] = names;
  });
  var markup = withoutStyles(html);
  var alive = {}, dead = {};
  files.forEach(function(f) {
    if (f.rel.indexOf('src/core/') === 0 && CONTRACT.indexOf(f.rel) < 0 && defs[f.rel].length) dead[f.rel] = true;
    else alive[f.rel] = true;
  });
  var changed = true;
  while (changed) {
    changed = false;
    Object.keys(dead).forEach(function(rel) {
      var used = defs[rel].some(function(n) {
        var re = new RegExp('MA\\.' + n.replace(/\$/g, '\\$') + '\\b');
        if (re.test(markup)) return true;
        return files.some(function(f) { return alive[f.rel] && re.test(f.text); });
      });
      if (used) { delete dead[rel]; alive[rel] = true; changed = true; }
    });
  }
  return Object.keys(dead).filter(function(rel) { return loaded[rel]; }).sort();
}

// <style> の規則のうち、セレクタの id / class が画面にも src にも出てこないもの (どの要素にも当たらない規則)。
// 'cb-' + kind のように組み立てる名前は、接頭辞が引用符の直前にあれば使っているとみなす。
function deadSelectors(html, files) {
  var corpus = withoutStyles(html) + '\n' + files.map(function(f) { return f.text; }).join('\n');
  var memo = {};
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'); }
  function used(t) {
    if (t in memo) return memo[t];
    var ok = new RegExp('(^|[^\\w-])' + esc(t) + '(?![\\w-])').test(corpus);
    for (var i = 1; !ok && i < t.length; i++) {
      if (t[i] !== '-') continue;
      ok = new RegExp('(^|[^\\w-])' + esc(t.slice(0, i + 1)) + "(['\"`]|\\$\\{)").test(corpus);
    }
    memo[t] = ok;
    return ok;
  }
  function selDead(sel) {
    var s = sel.replace(/\[[^\]]*\]/g, ''), prev;
    do { prev = s; s = s.replace(/\([^()]*\)/g, ''); } while (s !== prev);
    var re = /[#.]([A-Za-z_][\w-]*)/g, m;
    while ((m = re.exec(s))) if (!used(m[1])) return m[1];
    return null;
  }
  var out = [];
  styleRanges(html).forEach(function(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""');
    var re = /([^{}]+)\{/g, m;
    while ((m = re.exec(css))) {
      var sel = m[1].trim();
      if (!sel || sel.charAt(0) === '@' || /^(from|to|\d+%)/.test(sel)) continue;
      var parts = sel.split(/,(?![^(]*\))/);
      if (parts.every(function(p) { return selDead(p); })) out.push(sel);
    }
  });
  return out;
}

var GONE_MODULES = ['name-audit', 'note-intent', 'review-before-after', 'show-before-after'];
var GONE_WIRING = ['btn-tab-submit', 'exp-delivery', 'exp-handoff', 'saveExportLog', '/export-log', 'exportLog', 'deliveryZips'];
// 整理表「締めへの申し送り」の語 (外した機能の名前が注釈にだけ残っていたもの)。
var HANDOFF_WORDS = ['突合ボード', 'トレース漏れ', '引き継ぎチェック', '引き継ぎ zip', '納品パッケージ', '会議メモ', '表記統一',
  '統一先', '確かめられず', '指摘から選ぶ', 'review-carry', 'tools/audit', '意図的に省略', '変更サマリ', '申し送り', '顧客に見せる'];

function hits(words) {
  var out = [];
  words.forEach(function(w) {
    if (HTML.indexOf(w) >= 0) out.push(w + ' @ plantuml-assist.html');
    SRC.forEach(function(f) { if (f.text.indexOf(w) >= 0) out.push(w + ' @ ' + f.rel); });
  });
  return out;
}

describe('整理の締め (TICKET-roadmap-20261115-2114-2)', function() {
  test('Ctrl+K の行の押す先は、どれも HTML か src に宣言されている (提出前チェックの行は無い)', function() {
    expect(paletteOrphans(APP, HTML)).toEqual([]);
    expect(APP).not.toContain("id: 'tab-submit'");
  });

  test('外した窓・書き出しの控えを呼ぶ配線が残らない', function() {
    expect(hits(GONE_WIRING)).toEqual([]);
  });

  test('呼ばれなくなったモジュールはファイルも読み込みも無く、読み込むモジュールはどれも呼ばれる', function() {
    GONE_MODULES.forEach(function(m) {
      expect(fs.existsSync(path.join(ROOT, 'src', 'core', m + '.js'))).toBe(false);
      expect(HTML).not.toContain('src/core/' + m + '.js');
    });
    expect(deadModules(HTML, SRC)).toEqual([]);
  });

  test('<style> にどの要素にも当たらない規則が無い', function() {
    expect(deadSelectors(HTML, SRC)).toEqual([]);
  });

  test('外した機能の名前が注釈にも残らない', function() {
    expect(hits(HANDOFF_WORDS)).toEqual([]);
  });

  // roadmap v5.0 クライテリア 2: 整理表の「消す」「統合」の行に「未」が残らない (痕跡 0 件は 2114-1 の unit が「済」の行で見る)。
  test('整理表の「消す」「統合」の行はどれも「済」', function() {
    var text = fs.readFileSync(path.join(ROOT, 'docs', 'spec', 'feature-triage.md'), 'utf8');
    expect(undoneRows(text)).toEqual([]);
  });
});

// 整理表の行のうち、判定が 消す / 統合 で状態が 済 でないものの番号。
function undoneRows(text) {
  var out = [];
  text.split(/\r?\n/).forEach(function(line) {
    if (!/^\|\s*\d+\s*\|/.test(line)) return;
    var c = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(s) { return s.trim(); });
    if ((c[3] === '消す' || c[3] === '統合') && c[7] !== '済') out.push('#' + c[0] + ' ' + c[1]);
  });
  return out;
}

describe('整理表の「未」の数え方が変異で落ちる', function() {
  test('消す・統合の「未」を名指しし、残すと済は数えない', function() {
    var t = '| 1 | A | X | 消す | — | 台本 | T | 未 | `a` |\n| 2 | B | X | 統合 | C | 価値 | T | 済 | `b` |\n| 3 | D | X | 残す | — | 価値 | — | — | — |';
    expect(undoneRows(t)).toEqual(['#1 A']);
  });
});

describe('締めの検査が変異で落ちる', function() {
  test('宛先の無い Ctrl+K の行を名指しする', function() {
    var app = "function commands() {\n    var list = [\n      { id: 'x', button: 'btn-none', run: function() { clickById('btn-a'); } },\n    ];\n  }\n";
    expect(paletteOrphans(app, '<button id="btn-a"></button>')).toEqual(['btn-none']);
    expect(paletteOrphans(app, '<button id="btn-a"></button><button id="btn-none"></button>')).toEqual([]);
  });

  test('誰も呼ばないモジュールを名指しし、呼ばれれば外す', function() {
    var html = '<script src="src/core/a.js"></script><script src="src/app.js"></script>';
    var files = [
      { rel: 'src/core/a.js', text: 'window.MA.alpha = {};' },
      { rel: 'src/app.js', text: 'var x = 1;' },
    ];
    expect(deadModules(html, files)).toEqual(['src/core/a.js']);
    files[1].text = 'window.MA.alpha.go();';
    expect(deadModules(html, files)).toEqual([]);
  });

  test('当たる要素の無い CSS 規則を名指しし、組み立てる名前は使っているとみなす', function() {
    var html = '<style>.gone-box { color: red; }\n#live, .gone-x { color: blue; }\n.kind-a { color: green; }</style><div id="live"></div>';
    var files = [{ rel: 'src/app.js', text: "el.className = 'kind-' + k;" }];
    expect(deadSelectors(html, files)).toEqual(['.gone-box']);
  });
});
