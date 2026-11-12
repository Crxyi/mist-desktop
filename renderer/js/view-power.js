'use strict';
window.Views = window.Views || {};
Views.power = function (root) {
  const ITEMS = [
    { id: 'lock', label: 'Lock', ic: 'lock' },
    { id: 'sleep', label: 'Sleep', ic: 'moon', ask: 'Put the PC to sleep?' },
    { id: 'logout', label: 'Sign out', ic: 'logout', ask: 'Sign out? Unsaved work will be lost.' },
    { id: 'restart', label: 'Restart', ic: 'restart', ask: 'Restart the PC now?' },
    { id: 'shutdown', label: 'Shut down', ic: 'power', ask: 'Shut down the PC now?' }
  ];
  const el = UI.h('<div class="powerpop pop"></div>');
  root.appendChild(el);

  async function list() {
    const st = await API.invoke('sys:stats');
    el.innerHTML = `<div class="hd">Power <small>up for ${UI.uptime(st.uptime)}</small></div>` +
      ITEMS.map((i, n) => `<button class="pi" data-id="${i.id}" style="--i:${n + 1}"><span class="qi">${icon(i.ic, 16)}</span>${i.label}</button>`).join('');
  }
  function ask(item) {
    el.innerHTML = `<div class="confirm">
      <div class="qi" style="margin:0 auto;width:48px;height:48px;border-radius:16px;background:var(--card2);display:grid;place-items:center">${icon(item.ic, 22)}</div>
      <div><b>${item.label}</b><div class="muted" style="margin-top:4px;line-height:1.45">${item.ask}</div></div>
      <div class="row"><button class="btn sm" data-back>Cancel</button><button class="btn sm primary" data-go="${item.id}">${item.label}</button></div>
    </div>`;
    UI.$('[data-go]', el).focus();
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) {
      const item = ITEMS.find(i => i.id === b.dataset.id);
      if (item.ask) ask(item); else { API.invoke('power:action', item.id); pop.hide(); }
      return;
    }
    if (e.target.closest('[data-back]')) return list();
    const g = e.target.closest('[data-go]');
    if (g) { API.invoke('power:action', g.dataset.go); pop.hide(); }
  });
  const pop = Popup(el, { onShow: list });
  list();
};
