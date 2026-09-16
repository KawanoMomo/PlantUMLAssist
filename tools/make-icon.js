'use strict';
// packaging/icon.svg から packaging/icon.ico を起こす (BLK-human-20260915-1202)。
//
//   node tools/make-icon.js
//
// SVG が正本。ico は生成物だが、ビルド機に画像ツールを入れずに済むようリポジトリに入れる
// (CI は .ico をそのまま使う)。ラスタライズはリポジトリに既にある Playwright の
// Chromium で行うので、追加の依存は要らない。
const fs = require('fs');
const path = require('path');
const { buildIco, ICON_SIZES } = require('./ico.js');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'packaging', 'icon.svg');
const icoPath = path.join(root, 'packaging', 'icon.ico');

async function rasterize(page, svg, size) {
  return page.evaluate(async ({ svg, size }) => {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = new Image();
    img.width = size;
    img.height = size;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg load failed')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, { svg, size });
}

async function main() {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!DOCTYPE html><body></body>');
    const images = [];
    for (const size of ICON_SIZES) {
      images.push({ size, rgba: Buffer.from(await rasterize(page, svg, size)) });
    }
    fs.writeFileSync(icoPath, buildIco(images));
    console.log('wrote ' + icoPath + ' (' + ICON_SIZES.join(', ') + ')');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
