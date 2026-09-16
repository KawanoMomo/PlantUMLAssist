'use strict';
// BLK-human-20260915-1205: 途中から actor / participant / database を足すと、
// 宣言行が DSL の最後 (メッセージの後ろ) に入っていた。DSL を「参加者の欄」と
// 「シーケンスの欄」の 2 領域として扱い、宣言は必ず参加者の欄の末尾に入ること、
// 見出し (`title` / `skinparam` / `!include`) を跨がないことを機械判定する。
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var SRC = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js', '../src/core/note-edit.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/ui/properties.js',
  '../src/core/sequence-marks.js',
  '../src/core/sequence-activation-insert.js',
  '../src/core/sequence-participant-zone.js',
  '../src/modules/sequence.js',
];
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var PZ = window.MA.seqParticipantZone;
var seq = window.MA.modules.plantumlSequence;

SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });

var assert = require('assert');
var results = [];
function t(name, fn) {
  try { fn(); results.push({ name: name, ok: true }); }
  catch (e) { results.push({ name: name, ok: false, err: e }); }
}
function L(arr) { return arr.join('\n'); }

// ── 行の見分け ──────────────────────────────────────────────────────────
t('isDeclaration: 8 種の宣言を宣言と見る', function() {
  PZ.TYPES.forEach(function(ty) {
    assert.ok(PZ.isDeclaration(ty + ' A'), ty);
  });
  assert.strictEqual(PZ.TYPES.length, 8);
});

t('isDeclaration: 色・as・order が付いても宣言', function() {
  assert.ok(PZ.isDeclaration('participant "受付" as Front #AliceBlue'));
  assert.ok(PZ.isDeclaration('actor User order 10'));
  assert.ok(PZ.isDeclaration('  database DB  '));
});

t('isDeclaration: メッセージや制御構造は宣言ではない', function() {
  assert.ok(!PZ.isDeclaration('A -> B : req'));
  assert.ok(!PZ.isDeclaration('activate B'));
  assert.ok(!PZ.isDeclaration('alt 正常'));
  assert.ok(!PZ.isDeclaration('note over A : memo'));
  assert.ok(!PZ.isDeclaration(''));
});

t('isHeader: 見出しの指令を見出しと見る (宣言は見出しではない)', function() {
  ['@startuml', 'title 図の名前', 'skinparam monochrome true', '!include common.puml',
   '!theme plain', 'autonumber', 'hide footbox', 'scale 2'].forEach(function(l) {
    assert.ok(PZ.isHeader(l), l);
  });
  assert.ok(!PZ.isHeader('participant A'));
  assert.ok(!PZ.isHeader('A -> B : req'));
});

// ── 欄の範囲 ────────────────────────────────────────────────────────────
var BASE = [
  '@startuml',               // 0
  'title 受付の流れ',         // 1
  'skinparam monochrome true',// 2
  '',                        // 3
  'actor User',              // 4
  'participant Front',       // 5
  '',                        // 6
  'User -> Front : 申し込む', // 7
  'Front --> User : 受付番号',// 8
  '@enduml',                 // 9
];

t('find: 見出しの後ろが参加者の欄になる', function() {
  var z = PZ.find(L(BASE));
  assert.strictEqual(z.firstDecl, 4);
  assert.strictEqual(z.lastDecl, 5);
  assert.strictEqual(z.count, 2);
  assert.strictEqual(z.firstBody, 7);
  assert.strictEqual(z.insertAt, 6);   // 既存の宣言の直後
});

t('find: 宣言が 1 つも無ければ、最初のメッセージの直前が欄になる', function() {
  var z = PZ.find(L(['@startuml', 'title t', 'A -> B : req', '@enduml']));
  assert.strictEqual(z.firstDecl, -1);
  assert.strictEqual(z.count, 0);
  assert.strictEqual(z.firstBody, 2);
  assert.strictEqual(z.insertAt, 2);
});

t('find: メッセージが 1 本も無ければ @enduml の直前', function() {
  var z = PZ.find(L(['@startuml', 'participant A', '@enduml']));
  assert.strictEqual(z.insertAt, 2);
});

