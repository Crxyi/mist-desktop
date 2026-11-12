'use strict';
window.Views = window.Views || {};
Views.wallpaper = async function (root, settings) {
  let s = settings;
  let geo = await API.invoke('shell:geometry');
  const frame = UI.h('<div class="wp-frame"></div>');
  root.appendChild(frame);
  let lastKey = '';

  function layout() {
    const sh = s.shell;
    const gap = sh.frame ? 8 : 0;
    const left = geo.barWidth ? Math.max(geo.left, geo.barWidth) : geo.left + gap;
    frame.style.left = (left + (geo.barWidth && sh.frame ? 2 : 0)) + 'px';
    frame.style.top = (geo.top + gap) + 'px';
    frame.style.right = (geo.right + gap) + 'px';
    frame.style.bottom = (geo.bottom + gap) + 'px';
    frame.classList.toggle('framed', !!sh.frame);
  }

  function render() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const key = [s.wallpaper, s.wallpaperPath, s.wallpaperAnimate, dark].join('|');
    if (key === lastKey) return;
    lastKey = key;
    let html;
    if (s.wallpaper === 'custom' && s.wallpaperPath) {
      const url = 'file:///' + s.wallpaperPath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
      html = `<img alt="" src="${url}">`;
    } else {
      html = Scenes.render(s.wallpaper, dark, s.wallpaperAnimate);
    }
    const old = [...frame.children];
    const layer = UI.h(`<div class="layer">${html}</div>`);
    frame.appendChild(layer);
    old.forEach(o => { o.classList.add('old'); setTimeout(() => o.remove(), 1500); });
  }

  layout(); render();
  API.on('shell:geometry', g => { geo = g; layout(); });
  API.on('settings:changed', ns => { s = ns; setTimeout(() => { layout(); render(); }, 0); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(render, 0));
};
