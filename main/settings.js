'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  theme: 'light',
  wallpaper: 'torii',
  wallpaperPath: '',
  wallpaperAnimate: true,
  shell: { enabled: true, bar: true, reserve: true, wallpaper: true, wallpaperMode: 'desktop', frame: false, hideIcons: false, hotEdge: true, taskbar: 'hidden', windows: true },
  clock24: true,
  motion: true,
  city: 'Berlin',
  geo: null,
  autostart: false,
  tweaksOriginal: {},
  powerOriginal: null,
  taskbarOriginal: null,
  startupOriginal: {},
  ultimateGuid: null,
  crashCount: 0,
  safeMode: false,
  firstRun: true,
  history: []
};

let file, data;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (base, over) => {
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  return out;
};

function load() {
  file = path.join(app.getPath('userData'), 'settings.json');
  try { data = merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { data = merge(DEFAULTS, {}); }
  return data;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
    fs.renameSync(file + '.tmp', file);
  } catch (e) { require('./log').error('settings', e); }
}

const get = () => data || load();
const set = patch => { data = merge(get(), patch); save(); return data; };
const replace = (key, value) => { get()[key] = value; save(); return data; };
const reset = () => { data = { ...structuredClone(DEFAULTS), history: get().history, firstRun: false }; save(); return data; };
const addHistory = (text, kind = 'info') => replace('history', [{ t: Date.now(), text, kind }, ...get().history].slice(0, 60));

module.exports = { load, get, set, replace, reset, addHistory };
