'use strict';
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, nativeTheme, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const settings = require('./settings');
const log = require('./log');
const native = require('./native');
const system = require('./system');
const opt = require('./optimizer');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const isWin = process.platform === 'win32';
const ROOT = path.join(__dirname, '..');
const BAR_W = 56;
const APPBAR_MSG = 0x0477;
const POPUPS = {
  dashboard: { width: 980, height: 480, place: 'top' },
  launcher: { width: 640, height: 500, place: 'center' },
  power: { width: 236, height: 316, place: 'barBottom' }
};

app.setAppUserModelId('app.mist.desktop');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const wins = {};
let tray = null;
let quitting = false;
let geometry = { top: 0, right: 0, bottom: 0, left: BAR_W, barWidth: BAR_W };

const alive = n => wins[n] && !wins[n].isDestroyed();
const primary = () => screen.getPrimaryDisplay();

function themeBg() {
  const t = settings.get().theme;
  return t === 'dark' || (t === 'system' && nativeTheme.shouldUseDarkColors) ? '#19191b' : '#f7f6f4';
}

function broadcast(ch, data) {
  for (const w of Object.values(wins)) {
    try { if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(ch, data); } catch {}
  }
}

function makeWindow(name, opts) {
  const w = new BrowserWindow({
    show: false,
    frame: false,
    backgroundColor: themeBg(),
    title: 'Mist',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    ...opts,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: name !== 'wallpaper' && name !== 'bar'
    }
  });
  w.loadFile(path.join(ROOT, 'renderer', 'index.html'), { hash: name });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', e => e.preventDefault());
  w.on('closed', () => { if (wins[name] === w) delete wins[name]; });
  wins[name] = w;
  return w;
}

function computeGeometry() {
  const { bounds: b, workArea: wa } = primary();
  const s = settings.get().shell;
  const barWidth = s.enabled && s.bar ? BAR_W : 0;
  geometry = {
    top: wa.y - b.y,
    right: b.x + b.width - (wa.x + wa.width),
    bottom: b.y + b.height - (wa.y + wa.height),
    left: Math.max(wa.x - b.x, barWidth),
    barWidth
  };
  broadcast('shell:geometry', geometry);
}

function createWallpaper() {
  if (alive('wallpaper')) return;
  const { bounds } = primary();
  const w = makeWindow('wallpaper', {
    ...bounds, skipTaskbar: true, focusable: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, hasShadow: false, enableLargerThanScreen: true
  });
  w.once('ready-to-show', () => {
    if (isWin) {
      const h = native.hwndOf(w);
      const attached = settings.get().shell.wallpaperMode === 'desktop' && native.attachToDesktop(h);
      w.showInactive();
      if (!attached) {
        native.sendToBottom(h);
        const keep = setInterval(() => (w.isDestroyed() ? clearInterval(keep) : native.sendToBottom(h)), 4000);
      }
      if (settings.get().shell.hideIcons) native.setDesktopIconsVisible(false);
    } else {
      w.showInactive();
    }
  });
  w.on('closed', () => {
    const s = settings.get().shell;
    if (!quitting && s.enabled && s.wallpaper) setTimeout(createWallpaper, 2500);
  });
}

function destroyWallpaper() {
  if (!alive('wallpaper')) return;
  const w = wins.wallpaper;
  delete wins.wallpaper;
  w.removeAllListeners('closed');
  w.destroy();
  if (isWin) setTimeout(native.refreshDesktop, 300);
}

let lastBarArea = '';
let lastWindows = '';
let barTimer = null;
let barBusy = false;   // ignore the work-area echo our own AppBar update triggers
function placeBar(force = false) {
  if (!alive('bar') || barBusy) return;
  const w = wins.bar;
  const { bounds: b, workArea: wa, scaleFactor: sf } = primary();
  if (isWin && settings.get().shell.reserve) {
    const area = { left: Math.round(b.x * sf), top: Math.round(wa.y * sf), bottom: Math.round((wa.y + wa.height) * sf) };
    const key = JSON.stringify([area, sf]);
    if (!force && key === lastBarArea) return;   // nothing changed -> never re-reserve (prevents the feedback loop)
    lastBarArea = key;
    barBusy = true;
    const ok = native.appbarSet(native.hwndOf(w), Math.round(BAR_W * sf), area, APPBAR_MSG);
    if (!ok) w.setBounds({ x: b.x, y: wa.y, width: BAR_W, height: wa.height });
    setTimeout(() => { barBusy = false; }, 500);  // swallow the ABN_POSCHANGED echo
  } else {
    w.setBounds({ x: b.x, y: wa.y, width: BAR_W, height: wa.height });
  }
  setTimeout(computeGeometry, 400);
}

