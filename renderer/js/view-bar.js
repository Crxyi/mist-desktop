'use strict';
window.Views = window.Views || {};
Views.bar = function (root, settings) {
  let s = settings;
  root.innerHTML = `
  <div class="bar">
    <button class="logo" title="Launcher (Ctrl+Alt+Space)" data-open="launcher">${icon('logo', 24)}</button>
    <div class="ws">
      <button title="Dashboard (Ctrl+Alt+D)" data-open="dashboard">${icon('dashboard', 17)}</button>
      <button title="Optimizer (Ctrl+Alt+O)" data-open="panel">${icon('bolt', 17)}</button>
      <button title="Terminal (Ctrl+Alt+T)" data-open="terminal">${icon('terminal', 17)}</button>
      <button title="Settings" data-open="panel" data-arg="appearance">${icon('settings', 17)}</button>
    </div>
    <div class="tasks" id="tasks"></div>
    <div class="mid"><div class="title" id="title">Desktop</div></div>
    <div class="meters" title="CPU / RAM"><div class="meter"><i id="mc" style="height:0"></i></div><div class="meter"><i id="mm" style="height:0"></i></div></div>
    <button class="stat" data-open="dashboard" title="Dashboard"><div class="clock" id="clock"></div></button>
    <div class="tray">
      <div class="icon-btn" id="net" title="Network"></div>
      <div id="batt" hidden><div class="icon-btn" title="Battery">${icon('battery', 17)}</div><div class="batt" id="battv"></div></div>
    </div>
    <button class="icon-btn powerbtn" data-open="power" title="Power">${icon('power', 17)}</button>
  </div>`;

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (b) API.invoke('win:open', b.dataset.open, b.dataset.arg);
  });

  // Running windows as taskbar buttons
  const tasks = UI.$('#tasks');
  const iconCache = new Map();
  let rendered = '';
  function renderTasks(list) {
    const key = JSON.stringify(list.map(w => [w.hwnd, w.active, w.min]));
    if (key === rendered) return;
    rendered = key;
    tasks.innerHTML = list.map(w =>
      `<button class="task ${w.active ? 'on' : ''} ${w.min ? 'min' : ''}" data-h="${w.hwnd}" title="${UI.esc(w.title)}">
        <span class="ti" data-exe="${UI.esc(w.exe || '')}">${UI.esc((w.title.trim()[0] || '?').toUpperCase())}</span><i class="pip"></i></button>`).join('');
    for (const span of UI.$$('.ti[data-exe]', tasks)) loadIcon(span);
  }
  async function loadIcon(span) {
    const exe = span.dataset.exe;
    if (!exe) return;
    if (!iconCache.has(exe)) iconCache.set(exe, await API.invoke('apps:icon', exe));
    const url = iconCache.get(exe);
    if (url && span.isConnected) span.innerHTML = `<img alt="" src="${url}">`;
  }
  tasks.addEventListener('click', e => {
    const b = e.target.closest('[data-h]');
    if (b) API.invoke('win:activate', Number(b.dataset.h));
  });
  tasks.addEventListener('auxclick', e => {
    const b = e.target.closest('[data-h]');
    if (b && e.button === 1) { e.preventDefault(); API.invoke('win:closeExternal', Number(b.dataset.h)); }
  });
  API.on('windows:list', renderTasks);

  const clock = UI.$('#clock');
  let prev = {};
  function tick() {
    const c = UI.clock(new Date(), s.clock24);
    if (!clock.firstChild || prev.ap !== c.ampm) {
      clock.innerHTML = `<span class="d h"></span><br><span class="d m"></span>${c.ampm ? '<small></small>' : ''}`;
      prev = { ap: c.ampm };
    }
    for (const k of ['h', 'm']) {
      if (prev[k] === c[k]) continue;
      const e = UI.$('.d.' + k, clock);
      e.textContent = c[k];
      if (prev[k] !== undefined) UI.replay(e, 'roll');
      prev[k] = c[k];
    }
    if (c.ampm) UI.$('small', clock).textContent = c.ampm;
  }
  tick();
  setInterval(tick, 1000);
  API.on('settings:changed', ns => { s = ns; tick(); });

  const title = UI.$('#title');
  API.on('fg:title', t => { title.textContent = t || 'Desktop'; title.title = t || ''; UI.replay(title, 'swap'); });

  const net = UI.$('#net');
  const updNet = () => { net.innerHTML = icon(navigator.onLine ? 'wifi' : 'wifiOff', 17); net.title = navigator.onLine ? 'Online' : 'Offline'; };
  updNet();
  window.addEventListener('online', updNet);
  window.addEventListener('offline', updNet);

  if (navigator.getBattery) {
    navigator.getBattery().then(b => {
      const upd = () => {
        const fake = b.charging && b.level === 1 && b.chargingTime === 0;   // desktop PC without a real battery
        UI.$('#batt').hidden = fake;
        UI.$('#battv').textContent = Math.round(b.level * 100);
      };
      upd();
      b.addEventListener('levelchange', upd);
      b.addEventListener('chargingchange', upd);
    }).catch(() => {});
  }

  const mc = UI.$('#mc'), mm = UI.$('#mm');
  API.on('sys:stats', st => {
    mc.style.height = Math.round(st.cpu) + '%';
    mm.style.height = Math.round(st.memUsed / st.memTotal * 100) + '%';
  });
};
