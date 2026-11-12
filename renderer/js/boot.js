'use strict';
(async function () {
  // In case the window is shown before the view is ready
  window.__pendingShow = false;
  API.on('popup:show', () => { window.__pendingShow = true; });
  const name = (location.hash.slice(1) || 'panel').split('?')[0];
  document.body.classList.add('v-' + name);
  let settings = await API.invoke('settings:get');
  UI.applyTheme(settings);
  API.on('settings:changed', s => { settings = s; UI.applyTheme(s); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => UI.applyTheme(settings));
  const view = window.Views[name];
  if (view) view(document.getElementById('app'), settings);
})();

// Shared logic for popup windows (dashboard, launcher, power menu)
window.Popup = function (el, { onShow, onHide, autoLeave = false } = {}) {
  let open = false, leaveTimer = null, entered = false;
  const show = () => {
    open = true; entered = false;
    el.classList.remove('in');
    onShow && onShow();
    void el.offsetWidth;              // lock in the start state, then animate
    requestAnimationFrame(() => { if (open) el.classList.add('in'); });
  };
  const hide = () => {
    if (!open) return;
    open = false;
    el.classList.remove('in');
    onHide && onHide();
    setTimeout(() => { if (!open) API.invoke('popup:hidden'); }, 270);
  };
  API.on('popup:show', show);
  API.on('popup:hide', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  if (autoLeave) {
    el.addEventListener('mouseenter', () => { entered = true; clearTimeout(leaveTimer); });
    el.addEventListener('mouseleave', () => {
      if (!entered) return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(hide, 450);
    });
  }
  if (API.preview || window.__pendingShow) setTimeout(show, 50);
  return { show, hide, isOpen: () => open };
};

// Close a window with a short fade-out animation
window.closeWindow = () => {
  document.body.classList.add('closing');
  setTimeout(() => API.invoke('win:close'), 160);
};

window.Views = window.Views || {};
