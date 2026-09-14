'use strict';
// BLK-reviewer-20260914-1806: 「本体差し替え待ちの下書き」を、GUI を開かずに
// テキストだけで判別する。守るのは 2 つ。
//   (1) 前回控えとの枚数差 (32 → 25 枚) の内訳で、改名が「消失 + 追加」に化けないこと。
//       化けると reviewer は ls と diff で消えた図を確かめ直すことになる。
//   (2) 新しく増えた下書きが、増えた図と同じ列で数えられないこと。
const assert = require('assert');
const scope = require('../src/core/audit-scope');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

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

describe('BLK-1806 --drafts', function() {
  const dir = path.join(REPO, 'test-results', 'blk-1806-drafts');

  function setup() {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const base = '@startuml\nstate Idle\n@enduml';
    // 本体へ差し替え待ち (下書きの方が新しく、中身も違う)。
    fs.writeFileSync(path.join(dir, 'gpio_state.puml'), base, 'utf-8');
    fs.writeFileSync(path.join(dir, 'gpio_state-編集中.puml'), base + '\nstate Busy', 'utf-8');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(path.join(dir, 'gpio_state.puml'), old, old);
    // もう消してよい下書き (本体と中身が同じ)。
    fs.writeFileSync(path.join(dir, 'spi_state.puml'), base, 'utf-8');
    fs.writeFileSync(path.join(dir, 'spi_state-編集中.puml'), base, 'utf-8');
    // 下書きの無い図はキューに載らない。
    fs.writeFileSync(path.join(dir, 'can_state.puml'), base, 'utf-8');
  }

  test('差し替え待ちと削除予定を、GUI を開かずに名指しできる', function() {
    setup();
    const out = execFileSync(process.execPath,
      [path.join(REPO, 'tools', 'audit.js'), dir, '--drafts'],
      { cwd: REPO, encoding: 'utf-8' });
    assert.ok(out.indexOf('下書き 2 枚') !== -1, out);
    assert.ok(out.indexOf('本体へ差し替え待ち 1 枚') !== -1, out);
    assert.ok(out.indexOf('gpio_state-編集中.puml → gpio_state.puml') !== -1, out);
    assert.ok(out.indexOf('spi_state-編集中.puml → spi_state.puml … 削除予定') !== -1, out);
    assert.ok(out.indexOf('can_state') === -1, '下書きの無い図が混ざっている');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('下書きが 1 枚も無ければ、黙らずにそう言う', function() {
    const empty = path.join(REPO, 'test-results', 'blk-1806-drafts-none');
    fs.rmSync(empty, { recursive: true, force: true });
    fs.mkdirSync(empty, { recursive: true });
    fs.writeFileSync(path.join(empty, 'gpio_state.puml'), '@startuml\nstate Idle\n@enduml', 'utf-8');
    const out = execFileSync(process.execPath,
      [path.join(REPO, 'tools', 'audit.js'), empty, '--drafts'],
      { cwd: REPO, encoding: 'utf-8' });
    assert.ok(out.indexOf('編集中の下書きはありません') !== -1, out);
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
