'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');
const { isWin, run, ps, psJson, isAdmin } = require('./ps');
const log = require('./log');

let prevCpu = os.cpus();
function cpuUsage() {
  const cur = os.cpus();
  let idle = 0, total = 0;
  cur.forEach((c, i) => {
    const p = prevCpu[i] || c;
    for (const k of Object.keys(c.times)) total += c.times[k] - p.times[k];
    idle += c.times.idle - p.times.idle;
  });
  prevCpu = cur;
  return total > 0 ? Math.min(100, Math.max(0, (1 - idle / total) * 100)) : 0;
}

function stats() {
  let diskTotal = 0, diskUsed = 0;
  try {
    const s = fs.statfsSync(isWin ? `${process.env.SystemDrive || 'C:'}\\` : '/');
    diskTotal = s.blocks * s.bsize;
    diskUsed = diskTotal - s.bavail * s.bsize;
  } catch {}
  return { cpu: cpuUsage(), memTotal: os.totalmem(), memUsed: os.totalmem() - os.freemem(), diskTotal, diskUsed, uptime: os.uptime() };
}

let info = null;
async function staticInfo() {
  if (info) return info;
  const cpus = os.cpus();
  let name = os.version();
  if (isWin && parseInt(os.release().split('.')[2], 10) >= 22000) name = name.replace('Windows 10', 'Windows 11');
  info = {
    os: name,
    kernel: os.release(),
    host: os.hostname(),
    user: os.userInfo().username,
    cpu: (cpus[0]?.model || '').replace(/\s+/g, ' ').trim(),
    cores: cpus.length,
    memTotal: os.totalmem(),
    gpu: '',
    shell: 'PowerShell',
    admin: await isAdmin()
  };
  const gpus = await psJson('ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name)');
  if (Array.isArray(gpus)) info.gpu = (gpus.filter(n => !/Basic|Remote|Virtual|Parsec|Meta/i.test(n)).join(', ') || gpus.join(', '));
  return info;
}

async function geocode(city) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&format=json&name=${encodeURIComponent(city)}`);
  const g = (await r.json()).results?.[0];
  return g ? { lat: g.latitude, lon: g.longitude, label: g.name + (g.country_code ? ', ' + g.country_code : '') } : null;
}

let weatherCache = { key: '', t: 0, data: null };
async function weather(settings, force) {
  try {
    const geo = settings.geo || (settings.city && await geocode(settings.city));
    if (!geo) return { error: 'Kein Ort festgelegt' };
    const key = `${geo.lat},${geo.lon}`;
    if (!force && weatherCache.key === key && Date.now() - weatherCache.t < 900000) return weatherCache.data;
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`);
    const { current: c, daily: d } = await r.json();
    const data = { label: geo.label || settings.city, temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: !!c.is_day, max: d.temperature_2m_max[0], min: d.temperature_2m_min[0] };
    weatherCache = { key, t: Date.now(), data };
    return data;
  } catch (e) {
    log.warn('weather', e.message);
    return weatherCache.data || { error: 'Wetter nicht erreichbar' };
  }
}

const KNOWN = {
  '{6D809377-6AF0-444B-8957-A3773F02200E}': () => process.env.ProgramW6432 || process.env.ProgramFiles,
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': () => process.env['ProgramFiles(x86)'],
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': () => path.join(process.env.WINDIR || 'C:\\Windows', 'System32'),
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': () => process.env.WINDIR || 'C:\\Windows'
};

function resolveAppPath(id) {
  const m = /^(\{[0-9A-F-]+\})\\(.+)$/i.exec(id);
  if (m && KNOWN[m[1].toUpperCase()]) return path.join(KNOWN[m[1].toUpperCase()](), m[2]);
  return /^[a-z]:\\/i.test(id) ? id : null;
}

