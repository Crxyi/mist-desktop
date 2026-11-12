'use strict';
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { app } = require('electron');
const { isWin, q, run, ps, psJson, psAdmin, isAdmin } = require('./ps');
const native = require('./native');
const settings = require('./settings');

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const WINDIR = process.env.WINDIR || 'C:\\Windows';
const PD = process.env.ProgramData || 'C:\\ProgramData';
const DAY = 86400000;
const local = (...p) => path.join(LOCAL, ...p);

function fmtBytes(b) {
  if (!b) return '0 B';
  const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / 1024 ** i).toFixed(i ? 1 : 0).replace('.', ',') + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function browserCaches() {
  const out = [];
  for (const root of [local('Microsoft', 'Edge', 'User Data'), local('Google', 'Chrome', 'User Data'), local('BraveSoftware', 'Brave-Browser', 'User Data'), local('Vivaldi', 'User Data')]) {
    let profiles = [];
    try { profiles = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && /^(Default|Profile \d+)$/.test(d.name)); } catch { continue; }
    for (const p of profiles) for (const c of ['Cache', 'Code Cache', 'GPUCache']) out.push(path.join(root, p.name, c));
  }
  try { for (const p of fs.readdirSync(local('Mozilla', 'Firefox', 'Profiles'))) out.push(local('Mozilla', 'Firefox', 'Profiles', p, 'cache2')); } catch {}
  return out;
}

const WER = ['ReportArchive', 'ReportQueue'];
const CATEGORIES = [
  { id: 'usertemp', title: 'Temporary files (user)', desc: 'Contents of %TEMP%, older than 24 hours.', paths: () => [os.tmpdir()], minAge: DAY, def: true },
  { id: 'wintemp', title: 'Temporary files (Windows)', desc: 'C:\\Windows\\Temp, older than 24 hours. Asks for administrator rights.', paths: () => [path.join(WINDIR, 'Temp')], minAge: DAY, admin: true, def: true },
  { id: 'crash', title: 'Crash reports & error logs', desc: 'Memory dumps and Windows Error Reports (WER).', paths: () => [local('CrashDumps'), ...WER.map(w => local('Microsoft', 'Windows', 'WER', w)), ...WER.map(w => path.join(PD, 'Microsoft', 'Windows', 'WER', w))], def: true },
  { id: 'shader', title: 'Graphics shader cache', desc: 'DirectX/NVIDIA/AMD shaders. Rebuilt automatically – games may load a bit slower next launch.', paths: () => [local('D3DSCache'), local('NVIDIA', 'DXCache'), local('NVIDIA', 'GLCache'), local('AMD', 'DxCache'), local('AMD', 'DxcCache'), local('AMD', 'GLCache')] },
  { id: 'browser', title: 'Browser cache', desc: 'Cache only from Edge, Chrome, Brave, Vivaldi, Firefox – no passwords, cookies or history. Close the browser first.', paths: browserCaches },
  { id: 'thumbs', title: 'Thumbnail cache', desc: 'Preview images in Explorer. Locked files are skipped.', paths: () => [local('Microsoft', 'Windows', 'Explorer')], filter: n => /^(thumbcache|iconcache)_.*\.db$/i.test(n), shallow: true },
  { id: 'recycle', title: 'Recycle Bin', desc: 'Permanently empties the Recycle Bin on all drives.', recycle: true }
];

function protectedPaths() {
  return [path.dirname(process.execPath), app.getPath('userData'), process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(app.getAppPath())]
    .filter(Boolean).map(p => p.toLowerCase());
}

async function walk(dir, cb, opts, depth = 0) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !e.isSymbolicLink()) {
      const lp = p.toLowerCase();
      if (opts.shallow || depth > 32 || opts.protect.some(x => x === lp || x.startsWith(lp + path.sep) || lp.startsWith(x + path.sep))) continue;
      await walk(p, cb, opts, depth + 1);
    } else if (e.isFile() && (!opts.filter || opts.filter(e.name))) {
      let st;
      try { st = await fsp.stat(p); } catch { continue; }
      if (!opts.minAge || Date.now() - st.mtimeMs >= opts.minAge) await cb(p, st);
    }
  }
}