function createBar() {
  if (alive('bar')) return;
  const { bounds, workArea } = primary();
  const w = makeWindow('bar', {
    x: bounds.x, y: workArea.y, width: BAR_W, height: workArea.height, skipTaskbar: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: isWin, focusable: !isWin, hasShadow: false
  });
  if (isWin) {
    w.setAlwaysOnTop(true, 'pop-up-menu');
    w.hookWindowMessage(APPBAR_MSG, (wParam, lParam) => {
      const code = wParam.readUInt32LE(0);
      if (code === 1) { clearTimeout(barTimer); barTimer = setTimeout(() => placeBar(), 300); }
      if (code === 2) setFullscreen(lParam.readUInt32LE(0) !== 0);
    });
    const taskbarCreated = native.registerMessage('TaskbarCreated');
    if (taskbarCreated) w.hookWindowMessage(taskbarCreated, () => setTimeout(rebuildShell, 1500));
  }
  w.once('ready-to-show', () => { w.showInactive(); placeBar(true); lastWindows = ''; });
}

function destroyBar() {
  if (!alive('bar')) return;
  if (isWin) native.appbarRemove(native.hwndOf(wins.bar));
  wins.bar.destroy();
  lastBarArea = '';
  setTimeout(computeGeometry, 400);
}

function setFullscreen(on) {
  for (const n of ['bar', 'hotedge']) if (alive(n)) on ? wins[n].hide() : wins[n].showInactive();
}

function createHotEdge() {
  if (alive('hotedge')) return;
  const { bounds } = primary();
  const w = makeWindow('hotedge', {
    x: Math.round(bounds.x + bounds.width / 2 - 210), y: bounds.y, width: 420, height: 4, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, resizable: false, movable: false, focusable: false, alwaysOnTop: true, hasShadow: false
  });
  w.setAlwaysOnTop(true, 'pop-up-menu');
  w.once('ready-to-show', () => w.showInactive());
}

function popupBounds(name) {
  const { width, height, place } = POPUPS[name];
  const { bounds: b, workArea: wa } = primary();
  const center = b.x + geometry.left + (b.width - geometry.left - geometry.right) / 2;
  if (place === 'top') return { x: Math.round(center - width / 2), y: b.y, width, height };
  if (place === 'center') return { x: Math.round(center - width / 2), y: Math.round(wa.y + wa.height * 0.18), width, height };
  return { x: b.x + (alive('bar') ? BAR_W : 0) + 4, y: wa.y + wa.height - height - 8, width, height };
}

function ensurePopup(name) {
  if (alive(name)) return wins[name];
  const w = makeWindow(name, {
    ...popupBounds(name), transparent: true, backgroundColor: '#00000000', skipTaskbar: true, resizable: false,
    movable: false, minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, hasShadow: false
  });
  w.setAlwaysOnTop(true, 'pop-up-menu');
  w.on('blur', () => { if (w.isVisible()) w.webContents.send('popup:hide'); });
  return w;
}

function showPopup(name) {
  const w = ensurePopup(name);
  for (const n of Object.keys(POPUPS)) if (n !== name && alive(n) && wins[n].isVisible()) wins[n].hide();
  w.setBounds(popupBounds(name));
  const go = () => { w.show(); w.focus(); w.webContents.send('popup:show'); };
  w.webContents.isLoading() ? w.webContents.once('did-finish-load', go) : go();
}

function togglePopup(name) {
  if (alive(name) && wins[name].isVisible()) wins[name].webContents.send('popup:hide');
  else showPopup(name);
}

function focusOrCreate(name, opts, after) {
  if (alive(name)) {
    const w = wins[name];
    if (w.isMinimized()) w.restore();
    w.show(); w.focus();
    after && after(w);
    return;
  }
  const w = makeWindow(name, { center: true, thickFrame: true, ...opts });
  w.once('ready-to-show', () => { w.show(); after && after(w); });
}

