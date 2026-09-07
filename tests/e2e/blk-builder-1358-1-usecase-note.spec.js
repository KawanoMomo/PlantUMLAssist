// @ts-check
// BLK-builder-20260907-1358-1 (design 5d): UseCase の「その他パレット」の ノート。
// これまでユースケース図に注釈を付ける手段が GUI に無く、DSL に手で書くしかなかった。
// 追加 → 図に出る → 右ペインで直す → 消す、が画面から一周できることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function seedUsecase(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-usecase');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value = '@startuml\nactor User\nusecase "ログイン" as L1\nUser --> L1\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(600);
}

// 要素を選ぶ (注釈の一覧はその要素の編集パネルに出る)。
async function selectUser(page) {
  await page.evaluate(() => {
    const parsed = window.MA.modules.plantumlUsecase.parse(document.getElementById('editor').value);
    const el = parsed.elements.filter((e) => e.id === 'User')[0];
    // props-renderer は type と要素の kind を突き合わせる (actor / usecase)。
    window.MA.selection.setSelected([{ type: el.kind, id: el.id, line: el.line }]);
  });
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-20260907-1358-1: UseCase のノート', () => {

  test('追加パレットに Note (注釈) が並ぶ', async ({ page }) => {
    await seedUsecase(page);
    await expect(page.locator('#uc-tail-kind')).toContainText('Note (注釈)');
  });

  test('Target と Position を選んで本文を打つと DSL に 1 行で入る', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('User');
    await page.locator('#uc-tail-npos').selectOption('right');
    await page.locator('#uc-tail-ntext').fill('社内の利用者だけ');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toContain('note right of User : 社内の利用者だけ');
  });

  test('改行を含む本文は end note で閉じるブロックになる', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('L1');
    await page.locator('#uc-tail-ntext').fill('2 要素認証を含む\n失敗は 3 回まで');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    const t = await getEditorText(page);
    expect(t).toContain('note left of L1');
    expect(t).toContain('失敗は 3 回まで');
    expect(t).toContain('end note');
  });

  test('注釈のある図がエラーにならずに描ける', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('User');
    await page.locator('#uc-tail-ntext').fill('社内の利用者だけ');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#render-status')).not.toContainText('ERROR');
    expect(await page.locator('#preview-svg svg').count()).toBe(1);
  });

  test('注釈を付けても actor / usecase / relation の読みは変わらない', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('L1');
    await page.locator('#uc-tail-ntext').fill('User --> L1 は関係の説明');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    const counts = await page.evaluate(() => {
      const p = window.MA.modules.plantumlUsecase.parse(document.getElementById('editor').value);
      return { el: p.elements.length, rel: p.relations.length, notes: p.notes.length };
    });
    expect(counts).toEqual({ el: 2, rel: 1, notes: 1 });
  });

  test('要素を選ぶと、その要素に付いた注釈が一覧に出る', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('User');
    await page.locator('#uc-tail-ntext').fill('社内の利用者だけ');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    await selectUser(page);
    await expect(page.locator('#props-content')).toContainText('社内の利用者だけ');
    await expect(page.locator('#uc-note-edit-0')).toBeVisible();
  });

  test('edit から本文と位置を直せる', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('User');
    await page.locator('#uc-tail-ntext').fill('旧');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    await selectUser(page);
    await page.locator('#uc-note-edit-0').click();
    await page.waitForTimeout(400);
    await page.locator('#uc-note-pos').selectOption('bottom');
    await page.locator('#uc-note-text').fill('新');
    await page.locator('#uc-note-update').click();
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toContain('note bottom of User : 新');
  });

  test('✕ で注釈だけが消え、要素と関係は残る', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-ntarget').selectOption('User');
    await page.locator('#uc-tail-ntext').fill('消す対象');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    await selectUser(page);
    await page.locator('#uc-note-del-0').click();
    await page.waitForTimeout(400);
    const t = await getEditorText(page);
    expect(t).not.toContain('消す対象');
    expect(t).toContain('actor User');
    expect(t).toContain('User --> L1');
  });

  test('付ける相手が無いうちは足させない', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.value = '@startuml\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(600);
    await page.locator('#uc-tail-kind').selectOption('note');
    await page.waitForTimeout(300);
    page.once('dialog', (d) => d.accept());
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).not.toContain('note ');
  });
});
