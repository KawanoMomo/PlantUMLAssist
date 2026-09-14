'use strict';

// svg-embedded-src — svg に畳まれている元の DSL を取り出す (CLI 側)。
//
// BLK-reviewer-20260914-2106: stale と出た図が「コメントを足しただけ」なのか
// 「中身が変わった」のかを、audit.js が描き直さずに言えるようにするための材料。
// PlantUML は書き出した svg の末尾に元の DSL を `<?plantuml-src …?>` として
// 畳んで埋める。展開は zlib の raw deflate + PlantUML 独自の base64 表。
// 同じ展開は server.py (decode_svg_plantuml_src) にもあるが、audit.js は
// server を立てずに回る道具なので、node で読める形をここに置く。
//
// 畳み方は 2 通り。PlantUML がそのまま書くと processing instruction
// `<?plantuml-src …?>`、svg を DOM に通して取り出し直した経路では
// `<!--?plantuml-src …?-->`。片方しか読めないと、確かめたかった図が黙って落ちる。
const zlib = require('zlib');

const SRC_RE = /<\?plantuml-src\s+([0-9A-Za-z_-]+)\s*\?>|<!--\?plantuml-src\s+([0-9A-Za-z_-]+)\s*\?-->/g;
const PLANTUML_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toStdBase64(token) {
  let out = '';
  for (const ch of token) {
    const i = PLANTUML_B64.indexOf(ch);
    out += i < 0 ? ch : STD_B64[i];
  }
  return out + '='.repeat((4 - (out.length % 4)) % 4);
}

// 畳まれた DSL を返す。埋まっていなければ null (「無い」と「空」を混ぜない)。
function decode(svgText) {
  if (typeof svgText !== 'string' || svgText === '') return null;
  let last = null;
  SRC_RE.lastIndex = 0;
  let m;
  while ((m = SRC_RE.exec(svgText)) !== null) last = m[1] || m[2];
  if (!last) return null;
  try {
    return zlib.inflateRawSync(Buffer.from(toStdBase64(last), 'base64')).toString('utf-8');
  } catch (e) {
    return null;
  }
}

module.exports = { decode };
