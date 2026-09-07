'use strict';
// BLK-junior-20260907-1803: 一覧から同じ名前の図を開き直したとき、何が起きたかを言葉で返す。
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/folder-reopen.js')]; } catch (e) {}
require('../src/core/folder-reopen.js');
var FR = global.window.MA.folderReopen;

var DSL = '@startuml\nstart\n:保存する;\nstop\n@enduml';

describe('folderReopen.describe', function() {
  test('同じタブ・同じ内容: 読み直したこと自体を行数つきで返す', function() {
    var r = FR.describe('CANドライバ初期化アクティビティ', DSL, DSL, true);
    expect(r.kind).toBe('same');
    expect(r.changed).toBe(false);
    expect(r.message).toContain('読み直しました');
    expect(r.message).toContain('保存されている内容と同じです');
    expect(r.message).toContain('5 行');
    expect(r.message).toContain('CANドライバ初期化アクティビティ');
  });

  test('同じタブ・内容が違う: 差し替えたことと戻せることを返す', function() {
    var r = FR.describe('CAN', DSL, DSL + '\n', true);
    expect(r.kind).toBe('replaced');
    expect(r.changed).toBe(true);
    expect(r.message).toContain('差し替えました');
    expect(r.message).toContain('元に戻す');
  });

  test('別のタブなら「開きました」', function() {
    var r = FR.describe('別の図', DSL, 'まったく別の本文', false);
    expect(r.kind).toBe('opened');
    expect(r.changed).toBe(true);
    expect(r.message).toContain('タブで開きました');
  });

  test('読めなかったときは、開いた気にさせない', function() {
    var r = FR.describe('消えた図', null, DSL, true);
    expect(r.kind).toBe('missing');
    expect(r.changed).toBe(false);
    expect(r.message).toContain('読めませんでした');
  });

  test('空ファイルは「読めなかった」と混ざらない', function() {
    var r = FR.describe('空の図', '', '', true);
    expect(r.kind).toBe('same');
    expect(r.message).toContain('0 行');
  });

  test('countLines: 空は 0、末尾改行は 1 行として数える', function() {
    expect(FR.countLines('')).toBe(0);
    expect(FR.countLines(null)).toBe(0);
    expect(FR.countLines('a')).toBe(1);
    expect(FR.countLines('a\n')).toBe(2);
  });
});
