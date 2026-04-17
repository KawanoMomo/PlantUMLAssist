'use strict';
window.MA = window.MA || {};
window.MA.htmlUtils = (function() {
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { escHtml: escHtml };
})();
