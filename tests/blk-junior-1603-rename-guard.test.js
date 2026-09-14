'use strict';
// BLK-junior-20260908-1603: 台本の「タイトルの末尾に (先輩反映) を付け足す」を
// DSL の title 行のことだと思って editor を書き換えようとした。ファイル名を
// 決めているのは図名の方で、対応は画面に出ていなかった。さらに、名前を変える前に
// 自動保存が走り、前周の完了物「…(レビュー反映).puml」に今回の編集が入った。
// ここでは「図名 → ファイル名の言い方」と「前の名前のファイルを戻せる版の選び方」を固定する。

const RG = require('../src/core/rename-guard');

describe('rename-guard — 図名とファイル名、名前を変えたあとの後始末', function() {
  test('ファイル名は図名 + .puml。保存フォルダも一緒に言う', function() {
    expect(RG.fileNameOf('GPIO初期化 (先輩反映)')).toBe('GPIO初期化 (先輩反映).puml');
    const t = RG.hintText('GPIO初期化 (先輩反映)', './autosave');
    expect(t).toContain('./autosave/GPIO初期化 (先輩反映).puml');
    // title と混ざらないよう、役割の違いをその場で言う
    expect(t).toContain('Title は図の中の見出し');
  });

  test('図名が空のときは、名前を入れれば作られると言う', function() {
    expect(RG.fileNameOf('')).toBe('');
    expect(RG.hintText('', './autosave')).toContain('図名を入れると');
  });

  test('戻せる版は「今の内容と違う一番新しい版」', function() {
    const history = [
      { dsl: 'v1', at: '2026-09-07T10:00:00Z' },
      { dsl: 'v2', at: '2026-09-08T09:00:00Z' },
      { dsl: 'v3-今回の編集', at: '2026-09-08T16:00:00Z' },
    ];
    const v = RG.previousVersion(history, 'v3-今回の編集');
    expect(v.dsl).toBe('v2');
    expect(v.at).toBe('2026-09-08T09:00:00Z');
  });

  test('改行コードと行末の空白の違いは同じ版とみなす', function() {
    const history = [{ dsl: '@startuml\r\n:A;  \r\n@enduml' }];
    expect(RG.previousVersion(history, '@startuml\n:A;\n@enduml')).toBe(null);
  });

  test('今の内容しか控えが無ければ戻す先は無い', function() {
    expect(RG.previousVersion([{ dsl: 'same' }], 'same')).toBe(null);
    expect(RG.previousVersion([], 'any')).toBe(null);
    expect(RG.previousVersion(null, 'any')).toBe(null);
  });

  test('保存フォルダを使っていないなら、残るファイルの話はしない', function() {
    const n = RG.notice({ from: 'A', to: 'B', saved: false, version: { dsl: 'v1' } });
    expect(n.kind).toBe('renamed');
    expect(n.canRestore).toBe(false);
    expect(n.text).toContain('B.puml');
  });

  test('戻せる版があるときだけ「戻す」を勧める', function() {
    const n = RG.notice({ from: 'GPIO (レビュー反映)', to: 'GPIO (先輩反映)', saved: true,
      version: { dsl: 'v2', at: '2026-09-08T09:00:00Z' } });
    expect(n.kind).toBe('restorable');
    expect(n.canRestore).toBe(true);
    expect(n.text).toContain('GPIO (レビュー反映).puml');
    expect(n.text).toContain('今回の編集');
  });

  test('戻せる版が無いときは、残るファイルがあることだけを言う', function() {
    const n = RG.notice({ from: 'A', to: 'B', saved: true, version: null });
    expect(n.kind).toBe('left-behind');
    expect(n.canRestore).toBe(false);
    expect(n.text).toContain('A.puml');
  });

  test('名前が変わっていなければ知らせない', function() {
    expect(RG.notice({ from: 'A', to: 'A', saved: true })).toBe(null);
    expect(RG.notice({ from: '', to: 'B' })).toBe(null);
    expect(RG.notice(null)).toBe(null);
  });
});
