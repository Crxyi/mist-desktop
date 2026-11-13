'use strict';
// Bridge to the main process. Without Electron (e.g. browser preview) sample data is used.
(function () {
  if (window.mist) { window.API = window.mist; return; }

  const listeners = {};
  const emit = (ch, d) => (listeners[ch] || []).forEach(f => f(d));
  const GB = 1024 ** 3;
  let s = {
    theme: new URLSearchParams(location.search).get('theme') || 'light', wallpaper: 'torii', wallpaperPath: '', wallpaperAnimate: true,
    shell: { enabled: true, bar: true, reserve: true, wallpaper: true, wallpaperMode: 'desktop', frame: false, hideIcons: false, hotEdge: true, taskbar: 'hidden', windows: true },
    clock24: true, motion: true, city: 'Berlin', geo: { lat: 52.52, lon: 13.4, label: 'Berlin, DE' }, autostart: false, tweaksOriginal: { gamemode: [1] }, powerOriginal: null, taskbarOriginal: 40,
    history: [
      { t: Date.now() - 600000, text: 'Quick optimize: 1.2 GB storage, 640 MB RAM', kind: 'quick' },
      { t: Date.now() - 3600000, text: 'Game Mode: enabled', kind: 'tweak' },
      { t: Date.now() - 7200000, text: 'DNS cache flushed', kind: 'net' }
    ]
  };
  let cpu = 22, mem = 7.4;
  const stats = () => {
    cpu = Math.max(3, Math.min(96, cpu + (Math.random() - 0.5) * 18));
    mem = Math.max(5, Math.min(14, mem + (Math.random() - 0.5) * 0.3));
    return { t: Date.now(), cpu, memTotal: 16 * GB, memUsed: mem * GB, diskTotal: 953 * GB, diskUsed: 412 * GB, uptime: 25260 };
  };
  setInterval(() => emit('sys:stats', stats()), 1500);
  const winList = [
    { hwnd: 1, title: 'mist – Visual Studio Code', exe: 'code', active: true, min: false },
    { hwnd: 2, title: 'Discord', exe: 'discord', active: false, min: false },
    { hwnd: 3, title: 'Spotify Premium', exe: 'spotify', active: false, min: true },
    { hwnd: 4, title: 'Steam', exe: 'steam', active: false, min: false }
  ];
  setTimeout(() => emit('windows:list', winList), 300);
  const wait = (v, ms = 350) => new Promise(r => setTimeout(() => r(v), ms));
  const procs = ['chrome', 'Code', 'Discord', 'explorer', 'Spotify', 'steam', 'msedge', 'svchost', 'dwm', 'MsMpEng', 'Teams', 'OneDrive'].map((n, i) => ({
    name: n, ids: [1000 + i], count: i % 3 + 1, mem: (12 - i) * 180 * 1024 ** 2, cpu: Math.round(Math.random() * 120) / 10, title: '', protected: ['svchost', 'dwm', 'MsMpEng'].includes(n)
  }));
  const apps = ['Discord', 'Editor', 'Explorer', 'Firefox', 'GIMP', 'Microsoft Edge', 'Notepad++', 'OBS Studio', 'Paint', 'Rechner', 'Spotify', 'Steam', 'Terminal', 'Visual Studio Code', 'VLC media player', 'Word'].map(n => ({ name: n, id: n, icon: null }));

  const H = {
    'settings:get': () => s,
    'settings:set': p => { s = { ...s, ...p, shell: { ...s.shell, ...(p.shell || {}) } }; emit('settings:changed', s); return s; },
    'shell:geometry': () => ({ top: 0, right: 0, bottom: 0, left: 56, barWidth: 56 }),
    'sys:static': () => ({ os: 'Windows 11 Pro', kernel: '10.0.26100', arch: 'x64', host: 'DESKTOP-MIST', user: 'jonas', cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 16, memTotal: 16 * GB, gpu: 'NVIDIA GeForce RTX 4070', shell: 'PowerShell', admin: false, platform: 'win32', version: '1.0.0' }),
    'sys:stats': stats,
    'weather:get': () => ({ label: 'Berlin, DE', temp: 10.2, feels: 8.6, code: 0, day: false, humidity: 71, wind: 9, max: 13.4, min: 6.8 }),
    'weather:city': c => ({ ok: true, geo: { lat: 0, lon: 0, label: c } }),
    'apps:list': () => apps, 'apps:icon': () => null, 'apps:launch': () => true,
    'media:key': () => true, 'power:action': () => ({ ok: true }), 'win:open': () => true,
    'win:minimize': () => true, 'win:maximize': () => true, 'win:close': () => true, 'win:activate': () => true, 'win:closeExternal': () => true, 'popup:hidden': () => true,
    'wallpaper:pick': () => null, 'log:get': () => '[INFO] preview mode', 'log:open': () => true, 'app:quit': () => true,
    'app:info': () => ({ version: '1.0.0', native: true, attach: 'progman', platform: 'win32', safeMode: false }),
    'history:get': () => s.history,
    'opt:scan': () => wait([
      { id: 'usertemp', title: 'Temporary files (user)', desc: 'Contents of %TEMP%, older than 24 hours.', size: 1.84 * GB, count: 4210, def: true },
      { id: 'wintemp', title: 'Temporary files (Windows)', desc: 'C:\\Windows\\Temp, older than 24 hours. Asks for administrator rights.', size: 312 * 1024 ** 2, count: 220, def: true, needsAdmin: true },
      { id: 'crash', title: 'Crash reports & error logs', desc: 'Memory dumps and Windows Error Reports (WER).', size: 96 * 1024 ** 2, count: 12, def: true },
      { id: 'shader', title: 'Graphics shader cache', desc: 'DirectX/NVIDIA/AMD shaders. Rebuilt automatically.', size: 740 * 1024 ** 2, count: 1900, def: false },
      { id: 'browser', title: 'Browser cache', desc: 'Cache only – no passwords, cookies or history.', size: 1.1 * GB, count: 8800, def: false },
      { id: 'thumbs', title: 'Thumbnail cache', desc: 'Preview images in Explorer.', size: 210 * 1024 ** 2, count: 14, def: false },
      { id: 'recycle', title: 'Recycle Bin', desc: 'Permanently empties the Recycle Bin on all drives.', size: 2.3 * GB, count: 37, def: false }
    ], 900),
    'opt:clean': ids => wait({ results: ids.map(id => ({ id, title: id, freed: 300 * 1024 ** 2 })), total: ids.length * 300 * 1024 ** 2 }, 1200),
    'opt:ram': () => wait({ freed: 640 * 1024 ** 2, processes: 182, total: 240, supported: true }, 900),
    'opt:dns': () => wait({ ok: true }),
    'opt:quick': () => wait({ steps: [], total: 1.2 * GB, ram: 640 * 1024 ** 2 }, 1600),
    'opt:power:list': () => wait({ plans: [{ guid: 'a', name: 'Balanced', active: true }, { guid: 'b', name: 'High performance', active: false }, { guid: 'c', name: 'Power saver', active: false }], overlay: '00000000-0000-0000-0000-000000000000', overlays: [{ id: '961cc777-2547-4f9d-8174-7d86181b8a7a', name: 'Energy efficiency' }, { id: '00000000-0000-0000-0000-000000000000', name: 'Balanced' }, { id: 'ded574b5-45a0-4f42-8737-46345c09c238', name: 'Best performance' }], original: null }),
    'opt:power:set': () => wait({ ok: true }), 'opt:power:enable': () => wait({ ok: true }), 'opt:power:restore': () => wait({ ok: true }), 'opt:power:overlay': () => wait({ ok: true }),
    'opt:tweaks:get': () => wait([
      { id: 'gamemode', title: 'Game Mode', desc: 'Windows prioritizes games and holds back updates and background tasks while you play.', on: true, saved: true, supported: true },
      { id: 'gamedvr', title: 'Background recording off', desc: 'Disables Xbox Game Bar background recording, which can cost FPS in games.', on: false, supported: true },
      { id: 'animations', title: 'Reduce animations', desc: 'Turns off window, menu and list animations. Windows respond instantly.', on: false, supported: true },
      { id: 'transparency', title: 'Transparency off', desc: 'Disables transparency effects in the taskbar and Start menu.', on: false, supported: true },
      { id: 'mouse', title: 'Mouse acceleration off', desc: 'Disable “Enhance pointer precision” – more consistent aim in games.', on: false, supported: true },
      { id: 'startupdelay', title: 'Remove startup delay', desc: 'Windows waits a few seconds after sign-in before launching startup programs.', on: false, supported: true },
      { id: 'menudelay', title: 'Open menus faster', desc: 'Shortens the submenu delay from 400 to 100 ms.', on: false, relogin: true, supported: true },
      { id: 'tips', title: 'Windows tips & suggestions off', desc: 'No more tips, suggestions and “welcome” screens after updates.', on: false, supported: true }
    ]),
    'opt:tweaks:set': () => wait({ ok: true }), 'opt:revert': () => wait({ ok: true }),
    'opt:changes': () => wait({ tweaks: ['Spielmodus'], power: false, startup: ['OneDrive'], taskbar: true, total: 3 }),
    'opt:restorepoint': () => wait({ ok: true }, 1500), 'opt:repair': () => wait({ ok: true }), 'app:reset': () => wait({ ok: true }), 'app:safeok': () => true,
    'opt:startup:list': () => wait([
      { id: '1', name: 'Discord', command: '"C:\\Users\\jonas\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe', scope: 'User', enabled: true },
      { id: '2', name: 'Steam', command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', scope: 'User', enabled: true },
      { id: '3', name: 'OneDrive', command: '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', scope: 'User', enabled: false },
      { id: '4', name: 'SecurityHealth', command: '%windir%\\system32\\SecurityHealthSystray.exe', scope: 'System', admin: true, enabled: true },
      { id: '5', name: 'Spotify', command: 'C:\\Users\\jonas\\AppData\\Roaming\\Spotify\\Spotify.exe --autostart --minimized', scope: 'User', enabled: true }
    ]),
    'opt:startup:set': () => wait({ ok: true }),
    'opt:proc:list': () => wait(procs, 800), 'opt:proc:kill': () => wait({ ok: true }),
    'term:exec': (id, cmd) => { setTimeout(() => { emit('term:event', { id, type: 'data', text: `Preview: "${cmd}" only runs inside the app.\n` }); emit('term:event', { id, type: 'exit', code: 0, cwd: 'C:\\Users\\jonas' }); }, 200); return true; },
    'term:kill': () => true, 'term:cwd': () => 'C:\\Users\\jonas'
  };
  window.API = {
    platform: 'preview',
    preview: true,
    invoke: (ch, ...a) => Promise.resolve(H[ch] ? H[ch](...a) : null),
    on: (ch, cb) => { (listeners[ch] = listeners[ch] || []).push(cb); return () => { listeners[ch] = listeners[ch].filter(f => f !== cb); }; }
  };
})();
