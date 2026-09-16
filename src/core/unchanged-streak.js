'use strict';

// unchanged-streak — 対象フォルダの DSL が「いつから変わっていないか」を控えに持つ。
//
// BLK-reviewer-20260917-0523: 監査は毎 tick フルで回してから「今回も変化なし」と
// 結論するしかなく、何 tick 連続で無変化かは reviewer が persona.md に手で書いた
// 文章を遡って数え直すしかなかった。控えに指紋と最終変更時刻を残せば、監査の入口で
// 「変化なし・N tick 連続」と言えて、無変化の間はフル監査を回さずに降りられる。
//
// 控え (.assist-audit-last.json) の対象ごとの entry に mark として載る。
// DOM に触らないので node からも browser からも require できる。
(function() {
  function _scope() {
    if (typeof window !== 'undefined' && window.MA && window.MA.auditScope) return window.MA.auditScope;
    if (typeof require === 'function') { try { return require('./audit-scope.js'); } catch (e) {} }
    return null;
  }

  // フォルダ 1 つ分の指紋。名前と中身の両方を見るので、改名だけ・1 文字だけの
  // 書き換えでも変わる。並び順では変わらない (collectDocs の順に依存させない)。
  function folderFingerprint(entries) {
    var list = (entries || []).map(function(e) {
      return String(e.name || '') + '\t' + (e.hash === null || e.hash === undefined ? '' : e.hash);
    }).sort();
    var joined = list.length + '\n' + list.join('\n');
    var sc = _scope();
    return sc ? sc.fingerprint(joined) : String(joined.length);
  }

  // 前回の mark と今回の指紋から、今回の mark を作る。
  // streak は「無変化のまま数えた回数」。変わった回は 0 に戻る。
  // tickId を渡すと、同じ tick で 2 回以上回しても数字は 1 つしか進まない
  // (reviewer は 1 tick に --names / --cohort / --board と何度も打つ)。
  // 渡さなければ「無変化のまま回した回数」を数える。
  function advance(prev, fingerprint, now, tickId) {
    var at = now || new Date().toISOString();
    var fp = String(fingerprint || '');
    var tick = tickId ? String(tickId) : null;
    // 同じ tick の 2 回目以降は、確認時刻だけを新しくして数えない。
    if (prev && tick && prev.tickId === tick && prev.fingerprint === fp) {
      return {
        fingerprint: fp, changedAt: prev.changedAt || at, checkedAt: at,
        streak: prev.streak || 0, tickId: tick, first: prev.first,
      };
    }
    // 控えが 1 度も無い回は「変わった」ではなく「まだ比べていない」。
    // ここを変化扱いにすると、初回だけ理由の無い「変化あり」が出る。
    if (!prev || !prev.fingerprint) {
      return { fingerprint: fp, changedAt: at, checkedAt: at, streak: 0, first: true, tickId: tick };
    }
    if (prev.fingerprint !== fp) {
      return { fingerprint: fp, changedAt: at, checkedAt: at, streak: 0, tickId: tick };
    }
    return {
      fingerprint: fp,
      changedAt: prev.changedAt || at,
      checkedAt: at,
      streak: (typeof prev.streak === 'number' && prev.streak >= 0 ? prev.streak : 0) + 1,
      tickId: tick,
    };
  }

  // 無変化が続いているか。初回 (控えなし) と変化した回は false。
  function isUnchanged(mark) {
    return !!(mark && mark.streak > 0);
  }

  // 入口に出す 1 行。数えるのをやめるための行なので、tick 数と最終変更時刻を
  // 同じ行に置く (どちらか片方だと結局もう一方を遡って探すことになる)。
  function describe(mark) {
    if (!mark || !mark.fingerprint || mark.first) {
      return '変化の追跡: 今回が最初の控えです (次の回から「何 tick 連続で無変化か」を出します)';
    }
    if (!isUnchanged(mark)) {
      return '変化あり: 前回の控えから中身が変わりました (最終変更 ' + mark.changedAt + '、連続無変化は 0 tick)';
    }
    // tick を名乗って打った run だけが「tick」と言える。名乗らない run は
    // 回した回数しか分からないので、そう言う (数字の意味を偽らない)。
    var unit = mark.tickId ? ' tick 連続' : ' 回連続';
    return '変化なし: ' + mark.streak + unit + ' (最終変更 ' + mark.changedAt
      + '、今回の確認 ' + mark.checkedAt + ')';
  }

  // 指摘文書の冒頭にある「継続 N / 解消 N / 新規 N 件」の勘定。
  // 入口で降りた回は突合を回さないので、前回この行に出た数字をそのまま読む
  // (自動生成の節なので parseFindings は数えず、ここだけが継続件数を持つ)。
  function tallyFromDoc(md) {
    var m = /継続\s*(\d+)\s*\/\s*解消\s*(\d+)\s*\/\s*新規\s*(\d+)/.exec(String(md || ''));
    if (!m) return null;
    return { carried: Number(m[1]), resolved: Number(m[2]), fresh: Number(m[3]) };
  }

  var api = {
    folderFingerprint: folderFingerprint,
    tallyFromDoc: tallyFromDoc,
    advance: advance,
    isUnchanged: isUnchanged,
    describe: describe,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.unchangedStreak = api;
  }
})();
