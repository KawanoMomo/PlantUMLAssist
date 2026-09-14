'use strict';
// BLK-primary-20260914-1406-wish: 「保存操作をした」ことしか見えず、保存先ファイルの
// 中身が実際に変わったかを言う画面が無い。錠の問い・テンプレ宣言・ダウンロード保存先の
// どれかで黙って書かれない道があり、引き継ぎ資料に古い図が混ざる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/save-verify.js')]; } catch (e) {}
require('../src/core/save-verify.js');
var SV = global.window.MA.saveVerify;

describe('saveVerify — 書きに行った図の突き合わせ', function() {
  beforeEach(function() { SV.clear(); });

  test('書きに行っただけでは「未確認」で、効いたとは言わない', function() {
    SV.note('Fig1', 'a', 'written');
    expect(SV.statusOf('Fig1')).toBe('unknown');
    expect(SV.pending()).toEqual(['Fig1']);
  });

  test('ディスクが編集後と一致していれば効いた', function() {
    SV.note('Fig1', '@startuml\nA -> B\n@enduml', 'written');
    expect(SV.applyDisk('Fig1', '@startuml\nA -> B\n@enduml')).toBe('ok');
  });

  test('改行と行末の空白の違いだけなら効いたと言う (本物の未反映を埋もれさせない)', function() {
    SV.note('Fig1', '@startuml\nA -> B\n@enduml', 'written');
    expect(SV.applyDisk('Fig1', '@startuml\r\nA -> B  \r\n@enduml\n')).toBe('ok');
  });

  test('ディスクが編集前のままなら効かなかったと名指しする', function() {
    SV.note('Fig1', 'new', 'written');
    expect(SV.applyDisk('Fig1', 'old')).toBe('stale');
    expect(SV.badNames()).toEqual(['Fig1']);
    expect(SV.reasonText('stale')).toContain('編集前のまま');
  });

  test('ファイルが無ければ missing', function() {
    SV.note('Fig1', 'new', 'written');
    expect(SV.applyDisk('Fig1', null)).toBe('missing');
  });

  test('控えの無い図にディスクを当てても落ちない', function() {
    expect(SV.applyDisk('知らない図', 'x')).toBe(null);
  });
});

describe('saveVerify — 書きに行かなかった道', function() {
  beforeEach(function() { SV.clear(); });

  test('錠の問いに答えていない図は、読み比べずに効かなかった側に置く', function() {
    SV.note('Fig1', 'new', 'asked');
    expect(SV.statusOf('Fig1')).toBe('asked');
    expect(SV.pending()).toEqual([]);
    expect(SV.isBad('asked')).toBe(true);
    expect(SV.reasonText('asked')).toContain('答えていない');
  });

  test('テンプレ宣言で止めた図も効かなかった側', function() {
    SV.note('tmpl', 'new', 'blocked');
    expect(SV.badNames()).toEqual(['tmpl']);
  });

  test('保存先がダウンロードならディスクには書かれていない', function() {
    SV.note('Fig1', 'new', 'download');
    expect(SV.statusOf('Fig1')).toBe('download');
    expect(SV.badNames()).toEqual(['Fig1']);
  });

  test('開いたときのままの図は、書く必要が無かったので効いた側', function() {
    SV.note('Fig1', 'same', 'skipped');
    expect(SV.statusOf('Fig1')).toBe('ok');
    expect(SV.badNames()).toEqual([]);
  });

  test('知らない道は書きに行った扱いにする (黙って落とさない)', function() {
    SV.note('Fig1', 'x', 'なにか');
    expect(SV.record('Fig1').outcome).toBe('written');
  });
});

describe('saveVerify — 引き継ぐ前に読む 1 行', function() {
  beforeEach(function() { SV.clear(); });

  test('1 枚も保存していない周でも黙らない', function() {
    expect(SV.summary()).toBe('この周はまだ保存していません');
  });

  test('効いた枚数と効かなかった枚数と未確認の枚数を出す', function() {
    SV.note('ok1', 'a', 'written'); SV.applyDisk('ok1', 'a');
    SV.note('ng1', 'b', 'written'); SV.applyDisk('ng1', 'old');
    SV.note('ng2', 'c', 'asked');
    SV.note('yet', 'd', 'written');
    expect(SV.summary()).toBe('この周の保存: 効いた 1 枚 / 効かなかった 2 枚 / 未確認 1 枚');
  });

  test('効かなかった図を上に並べる (引き継ぐ前に見るのはそこだけ)', function() {
    SV.note('zzz', 'a', 'written'); SV.applyDisk('zzz', 'old');
    SV.note('aaa', 'b', 'written'); SV.applyDisk('aaa', 'b');
    expect(SV.rows()[0].name).toBe('zzz');
    expect(SV.rows()[0].bad).toBe(true);
  });

  test('引き継ぎ資料に貼る形は、図ごとに ○ × と理由を並べる', function() {
    SV.note('Fig1', 'b', 'written'); SV.applyDisk('Fig1', 'old');
    var text = SV.handoffText();
    expect(text).toContain('この周の保存:');
    expect(text).toContain('× Fig1');
    expect(text).toContain('編集前のまま');
  });

  test('行の見出しは効いた / 効かなかった / 未確認を 1 文字で言う', function() {
    SV.note('a', 'x', 'written');
    expect(SV.rowLabel(SV.rows()[0])).toBe('? a');
    SV.applyDisk('a', 'x');
    expect(SV.rowLabel(SV.rows()[0])).toBe('○ a');
    SV.note('b', 'x', 'asked');
    expect(SV.rowLabel(SV.rows()[0])).toBe('× b');
  });

  test('忘れさせれば台帳から消える', function() {
    SV.note('a', 'x', 'written');
    SV.forget('a');
    expect(SV.names()).toEqual([]);
  });
});
