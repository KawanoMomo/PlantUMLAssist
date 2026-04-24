'use strict';
window.MA = window.MA || {};
window.MA.dslUtils = (function() {

  function unquote(s) {
    if (s == null) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  function quote(s) {
    if (s == null) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s;
    }
    return '"' + s + '"';
  }

  function escapeForRegex(s) {
    if (s == null) return s;
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isPlantumlComment(line) {
    if (line == null || line === '') return false;
    return line.replace(/^\s+/, '').indexOf("'") === 0;
  }

  return {
    unquote: unquote,
    quote: quote,
    escapeForRegex: escapeForRegex,
    isPlantumlComment: isPlantumlComment,
  };
})();
