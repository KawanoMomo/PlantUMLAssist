// @ts-check
'use strict';
// BLK-owner-20260926-1628-1: 選択枠の当たりの基準 (実物の図で、どの点を指すとどの要素の枠が出るか)。
//
// 選択枠の当て方を変えるたびに、migrator が「枠 ok」と記録した実物の図が退行し、マージの後で
// 手の測り直しで初めて分かっていた。ここでは progress.md で描画 ok・枠 ok と記録された図を、
// migrator と同じ道 (ファイルを開く → 幅に合わせる → 要素を指す) で測り、指した点ごとに
// 出る枠 (data-type と行) を基準として持つ。当て方を変えた変更は、基準で枠が出ていた点で
// 枠が出なくなる・別の行の枠に変わると赤になる (migrator の NG「枠が出ない」「別の要素が選ばれる」)。
//
// 指す点は SVG に描かれた要素ごとに 1 つ: 文字・矩形・楕円・多角形は外接矩形の中心、線 (path / line) は
// 線の長さの半分の点 (矢じりの外接矩形ではなく線の上。migrator 台本 手順 4 と同じ)。点の名前は
// SVG 座標で付けるので、画面の倍率や窓の大きさが変わっても同じ点を指す。
// 出る枠は page.mouse.move の代わりに document.elementFromPoint で引く。ホバーの処理
// (src/app.js の overlay の mousemove) は指した点の一番上の rect をそのまま光らせるので同じ答えになる
// (20260926 の突き合わせで 140 点すべて一致)。1 枚 0.6 秒前後で、実物 181 枚が 2 分で測れる。
//
// 基準は PlantUML の版ごとのファイル (hit-baseline/plantuml-{版}.json)。版が違う基準しか無いときは
// 違いを「版の違い」として報告するだけで赤にしない (版を上げた回に基準を書き直す)。
const fs = require('fs');
const path = require('path');

const BASELINE_DIR = path.join(__dirname, 'hit-baseline');
const CORPUS_DIR = process.env.PUA_CORPUS_DIR || 'E:\\01_Loop\\persona-data\\migrator';
const SEARCH_DIRS = ['inbox', 'web', 'corpus'];   // migrator 台本 手順 1 の優先順

function baselinePath(version) {
  return path.join(BASELINE_DIR, 'plantuml-' + version + '.json');
}

function readBaseline(version) {
  const p = baselinePath(version);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 版の違う基準のうち一番新しいもの (版の文字列の大小で比べる)。
function latestOtherBaseline(version) {
  if (!fs.existsSync(BASELINE_DIR)) return null;
  const parts = (v) => String(v).split(/[.\-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
  const less = (a, b) => {
    const pa = parts(a), pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y;
    }
    return false;
  };
  let best = null;
  fs.readdirSync(BASELINE_DIR).forEach((f) => {
    const m = f.match(/^plantuml-(.+)\.json$/);
    if (!m || m[1] === version) return;
    if (!best || less(best, m[1])) best = m[1];
  });
  return best ? { version: best, data: readBaseline(best) } : null;
}

// progress.md の結果行 (| が 4 本以上、先頭のセルが .puml) を、ファイルごとに最後の行で読む。
// 返すのは「描画 ok」かつ「枠 ok」のファイル名 (記録の順)。
function okNamesFromProgress(text) {
  const latest = new Map();
  String(text || '').split(/\r?\n/).forEach((l) => {
    if ((l.match(/\|/g) || []).length < 4) return;
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!/\.puml$/i.test(cells[0])) return;
    latest.delete(cells[0]);
    latest.set(cells[0], cells);
  });
  const out = [];
  latest.forEach((cells, name) => {
    if (/^描画\s*ok/.test(cells[1] || '') && /^枠\s*ok/.test(cells[2] || '')) out.push(name);
  });
  return out;
}

function listPuml(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listPuml(p));
    else if (/\.puml$/i.test(e.name)) out.push(p);
  });
  return out;
}

// progress.md のファイル名 (basename) を、コーパスからの相対パス (/ 区切り) に引く。
function resolveNames(names, corpusDir) {
  const index = new Map();
  SEARCH_DIRS.forEach((d) => {
    listPuml(path.join(corpusDir, d)).sort().forEach((p) => {
      const b = path.basename(p);
      if (!index.has(b)) index.set(b, path.relative(corpusDir, p).split(path.sep).join('/'));
    });
  });
  const found = [], missing = [];
  names.forEach((n) => { if (index.has(n)) found.push(index.get(n)); else missing.push(n); });
  return { found: found.sort(), missing };
}

function corpusAvailable(corpusDir) {
  return fs.existsSync(path.join(corpusDir || CORPUS_DIR, 'progress.md'));
}

