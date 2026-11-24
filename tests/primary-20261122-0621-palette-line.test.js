'use strict';
// TICKET-primary-20261122-0621-wish (roadmap v7.0 必須 3)
// 同名ラベルの混ざる図で、指摘の言う行番号か名前を Ctrl+K に打つだけでその 1 本を選ぶ。
//   - 行番号 (「15」「L15」「15 行目」) を打つと、その行の候補がどの見出しの候補よりも先頭に出る
//   - ラベルを打つと同名の候補が行の順に全部並び、各行に行番号と From / To がある
//   - 6 図種の既存の候補・語は変えない (数字でない問い合わせの並びは前と同じ)

const CP = () => window.MA.commandPalette;

const SEQ = [
  '@startuml',
  "' レビュー用 通信手順(同名ラベルあり)",
  'skinparam sequenceMessageAlign center',
  'skinparam shadowing false',
  '',
  'participant Ctl',
  'participant CtlMon',
  'participant Bus',
  'participant Dev',
  '',
  "' --- 起動 ---",
  'Ctl -> Bus : Open()',
  "    ' 字下げは手で揃えたもの",
  '    Bus -> Dev : Open()',
  'CtlMon -> Bus : Open()',
  "' --- 読み ---",
  'Ctl -> Bus : Read()',
  'CtlMon -> Bus : Read()',
  'Bus --> Ctl : done',
  'Bus --> CtlMon : done',
  '@enduml',
].join('\n');

// 図に足す見出し (jump より前の見出し) に、数字や同じ語を含む行があっても先頭を取らせない。
const CMDS = [
  { id: 'add-15', group: 'add', title: '15 行の雛形を足す', keywords: ['15', 'done', 'open()'] },
  { id: 'save', title: 'ファイルを保存 / Save', keywords: ['保存'] },
];

function ids(items) { return items.map((i) => i.id); }

describe('Ctrl+K: 行番号・名前で同名ラベルの 1 本を名指しする (TICKET-primary-20261122-0621-wish)', () => {
  test('lineQuery: 行番号だけの問い合わせを読む', () => {
    expect(CP().lineQuery('15')).toBe(15);
    expect(CP().lineQuery(' L15 ')).toBe(15);
    expect(CP().lineQuery('l 15')).toBe(15);
    expect(CP().lineQuery('15 行目')).toBe(15);
    expect(CP().lineQuery('15行目')).toBe(15);
    expect(CP().lineQuery('Open()')).toBe(null);
    expect(CP().lineQuery('15a')).toBe(null);
    expect(CP().lineQuery('')).toBe(null);
  });

  test('行番号を打つと、その行の候補が図に足す見出しの行より先頭に出る', () => {
    const items = CP().buildItems(CMDS, SEQ);
    const got = CP().filter(items, '15');
    expect(got[0].id).toBe('relation:15');
    expect(got[0].title).toBe('CtlMon -> Bus : Open()');
    expect(got[0].hint).toBe('15 行目');
  });

  test('「L15」「15 行目」でも同じ行が先頭', () => {
    const items = CP().buildItems(CMDS, SEQ);
    expect(CP().filter(items, 'L15')[0].id).toBe('relation:15');
    expect(CP().filter(items, '15 行目')[0].id).toBe('relation:15');
  });

  test('宣言の行も行番号で先頭に出る (要素へ移動の 1 本道)', () => {
    const items = CP().buildItems(CMDS, SEQ);
    expect(CP().filter(items, '7')[0].id).toBe('element:7');
  });

  test('図に無い行番号では、行番号の先取りは起きない', () => {
    const items = CP().buildItems(CMDS, SEQ);
    const got = CP().filter(items, '99');
    expect(got.some((i) => i.group === 'jump')).toBe(false);
  });

  test('ラベルを打つと同名の候補が行の順に全部並び、行番号と From / To が読める', () => {
    const items = CP().buildItems([], SEQ);
    const opens = CP().filter(items, 'Open()').filter((i) => i.group === 'jump');
    expect(ids(opens)).toEqual(['relation:12', 'relation:14', 'relation:15']);
    expect(opens.map((i) => i.hint)).toEqual(['12 行目', '14 行目', '15 行目']);
    expect(opens.map((i) => i.title)).toEqual(['Ctl -> Bus : Open()', 'Bus -> Dev : Open()', 'CtlMon -> Bus : Open()']);
    const dones = CP().filter(items, 'done').filter((i) => i.group === 'jump');
    expect(ids(dones)).toEqual(['relation:19', 'relation:20']);
    expect(dones.map((i) => i.title)).toEqual(['Bus --> Ctl : done', 'Bus --> CtlMon : done']);
  });

  test('数字でない問い合わせの並びは前と同じ (見出し順: 図に足すが先)', () => {
    const items = CP().buildItems(CMDS, SEQ);
    expect(CP().filter(items, 'done')[0].id).toBe('add:add-15');
  });
});
