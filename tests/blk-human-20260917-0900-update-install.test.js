'use strict';
// BLK-human-20260917-0900: v2.3 の PC に v2.10 を入れると別物として追加で入ったように見えた。
// インストーラを上書き更新にし (AppId 固定・前回の場所/権限・_internal の掃除・二重登録の片付け)、
// 設定 → 情報 から新しい版に気付けるようにする (押したときだけ確かめ、落とさない・実行しない)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
try { delete require.cache[require.resolve('../src/core/update-check.js')]; } catch (e) {}
require('../src/core/update-check.js');
var UC = global.window.MA.updateCheck;
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var REL = {
  tag_name: 'v2.11',
  html_url: 'https://github.com/KawanoMomo/PlantUMLAssist/releases/tag/v2.11',
  assets: [
    { name: 'PlantUMLAssist-portable.zip', browser_download_url: 'https://github.com/KawanoMomo/PlantUMLAssist/releases/download/v2.11/PlantUMLAssist-portable.zip' },
    { name: 'PlantUMLAssist-2.11-setup.exe', browser_download_url: 'https://github.com/KawanoMomo/PlantUMLAssist/releases/download/v2.11/PlantUMLAssist-2.11-setup.exe' }
  ]
};

describe('更新の確認 (BLK-human-20260917-0900)', function() {
  test('2.10 は 2.9 より新しい (文字列比較しない)', function() {
    expect(UC.compareVersions('v2.9', 'v2.10')).toBe(-1);
    expect(UC.compareVersions('2.10', 'v2.10')).toBe(0);
    expect(UC.compareVersions('v2.10.1', 'v2.10')).toBe(1);
    expect(UC.compareVersions('', 'v2.10')).toBe(null);
  });
  test('新版があれば版・変更点・インストーラの URL を返す', function() {
    var r = UC.evaluate({ current: { version: 'v2.10' }, release: REL });
    expect(r.status).toBe('newer');
    expect(r.latest).toBe('v2.11');
    expect(r.notesUrl).toBe(REL.html_url);
    expect(r.installerUrl).toBe(REL.assets[1].browser_download_url);
    expect(r.message).toContain('v2.11');
  });
  test('同じ版なら最新版と出し、インストーラは出さない', function() {
    var r = UC.evaluate({ current: { version: 'v2.11' }, release: REL });
    expect(r.status).toBe('latest');
    expect(r.installerUrl).toBe(undefined);
  });
  test('通信できないときは理由付きで確認できないと出す', function() {
    var r = UC.evaluate({ current: { version: 'v2.10' }, error: 'HTTP 403' });
    expect(r.status).toBe('error');
    expect(r.message).toContain('HTTP 403');
  });
  test('応答に他所の URL が入っていても開かない', function() {
    var r = UC.evaluate({ current: { version: 'v2.1' }, release: {
      tag_name: 'v9.0', html_url: 'https://evil.example/x',
      assets: [{ name: 'x-setup.exe', browser_download_url: 'https://evil.example/x-setup.exe' }] } });
    expect(UC.isRepoUrl(r.notesUrl)).toBe(true);
    expect(UC.isRepoUrl(r.installerUrl)).toBe(true);
    expect(UC.isRepoUrl('https://github.com/KawanoMomo/PlantUMLAssistEvil/x')).toBe(false);
  });
  test('起動時の自動確認は既定で切 ("1" のときだけ入)', function() {
    expect(UC.autoCheckEnabled(null)).toBe(false);
    expect(UC.autoCheckEnabled('0')).toBe(false);
    expect(UC.autoCheckEnabled('1')).toBe(true);
  });
  test('画面: 設定 → 情報 に更新を確認・変更点・インストーラ取得・起動時確認がある', function() {
    var html = read('plantuml-assist.html');
    ['cfg-update-check', 'cfg-update-notes', 'cfg-update-get', 'cfg-update-auto'].forEach(function(id) {
      expect(html.indexOf('id="' + id + '"')).not.toBe(-1);
    });
    expect(html.indexOf('src/core/update-check.js')).not.toBe(-1);
    expect(/id="cfg-update-auto"[^>]*checked/.test(html)).toBe(false);
  });
  test('server: 押したときだけ latest を読み、開ける URL はこのリポジトリだけ', function() {
    var src = read('server.py');
    expect(src).toContain("== '/update-check'");
    expect(src).toContain("self.path == '/open-url'");
    expect(src).toContain("api.github.com/repos/KawanoMomo/PlantUMLAssist/releases/latest");
    expect(src).toContain("url.startswith(UPDATE_REPO_URL + '/')");
  });
});

describe('インストーラの上書き更新 (BLK-human-20260917-0900)', function() {
  var iss = read('packaging/installer.iss');
  test('AppId は旧版と同じ PlantUMLAssist に固定 (GUID に替えると旧版と別物になる)', function() {
    expect(/^AppId=PlantUMLAssist\s*$/m.test(iss)).toBe(true);
  });
  test('前回の場所・権限で入れ、起動中は閉じ、旧 _internal を消す', function() {
    expect(/^UsePreviousAppDir=yes/m.test(iss)).toBe(true);
    expect(/^UsePreviousPrivileges=yes/m.test(iss)).toBe(true);
    expect(/^CloseApplications=yes/m.test(iss)).toBe(true);
    expect(/^\[InstallDelete\]\s*\r?\n(;.*\r?\n)*Type: filesandordirs; Name: "\{app\}\\_internal"/m.test(iss)).toBe(true);
  });
  test('全ユーザー/自分だけを毎回選ばせない (選び方が変わると 2 件入る)', function() {
    expect(/^PrivilegesRequiredOverridesAllowed=dialog/m.test(iss)).toBe(false);
    expect(/^PrivilegesRequiredOverridesAllowed=commandline/m.test(iss)).toBe(true);
  });
  test('反対側に残った旧登録を片付ける', function() {
    expect(iss).toContain('PlantUMLAssist_is1');
    expect(iss).toContain('CleanupOtherInstall');
  });
  test('workflow: 版 0.0.0 で焼かず、旧版→新版で登録 1 件を確かめる', function() {
    var wf = read('.github/workflows/windows-app.yml');
    expect(wf).not.toContain("else { '0.0.0' }");
    expect(wf).toContain('Smoke-test upgrade over the previous release');
    expect(wf).toContain('$e.Count -ne 1');
  });
});
