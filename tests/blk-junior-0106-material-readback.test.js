'use strict';
// BLK-junior-20260915-0106: 手順7「保存した .puml を開き直して指摘の内容が
// 反映されているか確かめる」を、資料化モーダルの中で済ませる。置けたこと
// (material-verify) では足りず、本文そのものが読めないといけない。

var W = (typeof window !== 'undefined' && window) || global.window;
var MR = W.MA.materialReadback;

var PLAN = { docName: 'TIMERドライバコンポーネント構成(資料用)' };

var DSL = [
  '@startuml',
  'title TIMERドライバコンポーネント構成(資料用)',
  'component TimerDrv',
  'note top of TimerDrv : 指摘2 への回答: ClockCtrl は意図的に割愛',
  '@enduml',
].join('\n');

describe('material-readback: 保存先の本文を資料化のその場で読む', function() {
  test('読み直せて一致すれば、行数と「同じです」が 1 行になる', function() {
    var r = MR.report(DSL, DSL, PLAN);
    expect(r.status).toBe('same');
    expect(r.lineCount).toBe(5);
    expect(r.text).toContain('TIMERドライバコンポーネント構成(資料用).puml を読み直しました');
    expect(r.text).toContain('5 行');
    expect(r.text).toContain('同じです');
  });

  test('本文がそのまま返るので、指摘の note を画面で読める', function() {
    var r = MR.report(DSL, DSL, PLAN);
    expect(r.body).toContain('note top of TimerDrv : 指摘2 への回答');
    expect(r.lines[3]).toContain('意図的に割愛');
  });

  test('改行コードの差だけでは食い違いと言わない', function() {
    var r = MR.report(DSL.replace(/\n/g, '\r\n') + '\r\n', DSL, PLAN);
    expect(r.status).toBe('same');
  });

  test('書き込んだ本文と違えば、保存先にある方だと分かる言葉になる', function() {
    var r = MR.report(DSL.replace('意図的に割愛', '未対応'), DSL, PLAN);
    expect(r.status).toBe('diff');
    expect(r.text).toContain('食い違います');
    expect(r.body).toContain('未対応');
  });

  test('読めなければ、一覧で開く道筋を言う (黙って空にしない)', function() {
    var r = MR.report(null, DSL, PLAN);
    expect(r.status).toBe('unreadable');
    expect(r.lineCount).toBe(0);
    expect(r.text).toContain('読み直せませんでした');
    expect(r.text).toContain('FILES の保存先');
  });

  test('空文字が返るのも読めなかった扱いにする', function() {
    expect(MR.report('   \n  ', DSL, PLAN).status).toBe('unreadable');
  });

  test('探している言葉を含む行を行番号付きで拾える', function() {
    var hits = MR.findLines(DSL, 'note');
    expect(hits.length).toBe(1);
    expect(hits[0].no).toBe(4);
    expect(hits[0].text).toContain('ClockCtrl');
    expect(MR.findLines(DSL, '').length).toBe(0);
    expect(MR.findLines(DSL, 'ありえない語').length).toBe(0);
  });
});
