'use strict';
// アプリアイコン (BLK-human-20260915-1202)。
// .ico の組み立て (tools/ico.js) と、配布物の 3 箇所 (exe / インストーラ / 窓) が
// 同じ packaging/icon.ico を指していることを守る。
var fs = require('fs');
var path = require('path');
var ico = require('../tools/ico.js');

var root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

function solid(size, r, g, b, a) {
  var buf = Buffer.alloc(size * size * 4);
  for (var i = 0; i < size * size; i++) {
    buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = a;
  }
  return buf;
}

describe('tools/ico.js — .ico の組み立て', function() {
  test('ICONDIR の型と枚数を書き、サイズ順に並べる', function() {
    var buf = ico.buildIco([
      { size: 32, rgba: solid(32, 1, 2, 3, 255) },
      { size: 16, rgba: solid(16, 4, 5, 6, 255) },
    ]);
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1); // 1 = ICON
    expect(buf.readUInt16LE(4)).toBe(2);
    var entries = ico.readIcoEntries(buf);
    expect(entries.map(function(e) { return e.size; })).toEqual([16, 32]);
  });

  test('各エントリの offset と長さが実体と食い違わない', function() {
    var buf = ico.buildIco([
      { size: 16, rgba: solid(16, 9, 9, 9, 255) },
      { size: 48, rgba: solid(48, 9, 9, 9, 255) },
    ]);
    var entries = ico.readIcoEntries(buf);
    var end = 6 + 16 * entries.length;
    entries.forEach(function(e) {
      expect(e.offset).toBe(end);
      expect(e.bpp).toBe(32);
      end += e.bytes;
    });
    expect(end).toBe(buf.length);
  });

  test('256px はディレクトリ上 0 で表す (1 バイトに入らないため)', function() {
    var buf = ico.buildIco([{ size: 256, rgba: solid(256, 0, 0, 0, 0) }]);
    expect(buf[6]).toBe(0);
    expect(buf[7]).toBe(0);
    expect(ico.readIcoEntries(buf)[0].size).toBe(256);
  });

  test('DIB は 32bpp・高さ 2 倍・RGBA を BGRA に並べ替える', function() {
    var dib = ico.buildDib(1, Buffer.from([10, 20, 30, 40]));
    expect(dib.readUInt32LE(0)).toBe(40);   // BITMAPINFOHEADER
    expect(dib.readInt32LE(4)).toBe(1);     // width
    expect(dib.readInt32LE(8)).toBe(2);     // height = XOR + AND
    expect(dib.readUInt16LE(14)).toBe(32);  // bpp
    expect(dib.readUInt32LE(16)).toBe(0);   // BI_RGB
    expect(Array.from(dib.slice(40, 44))).toEqual([30, 20, 10, 40]); // BGRA
  });

  test('画素数が合わない・サイズが重複する入力は弾く', function() {
    expect(function() { ico.buildDib(16, Buffer.alloc(10)); }).toThrow('rgba length');
    expect(function() { ico.buildDib(0, Buffer.alloc(0)); }).toThrow('size must be');
    expect(function() {
      ico.buildIco([{ size: 16, rgba: solid(16, 0, 0, 0, 0) }, { size: 16, rgba: solid(16, 0, 0, 0, 0) }]);
    }).toThrow('duplicate size');
    expect(function() { ico.buildIco([]); }).toThrow('non-empty');
  });
});

describe('packaging/icon.ico — 配布される実物', function() {
  var buf = fs.readFileSync(path.join(root, 'packaging', 'icon.ico'));
  var entries = ico.readIcoEntries(buf);

  test('人間が求めた 16/32/48/256px が入っている', function() {
    var sizes = entries.map(function(e) { return e.size; });
    [16, 32, 48, 256].forEach(function(s) { expect(sizes).toContain(s); });
  });

  test('全エントリが 32bpp で、ファイル末尾まで隙間なく並ぶ', function() {
    var end = 6 + 16 * entries.length;
    entries.forEach(function(e) { expect(e.bpp).toBe(32); expect(e.offset).toBe(end); end += e.bytes; });
    expect(end).toBe(buf.length);
  });

  test('正本の SVG があり、文字を含まない図形だけでできている', function() {
    var svg = read('packaging/icon.svg');
    expect(svg).toContain('viewBox="0 0 256 256"');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('font-family');
  });
});

describe('アイコンの参照先 — exe・インストーラ・窓で同じ ico を使う', function() {
  test('PyInstaller の EXE に icon と version が通っている', function() {
    var spec = read('packaging/PlantUMLAssist.spec');
    expect(spec).toContain("ICON = at('packaging/icon.ico')");
    expect(spec).toContain('icon=ICON,');
    expect(spec).toContain('version=VERSION_FILE,');
    expect(spec).toContain("(at('packaging/icon.ico'), 'packaging'),"); // 窓が実行時に読む
  });

  test('インストーラの SetupIconFile とショートカットが同じ ico を指す', function() {
    var iss = read('packaging/installer.iss');
    expect(iss).toContain('SetupIconFile=icon.ico');
    var shortcuts = iss.split('\n').filter(function(l) { return l.indexOf('[Icons]') < 0 && l.indexOf('Name: "{group}') === 0 || l.indexOf('Name: "{autodesktop}') === 0; });
    expect(shortcuts.length).toBe(2);
    shortcuts.forEach(function(l) { expect(l).toContain(String.raw`IconFilename: "{app}\packaging\icon.ico"`); });
  });

  test('app.py が窓に同じ ico を貼る', function() {
    var py = read('app.py');
    expect(py).toContain("'packaging' / 'icon.ico'");
    expect(py).toContain('apply_window_icon()');
    expect(py).toContain('SetCurrentProcessExplicitAppUserModelID');
  });

  test('バージョンは package.json か git tag から取る (spec に直書きしない)', function() {
    var vi = fs.readFileSync(path.join(root, 'packaging', 'version_info.py'), 'utf8');
    expect(vi).toContain('APP_VERSION');
    expect(vi).toContain("'--tags'");
    expect(vi).toContain('package.json');
    expect(read('packaging/PlantUMLAssist.spec')).toContain('version_info.write_version_file(');
  });
});