const openPanel = page => focusOrCreate('panel', { width: 1160, height: 760, minWidth: 940, minHeight: 620 }, w => page && w.webContents.send('panel:page', page));
const openTerminal = () => focusOrCreate('terminal', { width: 900, height: 560, minWidth: 520, minHeight: 320 });

function openWindow(name, arg) {
  if (name === 'panel') return openPanel(arg);
  if (name === 'terminal') return openTerminal();
  if (POPUPS[name]) return arg === 'show' ? showPopup(name) : togglePopup(name);
}

function applyTaskbar() {
  if (!isWin) return;
  const s = settings.get();
  const mode = s.shell.enabled ? s.shell.taskbar : 'show';
  if (mode === 'show') return restoreTaskbar();
  let orig = s.taskbarOriginal;
  if (orig == null) {
    orig = native.taskbarGet();
    if (orig == null) return;
    settings.set({ taskbarOriginal: orig });
  }
  native.taskbarSet((orig & 2) | 1, mode !== 'hidden');
}

function restoreTaskbar() {
  if (!isWin) return;
  const orig = settings.get().taskbarOriginal;
  native.taskbarSet(orig, true);
  if (orig != null) settings.set({ taskbarOriginal: null });
}

function applyShell() {
  const s = settings.get().shell;
  applyTaskbar();
  s.enabled && s.bar ? createBar() : destroyBar();
  s.enabled && s.wallpaper ? createWallpaper() : destroyWallpaper();
  if (s.enabled && s.hotEdge) createHotEdge(); else if (alive('hotedge')) wins.hotedge.destroy();
  if (isWin) native.setDesktopIconsVisible(!(s.enabled && s.wallpaper && s.hideIcons));
  computeGeometry();
}

let rebuildTimer = null;
const rebuilds = [];
function rebuildShell() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    if (quitting) return;
    const now = Date.now();
    while (rebuilds.length && now - rebuilds[0] > 30000) rebuilds.shift();
    if (rebuilds.length >= 3) return log.warn('rebuild skipped');
    rebuilds.push(now);
    log.info('rebuild shell');
    destroyBar();
    destroyWallpaper();
    for (const n of ['hotedge', ...Object.keys(POPUPS)]) if (alive(n)) wins[n].destroy();
    setTimeout(applyShell, 300);
  }, 500);
}

let displayKey = '';
let geomTimer = null;
function onDisplayChange() {
  const d = primary();
  // Only a real display change (resolution, DPI, monitor add/remove) rebuilds the shell.
  // A work-area-only change (our own AppBar, the taskbar auto-hiding) just re-reads geometry,
  // debounced so a burst of events can't churn the layout.
  const key = JSON.stringify([d.id, d.bounds, d.scaleFactor, d.rotation, screen.getAllDisplays().length]);
  if (key === displayKey) { clearTimeout(geomTimer); geomTimer = setTimeout(computeGeometry, 250); return; }
  displayKey = key;
  rebuildShell();
}

function applyAutostart(on) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!on, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--autostart'] });
  } catch (e) { log.warn('autostart', e.message); }
}

function updateSettings(patch) {
  const old = { ...settings.get().shell };
  const s = settings.set(patch);
  if (patch.city !== undefined) settings.set({ geo: null });
  if (patch.autostart !== undefined) applyAutostart(patch.autostart);
  broadcast('settings:changed', s);
  refreshTray();
  if (JSON.stringify(old) !== JSON.stringify(s.shell)) {
    if (s.shell.wallpaperMode !== old.wallpaperMode) destroyWallpaper();
    if (s.shell.reserve !== old.reserve) destroyBar();
    applyShell();
  }
  return settings.get();
}

const toggleShell = () => updateSettings({ shell: { enabled: !settings.get().shell.enabled } });

async function resetEverything(quit) {
  log.info('reset everything');
  const r = await opt.revertAll();
  restoreTaskbar();
  applyAutostart(false);
  settings.reset();
  if (isWin) native.setDesktopIconsVisible(true);
  settings.addHistory('Mist fully reset', 'tweak');
  broadcast('settings:changed', settings.get());
  refreshTray();
  rebuildShell();
  if (quit) setTimeout(() => app.quit(), 600);
  return { ok: true, done: r.done };
}

