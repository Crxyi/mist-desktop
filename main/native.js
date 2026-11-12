'use strict';
const log = require('./log');

let A = null;
const num = v => (typeof v === 'bigint' ? Number(v) : v || 0);
const SWP = { NOSIZE: 0x1, NOMOVE: 0x2, NOZORDER: 0x4, NOACTIVATE: 0x10 };
const SPIF = 0x3;

function init() {
  if (A || process.platform !== 'win32') return A;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const shell32 = koffi.load('shell32.dll');
    const dwmapi = koffi.load('dwmapi.dll');
    const RECT = koffi.struct('MIST_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
    const APPBARDATA = koffi.struct('MIST_APPBARDATA', { cbSize: 'uint32_t', hWnd: 'intptr_t', uCallbackMessage: 'uint32_t', uEdge: 'uint32_t', rc: RECT, lParam: 'intptr_t' });
    A = {
      appbarSize: koffi.sizeof(APPBARDATA),
      FindWindowW: user32.func('intptr_t FindWindowW(str16 cls, str16 title)'),
      FindWindowExW: user32.func('intptr_t FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 title)'),
      SendMessageTimeoutW: user32.func('intptr_t SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)'),
      SetParent: user32.func('intptr_t SetParent(intptr_t child, intptr_t parent)'),
      SetWindowPos: user32.func('int SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
      ShowWindow: user32.func('int ShowWindow(intptr_t hwnd, int cmd)'),
      IsWindowVisible: user32.func('int IsWindowVisible(intptr_t hwnd)'),
      GetWindow: user32.func('intptr_t GetWindow(intptr_t hwnd, uint32_t cmd)'),
      GetTopWindow: user32.func('intptr_t GetTopWindow(intptr_t hwnd)'),
      GetWindowLongPtrW: user32.func('intptr_t GetWindowLongPtrW(intptr_t hwnd, int idx)'),
      IsIconic: user32.func('int IsIconic(intptr_t hwnd)'),
      GetWindowThreadProcessId: user32.func('uint32_t GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
      SwitchToThisWindow: user32.func('void SwitchToThisWindow(intptr_t hwnd, int alt)'),
      PostMessageW: user32.func('int PostMessageW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)'),
      DwmGetWindowAttribute: dwmapi.func('int DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, void *buf, uint32_t size)'),
      QueryFullProcessImageNameW: kernel32.func('int QueryFullProcessImageNameW(intptr_t h, uint32_t flags, void *buf, _Inout_ uint32_t *size)'),
      RedrawWindow: user32.func('int RedrawWindow(intptr_t hwnd, void *rect, intptr_t rgn, uint32_t flags)'),
      GetSystemMetrics: user32.func('int GetSystemMetrics(int idx)'),
      GetForegroundWindow: user32.func('intptr_t GetForegroundWindow()'),
      GetWindowTextW: user32.func('int GetWindowTextW(intptr_t hwnd, void *buf, int max)'),
      GetClassNameW: user32.func('int GetClassNameW(intptr_t hwnd, void *buf, int max)'),
      keybd_event: user32.func('void keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)'),
      RegisterWindowMessageW: user32.func('uint32_t RegisterWindowMessageW(str16 name)'),
      SPI_buf: user32.func('SystemParametersInfoW', 'int', ['uint32_t', 'uint32_t', 'void *', 'uint32_t']),
      SPI_val: user32.func('SystemParametersInfoW', 'int', ['uint32_t', 'uint32_t', 'intptr_t', 'uint32_t']),
      SHAppBarMessage: shell32.func('uintptr_t SHAppBarMessage(uint32_t msg, _Inout_ MIST_APPBARDATA *data)'),
      OpenProcess: kernel32.func('intptr_t OpenProcess(uint32_t access, int inherit, uint32_t pid)'),
      CloseHandle: kernel32.func('int CloseHandle(intptr_t h)'),
      K32EnumProcesses: kernel32.func('int K32EnumProcesses(void *ids, uint32_t cb, _Out_ uint32_t *needed)'),
      K32EmptyWorkingSet: kernel32.func('int K32EmptyWorkingSet(intptr_t h)')
    };
  } catch (e) {
    log.error('native', e);
  }
  return A;
}

const safe = (name, fn, fallback = null) => (...args) => {
  const a = init();
  if (!a) return fallback;
  try { return fn(a, ...args); } catch (e) { log.error(name, e); return fallback; }
};

function hwndOf(win) {
  const b = win.getNativeWindowHandle();
  return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0);
}

function desktopParts(a) {
  const progman = num(a.FindWindowW('Progman', null));
  let defView = progman ? num(a.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null)) : 0;
  let defParent = defView ? progman : 0;
  for (let w = 0, i = 0; !defView && i < 200; i++) {
    w = num(a.FindWindowExW(0, w, 'WorkerW', null));
    if (!w) break;
    defView = num(a.FindWindowExW(w, 0, 'SHELLDLL_DefView', null));
    if (defView) defParent = w;
  }
  return { progman, defView, defParent };
}

