'use strict';
window.Views = window.Views || {};
Views.dashboard = async function (root, settings) {
  let s = settings;
  const info = await API.invoke('sys:static');
  const hist = { cpu: [], mem: [] };
  let last = null;
  let tab = 'home';

  const el = UI.h(`<div class="dash pop">
    <div class="tabs"><span class="ind"></span>
      <button data-tab="home" class="on">${icon('dashboard', 15)}Overview</button>
      <button data-tab="perf">${icon('gauge', 15)}Performance</button>
    </div>
    <div class="dash-body" id="body"></div>
  </div>`);
  root.appendChild(el);
  const body = UI.$('#body', el);
  const ind = UI.$('.tabs .ind', el);
  function moveInd() {
    const b = UI.$(`[data-tab="${tab}"]`, el);
    if (!b || !b.offsetWidth) return;
    ind.style.width = b.offsetWidth + 'px';
    ind.style.transform = `translateX(${b.offsetLeft}px)`;
  }

  // ---- Overview ----
  function home() {
    body.innerHTML = `<div class="dgrid">
      <div class="dcol">
        <div class="dcard weather" id="weather"><div class="skeleton" style="width:60%"></div></div>
        <div class="dcard fetch">
          <div class="head"><span class="ico">${icon('logo', 14)}</span>mistfetch</div>
          <div class="row"><b>OS</b><span>${UI.esc(info.os)}</span></div>
          <div class="row"><b>USER</b><span>${UI.esc(info.user)}</span></div>
          <div class="row"><b>UP</b><span id="up">–</span></div>
          <div class="swatches"><i style="background:#8b8b93"></i><i style="background:#4a6fa5"></i><i style="background:#4f8a8b"></i><i style="background:#5b7f5b"></i><i style="background:#6a9a8e"></i><i style="background:var(--accent)"></i></div>
        </div>
        <div class="dcard media">
          <div class="t">Media</div>
          <div class="s">Controls whatever is playing</div>
          <div class="ctl">
            <button data-media="prev" title="Previous">${icon('prev', 15)}</button>
            <button data-media="playpause" class="main" title="Play/Pause">${icon('playpause', 15)}</button>
            <button data-media="next" title="Next">${icon('next', 15)}</button>
          </div>
        </div>
      </div>
      <div class="dcard center">
        <div class="bigclock" id="bigclock"></div>
        <div class="datestr" id="date"></div>
        <div class="hex">${icon('user', 38)}</div>
        <div class="hello">${UI.greeting()}, <b>${UI.esc(info.user)}</b></div>
      </div>
      <div class="dcol">
        <div class="dcard rings" id="rings">${['CPU', 'RAM', 'SSD'].map(l => `<div class="r"><div class="rh" data-r="${l}"></div>${l}</div>`).join('')}</div>
        <div class="dcard qa">
          <h4>Quick actions</h4>
          ${qa('quick', 'rocket', 'Quick optimize', 'Temp, RAM & DNS in one step')}
          ${qa('ram', 'memory', 'Free up memory', 'Reclaim unused RAM')}
          ${qa('temp', 'broom', 'Clear temporary files', 'Older than 24 hours')}
          ${qa('panel', 'bolt', 'Open optimizer', 'All tools & settings')}
        </div>
      </div>
    </div>`;
    prevClock = {};
    clockTick();
    loadWeather();
    UI.stagger(UI.$$('.dcard', body));
    if (last) stats(last);
  }
  const qa = (id, ic, t, sub) => `<button class="qa-item" data-qa="${id}"><span class="qi">${icon(ic, 15)}</span><span class="tx"><b>${t}</b><small data-sub>${sub}</small></span></button>`;

  async function loadWeather(force) {
    const box = UI.$('#weather', el);
    if (!box) return;
    const w = await API.invoke('weather:get', force);
    if (!w || w.error) {
      box.innerHTML = `<div class="cond">WEATHER</div><div class="sub" style="margin-top:8px">${UI.esc(w && w.error || 'Unavailable')}</div>`;
      return;
    }
    const wi = UI.weather(w.code, w.day);
    box.innerHTML = `<div class="cond">${wi.text.toUpperCase()}</div>
      <div class="tline"><span class="temp">${Math.round(w.temp)}°C</span>${icon(wi.icon, 30)}</div>
      <div class="sub">Feels like ${Math.round(w.feels)}°C<br>High ${Math.round(w.max)}°C • Low ${Math.round(w.min)}°C</div>
      <div class="sub" style="margin-top:4px;color:var(--faint)">${UI.esc(w.label || '')}</div>`;
  }

  let prevClock = {};
  function clockTick() {
    const bc = UI.$('#bigclock', el);
    if (!bc) return;
    const now = new Date();
    const c = UI.clock(now, s.clock24);
    const sec = String(now.getSeconds()).padStart(2, '0');
    if (!bc.firstChild || prevClock.ap !== c.ampm) {
      bc.innerHTML = `<span class="hh"></span><span class="side"><span class="mm"></span>${c.ampm ? '<span class="ap"></span>' : '<span class="sec"></span>'}</span>`;
      prevClock = { ap: c.ampm };
    }
    const set = (cls, val, anim) => {
      const e = UI.$('.' + cls, bc);
      if (!e || prevClock[cls] === val) return;
      e.innerHTML = `<span>${val}</span>`;
      UI.replay(e.firstChild, anim);
      prevClock[cls] = val;
    };
    set('hh', c.h, 'roll'); set('mm', c.m, 'roll');
    if (c.ampm) set('ap', c.ampm, 'roll'); else set('sec', sec, 'tick');
    prevClock.ap = c.ampm;
    UI.$('#date', el).textContent = UI.dateLong(now);
  }

  // ---- Performance ----
  let procTimer = null;
  function perf() {
    body.innerHTML = `<div class="perf">
      <div class="dcard big"><div class="lbl">${icon('cpu', 15)}Processor</div><div class="val" id="pcpu">–</div><div class="graph" id="gcpu"></div><div class="meta">${UI.esc(info.cpu)} • ${info.cores} threads</div></div>
      <div class="dcard big"><div class="lbl">${icon('memory', 15)}Memory</div><div class="val" id="pmem">–</div><div class="graph" id="gmem"></div><div class="meta" id="pmemm">–</div></div>
      <div class="dcol">
        <div class="dcard" style="display:flex;align-items:center;gap:14px" id="pdisk"></div>
        <div class="dcard" style="flex:1;min-height:0;overflow:hidden"><h4>Top processes (RAM)</h4><div class="plist" id="plist"><div class="skeleton"></div></div></div>
      </div>
    </div>`;
    UI.stagger(UI.$$('.dcard', body));
    if (last) stats(last);
    loadProcs();
    clearInterval(procTimer);
    procTimer = setInterval(() => { if (tab === 'perf' && pop.isOpen()) loadProcs(); }, 6000);
  }
  async function loadProcs() {
    const list = await API.invoke('opt:proc:list');
    const box = UI.$('#plist', el);
    if (!box) return;
    if (!list || !list.length) { box.innerHTML = '<div class="muted" style="padding:6px 4px">Windows only</div>'; return; }
    box.innerHTML = list.slice(0, 6).map(p => `<div class="p"><span>${UI.esc(p.name)}${p.count > 1 ? ` <em>×${p.count}</em>` : ''}</span><em>${UI.bytes(p.mem)}</em></div>`).join('');
  }

  // ---- Live values ----
  function stats(st) {
    last = st;
    const memPct = st.memUsed / st.memTotal * 100, diskPct = st.diskUsed / st.diskTotal * 100;
    const up = UI.$('#up', el); if (up) up.textContent = UI.uptime(st.uptime);
    [['CPU', st.cpu], ['RAM', memPct], ['SSD', diskPct]].forEach(([l, v]) => {
      const host = UI.$(`[data-r="${l}"]`, el);
      if (!host) return;
      UI.ringSet(host, v, 62, 6, '<b class="rv">0%</b>');
      UI.count(UI.$('.rv', host), v);
    });
    const pc = UI.$('#pcpu', el);
    if (pc) {
      UI.count(pc, st.cpu);
      UI.sparkSet(UI.$('#gcpu', el), hist.cpu, 300, 150);
      UI.count(UI.$('#pmem', el), memPct);
      UI.sparkSet(UI.$('#gmem', el), hist.mem, 300, 150);
      UI.$('#pmemm', el).textContent = `${UI.gb(st.memUsed)} of ${UI.gb(st.memTotal)} GB used`;
      const pd = UI.$('#pdisk', el);
      if (!pd.firstChild) pd.innerHTML = `<div class="dr"></div><div><b>System drive</b><div class="muted" style="margin-top:3px" id="pdfree"></div></div>`;
      UI.ringSet(UI.$('.dr', pd), diskPct, 58, 6, '<b class="rv">0%</b>');
      UI.count(UI.$('.rv', pd), diskPct);
      UI.$('#pdfree', el).textContent = `${UI.bytes(st.diskTotal - st.diskUsed)} free of ${UI.bytes(st.diskTotal)}`;
    }
  }
  API.on('sys:stats', st => {
    hist.cpu.push(st.cpu); hist.mem.push(st.memUsed / st.memTotal * 100);
    if (hist.cpu.length > 60) { hist.cpu.shift(); hist.mem.shift(); }
    if (pop.isOpen()) stats(st);
  });

  // ---- Interaction ----
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) {
      if (t.dataset.tab === tab) return;
      tab = t.dataset.tab;
      UI.$$('[data-tab]', el).forEach(b => b.classList.toggle('on', b === t));
      moveInd();
      body.style.setProperty('--dx', tab === 'perf' ? '22px' : '-22px');
      tab === 'home' ? home() : perf();
      UI.replay(body, 'swap');
      setTimeout(() => body.classList.remove('swap'), 900);
      return;
    }
    const m = e.target.closest('[data-media]');
    if (m) return API.invoke('media:key', m.dataset.media);
    const q = e.target.closest('[data-qa]');
    if (q && !q.classList.contains('busy')) {
      const sub = UI.$('[data-sub]', q);
      const id = q.dataset.qa;
      if (id === 'panel') { pop.hide(); return API.invoke('win:open', 'panel'); }
      q.classList.remove('done'); q.classList.add('busy'); sub.textContent = 'Running …';
      try {
        if (id === 'ram') { const r = await API.invoke('opt:ram'); sub.textContent = `${UI.bytes(r.freed)} freed`; }
        if (id === 'temp') { const r = await API.invoke('opt:clean', ['usertemp']); sub.textContent = `${UI.bytes(r.total)} deleted`; }
        if (id === 'quick') { const r = await API.invoke('opt:quick'); sub.textContent = `${UI.bytes(r.total)} storage • ${UI.bytes(r.ram)} RAM`; }
        q.classList.add('done');
      } catch { sub.textContent = 'Failed'; }
      q.classList.remove('busy');
    }
  });

  const pop = Popup(el, {
    autoLeave: true,
    onShow: () => { body.classList.remove('swap'); tab === 'home' ? home() : perf(); requestAnimationFrame(moveInd); }
  });
  API.on('settings:changed', ns => { s = ns; });
  setInterval(() => { if (pop.isOpen()) clockTick(); }, 1000);
  home();
  requestAnimationFrame(moveInd);
  setTimeout(moveInd, 300);
};
