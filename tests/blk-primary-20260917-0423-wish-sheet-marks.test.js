/**
 * BLK-primary-20260917-0423-wish — 書き出す前に、見出し・注記の有無を 1 枚の表で見る。
 *
 * 手順4 は 14 枚を 1 枚ずつフォルダから開いて中身を目で追うしかなく、
 * 「見出しが図名のまま」に至っては書き出した後 (doc-proof) しか言わないので、
 * 気付くのは zip を出した後だった。貼る前の一覧が図ごとに ○× を出し、
 * 空欄の行だけに絞れれば、手順は「一覧を見る → × の行を埋める」で終わる。
 * @jest-environment jsdom
 */
'use strict';

require('../src/core/doc-set.js');
require('../src/core/doc-layout.js');

const DL = () => window.MA.docLayout;

// 顧客向け 4 枚。1 枚目だけ揃っていて、2 枚目は注記が空、
// 3 枚目は見出しが空 (= 図名のまま)、4 枚目は保存フォルダに無い。
const SET = {
  name: '顧客レビュー',
  docs: ['spi_seq', 'spi_state', 'timer_seq', 'gone'],
  items: [
    { name: 'spi_seq', heading: 'SPI 初期化の流れ', note: '起動時に 1 度だけ通る' },
    { name: 'spi_state', heading: 'SPI の状態', note: '' },
    { name: 'timer_seq', heading: '', note: 'TIMER の初期化' },
    { name: 'gone', heading: '', note: '' },
  ],
};
const FOLDER = ['spi_seq', 'spi_state', 'timer_seq'];

describe('図ごとの ○×', () => {
  test('見出しと注記の有無が、図ごとに 1 行で出る', () => {
    const marks = DL().sheetMarks(DL().sheet(SET, FOLDER));
    expect(marks.length).toBe(4);
    expect(marks[0]).toEqual({ no: 1, name: 'spi_seq', present: true, heading: true, note: true, ok: true });
    expect(marks[1]).toEqual({ no: 2, name: 'spi_state', present: true, heading: true, note: false, ok: false });
    expect(marks[2]).toEqual({ no: 3, name: 'timer_seq', present: true, heading: false, note: true, ok: false });
  });

  test('保存フォルダに無い図は、見出し・注記を ○ と言わない', () => {
    const marks = DL().sheetMarks(DL().sheet(SET, FOLDER));
    expect(marks[3]).toEqual({ no: 4, name: 'gone', present: false, heading: false, note: false, ok: false });
  });

  test('空欄の残る行だけを引ける (直す行がそのまま出る)', () => {
    const blanks = DL().blankRows(DL().sheet(SET, FOLDER));
    expect(blanks.map((b) => b.name)).toEqual(['spi_state', 'timer_seq', 'gone']);
  });

  test('全部そろえば空欄は 0 行で、ready になる', () => {
    const full = {
      name: '顧客レビュー',
      docs: ['a', 'b'],
      items: [{ name: 'a', heading: 'あ', note: 'A' }, { name: 'b', heading: 'い', note: 'B' }],
    };
    const sh = DL().sheet(full, ['a', 'b']);
    expect(DL().blankRows(sh)).toEqual([]);
    expect(sh.ready).toBe(true);
    expect(DL().sheetClass(sh)).toBe('dl-ready');
  });
});

describe('見出しが図名のままの図を、書き出す前に名指しする', () => {
  test('sheet が untitled を挙げる', () => {
    const sh = DL().sheet(SET, FOLDER);
    expect(sh.untitled.map((e) => e.name)).toEqual(['timer_seq']);
    expect(sh.ready).toBe(false);
  });

  test('要約が見出しの空きも枚数で言う (今までは注記だけだった)', () => {
    const line = DL().sheetSummary(DL().sheet(SET, FOLDER));
    expect(line).toContain('見出しが図名のままの図 1 枚');
    expect(line).toContain('1 行説明が空の図 1 枚');
  });

  test('見出しだけ空でも「そろっています」とは言わない', () => {
    const one = { name: 'x', docs: ['a'], items: [{ name: 'a', heading: '', note: 'A' }] };
    const sh = DL().sheet(one, ['a']);
    expect(DL().sheetSummary(sh)).not.toContain('そろっています');
    expect(DL().sheetClass(sh)).toBe('dl-blank');
  });
});
