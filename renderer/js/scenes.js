'use strict';
// Procedural SVG backgrounds (no third-party images)
(function () {
  let counter = 0;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function ridge(seed, baseY, amp, rough, w = 1920, h = 1080) {
    const r = rng(seed);
    const pts = [];
    const n = 48;
    let y = baseY;
    for (let i = 0; i <= n; i++) {
      const x = i / n * w;
      y += (r() - 0.5) * rough;
      y = baseY + (y - baseY) * 0.85 + Math.sin(i / n * Math.PI * (2 + seed % 3) + seed) * amp * 0.35;
      pts.push([x, y]);
    }
    let d = `M0,${h} L0,${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      d += ` Q${x0.toFixed(1)},${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`;
    }
    return d + ` L${w},${pts[pts.length - 1][1].toFixed(1)} L${w},${h} Z`;
  }

  const PAL = {
    light: { sky0: '#d6d6da', sky1: '#f3f3f4', water0: '#ebebed', water1: '#d4d4d8', hills: '#b4b4ba', ink: '#262629', fog: '#ffffff', minimal0: '#f4f4f5', minimal1: '#dcdce0' },
    dark: { sky0: '#0f0f11', sky1: '#2a2a2f', water0: '#232327', water1: '#101012', hills: '#3c3c42', ink: '#060607', fog: '#4a4a52', minimal0: '#1c1c20', minimal1: '#0e0e10' }
  };

  function fogLayer(c, anim) {
    return `<g class="${anim ? 'fog-anim' : ''}" opacity=".9">
      <ellipse class="d1" cx="420" cy="600" rx="620" ry="70" fill="url(#fogG)"/>
      <ellipse class="d2" cx="1500" cy="575" rx="700" ry="60" fill="url(#fogG)"/>
      <ellipse class="d3" cx="980" cy="700" rx="900" ry="90" fill="url(#fogG)" opacity=".7"/>
      <ellipse class="d1" cx="1700" cy="840" rx="520" ry="80" fill="url(#fogG)" opacity=".5"/>
      <ellipse class="d2" cx="260" cy="900" rx="560" ry="90" fill="url(#fogG)" opacity=".45"/>
    </g>`;
  }

  function defs(c) {
    return `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.sky0}"/><stop offset="1" stop-color="${c.sky1}"/></linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.water0}"/><stop offset="1" stop-color="${c.water1}"/></linearGradient>
      <radialGradient id="fogG"><stop offset="0" stop-color="${c.fog}" stop-opacity=".85"/><stop offset="1" stop-color="${c.fog}" stop-opacity="0"/></radialGradient>
      <linearGradient id="reflMask" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="refl" maskUnits="userSpaceOnUse" x="0" y="652" width="1920" height="430"><rect x="0" y="652" width="1920" height="430" fill="url(#reflMask)"/></mask>
      <filter id="b2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>
      <filter id="b6" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="b14" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .05 0"/></filter>
    </defs>`;
  }

  function torii(c) {
    return `<g fill="${c.ink}">
      <path d="M720 436 Q760 452 806 452 L1114 452 Q1160 452 1200 436 L1196 451 Q1160 467 1114 467 L806 467 Q760 467 724 451 Z"/>
      <rect x="772" y="466" width="376" height="12" rx="1"/>
      <rect x="952" y="477" width="16" height="36"/>
      <rect x="806" y="512" width="308" height="12" rx="1"/>
      <path d="M851 477 L869 477 L871 652 L849 652 Z"/>
      <path d="M1051 477 L1069 477 L1071 652 L1049 652 Z"/>
      <rect x="845" y="640" width="30" height="12" rx="2" opacity=".85"/>
      <rect x="1045" y="640" width="30" height="12" rx="2" opacity=".85"/>
    </g>`;
  }

  function sceneTorii(c, anim) {
    return `${defs(c)}
      <rect width="1920" height="600" fill="url(#sky)"/>
      <rect y="560" width="1920" height="520" fill="url(#water)"/>
      <g filter="url(#b6)" opacity=".55">
        <path d="M0 566 Q120 548 240 554 Q360 538 470 552 Q560 546 640 560 L640 572 L0 572 Z" fill="${c.hills}"/>
        <path d="M1240 562 Q1330 540 1430 548 Q1530 530 1640 546 Q1760 540 1920 552 L1920 572 L1240 572 Z" fill="${c.hills}"/>
      </g>
      <rect y="559" width="1920" height="3" fill="${c.hills}" opacity=".18" filter="url(#b2)"/>
      ${torii(c)}
      <g mask="url(#refl)"><g transform="translate(0 1304) scale(1 -1)" filter="url(#b2)">${torii(c)}</g></g>
      <g opacity=".22" stroke="${c.ink}" stroke-width="1.2" fill="none" filter="url(#b2)">
        <path d="M820 662 Q960 657 1100 662"/><path d="M790 684 Q960 678 1130 684"/><path d="M860 706 Q960 702 1060 706"/>
      </g>
      <g filter="url(#b14)">${fogLayer(c, anim)}</g>
      <rect width="1920" height="1080" filter="url(#grain)"/>`;
  }

  function sceneMountains(c, anim, dark) {
    const layers = dark ? ['#2c2c31', '#232327', '#1a1a1d', '#111113'] : ['#cfcfd4', '#b9b9bf', '#a1a1a8', '#87878f'];
    let g = '';
    const bases = [470, 580, 690, 820];
    layers.forEach((col, i) => {
      g += `<path d="${ridge(17 + i * 31, bases[i], 70 + i * 25, 46 + i * 10)}" fill="${col}" ${i === 0 ? 'filter="url(#b2)"' : ''}/>`;
      g += `<rect y="${bases[i] + 40}" width="1920" height="${170 + i * 20}" fill="url(#fogBand)" opacity="${0.75 - i * 0.12}"/>`;
    });
    return `${defs(c)}
      <defs><linearGradient id="fogBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.sky1}" stop-opacity="0"/><stop offset=".55" stop-color="${c.sky1}" stop-opacity=".9"/><stop offset="1" stop-color="${c.sky1}" stop-opacity="0"/></linearGradient></defs>
      <rect width="1920" height="1080" fill="url(#sky)"/>
      <circle cx="1380" cy="330" r="70" fill="${c.sky1}" opacity=".9" filter="url(#b6)"/>
      ${g}
      <g filter="url(#b14)">${fogLayer(c, anim)}</g>
      <rect width="1920" height="1080" filter="url(#grain)"/>`;
  }

  function sceneMinimal(c, anim) {
    return `${defs(c)}
      <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.minimal0}"/><stop offset="1" stop-color="${c.minimal1}"/></linearGradient></defs>
      <rect width="1920" height="1080" fill="url(#mg)"/>
      <g filter="url(#b14)" class="${anim ? 'fog-anim' : ''}">
        <ellipse class="d1" cx="520" cy="340" rx="520" ry="300" fill="${c.fog}" opacity=".35"/>
        <ellipse class="d2" cx="1460" cy="780" rx="640" ry="320" fill="${c.hills}" opacity=".18"/>
      </g>
      <rect width="1920" height="1080" filter="url(#grain)"/>`;
  }

  window.Scenes = {
    list: [
      { id: 'torii', name: 'Torii in the mist' },
      { id: 'mountains', name: 'Misty mountains' },
      { id: 'minimal', name: 'Minimal' }
    ],
    render(id, dark = false, anim = false) {
      const c = dark ? PAL.dark : PAL.light;
      const uid = 'm' + (++counter);
      const body = (id === 'mountains' ? sceneMountains(c, anim, dark) : id === 'minimal' ? sceneMinimal(c, anim) : sceneTorii(c, anim))
        .replace(/id="(\w+)"/g, `id="$1_${uid}"`).replace(/url\(#(\w+)\)/g, `url(#$1_${uid})`);
      return `<svg class="scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
    }
  };
})();
