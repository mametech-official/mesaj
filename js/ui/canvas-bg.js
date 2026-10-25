/* =====================================================================
 *  ui/canvas-bg.js — v6 60 FPS Canlı Grafik Motoru:
 *  Modlar: aurora, midnight, classic, oled, clean, matrix, fireflies, nebula, sky
 *  + Ses Frekansına Duyarlı (Audio-Reactive) Küreler (#9)
 * ===================================================================== */

const THEME_PALETTES = {
  aurora: {
    orbs: ['rgba(0, 212, 166, 0.16)', 'rgba(14, 165, 233, 0.13)', 'rgba(16, 185, 129, 0.11)'],
    particle: 'rgba(52, 211, 153, 0.48)',
    line: 'rgba(52, 211, 153, 0.13)',
  },
  midnight: {
    orbs: ['rgba(56, 189, 248, 0.16)', 'rgba(99, 102, 241, 0.14)', 'rgba(14, 165, 233, 0.11)'],
    particle: 'rgba(125, 211, 252, 0.48)',
    line: 'rgba(125, 211, 252, 0.13)',
  },
  classic: {
    orbs: ['rgba(0, 168, 132, 0.09)', 'rgba(37, 211, 102, 0.07)'],
    particle: 'rgba(134, 150, 160, 0.32)',
    line: 'rgba(134, 150, 160, 0.08)',
  },
  oled: {
    orbs: ['rgba(0, 212, 166, 0.07)', 'rgba(56, 189, 248, 0.05)'],
    particle: 'rgba(0, 212, 166, 0.35)',
    line: 'rgba(0, 212, 166, 0.09)',
  },
  clean: {
    orbs: ['rgba(0, 168, 132, 0.15)', 'rgba(83, 189, 235, 0.12)'],
    particle: 'rgba(233, 237, 239, 0.28)',
    line: 'rgba(233, 237, 239, 0.07)',
  },
  matrix: {
    orbs: ['rgba(16, 185, 129, 0.14)', 'rgba(5, 150, 105, 0.12)'],
    particle: 'rgba(52, 211, 153, 0.65)',
    line: 'rgba(16, 185, 129, 0.18)',
  },
  fireflies: {
    orbs: ['rgba(250, 204, 21, 0.12)', 'rgba(16, 185, 129, 0.12)'],
    particle: 'rgba(253, 224, 71, 0.78)',
    line: 'rgba(250, 204, 21, 0.10)',
  },
  nebula: {
    orbs: ['rgba(168, 85, 247, 0.18)', 'rgba(236, 72, 153, 0.14)', 'rgba(56, 189, 248, 0.14)'],
    particle: 'rgba(216, 180, 254, 0.58)',
    line: 'rgba(192, 132, 252, 0.14)',
  },
  sky: {
    orbs: ['rgba(251, 146, 60, 0.15)', 'rgba(56, 189, 248, 0.15)'],
    particle: 'rgba(254, 215, 170, 0.55)',
    line: 'rgba(125, 211, 252, 0.11)',
  },
};

const instances = [];
let activeTheme = 'aurora';
let audioReactiveLevel = 0; // 0..1 (#9 Ses duyarlı Aurora)

export function setLiveBgMode(themeId) {
  activeTheme = THEME_PALETTES[themeId] ? themeId : 'aurora';
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (const inst of instances) {
    try { inst.step(now); } catch {}
  }
}

export function setAudioReactiveLevel(level) {
  audioReactiveLevel = Math.min(1, Math.max(0, Number(level) || 0));
}

