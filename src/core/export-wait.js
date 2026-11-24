'use strict';
// TICKET-roadmap-20261123-0857-2 (roadmap v8.0 必須 3): 書き出し (SVG / PNG / 透過 PNG。v9.0 からクリップボードにコピーも) は、
// 押した図の押した時点の本文の図を書く。
// プレビューの絵がまだ今の本文の図でない (描き直しが届く前・図を開いた直後・別のタブの絵が残っている) ときは、
// 待っている旨を出して、その図の描き直しが届いてから 1 回だけ書く。直前の絵・別の図の絵・空を書かない。
// 決めるのはここ (純粋な判定)。画面の配線は src/app.js (exportSVG / exportPNG / renderSvg)。
window.MA = window.MA || {};
window.MA.exportWait = (function() {
  // 押した時点で書けるか。
  //   s = { hasSvg, pic: { key, text } | null (プレビューの絵がどのタブのどの本文の図か), key (今のタブ), text (今の本文),
  //         verdict: { text, state } | null (エンジンの最後の答え) }
  //   'now'   : 絵が今のタブの今の本文の図。すぐ書く
  //   'error' : 今の本文はエンジンが描けないと答えた。書かずに知らせる
  //   'wait'  : 絵がまだ今の本文の図でない。描き直しを待って書く
  function decide(s) {
    if (s.verdict && s.verdict.text === s.text && s.verdict.state === 'error') return 'error';
    var pic = s.pic;
    if (s.hasSvg && pic && pic.key === s.key && pic.text === s.text) return 'now';
    return 'wait';
  }

  // 描き直しが届いた (または描けなかった) ときに、待っている書き出しをどうするか。
  //   p = { key, text } (押した図のタブと押した時点の本文)
  //   r = { ok, key (描いた絵のタブ), text (描いた本文), activeKey (今のタブ), activeText (今の本文) }
  //   'run'    : 押した図の最新の本文の絵が届いた。書く
  //   'cancel' : タブを替えた。押した図の名前で別の図を書かない (書かずに理由を言う)
  //   'error'  : 押した図の今の本文が描けない。書かずに知らせる
  //   'keep'   : まだ届いていない (待っている間に本文を直した・古い回の答え)。次の描き直しを待つ
  function onRendered(p, r) {
    if (!p) return 'keep';
    if (r.activeKey !== p.key) return 'cancel';
    if (r.key !== p.key || r.text !== r.activeText) return 'keep';
    return r.ok ? 'run' : 'error';
  }

  var WAIT_MSG = '描き直しが届いたら書き出します…';
  var CANCEL_MSG = '書き出しませんでした: 待っている間に別の図に替えました (もう一度押すと今の図を書き出します)';
  var ERROR_MSG = '書き出しませんでした: 今の本文は描けません (図の上の帯を見て直してください)';

  // TICKET-roadmap-20261123-2358-1 (roadmap v9.0 必須 2): 「クリップボードにコピー」も同じ判定 (decide / onRendered) を通る。
  // 待つ・やめる・描けないの語だけを「写す」に替える。
  var CLIP = {
    wait: '描き直しが届いたらクリップボードに写します…',
    cancel: '写しませんでした: 待っている間に別の図に替えました (もう一度押すと今の図を写します)',
    error: '写しませんでした: 今の本文は描けません (図の上の帯を見て直してください)。クリップボードは前のまま',
  };
  // messages(kind) — 書き出しの種類ごとの語。'clipboard' は写す語、それ以外は書き出す語。
  function messages(kind) {
    if (kind === 'clipboard') return { wait: CLIP.wait, cancel: CLIP.cancel, error: CLIP.error };
    return { wait: WAIT_MSG, cancel: CANCEL_MSG, error: ERROR_MSG };
  }
  // 写せた後の 1 行。px は「1420×1540 px (2 倍)」、bytes は PNG のバイト数。
  function copiedMsg(px, bytes) {
    return 'クリップボードに写しました: ' + (px ? px + ' · ' : '') + Number(bytes || 0) + ' バイト';
  }
  // 写せなかったときの 1 行 (押した手の許しが切れた・ブラウザが断った)。err は例外。
  function copyFailedMsg(err) {
    var name = err && err.name ? String(err.name) : '';
    var why = name === 'NotAllowedError'
      ? 'ブラウザがクリップボードへの書き込みを許しませんでした (描き直しを待つ間に許しが切れたときは、もう一度押してください)'
      : 'クリップボードに書けませんでした' + (err ? ' (' + String(err && err.message || err) + ')' : '');
    return '写しませんでした: ' + why + '。クリップボードは前のまま';
  }

  return { decide: decide, onRendered: onRendered, WAIT_MSG: WAIT_MSG, CANCEL_MSG: CANCEL_MSG, ERROR_MSG: ERROR_MSG,
    messages: messages, copiedMsg: copiedMsg, copyFailedMsg: copyFailedMsg };
})();
