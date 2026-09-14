'use strict';
// BLK-reviewer-20260914-1406-wish: 「名乗っている図種」と「本文が描く図種」の食い違いを
// 機械的に言う。事故の実物は plantuml-usecase.puml の中身が
// dma_transfer_sequence.puml と丸ごと同じになっていたもので、31 枚を 1 枚ずつ
// 読むまで誰も気付けなかった。
const KM = window.MA.kindMismatch;

const SEQ = ['@startuml', 'title DMA 転送シーケンス',
  'participant Dma_Driver', 'participant Spi_Driver',
  'Dma_Driver -> Spi_Driver : Dma_Start', '@enduml'].join('\n');
const UC = ['@startuml', 'left to right direction', 'actor 開発者',
  '(ドライバを設定する)', '開発者 --> (ドライバを設定する)', '@enduml'].join('\n');
const CLS = ['@startuml', 'class Driver_Common {', '  + Init() : void', '}', '@enduml'].join('\n');

describe('kindMismatch — ファイル名の名乗り', function() {
  test('名前に書いてある図種を読む', function() {
    expect(KM.nameKind('plantuml-usecase.puml')).toBe('usecase');
    expect(KM.nameKind('dma_transfer_sequence')).toBe('sequence');
    expect(KM.nameKind('driver_common_class')).toBe('class');
  });
  test('割れた書き方 (use case) も 1 つの名乗りとして読む', function() {
    expect(KM.nameKind('driver_use_case')).toBe('usecase');
  });
  test('名乗りの無い名前・2 種類を名乗る名前は名乗り無し (推測で赤を出さない)', function() {
    expect(KM.nameKind('diagram1')).toBe('');
    expect(KM.nameKind('gpio_state_sequence')).toBe('');
    expect(KM.nameKind(null)).toBe('');
  });
});

describe('kindMismatch — 名乗りと本文の突き合わせ', function() {
  test('事故そのもの: ユースケースを名乗るファイルの本文がシーケンス', function() {
    const row = KM.rowOf({ name: 'plantuml-usecase', dsl: SEQ });
    expect(row.mismatch).toBe(true);
    expect(row.severity).toBe('mismatch');
    expect(row.declared).toBe('usecase');
    expect(row.actual).toBe('sequence');
    expect(row.text).toContain('名乗りはユースケース図、本文はシーケンス図');
  });
  test('名乗りどおりの図は食い違いにしない', function() {
    expect(KM.rowOf({ name: 'plantuml-usecase', dsl: UC }).mismatch).toBe(false);
    expect(KM.rowOf({ name: 'driver_common_class', dsl: CLS }).mismatch).toBe(false);
  });
  test('server が判定済みなら本文を読み直さず entry.kind を使う', function() {
    const row = KM.rowOf({ name: 'plantuml-usecase', kind: 'sequence' });
    expect(row.actual).toBe('sequence');
    expect(row.mismatch).toBe(true);
  });
  test('名乗りの無い図・図種を当てられない本文は「照合できない」', function() {
    const r1 = KM.rowOf({ name: 'diagram1', dsl: SEQ });
    expect(r1.comparable).toBe(false);
    expect(r1.mismatch).toBe(false);
    const r2 = KM.rowOf({ name: 'plantuml-usecase', dsl: '@startuml\n@enduml' });
    expect(r2.comparable).toBe(false);
    expect(r2.severity).toBe('unknown');
  });
  test('控え (savedKind) だけの名乗りは赤にせず注記にする', function() {
    // 保存時の控えは「紛らわしい書き方」で本文判定と普通に割れる (saved-kind.js)。
    const row = KM.rowOf({ name: 'diagram1', savedKind: 'usecase', dsl: SEQ });
    expect(row.declaredSource).toBe('saved');
    expect(row.mismatch).toBe(true);
    expect(row.severity).toBe('note');
    expect(row.text).toContain('名乗りは保存時の控え');
  });
  test('ファイル名の名乗りは控えより強い', function() {
    const row = KM.rowOf({ name: 'dma_transfer_sequence', savedKind: 'usecase', dsl: SEQ });
    expect(row.declaredSource).toBe('name');
    expect(row.mismatch).toBe(false);
  });
});

describe('kindMismatch — 一覧に出す 1 行と印', function() {
  const entries = [
    { name: 'plantuml-usecase', dsl: SEQ },
    { name: 'dma_transfer_sequence', dsl: SEQ },
    { name: 'driver_common_class', dsl: CLS },
    { name: 'diagram1', dsl: SEQ },
  ];
  test('食い違った図を名指しする', function() {
    const bad = KM.mismatches(entries);
    expect(bad.length).toBe(1);
    expect(bad[0].name).toBe('plantuml-usecase');
  });
  test('0 件でも「何枚を照合しての 0 件か」を書く', function() {
    const line = KM.summaryLine(entries.slice(1));
    expect(line).toContain('図種ずれ: なし');
    expect(line).toContain('3 枚中 2 枚を照合');
  });
  test('食い違いがあれば件数と図名が 1 行で出る', function() {
    expect(KM.summaryLine(entries)).toContain('図種ずれ: 1 件（plantuml-usecase）');
  });
  test('印は食い違った図だけに付く', function() {
    expect(KM.badge({ name: 'dma_transfer_sequence', dsl: SEQ })).toBe(null);
    const b = KM.badge({ name: 'plantuml-usecase', dsl: SEQ });
    expect(b.mark).toBe('⚠');
    expect(b.label).toBe('名乗り ユースケース / 本文 シーケンス');
  });
});

describe('kindMismatch — CLI 用の監査', function() {
  test('件数・図名・行が 1 回の呼び出しで出る', function() {
    const res = KM.audit([
      { name: 'primary/plantuml-usecase.puml', dsl: SEQ },
      { name: 'primary/dma_transfer_sequence.puml', dsl: SEQ },
      { name: 'primary/diagram1.puml', dsl: SEQ },
    ]);
    expect(res.files).toBe(3);
    expect(res.checked).toBe(2);
    expect(res.mismatched).toBe(1);
    expect(res.mismatchedNames).toEqual(['primary/plantuml-usecase.puml']);
    expect(res.rows.length).toBe(3);
  });
});
