'use strict';
window.MA = window.MA || {};

// diagram-settings — 図全体の外観 (Theme / 色 / 文字サイズ) と タイトル を
// GUI から決め、skinparam 行と title 行として DSL 先頭に書き込む。
//
// これまで色・文字サイズ・テーマを変える経路は DSL の手書きしかなく、
// GUI 上で完結しなかった。ここでは「選ぶ → 生成される行が見える → DSL に入る」
// までを扱う。DSL への差し込みは dslUpdater.applySkinparamPreset に任せる。
//
// 生成する skinparam はすべて 1 行形式にする。ブロック形式
// (skinparam usecase { ... }) は applySkinparamPreset が開き行だけを消して
// 中身と閉じ括弧を残すため、掛け直すたびに壊れた DSL が積み上がる。
window.MA.diagramSettings = (function() {

  var THEMES = [
    { id: 'standard', label: '標準' },
    { id: 'mono', label: 'モノクロ' },
    { id: 'dark', label: 'ダーク' },
  ];

  var FONT_SIZES = [10, 12, 14, 16];

  // テーマごとの既定値。個別に色を選べばその値が優先される。
  var THEME_DEFAULTS = {
    standard: { backgroundColor: '#FFFFFF', shapeColor: '#E3E3F7', lineColor: '#181818', fontColor: '#000000', fontSize: 12, monochrome: false },
    mono:     { backgroundColor: '#FFFFFF', shapeColor: '#FFFFFF', lineColor: '#000000', fontColor: '#000000', fontSize: 12, monochrome: true },
    dark:     { backgroundColor: '#1E1E1E', shapeColor: '#3C3F41', lineColor: '#C8C8C8', fontColor: '#E8E8E8', fontSize: 12, monochrome: false },
  };

  // 図種ごとの skinparam 接頭辞。これに BackgroundColor / BorderColor を付ける。
  var TYPE_PREFIX = {
    'plantuml-sequence': 'sequenceParticipant',
    'plantuml-usecase': 'usecase',
    'plantuml-component': 'component',
    'plantuml-class': 'class',
    'plantuml-activity': 'activity',
    'plantuml-state': 'state',
  };

  function _isTheme(id) { return !!THEME_DEFAULTS[id]; }

  function defaults() {
    return { theme: 'standard', shapeColor: null, lineColor: null, backgroundColor: null, fontSize: null, title: '' };
  }

  // resolve(settings) — テーマ既定値の上に個別指定を重ねた実効値を返す。
  function resolve(settings) {
    var s = settings || {};
    var base = THEME_DEFAULTS[_isTheme(s.theme) ? s.theme : 'standard'];
    return {
      theme: _isTheme(s.theme) ? s.theme : 'standard',
      monochrome: base.monochrome,
      backgroundColor: s.backgroundColor || base.backgroundColor,
      shapeColor: s.shapeColor || base.shapeColor,
      lineColor: s.lineColor || base.lineColor,
      fontColor: base.fontColor,
      fontSize: s.fontSize ? Number(s.fontSize) : base.fontSize,
    };
  }

  // buildLines(settings, diagramType) — DSL 先頭に書き込む skinparam 行。
  // パネルはこの配列をそのまま「書き込まれる行」として見せる。
  function buildLines(settings, diagramType) {
    var r = resolve(settings);
    var lines = [];
    if (r.monochrome) {
      // monochrome true は他の色指定を無効化するので、色は並べず文字サイズだけ添える。
      lines.push('skinparam monochrome true');
      lines.push('skinparam backgroundColor ' + r.backgroundColor);
      lines.push('skinparam defaultFontSize ' + r.fontSize);
      return lines;
    }
    lines.push('skinparam backgroundColor ' + r.backgroundColor);
    lines.push('skinparam defaultFontSize ' + r.fontSize);
    lines.push('skinparam defaultFontColor ' + r.fontColor);
    lines.push('skinparam ArrowColor ' + r.lineColor);
    var prefix = TYPE_PREFIX[diagramType];
    if (prefix) {
      lines.push('skinparam ' + prefix + 'BackgroundColor ' + r.shapeColor);
      lines.push('skinparam ' + prefix + 'BorderColor ' + r.lineColor);
    }
    return lines;
  }

  // readFrom(dsl) — 今の DSL から設定を読み戻す。パネルを開いた時点の状態を
  // 現在の図に合わせるため。読み取れない項目は null (= テーマ既定) のまま。
  function readFrom(dsl) {
    var s = defaults();
    var lines = String(dsl == null ? '' : dsl).split('\n');
    var mono = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var m = /^title\s+(.+)$/i.exec(line);
      if (m && !s.title) { s.title = m[1].trim(); continue; }
      if (!/^skinparam\b/i.test(line)) continue;
      if (/^skinparam\s+monochrome\s+true\b/i.test(line)) { mono = true; continue; }
      m = /^skinparam\s+backgroundColor\s+(\S+)/i.exec(line);
      if (m) { s.backgroundColor = m[1]; continue; }
      m = /^skinparam\s+defaultFontSize\s+(\d+)/i.exec(line);
      if (m) { s.fontSize = Number(m[1]); continue; }
      m = /^skinparam\s+ArrowColor\s+(\S+)/i.exec(line);
      if (m) { s.lineColor = m[1]; continue; }
      m = /^skinparam\s+\w+BackgroundColor\s+(\S+)/i.exec(line);
      if (m) { s.shapeColor = m[1]; continue; }
    }
    if (mono) s.theme = 'mono';
    else if (s.backgroundColor && s.backgroundColor.toUpperCase() === THEME_DEFAULTS.dark.backgroundColor) s.theme = 'dark';
    return s;
  }

  // applyTitle(dsl, title) — @startuml の直後の title 行を置き換える。
  // 空文字なら title 行を消す。skinparam 行より前に置く。
  function applyTitle(dsl, title) {
    var text = String(dsl == null ? '' : dsl);
    var want = String(title == null ? '' : title).trim();
    var lines = text.split('\n');
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+/i.test(lines[i])) continue;
      kept.push(lines[i]);
    }
    if (want === '') return kept.join('\n');
    var startIdx = -1;
    for (var j = 0; j < kept.length; j++) {
      if (/^\s*@startuml\b/i.test(kept[j])) { startIdx = j; break; }
    }
    var titleLine = 'title ' + want;
    if (startIdx < 0) return [titleLine].concat(kept).join('\n');
    return kept.slice(0, startIdx + 1).concat([titleLine]).concat(kept.slice(startIdx + 1)).join('\n');
  }

  // apply(dsl, settings, diagramType) — タイトルと skinparam の両方を書き込んだ DSL。
  function apply(dsl, settings, diagramType) {
    var out = applyTitle(dsl, (settings || {}).title);
    var updater = window.MA.dslUpdater;
    if (updater && updater.applySkinparamPreset) {
      out = updater.applySkinparamPreset(out, buildLines(settings, diagramType));
    }
    return out;
  }

  return {
    THEMES: THEMES,
    FONT_SIZES: FONT_SIZES,
    THEME_DEFAULTS: THEME_DEFAULTS,
    defaults: defaults,
    resolve: resolve,
    buildLines: buildLines,
    readFrom: readFrom,
    applyTitle: applyTitle,
    apply: apply,
  };
})();