let attachMode = null;
const attachToDesktop = safe('attachToDesktop', (a, hwnd) => {
  const progman = num(a.FindWindowW('Progman', null));
  if (!progman) return false;
  a.SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, 0, 1000, [0]);
  a.SendMessageTimeoutW(progman, 0x052C, 0, 0, 0, 1000, [0]);
  const vx = a.GetSystemMetrics(76), vy = a.GetSystemMetrics(77), cx = a.GetSystemMetrics(0), cy = a.GetSystemMetrics(1);
  const { defView, defParent } = desktopParts(a);
  if (defParent === progman && num(a.FindWindowExW(progman, 0, 'WorkerW', null))) {
    a.SetParent(hwnd, progman);
    a.SetWindowPos(hwnd, defView, -vx, -vy, cx, cy, SWP.NOACTIVATE);
    attachMode = 'progman';
  } else {
    const worker = defParent && defParent !== progman ? num(a.FindWindowExW(0, defParent, 'WorkerW', null)) : 0;
    if (!worker) return false;
    a.SetParent(hwnd, worker);
    a.SetWindowPos(hwnd, 0, -vx, -vy, cx, cy, SWP.NOZORDER | SWP.NOACTIVATE);
    attachMode = 'workerw';
  }
  log.info('wallpaper attached', attachMode);
  return true;
}, false);

const sendToBottom = safe('sendToBottom', (a, hwnd) => {
  const { progman, defParent } = desktopParts(a);
  const base = defParent || progman;
  const prev = base ? num(a.GetWindow(base, 3)) : 0;
  if (prev !== hwnd) a.SetWindowPos(hwnd, prev, 0, 0, 0, 0, SWP.NOMOVE | SWP.NOSIZE | SWP.NOACTIVATE);
});

const refreshDesktop = safe('refreshDesktop', a => {
  const flags = 0x1 | 0x4 | 0x80 | 0x100 | 0x400;
  const progman = num(a.FindWindowW('Progman', null));
  if (progman) a.RedrawWindow(progman, null, 0, flags);
  for (let w = 0, i = 0; i < 200; i++) {
    w = num(a.FindWindowExW(0, w, 'WorkerW', null));
    if (!w) break;
    a.RedrawWindow(w, null, 0, flags);
  }
});

let iconsHidden = false;
const setDesktopIconsVisible = safe('desktopIcons', (a, visible) => {
  if (visible && !iconsHidden) return;
  const { defView } = desktopParts(a);
  const list = defView ? num(a.FindWindowExW(defView, 0, 'SysListView32', null)) : 0;
  if (!list) return;
  if (visible) { a.ShowWindow(list, 5); iconsHidden = false; }
  else if (a.IsWindowVisible(list)) { a.ShowWindow(list, 0); iconsHidden = true; }
});

const appbars = new Map();
const abd = (a, hwnd, cbMsg, rc) => ({ cbSize: a.appbarSize, hWnd: hwnd, uCallbackMessage: cbMsg, uEdge: 0, rc, lParam: 0 });

