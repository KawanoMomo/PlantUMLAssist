// @ts-check
// junior 台本 シーケンス図 手順 4.5 の下ごしらえ (BLK-human-20260915-1204)。
// 帯 (activate〜deactivate) を持つ図と、帯の矩形の座標・矢印の y を読む道具。

// 1 @startuml / 2 participant A / 3 participant B / 4 participant C
// 5 A -> B : req / 6 activate B / 7 B -> C : work / 8 B --> A : res
// 9 deactivate B / 10 A -> B : next / 11 @enduml
const BAND_DSL = [
  '@startuml',
  'participant A',
  'participant B',
  'participant C',
  'A -> B : req',
  'activate B',
  'B -> C : work',
  'B --> A : res',
  'deactivate B',
  'A -> B : next',
  '@enduml',
].join('\n');

// 帯の矩形の画面座標。overlay に置かれる band-zone の rect を読む
// (これは当たり判定そのものなので、テストと実装が同じものを見る)。
async function bandBox(page) {
  return page.evaluate(() => {
    const r = document.querySelector('#overlay-layer rect[data-type="band-zone"]');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { cx: b.x + b.width / 2, y: b.y, h: b.height, line: r.getAttribute('data-line') };
  });
}

// プレビューの座標を実マウスで押す。合成 dispatchEvent は overlay の当たり判定
// (ライフラインの当たり矩形など) を素通りして不具合を隠すので、必ず page.mouse を使う。
async function clickPreviewAt(page, clientX, clientY) {
  await page.mouse.click(clientX, clientY);
  await page.waitForTimeout(400);
}

// ピッカー → メッセージのフォーム → 確定。本文は空のまま (行の位置だけを見る)。
async function insertMessage(page, from, to) {
  await page.locator('#seq-pick-message').click();
  await page.locator('#seq-mod-from').selectOption(from);
  await page.locator('#seq-mod-to').selectOption(to);
  await page.locator('#seq-mod-confirm').click();
  await page.waitForTimeout(800);
}

// 図の最後のメッセージ (= 足したばかりの矢印とは限らないので呼ぶ側が使い分ける) の y。
async function lastMessageY(page) {
  return page.evaluate(() => {
    const gs = document.querySelectorAll('#preview-container svg g.message');
    if (gs.length === 0) return null;
    let best = null;
    gs.forEach((g) => {
      const line = g.querySelector('line');
      if (!line) return;
      const b = line.getBoundingClientRect();
      const y = b.y + b.height / 2;
      if (best === null || y > best) best = y;
    });
    return best;
  });
}

// DSL の n 行目に対応するメッセージの矢印の y (行は data-line が付いた overlay 経由で引く)。
async function messageYByLine(page, line) {
  return page.evaluate((n) => {
    const r = document.querySelector('#overlay-layer rect[data-type="message"][data-line="' + n + '"]');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return b.y + b.height / 2;
  }, line);
}

module.exports = { BAND_DSL, bandBox, clickPreviewAt, insertMessage, lastMessageY, messageYByLine };
