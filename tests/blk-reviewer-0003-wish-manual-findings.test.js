'use strict';
// BLK-reviewer-20260908-0003-wish: audit.js が拾えない手動の指摘に実体 id を持たせ、
// 次 run で「未変更のため前回判定を維持」と「要再確認」を機械で仕分ける。
// ここでその仕分けの規則を固定する。
const assert = require('assert');
const MF = require('../src/core/manual-findings');

const DMA_SEQ = [
  '@startuml',
  'participant Spi_Driver',
  'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_Reset()',
  'DmaCtrl --> Spi_Driver : Ack()',
  '@enduml',
].join('\n');

function finding(over) {
  return MF.make(Object.assign({
    doc: 'dma_transfer_sequence.puml',
    dsl: DMA_SEQ,
    line: 4,
    text: 'dma_state.puml の Error --> Idle : Spi_Reset に対応するリセットフローが無い',
    author: 'reviewer',
    at: '2026-09-08T00:03',
    verdict: '未解消',
  }, over || {}));
}

describe('実体 id と指紋', function() {
  test('対象ファイル名 + 行の指紋から実体 id が決まる', function() {
    const f = finding();
    expect(f.id).toBe('dma_transfer_sequence.puml#' + MF.hash('Spi_Driver -> DmaCtrl : Spi_Reset()'));
    expect(f.lineText).toBe('Spi_Driver -> DmaCtrl : Spi_Reset()');
  });

  test('インデントや空白の詰め方が違っても同じ指紋になる', function() {
    expect(MF.hash('  Spi_Driver  ->   DmaCtrl : Spi_Reset()  ')).toBe(MF.hash('Spi_Driver -> DmaCtrl : Spi_Reset()'));
  });

  test('別の行は別の指紋になる', function() {
    expect(MF.hash('Spi_Driver -> DmaCtrl : Spi_Reset()')).not.toBe(MF.hash('DmaCtrl --> Spi_Driver : Ack()'));
  });

  test('同じ行に 2 件目を足すと連番で別 id になる', function() {
    let list = MF.add([], { doc: 'a.puml', dsl: DMA_SEQ, line: 4, text: '1 件目' });
    list = MF.add(list, { doc: 'a.puml', dsl: DMA_SEQ, line: 4, text: '2 件目' });
    expect(list.length).toBe(2);
    expect(list[0].id).not.toBe(list[1].id);
  });
});

describe('次 run の仕分け', function() {
  test('行が変わっていなければ「未変更」で前回判定を維持する', function() {
    const r = MF.check(finding(), DMA_SEQ);
    expect(r.status).toBe('unchanged');
    expect(MF.STATUS[r.status].keep).toBe(true);
  });

  test('上に行が増えただけなら「行移動」で維持し、新しい行番号を返す', function() {
    const moved = DMA_SEQ.replace('@startuml', '@startuml\ntitle DMA 転送');
    const r = MF.check(finding(), moved);
    expect(r.status).toBe('moved');
    expect(r.line).toBe(5);
    expect(MF.STATUS[r.status].keep).toBe(true);
  });

  test('指摘した行が書き換わっていれば「要再確認」', function() {
    const edited = DMA_SEQ.replace('Spi_Reset()', 'Spi_Abort()');
    const r = MF.check(finding(), edited);
    expect(r.status).toBe('changed');
    expect(MF.STATUS[r.status].keep).toBe(false);
  });

  test('指摘した行が消えて、その位置に別の行が来ていれば「要再確認」', function() {
    const cut = DMA_SEQ.split('\n').filter(l => l.indexOf('Spi_Reset') < 0).join('\n');
    const r = MF.check(finding(), cut);
    expect(r.status).toBe('changed');
    expect(MF.STATUS[r.status].keep).toBe(false);
  });

  test('図が短くなって指摘の位置ごと無くなれば「行が消えた」', function() {
    const r = MF.check(finding(), '@startuml\n@enduml');
    expect(r.status).toBe('gone');
    expect(r.line).toBe(0);
    expect(MF.STATUS[r.status].keep).toBe(false);
  });

  test('対象の図そのものが無ければ「図が無い」', function() {
    const r = MF.check(finding(), undefined);
    expect(r.status).toBe('missing-doc');
    expect(MF.STATUS[r.status].keep).toBe(false);
  });
});