const appbarSet = safe('appbarSet', (a, hwnd, width, area, cbMsg) => {
  if (!appbars.has(hwnd)) a.SHAppBarMessage(0, abd(a, hwnd, cbMsg, RC0));
  appbars.set(hwnd, cbMsg);
  const d = abd(a, hwnd, cbMsg, { left: area.left, top: area.top, right: area.left + width, bottom: area.bottom });
  a.SHAppBarMessage(2, d);
  d.rc.right = d.rc.left + width;
  a.SHAppBarMessage(3, d);
  a.SetWindowPos(hwnd, 0, d.rc.left, d.rc.top, width, d.rc.bottom - d.rc.top, SWP.NOZORDER | SWP.NOACTIVATE);
  return d.rc;
});

const appbarRemove = safe('appbarRemove', (a, hwnd) => {
  if (!appbars.has(hwnd)) return;
  a.SHAppBarMessage(1, abd(a, hwnd, appbars.get(hwnd), RC0));
  appbars.delete(hwnd);
});

const removeAllAppbars = () => [...appbars.keys()].forEach(appbarRemove);
const registerMessage = safe('registerMessage', (a, name) => a.RegisterWindowMessageW(name), 0);

const foreground = safe('foreground', a => {
  const hwnd = num(a.GetForegroundWindow());
  const tb = Buffer.alloc(1024), cb = Buffer.alloc(512);
  const title = hwnd ? tb.toString('utf16le', 0, a.GetWindowTextW(hwnd, tb, 511) * 2) : '';
  const cls = hwnd ? cb.toString('utf16le', 0, a.GetClassNameW(hwnd, cb, 255) * 2) : '';
  return { hwnd, title, cls };
});

const VK = { playpause: 0xB3, next: 0xB0, prev: 0xB1 };
const mediaKey = safe('mediaKey', (a, name) => {
  if (!VK[name]) return false;
  a.keybd_event(VK[name], 0, 1, 0);
  a.keybd_event(VK[name], 0, 3, 0);
  return true;
}, false);

const trimWorkingSets = safe('trim', a => {
  const ids = Buffer.alloc(4 * 16384);
  const needed = [0];
  if (!a.K32EnumProcesses(ids, ids.length, needed)) return { ok: 0 };
  let ok = 0;
  for (let i = 0; i < needed[0] / 4; i++) {
    const pid = ids.readUInt32LE(i * 4);
    const h = pid > 4 ? num(a.OpenProcess(0x1000 | 0x0100, 0, pid)) : 0;
    if (!h) continue;
    if (a.K32EmptyWorkingSet(h)) ok++;
    a.CloseHandle(h);
  }
  return { ok };
}, { ok: 0 });

const ANIM = [[0x1042, 0x1043], [0x1002, 0x1003], [0x1004, 0x1005], [0x1016, 0x1017], [0x1006, 0x1007]];
const getAnimations = safe('getAnimations', a => {
  const b = Buffer.alloc(8);
  const parts = ANIM.map(([get]) => (a.SPI_buf(get, 0, b, 0) ? b.readInt32LE(0) !== 0 : null));
  b.writeUInt32LE(8, 0);
  parts.push(a.SPI_buf(0x0048, 8, b, 0) ? b.readInt32LE(4) !== 0 : null);
  return parts;
});
const setAnimations = safe('setAnimations', (a, values) => {
  ANIM.forEach(([, set], i) => { if (values[i] != null) a.SPI_val(set, 0, values[i] ? 1 : 0, SPIF); });
  if (values[ANIM.length] != null) {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(8, 0);
    b.writeInt32LE(values[ANIM.length] ? 1 : 0, 4);
    a.SPI_buf(0x0049, 8, b, SPIF);
  }
});

const getMouse = safe('getMouse', a => {
  const b = Buffer.alloc(12);
  return a.SPI_buf(0x0003, 0, b, 0) ? [b.readInt32LE(0), b.readInt32LE(4), b.readInt32LE(8)] : null;
});
const setMouse = safe('setMouse', (a, v) => {
  const b = Buffer.alloc(12);
  v.forEach((x, i) => b.writeInt32LE(x, i * 4));
  a.SPI_buf(0x0004, 0, b, SPIF);
});

