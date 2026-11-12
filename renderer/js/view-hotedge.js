'use strict';
window.Views = window.Views || {};
Views.hotedge = function () {
  let t = null;
  document.body.addEventListener('mouseenter', () => {
    clearTimeout(t);
    t = setTimeout(() => API.invoke('win:open', 'dashboard', 'show'), 140);
  });
  document.body.addEventListener('mouseleave', () => clearTimeout(t));
};
