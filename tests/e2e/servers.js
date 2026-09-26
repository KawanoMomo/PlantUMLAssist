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
// BLK-owner-20260926-0550-7: E2E が起こすサーバの設定 (.assist-prefs.json) と既定の保存先の置き場所。
// 渡さないと server.py はリポジトリ直下を使い、同じチェックアウトから起こした利用者のアプリと保存先の設定を
// 共有して、テストの図が利用者の保存先に書かれた (data-loss)。サーバ 1 台ごとに別のフォルダにする。
const DATA_ROOT_BASE = path.join(REPO_ROOT, 'test-results', 'e2e-data');
const USER_PREFS = path.join(REPO_ROOT, '.assist-prefs.json');

function dataRootFor(port) {
  return path.join(DATA_ROOT_BASE, 'p' + port);
}

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

function getJson(port, route) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: port, path: route, timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// そのサーバの設定と既定の保存先が test-results/ の下 (PUA_DATA_ROOT で起こしたもの) か。
// 利用者のアプリ・/data-root を持たない古いサーバは false。
async function isSandboxServer(port) {
  const info = await getJson(port, '/data-root');
  if (!info || info.sandbox !== true || typeof info.dataRoot !== 'string') return false;
  const rel = path.relative(path.resolve(REPO_ROOT, 'test-results'), path.resolve(info.dataRoot));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// OS に空きポートを 1 つ選ばせる (49152 以上の一時ポート)。ループの体が使う 87xx〜88xx の帯を踏まない。
function ephemeralPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
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
  // 前の実行が残した設定を持ち越さない (保存先の設定を替える spec の後始末に頼らない)。
  const dataRoot = dataRootFor(port);
  fs.rmSync(dataRoot, { recursive: true, force: true });
  fs.mkdirSync(dataRoot, { recursive: true });
  const child = spawn(python, ['server.py'], {
    // cwd はリポジトリ直下のまま: spec が渡す相対の保存先 (test-results/autosave/...) はここから解く。
    cwd: REPO_ROOT,
    // PUA_NO_IDLE_EXIT: spec ごとにブラウザを閉じても落ちない (BLK-human-20260924-0900)
    // PUA_DATA_ROOT: 設定と既定の保存先を test-results/ の下へ (BLK-owner-20260926-0550-7)
    env: Object.assign({}, process.env, {
      PUA_PORT: String(port), PUA_NO_IDLE_EXIT: '1', PUA_DATA_ROOT: dataRoot,
    }),
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
 * index 0 は PUA_PORT が既に応答していて、それが PUA_DATA_ROOT で起こしたテスト用のサーバ
 * (設定と保存先が test-results/ の下) のときだけ再利用する。利用者のアプリや設定の置き場所を
 * 持つサーバは再利用しない — テストがそのサーバの保存先の設定を替え、図を書く (BLK-owner-20260926-0550-7)。
 * そのときは OS に選ばせた一時ポートで自分のサーバを起こす (隣のポートは他体の帯なので踏まない)。
 * 1 以降は必ず自分で起こす — 他体のサーバを掴むと別の worktree に対してテストしてしまう。
 */
async function startPool(workers) {
  const base = basePort();
  const entries = [];
  let candidate = base;
  let ephemeral = false;
  for (let i = 0; i < workers; i++) {
    if (i === 0 && (await isPortTaken(base))) {
      if ((await httpOk(base)) && (await isSandboxServer(base))) {
        entries.push({ port: base, pid: null, spawned: false });
        candidate = base + 1;
        continue;
      }
      ephemeral = true;
    }
    let started = null;
    for (let tries = 0; tries < 40 && !started; tries++, candidate++) {
      if (ephemeral) candidate = await ephemeralPort();
      if (await isPortTaken(candidate)) continue;
      started = await startOn(candidate);
    }
    if (!started) {
      for (const e of entries) stopPid(e.pid);
      throw new Error('E2E: worker ' + i + ' 用の server.py を起こせなかった (base=' + base + ')');
    }
    entries.push(started);
  }
  // 使うサーバが 1 台残らず test-results/ の下に設定を置いていることを、走らせる前に確かめる。
  for (const e of entries) {
    if (!(await isSandboxServer(e.port))) {
      for (const x of entries) stopPid(x.pid);
      throw new Error('E2E: ' + e.port + ' の server.py の設定の置き場所が test-results/ の下ではない (利用者の .assist-prefs.json を使うおそれ)');
    }
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
  // 自分で起こしたサーバの設定の置き場所だけ消す (再利用したサーバの分は持ち主のもの)。
  (map.ports || []).forEach((port, i) => {
    if (!(map.pids || [])[i]) return;
    try { fs.rmSync(dataRootFor(port), { recursive: true, force: true }); } catch (e) {}
  });
  try { fs.rmSync(PORTS_FILE, { force: true }); } catch (e) {}
}

// リポジトリ直下の .assist-prefs.json (利用者の設定) の中身。無ければ null。E2E の前後で比べる。
function readUserPrefs() {
  try { return fs.readFileSync(USER_PREFS, 'utf8'); } catch (e) { return null; }
}

module.exports = {
  PORTS_FILE,
  DATA_ROOT_BASE,
  USER_PREFS,
  dataRootFor,
  spawnServer,
  isSandboxServer,
  ephemeralPort,
  readUserPrefs,
  basePort,
  portForParallelIndex,
  isPortTaken,
  httpOk,
  waitReady,
  startPool,
  stopPool,
  stopPid,
};
