'use strict';
window.Views = window.Views || {};
Views.panel = async function (root, settings) {
  let s = settings;
  const info = await API.invoke('sys:static');
  const hist = { cpu: [], mem: [] };
  let last = await API.invoke('sys:stats');
  let page = 'overview';
  let pageTimer = null;

  const PAGES = [
    ['overview', 'Overview', 'gauge'],
    ['clean', 'Cleanup', 'broom'],
    ['perf', 'Performance', 'rocket'],
    ['startup', 'Startup', 'startup'],
    ['procs', 'Processes', 'list'],
    ['appearance', 'Appearance', 'palette'],
    ['about', 'Reset', 'shield']
  ];

  root.innerHTML = `<div class="panel">
    <nav class="nav">
      <div class="brand"><span class="ico">${icon('logo', 17)}</span>Mist</div>
      <span class="ind"></span>
      ${PAGES.map(([id, t, ic]) => `<button class="n" data-p="${id}">${icon(ic, 18)}${t}</button>`).join('')}
      <div class="grow"></div>
      <div class="adm">${info.admin
        ? `<b>${icon('shield', 14)}Administrator</b>All features available.`
        : `<b>${icon('shield', 14)}Standard user</b>Windows will ask for permission when a system action needs it.`}</div>
    </nav>
    <section class="main">
      <div class="titlebar"><h1 id="ptitle"></h1><div class="wc">
        <button data-w="minimize" title="Minimize">${icon('minimize', 14)}</button>
        <button data-w="maximize" title="Maximize">${icon('maximize', 12)}</button>
        <button class="x" data-w="close" title="Close">${icon('close', 14)}</button></div></div>
      <div class="page" id="page"></div>
    </section>
  </div>`;
  const pg = UI.$('#page');

  UI.$('.wc').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; if (b.dataset.w === 'close') closeWindow(); else API.invoke('win:' + b.dataset.w); });
  UI.$('.nav').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) go(b.dataset.p); });
  API.on('panel:page', p => go(p));
  API.on('settings:changed', ns => { s = ns; if (page === 'appearance') { clearTimeout(go.ap); go.ap = setTimeout(() => appearance(true), 320); } });

  const navInd = UI.$('.nav .ind');
  function moveNav() {
    const b = UI.$(`.nav [data-p="${page}"]`);
    if (b) navInd.style.transform = `translateY(${b.offsetTop}px)`;
  }
  window.addEventListener('resize', moveNav);

  function go(p) {
    const same = p === page && pg.firstChild;
    page = p;
    clearInterval(pageTimer);
    UI.$$('.nav [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    moveNav();
    const t = UI.$('#ptitle');
    t.textContent = PAGES.find(x => x[0] === p)[1];
    if (!same) UI.replay(t, 'swap');
    pg.scrollTop = 0;
    ({ overview, clean, perf, startup, procs, appearance, about })[p]();
    if (!same) enter();
  }
  // Reveal a new page with a staggered fade
  function enter() {
    pg.classList.remove('enter');
    UI.stagger([...pg.children].slice(0, 12));
    void pg.offsetWidth;
    pg.classList.add('enter');
    clearTimeout(enter.t);
    enter.t = setTimeout(() => pg.classList.remove('enter'), 1100);
  }

  API.on('sys:stats', st => {
    last = st;
    hist.cpu.push(st.cpu); hist.mem.push(st.memUsed / st.memTotal * 100);
    if (hist.cpu.length > 50) { hist.cpu.shift(); hist.mem.shift(); }
    if (page === 'overview') liveOverview();
  });

  const histIcon = k => ({ clean: 'broom', ram: 'memory', net: 'network', quick: 'rocket', power: 'bolt', tweak: 'settings', startup: 'startup', proc: 'list' }[k] || 'info');

  // ======================= Overview =======================
  function health() {
    const memPct = last.memUsed / last.memTotal * 100, diskPct = last.diskUsed / last.diskTotal * 100;
    let score = 100;
    score -= Math.max(0, memPct - 60) * 0.8;
    score -= Math.max(0, diskPct - 75) * 1.2;
    score -= Math.max(0, last.cpu - 70) * 0.4;
    score -= Math.min(10, last.uptime / 86400 * 2);
    score = Math.max(20, Math.round(score));
    let text = 'Your PC is running smoothly. A quick optimize keeps it clean.';
    if (diskPct > 85) text = 'The system drive is almost full. A cleanup frees up space.';
    else if (memPct > 80) text = 'Memory usage is high. Close some programs or free up RAM.';
    else if (last.uptime > 5 * 86400) text = 'The PC has been running for over 5 days. A restart may help.';
    return { score, text };
  }

  async function overview() {
    const h = health();
    pg.innerHTML = `
      <div class="box hero">
        <div id="hring"></div>
        <div class="txt"><h3>${UI.greeting()}, ${UI.esc(info.user)}</h3><p id="htext">${h.text}</p></div>
        <button class="btn primary lg" id="quick">${icon('rocket', 17)}Quick optimize</button>
      </div>
      <div class="grid g3 sect" style="margin-top:12px">
        <div class="box statc"><div class="lbl">${icon('cpu', 15)}Processor</div><div class="val" id="vcpu"></div><div class="graph" id="gcpu"></div></div>
        <div class="box statc"><div class="lbl">${icon('memory', 15)}Memory</div><div class="val" id="vmem"></div><div class="graph" id="gmem"></div></div>
        <div class="box statc"><div class="lbl">${icon('disk', 15)}System drive</div><div class="val" id="vdisk"></div>
          <div style="height:6px;border-radius:6px;background:var(--card2);margin:18px 0 6px;overflow:hidden"><i id="bdisk" style="display:block;height:100%;width:0;background:var(--accent);border-radius:6px;transition:width 1.1s var(--e-emph)"></i></div>
          <div class="muted" id="ddisk" style="font-size:12px;padding-bottom:16px"></div></div>
      </div>
      <div class="grid g2 sect">
        <div><h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:0 0 10px 2px">System</h3>
          <div class="box kv">
            <b>Operating system</b><span>${UI.esc(info.os)} (${UI.esc(info.kernel)})</span>
            <b>Processor</b><span>${UI.esc(info.cpu)}</span>
            <b>Graphics</b><span>${UI.esc(info.gpu || '–')}</span>
            <b>Memory</b><span>${UI.gb(info.memTotal)} GB</span>
            <b>Computer name</b><span>${UI.esc(info.host)}</span>
            <b>Uptime</b><span id="kup"></span>
          </div></div>
        <div><h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:0 0 10px 2px">Recent activity</h3>
          <div class="box hist" id="hist" style="padding:8px 16px"></div></div>
      </div>`;
    liveOverview();
    renderHistory();
    UI.$('#quick').addEventListener('click', e => UI.busy(e.currentTarget, async () => {
      const r = await API.invoke('opt:quick');
      UI.toast(`Done: ${UI.bytes(r.total)} storage and ${UI.bytes(r.ram)} RAM freed`);
      renderHistory();
    }));
  }
  async function renderHistory() {
    const box = UI.$('#hist');
    if (!box) return;
    const h = await API.invoke('history:get') || [];
    box.dataset.revealed = '';
    box.innerHTML = h.length ? h.slice(0, 6).map(x => `<div class="h"><span class="qi">${icon(histIcon(x.kind), 14)}</span><span>${UI.esc(x.text)}</span><em>${UI.ago(x.t)}</em></div>`).join('')
      : '<div class="muted" style="padding:20px 0;text-align:center">No actions yet. Start with Quick optimize.</div>';
    UI.reveal(box);
  }
  function liveOverview() {
    if (!UI.$('#vcpu')) return;
    const memPct = last.memUsed / last.memTotal * 100, diskPct = last.diskUsed / last.diskTotal * 100;
    UI.count(UI.$('#vcpu'), last.cpu, v => `${Math.round(v)}%<small>${info.cores} threads</small>`);
    UI.count(UI.$('#vmem'), last.memUsed / 1024 ** 3, v => `${v.toFixed(1)}<small>of ${UI.gb(last.memTotal)} GB</small>`);
    UI.count(UI.$('#vdisk'), diskPct, v => `${Math.round(v)}%<small>used</small>`);
    requestAnimationFrame(() => { const b = UI.$('#bdisk'); if (b) b.style.width = diskPct + '%'; });
    UI.$('#ddisk').textContent = `${UI.bytes(last.diskTotal - last.diskUsed)} free of ${UI.bytes(last.diskTotal)}`;
    UI.sparkSet(UI.$('#gcpu'), hist.cpu, 300, 56);
    UI.sparkSet(UI.$('#gmem'), hist.mem, 300, 56);
    UI.$('#kup').textContent = UI.uptime(last.uptime);
    const h = health();
    const hr = UI.$('#hring');
    UI.ringSet(hr, h.score, 104, 9, '<div><div class="score">0</div><small>HEALTH</small></div>');
    UI.count(UI.$('.score', hr), h.score, v => String(Math.round(v)), 1100);
    UI.$('#htext').textContent = h.text;
  }

  // ======================= Cleanup =======================
  let scanData = null;
  const selected = new Set();
  async function clean() {
    pg.innerHTML = `<h2>Clean up storage</h2>
      <p class="lead">Mist looks for files Windows and your programs no longer need. Personal files, passwords and settings are never touched.</p>
      <div class="box rows" id="cats" style="padding:0"></div>
      <div class="sticky-act"><div class="sum" id="sum"></div><div style="flex:1"></div>
        <button class="btn" id="rescan">${icon('refresh', 15)}Rescan</button>
        <button class="btn primary lg" id="go">${icon('broom', 16)}Clean up</button></div>`;
    UI.$('#rescan').addEventListener('click', e => UI.busy(e.currentTarget, doScan));
    UI.$('#go').addEventListener('click', e => UI.busy(e.currentTarget, doClean));
    UI.$('#cats').addEventListener('click', e => {
      const r = e.target.closest('[data-c]');
      if (!r) return;
      const id = r.dataset.c;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      renderCats();
    });
    if (scanData) renderCats(); else { UI.$('#cats').innerHTML = skeletonRows(6); await doScan(); }
  }
  const skeletonRows = n => Array.from({ length: n }, () => `<div class="rowi"><span class="qi"></span><div class="tx"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:70%;margin-top:8px;height:10px"></div></div></div>`).join('');
  async function doScan() {
    if (UI.$('#cats') && scanData) UI.$('#cats').style.opacity = .5;
    scanData = await API.invoke('opt:scan') || [];
    if (!selected.size) scanData.forEach(c => { if (c.def) selected.add(c.id); });
    if (UI.$('#cats')) { UI.$('#cats').style.opacity = 1; renderCats(); }
  }
  function renderCats() {
    const box = UI.$('#cats');
    if (!box || !scanData) return;
    const ic = { usertemp: 'folder', wintemp: 'folder', crash: 'info', shader: 'gauge', browser: 'network', thumbs: 'image', recycle: 'trash' };
    box.innerHTML = scanData.map(c => `<div class="rowi" data-c="${c.id}" style="cursor:pointer">
      <span class="check ${selected.has(c.id) ? 'on' : ''}">${icon('check', 13)}</span>
      <span class="qi">${icon(ic[c.id] || 'folder', 17)}</span>
      <div class="tx"><b>${UI.esc(c.title)}${c.needsAdmin ? '<span class="badge">Admin</span>' : ''}</b><small>${UI.esc(c.desc)}</small></div>
      <div class="size">${UI.bytes(c.size)}<div class="muted" style="font-weight:500;font-size:11px">${c.count.toLocaleString('en-US')} files</div></div>
    </div>`).join('');
    const total = scanData.filter(c => selected.has(c.id)).reduce((a, c) => a + c.size, 0);
    UI.reveal(box);
    UI.count(UI.$('#sum'), total, v => `Selected: <b>${UI.bytes(v)}</b>`, 500);
    UI.$('#go').disabled = !selected.size;
  }
  async function doClean() {
    const ids = [...selected];
    if (ids.includes('recycle')) {
      const ok = await UI.confirm({ title: 'Empty the Recycle Bin?', text: 'Files in the Recycle Bin cannot be restored afterwards.', ok: 'Empty', danger: true });
      if (!ok) return;
    }
    const r = await API.invoke('opt:clean', ids);
    UI.toast(`${UI.bytes(r.total)} freed`);
    await doScan();
  }

  // ======================= Performance =======================
  async function perf() {
    pg.innerHTML = `<h2>Performance</h2>
      <p class="lead">Everything here is reversible. Mist remembers the original values – flip the switch or hit “Undo all” to restore them.</p>
      <div class="grid g2">
        <div class="box"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">${icon('bolt', 18)}<b style="font-size:14px">Power plan</b></div><div class="plans" id="plans">${skeletonRows(1)}</div><div class="acts" id="pacts"></div></div>
        <div class="grid" style="gap:12px">
          <div class="box"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${icon('gauge', 18)}<b style="font-size:14px">Power mode</b></div>
            <p class="muted" style="margin:0 0 12px;line-height:1.5">The slider from Windows settings. Mostly relevant on laptops.</p><div class="seg" id="ovl"></div></div>
          <div class="box" style="display:flex;gap:12px;align-items:center"><span class="qi" style="width:40px;height:40px;border-radius:13px;background:var(--card2);display:grid;place-items:center">${icon('memory', 18)}</span>
            <div style="flex:1"><b>Free up memory</b><div class="muted" style="margin-top:2px">Trims the working set of every program.</div></div><button class="btn" id="ram">Free up</button></div>
          <div class="box" style="display:flex;gap:12px;align-items:center"><span class="qi" style="width:40px;height:40px;border-radius:13px;background:var(--card2);display:grid;place-items:center">${icon('network', 18)}</span>
            <div style="flex:1"><b>Flush DNS cache</b><div class="muted" style="margin-top:2px">Helps when websites fail to load.</div></div><button class="btn" id="dns">Flush</button></div>
        </div>
      </div>
      <div class="sect"><h3>Windows settings</h3><div class="box rows" id="tweaks" style="padding:0">${skeletonRows(4)}</div></div>
      <div class="acts" style="justify-content:flex-end"><button class="btn ghost" data-go="about">${icon('shield', 15)}Restore point …</button><button class="btn" id="revert">${icon('undo', 15)}Undo all</button></div>`;
    pg.querySelector('[data-go="about"]').onclick = () => go('about');
    UI.$('#ram').addEventListener('click', e => UI.busy(e.currentTarget, async () => { const r = await API.invoke('opt:ram'); UI.toast(`${UI.bytes(r.freed)} RAM freed (${r.processes} processes)`); }));
    UI.$('#dns').addEventListener('click', e => UI.busy(e.currentTarget, async () => { const r = await API.invoke('opt:dns'); UI.toast(r.ok ? 'DNS cache flushed' : 'Failed', r.ok ? 'ok' : 'err'); }));
    UI.$('#revert').addEventListener('click', e => UI.busy(e.currentTarget, async () => {
      if (!await UI.confirm({ title: 'Undo everything?', text: 'All Windows settings changed by Mist and the power plan are restored to their original values.', ok: 'Undo' })) return;
      await API.invoke('opt:revert'); UI.toast('Original settings restored'); loadPower(); loadTweaks();
    }));
    loadPower(); loadTweaks();
  }
  async function loadPower() {
    const p = await API.invoke('opt:power:list');
    const box = UI.$('#plans');
    if (!box) return;
    if (!p || !p.plans.length) { box.innerHTML = '<div class="muted">Windows only.</div>'; return; }
    const firstPlans = !box.dataset.revealed;
    box.innerHTML = p.plans.map(x => `<button class="plan ${x.active ? 'on' : ''}" data-g="${x.guid}"><span class="radio"></span><b>${UI.esc(x.name)}</b>${x.active ? '<span class="badge">Active</span>' : ''}</button>`).join('');
    if (firstPlans) UI.reveal(box);
    UI.$('#pacts').innerHTML = `<button class="btn sm" data-k="high">${icon('bolt', 14)}High performance</button><button class="btn sm" data-k="ultimate">${icon('rocket', 14)}Ultimate performance</button>` +
      (p.original ? `<button class="btn sm ghost" data-k="restore">${icon('undo', 14)}Original plan</button>` : '');
    box.onclick = async e => {
      const b = e.target.closest('[data-g]'); if (!b || b.classList.contains('on')) return;
      const r = await API.invoke('opt:power:set', b.dataset.g);
      UI.toast(r.ok ? 'Power plan switched' : (r.error || 'Failed'), r.ok ? 'ok' : 'err'); loadPower();
    };
    UI.$('#pacts').onclick = e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      UI.busy(b, async () => {
        const r = b.dataset.k === 'restore' ? await API.invoke('opt:power:restore') : await API.invoke('opt:power:enable', b.dataset.k);
        UI.toast(r.ok ? 'Power plan activated' : (r.error || 'Failed'), r.ok ? 'ok' : 'err', r.ok ? 3000 : 6000); loadPower();
      });
    };
    const ovl = UI.$('#ovl');
    ovl.innerHTML = p.overlays.map(o => `<button data-o="${o.id}" class="${o.id === p.overlay ? 'on' : ''}">${o.name}</button>`).join('');
    ovl.onclick = async e => {
      const b = e.target.closest('[data-o]'); if (!b) return;
      const r = await API.invoke('opt:power:overlay', b.dataset.o);
      if (!r.ok) return UI.toast(r.error || 'Not supported', 'err');
      UI.$$('button', ovl).forEach(x => x.classList.toggle('on', x === b));
    };
  }
  async function loadTweaks() {
    const t = await API.invoke('opt:tweaks:get');
    const box = UI.$('#tweaks');
    if (!box) return;
    const ic = { gamemode: 'sparkle', gamedvr: 'image', animations: 'gauge', transparency: 'palette', mouse: 'arrow', startupdelay: 'startup', menudelay: 'list', tips: 'info' };
    box.innerHTML = t.map(x => `<div class="rowi"><span class="qi">${icon(ic[x.id] || 'settings', 17)}</span>
      <div class="tx"><b>${UI.esc(x.title)}${x.relogin ? '<span class="badge">after sign-out</span>' : ''}${x.saved ? '<span class="badge good">original saved</span>' : ''}</b><small>${UI.esc(x.desc)}</small></div>
      ${UI.toggle(x.on, `data-t="${x.id}" ${x.supported ? '' : 'disabled'}`)}</div>`).join('');
    UI.reveal(box);
    box.onclick = async e => {
      const b = e.target.closest('[data-t]'); if (!b || b.disabled) return;
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on); b.disabled = true;
      const r = await API.invoke('opt:tweaks:set', b.dataset.t, on);
      if (!r || !r.ok) { b.classList.toggle('on', !on); UI.toast('Could not be changed', 'err'); }
      else UI.toast(on ? 'Enabled' : 'Restored to original value');
      loadTweaks();
    };
  }

  // ======================= Startup =======================
  async function startup() {
    pg.innerHTML = `<h2>Startup</h2>
      <p class="lead">Programs that launch with Windows slow down boot. Disabling them is safe and reversible any time – just like Task Manager.</p>
      <div class="toolbar"><span class="muted" id="scount"></span><div class="grow"></div><button class="btn sm" id="sref">${icon('refresh', 14)}Refresh</button></div>
      <div class="box rows" id="slist" style="padding:0">${skeletonRows(5)}</div>`;
    UI.$('#sref').addEventListener('click', e => UI.busy(e.currentTarget, loadStartup));
    loadStartup();
  }
  let startupItems = [];
  async function loadStartup() {
    startupItems = await API.invoke('opt:startup:list') || [];
    const box = UI.$('#slist');
    if (!box) return;
    if (!startupItems.length) { box.innerHTML = '<div class="empty-state">No startup entries found.</div>'; UI.$('#scount').textContent = ''; return; }
    UI.$('#scount').textContent = `${startupItems.filter(x => x.enabled).length} of ${startupItems.length} enabled`;
    box.innerHTML = startupItems.map((x, i) => `<div class="rowi"><span class="qi" style="font-weight:700;color:var(--muted)">${UI.esc((x.name || '?')[0].toUpperCase())}</span>
      <div class="tx"><b>${UI.esc(x.name)}<span class="badge">${UI.esc(x.scope)}</span>${x.admin ? '<span class="badge">Admin</span>' : ''}</b><code title="${UI.esc(x.command)}">${UI.esc(x.command)}</code></div>
      ${UI.toggle(x.enabled, `data-s="${i}"`)}</div>`).join('');
    UI.reveal(box);
    box.onclick = async e => {
      const b = e.target.closest('[data-s]'); if (!b || b.disabled) return;
      const it = startupItems[+b.dataset.s];
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on); b.disabled = true;
      const r = await API.invoke('opt:startup:set', it, on);
      if (r && r.ok) { UI.toast(`${it.name} ${on ? 'runs with Windows again' : 'no longer starts automatically'}`); }
      else UI.toast(r && r.error || 'Failed', 'err');
      loadStartup();
    };
  }

  // ======================= Processes =======================
  async function procs() {
    pg.innerHTML = `<h2>Processes</h2>
      <p class="lead">What's running right now, grouped by program and sorted by memory. System processes are protected.</p>
      <div class="toolbar"><span class="muted" id="pcount"></span><div class="grow"></div><input class="input" id="pf" placeholder="Filter …" style="width:200px"></div>
      <div class="box" style="padding:14px 6px 6px"><table class="table"><thead><tr><th>Program</th><th class="num">CPU</th><th class="num">RAM</th><th style="width:110px"></th></tr></thead><tbody id="pt"><tr><td colspan="4">${skeletonRows(1)}</td></tr></tbody></table></div>`;
    UI.$('#pf').addEventListener('input', renderProcs);
    UI.$('#pt').addEventListener('click', async e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const p = procList[+b.dataset.k];
      const ok = await UI.confirm({ title: `End ${p.name}?`, text: `${p.count > 1 ? `All ${p.count} processes` : 'The process'} of “${p.name}” will be terminated immediately. Unsaved data will be lost.`, ok: 'End', danger: true });
      if (!ok) return;
      const r = await API.invoke('opt:proc:kill', p.ids, p.name);
      UI.toast(r.ok ? `${p.name} ended` : (r.error || 'Failed'), r.ok ? 'ok' : 'err');
      loadProcs();
    });
    await loadProcs();
    pageTimer = setInterval(() => { if (page === 'procs' && document.hasFocus()) loadProcs(); }, 5000);
  }
  let procList = [];
  async function loadProcs() {
    procList = await API.invoke('opt:proc:list') || [];
    renderProcs();
  }
  function renderProcs() {
    const tb = UI.$('#pt'); if (!tb) return;
    const f = (UI.$('#pf').value || '').toLowerCase();
    const max = Math.max(1, ...procList.map(p => p.mem));
    UI.$('#pcount').textContent = procList.length ? `${procList.reduce((a, p) => a + p.count, 0)} processes` : '';
    if (!procList.length) { tb.innerHTML = '<tr><td colspan="4"><div class="empty-state">Windows only.</div></td></tr>'; return; }
    const firstProcs = !tb.dataset.revealed;
    tb.innerHTML = procList.map((p, i) => [p, i]).filter(([p]) => !f || p.name.toLowerCase().includes(f) || (p.title || '').toLowerCase().includes(f)).map(([p, i]) => `<tr>
      <td><div class="nm">${UI.esc(p.name)}${p.count > 1 ? ` <small>×${p.count}</small>` : ''}</div>${p.title ? `<div class="muted" style="font-size:11.5px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${UI.esc(p.title)}</div>` : ''}</td>
      <td class="num">${p.cpu.toFixed(1)} %</td>
      <td class="num">${UI.bytes(p.mem)}<div class="bar-in"><i style="width:${(p.mem / max * 100).toFixed(1)}%"></i></div></td>
      <td style="text-align:right">${p.protected ? '<span class="badge">protected</span>' : `<button class="btn sm" data-k="${i}">End</button>`}</td></tr>`).join('');
    if (firstProcs) UI.reveal(tb);
  }

  // ======================= Appearance =======================
  function appearance(keepScroll) {
    const sc = pg.scrollTop;
    const dark = document.documentElement.dataset.theme === 'dark';
    const sh = s.shell;
    const row = (key, title, desc, on, disabled = false) => `<div class="setrow"><div class="tx"><b>${title}</b><small>${desc}</small></div>${UI.toggle(on, `data-sh="${key}" ${disabled ? 'disabled' : ''}`)}</div>`;
    pg.innerHTML = `<h2>Appearance</h2>
      <p class="lead">Mist sits on top of Windows as its own shell – without changing system files, your theme or the registry. When you quit, everything is back to how it was.</p>
      <div class="sect" style="margin-top:0"><h3>Color scheme</h3><div class="seg" id="theme">
        ${[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match Windows']].map(([v, l]) => `<button data-v="${v}" class="${s.theme === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="sect"><h3>Wallpaper</h3><div class="wps" id="wps">
        ${Scenes.list.map(x => `<button class="wp ${s.wallpaper === x.id ? 'on' : ''}" data-wp="${x.id}"><div class="pv">${Scenes.render(x.id, dark, false)}</div><b>${x.name}</b></button>`).join('')}
        <button class="wp ${s.wallpaper === 'custom' ? 'on' : ''}" data-wp="custom"><div class="pv">${s.wallpaperPath ? `<img alt="" src="file:///${UI.esc(s.wallpaperPath.replace(/\\/g, '/'))}">` : icon('image', 26)}</div><b>Custom image …</b></button>
      </div></div>
      <div class="sect"><h3>Shell</h3><div class="box rows" style="padding:0">
        ${row('enabled', 'Mist shell', 'Show the bar, wallpaper and dashboard edge.', sh.enabled)}
        ${row('bar', 'Sidebar', 'Vertical bar on the left with clock, window title and quick access.', sh.bar, !sh.enabled)}
        ${row('reserve', 'Reserve space for the bar', 'Maximized windows start to the right of the bar. Released when you quit.', sh.reserve, !sh.enabled || !sh.bar)}
        ${row('wallpaper', 'Mist wallpaper', 'Own wallpaper with a frame. Your Windows wallpaper stays unchanged.', sh.wallpaper, !sh.enabled)}
        ${row('frame', 'Rounded frame', 'On: wallpaper inset with rounded corners (like the video). Off: fullscreen, edge to edge.', sh.frame, !sh.enabled || !sh.wallpaper)}
        ${row('anim', 'Drifting mist', 'Mist slowly drifts across (very light load).', s.wallpaperAnimate, !sh.enabled || !sh.wallpaper)}
        ${row('hideIcons', 'Hide desktop icons', 'Only while Mist is running – the icons are kept.', sh.hideIcons, !sh.enabled || !sh.wallpaper)}
        <div class="setrow"><div class="tx"><b>Animations</b><small>Smooth transitions like in the video. Off = everything appears instantly.</small></div>${UI.toggle(s.motion !== false, 'data-x="motion"')}</div>
        ${row('hotEdge', 'Dashboard at the top edge', 'Move the mouse to the top-center of the screen to open the dashboard.', sh.hotEdge, !sh.enabled)}
        <div class="setrow"><div class="tx"><b>Wallpaper mode</b><small>“Behind icons” works like a live wallpaper. If the wallpaper doesn't appear, choose “Bottom layer”.</small></div>
          <div class="seg" id="wpmode"><button data-v="desktop" class="${sh.wallpaperMode === 'desktop' ? 'on' : ''}">Behind icons</button><button data-v="bottom" class="${sh.wallpaperMode === 'bottom' ? 'on' : ''}">Bottom layer</button></div></div>
      </div></div>
      <div class="sect"><h3>Replace the Windows shell</h3>
        <div class="note">${icon('info', 16)}<div>Mist can cover the Windows taskbar so only the Mist bar is visible. Nothing is deleted – the taskbar returns the moment you quit or turn the shell off.</div></div>
        <div class="box rows" style="padding:0">
        <div class="setrow"><div class="tx"><b>Windows taskbar</b><small>“Auto-hide” keeps it hidden until you move the mouse to the very bottom. “Hide” replaces it entirely with the Mist bar.</small></div>
          <div class="seg" id="tbmode"><button data-v="show" class="${sh.taskbar === 'show' ? 'on' : ''}">Show</button><button data-v="autohide" class="${sh.taskbar === 'autohide' ? 'on' : ''}">Auto-hide</button><button data-v="hidden" class="${sh.taskbar === 'hidden' ? 'on' : ''}">Hide</button></div></div>
        ${row('windows', 'Running windows in the bar', 'Open programs as buttons in the Mist bar – click to switch, middle-click to close.', sh.windows, !sh.enabled || !sh.bar)}
        </div></div>
      <div class="sect"><h3>Clock & weather</h3><div class="box rows" style="padding:0">
        <div class="setrow"><div class="tx"><b>24-hour format</b><small>Otherwise 12-hour with AM/PM like in the video.</small></div>${UI.toggle(s.clock24, 'data-x="clock24"')}</div>
        <div class="setrow"><div class="tx"><b>Weather location</b><small>Data from Open-Meteo (no account). Currently: ${UI.esc(s.geo ? s.geo.label : s.city || '–')}</small></div>
          <input class="input" id="city" value="${UI.esc(s.city || '')}" style="width:180px"><button class="btn" id="citysave">Save</button></div>
      </div></div>`;
    if (keepScroll) pg.scrollTop = sc;
    UI.$('#theme').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; UI.$$('#theme button').forEach(x => x.classList.toggle('on', x === b)); API.invoke('settings:set', { theme: b.dataset.v }); };
    UI.$('#wpmode').onclick = e => { const b = e.target.closest('[data-v]'); if (b) API.invoke('settings:set', { shell: { wallpaperMode: b.dataset.v } }); };
    UI.$('#tbmode').onclick = e => { const b = e.target.closest('[data-v]'); if (b) API.invoke('settings:set', { shell: { taskbar: b.dataset.v } }); };
    UI.$('#wps').onclick = async e => {
      const b = e.target.closest('[data-wp]'); if (!b) return;
      if (b.dataset.wp === 'custom') { await API.invoke('wallpaper:pick'); return; }
      API.invoke('settings:set', { wallpaper: b.dataset.wp });
    };
    pg.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => {
      if (b.disabled) return;
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      const k = b.dataset.sh;
      if (k === 'anim') API.invoke('settings:set', { wallpaperAnimate: on });
      else API.invoke('settings:set', { shell: { [k]: on } });
    });
    pg.querySelector('[data-x="motion"]').onclick = e => API.invoke('settings:set', { motion: !e.currentTarget.classList.contains('on') });
    pg.querySelector('[data-x="clock24"]').onclick = e => API.invoke('settings:set', { clock24: !e.currentTarget.classList.contains('on') });
    UI.$('#citysave').onclick = e => UI.busy(e.currentTarget, async () => {
      const r = await API.invoke('weather:city', UI.$('#city').value.trim());
      UI.toast(r && r.ok ? `Weather for ${r.geo.label}` : (r && r.error || 'Location not found'), r && r.ok ? 'ok' : 'err');
    });
  }

  // ======================= Reset & Safety =======================
  async function about() {
    const ai = await API.invoke('app:info');
    const ch = await API.invoke('opt:changes') || { tweaks: [], startup: [], power: false, total: 0 };
    const list = [
      ...ch.tweaks.map(t => ['settings', t]),
      ...(ch.power ? [['bolt', 'Power plan switched']] : []),
      ...(ch.taskbar ? [['list', 'Windows taskbar hidden']] : []),
      ...ch.startup.map(n => ['startup', `Startup: ${n}`])
    ];
    pg.innerHTML = `<h2>Reset & Safety</h2>
      <p class="lead">Mist changes no system files. The bar, wallpaper and dashboard disappear without a trace when you turn the shell off or quit. Optimizations stay until you reset them here – Mist remembers every original value for that.</p>
      ${ai.safeMode ? `<div class="note" style="background:var(--card)">${icon('shield', 16)}<div><b style="color:var(--text)">Safe mode</b><br>Mist closed unexpectedly twice and started without the shell. You can turn it back on under “Appearance”.<div class="acts"><button class="btn sm" id="safeok">Got it</button></div></div></div>` : ''}
      <div class="grid g2">
        <div class="box" style="display:flex;flex-direction:column">
          <b style="font-size:14px">Active changes to Windows</b>
          <div class="muted" style="margin:4px 0 12px">${ch.total ? `${ch.total} change${ch.total === 1 ? '' : 's'} – all reversible` : 'None – Windows is in its original state.'}</div>
          <div class="hist" style="flex:1">${list.length ? list.map(([ic, t]) => `<div class="h"><span class="qi">${icon(ic, 14)}</span><span>${UI.esc(t)}</span></div>`).join('') : `<div class="h"><span class="qi">${icon('check', 14)}</span><span class="muted">Nothing to do</span></div>`}</div>
          <div class="acts"><button class="btn primary" id="rv" ${ch.total ? '' : 'disabled'}>${icon('undo', 15)}Undo everything</button></div>
        </div>
        <div class="box rows" style="padding:0">
          <div class="setrow"><div class="tx"><b>Restore point</b><small>Create a Windows restore point before optimizing. Asks for administrator rights.</small></div><button class="btn" id="rp">${icon('shield', 14)}Create</button></div>
          <div class="setrow"><div class="tx"><b>Turn the shell off</b><small>Hides the bar & wallpaper instantly. Kill switch: <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>M</kbd></small></div>${UI.toggle(s.shell.enabled, 'id="shellt"')}</div>
          <div class="setrow"><div class="tx"><b>Repair desktop</b><small>Restarts Windows Explorer if the taskbar or desktop freezes.</small></div><button class="btn" id="rep">${icon('refresh', 14)}Restart</button></div>
          <div class="setrow"><div class="tx"><b>Reset Mist completely</b><small>Undo everything + Mist settings back to default + Mist autostart off.</small></div><button class="btn" id="full">${icon('undo', 14)}Reset</button></div>
          <div class="setrow"><div class="tx"><b>Reset everything & quit</b><small>The safest way to get rid of Mist. Then just delete the .exe.</small></div><button class="btn danger" id="fullq">${icon('power', 14)}Run</button></div>
        </div>
      </div>
      <div class="grid g2 sect">
        <div class="box"><b style="font-size:14px">Keyboard shortcuts</b><div class="keys" style="margin-top:14px">
          <span><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>D</kbd></span><span>Dashboard</span>
          <span><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Space</kbd></span><span>Launcher (apps & commands)</span>
          <span><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>O</kbd></span><span>Optimizer</span>
          <span><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>T</kbd></span><span>Terminal</span>
          <span><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>M</kbd></span><span>Toggle shell (kill switch)</span>
          <span>Mouse top-center</span><span>Open dashboard</span></div></div>
        <div class="box rows" style="padding:0">
          <div class="setrow"><div class="tx"><b>Start with Windows</b><small>Mist launches in the background after you sign in.</small></div>${UI.toggle(s.autostart, 'id="auto"')}</div>
          <div class="setrow"><div class="tx"><b>Quit Mist</b><small>The shell disappears, optimizations are kept.</small></div><button class="btn" id="quit">${icon('power', 14)}Quit</button></div>
          <div class="setrow"><div class="tx"><b>Version</b><small>Mist ${UI.esc(ai.version)} • “Rubik” font (SIL Open Font License)</small></div></div>
        </div>
      </div>
      <div class="sect"><h3>Diagnostics</h3><div class="box">
        <div class="kv" style="margin-bottom:14px"><b>Native features</b><span>${ai.native ? 'available' : 'unavailable'}</span><b>Wallpaper mode</b><span>${UI.esc(ai.attach || 'bottom layer')}</span></div>
        <div class="logbox" id="log">…</div>
        <div class="acts"><button class="btn sm" id="logopen">${icon('folder', 14)}Open log</button></div>
      </div></div>`;
    UI.$('#log').textContent = await API.invoke('log:get') || '(empty)';
    const sk = UI.$('#safeok'); if (sk) sk.onclick = async () => { await API.invoke('app:safeok'); about(); };
    UI.$('#auto').onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); API.invoke('settings:set', { autostart: on }); };
    UI.$('#shellt').onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); API.invoke('settings:set', { shell: { enabled: on } }); };
    UI.$('#rv').onclick = e => UI.busy(e.currentTarget, async () => {
      if (!await UI.confirm({ title: 'Undo everything?', text: 'All Windows settings changed by Mist, the power plan and startup entries are restored to their original values.', ok: 'Undo' })) return;
      await API.invoke('opt:revert'); UI.toast('Windows is back to its original state'); about();
    });
    UI.$('#rp').onclick = e => UI.busy(e.currentTarget, async () => {
      const r = await API.invoke('opt:restorepoint');
      UI.toast(r.ok ? 'Restore point created' : r.error, r.ok ? 'ok' : 'err', r.ok ? 3200 : 7000);
    });
    UI.$('#rep').onclick = e => UI.busy(e.currentTarget, async () => {
      if (!await UI.confirm({ title: 'Restart the desktop?', text: 'The taskbar and Explorer windows disappear briefly and restart. Open Explorer windows are closed.', ok: 'Restart' })) return;
      await API.invoke('opt:repair'); UI.toast('Explorer restarted');
    });
    UI.$('#full').onclick = e => UI.busy(e.currentTarget, async () => {
      if (!await UI.confirm({ title: 'Reset Mist completely?', text: 'All optimizations are undone and Mist returns to its default settings.', ok: 'Reset' })) return;
      await API.invoke('app:reset', false); UI.toast('Mist has been reset'); about();
    });
    UI.$('#fullq').onclick = e => UI.busy(e.currentTarget, async () => {
      if (!await UI.confirm({ title: 'Reset everything and quit?', text: 'Windows is restored to its original state, then Mist quits. You can simply delete the .exe afterwards.', ok: 'Reset & quit', danger: true })) return;
      await API.invoke('app:reset', true);
    });
    UI.$('#quit').onclick = () => API.invoke('app:quit');
    UI.$('#logopen').onclick = () => API.invoke('log:open');
  }

  const initial = (location.hash.split('?')[1] || '').replace('page=', '');
  page = null;
  go(PAGES.some(p => p[0] === initial) ? initial : 'overview');
  requestAnimationFrame(moveNav);
  document.fonts && document.fonts.ready.then(moveNav);
  setTimeout(moveNav, 400);
};
