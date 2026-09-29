'use strict';
// BLK-human-20260923-1330: まとめて追加系フォームの「止める / 知らせる」の出し分け。
// 他のテストが自前の jsdom window に差し替えるため、require キャッシュを落として
// 現在の window に登録し直す (sequence-overlay.test.js と同じ理由)。
delete require.cache[require.resolve('../src/core/scaffold-notice.js')];
require('../src/core/scaffold-notice.js');
var SN = (typeof window !== 'undefined' && window.MA && window.MA.scaffoldNotice)
  || (global.window && global.window.MA && global.window.MA.scaffoldNotice);

describe('scaffoldNotice.html', function() {
  test('errors も warnings も無ければ空', function() {
    expect(SN.html({ ok: true, errors: [], warnings: [] })).toBe('');
  });

  test('errors は赤で出す', function() {
    var h = SN.html({ ok: false, errors: ['参加者かメッセージを 1 つ以上入れてください'], warnings: [] });
    expect(h).toContain('--accent-red');
    expect(h).toContain('参加者かメッセージ');
    expect(h.indexOf('⚠')).toBe(-1);
  });

  test('warnings は橙の ⚠ で出す', function() {
    var h = SN.html({ ok: true, errors: [], warnings: ['From と To が同じです'] });
    expect(h).toContain('--accent-orange');
    expect(h).toContain('⚠');
    expect(h).toContain('From と To');
    expect(h.indexOf('--accent-red')).toBe(-1);
  });

  test('両方あれば 2 行に分けて出す', function() {
    var h = SN.html({ ok: false, errors: ['E1'], warnings: ['W1'] });
    expect(h).toContain('<br>');
    expect(h).toContain('E1');
    expect(h).toContain('W1');
  });

  test('打たれた文字はそのまま HTML にしない', function() {
    var h = SN.html({ ok: true, errors: [], warnings: ['<img src=x onerror=1>'] });
    expect(h).toContain('&lt;img');
    expect(h.indexOf('<img')).toBe(-1);
  });

  test('warnings を持たない古い返り値でも落ちない', function() {
    expect(SN.html({ ok: false, errors: ['E'] })).toContain('E');
    expect(SN.html(null)).toBe('');
  });
});
