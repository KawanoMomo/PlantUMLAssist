'use strict';
// BLK-junior-20260915-0307: 「部品を起こす」で開いた spi_sequence の図名を変えて
// Ctrl+S したら、保存フォルダに新しい名前と spi_sequence.puml が内容同一のまま
// 2 枚残り、Export の「1 枚を資料化」は古い spi_sequence 側を拾って
// spi_sequence(資料用).puml/png という変更前の名前で資料を作った。
// ここでは「前の名前のファイルをどうするか」の判断を固定する。

const RS = require('../src/core/rename-sweep');

describe('rename-sweep — 図名を変えたあとの前の名前のファイル', function() {
  const DSL = '@startuml\nA -> B : init()\n@enduml';

  test('前の名前のファイルが今の図そのものなら付け替える (残さない)', function() {
    const p = RS.plan({ from: 'spi_sequence', to: 'SPIドライバ初期化シーケンス',
      saved: true, oldDsl: DSL, currentDsl: DSL });
    expect(p.action).toBe('move');
    expect(p.text).toContain('spi_sequence.puml');
    expect(p.text).toContain('SPIドライバ初期化シーケンス.puml');
  });

  test('改行コードと行末の空白の違いだけなら同じ図とみなして付け替える', function() {
    const p = RS.plan({ from: 'a', to: 'b', saved: true,
      oldDsl: '@startuml\r\nA -> B  \r\n@enduml', currentDsl: '@startuml\nA -> B\n@enduml' });
    expect(p.action).toBe('move');
  });

  test('中身が違うなら別物なので残す (rename-guard の戻す口に任せる)', function() {
    const p = RS.plan({ from: 'GPIO (レビュー反映)', to: 'GPIO (先輩反映)', saved: true,
      oldDsl: '@startuml\n前周の完了物\n@enduml', currentDsl: DSL });
    expect(p.action).toBe('keep');
    expect(p.text).toContain('GPIO (レビュー反映).puml');
  });

  test('保存フォルダを使っていない / 前の名前のファイルが無いなら片付けるものは無い', function() {
    expect(RS.plan({ from: 'a', to: 'b', saved: false, oldDsl: DSL, currentDsl: DSL }).action).toBe('none');
    expect(RS.plan({ from: 'a', to: 'b', saved: true, oldDsl: null, currentDsl: DSL }).action).toBe('none');
  });

  test('名前が変わっていなければ何もしない', function() {
    expect(RS.plan({ from: 'a', to: 'a', saved: true })).toBe(null);
    expect(RS.plan({ from: '', to: 'b', saved: true })).toBe(null);
    expect(RS.plan(null)).toBe(null);
  });

  test('付け替えが済んだら「古い名前は残らない」と言う', function() {
    const p = RS.plan({ from: 'spi_sequence', to: 'SPI初期化', saved: true, oldDsl: DSL, currentDsl: DSL });
    expect(RS.resultText(p, { saved: true, deleted: true })).toContain('古い名前のファイルは残りません');
  });

  test('新しい名前で書けなかったら古い名前は消さないと言う', function() {
    const p = RS.plan({ from: 'spi_sequence', to: 'SPI初期化', saved: true, oldDsl: DSL, currentDsl: DSL });
    const t = RS.resultText(p, { saved: false });
    expect(t).toContain('SPI初期化.puml');
    expect(t).toContain('spi_sequence.puml はそのまま残しています');
  });

  test('古い名前を消せなかったら、資料化の対象に残ることまで言う', function() {
    const p = RS.plan({ from: 'spi_sequence', to: 'SPI初期化', saved: true, oldDsl: DSL, currentDsl: DSL });
    const t = RS.resultText(p, { saved: true, deleted: false, error: '保存フォルダに届きませんでした' });
    expect(t).toContain('消せませんでした');
    expect(t).toContain('資料化の対象に古い名前が残ります');
  });
});
