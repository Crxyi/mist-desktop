'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let file;
const target = () => file || (file = path.join(app.getPath('userData'), 'mist.log'));

function write(level, args) {
  const text = args.map(a => a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const line = `[${new Date().toISOString()}] ${level} ${text}\n`;
  (level === 'ERROR' ? process.stderr : process.stdout).write(line);
  try {
    const f = target();
    if (fs.existsSync(f) && fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, line);
  } catch {}
}

module.exports = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
  file: target,
  tail(n = 300) {
    try { return fs.readFileSync(target(), 'utf8').split('\n').slice(-n).join('\n'); } catch { return ''; }
  }
};
