// @ts-check
// BLK-releaser-20260908-2030-2 — worker 数だけ server.py を起こす。
// webServer(1 台)の代わり。ポートの割り当ては servers.js が test-results/e2e-ports.json に書く。
const servers = require('./servers.js');

module.exports = async (config) => {
  const workers = Math.max(1, Number(config && config.workers) || 1);
  const entries = await servers.startPool(workers);
  console.log('E2E servers: ' + entries.map((e) => e.port + (e.spawned ? '' : '(reused)')).join(', '));
};