async function sizeOf(c, protect) {
  let size = 0, count = 0;
  for (const p of c.paths()) await walk(p, async (_f, st) => { size += st.size; count++; }, { ...c, protect });
  return { size, count };
}

async function recycleSize() {
  const r = await psJson("$s=(New-Object -ComObject Shell.Application).NameSpace(10); $sum=[int64]0; $n=0; foreach($i in $s.Items()){ $n++; try { $sum += [int64]$i.ExtendedProperty('System.Size') } catch {} }; ConvertTo-Json -Compress @{ size=$sum; count=$n }");
  return r || { size: 0, count: 0 };
}

async function scan() {
  const protect = protectedPaths();
  const admin = await isAdmin();
  const out = [];
  for (const c of CATEGORIES) {
    const { size, count } = c.recycle ? await recycleSize() : await sizeOf(c, protect);
    out.push({ id: c.id, title: c.title, desc: c.desc, size, count, def: !!c.def, needsAdmin: !!c.admin && !admin });
  }
  return out;
}

async function pruneEmpty(dir, protect, root = true) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !e.isSymbolicLink() && !protect.some(x => x.startsWith(p.toLowerCase()))) await pruneEmpty(p, protect, false);
  }
  if (!root) await fsp.rmdir(dir).catch(() => {});
}

async function cleanCategory(c, protect) {
  if (c.recycle) {
    const before = await recycleSize();
    await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
    return { freed: Math.max(0, before.size - (await recycleSize()).size) };
  }
  let freed = 0;
  for (const root of c.paths()) {
    await walk(root, async (f, st) => { try { await fsp.unlink(f); freed += st.size; } catch {} }, { ...c, protect });
    if (!c.shallow) await pruneEmpty(root, protect);
  }
  return { freed };
}

async function clean(ids) {
  const protect = protectedPaths();
  const admin = await isAdmin();
  const chosen = CATEGORIES.filter(c => ids.includes(c.id));
  const elevate = chosen.filter(c => c.admin && !admin && isWin);
  const results = [];
  for (const c of chosen.filter(c => !elevate.includes(c))) results.push({ id: c.id, ...(await cleanCategory(c, protect)) });
  if (elevate.length) {
    const before = await Promise.all(elevate.map(c => sizeOf(c, protect)));
    const r = await psAdmin(elevate.flatMap(c => c.paths()).map(p =>
      `Get-ChildItem -LiteralPath ${q(p)} -Force -Recurse -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer -and $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force -ErrorAction SilentlyContinue`).join('; '));
    for (const [i, c] of elevate.entries()) {
      const after = r.cancelled ? before[i] : await sizeOf(c, protect);
      results.push({ id: c.id, freed: Math.max(0, before[i].size - after.size) });
    }
  }
  const total = results.reduce((s, r) => s + r.freed, 0);
  settings.addHistory(`Cleanup: ${fmtBytes(total)} freed`, 'clean');
  return { results, total };
}

async function trimRam() {
  const before = os.freemem();
  const { ok } = native.trimWorkingSets();
  await new Promise(r => setTimeout(r, 700));
  const freed = Math.max(0, os.freemem() - before);
  settings.addHistory(`Memory: ${fmtBytes(freed)} freed (${ok} processes)`, 'ram');
  return { freed, processes: ok };
}

async function flushDns() {
  const r = isWin ? await run('ipconfig.exe', ['/flushdns']) : { ok: false };
  if (r.ok) settings.addHistory('DNS cache flushed', 'net');
  return { ok: r.ok };
}

async function quick() {
  const protect = protectedPaths();
  let total = 0;
  for (const id of ['usertemp', 'crash']) total += (await cleanCategory(CATEGORIES.find(c => c.id === id), protect)).freed;
  const ram = await trimRam();
  await flushDns();
  settings.addHistory(`Quick optimize: ${fmtBytes(total)} storage, ${fmtBytes(ram.freed)} RAM`, 'quick');
  return { total, ram: ram.freed };
}

const GUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const OVERLAYS = [
  { id: '961cc777-2547-4f9d-8174-7d86181b8a7a', name: 'Energy efficiency' },
  { id: '00000000-0000-0000-0000-000000000000', name: 'Balanced' },
  { id: 'ded574b5-45a0-4f42-8737-46345c09c238', name: 'Best performance' }
];

async function powerList() {
  const s = settings.get();
  const r = await ps('powercfg /list; Write-Output "@@"; powercfg /getactiveoverlayscheme');
  const [list, overlay = ''] = r.stdout.split('@@');
  const plans = list.split(/\r?\n/).map(l => new RegExp(GUID.source + /\s+\((.+?)\)\s*(\*)?\s*$/.source, 'i').exec(l.trim()))
    .filter(Boolean).map(m => ({ guid: m[1].toLowerCase(), name: m[2], active: !!m[3] }));
  return { plans, overlay: (GUID.exec(overlay) || [])[1]?.toLowerCase() || null, overlays: OVERLAYS, original: s.powerOriginal, ultimate: s.ultimateGuid };
}

async function powerSet(guid) {
  if (!settings.get().powerOriginal) {
    const active = (await powerList()).plans.find(p => p.active);
    if (active) settings.set({ powerOriginal: active.guid });
  }
  const r = await run('powercfg.exe', ['/setactive', guid]);
  if (r.ok) settings.addHistory('Power plan switched', 'power');
  return { ok: r.ok, error: r.ok ? null : r.stderr || r.stdout };
}

async function powerEnable(kind) {
  const { plans, ultimate } = await powerList();
  const base = kind === 'ultimate' ? ULTIMATE : HIGH;
  let guid = plans.find(p => p.guid === base || (kind === 'ultimate' && (p.guid === ultimate || /ultimat/i.test(p.name))))?.guid;
  if (!guid) {
    guid = (GUID.exec((await ps(`powercfg -duplicatescheme ${base}`)).stdout) || [])[1]?.toLowerCase();
    if (!guid) return { ok: false, error: 'This power plan is not supported on this device (e.g. laptops with Modern Standby). Use the “Best performance” power mode instead.' };
    if (kind === 'ultimate') settings.set({ ultimateGuid: guid });
  }
  return powerSet(guid);
}

async function powerRestore() {
  const orig = settings.get().powerOriginal;
  if (!orig) return { ok: false, error: 'No original plan saved' };
  const r = await run('powercfg.exe', ['/setactive', orig]);
  if (r.ok) {
    settings.set({ powerOriginal: null });
    settings.addHistory('Original power plan restored', 'power');
  }
  return { ok: r.ok };
}

async function overlaySet(guid) {
  const r = await run('powercfg.exe', ['/overlaysetactive', guid]);
  return { ok: r.ok, error: r.ok ? null : 'Power mode is not supported on this device' };
}

