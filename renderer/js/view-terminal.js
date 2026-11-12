'use strict';
window.Views = window.Views || {};
Views.terminal = async function (root) {
  const info = await API.invoke('sys:static');
  root.innerHTML = `<div class="term">
    <div class="titlebar"><div class="ttl">${icon('terminal', 15)}<span id="tt">mist</span></div>
      <div class="wc"><button data-w="minimize">${icon('minimize', 14)}</button><button data-w="maximize">${icon('maximize', 12)}</button><button class="x" data-w="close">${icon('close', 14)}</button></div></div>
    <div class="scr" id="scr"><div id="out"></div><div class="prompt"><span class="p" id="pp"></span><input id="in" spellcheck="false" autocomplete="off"></div></div>
  </div>`;
  const scr = UI.$('#scr'), out = UI.$('#out'), input = UI.$('#in'), pp = UI.$('#pp');
  let cwd = await API.invoke('term:cwd') || '~';
  const history = [];
  let hi = 0, running = null, seq = 0;

  UI.$('.wc').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; if (b.dataset.w === 'close') closeWindow(); else API.invoke('win:' + b.dataset.w); });
  scr.addEventListener('mouseup', () => { if (!window.getSelection().toString()) input.focus(); });

  const short = p => {
    const home = 'C:\\Users\\' + info.user;
    return p.toLowerCase().startsWith(home.toLowerCase()) ? '~' + p.slice(home.length) : p;
  };
  function prompt() {
    pp.innerHTML = `<b>${UI.esc(short(cwd))}</b> ❯`;
    UI.$('#tt').textContent = 'mist — ' + short(cwd);
  }
  const print = (html) => { out.insertAdjacentHTML('beforeend', html); scr.scrollTop = scr.scrollHeight; };
  const text = (t, cls = '') => print(`<pre class="${cls}">${UI.esc(t)}</pre>`);

  // ---- fetch ----
  const LOGO = [
    ' __  __ ___ ____ _____',
    '|  \\/  |_ _/ ___|_   _|',
    '| |\\/| || |\\___ \\ | |',
    '| |  | || | ___) || |',
    '|_|  |_|___|____/ |_|',
    '',
    '   ~  .  ~~  .  ~'
  ].join('\n');
  async function fetchCmd() {
    const st = await API.invoke('sys:stats');
    const rows = [
      ['⌂', 'os', info.os], ['◇', 'kernel', info.kernel], ['◷', 'uptime', UI.uptime(st.uptime)],
      ['›', 'shell', info.shell], ['▤', 'mem', `${UI.gb(st.memUsed)} GiB / ${UI.gb(st.memTotal)} GiB`],
      ['▣', 'cpu', info.cpu], ['▦', 'gpu', info.gpu || '–'], ['◉', 'user', info.user], ['◎', 'host', info.host]
    ];
    print(`<div class="ff"><pre class="logo">${UI.esc(LOGO)}</pre><div class="box">${rows.map(r =>
      `<div><em>${r[0]}</em><em>${r[1]}</em><span>${UI.esc(r[2])}</span></div>`).join('')}</div></div>`);
  }

  // ---- Train (sl) ----
  const TRAIN = [
    '                 (  )  (@@) ( )  (@)  ()   @@   O    @',
    '            (@@@)',
    '          (    )',
    '        ( )',
    '      __[]__      ________________   ________________',
    '  ___|______|____|  ___    ___    |=|  ___    ___    |',
    ' |  M I S T   |  | |___|  |___|   |=| |___|  |___|   |',
    ' |____________|__|________________|=|________________|',
    '  //(O)--(O)\\\\     (O)        (O)     (O)        (O)'
  ];
  const SMOKE2 = ['                 (@@)  ( )  (@)  ()  @@  O    @   ', '            ( )', '          (@@@ )', '        (  )'];
  function sl() {
    return new Promise(res => {
      const pre = document.createElement('pre');
      pre.className = 'train';
      out.appendChild(pre);
      const charW = 7.9;
      const cols = Math.floor(scr.clientWidth / charW) - 2;
      const len = Math.max(...TRAIN.map(l => l.length));
      let x = cols, frame = 0;
      const step = () => {
        const smoke = frame % 6 < 3 ? TRAIN.slice(0, 4) : SMOKE2;
        const lines = [...smoke, ...TRAIN.slice(4)];
        pre.textContent = lines.map(l => {
          const padded = x >= 0 ? ' '.repeat(x) + l : l.slice(-x);
          return padded.slice(0, cols);
        }).join('\n');
        scr.scrollTop = scr.scrollHeight;
        x -= 1; frame++;
        if (x < -len) { pre.remove(); res(); } else setTimeout(step, 28);
      };
      step();
    });
  }

  const HELP = [
    ['fetch', 'Show system info'], ['sl', 'A train passes by'], ['clean', 'Delete temp files'], ['ram', 'Free up memory'],
    ['opt', 'Open the optimizer'], ['dash', 'Open the dashboard'], ['theme light|dark', 'Switch color scheme'], ['clear', 'Clear the screen'], ['exit', 'Close the terminal'],
    ['<command>', 'Anything else runs in PowerShell (e.g. ipconfig, dir, ping)']
  ];

  async function exec(line) {
    const cmd = line.trim();
    print(`<div class="prompt"><span class="p"><b>${UI.esc(short(cwd))}</b> ❯</span><span>${UI.esc(line)}</span></div>`);
    if (!cmd) return;
    history.push(cmd); hi = history.length;
    const [c0, ...rest] = cmd.split(/\s+/);
    const c = c0.toLowerCase();
    if (c === 'clear' || c === 'cls') { out.innerHTML = ''; return; }
    if (c === 'help') { print(`<pre>${HELP.map(([a, b]) => `<b>${UI.esc(a.padEnd(18))}</b><span class="dim">${UI.esc(b)}</span>`).join('\n')}</pre>`); return; }
    if (c === 'fetch' || c === 'neofetch' || c === 'fastfetch' || c === 'mistfetch') return fetchCmd();
    if (c === 'sl') return sl();
    if (c === 'exit') return closeWindow();
    if (c === 'opt') { API.invoke('win:open', 'panel'); return text('Optimizer opened.', 'dim'); }
    if (c === 'dash') { API.invoke('win:open', 'dashboard', 'show'); return; }
    if (c === 'ram') { text('Freeing up memory …', 'dim'); const r = await API.invoke('opt:ram'); return text(`✓ ${UI.bytes(r.freed)} freed (${r.processes} processes)`, 'ok'); }
    if (c === 'clean') { text('Deleting temporary files …', 'dim'); const r = await API.invoke('opt:clean', ['usertemp', 'crash']); return text(`✓ ${UI.bytes(r.total)} freed`, 'ok'); }
    if (c === 'theme') {
      const v = (rest[0] || '').toLowerCase();
      const theme = /^dark$/.test(v) ? 'dark' : /^light$/.test(v) ? 'light' : /^(system|auto)$/.test(v) ? 'system' : null;
      if (!theme) return text('Usage: theme light | dark | system', 'err');
      await API.invoke('settings:set', { theme });
      return text('Color scheme: ' + v, 'dim');
    }
    // PowerShell
    const id = 't' + (++seq);
    input.disabled = true;
    const pre = document.createElement('pre');
    out.appendChild(pre);
    running = id;
    await new Promise(res => {
      const off = API.on('term:event', m => {
        if (m.id !== id) return;
        if (m.type === 'data') { const sp = document.createElement('span'); if (m.err) sp.className = 'err'; sp.textContent = m.text; pre.appendChild(sp); scr.scrollTop = scr.scrollHeight; }
        if (m.type === 'exit') {
          if (m.err) text(m.err, 'err');
          if (m.cwd) cwd = m.cwd;
          off(); res();
        }
      });
      API.invoke('term:exec', id, cmd);
    });
    running = null;
    input.disabled = false;
    prompt();
    input.focus();
  }

  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') { const v = input.value; input.value = ''; input.disabled = true; await exec(v); input.disabled = false; prompt(); input.focus(); scr.scrollTop = scr.scrollHeight; }
    else if (e.key === 'ArrowUp') { if (hi > 0) { hi--; input.value = history[hi]; } e.preventDefault(); }
    else if (e.key === 'ArrowDown') { if (hi < history.length) { hi++; input.value = history[hi] || ''; } e.preventDefault(); }
    else if (e.key === 'l' && e.ctrlKey) { out.innerHTML = ''; e.preventDefault(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'c' && e.ctrlKey && running && !window.getSelection().toString()) { API.invoke('term:kill', running); text('^C', 'dim'); }
  });

  prompt();
  text('Welcome to Mist. Type "help" for all commands.', 'dim');
  await fetchCmd();
  input.focus();
};
