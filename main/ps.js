'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('./log');

const isWin = process.platform === 'win32';
const PRE = "$ErrorActionPreference='Continue';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$OutputEncoding=[System.Text.Encoding]::UTF8;";
const enc = s => Buffer.from(s, 'utf16le').toString('base64');
const q = s => `'${String(s).replace(/'/g, "''")}'`;

const run = (file, args, timeout = 60000) => new Promise(resolve =>
  execFile(file, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
    (err, stdout = '', stderr = '') => resolve({ ok: !err, stdout: stdout.replace(/^﻿/, ''), stderr })));

const ps = (script, timeout) => isWin
  ? run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(PRE + script)], timeout)
  : Promise.resolve({ ok: false, stdout: '', stderr: '' });

async function psJson(script, timeout) {
  const { stdout, stderr } = await ps(script, timeout);
  const t = stdout.trim();
  if (!t) { if (stderr) log.warn('ps', stderr.slice(0, 500)); return null; }
  try { return JSON.parse(t); } catch { log.warn('ps json', t.slice(0, 300)); return null; }
}

async function psAdmin(script, timeout = 300000) {
  if (!isWin) return { ok: false, cancelled: false, output: '' };
  const out = path.join(os.tmpdir(), `mist-admin-${process.pid}-${Date.now()}.txt`);
  const inner = PRE + `try { & { ${script} } *>&1 | Out-File -LiteralPath ${q(out)} -Encoding utf8 } catch { $_ | Out-File -LiteralPath ${q(out)} -Encoding utf8 -Append }`;
  const r = await ps(`try { Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${enc(inner)}') } catch { Write-Output 'CANCELLED' }`, timeout);
  const cancelled = r.stdout.includes('CANCELLED');
  let output = '';
  try { output = fs.readFileSync(out, 'utf8').replace(/^﻿/, ''); fs.unlinkSync(out); } catch {}
  return { ok: r.ok && !cancelled, cancelled, output };
}

let admin = null;
async function isAdmin() {
  if (admin === null) {
    const r = await ps('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)');
    admin = /True/.test(r.stdout);
  }
  return admin;
}

module.exports = { isWin, q, run, ps, psJson, psAdmin, isAdmin };
