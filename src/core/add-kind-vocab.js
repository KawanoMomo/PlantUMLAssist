'use strict';
window.MA = window.MA || {};

// add-kind-vocab — 「何をしたいか」の言葉から、図に足す種別へ届かせる。
//
// BLK-junior-20260916-0526: 親状態に子状態を足す入口は、無選択の右パネルにチップ
// (「子状態」) として出ているし、状態を選べばパネルに「＋ 子状態を追加」も出る。
// それでも起票者は見つけられなかった。理由は置き場所ではなく言葉で、研修で
// PlantUML を見た程度の人は「子状態」「複合状態」という語を知らない。知らない語は
// 目に入っても自分のやりたいこと (状態の中に状態を入れる) と結びつかず、
// コマンド検索に打つ語も当てられない。
//
// ここは種別 1 つにつき「その人が打つであろう言葉」を持つ。正しい用語を覚えて
// もらうのではなく、知っている言葉から正しい用語の入口へ連れて行く。
// 用語そのもの (title) は変えない — 覚えた人には短い名前の方が速い。
window.MA.addKindVocab = (function() {

  // 図種 → 種別 → その種別を探すときに打たれる言葉。
  // ひらがな・カタカナ・英語を混ぜるのは、変換前に打つ人が居るため。
  var VOCAB = {
    'plantuml-state': {
      child: ['入れ子', 'いれこ', 'ネスト', 'nest', '階層', 'かいそう',
              '中に入れる', 'なかに', '状態の中に状態', 'サブ状態', 'サブ', 'sub',
              '子', 'こ', '複合', 'composite', '内側', 'うちがわ'],
      composite: ['入れ子', 'いれこ', 'ネスト', 'nest', '複合', 'ふくごう',
                  '中に状態を持つ', '箱', 'はこ', 'まとめる', 'グループ', 'group'],
      transition: ['矢印', 'やじるし', 'つなぐ', '繋ぐ', 'arrow', '遷移', 'せんい'],
      state: ['状態', 'じょうたい', '箱', 'はこ', 'ノード', 'node'],
      note: ['注釈', 'ちゅうしゃく', 'メモ', 'コメント', 'comment'],
    },
    'plantuml-sequence': {
      participant: ['登場人物', '相手', 'たて線', 'ライフライン', 'lifeline'],
      block: ['分岐', '条件', 'くりかえし', '繰り返し', 'ループ', 'loop', 'alt'],
    },
    'plantuml-class': {
      relation: ['線', 'つなぐ', '継承', 'けいしょう', '矢印', '関連'],
    },
    'plantuml-activity': {
      if: ['分岐', '条件', 'ぶんき', 'じょうけん'],
      while: ['繰り返し', 'くりかえし', 'ループ', 'loop'],
    },
  };

  // words(diagramType, value) — 無い組み合わせは空。呼ぶ側は concat するだけでよい。
  function words(diagramType, value) {
    var byType = VOCAB[String(diagramType == null ? '' : diagramType)];
    if (!byType) return [];
    var list = byType[String(value == null ? '' : value)];
    return list ? list.slice() : [];
  }

  // hintFor(diagramType, value) — 用語を知らない人に向けた 1 行。
  // ボタンの title に出して、押す前に何が起きるかを用語抜きで言う。
  var HINTS = {
    'plantuml-state': {
      child: '選んだ状態の中に、もう 1 つ状態を入れます（入れ子にする）',
      composite: '中に状態を入れられる状態を作ります（入れ子の親になる箱）',
    },
  };

  function hintFor(diagramType, value) {
    var byType = HINTS[String(diagramType == null ? '' : diagramType)];
    if (!byType) return '';
    return byType[String(value == null ? '' : value)] || '';
  }

  var api = { words: words, hintFor: hintFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
