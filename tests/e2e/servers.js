// @ts-check
// BLK-releaser-20260908-2030-2 — worker ごとに別ポートの server.py を持たせるための道具。
// E2E をサーバ 1 台で回すと --workers=1 でしか安定しないので、worker 数だけサーバを立てる。
// 起動は globalSetup、停止は globalTeardown。ポートの割り当ては test-results/e2e-ports.json に
// 書き出し、worker 側は playwright.config.js の再読み込み時にそれを読んで baseURL を決める
// (Playwright は config を worker プロセスでも読み直し、そのとき TEST_PARALLEL_INDEX が入っている)。
const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PORTS_FILE = path.join(REPO_ROOT, 'test-results', 'e2e-ports.json');

function basePort() {
  return Number(process.env.PUA_PORT || 8766);
}

// worker が config 再読み込み時に呼ぶ。globalSetup が書いた割り当てを読む。
function portForParallelIndex(index) {
  try {
    const map = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8'));
    if (map.ports && map.ports[index] != null) return Number(map.ports[index]);
  } catch (e) {}
  return basePort() + index;
}

// 応答があれば「誰かが使っている」。Windows は使用中のポートにも bind が成功して
// 先着のサーバが応答し続けるので、bind ではなく connect で見る。
function isPortTaken(port, timeoutMs) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (taken) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(taken);
    };
    sock.setTimeout(timeoutMs || 500);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, '127.0.0.1');
  });
}

function httpOk(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: port, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitReady(port, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 30000);
  while (Date.now() < deadline) {
    if (await httpOk(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function spawnServer(port) {
  const python = process.env.PUA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const child = spawn(python, ['server.py'], {
    cwd: REPO_ROOT,
    env: Object.assign({}, process.env, { PUA_PORT: String(port) }),
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  child.unref();
  return child;
}

// 空きポートを base から上に探して 1 台起こす。起動待ちは 30 秒。
async function startOn(port) {
  const child = spawnServer(port);
  const ok = await waitReady(port, 30000);
  if (!ok) {
    stopPid(child.pid);
    return null;
  }
  return { port: port, pid: child.pid, spawned: true };
}

// python の子として java(PlantUML daemon)がぶら下がるので、木ごと止める。
function stopPid(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      require('child_process').execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch (e) {}
}

/**
 * worker 数だけサーバを用意する。
 * index 0 は PUA_PORT が既に応答していればそれを再利用する(builder が手で起こした
 * サーバをそのまま使うため)。1 以降は必ず自分で起こす — 他体のサーバを掴むと
 * 別の worktree に対してテストしてしまう。
 */
async function startPool(workers) {
  const base = basePort();
  const entries = [];
  let candidate = base;
  for (let i = 0; i < workers; i++) {
    if (i === 0 && (await isPortTaken(base)) && (await httpOk(base))) {
      entries.push({ port: base, pid: null, spawned: false });
      candidate = base + 1;
      continue;
    }
    let started = null;
    for (let tries = 0; tries < 40 && !started; tries++, candidate++) {
      if (await isPortTaken(candidate)) continue;
      started = await startOn(candidate);
    }
    if (!started) {
      for (const e of entries) stopPid(e.pid);
      throw new Error('E2E: worker ' + i + ' 用の server.py を起こせなかった (base=' + base + ')');
    }
    entries.push(started);
  }
  fs.mkdirSync(path.dirname(PORTS_FILE), { recursive: true });
  fs.writeFileSync(PORTS_FILE, JSON.stringify({
    base: base,
    ports: entries.map((e) => e.port),
    pids: entries.map((e) => e.pid),
  }, null, 2), 'utf8');
  return entries;
}

function stopPool() {
  let map = null;
  try {
    map = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8'));
  } catch (e) {
    return;
  }
  for (const pid of map.pids || []) stopPid(pid);
  try { fs.rmSync(PORTS_FILE, { force: true }); } catch (e) {}
}

module.exports = {
  PORTS_FILE,
  basePort,
  portForParallelIndex,
  isPortTaken,
  httpOk,
  waitReady,
  startPool,
  stopPool,
  stopPid,
};
