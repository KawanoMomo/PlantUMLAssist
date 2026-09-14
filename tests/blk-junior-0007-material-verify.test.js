'use strict';
// BLK-junior-20260915-0007: 資料化した直後に「保存先に本当に置けたか」が、
// モーダルの中に残ること。トーストを見落としても📂一覧を開き直さなくてよい。

var W = (typeof window !== 'undefined' && window) || global.window;
var MV = W.MA.materialVerify;

var PLAN = {
  source: 'TIMERドライバ初期化アクティビティ',
  docName: 'TIMERドライバ初期化アクティビティ(資料用)',
  filename: 'TIMERドライバ初期化アクティビティ(資料用).png',
  formatLabel: 'PNG',
};

var INFO = {
  dir: 'E:\\01_Loop\\persona-data\\junior',
  exists: true,
  now: '2026-09-15T00:41:20Z',
  entries: [
    { name: 'GPIOドライバ状態遷移', mtime: '2026-09-15T00:10:11Z', size: 300 },
    { name: 'TIMERドライバ初期化アクティビティ(資料用)', mtime: '2026-09-15T00:41:07Z', size: 1536 },
  ],
};

describe('material-verify: 資料化の直後に保存先を確かめる', function() {
  test('置けていれば、名前・時刻・大きさと画像名が 1 行になる', function() {
    var v = MV.verdict(INFO, PLAN);
    expect(v.status).toBe('ok');
    expect(v.found).toBe(true);
    expect(v.text).toContain('TIMERドライバ初期化アクティビティ(資料用).puml を置けました');
    expect(v.text).toContain('E:\\01_Loop\\persona-data\\junior');
    expect(v.text).toContain('たった今');
    expect(v.text).toContain('1.5 KB');
    expect(v.text).toContain('TIMERドライバ初期化アクティビティ(資料用).png');
  });

  test('一覧に無ければ、置けていないことを名指しして次の手を言う', function() {
    var v = MV.verdict({ dir: INFO.dir, exists: true, entries: [INFO.entries[0]] }, PLAN);
    expect(v.status).toBe('missing');
    expect(v.found).toBe(false);
    expect(v.text).toContain('TIMERドライバ初期化アクティビティ(資料用).puml が保存先');
    expect(v.text).toContain('⚙設定');
  });

  test('一覧そのものを読めなかったときは、置けたとは言わない', function() {
    var v = MV.verdict(null, PLAN);
    expect(v.status).toBe('unknown');
    expect(v.found).toBe(false);
    expect(v.text).toContain('読めませんでした');
  });

  test('一覧が名前だけの古い形でも引ける', function() {
    var v = MV.verdict({ dir: '', entries: ['TIMERドライバ初期化アクティビティ(資料用)'] }, PLAN);
    expect(v.status).toBe('ok');
    expect(v.text).toContain('を置けました');
  });

  test('時刻・大きさが無い一覧でも、置けたことは言える', function() {
    var v = MV.verdict({ dir: 'D:\\x', entries: [{ name: PLAN.docName }] }, PLAN);
    expect(v.status).toBe('ok');
    expect(v.text).toContain('を置けました');
    expect(v.text).not.toContain('（）');
  });

  test('server の「今」が無ければ時刻をそのまま出す (置けたことは言える)', function() {
    var v = MV.verdict({ dir: 'D:\\x', entries: [{ name: PLAN.docName, mtime: '2026-09-15T00:41:07Z' }] }, PLAN);
    expect(v.text).toContain('00:41:07');
  });

  test('新しさは server の時計どうしで引く (UTC のまま出して 9 時間ずらさない)', function() {
    expect(MV.freshText('2026-09-15T00:41:07Z', '2026-09-15T00:41:20Z')).toBe('たった今');
    expect(MV.freshText('2026-09-15T00:30:00Z', '2026-09-15T00:41:00Z')).toBe('11 分前');
    expect(MV.freshText('2026-09-14T20:41:00Z', '2026-09-15T00:41:00Z')).toBe('4 時間前');
    expect(MV.freshText('', '2026-09-15T00:41:00Z')).toBe('');
  });

  test('clockText / sizeText の形', function() {
    expect(MV.clockText('2026-09-15T00:41:07Z')).toBe('00:41:07');
    expect(MV.clockText('')).toBe('');
    expect(MV.sizeText(999)).toBe('999 バイト');
    expect(MV.sizeText(2048)).toBe('2 KB');
    expect(MV.sizeText(0)).toBe('');
  });
});
