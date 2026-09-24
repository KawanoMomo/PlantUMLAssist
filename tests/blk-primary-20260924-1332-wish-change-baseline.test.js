'use strict';
// BLK-primary-20260924-1332-wish: ▤ 変更サマリボードの「変更前 =」(今日 0 時 / 前回の会議 / 前回提出)。
// 基準の選び方・選べるかどうか・その時点より前の最後の版・会議の日時の控え方。
const CB = require('../src/core/change-baseline');

describe('会議の日時の控え', function() {
  test('同じ日の並べ直しはその日の最後の時刻に置き換える', function() {
    var log = CB.recordMeeting([], '2026-09-23T10:00:00');
    log = CB.recordMeeting(log, '2026-09-23T15:00:00');
    log = CB.recordMeeting(log, '2026-09-24T09:00:00');
    expect(log).toEqual(['2026-09-23T15:00:00', '2026-09-24T09:00:00']);
  });

  test('前回の会議は今日より前で最後の 1 回 (今日並べた分は数えない)', function() {
    var log = ['2026-09-20T10:00:00', '2026-09-23T15:00:00', '2026-09-24T09:00:00'];
    expect(CB.lastMeetingBefore(log, '2026-09-24T00:00:00')).toBe('2026-09-23T15:00:00');
    expect(CB.lastMeetingBefore([], '2026-09-24T00:00:00')).toBe('');
    expect(CB.lastMeetingBefore(['2026-09-24T09:00:00'], '2026-09-24T00:00:00')).toBe('');
  });
});

describe('「変更前 =」の選択肢', function() {
  // BLK-owner-20260924-1712-prune: 先頭に既定の「前回保存」(± 差分の基準) を足した。
  test('前回保存 / 今日 0 時 / 前回の会議 / 前回提出 の順', function() {
    expect(CB.options({}).map(function(o) { return o.key; })).toEqual(['saved', 'today', 'meeting', 'delivery']);
  });

  test('会議の控えが無ければ「まだ会議セットで並べていません」と出して選べない', function() {
    var m = CB.options({ meetingAt: '' })[2];
    expect(m.disabled).toBe(true);
    expect(m.label).toContain('まだ会議セットで並べていません');
  });

  test('一度も納品していなければ前回提出は選べない', function() {
    var d = CB.options({ deliveryAt: '' })[3];
    expect(d.disabled).toBe(true);
  });

  test('控えがあれば選べて、その時刻を持つ', function() {
    var o = CB.options({ meetingAt: '2026-09-23T15:00:00', deliveryAt: '2026-09-10T12:00:00' });
    expect(o[2].disabled).toBe(false);
    expect(o[2].at).toBe('2026-09-23T15:00:00');
    expect(o[3].disabled).toBe(false);
  });
});

describe('その時点の中身 (版の控えは「上書きされた時刻に退避した、それまでの中身」)', function() {
  // 09-22 に v1 で作り、09-23 16:00 に v2 へ、09-24 11:00 に今の v3 へ上書きした図。
  var versions = [
    { at: '2026-09-23T16:00:00Z', dsl: 'v1' },
    { at: '2026-09-24T11:00:00Z', dsl: 'v2' },
  ];
  var current = { dsl: 'v3', mtime: '2026-09-24T11:00:00Z' };

  test('会議 (09-23 15:00) の時点の中身は、その後で最初に退避された版', function() {
    expect(CB.contentAt(versions, '2026-09-23T15:00:00Z', current).dsl).toBe('v1');
    expect(CB.contentAt(versions, '2026-09-23T17:00:00Z', current).dsl).toBe('v2');
  });

  test('その後 1 度も上書きしていなければ今のファイルが同じ中身', function() {
    expect(CB.contentAt(versions, '2026-09-24T12:00:00Z', current).dsl).toBe('v3');
  });

  test('その時点より後に作られた図は null (新規)', function() {
    expect(CB.contentAt([], '2026-09-23T15:00:00Z', { dsl: 'x', mtime: '2026-09-24T09:00:00Z' })).toBe(null);
    expect(CB.contentAt([], '2026-09-23T15:00:00Z', null)).toBe(null);
  });

  test('刻印から読む版を 1 つに絞る', function() {
    expect(CB.stampToIso('20260923-160000')).toBe('2026-09-23T16:00:00Z');
    expect(CB.stampToIso('20260923-160000.1')).toBe('2026-09-23T16:00:00Z');
    expect(CB.stampAt(['20260924-110000', '20260923-160000'], '2026-09-23T15:00:00Z')).toBe('20260923-160000');
    expect(CB.stampAt(['20260924-110000', '20260923-160000'], '2026-09-24T12:00:00Z')).toBe('');
  });
});

describe('見出し', function() {
  test('「変更前 = 前回の会議 (MM/DD HH:MM)」', function() {
    var at = new Date(2026, 8, 23, 15, 0, 0).toISOString();
    expect(CB.headLabel('meeting', at)).toBe('変更前 = 前回の会議 (09/23 15:00)');
    expect(CB.headLabel('bogus', '')).toBe('変更前 = 前回保存');
  });
});