async function confirmReset() {
  const r = await dialog.showMessageBox({
    type: 'question', buttons: ['Reset and quit', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Mist',
    message: 'Reset everything?', detail: 'All Windows settings changed by Mist, the power plan and startup entries are restored. Then Mist quits.'
  });
  if (r.response === 0) resetEverything(true);
}

function refreshTray() {
  if (!tray) return;
  const s = settings.get();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Dashboard', accelerator: 'Ctrl+Alt+D', click: () => showPopup('dashboard') },
    { label: 'Launcher', accelerator: 'Ctrl+Alt+Space', click: () => showPopup('launcher') },
    { label: 'Optimizer', accelerator: 'Ctrl+Alt+O', click: () => openPanel() },
    { label: 'Terminal', accelerator: 'Ctrl+Alt+T', click: openTerminal },
    { type: 'separator' },
    { label: 'Shell enabled', type: 'checkbox', accelerator: 'Ctrl+Alt+Shift+M', checked: s.shell.enabled, click: toggleShell },
    { label: 'Settings', click: () => openPanel('appearance') },
    { type: 'separator' },
    { label: 'Reset & Safety …', click: () => openPanel('about') },
    { label: 'Undo everything and quit', click: confirmReset },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')));
  tray.setToolTip('Mist');
  tray.on('click', () => openPanel());
  refreshTray();
}

function registerShortcuts() {
  const keys = {
    'Control+Alt+Shift+M': toggleShell,
    'Control+Alt+D': () => togglePopup('dashboard'),
    'Control+Alt+Space': () => togglePopup('launcher'),
    'Control+Alt+O': () => openPanel(),
    'Control+Alt+T': openTerminal
  };
  for (const [k, fn] of Object.entries(keys)) {
    try { if (!globalShortcut.register(k, fn)) log.warn('shortcut busy', k); } catch (e) { log.warn('shortcut', k, e.message); }
  }
}

function handle(ch, fn, withEvent = false) {
  ipcMain.handle(ch, async (e, ...args) => {
    try { return await (withEvent ? fn(e, ...args) : fn(...args)); } catch (err) { log.error(ch, err); return { ok: false, error: err.message }; }
  });
}

function registerIpc() {
  const sender = e => BrowserWindow.fromWebContents(e.sender);
  handle('settings:get', () => settings.get());
  handle('settings:set', updateSettings);
  handle('shell:geometry', () => geometry);
  handle('sys:static', system.staticInfo);
  handle('sys:stats', system.stats);
  handle('weather:get', force => system.weather(settings.get(), force));
  handle('weather:city', async city => {
    const geo = await system.geocode(city);
    if (!geo) return { ok: false, error: 'Ort nicht gefunden' };
    broadcast('settings:changed', settings.set({ city, geo }));
    return { ok: true, geo };
  });
  handle('apps:list', system.appsList);
  handle('apps:icon', system.appIcon);
  handle('apps:launch', system.launchApp);
  handle('media:key', native.mediaKey);
  handle('power:action', system.powerAction);
  handle('win:open', openWindow);
  handle('win:minimize', e => sender(e)?.minimize(), true);
  handle('win:maximize', e => { const w = sender(e); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); }, true);
  handle('win:close', e => sender(e)?.close(), true);
  handle('win:activate', native.activateWindow);
  handle('win:closeExternal', native.closeWindow);
  handle('popup:hidden', e => { const w = sender(e); if (w?.isVisible()) w.hide(); }, true);
  handle('wallpaper:pick', async () => {
    const r = await dialog.showOpenDialog(alive('panel') ? wins.panel : undefined, {
      title: 'Choose wallpaper', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    });
    return r.canceled || !r.filePaths[0] ? null : updateSettings({ wallpaper: 'custom', wallpaperPath: r.filePaths[0] });
  });
  handle('log:get', () => log.tail());
  handle('log:open', () => shell.showItemInFolder(log.file()));
  handle('app:quit', () => app.quit());
  handle('app:info', () => ({ version: app.getVersion(), native: native.available(), attach: native.attachMode(), safeMode: settings.get().safeMode }));
  handle('app:safeok', () => !!settings.set({ safeMode: false }));
  handle('app:reset', quit => resetEverything(quit === true));
  handle('history:get', () => settings.get().history);
  handle('opt:scan', opt.scan);
  handle('opt:clean', ids => opt.clean(ids));
  handle('opt:ram', opt.trimRam);
  handle('opt:dns', opt.flushDns);
  handle('opt:quick', opt.quick);
  handle('opt:power:list', opt.powerList);
  handle('opt:power:set', g => opt.powerSet(g));
  handle('opt:power:enable', k => opt.powerEnable(k));
  handle('opt:power:restore', opt.powerRestore);
  handle('opt:power:overlay', g => opt.overlaySet(g));
  handle('opt:tweaks:get', opt.tweaksGet);
  handle('opt:tweaks:set', (id, on) => opt.tweakSet(id, on));
  handle('opt:revert', opt.revertAll);
  handle('opt:changes', opt.changes);
  handle('opt:restorepoint', opt.restorePoint);
  handle('opt:repair', async () => { const r = await opt.repairDesktop(); setTimeout(rebuildShell, 3000); return r; });
  handle('opt:startup:list', opt.startupList);
  handle('opt:startup:set', (item, on) => opt.startupSet(item, on));
  handle('opt:proc:list', opt.processes);
  handle('opt:proc:kill', (ids, name) => opt.killProcess(ids, name));
  handle('term:exec', (e, id, cmd) => { system.termExec(id, cmd, msg => { if (!e.sender.isDestroyed()) e.sender.send('term:event', msg); }); return true; }, true);
  handle('term:kill', system.termKill);
  handle('term:cwd', system.termCwd);
}

