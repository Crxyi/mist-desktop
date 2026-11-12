'use strict';
window.Views = window.Views || {};
Views.launcher = function (root) {
  const el = UI.h(`<div class="launch pop">
    <label class="sbox">${icon('search', 18)}<input id="q" placeholder="Apps, commands or math …" spellcheck="false" autocomplete="off"></label>
    <div class="res" id="res"></div>
    <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> select</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
  </div>`);
  root.appendChild(el);
  const q = UI.$('#q', el), res = UI.$('#res', el);
  let apps = [], items = [], sel = 0;
  const icons = new Map();

  const CMDS = [
    { name: 'Optimizer', sub: 'Clean up & speed up your PC', ic: 'bolt', run: () => API.invoke('win:open', 'panel') },
    { name: 'Quick optimize', sub: 'Clear temp, RAM & DNS', ic: 'rocket', run: async () => { await API.invoke('opt:quick'); } },
    { name: 'Free up memory', sub: 'Reclaim unused RAM', ic: 'memory', run: () => API.invoke('opt:ram') },
    { name: 'Dashboard', sub: 'Clock, weather, usage', ic: 'dashboard', run: () => API.invoke('win:open', 'dashboard', 'show') },
    { name: 'Terminal', sub: 'Open the Mist terminal', ic: 'terminal', run: () => API.invoke('win:open', 'terminal') },
    { name: 'Manage startup', sub: 'Programs that run at boot', ic: 'startup', run: () => API.invoke('win:open', 'panel', 'startup') },
    { name: 'Processes', sub: 'View running programs', ic: 'list', run: () => API.invoke('win:open', 'panel', 'procs') },
    { name: 'Appearance', sub: 'Wallpaper, theme, bar', ic: 'palette', run: () => API.invoke('win:open', 'panel', 'appearance') },
    { name: 'Reset & Safety', sub: 'Undo everything, kill switch', ic: 'undo', run: () => API.invoke('win:open', 'panel', 'about') },
    { name: 'Toggle shell', sub: 'Ctrl+Alt+Shift+M', ic: 'shield', run: async () => { const st = await API.invoke('settings:get'); API.invoke('settings:set', { shell: { enabled: !st.shell.enabled } }); } },
    { name: 'Lock', sub: 'Lock the PC', ic: 'lock', run: () => API.invoke('power:action', 'lock') },
    { name: 'Power …', sub: 'Shut down, restart, sign out', ic: 'power', run: () => API.invoke('win:open', 'power', 'show') }
  ];

  // Small, safe calculator (no eval)
  function calc(str) {
    const src = str.replace(/\s+/g, '').replace(/,/g, '.').replace(/[x×]/g, '*').replace(/÷/g, '/');
    if (!/^[\d.+\-*/()%^]+$/.test(src) || !/[+\-*/%^]/.test(src.replace(/^-/, ''))) return null;
    let i = 0;
    const peek = () => src[i];
    const num = () => { const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
    const atom = () => {
      if (peek() === '-') { i++; return -atom(); }
      if (peek() === '(') { i++; const v = expr(); if (src[i++] !== ')') throw 0; return v; }
      let v = num();
      if (peek() === '%') { i++; v /= 100; }
      return v;
    };
    const pow = () => { let v = atom(); while (peek() === '^') { i++; v = Math.pow(v, atom()); } return v; };
    const term = () => { let v = pow(); while (peek() === '*' || peek() === '/') { const o = src[i++]; const r = pow(); v = o === '*' ? v * r : v / r; } return v; };
    const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const o = src[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
    try { const v = expr(); if (i !== src.length || !isFinite(v)) return null; return v; } catch { return null; }
  }

  function score(name, query) {
    const n = name.toLowerCase(), k = query.toLowerCase();
    if (n === k) return 100;
    if (n.startsWith(k)) return 80;
    if (n.split(/[\s\-_.]+/).some(w => w.startsWith(k))) return 60;
    const initials = n.split(/[\s\-_.]+/).map(w => w[0]).join('');
    if (initials.startsWith(k)) return 50;
    if (n.includes(k)) return 40;
    let j = 0; for (const ch of n) if (ch === k[j]) j++;
    return j === k.length ? 10 : 0;
  }

  function build(stagger = false) {
    const query = q.value.trim();
    items = [];
    const groups = [];
    const c = query ? calc(query) : null;
    if (c !== null) {
      const out = String(Math.round(c * 1e10) / 1e10);
      groups.push(['Calculator', [{ name: out, sub: `${query} =`, ic: 'calc', run: () => navigator.clipboard.writeText(out).catch(() => {}), hint: 'Copy' }]]);
    }
    const cmds = query ? CMDS.map(x => [x, score(x.name, query)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]) : CMDS.slice(0, 4);
    const ap = query ? apps.map(x => [x, score(x.name, query)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]) : apps.slice(0, 60);
    const appItems = ap.map(a => ({ name: a.name, sub: 'App', app: a, run: () => API.invoke('apps:launch', a.id) }));
    if (query) {
      if (appItems.length) groups.push(['Apps', appItems]);
      if (cmds.length) groups.push(['Commands', cmds]);
    } else {
      groups.push(['Commands', cmds]);
      if (appItems.length) groups.push(['All apps', appItems]);
    }
    let html = '';
    groups.forEach(([title, list]) => {
      html += `<div class="sec">${title}</div>`;
      list.forEach(it => {
        const idx = items.push(it) - 1;
        const ic = it.app ? `<span class="ai" data-icon="${idx}">${UI.esc(it.name[0])}</span>` : `<span class="ai">${icon(it.ic, 17)}</span>`;
        html += `<button class="it" data-i="${idx}">${ic}<span><b>${UI.esc(it.name)}</b><small>${UI.esc(it.sub)}</small></span>${it.hint ? `<span class="kbd">${it.hint}</span>` : ''}</button>`;
      });
    });
    if (!items.length) html = `<div class="empty">No results for “${UI.esc(query)}”</div>`;
    res.innerHTML = html;
    res.classList.remove('stg', 'filter');
    if (stagger) { UI.stagger(UI.$$('.sec, .it', res).slice(0, 16)); res.classList.add('stg'); }
    else if (query) { void res.offsetWidth; res.classList.add('filter'); }
    sel = 0;
    mark();
    loadIcons();
  }

  function mark() {
    UI.$$('.it', res).forEach(b => b.classList.toggle('sel', +b.dataset.i === sel));
    const s = UI.$(`.it[data-i="${sel}"]`, res);
    if (s) s.scrollIntoView({ block: 'nearest' });
  }

  async function loadIcons() {
    for (const span of UI.$$('[data-icon]', res).slice(0, 40)) {
      const it = items[+span.dataset.icon];
      if (!it || !it.app || !it.app.icon) continue;
      let url = icons.get(it.app.icon);
      if (url === undefined) { url = await API.invoke('apps:icon', it.app.icon); icons.set(it.app.icon, url); }
      if (url && span.isConnected) span.innerHTML = `<img alt="" src="${url}">`;
    }
  }

  async function runSel(i = sel) {
    const it = items[i];
    if (!it) return;
    pop.hide();
    await it.run();
  }

  q.addEventListener('input', () => build(false));
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
    if (e.key === 'Enter') { runSel(); e.preventDefault(); }
  });
  res.addEventListener('click', e => { const b = e.target.closest('.it'); if (b) runSel(+b.dataset.i); });
  res.addEventListener('mousemove', e => { const b = e.target.closest('.it'); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); } });

  const pop = Popup(el, {
    onShow: async () => {
      q.value = ''; build(true);
      setTimeout(() => q.focus(), 30);
      const list = await API.invoke('apps:list');
      if (Array.isArray(list) && list.length !== apps.length) { apps = list; build(!q.value); }
    }
  });
  build(true);
};