// 基準と今回の測定を比べる。基準で枠が出ていた点 (値が '-' 以外) が
//   - 枠なし ('-') になった              → lost (赤)
//   - 別の要素・行の枠になった          → changed (赤)
//   - 点そのものが無い (SVG が変わった) → missing (1 枚 2 点以上で赤。%date 等の揺れを 1 点まで許す)
// 基準で枠が出なかった点に枠が出たのは gained (報告だけ)。基準にあって描けなくなった図は unrendered (赤)。
function compare(baseFiles, current) {
  const r = { lost: [], changed: [], missing: [], gained: [], unrendered: [], perFile: {} };
  Object.keys(baseFiles || {}).sort().forEach((file) => {
    const base = baseFiles[file] || {};
    const cur = current[file];
    const baseOk = Object.keys(base).filter((k) => base[k] !== '-').length;
    if (!cur || cur.error) {
      r.unrendered.push({ file, error: (cur && cur.error) || '測れなかった' });
      r.perFile[file] = { base: baseOk, now: 0 };
      return;
    }
    const pts = cur.points || {};
    let now = 0;
    const miss = [];
    Object.keys(base).forEach((k) => {
      const was = base[k];
      if (!(k in pts)) { if (was !== '-') miss.push({ file, key: k, was }); return; }
      const v = pts[k];
      if (v !== '-') now++;
      if (was === '-') { if (v !== '-') r.gained.push({ file, key: k, now: v }); return; }
      if (v === '-') r.lost.push({ file, key: k, was });
      else if (v !== was) r.changed.push({ file, key: k, was, now: v });
    });
    r.missing = r.missing.concat(miss);
    r.perFile[file] = { base: baseOk, now, missing: miss.length };
  });
  r.failed = r.lost.length + r.changed.length + r.unrendered.length
    + Object.keys(r.perFile).filter((f) => (r.perFile[f].missing || 0) >= 2)
      .reduce((n, f) => n + r.perFile[f].missing, 0);
  return r;
}

function formatReport(r, limit) {
  const lines = [];
  const lim = limit || 40;
  r.unrendered.slice(0, lim).forEach((x) => lines.push('描けない ' + x.file + ' (' + x.error + ')'));
  r.lost.slice(0, lim).forEach((x) => lines.push('枠なし ' + x.file + ' ' + x.key + ' (基準 ' + x.was + ')'));
  r.changed.slice(0, lim).forEach((x) => lines.push('別の枠 ' + x.file + ' ' + x.key + ' (基準 ' + x.was + ' → ' + x.now + ')'));
  Object.keys(r.perFile).forEach((f) => {
    if ((r.perFile[f].missing || 0) >= 2) lines.push('点が消えた ' + f + ' ' + r.perFile[f].missing + ' 点 (SVG が変わった)');
  });
  return lines;
}

// 基準ファイルは 1 点 1 行にする (書き直したときの差分が点ごとに読める)。
function writeBaseline(version, files, excluded, note) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const data = {
    plantuml: version,
    note: note || '',
    viewport: [1600, 1000],
    excluded: excluded || {},
    files: files,
  };
  fs.writeFileSync(baselinePath(version), JSON.stringify(data, null, 1) + '\n', 'utf8');
  return baselinePath(version);
}

// ── 画面の中で走らせる測り方 (page.evaluate に渡す) ────────────────────
// 返り値: { 点の名前: '種類:行' | '-' }。窓の外の点はプレビューをスクロールして指し、それでも外なら入れない。
function probeInPage() {
  const svg = document.querySelector('#preview-svg svg');
  if (!svg) return null;
  const pc = document.getElementById('preview-container');
  const inv = svg.getScreenCTM().inverse();
  const out = {};
  const els = svg.querySelectorAll('text, rect, ellipse, circle, polygon, path, line');
  for (const el of Array.from(els)) {
    if (el.closest('defs')) continue;
    let sx, sy;
    const tag = el.tagName.toLowerCase();
    if (tag === 'path' || tag === 'line') {
      let len = 0;
      try { len = el.getTotalLength(); } catch (e) { len = 0; }
      if (!(len > 4)) continue;
      const p = el.getPointAtLength(len / 2);
      const q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
      sx = q.x; sy = q.y;
    } else {
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    }
    const u = new DOMPoint(sx, sy).matrixTransform(inv);
    // 文字は数字を 0 に寄せる (%date の日時など、描くたびに変わる数字で点の名前が揺れないように)。
    const txt = tag === 'text' ? (el.textContent || '').trim().slice(0, 24).replace(/\d/g, '0') : '';
    const key = tag + '@' + Math.round(u.x) + ',' + Math.round(u.y) + (txt ? ' ' + txt : '');
    if (key in out) continue;
    let cr = pc.getBoundingClientRect();
    const outside = () => sx < cr.left || sy < cr.top || sx >= cr.right - 1 || sy >= cr.bottom - 1;
    if (outside()) {
      pc.scrollLeft += sx - (cr.left + cr.width / 2);
      pc.scrollTop += sy - (cr.top + cr.height / 2);
      const q = new DOMPoint(u.x, u.y).matrixTransform(svg.getScreenCTM());
      sx = q.x; sy = q.y; cr = pc.getBoundingClientRect();
      if (outside()) continue;
    }
    const hit = document.elementFromPoint(sx, sy);
    const rect = hit && hit.closest ? hit.closest('#overlay-layer [data-type]') : null;
    out[key] = rect ? rect.getAttribute('data-type') + ':' + rect.getAttribute('data-line') : '-';
  }
  return out;
}

module.exports = {
  CORPUS_DIR, BASELINE_DIR, baselinePath, readBaseline, latestOtherBaseline,
  okNamesFromProgress, resolveNames, corpusAvailable, compare, formatReport, writeBaseline, probeInPage,
};
