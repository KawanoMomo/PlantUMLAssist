'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {

  var OB = window.MA.overlayBuilder;

  // PlantUML SVG の data-source-line と parser の lineNum (DSL 絶対行) の関係:
  //   parserLine = svgLine + offset
  // PlantUML のバージョン / preamble 種別で offset の挙動が異なる:
  //   - preamble なし (@startuml が line 1):    offset = 1 (= startUmlLine)
  //   - preamble が空白行のみ:                  offset = startUmlLine (推定/未検証)
  //   - preamble にコメント行 (' ...) を含む:   offset = 0 (PlantUML が絶対行を出す)
  //   - @startuml なし (snippet):               offset = 0
  // 単純な startUmlLine 利用では comment preamble case で破綻するため、
  // 候補オフセット {startUmlLine, 0, 1} を試して「最大マッチ数」を採るアダプティブ方式を取る。
  // (既存 fixture と回帰した過去版の両方を一発で吸収する。本物の SVG 1 つ取れば十分。)

  function _clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function _bbox(el) {
    if (!el || typeof el.getBBox !== 'function') return null;
    try {
      var b = el.getBBox();
      return (b && (b.width || b.height)) ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
    } catch (e) { return null; }
  }

  // 注釈本文の 1 行目を持つ <text> (未使用のもの) を探し、それを囲む塗りのある最小の図形を返す。
  // 群の枠 (alt 等) は fill="none" なので候補にならない。見つからなければ null。
  function _findNoteShape(svgEl, note, usedTexts) {
    var first = String(note.text || '').split('\n')[0].replace(/<[^>]*>|\*\*|\/\/|__|""/g, '').trim();
    if (!first || !svgEl.querySelectorAll) return null;
    var texts = svgEl.querySelectorAll('text');
    var shapes = null;
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (usedTexts.indexOf(t) >= 0) continue;
      if ((t.textContent || '').trim() !== first) continue;
      var tb = _bbox(t);
      if (!tb) continue;
      if (!shapes) shapes = svgEl.querySelectorAll('path, polygon, rect');
      var best = null, bestArea = Infinity;
      for (var k = 0; k < shapes.length; k++) {
        var fill = (shapes[k].getAttribute('fill') || '').toLowerCase();
        if (!fill || fill === 'none' || fill === 'transparent') continue;
        var sb = _bbox(shapes[k]);
        if (!sb) continue;
        if (sb.x > tb.x + 2 || sb.y > tb.y + 2 || sb.x + sb.width < tb.x + tb.width - 2 || sb.y + sb.height < tb.y + tb.height - 2) continue;
        var area = sb.width * sb.height;
        if (area < bestArea) { best = sb; bestArea = area; }
      }
      if (best) { usedTexts.push(t); return best; }
    }
    return null;
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl, dslText) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;

    OB.syncDimensions(svgEl, overlayEl);

    // offset 候補: startUmlLine が真値の場合は最優先 (no/blank preamble に対応)、
    // 0 は comment preamble / snippet 用、1 は startUmlLine 不明時 default。
    // 重複は順序維持で去る。
    var startUml = (parsedData.meta && parsedData.meta.startUmlLine) || 0;
    var candidates = [];
    function _push(v) { if (candidates.indexOf(v) === -1) candidates.push(v); }
    if (startUml > 0) _push(startUml);
    _push(0);
    _push(1);

    var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
    var partBest = OB.pickBestOffset(svgEl, participants, 'g.participant-head', candidates);
    var partMatches = partBest.matches;
    partMatches.forEach(function(m) {
      var bb = OB.extractBBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });
    // Bug C6 fix: PlantUML は participant を上下 (head/tail) 両方に描く。
    // tail もクリックで選択できるよう overlay rect を追加配置。
    // (data-id は head と同一なので selection は head/tail 共通で動作。)
    var partTailBest = OB.pickBestOffset(svgEl, participants, 'g.participant-tail', candidates);
    partTailBest.matches.forEach(function(m) {
      var bb = OB.extractBBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 8, bb.y - 4, (bb.width || 60) + 16, (bb.height || 14) + 8, {
        'data-type': 'participant',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    // userissue v1.2.3: lifeline は participant とは別の selectable type に分離。
    // lifeline 選択 → activate/deactivate 行を一括削除する独自オペレーションを
    // 持たせるため、 head/tail と highlight を分けるべく data-type='lifeline' で
    // emit する。 ID は対応 participant と同じなので scoped operation の引数に
    // そのまま使える。
    var lifelines = svgEl.querySelectorAll('g.participant-lifeline');
    Array.prototype.forEach.call(lifelines, function(lg) {
      var line = lg.querySelector('line');
      if (!line) return;
      var x1 = parseFloat(line.getAttribute('x1'));
      var x2 = parseFloat(line.getAttribute('x2'));
      var y1 = parseFloat(line.getAttribute('y1'));
      var y2 = parseFloat(line.getAttribute('y2'));
      if (isNaN(x1) || isNaN(x2) || isNaN(y1) || isNaN(y2)) return;
      var cx = (x1 + x2) / 2;
      var matched = null;
      var headRects = overlayEl.querySelectorAll('rect[data-type="participant"]');
      Array.prototype.forEach.call(headRects, function(r) {
        if (matched) return;
        var rx = parseFloat(r.getAttribute('x'));
        var rw = parseFloat(r.getAttribute('width'));
        if (cx >= rx && cx <= rx + rw) matched = r;
      });
      if (!matched) return;
      var id = matched.getAttribute('data-id');
      var lineNum = matched.getAttribute('data-line');
      OB.addRect(overlayEl,
        Math.min(x1, x2) - 6, Math.min(y1, y2),
        12, Math.abs(y2 - y1),
        { 'data-type': 'lifeline', 'data-id': id, 'data-line': lineNum });
    });

    // Feature #8: group block (alt/opt/loop/par/break/critical/group) の overlay rect。
    // PlantUML v1.2026.x の SVG は group 用の class を付けないが、block bbox を
    // <rect fill="none" stroke="#000000"> として描画する (同一 bbox が 2 回出る)。
    // 同一座標を de-dup して document 順に並べ、parsedData.groups と 1:1 対応させる。
    var groups = (parsedData.groups || []).slice().sort(function(a, b) {
      return (a.line || 0) - (b.line || 0);
    });
    if (groups.length > 0) {
      var allRects = svgEl.querySelectorAll('rect[fill="none"]');
      var seen = {};
      var bboxes = [];
      Array.prototype.forEach.call(allRects, function(r) {
        var style = (r.getAttribute('style') || '') + '';
        // group 境界 rect は黒 stroke。lifeline の hit-area rect (fill-opacity:0) は除外。
        if (style.indexOf('stroke:#000000') === -1) return;
        var x = parseFloat(r.getAttribute('x'));
        var y = parseFloat(r.getAttribute('y'));
        var w = parseFloat(r.getAttribute('width'));
        var h = parseFloat(r.getAttribute('height'));
        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;
        var key = x + ',' + y + ',' + w + ',' + h;
        if (seen[key]) return;
        seen[key] = true;
        bboxes.push({ x: x, y: y, w: w, h: h });
      });
      // document 順 (= 上から下 = DSL 順) にすでに並んでいるので y で再 sort して安定化。
      bboxes.sort(function(a, b) { return a.y - b.y; });
      var n = Math.min(bboxes.length, groups.length);
      for (var gi = 0; gi < n; gi++) {
        var bb = bboxes[gi];
        var gp = groups[gi];
        OB.addRect(overlayEl, bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4, {
          'data-type': 'group',
          'data-id': gp.id,
          'data-line': gp.line,
        });
      }
      OB.warnIfMismatch('group', groups.length, n);
    }

    var msgBest = OB.pickBestOffset(svgEl, parsedData.relations, 'g.message', candidates);
    var msgMatches = msgBest.matches;
    msgMatches.forEach(function(m) {
      // BLK-human-20260912-0900: 矢印・ラベル・番号 (autonumber)・ステレオタイプの
      // どこを押しても同じメッセージが選ばれるよう、g.message の子要素全部を覆う。
      // 最初の <text> だけを見る extractBBox では、autonumber なら番号の上、
      // ステレオタイプ付きならステレオタイプの上しか反応しなかった。
      var bb = OB.extractUnionBBox(m.groupEl) || OB.extractBBox(m.groupEl);
      if (!bb) return;
      OB.addRect(overlayEl, bb.x - 4, bb.y - 4, (bb.width || 60) + 8, (bb.height || 14) + 8, {
        'data-type': 'message',
        'data-id': m.item.id,
        'data-line': m.item.line,
      });
    });

    // Warn on silent divergence — early signal when SVG structure changes
    // (PlantUML 新版 / カスタム skin) and our selector/offset assumptions break.
    OB.warnIfMismatch('participant', participants.length, partMatches.length);
    OB.warnIfMismatch('message', parsedData.relations.length, msgMatches.length);

    // Notes: PlantUML 1.2026.x では <g class="note"> を出さず、bare <path>+<text> で描画される。
    // data-source-line も付かないため、selector マッチは成立せず placeholder rect を挿入する。
    // (overlay は data-line が正しければ click hit/jump が機能する。座標精度は後続 task で改善。)
    var notes = parsedData.elements.filter(function(e) { return e.kind === 'note'; });
    var notePicked = OB.pickBestOffset(svgEl, notes, 'g.note', candidates);
    if (notePicked.matches.length > 0) {
      notePicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 8, bb.y - 6, (bb.width || 60) + 16, (bb.height || 14) + 12, {
          'data-type': 'note',
          'data-id': m.item.id,
          'data-line': m.item.line,
        });
      });
    } else {
      // Bug B4 fix: 1×1 placeholder (pointer-events:none) ではクリック不可。
      // note の target participant の既存 overlay rect の位置を参照し、その近傍に
      // クリック可能な approximate box を置く (正確座標抽出は別 sprint)。
      var usedTexts = [];
      notes.forEach(function(n) {
        // BLK-human-20260916-0900: 描かれた注釈の形 (note=path / hnote=polygon / rnote=rect) を
        // 本文の 1 行目から探し、その矩形全体を当たり判定にする (どこを押しても選べる)。
        var shapeBox = _findNoteShape(svgEl, n, usedTexts);
        if (shapeBox) {
          OB.addRect(overlayEl, shapeBox.x - 2, shapeBox.y - 2, shapeBox.width + 4, shapeBox.height + 4, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': n.line,
          });
          return;
        }
        var targets = n.targets || [];
        var targetPart = targets[0];
        var partRect = targetPart
          ? overlayEl.querySelector('rect[data-type="participant"][data-id="' + targetPart + '"]')
          : null;
        if (partRect) {
          var px = parseFloat(partRect.getAttribute('x')) || 0;
          var pw = parseFloat(partRect.getAttribute('width')) || 60;
          var py = parseFloat(partRect.getAttribute('y')) || 0;
          var ph = parseFloat(partRect.getAttribute('height')) || 20;
          // Position under the head participant rect (approximate).
          OB.addRect(overlayEl, px, py + ph + 4, pw, 20, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': n.line,
          });
        } else {
          // 最終 fallback: 参照 participant が無い (or overlay 生成失敗) 場合のみ
          // 1×1 placeholder (pointer-events:none)。
          OB.addRect(overlayEl, 0, 0, 1, 1, {
            'data-type': 'note',
            'data-id': n.id,
            'data-line': n.line,
          });
        }
      });
    }
    OB.warnIfMismatch('note', notes.length, overlayEl.querySelectorAll('rect[data-type="note"]').length);

    // Activations: PlantUML SVG では activation バーは <g><title>...</title><rect/></g> として
    // class も data-source-line も付かない。selector が当たらないため placeholder rect 戦略で対応。
    var activations = parsedData.elements.filter(function(e) { return e.kind === 'activation'; });
    var actPicked = OB.pickBestOffset(svgEl, activations, 'g.activation', candidates);
    if (actPicked.matches.length > 0) {
      actPicked.matches.forEach(function(m) {
        var bb = OB.extractBBox(m.groupEl);
        if (!bb) return;
        OB.addRect(overlayEl, bb.x - 4, bb.y, (bb.width || 12) + 8, (bb.height || 16), {
          'data-type': 'activation',
          'data-id': m.item.action + '-' + m.item.target + '-' + m.item.line,
          'data-line': m.item.line,
        });
      });
    } else {
      activations.forEach(function(a) {
        OB.addRect(overlayEl, 0, 0, 1, 1, {
          'data-type': 'activation',
          'data-id': a.action + '-' + a.target + '-' + a.line,
          'data-line': a.line,
        });
      });
    }
    OB.warnIfMismatch('activation', activations.length, overlayEl.querySelectorAll('rect[data-type="activation"]').length);

    // BLK-human-20260915-1204: 帯の矩形を「押した場所が帯の内か外か」を決める材料として置く。
    // 選択の当たり判定には混ぜない (pointer-events を切る) ので、帯の中を押しても
    // これまでどおり挿入メニューが開く。resolveInsertLine だけがこれを読む。
    bandZones(svgEl, dslText).forEach(function(z) {
      var r = OB.addRect(overlayEl, z.bar.x, z.bar.y, z.bar.w, z.bar.h, {
        'data-type': 'band-zone',
        'data-part': z.band.target,
        'data-line': z.band.activateLine,
        'data-band-end': z.band.deactivateLine,
      });
      r.style.pointerEvents = 'none';
      r.classList.remove('selectable');
    });

    var noteRectCount = overlayEl.querySelectorAll('rect[data-type="note"]').length;
    var actRectCount = overlayEl.querySelectorAll('rect[data-type="activation"]').length;
    var groupRectCount = overlayEl.querySelectorAll('rect[data-type="group"]').length;
    var groupsInModel = (parsedData.groups || []).length;
    return {
      matched: {
        // head 基準。tail rect は重複なので「何人マッチしたか」には加算しない。
        participant: partMatches.length,
        message: msgMatches.length,
        note: noteRectCount,
        activation: actRectCount,
        group: groupRectCount,
      },
      unmatched: {
        participant: participants.length - partMatches.length,
        message: parsedData.relations.length - msgMatches.length,
        note: notes.length - noteRectCount,
        activation: activations.length - actRectCount,
        group: groupsInModel - groupRectCount,
      },
    };
  }

  // BLK-human-20260915-1204: 実行中の帯 (activation バー) の矩形を SVG から拾う。
  // PlantUML は帯を <g><title>{participant}</title><rect fill="#FFFFFF" width="10" …/></g>
  // として描き、class も data-source-line も付けない (同じ矩形を 2 回出す)。
  // lifeline の当たり矩形は fill-opacity:0 なので、塗りと stroke で見分ける。
  function collectActivationBars(svgEl) {
    if (!svgEl || !svgEl.querySelectorAll) return [];
    var seen = {};
    var bars = [];
    var rects = svgEl.querySelectorAll('rect');
    Array.prototype.forEach.call(rects, function(r) {
      var fill = (r.getAttribute('fill') || '').toUpperCase();
      var style = (r.getAttribute('style') || '') + '';
      if (fill === 'NONE' || fill === '#000000') return;          // group 枠 / lifeline の当たり矩形
      if (style.indexOf('stroke:') === -1) return;                // 枠線の無い矩形は帯ではない
      if (parseFloat(r.getAttribute('fill-opacity')) === 0) return;
      var g = r.parentNode;
      var titleEl = g && g.querySelector ? g.querySelector('title') : null;
      if (!titleEl) return;                                       // 帯の <g> は必ず participant 名を持つ
      if (g.getAttribute && g.getAttribute('class')) return;      // head / tail は class 付きの <g> の中
      var x = parseFloat(r.getAttribute('x'));
      var y = parseFloat(r.getAttribute('y'));
      var w = parseFloat(r.getAttribute('width'));
      var h = parseFloat(r.getAttribute('height'));
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;
      var key = titleEl.textContent + '|' + x + ',' + y + ',' + w + ',' + h;
      if (seen[key]) return;                                      // 同じ帯が 2 回描かれる
      seen[key] = true;
      bars.push({ part: titleEl.textContent, x: x, y: y, w: w, h: h });
    });
    bars.sort(function(a, b) { return a.y - b.y; });
    return bars;
  }

  // 拾った帯の矩形を DSL の帯 (parseBands) に突き合わせる。data-source-line が無いので、
  // participant ごとに「上から n 番目の矩形 = n 番目の帯」で対応させる。
  function bandZones(svgEl, dslText) {
    var AI = window.MA.sequenceActivationInsert;
    if (!AI || typeof dslText !== 'string') return [];
    var bands = AI.parseBands(dslText);
    var bars = collectActivationBars(svgEl);
    var byPart = {};
    bands.forEach(function(b) {
      (byPart[b.target] = byPart[b.target] || []).push(b);
    });
    Object.keys(byPart).forEach(function(k) {
      byPart[k].sort(function(a, b) { return a.activateLine - b.activateLine; });
    });
    var used = {};
    var out = [];
    bars.forEach(function(bar) {
      var list = byPart[bar.part];
      if (!list) return;
      var i = used[bar.part] || 0;
      if (i >= list.length) return;
      used[bar.part] = i + 1;
      out.push({ bar: bar, band: list[i] });
    });
    return out;
  }

  // 押した点が帯の矩形の中か、その下のライフライン線かを決める
  // (BLK-human-20260915-1204)。返すのは resolve に渡す hint と同じ形。
  //   { zone: 'inside' | 'outside', bandLine }  … 帯が絡む
  //   null                                      … 帯から離れた所。DSL だけで決めさせる
  var BAND_X_TOLERANCE = 16;   // 帯は幅 10px ほど。ライフライン線を押しても同じ列と見なす

  function resolveBandZone(overlayEl, x, y) {
    if (!overlayEl || isNaN(x) || isNaN(y)) return null;
    var zones = Array.prototype.map.call(
      overlayEl.querySelectorAll('rect[data-type="band-zone"]'), function(r) {
        return {
          line: parseInt(r.getAttribute('data-line'), 10),
          x: parseFloat(r.getAttribute('x')),
          y: parseFloat(r.getAttribute('y')),
          w: parseFloat(r.getAttribute('width')),
          h: parseFloat(r.getAttribute('height')),
        };
      }).filter(function(z) { return !isNaN(z.line) && !isNaN(z.y) && !isNaN(z.h); });
    if (zones.length === 0) return null;
    function sameColumn(z) {
      return x >= z.x - BAND_X_TOLERANCE && x <= z.x + z.w + BAND_X_TOLERANCE;
    }
    // 1. 帯の矩形の中 → 内側。入れ子なら後に始まった帯 (内側) を採る。
    var inside = null;
    zones.forEach(function(z) {
      if (!sameColumn(z) || y < z.y || y > z.y + z.h) return;
      if (!inside || z.line > inside.line) inside = z;
    });
    if (inside) return { zone: 'inside', bandLine: inside.line };
    // 2. 同じ列で自分より上に終わっている帯があれば、その帯を抜けた先 → 外側。
    var above = null;
    zones.forEach(function(z) {
      if (!sameColumn(z) || y <= z.y + z.h) return;
      if (!above || z.y + z.h > above.y + above.h) above = z;
    });
    if (above) return { zone: 'outside', bandLine: above.line };
    return null;
  }

  function resolveInsertLine(overlayEl, x, y) {
    // x は activity モジュールとの signature 合わせだけでなく、帯の内外の判定
    // (resolveBandZone) にも使う。行の決定そのものは 1 列のライフラインなので y だけで足りる。
    if (!overlayEl) return null;
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    if (msgRects.length === 0) return null;
    var items = Array.prototype.map.call(msgRects, function(r) {
      return {
        line: parseInt(r.getAttribute('data-line'), 10),
        y: parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2,
        // 隣のメッセージの矢印が占める横幅。ガイド線をこの列に収めるために返す
        // (図の端から端まで伸びる線は、どのメッセージの隙間を指しているのか読めない)。
        rectX: parseFloat(r.getAttribute('x')),
        rectWidth: parseFloat(r.getAttribute('width')),
      };
    }).filter(function(it) {
      // data-line が付いていない rect (描き直しの途中など) は挿入先にできない。
      return !isNaN(it.line);
    }).sort(function(a, b) { return a.y - b.y; });
    if (items.length === 0) return null;
    var zoneHint = resolveBandZone(overlayEl, x, y);
    // y がどの rect の y より下か判定: 下端から遡って最初に「rect.y < y」なら after その rect
    for (var i = items.length - 1; i >= 0; i--) {
      if (y > items[i].y) return _hit(items[i], 'after', zoneHint);
    }
    // 全 rect より上 → 最上位 rect の before
    return _hit(items[0], 'before', zoneHint);
  }

  function _hit(item, position, zoneHint) {
    var res = { line: item.line, position: position };
    if (zoneHint) { res.zone = zoneHint.zone; res.bandLine = zoneHint.bandLine; }
    if (!isNaN(item.rectX) && !isNaN(item.rectWidth)) {
      res.rectX = item.rectX;
      res.rectWidth = item.rectWidth;
    }
    return res;
  }

  return {
    buildSequenceOverlay: buildSequenceOverlay,
    collectActivationBars: collectActivationBars,
    bandZones: bandZones,
    resolveBandZone: resolveBandZone,
    resolveInsertLine: resolveInsertLine,
  };
})();
