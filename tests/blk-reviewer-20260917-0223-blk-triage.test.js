'use strict';
// BLK-reviewer-20260917-0223: BLK を新規起票してよいか (同じ操作種別の friction が
// open/done に 3 件以上あるか、状態ファイルのパス違いのように過去の BLK と同じ現象か)
// を、毎回 grep で目で数えていた。「1 件前はあるが 3 件目ではない」という際どい判定を
// 毎 tick 手作業でやり直すことになる。下書きを corpus に突き合わせ、カテゴリの件数と
// しきい値への到達、類似の過去 BLK を先に見せれば、数え直しは要らなくなる。

var triage = require('../src/core/blk-triage');

function blk(id, opts) {
  var o = opts || {};
  return ['---',
    'id: ' + id,
    'persona: ' + (o.persona || 'reviewer'),
    o.kind ? 'kind: ' + o.kind : 'depth: ' + (o.depth || 'friction'),
    'status: ' + (o.status || 'done'),
    'task: ' + (o.task || 'task'),
    '---',
    o.body || '',
  ].join('\n');
}

var FINDINGS_1 = blk('BLK-reviewer-20260908-0003', {
  task: '手順8 reviewer自身が書いた指摘の風化を検知できない',
  body: 'findings.js の指摘が継続 tick 数を持たず、解消したかを目で見ている。',
});
var FINDINGS_2 = blk('BLK-reviewer-20260916-0629', {
  task: '手順8 指摘の解消判定',
  body: 'findings.js の指摘が「解消」か無変化かを区別しない。pins の 📌 も同じ。',
});
var FINDINGS_3 = blk('BLK-reviewer-20260917-0123', {
  task: '2-8 findings.js の ID 化',
  body: 'findings.js の指摘 ID が新規発生時のみで、既存の未 ID 指摘に遡らない。',
});
var SVG = blk('BLK-reviewer-20260910-0103', {
  task: '4.10 SVG の実体一致',
  body: 'render で再描画した svg と保存済み svg のバイト比較で、描画の食い違いが出る。',
});

