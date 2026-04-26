'use strict';
window.MA = window.MA || {};

/**
 * Formatter Interface 契約
 *
 * 各図形モジュール (sequence.js, usecase.js, ...) は、DSL に挿入する 1 行を
 * 生成する純粋関数 fmtXxx(props) を複数提供する。本インターフェースはその
 * 契約 (入力 props は kind 別、出力は改行を含まない単一行文字列、必須 prop
 * 欠落時は '' を返す no-op) を明文化し、contract violation を開発時に
 * 検知する検証ヘルパーを提供する。
 *
 * Example:
 *   function fmtMessage(props) {
 *     if (!props || !props.from || !props.to) return '';
 *     return props.from + ' ' + (props.arrow || '->') + ' ' + props.to
 *       + (props.label ? ' : ' + props.label : '');
 *   }
 *
 * Contract:
 *   @param {Object} props — kind 別の formatter 引数 (各モジュール仕様に従う)
 *   @returns {string} — 単一行 DSL 文字列 (改行含まず)、または必須 prop 欠落
 *                       時は '' (caller 側で no-op として扱う)
 */
window.MA.formatterInterface = (function() {

  function assertFormatterContract(fn, name) {
    if (typeof fn !== 'function') {
      throw new Error('Formatter "' + (name || 'anonymous') + '" must be a function, got ' + typeof fn);
    }
    return true;
  }

  function validateOutput(output, formatterName) {
    if (typeof output !== 'string') return false;
    if (output.indexOf('\n') >= 0) return false;
    return true;
  }

  return {
    assertFormatterContract: assertFormatterContract,
    validateOutput: validateOutput,
  };
})();
