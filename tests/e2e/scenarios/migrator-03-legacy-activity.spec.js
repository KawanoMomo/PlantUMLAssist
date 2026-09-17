// @ts-check
// migrator 台本 手順3: 実物の .puml を開くと図種が正しく判定される。
// BLK-migrator-20260917-2349: 旧記法 activity (`(*) -->` / `if "c" then`) が usecase と判定されていた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const LEGACY = '@startuml\n(*) --> "電源投入"\n"電源投入" --> "自己診断"\nif "診断結果" then\n  -->[OK] "通常起動"\nelse\n  -->[NG] "エラー処理"\nendif\n@enduml\n';

test('手順3 旧記法だけの activity 図を開くと activity と判定される', async ({ page }) => {
  await gotoApp(page);
  // フォルダ/ファイルから開いた図の図種は workspace.detectType で決まる。
  const kind = await page.evaluate((text) => window.MA.workspace.detectType(text), LEGACY);
  expect(kind).toBe('plantuml-activity');
  // usecase の短縮形は従来どおり usecase のまま。
  const uc = await page.evaluate(() => window.MA.workspace.detectType('@startuml\nactor User\n(Login)\n@enduml\n'));
  expect(uc).toBe('plantuml-usecase');
});