const HK = k => k.replace(/^HKCU\\/, 'Registry::HKEY_CURRENT_USER\\').replace(/^HKLM\\/, 'Registry::HKEY_LOCAL_MACHINE\\');
const dword = (key, name, on, off, missing = off) => ({ key, name, type: 'DWord', on, off, missing });
const TWEAKS = [
  { id: 'gamemode', title: 'Game Mode', desc: 'Windows prioritizes games and holds back updates and background tasks while you play.',
    reg: [dword('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 1, 0, 1)] },
  { id: 'gamedvr', title: 'Background recording off', desc: 'Disables Xbox Game Bar background recording, which can cost FPS in games.',
    reg: [dword('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 0, 1), dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 0, 1)] },
  { id: 'animations', title: 'Reduce animations', desc: 'Turns off window, menu and list animations. Windows respond instantly.', kind: 'anim' },
  { id: 'transparency', title: 'Transparency off', desc: 'Disables transparency effects in the taskbar and Start menu. Eases the load on weaker GPUs.',
    reg: [dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', 0, 1)] },
  { id: 'mouse', title: 'Mouse acceleration off', desc: 'Disable “Enhance pointer precision” – more consistent aim in games.', kind: 'mouse' },
  { id: 'startupdelay', title: 'Remove startup delay', desc: 'Windows waits a few seconds after sign-in before launching startup programs.',
    reg: [dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', 'StartupDelayInMSec', 0, null, null)] },
  { id: 'menudelay', title: 'Open menus faster', desc: 'Shortens the submenu delay from 400 to 100 ms. Takes effect after sign-out.', relogin: true,
    reg: [{ key: 'HKCU\\Control Panel\\Desktop', name: 'MenuShowDelay', type: 'String', on: '100', off: '400', missing: '400' }] },
  { id: 'tips', title: 'Windows tips & suggestions off', desc: 'No more tips, suggestions and “welcome” screens after updates.',
    reg: [dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SubscribedContent-338389Enabled', 0, 1),
      dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SoftLandingEnabled', 0, 1),
      dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement', 'ScoobeSystemSettingEnabled', 0, 1)] }
];

async function readReg(items) {
  if (!isWin || !items.length) return items.map(() => null);
  const r = await psJson('ConvertTo-Json -Compress -InputObject @(' + items.map(i =>
    `$(try { $v = (Get-Item -LiteralPath ${q(HK(i.key))} -ErrorAction Stop).GetValue(${q(i.name)}); if ($null -eq $v) { '<null>' } else { [string]$v } } catch { '<null>' })`).join(',') + ')');
  return [].concat(r).map(v => (v === '<null>' || v == null ? null : v));
}

function writeReg(i, value) {
  const k = q(HK(i.key));
  if (value == null) return `Remove-ItemProperty -LiteralPath ${k} -Name ${q(i.name)} -ErrorAction SilentlyContinue`;
  return `if (-not (Test-Path -LiteralPath ${k})) { New-Item -Path ${k} -Force | Out-Null }; New-ItemProperty -LiteralPath ${k} -Name ${q(i.name)} -PropertyType ${i.type} -Value ${i.type === 'String' ? q(value) : Number(value)} -Force | Out-Null`;
}

async function tweaksGet() {
  const values = await readReg(TWEAKS.flatMap(t => t.reg || []));
  const saved = settings.get().tweaksOriginal;
  let i = 0;
  return TWEAKS.map(t => {
    let on = false;
    if (t.reg) on = t.reg.map(r => String(values[i++] ?? r.missing) === String(r.on)).every(Boolean);
    else if (t.kind === 'anim') on = (native.getAnimations() || [true]).every(v => v === false || v === null);
    else if (t.kind === 'mouse') on = native.getMouse()?.[2] === 0;
    return { id: t.id, title: t.title, desc: t.desc, relogin: !!t.relogin, on, saved: !!saved[t.id], supported: isWin };
  });
}

async function tweakSet(id, enable) {
  const t = TWEAKS.find(x => x.id === id);
  if (!t || !isWin) return { ok: false };
  const originals = { ...settings.get().tweaksOriginal };
  if (enable && !originals[id]) originals[id] = t.reg ? await readReg(t.reg) : t.kind === 'anim' ? native.getAnimations() : native.getMouse();
  const orig = originals[id];
  if (t.reg) await ps(t.reg.map((r, i) => writeReg(r, enable ? r.on : orig ? orig[i] : r.off)).join('; '));
  else if (t.kind === 'anim') native.setAnimations(enable ? Array(6).fill(false) : orig || Array(6).fill(true));
  else native.setMouse(enable ? [0, 0, 0] : orig || [6, 10, 1]);
  if (!enable) delete originals[id];
  settings.replace('tweaksOriginal', originals);
  settings.addHistory(`${t.title}: ${enable ? 'enabled' : 'reset'}`, 'tweak');
  return { ok: true };
}

const AP = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
const STARTUP_SCRIPT = `
$res = New-Object System.Collections.ArrayList
function Approved($ap, $name) { $a = Get-Item -LiteralPath $ap -ErrorAction SilentlyContinue; if ($a) { $b = $a.GetValue($name); if ($b -is [byte[]] -and $b.Length) { return (($b[0] -band 1) -eq 0) } }; return $true }
foreach ($x in @(
  @{s='User'; run='Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; ap='Registry::HKEY_CURRENT_USER\\${AP}\\Run'; admin=$false},
  @{s='System'; run='Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; ap='Registry::HKEY_LOCAL_MACHINE\\${AP}\\Run'; admin=$true},
  @{s='System (32-bit)'; run='Registry::HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; ap='Registry::HKEY_LOCAL_MACHINE\\${AP}\\Run32'; admin=$true})) {
  $k = Get-Item -LiteralPath $x.run -ErrorAction SilentlyContinue
  if (-not $k) { continue }
  foreach ($n in $k.GetValueNames()) { if ($n) { [void]$res.Add([pscustomobject]@{ name=$n; value=$n; command=[string]$k.GetValue($n); scope=$x.s; ap=$x.ap; admin=$x.admin; enabled=(Approved $x.ap $n) }) } }
}
foreach ($f in @(
  @{s='Startup folder'; d=[Environment]::GetFolderPath('Startup'); ap='Registry::HKEY_CURRENT_USER\\${AP}\\StartupFolder'; admin=$false},
  @{s='Startup folder (all)'; d=[Environment]::GetFolderPath('CommonStartup'); ap='Registry::HKEY_LOCAL_MACHINE\\${AP}\\StartupFolder'; admin=$true})) {
  if (-not $f.d -or -not (Test-Path -LiteralPath $f.d)) { continue }
  foreach ($i in (Get-ChildItem -LiteralPath $f.d -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })) {
    [void]$res.Add([pscustomobject]@{ name=[IO.Path]::GetFileNameWithoutExtension($i.Name); value=$i.Name; command=$i.FullName; scope=$f.s; ap=$f.ap; admin=$f.admin; enabled=(Approved $f.ap $i.Name) })
  }
}
ConvertTo-Json -Compress -Depth 3 -InputObject @($res)`;

async function startupList() {
  return [].concat(await psJson(STARTUP_SCRIPT) || []).map(x => ({ ...x, id: `${x.ap}|${x.value}` }));
}

async function startupSet(item, enable, track = true) {
  if (!isWin) return { ok: false };
  const script = `$ap=${q(item.ap)}; if (-not (Test-Path -LiteralPath $ap)) { New-Item -Path $ap -Force | Out-Null }; New-ItemProperty -LiteralPath $ap -Name ${q(item.value)} -PropertyType Binary -Value ([byte[]](${enable ? 2 : 3},0,0,0,0,0,0,0,0,0,0,0)) -Force | Out-Null`;
  if (item.admin && !(await isAdmin())) {
    if ((await psAdmin(script)).cancelled) return { ok: false, error: 'Cancelled' };
  } else await ps(script);
  if (track) {
    const orig = { ...settings.get().startupOriginal };
    if (!orig[item.id]) orig[item.id] = { item, enabled: !enable };
    else if (orig[item.id].enabled === enable) delete orig[item.id];
    settings.replace('startupOriginal', orig);
  }
  settings.addHistory(`Startup: ${item.name} ${enable ? 'enabled' : 'disabled'}`, 'startup');
  return { ok: true };
}

async function revertAll() {
  const s = settings.get();
  const done = [];
  for (const id of Object.keys(s.tweaksOriginal)) { await tweakSet(id, false); done.push(id); }
  if (s.powerOriginal) { await powerRestore(); done.push('power'); }
  for (const { item, enabled } of Object.values(s.startupOriginal)) if ((await startupSet(item, enabled, false)).ok) done.push(item.name);
  settings.replace('startupOriginal', {});
  settings.addHistory('All optimizations undone', 'tweak');
  return { ok: true, done };
}

function changes() {
  const s = settings.get();
  const tweaks = Object.keys(s.tweaksOriginal).map(id => TWEAKS.find(t => t.id === id)?.title || id);
  const startup = Object.values(s.startupOriginal).map(x => x.item.name);
  const taskbar = s.taskbarOriginal != null;
  return { tweaks, startup, power: !!s.powerOriginal, taskbar, total: tweaks.length + startup.length + (s.powerOriginal ? 1 : 0) + (taskbar ? 1 : 0) };
}

async function restorePoint() {
  if (!isWin) return { ok: false, error: 'Windows only' };
  const script = "try { Enable-ComputerRestore -Drive \"$env:SystemDrive\\\" -ErrorAction SilentlyContinue; Checkpoint-Computer -Description 'Mist' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop; Write-Output 'OK' } catch { Write-Output ('ERR:' + $_.Exception.Message) }";
  const r = await isAdmin() ? await ps(script, 180000) : await psAdmin(script, 180000);
  if (r.cancelled) return { ok: false, error: 'Cancelled' };
  const out = r.stdout || r.output || '';
  if (/OK/.test(out)) { settings.addHistory('Restore point created', 'tweak'); return { ok: true }; }
  const msg = (/ERR:(.*)/.exec(out) || [])[1] || 'Failed';
  return { ok: false, error: /1440|frequency|Häufigkeit|24/i.test(msg) ? 'Windows only allows one restore point per 24 hours – a recent one already exists.' : msg.trim() };
}

async function repairDesktop() {
  await ps('Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1500; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }');
  settings.addHistory('Desktop (Explorer) restarted', 'tweak');
  return { ok: true };
}

const PROTECTED = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'fontdrvhost', 'memory compression', 'dwm', 'msmpeng', 'secure system', 'lsaiso', 'sihost', 'ctfmon', 'audiodg', 'spoolsv', 'wudfhost', 'mist', 'explorer']);
const PROC_SCRIPT = `
$c=[Environment]::ProcessorCount; $a=@{}
foreach($p in Get-Process){ try { $a[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds } catch {} }
Start-Sleep -Milliseconds 800
$l = foreach($p in Get-Process){ $t=$null; try { $t=$p.TotalProcessorTime.TotalMilliseconds } catch {}
  $cpu=0; if($t -ne $null -and $a.ContainsKey($p.Id)){ $cpu=($t-$a[$p.Id])/(8*$c) }
  [pscustomobject]@{ id=$p.Id; name=$p.ProcessName; mem=$p.WorkingSet64; cpu=[math]::Round([double]$cpu,1); title=$p.MainWindowTitle } }
ConvertTo-Json -Compress -InputObject @($l)`;

async function processes() {
  const groups = new Map();
  for (const p of [].concat(await psJson(PROC_SCRIPT, 20000) || [])) {
    if (p.name.toLowerCase() === 'idle') continue;
    const g = groups.get(p.name.toLowerCase()) || { name: p.name, ids: [], mem: 0, cpu: 0, title: '' };
    g.ids.push(p.id);
    g.mem += p.mem || 0;
    g.cpu += p.cpu || 0;
    g.title ||= p.title;
    groups.set(p.name.toLowerCase(), g);
  }
  return [...groups.values()]
    .map(g => ({ ...g, cpu: Math.min(100, Math.round(g.cpu * 10) / 10), count: g.ids.length, protected: PROTECTED.has(g.name.toLowerCase()) || g.ids.includes(process.pid) }))
    .sort((a, b) => b.mem - a.mem)
    .slice(0, 80);
}

async function killProcess(ids, name) {
  if (PROTECTED.has(String(name).toLowerCase())) return { ok: false, error: 'System process – will not be ended' };
  const list = ids.map(Number).filter(n => Number.isInteger(n) && n > 4 && n !== process.pid);
  if (!list.length || !isWin) return { ok: false };
  const r = await ps(`Stop-Process -Id ${list.join(',')} -Force -ErrorAction SilentlyContinue`);
  settings.addHistory(`Process ended: ${name}`, 'proc');
  return { ok: r.ok };
}

module.exports = {
  scan, clean, trimRam, flushDns, quick, powerList, powerSet, powerEnable, powerRestore, overlaySet,
  tweaksGet, tweakSet, revertAll, changes, restorePoint, repairDesktop, startupList, startupSet, processes, killProcess
};
