// @ts-check
// BLK-junior-20260908-0003 の画面写真。名前変更ダイアログはブラウザ標準の
// prompt で撮れないので、説明文そのものを画面に出して撮る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('./helpers');

const OUT = shotOut('shot-blk-junior-0003.png');

test('shot: 名前変更ダイアログの説明文', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    const ws = window.MA.workspace;
    const text = ws.nameRuleText ? ws.nameRuleText() : '図の名前 (英数字・_ ・- のみ)';
    const box = document.createElement('div');
    box.id = 'shot-name-rule';
    box.style.cssText = 'position:fixed;left:20px;top:20px;z-index:9999;width:520px;'
      + 'background:#1e1e1e;color:#ddd;border:1px solid #555;border-radius:4px;'
      + 'padding:14px;font-family:sans-serif;font-size:13px;line-height:1.6;';
    box.innerHTML = '<div style="color:#888;font-size:11px;margin-bottom:6px;">'
      + 'タブをダブルクリックしたときの名前変更ダイアログ</div>'
      + '<div>' + text + '</div>'
      + '<input value="GPIOドライバ派生クラス(レビュー反映)" style="width:100%;'
      + 'box-sizing:border-box;margin-top:8px;padding:4px;background:#2a2a2a;'
      + 'color:#eee;border:1px solid #555;border-radius:3px;font-size:13px;">';
    document.body.appendChild(box);
  });
  await page.waitForTimeout(300);
  await page.locator('#shot-name-rule').screenshot({ path: OUT });
});