function collectLinks(dir, out, depth = 0) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) collectLinks(p, out, depth + 1);
    else if (/\.(lnk|url)$/i.test(e.name)) out.set(e.name.replace(/\.(lnk|url)$/i, '').toLowerCase(), p);
  }
}

let appsCache = { t: 0, list: [] };
async function appsList() {
  if (!isWin || (Date.now() - appsCache.t < 300000 && appsCache.list.length)) return appsCache.list;
  const links = new Map();
  collectLinks(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'), links);
  collectLinks(path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'), links);
  const raw = await psJson('ConvertTo-Json -Compress -InputObject @(Get-StartApps | Select-Object Name, AppID)') || [];
  const seen = new Set();
  const list = raw
    .filter(a => a?.Name && !/uninstall|deinstall|readme|^hilfe|^help|website|license|lizenz/i.test(a.Name))
    .filter(a => !seen.has(a.Name.toLowerCase()) && seen.add(a.Name.toLowerCase()))
    .map(a => ({ name: a.Name, id: a.AppID, icon: links.get(a.Name.toLowerCase()) || resolveAppPath(a.AppID) }))
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
  appsCache = { t: Date.now(), list };
  return list;
}

const icons = new Map();
async function appIcon(file) {
  if (!file) return null;
  if (!icons.has(file)) {
    try {
      const img = await app.getFileIcon(file, { size: 'large' });
      icons.set(file, img.isEmpty() ? null : img.toDataURL());
    } catch { icons.set(file, null); }
  }
  return icons.get(file);
}

function launchApp(id) {
  if (isWin) spawn('explorer.exe', [`shell:AppsFolder\\${id}`], { detached: true, stdio: 'ignore' }).unref();
  return isWin;
}

const POWER = {
  lock: () => run('rundll32.exe', ['user32.dll,LockWorkStation']),
  logout: () => run('shutdown.exe', ['/l']),
  restart: () => run('shutdown.exe', ['/r', '/t', '0']),
  shutdown: () => run('shutdown.exe', ['/s', '/t', '0']),
  sleep: () => ps("Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)")
};
const powerAction = action => (isWin && POWER[action] ? POWER[action]() : { ok: false });

const terms = new Map();
let cwd = os.homedir();

function termExec(id, cmd, send) {
  const cd = /^\s*cd\s*(.*)$/i.exec(cmd);
  if (cd) {
    const target = cd[1].trim().replace(/^["']|["']$/g, '') || '~';
    const next = target === '~' ? os.homedir() : path.resolve(cwd, target.replace(/^~(?=[\\/])/, os.homedir()));
    let ok = false;
    try { ok = fs.statSync(next).isDirectory(); } catch {}
    if (ok) cwd = next;
    return send({ id, type: 'exit', cwd, err: ok ? null : `Pfad nicht gefunden: ${target}` });
  }
  const script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$OutputEncoding=[System.Text.Encoding]::UTF8;$ProgressPreference='SilentlyContinue';" +
    `& { ${cmd} } 2>&1 | Out-String -Stream -Width 160`;
  const child = isWin
    ? spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { cwd, windowsHide: true })
    : spawn(process.env.SHELL || '/bin/sh', ['-c', cmd], { cwd });
  terms.set(id, child);
  child.stdout.on('data', d => send({ id, type: 'data', text: d.toString('utf8') }));
  child.stderr.on('data', d => send({ id, type: 'data', text: d.toString('utf8'), err: true }));
  child.on('error', e => send({ id, type: 'data', text: e.message + '\n', err: true }));
  child.on('close', () => { terms.delete(id); send({ id, type: 'exit', cwd }); });
}

function termKill(id) {
  const c = terms.get(id);
  if (c) isWin ? run('taskkill.exe', ['/PID', String(c.pid), '/T', '/F']) : c.kill('SIGINT');
}

module.exports = { stats, staticInfo, geocode, weather, appsList, appIcon, launchApp, powerAction, termExec, termKill, termCwd: () => cwd };
