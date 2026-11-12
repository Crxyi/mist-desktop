'use strict';
(function () {
  const UI = {};
  UI.$ = (sel, root = document) => root.querySelector(sel);
  UI.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  UI.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  UI.bytes = b => {
    if (!b || b < 1) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    return (b / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0) + ' ' + u[i];
  };
  UI.gb = b => (b / 1024 ** 3).toFixed(1);
  UI.pct = v => Math.round(v || 0) + '%';
  UI.uptime = sec => {
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m} min`;
  };
  UI.ago = t => {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString('en-US');
  };
  const pad = n => String(n).padStart(2, '0');
  UI.clock = (d = new Date(), h24 = true) => {
    let hh = d.getHours();
    const ampm = hh >= 12 ? 'PM' : 'AM';
    if (!h24) hh = hh % 12 || 12;
    return { h: pad(hh), m: pad(d.getMinutes()), ampm: h24 ? '' : ampm };
  };
  UI.dateLong = (d = new Date()) => {
    const wd = d.toLocaleDateString('en-US', { weekday: 'long' });
    const mo = d.toLocaleDateString('en-US', { month: 'short' });
    return `${wd} • ${mo} ${d.getDate()}`.toUpperCase();
  };
  UI.greeting = () => {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Good night';
  };

  UI.weather = (code, day = true) => {
    const map = [
      [[0], 'Clear', day ? 'sun' : 'moon'], [[1], 'Mostly clear', day ? 'cloudSun' : 'moonCloud'], [[2], 'Partly cloudy', day ? 'cloudSun' : 'moonCloud'],
      [[3], 'Overcast', 'cloud'], [[45, 48], 'Fog', 'fog'], [[51, 53, 55, 56, 57], 'Drizzle', 'rain'],
      [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', 'rain'], [[71, 73, 75, 77, 85, 86], 'Snow', 'snow'], [[95, 96, 99], 'Thunderstorm', 'storm']
    ];
    for (const [codes, text, ic] of map) if (codes.includes(code)) return { text, icon: ic };
    return { text: '—', icon: 'cloud' };
  };

  UI.spark = (vals, w, h, max = 100, fill = true) => {
    if (!vals.length) return '';
    const n = Math.max(vals.length, 2);
    const pts = vals.map((v, i) => [i / (n - 1) * w, h - Math.max(0, Math.min(1, v / max)) * (h - 2) - 1]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    const area = fill ? `${d} L${pts[pts.length - 1][0].toFixed(1)},${h} L0,${h} Z` : '';
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}">` +
      (fill ? `<path class="spark-area" d="${area}"/>` : '') + `<path class="spark-line" d="${d}"/></svg>`;
  };

  UI.ring = (pct, size = 64, stroke = 6, inner = '') => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg><div class="ring-in">${inner}</div></div>`;
  };

  UI.toast = (msg, kind = 'ok', ms = 3200) => {
    let host = UI.$('#toasts');
    if (!host) { host = UI.h('<div id="toasts"></div>'); document.body.appendChild(host); }
    const t = UI.h(`<div class="toast ${kind}">${icon(kind === 'err' ? 'info' : 'check', 16)}<span>${UI.esc(msg)}</span></div>`);
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  };

  UI.confirm = ({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) => new Promise(res => {
    const m = UI.h(`<div class="modal-back"><div class="modal">
      <h3>${UI.esc(title)}</h3><p>${UI.esc(text)}</p>
      <div class="modal-actions"><button class="btn ghost" data-a="0">${UI.esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="1">${UI.esc(ok)}</button></div>
    </div></div>`);
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('in'));
    const done = v => { m.classList.remove('in'); setTimeout(() => m.remove(), 200); document.removeEventListener('keydown', key); res(v); };
    const key = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    document.addEventListener('keydown', key);
    m.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) done(b.dataset.a === '1'); else if (e.target === m) done(false); });
    UI.$('[data-a="1"]', m).focus();
  });

  UI.busy = async (btn, fn) => {
    if (btn.classList.contains('busy')) return;
    btn.classList.add('busy'); btn.disabled = true;
    try { return await fn(); } finally { btn.classList.remove('busy'); btn.disabled = false; }
  };

  UI.applyTheme = s => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.motion = s.motion === false ? 'off' : 'on';
  };

  // ---- Motion helpers ----
  // Update a ring in place (the stroke glides to the new value)
  UI.ringSet = (host, pct, size, stroke, inner) => {
    if (!host) return;
    let fg = host.querySelector('.ring-fg');
    if (!fg) {
      host.innerHTML = UI.ring(0, size, stroke, inner);
      fg = host.querySelector('.ring-fg');
      void fg.getBoundingClientRect();
    }
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const off = (c * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(2);
    requestAnimationFrame(() => { fg.style.strokeDashoffset = off + 'px'; });
  };

  // Smoothly count a number up
  const ease = t => 1 - Math.pow(1 - t, 4);
  UI.count = (el, to, fmt = v => Math.round(v) + '%', ms = 700) => {
    if (!el) return;
    const from = el._v ?? 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (document.documentElement.dataset.motion === 'off') { el.innerHTML = fmt(to); return; }
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      el.innerHTML = fmt(from + (to - from) * ease(t));
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  };

  // Morph a sparkline path in place
  UI.sparkSet = (host, vals, w, h, max = 100) => {
    if (!host) return;
    const n = 50;
    const v = vals.length >= n ? vals.slice(-n) : Array(n - vals.length).fill(vals[0] ?? 0).concat(vals);
    const html = UI.spark(v, w, h, max);
    const line = host.querySelector('.spark-line');
    if (!line) { host.innerHTML = html; return; }
    const tmp = UI.h(html);
    line.style.d = `path("${tmp.querySelector('.spark-line').getAttribute('d')}")`;
    host.querySelector('.spark-area').style.d = `path("${tmp.querySelector('.spark-area').getAttribute('d')}")`;
  };

  // Reveal a container's children with a stagger on first fill
  UI.reveal = (box, force = false) => {
    if (!box || (box.dataset.revealed && !force)) return;
    box.dataset.revealed = '1';
    [...box.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));
    box.classList.remove('reveal'); void box.offsetWidth; box.classList.add('reveal');
    setTimeout(() => box.classList.remove('reveal'), 1200);
  };

  // Replay an element with an animation class
  UI.replay = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  UI.stagger = (els, start = 0) => els.forEach((e, i) => e.style.setProperty('--i', start + i));

  UI.toggle = (on, attrs = '') => `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" ${attrs}><span></span></button>`;

  window.UI = UI;
})();
