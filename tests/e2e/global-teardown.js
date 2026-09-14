// @ts-check
// BLK-releaser-20260908-0800 — E2E が作った保存フォルダを実行の最後にまとめて消す。
// spec 側の afterAll でも消しているが、テストが途中で落ちた run の分もここで片付ける
// (残骸が成果物リポジトリに溜まると配布物に混ざるため)。
const fs = require('fs');
const path = require('path');
const servers = require('./servers.js');

module.exports = async () => {
  const dir = path.join(__dirname, '..', '..', 'test-results', 'autosave');
  fs.rmSync(dir, { recursive: true, force: true });
  // BLK-releaser-20260908-2030-2 — globalSetup が起こした worker ごとの server.py を
  // (ぶら下がる java ごと)止める。再利用したサーバ(pid=null)には触らない。
  servers.stopPool();
};
