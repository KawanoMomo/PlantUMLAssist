'use strict';
// BLK-releaser-20260908-2030-2 — worker ごとのポート割り当ての取り出しを守る。
// ここが壊れると全 worker が同じサーバを見て E2E が偽の赤になる。
var fs = require('fs');
var path = require('path');

var prevPort = process.env.PUA_PORT;
delete require.cache[require.resolve('../tests/e2e/servers.js')];
var servers = require('../tests/e2e/servers.js');

function writePorts(ports) {
  fs.mkdirSync(path.dirname(servers.PORTS_FILE), { recursive: true });
  fs.writeFileSync(servers.PORTS_FILE, JSON.stringify({ base: 8766, ports: ports, pids: [] }), 'utf8');
}
function clearPorts() {
  try { fs.rmSync(servers.PORTS_FILE, { force: true }); } catch (e) {}
}

describe('basePort', function() {
  test('PUA_PORT が無ければ 8766', function() {
    delete process.env.PUA_PORT;
    expect(servers.basePort()).toBe(8766);
  });
  test('PUA_PORT を数値で読む', function() {
    process.env.PUA_PORT = '8791';
    expect(servers.basePort()).toBe(8791);
  });
});

describe('portForParallelIndex', function() {
  test('割り当てファイルがあれば worker ごとの実ポートを返す', function() {
    writePorts([8791, 8792, 8801]);
    expect(servers.portForParallelIndex(0)).toBe(8791);
    expect(servers.portForParallelIndex(1)).toBe(8792);
    // 途中のポートが埋まっていて飛んだ場合も、base + index ではなく実際の値を返す
    expect(servers.portForParallelIndex(2)).toBe(8801);
    clearPorts();
  });
  test('割り当てファイルが無ければ base + index に落ちる', function() {
    clearPorts();
    process.env.PUA_PORT = '8791';
    expect(servers.portForParallelIndex(0)).toBe(8791);
    expect(servers.portForParallelIndex(3)).toBe(8794);
  });
  test('割り当てに無い index も base + index に落ちる', function() {
    writePorts([8791]);
    process.env.PUA_PORT = '8791';
    expect(servers.portForParallelIndex(2)).toBe(8793);
    clearPorts();
  });
  test('壊れた割り当てファイルでも例外を投げない', function() {
    fs.mkdirSync(path.dirname(servers.PORTS_FILE), { recursive: true });
    fs.writeFileSync(servers.PORTS_FILE, 'not json', 'utf8');
    process.env.PUA_PORT = '8766';
    expect(function() { servers.portForParallelIndex(1); }).not.toThrow();
    expect(servers.portForParallelIndex(1)).toBe(8767);
    clearPorts();
  });
});

describe('stopPid', function() {
  test('pid が無いときは何もしない', function() {
    expect(function() { servers.stopPid(null); }).not.toThrow();
    expect(function() { servers.stopPid(0); }).not.toThrow();
  });
});

describe('stopPool', function() {
  test('割り当てファイルが無ければ黙って戻る', function() {
    clearPorts();
    expect(function() { servers.stopPool(); }).not.toThrow();
  });
  test('止めたあとは割り当てファイルを消す', function() {
    writePorts([8791]);
    servers.stopPool();
    expect(fs.existsSync(servers.PORTS_FILE)).toBe(false);
  });
});

if (prevPort === undefined) delete process.env.PUA_PORT;
else process.env.PUA_PORT = prevPort;
