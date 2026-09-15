'use strict';
// RGBA 画素から Windows の .ico を組む (BLK-human-20260915-1202)。
//
// 画像の生成 (SVG のラスタライズ) は tools/make-icon.js の仕事で、ここは
// 「並べて .ico のバイト列にする」ところだけを持つ。外に出ない純関数なので
// unit テスト (tests/ico.test.js) で中身を検査できる。
//
// 各エントリは BMP (BITMAPINFOHEADER + 32bpp BGRA のボトムアップ + AND マスク) で持つ。
// 256px も PNG 圧縮せず BMP のまま入れる — PyInstaller も Inno Setup も古典的な
// BMP エントリなら確実に読めるため (PNG エントリは実装によって取りこぼす)。

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;
const BITMAPINFOHEADER_SIZE = 40;

/** 1 枚分の BMP エントリ (DIB) を作る。rgba は上から下・RGBA 順の size*size*4 バイト。 */
function buildDib(size, rgba) {
  if (!Number.isInteger(size) || size < 1 || size > 256) {
    throw new Error('size must be 1..256, got ' + size);
  }
  const expected = size * size * 4;
  if (!rgba || rgba.length !== expected) {
    throw new Error('rgba length must be ' + expected + ' for size ' + size + ', got ' + (rgba ? rgba.length : 0));
  }
  const rowBytes = size * 4;
  // AND マスクは 1bpp・1 行 4 バイト境界。32bpp なのでアルファは XOR 側が持つが、
  // 古い描画経路のために 0 埋め (= 全部不透明扱い) のマスクを必ず付ける。
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const buf = Buffer.alloc(BITMAPINFOHEADER_SIZE + rowBytes * size + maskRowBytes * size);
  buf.writeUInt32LE(BITMAPINFOHEADER_SIZE, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8); // 高さは XOR + AND の 2 枚分を書く決まり
  buf.writeUInt16LE(1, 12);      // planes
  buf.writeUInt16LE(32, 14);     // bpp
  buf.writeUInt32LE(0, 16);      // BI_RGB (無圧縮)
  buf.writeUInt32LE(rowBytes * size + maskRowBytes * size, 20);
  let o = BITMAPINFOHEADER_SIZE;
  for (let y = size - 1; y >= 0; y--) { // ボトムアップ
    const src = y * rowBytes;
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      buf[o++] = rgba[s + 2]; // B
      buf[o++] = rgba[s + 1]; // G
      buf[o++] = rgba[s];     // R
      buf[o++] = rgba[s + 3]; // A
    }
  }
  return buf;
}

/**
 * images: [{ size, rgba }] を .ico のバイト列にする。
 * 小さい順に並べ替えて入れる (エクスプローラは順序を問わないが、差分を安定させる)。
 */
function buildIco(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('images must be a non-empty array');
  }
  const sorted = images.slice().sort((a, b) => a.size - b.size);
  const seen = new Set();
  for (const img of sorted) {
    if (seen.has(img.size)) throw new Error('duplicate size ' + img.size);
    seen.add(img.size);
  }
  const dibs = sorted.map(img => buildDib(img.size, img.rgba));
  const header = Buffer.alloc(ICONDIR_SIZE + ICONDIRENTRY_SIZE * sorted.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = ICON
  header.writeUInt16LE(sorted.length, 4);
  let offset = header.length;
  sorted.forEach((img, i) => {
    const e = ICONDIR_SIZE + ICONDIRENTRY_SIZE * i;
    header[e] = img.size === 256 ? 0 : img.size;     // 256 は 0 で表す
    header[e + 1] = img.size === 256 ? 0 : img.size;
    header[e + 2] = 0; // パレット色数 (32bpp なので 0)
    header[e + 3] = 0;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(dibs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += dibs[i].length;
  });
  return Buffer.concat([header].concat(dibs));
}

/** buildIco の逆。テストと検査用に、入っているサイズと bpp を読み出す。 */
function readIcoEntries(buf) {
  if (buf.length < ICONDIR_SIZE || buf.readUInt16LE(2) !== 1) throw new Error('not an .ico');
  const count = buf.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const e = ICONDIR_SIZE + ICONDIRENTRY_SIZE * i;
    out.push({
      size: buf[e] === 0 ? 256 : buf[e],
      bpp: buf.readUInt16LE(e + 6),
      bytes: buf.readUInt32LE(e + 8),
      offset: buf.readUInt32LE(e + 12),
    });
  }
  return out;
}

module.exports = { buildIco, buildDib, readIcoEntries, ICON_SIZES: [16, 24, 32, 48, 64, 128, 256] };
