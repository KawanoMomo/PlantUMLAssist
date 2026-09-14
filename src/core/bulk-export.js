'use strict';
window.MA = window.MA || {};

// bulk-export — 開いている図を「まとめて」SVG に書き出す。
//
// 1 枚ずつ書き出すには タブ切替 → Export を開く → SVG を選ぶ の 3 クリックが
// 図の枚数だけ必要になり、枚数に比例して手数が伸びていた。ここではタブを
// 切り替えずに各ドキュメントの DSL を直接レンダリングして保存するので、
// 何枚あっても Export を開く → 「全図をSVGで保存」の 2 クリックで済む。
//
// 保存先は 1 つの zip。ブラウザは 1 操作から連続する自動ダウンロードを 2 件目以降
// 黙って捨てるため、11 個のファイルとしては落ちてこない。
//
// レンダリングと保存は呼び出し側から関数として渡す(deps)。この形にしておくと
// ブラウザ API に触れずに計画とレポートを単体テストできる。
window.MA.bulkExport = (function() {

  // plan(docs) — 書き出す順序とファイル名を決める。DSL が空の図は対象外。
  // 同名タブが残っていても上書きにならないよう -2, -3 … で一意化する。
  function plan(docs) {
    var list = Array.isArray(docs) ? docs : [];
    var used = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || typeof d.dsl !== 'string' || d.dsl.trim() === '') continue;
      var base = String(d.name == null || d.name === '' ? 'diagram' : d.name);
      var name = base;
      var n = 2;
      while (used[name]) { name = base + '-' + n; n++; }
      used[name] = true;
      out.push({ id: d.id, name: base, filename: name + '.svg', dsl: d.dsl });
    }
    return out;
  }

  // summarize(results) — 各件 { filename, ok, error } を人向けの 1 行にする。
  function summarize(results) {
    var list = Array.isArray(results) ? results : [];
    var ok = 0;
    var failedNames = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].ok) ok++;
      else if (list[i]) failedNames.push(list[i].filename);
    }
    var total = list.length;
    var message;
    if (total === 0) message = '書き出せる図がありません';
    else if (failedNames.length === 0) message = total + ' 枚を SVG で保存しました';
    else message = total + ' 枚中 ' + ok + ' 枚を保存しました（失敗: ' + failedNames.join(', ') + '）';
    return { total: total, ok: ok, failed: failedNames.length, failedNames: failedNames, message: message };
  }

  // runSequential(docs, deps, done) — plan の順に render → save を 1 件ずつ実行する。
  // deps.render(dsl, cb) は cb(errorOrNull, svg) を呼ぶ。同期に呼べば全体も同期で終わるので、
  // Promise を待たずに単体テストできる。
  // deps.save(filename, svg) は 1 件を保存する。deps.onProgress(done, total) は任意。
  // 1 枚失敗しても残りは続ける(11 枚中 1 枚のエラーで全部やり直しにしない)。
  function runSequential(docs, deps, done) {
    deps = deps || {};
    var items = plan(docs);
    var results = [];

    function finish() {
      var s = summarize(results);
      s.results = results;
      if (done) done(s);
    }

    function step(i) {
      if (i >= items.length) return finish();
      var item = items[i];
      var moved = false;
      var next = function(err, svg) {
        if (moved) return;   // render 側が cb を二重に呼んでも 1 件は 1 件
        moved = true;
        if (!err && !svg) err = new Error('empty svg');
        if (err) results.push({ filename: item.filename, ok: false, error: String(err && err.message ? err.message : err) });
        else {
          try {
            deps.save(item.filename, svg);
            results.push({ filename: item.filename, ok: true, error: null });
          } catch (e) {
            results.push({ filename: item.filename, ok: false, error: String(e && e.message ? e.message : e) });
          }
        }
        if (deps.onProgress) deps.onProgress(results.length, items.length);
        step(i + 1);
      };
      try {
        deps.render(item.dsl, next);
      } catch (e) {
        next(e, null);
      }
    }

    step(0);
  }

  // run(docs, deps) — runSequential の Promise 版。deps.render(dsl) は SVG 文字列で
  // 解決する Promise を返す。アプリからはこちらを使う。
  function run(docs, deps) {
    deps = deps || {};
    return new Promise(function(resolve) {
      runSequential(docs, {
        render: function(dsl, cb) {
          Promise.resolve(deps.render(dsl)).then(function(svg) { cb(null, svg); }, function(e) { cb(e, null); });
        },
        save: deps.save,
        onProgress: deps.onProgress,
      }, resolve);
    });
  }

  // ── ZIP (無圧縮 store) ────────────────────────────────────────────────────
  // ブラウザは 1 回の操作から連続して発生する自動ダウンロードを 2 件目以降黙って
  // 捨てるため、11 枚を 11 ファイルとして落とすことはできない。まとめて 1 つの
  // zip にして 1 回だけ保存する。圧縮なし (store) なので外部ライブラリは要らない。

  var _crcTable = null;
  function _crc32(bytes) {
    if (!_crcTable) {
      _crcTable = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _crcTable[n] = c;
      }
    }
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ _crcTable[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }

  function _utf8(str) {
    var s = unescape(encodeURIComponent(String(str)));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function _push16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
  function _push32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }
  function _pushBytes(arr, bytes) { for (var i = 0; i < bytes.length; i++) arr.push(bytes[i]); }

  // 項目の中身をバイト列にする。文字列は UTF-8、Uint8Array (PNG など) はそのまま。
  // 資料用の PNG は文字列に直すと壊れるので、バイト列を素通しできる必要がある。
  function _bytesOf(content) {
    if (content == null) return new Uint8Array(0);
    if (content instanceof Uint8Array) return content;
    if (typeof ArrayBuffer !== 'undefined' && content instanceof ArrayBuffer) return new Uint8Array(content);
    if (Array.isArray(content)) return new Uint8Array(content);
    return _utf8(content);
  }

  // buildZip([{ name, content }]) — 無圧縮 zip を Uint8Array で返す。
  // content は文字列でもバイト列 (Uint8Array / ArrayBuffer) でもよい。
  function buildZip(files) {
    var list = Array.isArray(files) ? files : [];
    var out = [];
    var central = [];
    var offsets = [];
    var i;

    for (i = 0; i < list.length; i++) {
      var nameBytes = _utf8(list[i].name);
      var data = _bytesOf(list[i].content);
      var crc = _crc32(data);
      offsets.push(out.length);

      _push32(out, 0x04034b50);          // local file header
      _push16(out, 20);                  // version needed
      _push16(out, 0x0800);              // flag: 名前は UTF-8
      _push16(out, 0);                   // method: store
      _push16(out, 0);                   // mod time
      _push16(out, 0x21);                // mod date (1996-01-01 相当の固定値)
      _push32(out, crc);
      _push32(out, data.length);
      _push32(out, data.length);
      _push16(out, nameBytes.length);
      _push16(out, 0);                   // extra field length
      _pushBytes(out, nameBytes);
      _pushBytes(out, data);

      _push32(central, 0x02014b50);      // central directory header
      _push16(central, 20);              // version made by
      _push16(central, 20);              // version needed
      _push16(central, 0x0800);
      _push16(central, 0);
      _push16(central, 0);
      _push16(central, 0x21);
      _push32(central, crc);
      _push32(central, data.length);
      _push32(central, data.length);
      _push16(central, nameBytes.length);
      _push16(central, 0);               // extra
      _push16(central, 0);               // comment
      _push16(central, 0);               // disk number
      _push16(central, 0);               // internal attrs
      _push32(central, 0);               // external attrs
      _push32(central, offsets[i]);
      _pushBytes(central, nameBytes);
    }

    var centralOffset = out.length;
    _pushBytes(out, central);
    _push32(out, 0x06054b50);            // end of central directory
    _push16(out, 0);
    _push16(out, 0);
    _push16(out, list.length);
    _push16(out, list.length);
    _push32(out, central.length);
    _push32(out, centralOffset);
    _push16(out, 0);                     // comment length

    return new Uint8Array(out);
  }

  // zipName(now) — 添付ファイルとして見分けが付くよう日時を入れる。
  function zipName(now) {
    var d = now || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'diagrams-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes()) + '.zip';
  }

  return {
    plan: plan,
    summarize: summarize,
    run: run,
    runSequential: runSequential,
    buildZip: buildZip,
    zipName: zipName,
  };
})();
