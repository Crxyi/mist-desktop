'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:set', 'shell:geometry', 'sys:static', 'sys:stats', 'weather:get', 'weather:city',
  'apps:list', 'apps:icon', 'apps:launch', 'media:key', 'power:action',
  'win:open', 'win:minimize', 'win:maximize', 'win:close', 'win:activate', 'win:closeExternal', 'popup:hidden',
  'wallpaper:pick', 'log:get', 'log:open', 'app:quit', 'app:info', 'app:safeok', 'app:reset', 'history:get',
  'opt:scan', 'opt:clean', 'opt:ram', 'opt:dns', 'opt:quick', 'opt:power:list', 'opt:power:set', 'opt:power:enable',
  'opt:power:restore', 'opt:power:overlay', 'opt:tweaks:get', 'opt:tweaks:set', 'opt:revert', 'opt:changes',
  'opt:restorepoint', 'opt:repair', 'opt:startup:list', 'opt:startup:set', 'opt:proc:list', 'opt:proc:kill',
  'term:exec', 'term:kill', 'term:cwd'
]);
const EVENTS = new Set(['sys:stats', 'settings:changed', 'shell:geometry', 'fg:title', 'windows:list', 'popup:show', 'popup:hide', 'panel:page', 'term:event']);

contextBridge.exposeInMainWorld('mist', {
  platform: process.platform,
  invoke: (ch, ...args) => (INVOKE.has(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('blocked: ' + ch))),
  on(ch, cb) {
    if (!EVENTS.has(ch)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  }
});
