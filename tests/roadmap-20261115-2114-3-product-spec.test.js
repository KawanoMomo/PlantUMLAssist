'use strict';
// TICKET-roadmap-20261115-2114-3: 製品仕様書 docs/spec/product-spec.md (roadmap v5.0 クライテリア 5)。
// - 仕様書の機能が、整理表の「残す」行と「統合」で残した側の行と過不足 0 (行番号で突き合わせる)
// - 各機能に入口と「確かめる」があり、指す spec / test のファイルが実在する
// - README の「できること」の見出しが仕様書の場面と一致し、README に外した機能の語 (整理表の「痕跡の語」) が 0 件
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SPEC = fs.readFileSync(path.join(ROOT, 'docs', 'spec', 'product-spec.md'), 'utf8');
var TRIAGE = fs.readFileSync(path.join(ROOT, 'docs', 'spec', 'feature-triage.md'), 'utf8');
var README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

function cellsOf(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) { return c.trim(); });
}

// 整理表: 判定が 残す / 統合 の行番号 (統合は残す側がある) と、消す・統合の行の痕跡の語。
function triageKeep(text) {
  var keep = [], traces = [];
  text.split(/\r?\n/).forEach(function(line) {
    if (!/^\|\s*\d+\s*\|/.test(line)) return;
    var c = cellsOf(line);
    if (c[3] === '残す' || c[3] === '統合') keep.push(Number(c[0]));
    if (c[3] === '消す' || c[3] === '統合') {
      var m, re = /`([^`]+)`/g;
      while ((m = re.exec(c[8] || ''))) traces.push({ no: Number(c[0]), word: m[1] });
    }
  });
  return { keep: keep, traces: traces };
}

// 仕様書: 場面 (## の見出し。製品の約束・読み方を除く) と、表の行 { nos, name, entry, check }。
function specRows(text) {
  var scenes = [], rows = [], scene = null;
  text.split(/\r?\n/).forEach(function(line) {
    var h = /^## (.+)$/.exec(line);
    if (h) { scene = h[1].trim(); if (scene !== '製品の約束' && scene !== '読み方') scenes.push(scene); return; }
    if (!/^\|\s*#\d+/.test(line)) return;
    var c = cellsOf(line);
    var nos = (c[0].match(/#(\d+)/g) || []).map(function(s) { return Number(s.slice(1)); });
    var checks = [], m, re = /`([^`]+)`/g;
    while ((m = re.exec(c[5] || ''))) checks.push(m[1]);
    rows.push({ scene: scene, nos: nos, name: c[1], what: c[2], entry: c[3], behavior: c[4], checks: checks, cols: c.length });
  });
  return { scenes: scenes, rows: rows };
}

function diffSets(specNos, keep) {
  var s = {}, k = {};
  specNos.forEach(function(n) { s[n] = true; });
  keep.forEach(function(n) { k[n] = true; });
  return {
    missing: keep.filter(function(n) { return !s[n]; }),
    extra: Object.keys(s).map(Number).filter(function(n) { return !k[n]; }).sort(function(a, b) { return a - b; }),
  };
}

function readmeScenes(text) {
  var i = text.indexOf('\n## できること');
  if (i < 0) return [];
  var j = text.indexOf('\n## ', i + 5);
  var body = text.slice(i, j < 0 ? text.length : j);
  var out = [], m, re = /\n### (.+)/g;
  while ((m = re.exec(body))) out.push(m[1].trim());
  return out;
}

var T = triageKeep(TRIAGE);
var S = specRows(SPEC);

describe('製品仕様書 docs/spec/product-spec.md', function() {
  test('機能は整理表の「残す」「統合」の行と過不足 0', function() {
    var nos = [];
    S.rows.forEach(function(r) { nos = nos.concat(r.nos); });
    expect(T.keep.length).toBeGreaterThan(50);
    expect(diffSets(nos, T.keep)).toEqual({ missing: [], extra: [] });
  });

  test('どの機能にも できること・入口・振る舞い・確かめる があり、確かめるファイルが実在する', function() {
    var bad = [];
    S.rows.forEach(function(r) {
      var at = r.nos.map(function(n) { return '#' + n; }).join(' ') + ' ' + r.name;
      if (r.cols !== 6) { bad.push(at + ': 列が ' + r.cols); return; }
      if (!r.what || !r.entry || !r.behavior) bad.push(at + ': 空の欄');
      if (!r.checks.length) bad.push(at + ': 確かめるが無い');
      r.checks.forEach(function(p) {
        if (!/^tests\//.test(p) || !fs.existsSync(path.join(ROOT, p))) bad.push(at + ': ' + p + ' が無い');
      });
    });
    expect(bad).toEqual([]);
  });

  test('先頭に製品の約束がある', function() {
    expect(SPEC).toContain('## 製品の約束');
    ['本文が正本', '名指しした要素だけ', '`.puml` と、利用者が押した書き出しだけ', '外へ何も送らない', '守り'].forEach(function(w) {
      expect(SPEC).toContain(w);
    });
  });

  test('場面は 開く / 直す / 描く / 保存する / 書き出す / フォルダで図を扱う / 図をまたいで名前を替える を含む', function() {
    ['開く', '直す(6 図種で共通の操作)', '直す(図種ごとの操作)', '描く', '保存する', '書き出す',
      'フォルダで図を扱う', '図をまたいで名前を替える'].forEach(function(s) {
      expect(s + ':' + (S.scenes.indexOf(s) >= 0)).toBe(s + ':true');
    });
  });
});

describe('README は仕様書の要約', function() {
  test('「できること」の見出しは仕様書の場面と同じ並び', function() {
    expect(readmeScenes(README)).toEqual(S.scenes);
  });

  test('README に外した機能の語 (整理表の痕跡の語) が無い', function() {
    var hits = T.traces.filter(function(t) { return README.indexOf(t.word) >= 0; })
      .map(function(t) { return '#' + t.no + ' `' + t.word + '`'; });
    expect(hits).toEqual([]);
  });
});

describe('突き合わせが変異で落ちる', function() {
  test('仕様書に 1 つ足す・表の残すを 1 つ増やすと差が出る', function() {
    expect(diffSets([1, 2, 3], [1, 2])).toEqual({ missing: [], extra: [3] });
    expect(diffSets([1, 2], [1, 2, 4])).toEqual({ missing: [4], extra: [] });
  });

  test('表の行から残す・統合の番号と痕跡の語を拾う', function() {
    var t = triageKeep('| 1 | A | X | 残す | — | 価値 | — | — | — |\n| 2 | B | X | 消す | — | 価値 | T | 済 | `gone-x` |\n| 3 | C | X | 統合 | D | 価値 | T | 済 | `y` |');
    expect(t.keep).toEqual([1, 3]);
    expect(t.traces.map(function(x) { return x.word; })).toEqual(['gone-x', 'y']);
  });

  test('README の見出しを拾う', function() {
    expect(readmeScenes('# T\n\n## できること\n\n### 開く\n\n### 描く\n\n## セットアップ\n### x')).toEqual(['開く', '描く']);
  });
});
