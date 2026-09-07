'use strict';
// BLK-reviewer-20260907-0803-2: node から監査モジュールを呼ぶときの詰まり。
//
// 起票者は (a) `window` を自分で仕込み、(b) 依存する src/core を手で require し、
// (c) 図 1 枚の綴りが `dsl` か `text` かを実行時エラーではなく「空の結果」から
// 推測する、という 3 段を毎回踏んでいた。(a)(b) は tools/audit-runtime.js の
// loadMA() が引き受ける。ここでは
//   - loadMA() が読み込みエラー無しで MA を返し、監査が全部生えていること
//   - docsFrom() が監査モジュールの期待する形で .puml を集めること
//   - `{name, text}` で渡しても `{name, dsl}` と同じ結果になること (綴りの取り違えで
//     静かに 0 件にならない)
// を検証する。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA, docsFrom } = require('../tools/audit-runtime');

const CLS = [
  '@startuml',
  'class Timer {',
  '+ Timer_StartConv() : void',
  '}',
  '@enduml',
].join('\n');

const SEQ = [
  '@startuml',
  'participant Timer',
  'participant App',
  'App -> Timer : Timer_StartConv()',
  'App -> Timer : Timer_Missing()',
  '@enduml',
].join('\n');

const rt = loadMA();

describe('loadMA — window を自分で仕込まずに監査を呼べる', function() {
  test('読み込みエラーが 1 件も無い', function() {
    assert.deepStrictEqual(rt.errors, []);
  });

  test('監査モジュールが 4 つとも生えている', function() {
    ['nameAudit', 'methodAudit', 'consistency', 'familyAudit'].forEach(function(k) {
      assert.ok(rt.MA[k], k + ' が読めていない');
    });
  });

  test('global.window を汚さない (同じプロセスの他のテストを壊さない)', function() {
    assert.notStrictEqual(rt.window, global.window);
  });
});

describe('docsFrom — 監査に渡す形で .puml を集める', function() {
  test('name / dsl / path を持つ配列を返す', function() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-audit-'));
    fs.writeFileSync(path.join(dir, 'cls.puml'), CLS, 'utf-8');
    const docs = docsFrom(dir);
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].name, 'cls.puml');
    assert.strictEqual(docs[0].dsl, CLS);
    assert.ok(docs[0].path);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('図 1 枚は dsl でも text でも読める (取り違えで 0 件にしない)', function() {
  const asDsl = [{ name: 'cls.puml', dsl: CLS }, { name: 'seq.puml', dsl: SEQ }];
  const asText = [{ name: 'cls.puml', text: CLS }, { name: 'seq.puml', text: SEQ }];

  test('nameAudit', function() {
    const a = rt.MA.nameAudit.audit(asDsl);
    const b = rt.MA.nameAudit.audit(asText);
    assert.ok(a.names.length > 0);
    assert.deepStrictEqual(b, a);
  });

  test('methodAudit — 不一致 1 件が両方で出る', function() {
    const a = rt.MA.methodAudit.audit(asDsl);
    const b = rt.MA.methodAudit.audit(asText);
    assert.ok(a.issues.length > 0);
    assert.deepStrictEqual(b.issues, a.issues);
  });

  test('consistency', function() {
    const a = rt.MA.consistency.check(asDsl);
    const b = rt.MA.consistency.check(asText);
    assert.deepStrictEqual(b, a);
  });

  test('dsl と text の両方があれば dsl を採る', function() {
    assert.strictEqual(rt.MA.dslUtils.docDsl({ dsl: 'A', text: 'B' }), 'A');
  });

  test('どちらも無ければ空文字 (例外にはしない)', function() {
    assert.strictEqual(rt.MA.dslUtils.docDsl({ name: 'x' }), '');
    assert.strictEqual(rt.MA.dslUtils.docDsl(null), '');
  });
});
