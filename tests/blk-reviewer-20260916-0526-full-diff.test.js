'use strict';
// BLK-reviewer-20260916-0526-wish: 変化の中身は代表行 + 件数までしか出ない。
// −3 行/+76 行のような大きな復元が「以前より充実しているか」は代表行では決められず、
// reviewer は毎回 cat でファイル全体を読み直していた。閾値を超えた変化は
// 同じ出力の中で全文 diff まで開き、コマンド往復を 0 にする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/full-diff.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var FD = global.window.MA.fullDiff;

// 事故の実物: 4 tick 空洞化していた図が、note 付きで以前より充実して戻った。
var GUTTED = ['@startuml', 'title Driver_Common_Class', 'class Driver_Common', '@enduml'].join('\n');
var RESTORED = ['@startuml', 'title Driver_Common_Class', 'class Driver_Common {',
  '  + Init() : void', '  + DeInit() : void', '}', 'class Spi_Driver',
  'Driver_Common <|-- Spi_Driver', 'note right of Spi_Driver : SPI 系はここに集める',
  '@enduml'].join('\n');

describe('full-diff: 大きな差分をその場で全文まで開く', function() {

  test('並びを保った全文を出し、消えた行も増えた行も 1 つも落とさない', function() {
    var r = FD.row('driver_common_class.puml', GUTTED, RESTORED);
    expect(r.removedCount).toBe(1);
    expect(r.addedCount).toBe(7);
    expect(r.changedCount).toBe(8);
    // 全文 = 控えにしか無い行 + 現物にしか無い行 + 共通行が、すべて 1 行ずつ出る。
    var text = FD.render(r);
    expect(text.length).toBe(r.ops.length + 1);
    var body = text.slice(1).join('\n');
    // 代表行では読めなかった中身 (継承・note) が、追加のコマンド無しで読める。
    expect(body).toContain('+ Driver_Common <|-- Spi_Driver');
    expect(body).toContain('+ note right of Spi_Driver');
    expect(body).toContain('- class Driver_Common\n');
    // 動いていない行も残る (これは cat の代わりなので、出ない行があってはならない)。
    expect(body).toContain('  title Driver_Common_Class');
    // 見出しに増減と行数が出る。
    expect(text[0]).toContain('控え 4 行 → 現物 10 行 (−1 / +7)');
  });

  test('コメント行も空行も落とさない (落とすと控えを開き直すことになる)', function() {
    var a = ['@startuml', '', "' domain-verdict: separate", '[*] --> Idle', '@enduml'].join('\n');
    var b = ['@startuml', '', '[*] --> Idle', '@enduml'].join('\n');
    var r = FD.row('spi_state.puml', a, b);
    expect(r.removedCount).toBe(1);
    expect(FD.render(r).join('\n')).toContain("- ' domain-verdict: separate");
  });

  test('閾値を超えた変化だけを自動で開き、小さい変化は代表行のままにする', function() {
    var small = FD.row('diagram1.puml', GUTTED, RESTORED);          // 8 行
    var big = FD.row('driver_common_class.puml', 'a\nb\nc',
      Array.from({ length: 76 }, function(_, i) { return 'line' + i; }).join('\n'));
    expect(FD.shouldOpen(small, null, 20)).toBe(false);
    expect(FD.shouldOpen(big, null, 20)).toBe(true);
    // 開かない図でも、閾値を超えていれば促しが残る (見落とさないため)。
    expect(FD.hint(small, 20)).toBeNull();
    expect(FD.hint(small, 5)).toContain('全文diffで確認: diagram1.puml');
    expect(FD.hint(small, 5)).toContain('--full-diff diagram1');
  });

  test('名指しと all は大きさを見ずに開き、none は開かない', function() {
    var small = FD.row('diagram1.puml', GUTTED, RESTORED);
    expect(FD.shouldOpen(small, 'all', 20)).toBe(true);
    expect(FD.shouldOpen(small, ['diagram1'], 20)).toBe(true);       // 拡張子なしで打てる
    expect(FD.shouldOpen(small, ['diagram1.puml'], 20)).toBe(true);
    expect(FD.shouldOpen(small, ['other'], 20)).toBe(false);
    var big = FD.row('x.puml', '', Array.from({ length: 40 }, function(_, i) { return 'l' + i; }).join('\n'));
    expect(FD.shouldOpen(big, 'none', 20)).toBe(false);
  });

  test('片側が空でも全文が出る (新規・全消しをそのまま読める)', function() {
    var gone = FD.row('gone.puml', RESTORED, '');
    expect(gone.removedCount).toBe(10);
    expect(FD.render(gone).join('\n')).toContain('- note right of Spi_Driver');
  });
});
