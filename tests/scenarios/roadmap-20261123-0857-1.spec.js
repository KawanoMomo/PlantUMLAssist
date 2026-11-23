// @ts-check
// TICKET-roadmap-20261123-0857-1 (roadmap v8.0 必須 2): 「+ 追加」「まとめて」を間を空けずに続けても、どの手も打った時点の
// 本文に対して働き、確定の直後に選んだ欄が後から来るフォームの組み直しで消えない。
//   (ア) 前の確定の直後に次の欄を選び 400ms 置いて確定する / (イ) 間を置かない。/render 1.5 秒遅れでも同じ。
// 期待: 打った N 手が N 行として選んだとおりの始点・終点・別名で入る (空振り 0・重なり 0・取り違え 0)、
//       届いた図に打った名前が出る、Ctrl+Z N 回で白紙のバイト列に戻る。
// 6 図種: sequence はメッセージ 8 本 (参加者 3 つの上に)、state は状態 3 つ・遷移 4 本、class・component・usecase は
// 要素 3 つと関係 2 本、activity はアクション 3 つ。「まとめて」は 6 図種とも 2 回続けて (日本語名は別名の重なりを見る)。
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

async function slowRender(page, ms) {
  await page.route('**/render', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

async function newDiagram(page, type) {
  await page.locator('#btn-tab-new').click();
  await page.locator('#diagram-type').selectOption(type);
  await expect.poll(() => H.getEditorText(page)).toContain('@enduml');
  // 新しい図の白紙 (activity の白紙は start / stop を持つので描けた図) が描き直しまで届くのを待つ。
  if (type === 'plantuml-activity') {
    await page.waitForFunction(() => {
      const svg = document.querySelector('#preview-svg svg');
      return !!svg && !svg.hasAttribute('data-blank-canvas') && svg.querySelectorAll('ellipse, circle').length >= 1;
    }, null, { timeout: 20000 });
  } else {
    await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(1, { timeout: 20000 });
  }
  return H.getEditorText(page);
}

const esc = (s) => s.replace(/[[\]*()]/g, '\\$&');
const line = (re) => new RegExp('^\\s*' + re + '\\s*$');

// 1 手 = { chip?, fill: [[sel, value]], select: [[sel, value]], expect: 正規表現 (本文の 1 行にだけ合う) }
function elemSteps(p, chip, names, decl) {
  return names.map((n, i) => ({
    chip: i === 0 ? chip : null,
    fill: [['#' + p + '-tail-alias', n]],
    expect: line(decl + '\\s+' + n),
  }));
}
function relSteps(p, pairs) {
  return pairs.map(([fr, to], i) => ({
    chip: i === 0 ? 'relation' : null,
    select: [['#' + p + '-tail-from', fr], ['#' + p + '-tail-to', to]],
    expect: line(fr + '\\s*\\S+\\s*' + to),
  }));
}

const SEQ_MSGS = [['Pa', 'Pb'], ['Pb', 'Pc'], ['Pc', 'Pa'], ['Pa', 'Pc'], ['Pb', 'Pa'], ['Pc', 'Pb'], ['Pa', 'Pb'], ['Pb', 'Pc']];
const ST_TR = [['[*]', 'Sa'], ['Sa', 'Sb'], ['Sb', 'Sc'], ['Sc', '[*]']];
const stOpt = (x) => (x === '[*]' ? '[*]' : { label: x });

const ADD = [
  { kind: 'sequence', type: 'plantuml-sequence', p: 'seq', names: ['Pa', 'Pb', 'Pc'],
    steps: elemSteps('seq', 'participant', ['Pa', 'Pb', 'Pc'], 'participant').concat(SEQ_MSGS.map(([f, t], i) => ({
      chip: i === 0 ? 'message' : null,
      select: [['#seq-tail-from', f], ['#seq-tail-to', t]],
      fill: [['#seq-tail-label-rle .rle-textarea', 'm' + (i + 1)]],
      expect: line(f + '\\s*->\\s*' + t + '\\s*:\\s*m' + (i + 1)),
    }))) },
  { kind: 'state', type: 'plantuml-state', p: 'st', names: ['Sa', 'Sb', 'Sc'],
    steps: ['Sa', 'Sb', 'Sc'].map((n, i) => ({
      chip: i === 0 ? 'state' : null, fill: [['#st-tail-id', n]], expect: line('state\\s+' + n),
    })).concat(ST_TR.map(([f, t], i) => ({
      chip: i === 0 ? 'transition' : null,
      select: [['#st-tail-from', stOpt(f)], ['#st-tail-to', stOpt(t)]],
      expect: line(esc(f) + '\\s*-+>\\s*' + esc(t)),
    }))) },
  { kind: 'component', type: 'plantuml-component', p: 'co', names: ['Ca', 'Cb', 'Cc'],
    steps: elemSteps('co', 'component', ['Ca', 'Cb', 'Cc'], 'component').concat(relSteps('co', [['Ca', 'Cb'], ['Cb', 'Cc']])) },
  // アクターだけの図は PlantUML がシーケンス図として描く (図種が替わる) ので、ユースケースで足す。
  { kind: 'usecase', type: 'plantuml-usecase', p: 'uc', names: ['Ua', 'Ub', 'Uc'],
    steps: elemSteps('uc', 'usecase', ['Ua', 'Ub', 'Uc'], 'usecase').concat(relSteps('uc', [['Ua', 'Ub'], ['Ub', 'Uc']])) },
  { kind: 'class', type: 'plantuml-class', p: 'cl', names: ['Ka', 'Kb', 'Kc'],
    steps: elemSteps('cl', 'class', ['Ka', 'Kb', 'Kc'], 'class').concat(relSteps('cl', [['Ka', 'Kb'], ['Kb', 'Kc']])) },
  { kind: 'activity', type: 'plantuml-activity', p: 'ac', names: ['Aa', 'Ab', 'Ac'],
    steps: ['Aa', 'Ab', 'Ac'].map((n, i) => ({
      chip: i === 0 ? 'action' : null, fill: [['#ac-tail-text', n]], expect: line(':' + n + ';'),
    })) },
];

// 「まとめて」を 2 回続ける。日本語名は別名 (as X1 …) で入るので、2 回目が 1 回目の別名と重ならないかを見る。
const BULK = [
  { kind: 'sequence', type: 'plantuml-sequence', p: 'seq', batches: [['制御', '監視'], ['記録', '通知']] },
  { kind: 'state', type: 'plantuml-state', p: 'st', batches: [['待機', '初期化中'], ['完了', '異常']] },
  { kind: 'component', type: 'plantuml-component', p: 'co', batches: [['受付', '台帳'], ['集計', '通知']] },
  { kind: 'usecase', type: 'plantuml-usecase', p: 'uc', batches: [['ログイン', '検索する'], ['登録する', '削除する']] },
  { kind: 'activity', type: 'plantuml-activity', p: 'ac', batches: [['受付する', '確認する'], ['記録する', '通知する']] },
  { kind: 'class', type: 'plantuml-class', p: 'cl', modal: true, batches: [['Ka', 'Kb'], ['Kc', 'Kd']] },
];

async function track(page, snaps, act) {
  await act();
  await expect.poll(() => H.getEditorText(page)).not.toBe(snaps[snaps.length - 1]);
  snaps.push(await H.getEditorText(page));
}

async function undoAll(page, snaps) {
  await page.locator('#editor').focus();
  for (let i = snaps.length - 2; i >= 0; i--) {
    await page.keyboard.press('Control+z');
    await expect.poll(() => H.getEditorText(page)).toBe(snaps[i]);
  }
}

for (const slow of [false, true]) {
  for (const pause of [400, 0]) {
    const mode = (pause ? '(ア) 欄を選んで 400ms 置く' : '(イ) 間を置かない') + (slow ? ' 描き直し 1.5 秒遅れ' : '');

    for (const K of ADD) {
      test('roadmap 0857-1 ' + K.kind + ': + 追加を続ける ' + mode, async ({ page }) => {
        test.setTimeout(150000);
        if (slow) await slowRender(page, 1500);
        await H.bootWith(page, null);
        const blank = await newDiagram(page, K.type);
        const snaps = [blank];
        for (const s of K.steps) {
          if (s.chip) await page.locator('#' + K.p + '-tail-kind-chip-' + s.chip).click();
          await track(page, snaps, async () => {
            for (const [sel, v] of s.select || []) await page.locator(sel).selectOption(v);
            for (const [sel, v] of s.fill || []) await page.locator(sel).fill(v);
            if (pause) await page.waitForTimeout(pause);
            await page.locator('#' + K.p + '-tail-add').click();
          });
        }
        const text = snaps[snaps.length - 1];
        const lines = text.split('\n');
        for (const s of K.steps) expect(lines.filter((l) => s.expect.test(l)), String(s.expect)).toHaveLength(1);
        expect(H.diffLines(blank, text)).toBe(K.steps.length);
        expect(H.removedLines(blank, text)).toEqual([]);
        await H.waitDrawn(page, K.names);
        await undoAll(page, snaps);
      });
    }

    for (const B of BULK) {
      test('roadmap 0857-1 ' + B.kind + ': まとめてを続ける ' + mode, async ({ page }) => {
        test.setTimeout(150000);
        if (slow) await slowRender(page, 1500);
        await H.bootWith(page, null);
        const blank = await newDiagram(page, B.type);
        const snaps = [blank];
        await page.locator('#' + B.p + '-tail-kind-chip-bulk').click();
        for (const names of B.batches) {
          await track(page, snaps, async () => {
            if (B.modal) {
              // 「まとめて」のチップを押した 1 回目は窓がもう開いている。2 回目は窓を開くボタンから。
              if (!(await page.locator('#cl-sc-modal').isVisible())) await page.locator('#cl-scaffold-open').click();
              // 親クラスは置かない (親と結ばない)。
              for (let i = 0; i < names.length; i++) {
                await page.locator('#cl-sc-name-' + i).fill(names[i]);
                await page.locator('#cl-sc-rel-' + i).selectOption('none');
              }
              await page.locator('#cl-sc-rel-' + names.length).selectOption('none');
              if (pause) await page.waitForTimeout(pause);
              await page.locator('#cl-sc-confirm').click();
            } else {
              await page.locator('#' + B.p + '-tail-bulk').fill(names.join('\n'));
              if (pause) await page.waitForTimeout(pause);
              await page.locator('#' + B.p + '-tail-add').click();
            }
          });
        }
        const text = snaps[snaps.length - 1];
        const lines = text.split('\n');
        const all = B.batches.flat();
        for (const n of all) expect(lines.filter((l) => l.indexOf(n) >= 0), n).toHaveLength(1);
        // 別名の重なり 0: `as X1` の同じ別名が 2 行に無い。
        const al = {};
        for (const l of lines) { const m = /\bas\s+([A-Za-z]+\d+)\b/.exec(l); if (m) al[m[1]] = (al[m[1]] || 0) + 1; }
        expect(Object.keys(al).filter((k) => al[k] > 1)).toEqual([]);
        expect(H.removedLines(blank, text)).toEqual([]);
        await H.waitDrawn(page, all);
        await undoAll(page, snaps);
      });
    }
  }
}