const RC0 = { left: 0, top: 0, right: 0, bottom: 0 };
const trays = a => {
  const list = [num(a.FindWindowW('Shell_TrayWnd', null))];
  for (let w = 0, i = 0; i < 16; i++) {
    w = num(a.FindWindowExW(0, w, 'Shell_SecondaryTrayWnd', null));
    if (!w) break;
    list.push(w);
  }
  return list.filter(Boolean);
};
const taskbarGet = safe('taskbarGet', a => {
  const t = num(a.FindWindowW('Shell_TrayWnd', null));
  return t ? Number(a.SHAppBarMessage(4, abd(a, t, 0, RC0))) : null;
});
const taskbarSet = safe('taskbarSet', (a, state, visible) => {
  const t = num(a.FindWindowW('Shell_TrayWnd', null));
  if (!t) return;
  if (state != null) a.SHAppBarMessage(10, { ...abd(a, t, 0, RC0), lParam: state });
  for (const w of trays(a)) a.ShowWindow(w, visible ? 5 : 0);
});

const exeCache = new Map();
function exeOf(a, pid) {
  if (exeCache.has(pid)) return exeCache.get(pid);
  if (exeCache.size > 500) exeCache.clear();
  let exe = '';
  const h = num(a.OpenProcess(0x1000, 0, pid));
  if (h) {
    const b = Buffer.alloc(2048), size = [1024];
    if (a.QueryFullProcessImageNameW(h, 0, b, size)) exe = b.toString('utf16le', 0, size[0] * 2);
    a.CloseHandle(h);
  }
  exeCache.set(pid, exe);
  return exe;
}

const listWindows = safe('listWindows', (a, exclude) => {
  const out = [];
  const fg = num(a.GetForegroundWindow());
  const tb = Buffer.alloc(1024), cb = Buffer.alloc(512), cloak = Buffer.alloc(4);
  for (let h = num(a.GetTopWindow(0)), i = 0; h && i < 3000; h = num(a.GetWindow(h, 2)), i++) {
    if (exclude.has(h) || !a.IsWindowVisible(h)) continue;
    const ex = num(a.GetWindowLongPtrW(h, -20));
    if (ex & 0x80 || (num(a.GetWindow(h, 4)) && !(ex & 0x40000))) continue;
    if (a.DwmGetWindowAttribute(h, 14, cloak, 4) === 0 && cloak.readUInt32LE(0)) continue;
    const title = tb.toString('utf16le', 0, a.GetWindowTextW(h, tb, 511) * 2);
    const cls = cb.toString('utf16le', 0, a.GetClassNameW(h, cb, 255) * 2);
    if (!title || /^(Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd)$/.test(cls)) continue;
    const pid = [0];
    a.GetWindowThreadProcessId(h, pid);
    out.push({ hwnd: h, title, exe: exeOf(a, pid[0]), active: h === fg, min: !!a.IsIconic(h) });
  }
  return out;
}, []);

const activateWindow = safe('activateWindow', (a, h) => {
  if (num(a.GetForegroundWindow()) === h && !a.IsIconic(h)) return a.ShowWindow(h, 6);
  if (a.IsIconic(h)) a.ShowWindow(h, 9);
  a.SwitchToThisWindow(h, 1);
});
const closeWindow = safe('closeWindow', (a, h) => a.PostMessageW(h, 0x10, 0, 0));

module.exports = {
  taskbarGet, taskbarSet, listWindows, activateWindow, closeWindow,
  available: () => !!init(), attachMode: () => attachMode, hwndOf, attachToDesktop, sendToBottom, refreshDesktop,
  setDesktopIconsVisible, appbarSet, appbarRemove, removeAllAppbars, registerMessage, foreground, mediaKey,
  trimWorkingSets, getAnimations, setAnimations, getMouse, setMouse
};
