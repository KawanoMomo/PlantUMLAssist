'use strict';
window.MA = window.MA || {};

// doc-proof — 書き出した資料を「客先に見せる形」で見返す。
//
// BLK-primary-20260916-0426-wish: 資料セットから 24 枚の SVG を zip に書き出した後、
// 「客先に見せてよい状態か」を確かめる場が無い。あるのは編集用のプレビュー
// (1 枚ずつ・DSL 入力欄と並び) と、貼る前の体裁プレビュー (doc-layout。文字だけの
// 1 枚物で図そのものは出ない) だけで、資料として組み上がった後の見た目
// (表紙・目次・図番号・注記 + 図の本体) を通しで見る所が無い。差し戻しがあれば
// zip を解凍して 1 枚ずつ開き直すことになる。
//
// ここが受け持つのは「zip に入った物そのもの」の組み立てで、体裁 (doc-layout) の
// 入力欄ではなく、書き出しの結果として実際に zip へ入った紙を並べ直す。
// だから突き合わせの鍵は図名ではなく zip の中のファイル名にする
// (体裁では在ることになっているのに zip には入らなかった図を、ここで見つける)。
//
// 描画は app.js、体裁は doc-layout、zip の組み立ては bulk-export の職掌。
window.MA.docProof = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _line(v) { return _s(v).replace(/[\r\n]+/g, ' ').trim(); }

  function _isSvg(t) { return _s(t).indexOf('<svg') >= 0; }

  // build(sheet, files, meta) — 資料 1 部ぶんの中身。
  // sheet は doc-layout.sheet() の結果 (図番号・見出し・注記の正本)。
  // files は zip に入れた [{name, content}] そのもの。
  // meta は {zipFile, at, dir}。
  function build(sheet, files, meta) {
    var sh = sheet || { entries: [] };
    var DL = window.MA.docLayout;
    var by = {};
    (files || []).forEach(function(f) {
      var n = _line(f && f.name);
      if (n) by[n] = _s(f && f.content);
    });
    var used = {};
    var pages = (sh.entries || []).map(function(e) {
      var file = (DL ? DL.fileNameOf(e) : _line(e.name)) + '.svg';
      var svg = by[file];
      // 図番号を付けずに出した回 (体裁を組む前) の zip も読めるようにする。
      if (svg === undefined && by[_line(e.name) + '.svg'] !== undefined) {
        file = _line(e.name) + '.svg';
        svg = by[file];
      }
      used[file] = true;
      return { no: e.no, name: _line(e.name), file: file,
               heading: _line(e.heading), note: _line(e.note),
               titled: !!e.titled,
               svg: _isSvg(svg) ? _s(svg) : '',
               inZip: svg !== undefined && _isSvg(svg) };
    });
    // 図以外の紙 (目次の 1 枚物・指摘対応表) も資料の一部なので名前を出す。
    var papers = [];
    (files || []).forEach(function(f) {
      var n = _line(f && f.name);
      if (n && !used[n] && n.slice(-4).toLowerCase() !== '.svg') papers.push(n);
    });
    return { title: _line(sh.title) || '資料セット',
             zipFile: _line(meta && meta.zipFile),
             at: _line(meta && meta.at),
             pages: pages, papers: papers,
             total: pages.length };
  }

  // 表紙に載せる行。資料そのものの顔なので、枚数と出どころを言い切る
  // (「何枚の資料か」を客先で数え直させない)。
  function coverLines(proof) {
    var p = proof || {};
    var out = [p.title || '資料セット', '全 ' + (p.total || 0) + ' 図'];
    if (p.zipFile) out.push(p.zipFile);
    if (p.at) out.push(p.at);
    return out;
  }

  function tocLine(page) {
    var s = '図' + page.no + ' ' + (page.heading || page.name);
    if (page.note) s += ' — ' + page.note;
    return s;
  }

  // checks(proof) — 「客先に見せてよい状態か」を 1 件ずつ名指しする。
  // 出せない (bad) と、出せるが恥ずかしい (warn) を分ける。混ぜると
  // 「注記が空」で手が止まり、「図が入っていない」を見落とす。
  function checks(proof) {
    var p = proof || { pages: [] };
    var out = [];
    var gone = (p.pages || []).filter(function(g) { return !g.inZip; });
    if (gone.length) {
      out.push({ key: 'missing', level: 'bad',
                 text: '図が入っていないページ ' + gone.length + ' 枚（'
                   + gone.map(function(g) { return '図' + g.no + ' ' + g.name; }).join('、') + '）' });
    }
    var untitled = (p.pages || []).filter(function(g) { return g.inZip && !g.titled; });
    if (untitled.length) {
      out.push({ key: 'untitled', level: 'warn',
                 text: '見出しが図の名前のままのページ ' + untitled.length + ' 枚（'
                   + untitled.map(function(g) { return '図' + g.no; }).join('、') + '）' });
    }
    var blank = (p.pages || []).filter(function(g) { return g.inZip && !g.note; });
    if (blank.length) {
      out.push({ key: 'blank', level: 'warn',
                 text: '注記が空のページ ' + blank.length + ' 枚（'
                   + blank.map(function(g) { return '図' + g.no; }).join('、') + '）' });
    }
    return out;
  }

  // 1 文の判定。客先に出す前に読む文なので、出せないときは理由の件数まで言う。
  function verdict(proof) {
    var p = proof || { pages: [] };
    if (!p.total) return { ok: false, cls: 'dp-empty', text: '資料が空です（図が 1 枚もありません）' };
    var list = checks(p);
    var bad = list.filter(function(c) { return c.level === 'bad'; });
    if (bad.length) {
      return { ok: false, cls: 'dp-bad',
               text: '全 ' + p.total + ' 図 — このままでは客先に出せません：'
                 + bad.map(function(c) { return c.text; }).join(' / ') };
    }
    if (list.length) {
      return { ok: true, cls: 'dp-warn',
               text: '全 ' + p.total + ' 図が揃っています — 直すなら：'
                 + list.map(function(c) { return c.text; }).join(' / ') };
    }
    return { ok: true, cls: 'dp-ok',
             text: '全 ' + p.total + ' 図が揃い、見出しと注記も埋まっています（このまま客先に出せます）' };
  }

  // 差し戻しで名指しされた図を、ページ番号からでも図名からでも引けるようにする
  // (差し戻しは「図5 が違う」とも「spi_state が違う」とも来る)。
  function findPage(proof, key) {
    var pages = (proof && proof.pages) || [];
    var want = _line(key);
    var no = want.replace(/^図/, '');
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].name === want || String(pages[i].no) === no) return pages[i];
    }
    return null;
  }

  return {
    build: build,
    coverLines: coverLines,
    tocLine: tocLine,
    checks: checks,
    verdict: verdict,
    findPage: findPage,
  };
})();
