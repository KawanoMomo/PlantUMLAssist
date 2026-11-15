'use strict';
// BLK-reviewer-20260914-1806: 「本体差し替え待ちの下書き」を、GUI を開かずに
// テキストだけで判別する。守るのは 2 つ。
//   (1) 前回控えとの枚数差 (32 → 25 枚) の内訳で、改名が「消失 + 追加」に化けないこと。
//       化けると reviewer は ls と diff で消えた図を確かめ直すことになる。
//   (2) 新しく増えた下書きが、増えた図と同じ列で数えられないこと。
const assert = require('assert');
const scope = require('../src/core/audit-scope');


function entries(list) {
  return scope.fileEntries(list);
}

describe('BLK-1806 前回控えとの差の内訳', function() {
  const prev = entries([
    { name: 'gpio_state.puml', dsl: '@startuml\nstate Idle\n@enduml' },
    { name: 'spi_state.puml', dsl: '@startuml\nstate Init\n@enduml' },
    { name: 'old_name.puml', dsl: '@startuml\nstate Same\n@enduml' },
  ]);
  const cur = entries([
    { name: 'gpio_state.puml', dsl: '@startuml\nstate Idle\n@enduml' },
    // old_name が改名されただけ (中身は同じ)。
    { name: 'new_name.puml', dsl: '@startuml\nstate Same\n@enduml' },
    // 新しく起こした下書き。
    { name: 'gpio_state-編集中.puml', dsl: '@startuml\nstate Idle\nstate Busy\n@enduml' },
  ]);

  const fd = scope.diffFiles(prev, cur);

  test('同じ指紋の消失と追加は改名として出る', function() {
    assert.deepStrictEqual(fd.renamed.map((r) => r.from + ' → ' + r.to), ['old_name.puml → new_name.puml']);
    assert.ok(!fd.added.some((f) => f.name === 'new_name.puml'), '改名が追加に残っている');
    assert.ok(!fd.removed.some((f) => f.name === 'old_name.puml'), '改名が消失に残っている');
  });

  test('本当に無くなった図だけが消失に残る', function() {
    assert.deepStrictEqual(fd.removed.map((f) => f.name), ['spi_state.puml']);
  });

  test('新しく増えた下書きは、増えた図の中で数え分けられる', function() {
    assert.deepStrictEqual(fd.addedDrafts.map((f) => f.name), ['gpio_state-編集中.puml']);
  });

  test('改名は「変化なし」に埋もれない', function() {
    assert.ok(fd.touched >= 1);
    const text = scope.formatFileDiff(fd, cur).join('\n');
    assert.ok(text.indexOf('改名: old_name.puml → new_name.puml') !== -1, text);
    assert.ok(text.indexOf('うち新しい下書き 1 枚') !== -1, text);
  });

  test('改名が無ければ改名の行は出ない', function() {
    const same = scope.diffFiles(prev, prev);
    assert.deepStrictEqual(same.renamed, []);
    assert.ok(scope.formatFileDiff(same, prev).join('\n').indexOf('改名') === -1);
  });

  test('下書きの見分けは sync-state の接尾辞に従う', function() {
    assert.strictEqual(scope.draftBaseOf('junior/a-編集中.puml'), 'junior/a');
    assert.strictEqual(scope.draftBaseOf('junior/a.puml'), null);
  });
});
