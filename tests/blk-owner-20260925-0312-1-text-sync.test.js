'use strict';
// BLK-owner-20260925-0312-1 / BLK-human-20260925-0351: フォーム・選択パネル・窓から足した行が、
// タブを替えるまで自動保存にもタブの本文にも届かず、リロードでフォームだけで起こした図が消えた。
// 本文を書き換えた後始末は scheduleRefresh の 1 本道 (MA.textSync の判定) を通す。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/text-sync.js')]; } catch (e) {}
require('../src/core/text-sync.js');
var TS = global.window.MA.textSync;

var A = { id: 'd1', dsl: '@startuml\n@enduml' };
var ADDED = '@startuml\n[*] --> Idle\n@enduml';

// ── フォームで足した行 (エディタの本文がタブの本文と違う) は、タブへ書き戻して保存に載せる ──
(function() {
  var d = TS.decide({ id: 'd1', text: A.dsl }, A, ADDED);
  assert.strictEqual(d.writeDoc, true);
  assert.strictEqual(d.save, true);
  assert.deepStrictEqual(d.next, { id: 'd1', text: ADDED });
})();

// 初回 (まだ基準が無い) でも、本文がタブと違えば書き戻して保存する (起動直後にフォームで足した回)。
(function() {
  var d = TS.decide(null, A, ADDED);
  assert.strictEqual(d.writeDoc, true);
  assert.strictEqual(d.save, true);
})();

// ── 一括操作のように workspace を先に書き換えた経路も、同じタブで本文が動いたなら保存に載せる ──
(function() {
  var doc = { id: 'd1', dsl: ADDED };
  var d = TS.decide({ id: 'd1', text: A.dsl }, doc, ADDED);
  assert.strictEqual(d.writeDoc, false);
  assert.strictEqual(d.save, true);
})();

// ── 何も変わっていない描画 (再描画・ズーム) では書かない ──
(function() {
  var d = TS.decide({ id: 'd1', text: A.dsl }, A, A.dsl);
  assert.strictEqual(d.writeDoc, false);
  assert.strictEqual(d.save, false);
})();

// ── タブを替えた・開いただけ (前回と別のタブで、中身がタブの本文のまま) は書かない ──
(function() {
  var B = { id: 'd2', dsl: '@startuml\nA -> B\n@enduml' };
  var d = TS.decide({ id: 'd1', text: ADDED }, B, B.dsl);
  assert.strictEqual(d.writeDoc, false);
  assert.strictEqual(d.save, false);
  assert.deepStrictEqual(d.next, { id: 'd2', text: B.dsl });
  // 起動直後の最初の描画も同じ (開いただけの図をディスクへ書き直さない)。
  var d0 = TS.decide(null, B, B.dsl);
  assert.strictEqual(d0.save, false);
})();

// ── 図種の切り替えで見本を入れた後は基準を控え、次の描画で保存に載せない ──
(function() {
  var TPL = '@startuml\n[*] --> Idle\nIdle --> Running\n@enduml';
  var doc = { id: 'd1', dsl: TPL };
  var base = TS.baseline(doc, TPL);
  assert.deepStrictEqual(base, { id: 'd1', text: TPL });
  var d = TS.decide(base, doc, TPL);
  assert.strictEqual(d.save, false);
  // その後フォームで 1 行足せば保存に載る。
  var d2 = TS.decide(d.next, doc, TPL.replace('@enduml', 'Running --> Idle\n@enduml'));
  assert.strictEqual(d2.save, true);
  assert.strictEqual(d2.writeDoc, true);
})();

// タブが無い (workspace 未初期化) ときは何もしない。
(function() {
  var d = TS.decide({ id: 'd1', text: 'x' }, null, 'y');
  assert.strictEqual(d.writeDoc, false);
  assert.strictEqual(d.save, false);
  assert.strictEqual(TS.baseline(null, 'y'), null);
})();

// ── app.js: 後始末は 1 本道。本文欄の input も scheduleRefresh 経由で同じ後始末を使う ──
(function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  var sched = src.slice(src.indexOf('function scheduleRefresh()'), src.indexOf('function pinPreviewIfEdited()'));
  assert.ok(/syncEditedText\(\);/.test(sched), 'scheduleRefresh が syncEditedText を呼ぶ');
  var fn = src.slice(src.indexOf('function syncEditedText()'), src.indexOf('function markTextSynced()'));
  assert.ok(/workspace|WS\.updateActive/.test(fn), 'syncEditedText がタブの本文を書き戻す');
  assert.ok(/autoSave\.scheduleSave\(/.test(fn), 'syncEditedText が自動保存に載せる');
  assert.ok(/renderDiffBadge\(\)/.test(fn), 'syncEditedText がタブの印を引き直す');
  // 本文欄の input ハンドラは自前で workspace / autoSave を呼ばない (経路を 2 本にしない)。
  var inp = src.indexOf("editorEl.addEventListener('input', function() {");
  assert.ok(inp > 0);
  var body = src.slice(inp, src.indexOf('});', inp));
  assert.ok(!/autoSave\.scheduleSave/.test(body), 'input ハンドラに自動保存の別経路が残っていない');
  assert.ok(!/workspace\.updateActive/.test(body), 'input ハンドラに workspace の別経路が残っていない');
  assert.ok(/scheduleRefresh\(\)/.test(body));
  // 図種の切り替えとタブの表示は基準を控える (見本・開いただけの中身を保存に載せない)。
  var apply = src.slice(src.indexOf('function applyActiveDoc()'), src.indexOf('function switchToDoc('));
  assert.ok(/markTextSynced\(\)/.test(apply), 'applyActiveDoc が基準を控える');
  var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
  assert.ok(html.indexOf('src="src/core/text-sync.js"') > 0 &&
    html.indexOf('src="src/core/text-sync.js"') < html.indexOf('src="src/app.js"'), 'text-sync.js を app.js より前に読む');
})();

console.log('blk-owner-20260925-0312-1-text-sync: ok');