function startLoops() {
  setInterval(() => {
    if (quitting) return;
    const st = system.stats();
    for (const n of ['dashboard', 'panel', 'bar']) {
      try { if (alive(n) && wins[n].isVisible()) wins[n].webContents.send('sys:stats', st); } catch {}
    }
  }, 1500);
  if (!isWin) return;
  let lastTitle = '';
  const order = new Map();
  let seq = 0;
  setInterval(() => {
    if (!alive('bar')) return;
    const own = new Set(Object.values(wins).filter(w => !w.isDestroyed()).map(native.hwndOf));
    const f = native.foreground();
    if (f && !own.has(f.hwnd)) {
      const title = !f.title || /^(Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd)$/.test(f.cls) ? 'Desktop' : f.title;
      if (title !== lastTitle) wins.bar.webContents.send('fg:title', lastTitle = title);
    }
    if (!settings.get().shell.windows) return;
    const list = native.listWindows(own);
    const live = new Set(list.map(w => w.hwnd));
    for (const h of order.keys()) if (!live.has(h)) order.delete(h);
    for (const w of list) if (!order.has(w.hwnd)) order.set(w.hwnd, seq++);
    list.sort((x, y) => order.get(x.hwnd) - order.get(y.hwnd));
    const key = JSON.stringify(list);
    if (key !== lastWindows) wins.bar.webContents.send('windows:list', JSON.parse(lastWindows = key));
  }, 700);
}

app.on('second-instance', () => openPanel());
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  settings.load();
  log.info('start', app.getVersion());
  const crashes = settings.get().crashCount;
  if (crashes >= 2 && settings.get().shell.enabled) {
    log.warn('safe mode', crashes);
    settings.set({ shell: { enabled: false }, safeMode: true });
  }
  settings.set({ crashCount: crashes + 1 });
  setTimeout(() => settings.set({ crashCount: 0 }), 30000);
  registerIpc();
  createTray();
  registerShortcuts();
  const d = primary();
  displayKey = JSON.stringify([d.id, d.bounds, d.scaleFactor, d.rotation, screen.getAllDisplays().length]);
  applyShell();
  startLoops();
  setTimeout(() => Object.keys(POPUPS).forEach(ensurePopup), 1500);
  if (settings.get().autostart) applyAutostart(true);
  if (settings.get().firstRun || !process.argv.includes('--autostart')) {
    openPanel();
    settings.set({ firstRun: false });
  }
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
});

function cleanup() {
  if (quitting) return;
  quitting = true;
  try { settings.set({ crashCount: 0 }); } catch {}
  try { globalShortcut.unregisterAll(); } catch {}
  if (!isWin) return;
  native.removeAllAppbars();
  restoreTaskbar();
  native.setDesktopIconsVisible(true);
  if (alive('wallpaper')) { wins.wallpaper.removeAllListeners('closed'); wins.wallpaper.destroy(); }
  native.refreshDesktop();
}

app.on('before-quit', cleanup);
process.on('exit', cleanup);
process.on('uncaughtException', e => log.error('uncaught', e));
process.on('unhandledRejection', e => log.error('unhandled', e));
