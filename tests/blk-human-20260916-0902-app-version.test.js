'use strict';
// BLK-human-20260916-0902: 設定 → 情報 に「PlantUMLAssist v2.8 (efe1cbf, 2026-09-16)」を出す。
// 版の正本は git tag。server.py / packaging が同じ形 {version, commit, date} を返すことも守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
try { delete require.cache[require.resolve('../src/core/app-version.js')]; } catch (e) {}
require('../src/core/app-version.js');
var AV = global.window.MA.appVersion;
var ROOT = path.join(__dirname, '..');

describe('版の表示 (BLK-human-20260916-0902)', function() {
  test('版・コミット・日付を 1 行にする', function() {
    expect(AV.formatLine({ version: 'v2.8', commit: 'efe1cbf', date: '2026-09-16' }))
      .toBe('PlantUMLAssist v2.8 (efe1cbf, 2026-09-16)');
  });
  test('v の無いタグにも v を付ける', function() {
    expect(AV.formatLine({ version: '2.8', commit: 'abc1234', date: '' })).toBe('PlantUMLAssist v2.8 (abc1234)');
  });
  test('版が取れないときは版不明と出し、空の括弧を作らない', function() {
    expect(AV.formatLine({})).toBe('PlantUMLAssist (版不明)');
    expect(AV.formatLine(null)).toBe('PlantUMLAssist (版不明)');
    expect(AV.normalizeVersion('efe1cbf')).toBe('');
  });
  test('server.py は GET /version を git tag から返す (手で版を書かない)', function() {
    var src = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    expect(src.indexOf("== '/version'")).not.toBe(-1);
    expect(src.indexOf("'describe', '--tags'")).not.toBe(-1);
    expect(src.indexOf("'src' / 'version.json'")).not.toBe(-1);
  });
  test('exe のビルドは src/version.json を焼いて同梱する', function() {
    var spec = fs.readFileSync(path.join(ROOT, 'packaging', 'PlantUMLAssist.spec'), 'utf8');
    expect(spec.indexOf('write_build_info_json')).not.toBe(-1);
    expect(spec.indexOf("(BUILD_INFO, 'src')")).not.toBe(-1);
    var wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'windows-app.yml'), 'utf8');
    expect(wf.indexOf('APP_VERSION')).not.toBe(-1);
  });
  test('設定に 情報 タブがある', function() {
    var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
    expect(html.indexOf('id="cfg-pane-about"')).not.toBe(-1);
    expect(html.indexOf('src/core/app-version.js')).not.toBe(-1);
  });
});
