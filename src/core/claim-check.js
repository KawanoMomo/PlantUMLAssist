'use strict';
window.MA = window.MA || {};

// claim-check — 手で書いた指摘の「根拠」を毎回機械で確かめ直す。
//
// BLK-reviewer-20260908-0003: 指摘の中には audit.js のどの監査 (name / method /
// consistency / family / trace) にも当たらない、reviewer が図を読んで手で書いた
// ものがある。その多くは「A 図のこの遷移に対応する行が B 図に無い」という形で、
// 根拠は B 図の中身にある。ところが指摘そのものは A 図に貼られるので、B 図が
// 直って根拠が消えても誰も気付かない。実際に「dma_transfer_sequence に
// Spi_Reset が無い」は、Spi_Reset() が書かれた後も 3 run 引き継がれていた。
// 毎 run 全文を読み直すのは図の枚数 × 手動指摘数に比例して増える。
//
// そこで、指摘の本文に根拠を 1 行の決まった書き方で残せるようにし、受信箱を
// 開くたびにその根拠だけを確かめ直す。根拠が崩れていれば「この指摘は読み直す」
// と名指しで出る。読み直す対象は崩れた件数ぶんだけで、枚数には比例しない。
//
//   根拠: dma_transfer_sequence に Spi_Reset が無い
//   根拠: dma_state に Error --> Idle がある
//
// DOM にもサーバにも触らない。走査と描画は app.js。
window.MA.claimCheck = (function() {
  // 「根拠: {図名} に {語} が(無い|ある)」。図名と語は空白を含まない 1 語。
  // 全角コロンでも書ける (日本語入力のまま打つため)。
  var CLAIM_RE = /根拠\s*[:：]\s*([^\s]+)\s*に\s*(.+?)\s*が\s*(無い|ない|ある)\s*$/;

  function _s(v) { return v == null ? '' : String(v); }

  // text: 指摘の本文 → { doc, token, expect: 'absent'|'present', raw } | null
  function parse(text) {
    var m = _s(text).match(CLAIM_RE);
    if (!m) return null;
    var token = m[2].trim();
    if (!token) return null;
    return {
      doc: m[1].trim(),
      token: token,
      expect: (m[3] === 'ある') ? 'present' : 'absent',
      raw: m[0],
    };
  }

  function _docsByName(docs) {
    var map = {};
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (d && typeof d.name === 'string') map[d.name] = _s(d.dsl);
    });
    return map;
  }

  // 語が本文に出てくる最初の行 (1 始まり)。0 なら出てこない。
  // コメント行 (指摘ピンを含む) は数えない。指摘そのものを根拠にすると、
  // 指摘を書いた瞬間に根拠が立ってしまう。
  function _findLine(dsl, token) {
    var lines = _s(dsl).replace(/\r\n?/g, '\n').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*'/.test(lines[i])) continue;
      if (lines[i].indexOf(token) >= 0) return i + 1;
    }
    return 0;
  }

  // claim を今の図の束に当てる。
  // → { ok, actual, line, missing } (missing は根拠の図そのものが無い)
  function check(docs, claim) {
    if (!claim) return null;
    var map = _docsByName(docs);
    if (!Object.prototype.hasOwnProperty.call(map, claim.doc)) {
      return { ok: false, actual: 'unknown', line: 0, missing: true };
    }
    var line = _findLine(map[claim.doc], claim.token);
    var actual = line ? 'present' : 'absent';
    return { ok: actual === claim.expect, actual: actual, line: line, missing: false };
  }

  // items: 受信箱の指摘 [{ doc, id, text, ... }]、docs: [{ name, dsl }]
  // → { claims: 根拠を持つ指摘, broken: 根拠が崩れた指摘 }
  function scan(items, docs) {
    var claims = [], broken = [];
    (Array.isArray(items) ? items : []).forEach(function(it) {
      var claim = parse(it && it.text);
      if (!claim) return;
      var res = check(docs, claim);
      var entry = { item: it, claim: claim, result: res };
      claims.push(entry);
      if (!res.ok) broken.push(entry);
    });
    return { claims: claims, broken: broken };
  }

  // 崩れ方を 1 行で言う。「読み直せ」ではなく「何が変わったか」を言う
  // (読み直す前に、直っただけなのか別物になったのかが分かるように)。
  function describe(entry) {
    if (!entry || !entry.claim) return '';
    var c = entry.claim, r = entry.result || {};
    if (r.missing) return c.doc + ' が保存フォルダに無い (根拠を確かめられない)';
    if (c.expect === 'absent') {
      return c.doc + ' に ' + c.token + ' が L' + r.line + ' に書かれている (無いことが根拠だった)';
    }
    return c.doc + ' から ' + c.token + ' が消えている (あることが根拠だった)';
  }

  function headText(res) {
    var n = (res && res.claims) ? res.claims.length : 0;
    var b = (res && res.broken) ? res.broken.length : 0;
    if (n === 0) return '根拠付きの指摘はありません';
    if (b === 0) return '根拠付き ' + n + ' 件 — すべて根拠は立っています';
    return '根拠付き ' + n + ' 件 — 根拠が崩れた ' + b + ' 件 (読み直す)';
  }

  return {
    parse: parse, check: check, scan: scan,
    describe: describe, headText: headText,
  };
})();
