'use strict';
// BLK-reviewer-20260915-0007: 指摘トラッカーの既定の控えが、過去の事故を
// 引きずったまま「打った場所」で共有されており、素の実行が読めなくなっていた。
// (a) 事故で出来たフォルダ名を読み飛ばす (b) 既に控えに入った壊れた行は読む時に
// 落とす (c) 控えは対象フォルダの中に置く、の 3 つをここで固定する。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tracker = require('../src/core/finding-tracker');
const report = require('../tools/audit-report');
const findings = require('../tools/findings');

const JUNK = 'prev"cp -r E:01_Looppersona-dataprimary. E:01_Looploopruns20260909-0703tmp"';

describe('事故で出来たフォルダ名の見分け', function() {
  test('引用符・コマンド・展開し損ねの $ を持つ名前は事故と見なす', function() {
    assert.strictEqual(tracker.isJunkPath(JUNK), true);
    assert.strictEqual(tracker.isJunkPath('prevcp -r E01_Loop/x.puml'), true);
    assert.strictEqual(tracker.isJunkPath('prev$f'), true);
  });

  test('普通のフォルダ名・日本語の図名は事故にしない', function() {
    ['prev', 'gpio_init_sequence.puml', 'TIMERドライバ状態遷移(資料用).puml',
      '_versions', 'primary/driver_common_class.puml', 'plantuml-usecase-編集中.puml',
    ].forEach(function(n) {
      assert.strictEqual(tracker.isJunkPath(n), false, n);
    });
  });
});

describe('壊れた控えの掃除', function() {
  function stateWith(findingsMap) {
    return { version: tracker.VERSION, seq: 9, ticks: [{ label: 't1', at: 't1' }],
      findings: findingsMap };
  }

  test('事故のフォルダだけを指す行は落とす', function() {
    const r = tracker.pruneBroken(stateWith({
      a: { id: 'F-01', title: 'dma.ArmChannel()', docs: [JUNK + '/dma.puml'], verdict: null },
      b: { id: 'F-02', title: 'Clock.Enable', docs: ['gpio_init_sequence.puml'], verdict: null },
    }));
    assert.deepStrictEqual(Object.keys(r.state.findings), ['b']);
    assert.strictEqual(r.dropped.length, 1);
    assert.strictEqual(r.dropped[0].id, 'F-01');
  });

  test('正しい図にも出ている行は残し、指し先だけ掃除する (id を持ち越す)', function() {
    const r = tracker.pruneBroken(stateWith({
      a: { id: 'F-01', title: 'Clock.Enable', verdict: null,
        docs: ['gpio_init_sequence.puml', JUNK + '/gpio_init_sequence.puml'] },
    }));
    assert.strictEqual(r.dropped.length, 0);
    assert.deepStrictEqual(r.state.findings.a.docs, ['gpio_init_sequence.puml']);
  });

  test('人が貼った判断のある行は落とさない (判断は取り消さない)', function() {
    const r = tracker.pruneBroken(stateWith({
      a: { id: 'F-01', title: 'x', docs: [JUNK + '/x.puml'],
        verdict: { state: 'partial', note: 'svg のみ継続' } },
    }));
    assert.strictEqual(r.dropped.length, 0);
    assert.ok(r.state.findings.a);
  });
});

describe('集めるときに事故のフォルダを辿らない', function() {
  // 下ごしらえは test の中で組む (この repo の runner に beforeAll は無い)。
  function makeTree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blk0007-'));
    fs.mkdirSync(path.join(root, 'prev'));
    // Windows の実データと同じ形。引用符はフォルダ名に使えないので、
    // 実際に出来ていた `prevcp -r …` の形 (引用符が落ちた名前) で置く。
    const junkDir = path.join(root, 'prevcp -r E01_Looppersona-dataprimary. E01_Looptmp');
    fs.mkdirSync(junkDir);
    const dsl = ['@startuml', 'Alice -> Bob : Hi', '@enduml'].join('\n');
    fs.writeFileSync(path.join(root, 'gpio_init_sequence.puml'), dsl, 'utf-8');
    fs.writeFileSync(path.join(root, 'prev', 'gpio_init_sequence.puml'), dsl, 'utf-8');
    fs.writeFileSync(path.join(junkDir, 'gpio_init_sequence.puml'), dsl, 'utf-8');
    return root;
  }

  test('写しの中の .puml は集めず、読み飛ばした名前を呼ぶ側へ返す', function() {
    const root = makeTree();
    try {
      const skipped = [];
      const docs = report.collectDocs([root], { skipped: skipped });
      const names = docs.map(function(d) { return d.name; }).sort();
      assert.deepStrictEqual(names, ['gpio_init_sequence.puml', 'prev/gpio_init_sequence.puml']);
      assert.strictEqual(skipped.length, 1);
      assert.ok(skipped[0].indexOf('prevcp -r') === 0, skipped[0]);
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* noop */ }
    }
  });
});

describe('控えの既定の置き場所', function() {
  test('フォルダ 1 つを見ているなら、その中に置く (別の対象と混ざらない)', function() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blk0007-dir-'));
    const opts = findings.parseArgs([dir]);
    assert.strictEqual(opts.state, null);        // 打った場所には固定しない
    const p = findings.defaultStateFile(opts.targets);
    assert.strictEqual(path.dirname(path.resolve(p)), path.resolve(dir));
    assert.strictEqual(path.basename(p), '.findings-state.json');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* noop */ }
  });

  test('--state を書けばそこを使う (run 専用の控えに逃がせる)', function() {
    const opts = findings.parseArgs(['./x', '--state', 'runs/tmp/s.json']);
    assert.strictEqual(opts.state, 'runs/tmp/s.json');
  });

  test('フォルダを特定できないとき (監査JSON・複数) は打った場所に落とす', function() {
    assert.strictEqual(findings.defaultStateFile(['audit.json']), findings.STATE_FILE);
    assert.strictEqual(findings.defaultStateFile([]), findings.STATE_FILE);
  });
});
