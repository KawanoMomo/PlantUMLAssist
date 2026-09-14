'use strict';
// BLK-primary-20260914-1806-wish: 「新人に引き継ぐ」場面で全図を SVG にしたら、zip に
// 入ったのはその回に開いた 2 枚だけだった。書き出しの対象が「開いているタブ」なので、
// 渡したい 14 枚を毎回 1 枚ずつ開き直すのが手順になっていた。
// 📂一覧で印を付けた図を、開かずにそのまま書き出せるようにする。
const FE = window.MA.folderExport;

const NAMES = ['spi_init_sequence', 'spi_state', 'can_init_sequence', 'driver_common_class'];

describe('folderExport — 書き出す図の並び', function() {
  test('印を付けた図を一覧の並びのまま返す (押した順ではない)', function() {
    expect(FE.toExport(['driver_common_class', 'spi_init_sequence'], NAMES))
      .toEqual(['spi_init_sequence', 'driver_common_class']);
  });
  test('開いているタブかどうかは見ない (開いていない図を出すのが目的)', function() {
    expect(FE.toExport(NAMES, NAMES)).toEqual(NAMES);
  });
  test('一覧に無い名前・重複した印は落とす', function() {
    expect(FE.toExport(['spi_state', 'spi_state', 'もう無い図'], NAMES)).toEqual(['spi_state']);
    expect(FE.toExport([], NAMES)).toEqual([]);
    expect(FE.toExport(null, null)).toEqual([]);
  });
});

describe('folderExport — 読めた本文を書き出す形にする', function() {
  const texts = {
    spi_init_sequence: '@startuml\nparticipant Spi_Driver\n@enduml',
    spi_state: '@startuml\n[*] --> Idle\n@enduml',
    can_init_sequence: '   ',
  };
  test('bulk-export が読む {name, dsl} にする', function() {
    const built = FE.docsFrom(['spi_init_sequence', 'spi_state'], texts);
    expect(built.docs.map((d) => d.name)).toEqual(['spi_init_sequence', 'spi_state']);
    expect(built.docs[0].dsl).toContain('participant Spi_Driver');
    expect(built.missing).toEqual([]);
  });
  test('読めなかった図・空の図は落とし、名前を残す (黙って減らさない)', function() {
    const built = FE.docsFrom(['spi_state', 'can_init_sequence', 'driver_common_class'], texts);
    expect(built.docs.map((d) => d.name)).toEqual(['spi_state']);
    expect(built.missing).toEqual(['can_init_sequence', 'driver_common_class']);
  });
  test('1 枚も読めなくても落ちない', function() {
    expect(FE.docsFrom(['x'], null)).toEqual({ docs: [], missing: ['x'] });
  });
});

describe('folderExport — ボタンの文言', function() {
  test('枚数を出す (押せないときも理由が文言で分かる)', function() {
    expect(FE.buttonLabel(14)).toBe('選んだ図を SVG で書き出す（14 枚）');
    expect(FE.buttonLabel(0)).toBe('選んだ図を SVG で書き出す（0 枚）');
    expect(FE.buttonLabel(null)).toContain('0 枚');
  });
  test('読めなかった図は書き出しの後の 1 行に足す', function() {
    expect(FE.missingNote(['a', 'b'])).toBe('（読めなかった図 2 枚: a, b）');
    expect(FE.missingNote([])).toBe('');
  });
});
