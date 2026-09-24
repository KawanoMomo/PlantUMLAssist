'use strict';
// BLK-human-20260923-1602 (design 9c): 下端の件数表示を 1 種類の形に揃え、
// 0 件の項目は出さない。色を持つのは点だけで、枠は付けない。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var SB = W.MA.statusBadges;

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('下端の件数表示は 1 種類の形 (design 9c)', function() {
  test('出す文字は「● 名前 N」だけ', function() {
    expect(SB.text('整合', 3)).toBe('● 整合 3');
    expect(SB.text('イベント', 12)).toBe('● イベント 12');
  });

  test('名前に付いていた ± や ⇄ は落とす (形が 1 種類に見えなくなる)', function() {
    expect(SB.text('± 差分', 5)).toBe('● 差分 5');
    expect(SB.text('⇄ イベント', 2)).toBe('● イベント 2');
    expect(SB.label('👀 先輩')).toBe('先輩');
  });

  test('0 件と、まだ数えていない項目は出さない', function() {
    expect(SB.isVisible(0)).toBe(false);
    expect(SB.isVisible(null)).toBe(false);
    expect(SB.isVisible(undefined)).toBe(false);
    expect(SB.isVisible(NaN)).toBe(false);
  });

  test('1 件でも増えたら出る', function() {
    expect(SB.isVisible(1)).toBe(true);
    expect(SB.isVisible(99)).toBe(true);
  });

  test('札の文字から件数を読む (OK・済 は 0 件を言い切っている回)', function() {
    expect(SB.countOf('整合 3')).toBe(3);
    expect(SB.countOf('整合 OK')).toBe(0);
    expect(SB.countOf('統一 済')).toBe(0);
    expect(SB.countOf('前回保存版 と同じ')).toBe(0);
    // 「−」はまだ数えていない。0 件と言い切ってはいけない。
    expect(SB.countOf('± 差分 −')).toBe(null);
    expect(SB.countOf('前回保存版 —')).toBe(null);
    expect(SB.countOf('')).toBe(null);
  });

  test('点の色は 正常 / 要確認 / 崩れ の 3 つだけ。知らない値は要確認に寄せる', function() {
    expect(SB.toneOf('ok')).toBe('ok');
    expect(SB.toneOf('warn')).toBe('warn');
    expect(SB.toneOf('bad')).toBe('bad');
    expect(SB.toneOf('stalled')).toBe('warn');
    expect(SB.toneOf(undefined)).toBe('warn');
  });

  test('文字色は札ごとに変えず、色を持つのは点だけ / 枠は付けない', function() {
    // 下端のボタンの見た目はこの 1 か所でだけ決める。
    expect(html).toContain('#statusbar button[data-dot]');
    var rule = html.slice(html.indexOf('#statusbar button[data-dot] {'));
    rule = rule.slice(0, rule.indexOf('}'));
    expect(rule).toContain('border: 0');
    expect(rule).toContain('color: var(--text-secondary)');
    // 色が付くのは点だけ。
    expect(html).toContain('#statusbar button[data-dot="ok"]   .sb-dot { color: var(--accent-green); }');
    expect(html).toContain('#statusbar button[data-dot="warn"] .sb-dot { color: var(--accent-orange); }');
    expect(html).toContain('#statusbar button[data-dot="bad"]  .sb-dot { color: var(--accent-red); }');
    // 0 件は場所を取らない。
    expect(html).toContain('#statusbar button[hidden] { display: none; }');
  });
});

describe('保存状態は 1 行に短く (design 9c)', function() {
  // autosave-status.js は共通読み込みの一覧に無いのでここで入れる。
  try { delete require.cache[require.resolve('../src/core/autosave-status.js')]; } catch (e) {}
  require('../src/core/autosave-status.js');
  var AST = W.MA.autosaveStatus;
  var meta = { lastSavedAt: '2026-09-23T13:31:04.000Z', lastSavedType: 'plantuml-sequence' };

  test('「13:31 に自動保存」と言う (「自動保存: 13:31:04」のような機械的な形にしない)', function() {
    var d = AST.describe(meta, { where: 'local' }, 'たった今', 'spi_init_sequence', '13:31');
    expect(d.text).toContain('13:31 に自動保存');
    expect(d.text).not.toContain('13:31:04');
  });

  test('開いたときのままの回は「· 変更なし」で 1 行に収める', function() {
    var d = AST.describe(meta, { where: 'deferred', reason: 'unchanged' }, 'たった今', 'spi_init_sequence', '13:31');
    expect(d.text).toBe('13:31 に自動保存 · 変更なし');
    expect(d.pending).toBe(false);
  });

  test('書けた先がある回も 1 行 (時刻 · ファイル名)', function() {
    var d = AST.describe(meta, { where: 'file', fileName: 'spi_init_sequence' }, 'たった今', 'spi_init_sequence', '13:31');
    expect(d.text).toBe('13:31 に自動保存 · spi_init_sequence.puml');
    expect(d.text.split('\n').length).toBe(1);
  });

  test('時刻を渡さない呼び方は従来どおり相対時刻で出る', function() {
    var d = AST.describe(meta, { where: 'local' }, 'たった今', 'spi_init_sequence');
    expect(d.text).toBe('たった今');
  });

  test('書けなかった回は短くせず、理由を名指ししたまま', function() {
    var d = AST.describe(meta, { where: 'deferred', reason: 'ask' }, 'たった今', 'spi_init_sequence', '13:31');
    expect(d.text).toContain('未保存');
    expect(d.text).toContain('spi_init_sequence.puml');
    expect(d.pending).toBe(true);
  });
});
