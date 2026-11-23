'use strict';
// TICKET-owner-20261123-2222-1: 保存先を決めていない間の FILES の「保存先」節の操作を、一覧と同じ 1 つ (saveTarget.listDir) から決める。
//   (a) 右クリックの「新しいフォルダ」は押せず (理由「保存先のフォルダを決めていません」)、画面に出ない既定のフォルダに作らない
//   (b) 節の案内は決める入口の語「保存先のフォルダを選ぶ…」を見える字で出す (title にしまわない)
//   (c) 節の行「ダウンロード」を押すと ⚙ 設定を挟まず「保存先のフォルダを選ぶ」窓を開く
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');

try { delete require.cache[require.resolve('../src/core/save-target.js')]; } catch (e) {}
require('../src/core/save-target.js');
try { delete require.cache[require.resolve('../src/core/file-menu.js')]; } catch (e) {}
require('../src/core/file-menu.js');
var STG = global.window.MA.saveTarget;
var FM = global.window.MA.fileMenu;

function byId(items, id) { return items.filter(function(x) { return x.id === id; })[0]; }

var CFGS = [
  null,
  { backend: 'localStorage', fileDir: './autosave' },
  { backend: 'localStorage', fileDir: 'E:/persona/primary' },
  { backend: 'file', fileDir: 'E:/persona/primary' },
  { backend: 'file' },
];

describe('TICKET-owner-20261123-2222-1 保存先を決めていない間の保存先節の操作', () => {
  test('未設定かどうかは一覧の読むフォルダ (listDir) と同じ 1 つから決まる', () => {
    CFGS.forEach(function(cfg) {
      expect(STG.isUnset(cfg)).toBe(!STG.listDir(cfg));
    });
    expect(STG.isUnset({ backend: 'localStorage', fileDir: './autosave' })).toBe(true);
    expect(STG.isUnset({ backend: 'file', fileDir: 'E:/persona/primary' })).toBe(false);
  });

  test('未設定の保存先の右クリックでは「新しいフォルダ」が押せず、理由を言う。「新しい図」は押せる', () => {
    var items = FM.folderItems({ kind: 'target', unset: true });
    var nf = byId(items, 'new-folder');
    expect(nf.disabled).toBe(true);
    expect(nf.title).toContain('保存先のフォルダを決めていません');
    expect(!!byId(items, 'new-doc').disabled).toBe(false);
    // 「保存先にする」も押せず、今の保存先があるとは言わない。
    var st = byId(items, 'set-target');
    expect(st.disabled).toBe(true);
    expect(st.title).toContain('保存先のフォルダを決めていません');
    expect(st.title).not.toContain('今の保存先です');
    // 決める入口は押せる。
    expect(!!byId(items, 'change-target').disabled).toBe(false);
  });

  test('保存先を決めた画面の右クリックは今どおり (新しいフォルダを押せる)', () => {
    var items = FM.folderItems({ kind: 'target' });
    expect(!!byId(items, 'new-folder').disabled).toBe(false);
    expect(byId(items, 'set-target').title).toBe('今の保存先です');
    expect(FM.folderItems({ kind: 'target', unset: false }).map(function(i) { return i.id + ':' + !!i.disabled; }))
      .toEqual(items.map(function(i) { return i.id + ':' + !!i.disabled; }));
    // サブフォルダ (保存先を決めた後にしか出ない) と読むだけのフォルダは unset を見ない。
    expect(!!byId(FM.folderItems({ kind: 'sub', unset: true }), 'new-folder').disabled).toBe(false);
  });

  test('右クリックの UI は未設定を saveTarget.isUnset で見て渡し、未設定の間は mkdir を送らない', () => {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'file-menu.js'), 'utf8');
    expect(src).toContain('folderItems({ kind: ctx.folder.kind, unset: _unset() })');
    var at = src.indexOf('function newFolder(folder)');
    var body = src.slice(at, src.indexOf("op: 'mkdir'", at));
    expect(body).toContain('_unset()');
    expect(body).toContain('return Promise.resolve(false)');
  });

  test('節の案内は決める入口の語を見える字で出す (title だけにしない)', () => {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'files-panel.js'), 'utf8');
    var at = src.indexOf("hint.id = 'files-target-unset'");
    expect(at).toBeGreaterThan(0);
    var body = src.slice(at - 400, at + 600);
    expect(body).toContain("l2.id = 'files-target-unset-hint'");
    expect(body).toContain('l2.textContent = h.how');
    expect(body).not.toContain('hint.title');
    expect(STG.unsetHint().how).toContain('保存先のフォルダを選ぶ…');
  });

  test('節の行「ダウンロード」を押すと、未設定の間は保存先のフォルダを選ぶ窓を開く', () => {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    var at = src.indexOf('(function setupTopSaveTarget()');
    var body = src.slice(at, src.indexOf("getElementById('btn-config')", at));
    expect(body).toContain('ST.isUnset(cfg)');
    expect(body).toContain('openChangeTarget()');
    expect(STG.breadcrumb({ backend: 'localStorage' }, { name: 'x' }).folderTitle).toContain('保存先のフォルダを選ぶ');
  });
});
