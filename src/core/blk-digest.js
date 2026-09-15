'use strict';

(function () {

// blk-digest.js — 完了した BLK を「解消確認カード」に畳む。
//
// BLK-reviewer-20260916-0426: 直前の tick で done になった BLK が実際に効いて
// いるかを確かめるのに、100 行前後の実装ログを毎回全文読み、本文のどこかに
// 書かれたコマンドを目で拾って打ち直していた。内容に変化が無いと分かっている
// tick でもこの確認は省けないので、同じ 2 件を毎 tick 読み直すことになる。
//
// ここは BLK 1 件を「何が直ったか / 打つコマンド / 出力に出るはずの語 / 触った
// ファイル」の数行に畳む。判定はしない (効いているかを言うのは実行結果)。
// 本文の書式は builder が書く実装ログの慣習 (status / 実装 / 変更 / unit / E2E /
// merge / できるようになったこと) に合わせて読むだけで、無ければその行が落ちる。

const FRONT_KEYS = ['id', 'persona', 'depth', 'status', 'builder', 'task', 'kind'];

// 「できるようになったこと」に書かれた 「…」 は、そのまま出力に出る語として
// 使える (builder は画面や出力に出る文字を鉤括弧で引く)。
const MARKER_RE = /[「『]([^」』]{2,60})[」』]/g;

// 本文に散らばる `node …` / `npm …` の inline code が、再現に打つコマンド。
const CODE_RE = /`([^`\n]+)`/g;
const RUNNABLE_RE = /^(node|npm|npx)\s+\S/;

const PLACEHOLDER_RE = /<[^<>\n]{1,40}>/g;
const PREV_HINT_RE = /(prev|控え|前回|last|old)/i;

function splitLines(text) {
  return String(text == null ? '' : text).split(/\r\n|\r|\n/);
}

function parseFrontMatter(lines) {
  const front = {};
  if (lines[0] !== '---') return { front: front, bodyFrom: 0 };
  let i = 1;
  for (; i < lines.length; i += 1) {
    if (lines[i] === '---') { i += 1; break; }
    const m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (m && FRONT_KEYS.indexOf(m[1]) >= 0) front[m[1]] = m[2].trim();
  }
  return { front: front, bodyFrom: i };
}

// "done / merge: d9f5dce" → { status: 'done', merge: 'd9f5dce' }
function parseStatus(raw) {
  const text = String(raw || '').trim();
  const word = (/^([A-Za-z]+)/.exec(text) || [])[1] || '';
  const merge = (/merge\s*[:：]\s*([0-9a-f]{7,40})/i.exec(text) || [])[1] || '';
  return { status: word.toLowerCase(), merge: merge };
}

function parseBuilder(raw) {
  const text = String(raw || '').trim();
  const name = (/^(\S+)/.exec(text) || [])[1] || '';
  const run = (/run=(\S+)/.exec(text) || [])[1] || '';
  return { name: name, run: run };
}

function uniq(list) {
  const seen = Object.create(null);
  const out = [];
  list.forEach(function (v) {
    if (!v || seen[v]) return;
    seen[v] = true;
    out.push(v);
  });
  return out;
}

function collectCommands(body) {
  const out = [];
  body.forEach(function (line) {
    let m;
    CODE_RE.lastIndex = 0;
    while ((m = CODE_RE.exec(line))) {
      const cmd = m[1].trim();
      if (RUNNABLE_RE.test(cmd)) out.push(cmd);
    }
  });
  return uniq(out);
}

// 「変更: a.js、b.js(新規)、」… 複数行に折り返される。次の見出し行まで読む。
function collectFiles(body) {
  const out = [];
  let taking = false;
  body.forEach(function (line) {
    const head = /^[-・\s]*変更\s*[:：]\s*(.*)$/.exec(line);
    if (head) { taking = true; line = head[1]; } else if (taking) {
      if (/^[-・\s]*(unit|E2E|e2e|merge|実測|できるようになったこと)\s*[:：]/.test(line) || !line.trim()) {
        taking = false;
        return;
      }
    } else {
      return;
    }
    line.split(/[、,]/).forEach(function (tok) {
      const t = tok.replace(/[（(][^）)]*[）)]/g, '').trim().replace(/[。\s]+$/, '');
      if (/^[\w./-]+\.(js|json|html|md|css)$/.test(t) && t.indexOf('/') >= 0) out.push(t);
    });
  });
  return uniq(out);
}

function collectAchievement(body) {
  const out = [];
  let taking = false;
  body.forEach(function (line) {
    if (/^できるようになったこと\s*[:：]/.test(line)) { taking = true; return; }
    if (!taking) return;
    if (line.trim() === '---') { taking = false; return; }
    out.push(line.trim());
  });
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function collectMarkers(achievement) {
  const out = [];
  achievement.forEach(function (line) {
    let m;
    MARKER_RE.lastIndex = 0;
    while ((m = MARKER_RE.exec(line))) {
      const marker = m[1].trim();
      // 「…」の中が説明文まるごとのときは出力照合に使えないので短いものだけ。
      if (marker && marker.length <= 40) out.push(marker);
    }
  });
  return uniq(out);
}

function oneLine(lines, max) {
  const text = lines.join('').replace(/\s+/g, ' ').trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

// BLK 1 件のテキストを読む。書式が欠けていてもその欄が空になるだけ。
function parse(text, opts) {
  const options = opts || {};
  const lines = splitLines(text);
  const fm = parseFrontMatter(lines);
  const body = lines.slice(fm.bodyFrom);
  const st = parseStatus(fm.front.status);
  const bd = parseBuilder(fm.front.builder);
  const achievement = collectAchievement(body);
  return {
    id: fm.front.id || options.name || '',
    persona: fm.front.persona || '',
    depth: fm.front.depth || '',
    kind: fm.front.kind || '',
    status: st.status,
    merge: st.merge,
    builder: bd.name,
    run: bd.run,
    task: fm.front.task || '',
    achievement: achievement,
    markers: collectMarkers(achievement),
    commands: collectCommands(body),
    files: collectFiles(body),
    bodyLines: lines.length,
  };
}

// 確認カード。読む行数を本文の 1/5 以下に畳むのが目的なので既定は 8 行以内。
function card(blk, opts) {
  const options = opts || {};
  const width = options.width || 96;
  const out = [];
  const head = [blk.id, blk.status || '?'];
  if (blk.merge) head.push('merge ' + blk.merge);
  if (blk.builder) head.push('(' + blk.builder + (blk.run ? ' run=' + blk.run : '') + ')');
  out.push(head.join('  '));
  if (blk.task) out.push('  直った穴: ' + oneLine([blk.task], width));
  if (blk.achievement.length) out.push('  効き目: ' + oneLine(blk.achievement, width));
  blk.commands.forEach(function (cmd) { out.push('  確認コマンド: ' + cmd); });
  if (!blk.commands.length) out.push('  確認コマンド: (本文に記載なし)');
  if (blk.markers.length) out.push('  出力に出るはず: ' + blk.markers.join(' / '));
  if (blk.files.length) out.push('  変更: ' + blk.files.join(', '));
  return out;
}

// 直前の tick で done になった分だけを見たい、という絞り込み。
// mtime で切るのは、id の時刻が「起票」で「done になった時刻」ではないため。
function within(blks, opts) {
  const options = opts || {};
  const now = options.now == null ? Date.now() : options.now;
  return blks.filter(function (b) {
    if (options.persona && b.persona !== options.persona) return false;
    if (options.hours) {
      if (!b.mtime) return false;
      if (now - b.mtime > options.hours * 3600 * 1000) return false;
    }
    return true;
  });
}

// 確認がまだの done だけを、古い順に返す。seen は前回までに確認した id。
function pending(blks, opts) {
  const options = opts || {};
  const seen = {};
  (options.seen || []).forEach(function (id) { seen[id] = true; });
  return within(blks, options)
    .filter(function (b) { return b.status === (options.status || 'done'); })
    .filter(function (b) { return options.all ? true : !seen[b.id]; })
    .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
}

// `<保存フォルダ>` / `<控え>` を実際のパスに埋める。埋められない穴は missing に残す。
function resolveCommand(cmd, vars) {
  const v = vars || {};
  const missing = [];
  const filled = String(cmd).replace(PLACEHOLDER_RE, function (token) {
    const inner = token.slice(1, -1);
    const key = PREV_HINT_RE.test(inner) ? 'prev' : 'folder';
    if (v[key]) return v[key];
    missing.push(token);
    return token;
  });
  return { command: filled, missing: missing, runnable: missing.length === 0 };
}

// unit/E2E を回し直すのは builder の検算であって、reviewer の解消確認ではない。
// (時間もかかる。--with-tests で明示したときだけ回す)
const TEST_CMD_RE = /(test:unit|test:all|run-tests|playwright|npm\s+test)/;

function isTestCommand(cmd) {
  return TEST_CMD_RE.test(String(cmd || ''));
}

// 出力に、効き目として書かれた語が出ているか。判定はここだけが持つ。
// 語は複数のコマンドの出力を合わせて 1 回だけ照合する (コマンドごとに照合すると、
// 片方にしか出ない語が毎回「出ていない」に見え、直っているものを消えたと誤る)。
function checkOutput(blk, output) {
  const text = String(output == null ? '' : output);
  const squeezed = text.replace(/\s+/g, '');
  const hits = blk.markers.map(function (marker) {
    const ok = text.indexOf(marker) >= 0 || squeezed.indexOf(marker.replace(/\s+/g, '')) >= 0;
    return { marker: marker, ok: ok };
  });
  return {
    hits: hits,
    checked: hits.length,
    matched: hits.filter(function (h) { return h.ok; }).length,
    verdict: !hits.length ? 'unknown' : hits.every(function (h) { return h.ok; }) ? 'effective'
      : hits.some(function (h) { return h.ok; }) ? 'partial' : 'gone',
    // CLI の出力に 1 つも出ない語は、画面側の語かもしれない。断定はしない。
    line: !hits.length ? '照合する語が本文に無い (出力を直接見る)'
      : hits.every(function (h) { return h.ok; }) ? '効いている (語 ' + hits.length + '/' + hits.length + ')'
      : hits.some(function (h) { return h.ok; })
        ? '効いている (語 ' + hits.filter(function (h) { return h.ok; }).length + '/' + hits.length +
          '。残りは画面側の語かもしれない)'
        : 'この出力では確認できず (画面側の変更なら GUI で見る)',
  };
}

  var api = {
    parse: parse,
    within: within,
    isTestCommand: isTestCommand,
    card: card,
    pending: pending,
    resolveCommand: resolveCommand,
    checkOutput: checkOutput,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.blkDigest = api;
  }
})();
