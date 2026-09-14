'use strict';
// BLK-reviewer-20260908-1303-wish: 指摘に「直す側の応答」を返す。
//
// 指摘が一方通行だと、reviewer は次の run でまた同じ全件を確かめ直すしかない。
// 応答 (対応した / 保留 / 直さない + 理由) を図に残せること、理由の無い保留を
// 通さないこと、reviewer の再確認が「裏取り」まで減ることを見る。

var W = (typeof window !== 'undefined' && window) || global.window;
var PR = W.MA.pinReply;
var RP = W.MA.reviewPins;

const BASE = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'Idle --> Busy : start',
  '@enduml',
].join('\n');

// 指摘を 2 件付けた図。
function withPins() {
  var d = RP.add(BASE, { line: 3, text: 'Disabled が無い', author: 'reviewer', at: '2026-09-08T12:00' });
  return RP.add(d, { line: 4, text: 'SVG が古い', author: 'reviewer', at: '2026-09-08T12:01' });
}

describe('応答の種類', function() {
  test('3 つだけ。読める名前が付く', function() {
    expect(PR.verdicts()).toEqual(['done', 'held', 'wontfix']);
    expect(PR.verdictLabel('done')).toBe('対応した');
    expect(PR.verdictLabel('held')).toBe('保留');
    expect(PR.verdictLabel('wontfix')).toBe('直さない');
  });

  test('知らない種類は保留に寄せる (握り潰さない)', function() {
    expect(PR.normVerdict('fixed')).toBe('held');
    expect(PR.normVerdict('')).toBe('held');
  });

  test('保留・直さないには理由が要る', function() {
    expect(PR.needsReason('held')).toBe(true);
    expect(PR.needsReason('wontfix')).toBe(true);
    expect(PR.needsReason('done')).toBe(false);
    expect(PR.canReply('held', '')).toBe(false);
    expect(PR.canReply('held', '  ')).toBe(false);
    expect(PR.canReply('held', '提出直前にまとめて直す')).toBe(true);
    expect(PR.canReply('done', '')).toBe(true);
    expect(PR.replyError('held', '')).toBe('保留には理由が要ります (いつ・何待ちか)');
    expect(PR.replyError('done', '')).toBe('');
    expect(PR.replyError('nonsense', 'x')).toBe('応答の種類を選んでください');
  });
});

describe('応答を書く', function() {
  test('応答は図のコメント行として残り、図の中身は変わらない', function() {
    const pinned = withPins();
    const out = PR.add(pinned, '1', { verdict: 'done', author: 'primary', at: '2026-09-08T13:40' });
    expect(out).not.toBe(pinned);
    const kept = out.split('\n').filter(function(l) { return !PR.isReplyLine(l); }).join('\n');
    expect(kept).toBe(pinned);
    // 指摘の側は 1 文字も変わらない (指摘の書式は増やしていない)。
    expect(RP.list(out).length).toBe(RP.list(pinned).length);
  });

  test('理由の無い保留は書けない (図が変わらない)', function() {
    const pinned = withPins();
    expect(PR.add(pinned, '1', { verdict: 'held', text: '' })).toBe(pinned);
  });

  test('どの指摘への応答かを取り違えない', function() {
    var d = withPins();
    d = PR.add(d, '1', { verdict: 'done', author: 'primary' });
    d = PR.add(d, '2', { verdict: 'held', author: 'primary', text: '提出直前にまとめて作り直す' });
    expect(PR.latest(d, '1').verdict).toBe('done');
    expect(PR.latest(d, '2').verdict).toBe('held');
    expect(PR.latest(d, '2').text).toBe('提出直前にまとめて作り直す');
    expect(PR.latest(d, '3')).toBe(null);
  });

  test('1 件に何度でも返せて、最後の答えが今の答え (前のも残る)', function() {
    var d = PR.add(withPins(), '1', { verdict: 'held', author: 'primary', text: '次の run で直す' });
    d = PR.add(d, '1', { verdict: 'done', author: 'primary', at: '2026-09-08T14:00' });
    expect(PR.forPin(d, '1').length).toBe(2);
    expect(PR.latest(d, '1').verdict).toBe('done');
  });

  test('区切り文字と改行が理由に入っても壊れない', function() {
    const d = PR.add(withPins(), '1', {
      verdict: 'wontfix', author: 'primary', text: 'a|b\nc の仕様どおり',
    });
    expect(PR.latest(d, '1').text).toBe('a|b c の仕様どおり');
  });

  test('応答は取り消せる (押し間違い)', function() {
    var d = PR.add(withPins(), '1', { verdict: 'done', author: 'primary' });
    d = PR.add(d, '2', { verdict: 'done', author: 'primary' });
    const gone = PR.removeFor(d, '1');
    expect(PR.latest(gone, '1')).toBe(null);
    expect(PR.latest(gone, '2')).not.toBe(null);
  });

  test('画面に出す 1 行は誰が何といつ言ったかを含む', function() {
    const d = PR.add(withPins(), '1', {
      verdict: 'held', author: 'primary', at: '2026-09-08T13:40', text: 'SVG は提出直前',
    });
    expect(PR.statusText(d, '1')).toBe('primary: 保留 (2026-09-08T13:40) — SVG は提出直前');
    expect(PR.statusText(d, '2')).toBe('');
  });
});

describe('reviewer の次の run', function() {
  test('応答が無ければ全部を確かめ直すと言う', function() {
    const pinned = withPins();
    const pins = RP.list(pinned);
    const sum = PR.summary(pins, pinned);
    expect(sum).toEqual({ total: 2, recheck: 0, waiting: 0, unanswered: 2 });
    expect(PR.headText(sum)).toBe('応答なし 2 件 (全部を確かめ直す)');
  });

  test('「対応した」は裏取り、保留・直さないは読むだけに分かれる', function() {
    var d = withPins();
    d = PR.add(d, '1', { verdict: 'done', author: 'primary' });
    d = PR.add(d, '2', { verdict: 'held', author: 'primary', text: '提出直前' });
    const pins = RP.list(d);
    const t = PR.triage(pins, d);
    expect(t.recheck.map(function(p) { return p.id; })).toEqual(['1']);
    expect(t.waiting.map(function(p) { return p.id; })).toEqual(['2']);
    expect(t.unanswered.length).toBe(0);
    expect(PR.headText(PR.summary(pins, d))).toBe('裏取り 1 ・ 保留/直さない 1 ・ 応答なし 0');
  });

  test('指摘が 0 件なら見出しを出さない', function() {
    expect(PR.headText(PR.summary([], BASE))).toBe('');
  });
});

describe('既存の道具を壊さない', function() {
  test('応答行は指摘として数えられない', function() {
    const d = PR.add(withPins(), '1', { verdict: 'done', author: 'primary' });
    expect(RP.list(d).length).toBe(2);
    expect(RP.list(d).every(function(p) { return PR.latest(d, p.id) !== null || p.id === '2'; })).toBe(true);
  });

  test('応答行を anchor と取り違えない (指摘は迷子にならない)', function() {
    const d = PR.add(withPins(), '1', { verdict: 'done', author: 'primary' });
    RP.list(d).forEach(function(p) { expect(p.stale).toBe(false); });
  });

  test('CRLF の図でも改行の種類を保つ', function() {
    const crlf = withPins().replace(/\n/g, '\r\n');
    const out = PR.add(crlf, '1', { verdict: 'done', author: 'primary' });
    expect(/\r\n/.test(out)).toBe(true);
    expect(PR.latest(out, '1').verdict).toBe('done');
  });
});