function attachCanvas(hostEl, opts = {}) {
  if (!hostEl || hostEl.querySelector(':scope > .live-bg-canvas')) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'live-bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hostEl.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  const mouse = { x: -9999, y: -9999 };

  const count = opts.count || 32;
  const particles = [];
  const orbs = [
    { rx: 0.2, ry: 0.25, vx: 0.00028, vy: 0.00021, radius: 220 },
    { rx: 0.78, ry: 0.7, vx: -0.00024, vy: 0.00029, radius: 260 },
    { rx: 0.5, ry: 0.45, vx: 0.00019, vy: -0.00025, radius: 200 },
  ];
  const shootingStars = [];
  const matrixCols = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hostEl.clientWidth || window.innerWidth;
    h = hostEl.clientHeight || window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!particles.length) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.42,
          vy: (Math.random() - 0.5) * 0.42,
          r: 1.2 + Math.random() * 2.1,
          phase: Math.random() * Math.PI * 2,
          char: String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)),
        });
      }
    }

    const cols = Math.floor(w / 22);
    matrixCols.length = 0;
    for (let i = 0; i < cols; i++) {
      matrixCols.push(Math.random() * h);
    }
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(hostEl);

  hostEl.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }, { passive: true });

  hostEl.addEventListener('pointerleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  }, { passive: true });

  function step(ts) {
    if (!w || !h || hostEl.hidden || hostEl.offsetParent === null) return;
    ctx.clearRect(0, 0, w, h);

    const pal = THEME_PALETTES[activeTheme] || THEME_PALETTES.aurora;
    const boost = 1 + audioReactiveLevel * 0.55;

    // 1. Yüzen Aurora / Bulutsu Işık Küreleri (Ses duyarlı büyüme #9)
    orbs.forEach((o, idx) => {
      o.rx += o.vx * boost;
      o.ry += o.vy * boost;
      if (o.rx < 0.08 || o.rx > 0.92) o.vx *= -1;
      if (o.ry < 0.08 || o.ry > 0.92) o.vy *= -1;

      const cx = o.rx * w;
      const cy = o.ry * h;
      const rad = o.radius * boost;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, pal.orbs[idx % pal.orbs.length]);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Özel Mod: Matrix Dijital Kod Yağmuru (#6)
    if (activeTheme === 'matrix') {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.26)';
      ctx.font = '12px monospace';
      for (let i = 0; i < matrixCols.length; i++) {
        const ch = String.fromCharCode(0x30A0 + ((i * 7 + Math.floor(ts * 0.015)) % 90));
        ctx.fillText(ch, i * 22, matrixCols[i]);
        matrixCols[i] += 1.4;
        if (matrixCols[i] > h && Math.random() > 0.975) matrixCols[i] = 0;
      }
    }

    // 3. Özel Mod: Kozmik Kayan Yıldızlar (#8)
    if (activeTheme === 'nebula' || activeTheme === 'sky') {
      if (Math.random() < 0.012 && shootingStars.length < 2) {
        shootingStars.push({
          x: Math.random() * w * 0.8,
          y: Math.random() * h * 0.35,
          vx: 6 + Math.random() * 4,
          vy: 2.5 + Math.random() * 2,
          life: 1,
        });
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.025;
        if (s.life <= 0) {
          shootingStars.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${s.life * 0.7})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 5, s.y - s.vy * 5);
        ctx.stroke();
      }
    }

    // 4. Parıldayan Mikro Parçacıklar, Ateşböcekleri (#7) ve Takımyıldızı Ağı
    ctx.fillStyle = pal.particle;
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx * boost;
      p.y += p.vy * boost;

      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      const dxm = p.x - mouse.x;
      const dym = p.y - mouse.y;
      const distM = Math.hypot(dxm, dym);
      if (distM < 120 && distM > 1) {
        p.x += (dxm / distM) * 0.65;
        p.y += (dym / distM) * 0.65;
      }

      const pulse = 0.55 + 0.45 * Math.sin(ts * 0.0025 + p.phase);
      const rad = (activeTheme === 'fireflies' ? p.r * 1.45 : p.r) * pulse * boost;

      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        if (Math.abs(dx) < 110 && Math.abs(dy) < 110) {
          const d = Math.hypot(dx, dy);
          if (d < 110) {
            ctx.globalAlpha = (1 - d / 110) * 0.7;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    audioReactiveLevel *= 0.92;
  }

  instances.push({ step });
}

let loopRunning = false;
function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  function frame(ts) {
    for (const inst of instances) inst.step(ts);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export function initLiveBackgrounds() {
  attachCanvas(document.getElementById('auth-screen'), { count: 28 });
  attachCanvas(document.getElementById('empty-state'), { count: 30 });
  attachCanvas(document.getElementById('messages-wrap'), { count: 26 });
  startLoop();
}
