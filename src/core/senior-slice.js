'use strict';

// senior-slice — 先輩の「共通図」から、自分の部品に当たる所だけを抜き出す。
//
// BLK-junior-20260914-2206-wish: 先輩の図の枠 (senior-pane) は、状態遷移や
// シーケンスのように部品ごとに 1 枚ある図種なら名前で相手を引けるが、
// クラス図は先輩が `driver_common_class.puml` 1 枚に Timer/Spi/Can/Gpio/Uart を
// まとめており、部品名で 1:1 に引けないので常に「−」(対象なし) になっていた。
//
// ここは「共通図をクラス名でフィルタし、自分の部品に関わるクラスと関係線だけを
// 浮かせた 1 枚」を組み立てる。抜き出すのであって書き換えるのではないので、
// 先輩のファイルには触らない (読むだけの枠に出す DSL を作るだけ)。
//
// 抜き出す範囲は「当たったクラス + そのクラスが線で繋がる相手 1 段」。
// 当たったクラスだけにすると継承元 (Driver_Common) が消えて粒度が読めず、
// 全部残すと共通図のままになるので、1 段でちょうど「派生クラス図」の形になる。
(function() {
  // 当たったクラスの背景。先輩の図の他の部分と見分けが付けばよいので 1 色。
  var FOCUS_BG = '#FFF3B0';

  // 部品名に付く、部品そのものではない語。'TimerDrv' から 'timer' を取り出す。
  var PART_SUFFIX = ['driver', 'drv', 'ドライバ'];

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  function baseOf(name) {
    var s = _s(name).split('\\').join('/');
    s = s.slice(s.lastIndexOf('/') + 1);
    return s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // partKeysOf(name) — 図の名前から「どの部品の図か」を表す語を出す。
  //
  // 名前の付け方はペルソナによって `TimerDrv派生クラス図` `TIMERドライバ状態遷移`
  // `timer_state.puml` と揺れるので、区切りに頼らず先頭の ASCII 語を拾い、
  // 部品そのものではない語 (Drv/Driver/ドライバ) を落とす。長い方も残すのは、
  // クラス名が `TimerDrv_Xxx` のように接尾辞込みで付いていることがあるため。
  function partKeysOf(name) {
    var base = baseOf(name);
    var runs = base.match(/[A-Za-z][A-Za-z0-9]*/g) || [];
    var keys = [];
    function add(k) {
      k = _s(k).toLowerCase();
      if (k.length < 3) return;                       // 'to' 'of' のような語は部品名にしない
      if (keys.indexOf(k) < 0) keys.push(k);
    }
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      // 接尾辞を落とした形を先に置く。クラス名は `Timer_Driver` のように
      // 部品名だけで始まることが多く、`TimerDrv` では当たらない。
      for (var j = 0; j < PART_SUFFIX.length; j++) {
        var suf = PART_SUFFIX[j];
        if (r.length > suf.length && r.toLowerCase().slice(-suf.length) === suf) {
          add(r.slice(0, r.length - suf.length));
        }
      }
      add(r);
      // 部品名は先頭の語で足りる (2 語目以降は図種や版の語になる)。
      if (keys.length) break;
    }
    return keys;
  }

  // 共通図かどうか。名前だけで見る (中身を読む前に相手を決めるため)。
  function isCommonSheet(name) {
    var b = baseOf(name).toLowerCase();
    return b.indexOf('common') >= 0 || b.indexOf('共通') >= 0 || b.indexOf('全体') >= 0;
  }

  // ---- DSL の読み取り -------------------------------------------------------
  // クラス図に出てくる宣言と関係線だけを見る。skinparam や title はそのまま通す。

  var CLASS_RE = /^\s*(?:abstract\s+|static\s+)?(?:class|interface|enum|entity|abstract|struct|protocol|annotation)\s+("[^"]+"|[A-Za-z_][\w.]*)/i;
  // 関係線: `A --|> B`、`A <|-- B`、`A --> B : label`、`A -- B` など。
  var REL_RE = /^\s*("[^"]+"|[A-Za-z_][\w.]*)\s*([-.<>|*o+#x}{)(\]\[]{2,})\s*("[^"]+"|[A-Za-z_][\w.]*)\s*(?::.*)?$/;

  function _unquote(s) {
    var t = _s(s).trim();
    if (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') return t.slice(1, -1);
    return t;
  }

  // parse(text) — { head, blocks, relations, tail }。
  // blocks は宣言 1 つ分の行のかたまり ({ } の中身を含む)。
  function parse(text) {
    var lines = _s(text).split(/\r?\n/);
    var head = [], blocks = [], relations = [], tail = [];
    var i = 0;
    for (; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*@enduml/i.test(line)) { tail = lines.slice(i); break; }
      var m = line.match(CLASS_RE);
      if (m) {
        var body = [line];
        if (line.indexOf('{') >= 0 && line.indexOf('}') < 0) {
          while (++i < lines.length) {
            body.push(lines[i]);
            if (lines[i].indexOf('}') >= 0) break;
          }
        }
        blocks.push({ name: _unquote(m[1]), lines: body });
        continue;
      }
      var r = line.match(REL_RE);
      if (r && !/^\s*(?:@|!|skinparam|title|hide|show|left|right|top|bottom|note|package|namespace|together|legend|footer|header|caption)/i.test(line)) {
        relations.push({ a: _unquote(r[1]), b: _unquote(r[3]), line: line });
        continue;
      }
      head.push(line);
    }
    if (!tail.length) tail = ['@enduml'];
    return { head: head, blocks: blocks, relations: relations, tail: tail };
  }

  function _hit(className, keys) {
    var n = _s(className).toLowerCase();
    for (var i = 0; i < (keys || []).length; i++) {
      if (n.indexOf(_s(keys[i]).toLowerCase()) >= 0) return true;
    }
    return false;
  }

  // クラス宣言の 1 行目に背景色を挿す (`class Foo #FFF3B0 {`)。
  function _paint(lines) {
    var out = lines.slice();
    out[0] = out[0].replace(
      /^(\s*(?:abstract\s+|static\s+)?(?:class|interface|enum|entity|abstract|struct|protocol|annotation)\s+(?:"[^"]+"|[A-Za-z_][\w.]*))/i,
      '$1 ' + FOCUS_BG);
    return out;
  }

  // slice(text, keys, opts) — 共通図から keys に当たる所だけの DSL を組み立てる。
  //
  // 返り値: { matched, dsl, focus, kept, dropped }
  //   focus   … 名前が当たったクラス (色を付ける)
  //   kept    … 出力に残したクラス (focus + 線で繋がる 1 段)
  //   dropped … 落とした数 (「何枚分を伏せたか」を画面に出すため)
  function slice(text, keys, opts) {
    var o = opts || {};
    var doc = parse(text);
    var focus = [], keep = {};
    doc.blocks.forEach(function(b) {
      if (_hit(b.name, keys)) { focus.push(b.name); keep[b.name] = 'focus'; }
    });
    if (!focus.length) {
      return { matched: false, dsl: _s(text), focus: [], kept: [], dropped: 0 };
    }
    doc.relations.forEach(function(r) {
      if (keep[r.a] === 'focus' && !keep[r.b]) keep[r.b] = 'near';
      if (keep[r.b] === 'focus' && !keep[r.a]) keep[r.a] = 'near';
    });

    var out = doc.head.slice();
    var kept = [], dropped = 0;
    doc.blocks.forEach(function(b) {
      if (!keep[b.name]) { dropped++; return; }
      kept.push(b.name);
      out = out.concat(keep[b.name] === 'focus' ? _paint(b.lines) : b.lines);
    });
    doc.relations.forEach(function(r) {
      // 片端しか残っていない線は、行き先の無い矢印になるので落とす。
      if (keep[r.a] && keep[r.b]) out.push(r.line);
    });
    if (o.title) {
      out = out.map(function(l) {
        return /^\s*title\s/i.test(l) ? 'title ' + o.title : l;
      });
    }
    return {
      matched: true,
      dsl: out.concat(doc.tail).join('\n'),
      focus: focus, kept: kept, dropped: dropped,
    };
  }

  // 枠の上に出す 1 行。何を伏せたかを言わないと「先輩の図はこれだけ」と読める。
  function sliceNotice(res, seniorName, key) {
    var b = baseOf(seniorName);
    if (!res || !res.matched) {
      return '先輩の共通図 ' + b + ' に「' + _s(key) + '」に当たるクラスはありません';
    }
    return '先輩の共通図 ' + b + ' から「' + _s(key) + '」の部分 '
      + res.kept.length + ' クラス（他 ' + res.dropped + ' クラスは伏せています・読むだけ）';
  }

  var api = {
    FOCUS_BG: FOCUS_BG,
    baseOf: baseOf, partKeysOf: partKeysOf, isCommonSheet: isCommonSheet,
    parse: parse, slice: slice, sliceNotice: sliceNotice,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.seniorSlice = api;
  }
})();