t('find: 空の図でも @enduml を跨がない', function() {
  var z = PZ.find(L(['@startuml', '@enduml']));
  assert.strictEqual(z.insertAt, 1);
});

t('find: メッセージの後ろに取り残された宣言は欄の外', function() {
  // この BLK が直す前の出力。新しい宣言はここへは足さない。
  var z = PZ.find(L(['@startuml', 'participant A', 'A -> B : req', 'participant B', '@enduml']));
  assert.strictEqual(z.lastDecl, 1);
  assert.strictEqual(z.insertAt, 2);
});

// ── 差し込み ────────────────────────────────────────────────────────────
t('insert: 宣言は既存の宣言の後ろ・最初のメッセージより前に入る', function() {
  var out = PZ.insert(L(BASE), 'database DB').split('\n');
  assert.strictEqual(out[6], 'database DB');
  assert.strictEqual(out.indexOf('database DB') < out.indexOf('User -> Front : 申し込む'), true);
});

t('insert: 見出しは跨がない', function() {
  var out = PZ.insert(L(BASE), 'database DB').split('\n');
  assert.strictEqual(out[1], 'title 受付の流れ');
  assert.strictEqual(out[2], 'skinparam monochrome true');
});

t('insert: 宣言の無い図には最初のメッセージの直前に欄ができる', function() {
  var out = PZ.insert(L(['@startuml', 'A -> B : req', '@enduml']), 'actor A').split('\n');
  assert.deepStrictEqual(out, ['@startuml', 'actor A', 'A -> B : req', '@enduml']);
});

t('insert: 空文字の宣言では DSL を 1 バイトも変えない', function() {
  var src = L(BASE);
  assert.strictEqual(PZ.insert(src, ''), src);
  assert.strictEqual(PZ.insert(src, '   '), src);
});

// ── alias ───────────────────────────────────────────────────────────────
t('aliasOf / hasDeclaration: 既にいる参加者を見分ける', function() {
  assert.strictEqual(PZ.aliasOf('participant "受付" as Front'), 'Front');
  assert.strictEqual(PZ.aliasOf('actor User'), 'User');
  assert.strictEqual(PZ.aliasOf('database DB #red'), 'DB');
  assert.strictEqual(PZ.hasDeclaration(L(BASE), 'Front'), true);
  assert.strictEqual(PZ.hasDeclaration(L(BASE), 'DB'), false);
  assert.strictEqual(PZ.hasDeclaration(L(BASE), ''), false);
});

// ── sequence モジュールの全経路が欄を使う ──────────────────────────────
t('addParticipant: 宣言は参加者の欄に入る (末尾ではない)', function() {
  var out = seq.addParticipant(L(BASE), 'database', 'DB', 'DB').split('\n');
  var di = out.indexOf('database DB');
  var mi = out.indexOf('User -> Front : 申し込む');
  assert.ok(di > 0 && mi > 0, out.join('|'));
  assert.ok(di < mi, '宣言がメッセージより後ろに入った: ' + out.join('|'));
});

t('addParticipant: 3 人足しても宣言順が保たれる', function() {
  var t0 = L(['@startuml', 'A -> B : req', '@enduml']);
  var t1 = seq.addParticipant(t0, 'actor', 'A', 'A');
  var t2 = seq.addParticipant(t1, 'participant', 'B', 'B');
  var t3 = seq.addParticipant(t2, 'database', 'DB', 'DB');
  assert.deepStrictEqual(t3.split('\n'), [
    '@startuml', 'actor A', 'participant B', 'database DB', 'A -> B : req', '@enduml',
  ]);
});

t('participantZone: モジュールからも欄の範囲を引ける', function() {
  var z = seq.participantZone(L(BASE));
  assert.strictEqual(z.count, 2);
  assert.strictEqual(z.insertAt, 6);
});

// ── 出力 ────────────────────────────────────────────────────────────────
var failed = results.filter(function(r) { return !r.ok; });
console.log('\n  sequence-participant-zone — 参加者の欄 (BLK-human-20260915-1205)');
results.forEach(function(r) {
  console.log('    ' + (r.ok ? '✓' : '✗') + ' ' + r.name);
  if (!r.ok) console.log('        ' + (r.err && r.err.message));
});
console.log('  ' + (results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) process.exitCode = 1;