describe('一覧', function() {
  const list = [
    finding(),
    finding({ doc: 'gpio_state.puml', line: 2, dsl: 'x\nIdle --> Busy\n', lineText: 'Idle --> Busy', text: '復帰遷移が無い' }),
  ];
  const docs = {
    'dma_transfer_sequence.puml': DMA_SEQ,
    'gpio_state.puml': 'x\nIdle --> Ready\n',       // 行が書き換わった
  };

  test('要再確認が先、未変更は後ろに並ぶ', function() {
    const rows = MF.review(list, docs);
    expect(rows.length).toBe(2);
    expect(rows[0].doc).toBe('gpio_state.puml');
    expect(rows[0].keep).toBe(false);
    expect(rows[1].keep).toBe(true);
  });

  test('要約は「要再確認 N 件 / 維持 M 件」で出る', function() {
    const sum = MF.summary(MF.review(list, docs));
    expect(sum.total).toBe(2);
    expect(sum.recheck).toBe(1);
    expect(sum.keep).toBe(1);
    expect(MF.headText(sum)).toContain('要再確認 1 件');
  });

  test('全部未変更なら「今日読む行はありません」と言い切る', function() {
    const rows = MF.review([finding()], { 'dma_transfer_sequence.puml': DMA_SEQ });
    expect(MF.headText(MF.summary(rows))).toContain('今日読む行はありません');
  });

  test('今日開く図は要再確認のものだけ', function() {
    expect(MF.toRecheck(MF.review(list, docs))).toEqual(['gpio_state.puml']);
  });

  test('バッジは要再確認/全件で出る', function() {
    expect(MF.badgeText(MF.summary(MF.review(list, docs)))).toBe('🔖 手動指摘 1/2');
  });
});

describe('控えの更新', function() {
  test('行が動いただけの指摘は新しい行番号を憶える', function() {
    const moved = DMA_SEQ.replace('@startuml', '@startuml\ntitle DMA 転送');
    const list = [finding()];
    const next = MF.applyMoves(list, MF.review(list, { 'dma_transfer_sequence.puml': moved }));
    expect(next[0].line).toBe(5);
    expect(next[0].hash).toBe(list[0].hash);
  });

  test('書き換わった指摘は、見るまで指紋を更新しない', function() {
    const edited = DMA_SEQ.replace('Spi_Reset()', 'Spi_Abort()');
    const list = [finding()];
    const next = MF.applyMoves(list, MF.review(list, { 'dma_transfer_sequence.puml': edited }));
    expect(next[0].hash).toBe(list[0].hash);
    expect(MF.review(next, { 'dma_transfer_sequence.puml': edited })[0].keep).toBe(false);
  });

  test('確認したら今の行を憶え直し、次からは維持側になる', function() {
    const edited = DMA_SEQ.replace('Spi_Reset()', 'Spi_Abort()');
    const next = MF.confirm([finding()], finding().id, edited, '解消');
    expect(next[0].verdict).toBe('解消');
    expect(MF.review(next, { 'dma_transfer_sequence.puml': edited })[0].keep).toBe(true);
  });

  test('消せる', function() {
    const f = finding();
    expect(MF.remove([f], f.id).length).toBe(0);
  });
});

describe('出し入れ', function() {
  function memStore() {
    const bag = {};
    return {
      bag: bag,
      getItem: k => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
      setItem: (k, v) => { bag[k] = String(v); },
    };
  }

  test('保存フォルダごとに分かれて保存され、読み戻せる', function() {
    const st = memStore();
    expect(MF.save(st, './autosave', [finding()])).toBe(true);
    expect(Object.keys(st.bag)).toEqual(['pua.review.findings:./autosave']);
    expect(MF.load(st, './autosave')[0].id).toBe(finding().id);
    expect(MF.load(st, './other')).toEqual([]);
  });

  test('壊れた控えは空扱いにして画面を止めない', function() {
    const st = memStore();
    st.setItem(MF.storageKey('./autosave'), '{oops');
    expect(MF.load(st, './autosave')).toEqual([]);
  });

  test('指摘.md へ貼れる行に起こせる', function() {
    const md = MF.toMarkdown(MF.review([finding()], { 'dma_transfer_sequence.puml': DMA_SEQ }));
    expect(md).toContain('[未変更] dma_transfer_sequence.puml:4');
    expect(md).toContain(finding().id);
    expect(md).toContain('→ 未解消');
  });
});