describe('blk-triage: 起票前に同種カテゴリの件数と類似 BLK を突き合わせる', function() {

  describe('parse', function() {
    test('frontmatter の種別を friction / wish / blocked に畳む', function() {
      expect(triage.parse(blk('A', { depth: 'friction' })).kindName).toBe('friction');
      expect(triage.parse(blk('A', { kind: 'wish' })).kindName).toBe('wish');
      expect(triage.parse(blk('A', { depth: 'blocked' })).kindName).toBe('blocked');
    });

    test('builder が後から足す「できるようになったこと」は突き合わせから外す', function() {
      var b = triage.parse(blk('A', {
        body: '指摘が数えられない。\n\nできるようになったこと:\nコマンドパレットに項目が増えます。',
      }));
      expect(b.text).toContain('指摘が数えられない');
      // 実装ログの語で似てしまうと、起票の判断が builder の書き方に左右される。
      expect(b.text).not.toContain('コマンドパレット');
    });

    test('frontmatter が無くても落ちない', function() {
      expect(triage.parse('本文だけ', { name: 'x' }).id).toBe('x');
    });
  });

  describe('classify', function() {
    test('操作種別のカテゴリを当てる', function() {
      expect(triage.categoryOf('findings.js の指摘が解消したか分からない')).toBe('指摘・findings 管理');
      expect(triage.categoryOf('保存した svg を render で再描画してバイト比較する')).toBe('SVG・描画の実体');
      expect(triage.categoryOf('略語の大文字化の命名規約が図間で揃わない')).toBe('命名規約・表記揺れ');
    });

    test('当たる語が無ければ未分類 (黙って他のカテゴリに寄せない)', function() {
      expect(triage.categoryOf('あいうえお')).toBe('未分類');
    });

    test('次点のカテゴリも残す', function() {
      var scored = triage.classify('findings.js の指摘を BLK に起票してよいか');
      expect(scored.length).toBeGreaterThan(1);
    });
  });

  describe('tokens', function() {
    test('英字の識別子・パス・オプションはそのまま拾う', function() {
      var t = triage.tokens('node tools/audit.js --board を打つ');
      expect(t).toContain('tools/audit.js');
      expect(t).toContain('--board');
    });

    test('日本語は 2-gram にする', function() {
      expect(triage.tokens('指摘')).toContain('指摘');
    });

    test('助詞だけの 2-gram は落とす', function() {
      expect(triage.tokens('することができる')).not.toContain('する');
    });
  });

  describe('triage の判定', function() {
    test('同カテゴリが 3 件あればしきい値に到達し「追記せよ」', function() {
      var corpus = [FINDINGS_1, FINDINGS_2, FINDINGS_3, SVG].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の指摘の件数が数えられない', kind: 'friction' }, corpus);
      expect(r.category).toBe('指摘・findings 管理');
      expect(r.cohort.length).toBe(3);
      expect(r.reached).toBe(true);
      expect(r.verdict).toBe('追記せよ');
    });

    test('2 件なら未達で「新規起票してよい」(際どい判定を数え直さない)', function() {
      var corpus = [FINDINGS_1, FINDINGS_2, SVG].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の指摘の件数が数えられない', kind: 'friction' }, corpus);
      expect(r.cohort.length).toBe(2);
      expect(r.reached).toBe(false);
      expect(r.verdict).toBe('新規起票してよい');
      expect(r.reason).toContain('2 件');
    });

    test('種別が違う既存は数に入れない (friction の数に wish を混ぜない)', function() {
      var corpus = [FINDINGS_1, FINDINGS_2, FINDINGS_3].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の指摘の件数が数えられない', kind: 'wish' }, corpus);
      expect(r.cohort.length).toBe(0);
    });

    test('wontfix は退けられた起票なので数に入れない', function() {
      var corpus = [FINDINGS_1, FINDINGS_2,
        blk('BLK-reviewer-20260909-0003', { status: 'wontfix', body: 'findings.js の指摘' }),
      ].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の指摘の件数が数えられない', kind: 'friction' }, corpus);
      expect(r.cohort.length).toBe(2);
    });

    test('同じ現象が既にあれば、件数が未達でも「追記せよ」', function() {
      var corpus = [FINDINGS_3, SVG].map(function(t) { return triage.parse(t); });
      // 0123 の本文をほぼそのまま出し直した下書き。
      var r = triage.triage({
        text: 'findings.js の指摘 ID が新規発生時のみで、既存の未 ID 指摘に遡らない。',
        kind: 'friction',
      }, corpus);
      expect(r.cohort.length).toBeLessThan(3);
      expect(r.near.length).toBeGreaterThan(0);
      expect(r.near[0].id).toBe('BLK-reviewer-20260917-0123');
      expect(r.verdict).toBe('追記せよ');
      expect(r.reason).toContain('同じ現象');
    });

    test('--id で見直すとき、自分自身は corpus から外す', function() {
      var corpus = [FINDINGS_1, FINDINGS_2, FINDINGS_3].map(function(t) { return triage.parse(t); });
      var r = triage.triage({
        text: triage.parse(FINDINGS_3).text, kind: 'friction', id: 'BLK-reviewer-20260917-0123',
      }, corpus);
      expect(r.cohort.length).toBe(2);
      r.similar.forEach(function(s) { expect(s.id).not.toBe('BLK-reviewer-20260917-0123'); });
    });

    test('似ている根拠に共通語を出す (点数だけでは同一現象か判断できない)', function() {
      var corpus = [FINDINGS_3].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の ID 化', kind: 'friction' }, corpus);
      expect(r.similar[0].shared.length).toBeGreaterThan(0);
    });

    test('似たものが 1 件も無ければ類似は空', function() {
      var corpus = [SVG].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'zzz', kind: 'friction' }, corpus);
      expect(r.similar.length).toBe(0);
      expect(r.verdict).toBe('新規起票してよい');
    });

    test('corpus が空でも落ちず、新規起票してよいと言う', function() {
      var r = triage.triage({ text: 'findings.js の指摘', kind: 'friction' }, []);
      expect(r.cohort.length).toBe(0);
      expect(r.verdict).toBe('新規起票してよい');
    });

    test('しきい値は差し替えられる', function() {
      var corpus = [FINDINGS_1, FINDINGS_2].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の指摘の件数', kind: 'friction' }, corpus, { threshold: 2 });
      expect(r.reached).toBe(true);
      expect(r.verdict).toBe('追記せよ');
    });
  });

  describe('report', function() {
    test('判定・カテゴリ・件数・しきい値・類似が 1 枚に出る', function() {
      var corpus = [FINDINGS_1, FINDINGS_2, FINDINGS_3, SVG].map(function(t) { return triage.parse(t); });
      var r = triage.triage({ text: 'findings.js の指摘の件数が数えられない', kind: 'friction' }, corpus);
      var text = triage.report(r).join('\n');
      expect(text).toContain('「追記せよ」');
      expect(text).toContain('指摘・findings 管理');
      expect(text).toContain('しきい値 3');
      expect(text).toContain('到達');
      expect(text).toContain('類似の過去 BLK');
      // 同カテゴリの既存は id ごと並ぶ (grep し直さないのが目的)。
      expect(text).toContain('BLK-reviewer-20260908-0003');
    });

    test('同カテゴリが 0 件のときもその旨を出す', function() {
      var text = triage.report(triage.triage({ text: 'zzz', kind: 'friction' }, [])).join('\n');
      expect(text).toContain('同カテゴリの既存なし');
      expect(text).toContain('似たものなし');
    });
  });
});
