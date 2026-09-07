// @ts-check
// BLK-reviewer-20260907-0043: /render のリクエスト仕様がどこにも書いておらず、
// `{"dsl": ...}` を投げると PlantUML のエラー画が 200 で返って成功と誤認できた。
// 窓口そのものが仕様を答え、形が違えば 400、文法エラーなら 422 を返すことを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const OK_DSL = '@startuml\nA -> B : hello\n@enduml';
// PlantUML が「Syntax Error?」の絵を描く DSL。
// `A -> ` は A 単体の図として通ってしまうのでエラーの標本にはならない。
const BAD_DSL = '@startuml\nthis is not plantuml @@@\n@enduml';

test.describe('/render の仕様が窓口から分かる (BLK-reviewer-0043)', () => {
  test('GET /render が仕様そのものを返す', async ({ request }) => {
    const res = await request.get('/render');
    expect(res.status()).toBe(200);
    const doc = await res.json();
    expect(doc.endpoint).toBe('POST /render');
    expect(doc.request.fields.text).toContain("'dsl' ではない");
    expect(doc.request.fields).toHaveProperty('mode');
    expect(doc.response).toHaveProperty('400');
    expect(doc.response).toHaveProperty('422');
    expect(doc.example).toContain('"text"');
  });

  test('dsl フィールドで送ると 400 で「text です」と言われる', async ({ request }) => {
    const res = await request.post('/render', { data: { dsl: OK_DSL, mode: 'local' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("'text'");
    expect(body.error).toContain("'dsl'");
    // 仕様も一緒に返すので、その場で正しい形が分かる。
    expect(body.api.endpoint).toBe('POST /render');
  });

  test('text が無い / 空 / 文字列でないときも 400', async ({ request }) => {
    const missing = await request.post('/render', { data: { mode: 'local' } });
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error).toContain("'text'");

    const empty = await request.post('/render', { data: { text: '   ' } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error).toContain('empty');

    const notString = await request.post('/render', { data: { text: 42 } });
    expect(notString.status()).toBe(400);
    expect((await notString.json()).error).toContain('string');
  });

  test('知らない mode は 400 で選べる値を示す', async ({ request }) => {
    const res = await request.post('/render', { data: { text: OK_DSL, mode: 'cloud' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('local');
    expect(body.error).toContain('online');
  });

  test('正しい形なら 200 + SVG', async ({ request }) => {
    const res = await request.post('/render', { data: { text: OK_DSL, mode: 'local' } });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/svg+xml');
    expect(await res.text()).toContain('<svg');
  });

  test('文法エラーは 200 の絵ではなく 422 で返る', async ({ request }) => {
    const res = await request.post('/render', {
      data: { text: BAD_DSL, mode: 'local' },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.kind).toBe('plantuml-syntax');
    expect(String(body.error)).toMatch(/error/i);
  });

  test('画面側は 422 でも直前の図を残したまま帯だけを出す', async ({ page }) => {
    await gotoApp(page);
    await page.waitForSelector('#preview-svg svg', { timeout: 8000 });
    const before = await page.locator('#preview-svg').innerHTML();

    await page.locator('#editor').fill(BAD_DSL);
    await page.waitForTimeout(1500);

    await expect(page.locator('#render-error-overlay')).toBeVisible();
    // 図は消えていない
    expect(await page.locator('#preview-svg').innerHTML()).toBe(before);
  });
});
