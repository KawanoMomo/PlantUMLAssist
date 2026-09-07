'use strict';
// BLK-builder-20260907-1250-2 / design 5c「Sequence — 途中に挿入」の「その他」。
//
// 仕様: 挿入メニューの最後は「その他（区切り線 / 遅延 / 参照）」で、開くと
// 区切り線 `==` / 遅延 `...` / 参照 `ref` が並ぶ。5b の網羅表も Sequence の
// その他パレットとして同じ 3 つを挙げている。

var fs = require('fs');
var path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var SM = W.MA.sequenceMarks;
var seq = W.MA.modules.plantumlSequence;

var BASE = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

describe('区切り線 / 遅延 / 参照 の書式', function() {
  test('区切り線は `== 本文 ==`', function() {
    expect(SM.fmtSeparator('初期化ここまで')).toBe('== 初期化ここまで ==');
  });

  test('区切り線は本文が無ければ無地の `====`', function() {
    expect(SM.fmtSeparator('')).toBe('====');
    expect(SM.fmtSeparator(null)).toBe('====');
  });

  test('区切り線の本文に `=` を打たれても行が壊れない', function() {
    expect(SM.fmtSeparator('== 二重 ==')).toBe('== 二重 ==');
  });

  test('遅延は `... 本文 ...`、本文が無ければ `...`', function() {
    expect(SM.fmtDelay('応答待ち')).toBe('... 応答待ち ...');
    expect(SM.fmtDelay('')).toBe('...');
  });

  test('参照は `ref over 参加者 : 本文`', function() {
    expect(SM.fmtRef(['System'], '認証シーケンス参照')).toBe('ref over System : 認証シーケンス参照');
  });

  test('参照は複数の参加者にかけられる', function() {
    expect(SM.fmtRef(['User', 'System'], 'x')).toBe('ref over User, System : x');
  });

  test('参照は本文が無ければ `:` を書かない', function() {
    expect(SM.fmtRef(['System'], '')).toBe('ref over System');
  });

  test('参照は参加者が無ければ空文字 (挿入されない)', function() {
    expect(SM.fmtRef([], 'x')).toBe('');
    expect(SM.fmtRef([''], 'x')).toBe('');
  });

  test('本文の改行は行を割らない', function() {
    expect(SM.fmtSeparator('a\nb')).toBe('== a b ==');
  });
});

describe('書いた行を読み返せる', function() {
  test('区切り線', function() {
    expect(SM.parseLine('== 初期化ここまで ==')).toEqual({ kind: 'separator', text: '初期化ここまで' });
    expect(SM.parseLine('====')).toEqual({ kind: 'separator', text: '' });
  });

  test('遅延', function() {
    expect(SM.parseLine('... 応答待ち ...')).toEqual({ kind: 'delay', text: '応答待ち' });
    expect(SM.parseLine('...')).toEqual({ kind: 'delay', text: '' });
  });

  test('参照', function() {
    expect(SM.parseLine('ref over User, System : 認証')).toEqual({
      kind: 'ref', targets: ['User', 'System'], text: '認証',
    });
  });

  test('メッセージや宣言は 3 つのどれでもない', function() {
    ['User -> System : Request', 'actor User', '@startuml', 'note over User : x']
      .forEach(function(l) { expect(SM.parseLine(l)).toBe(null); });
  });

  test('書いた行はそのまま読み返せる (往復)', function() {
    [['separator', { text: 'x' }], ['delay', { text: 'y' }], ['ref', { targets: ['A'], text: 'z' }]]
      .forEach(function(pair) {
        var line = SM.formatLine(pair[0], pair[1]);
        expect(SM.parseLine(line).kind).toBe(pair[0]);
      });
  });

  test('summarize は行一覧に出せる 1 行の説明を返す', function() {
    expect(SM.summarize('== 初期化 ==')).toBe('区切り線: 初期化');
    expect(SM.summarize('...')).toBe('遅延');
    expect(SM.summarize('ref over A : x')).toBe('参照: A — x');
    expect(SM.summarize('User -> System : x')).toBe(null);
  });
});

