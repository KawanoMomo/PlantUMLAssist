// @ts-check
// BLK-releaser-20260908-2030-2 — worker 数だけ server.py を起こす。
// webServer(1 台)の代わり。ポートの割り当ては servers.js が test-results/e2e-ports.json に書く。
const fs = require('fs');
const path = require('path');
const servers = require('./servers.js');

// BLK-owner-20260926-0550-7: リポジトリ直下の .assist-prefs.json (利用者の保存先の設定) を E2E の前に控え、
// globalTeardown で変わっていないことを確かめる。
const USER_PREFS_SNAPSHOT = path.join(__dirname, '..', '..', 'test-results', 'e2e-user-prefs.json');

module.exports = async (config) => {
  fs.mkdirSync(path.dirname(USER_PREFS_SNAPSHOT), { recursive: true });
  fs.writeFileSync(USER_PREFS_SNAPSHOT, JSON.stringify({ text: servers.readUserPrefs() }), 'utf8');
  const workers = Math.max(1, Number(config && config.workers) || 1);
  const entries = await servers.startPool(workers);
  console.log('E2E servers: ' + entries.map((e) => e.port + (e.spawned ? '' : '(reused)')).join(', '));
};
