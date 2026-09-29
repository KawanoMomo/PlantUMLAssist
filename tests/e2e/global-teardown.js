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
  // BLK-owner-20260926-0550-7: E2E の前後でリポジトリ直下の .assist-prefs.json (利用者の設定) が変わっていない。
  const snap = path.join(__dirname, '..', '..', 'test-results', 'e2e-user-prefs.json');
  let before;
  try { before = JSON.parse(fs.readFileSync(snap, 'utf8')).text; } catch (e) { return; }
  try { fs.rmSync(snap, { force: true }); } catch (e) {}
  const after = servers.readUserPrefs();
  if (after !== before) {
    throw new Error('E2E の間にリポジトリ直下の .assist-prefs.json が変わった (利用者の保存先の設定)。' +
      '前: ' + JSON.stringify(before) + ' 後: ' + JSON.stringify(after));
  }
};