describe('挿入メニュー (design 5c)', function() {
  test('1 段目の最後は「その他（区切り線 / 遅延 / 参照）」', function() {
    var kinds = seq.insertKindOptions();
    var last = kinds[kinds.length - 1];
    expect(last.value).toBe('other');
    expect(last.label).toContain('区切り線');
    expect(last.label).toContain('遅延');
    expect(last.label).toContain('参照');
  });

  test('2 段目は 区切り線 / 遅延 / 参照 の順で始まる', function() {
    var vals = seq.otherInsertKinds().map(function(o) { return o.value; });
    expect(vals.slice(0, 3)).toEqual(['separator', 'delay', 'ref']);
  });

  test('2 段目の各項目に記法の例が付く', function() {
    seq.otherInsertKinds().forEach(function(o) {
      expect(typeof o.hint).toBe('string');
      expect(o.hint.length > 0).toBe(true);
    });
  });
});

describe('挿入すると DSL の狙った行に入る', function() {
  test('区切り線を 4 行目の後ろに入れる', function() {
    var out = seq.insertAfter(BASE, 4, 'separator', { text: '要求ここまで' }).split('\n');
    expect(out[4]).toBe('== 要求ここまで ==');
    expect(out[3]).toBe('User -> System : Request');
    expect(out[5]).toBe('System --> User : Response');
  });

  test('遅延を 4 行目の前に入れる', function() {
    var out = seq.insertBefore(BASE, 4, 'delay', { text: '応答待ち' }).split('\n');
    expect(out[3]).toBe('... 応答待ち ...');
    expect(out[4]).toBe('User -> System : Request');
  });

  test('参照を入れる', function() {
    var out = seq.insertAfter(BASE, 4, 'ref', { targets: ['System'], text: '認証シーケンス' }).split('\n');
    expect(out[4]).toBe('ref over System : 認証シーケンス');
  });

  test('参加者を選ばない参照は 1 行も足さない', function() {
    expect(seq.insertAfter(BASE, 4, 'ref', { targets: [], text: 'x' })).toBe(BASE);
  });

  test('挿入しても他の行は 1 バイトも変わらない', function() {
    var before = BASE.split('\n');
    var after = seq.insertAfter(BASE, 4, 'separator', { text: 'x' }).split('\n');
    [0, 1, 2, 3].forEach(function(i) { expect(after[i]).toBe(before[i]); });
    expect(after[5]).toBe(before[4]);
    expect(after[6]).toBe(before[5]);
  });
});

describe('入れた行を図の読み手が誤読しない', function() {
  test('区切り線・遅延・参照は participant 一覧に混ざらない', function() {
    var text = BASE
      .replace('User -> System : Request', '== 区切り ==\nUser -> System : Request\n... 待ち ...\nref over System : 別図');
    var ids = seq.parseSequence(text).elements
      .filter(function(e) { return e.kind === 'participant'; })
      .map(function(e) { return e.id; });
    expect(ids.sort()).toEqual(['System', 'User']);
  });

  test('区切り線・遅延・参照は message として数えられない', function() {
    var text = BASE
      .replace('User -> System : Request', '== 区切り ==\nUser -> System : Request\n... 待ち ...\nref over System : 別図');
    expect(seq.parseSequence(text).relations.length).toBe(2);
  });
});

describe('右パネル側の配線', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'sequence.js'), 'utf-8');

  test('3 つの書式を図種モジュールに書き写していない', function() {
    expect(src).not.toContain("'ref over '");
    expect(src).toContain('window.MA.sequenceMarks.formatLine');
  });

  test('「その他」を押すと 2 段目のメニューが開く', function() {
    expect(src).toContain("if (kindAttr === 'other') { _showOtherPicker(ctx, line, position); return; }");
  });

  test('本体 HTML が core モジュールを読み込む', function() {
    expect(fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf-8'))
      .toContain('src/core/sequence-marks.js');
  });
});
