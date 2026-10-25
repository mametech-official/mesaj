/* =====================================================================
 *  ui/wallpaper-picker.js — v6 Tema & Görsel Kimlik Stüdyosu (#5-#8, #21-#30, #82)
 * ===================================================================== */
import { $, el } from '../utils.js';
import { icon, hydrateIcons } from './icons.js';
import { setLiveBgMode } from './canvas-bg.js';
import { setSoundPack, getSoundPack, playFxSound, togglePrivacyShield, isPrivacyShieldEnabled } from './fx.js';

export const THEMES = [
  { id: 'aurora',    name: 'Zümrüt Aurora' },
  { id: 'nebula',    name: 'Kozmik Bulutsu' },
  { id: 'matrix',    name: 'Matrix Yağmur' },
  { id: 'fireflies', name: 'Ateşböcekleri' },
  { id: 'sky',       name: 'Dinamik Gökyüzü' },
  { id: 'midnight',  name: 'Gece Mavisi' },
  { id: 'classic',   name: 'Klasik Doodle' },
  { id: 'oled',      name: 'OLED Saf Koyu' },
  { id: 'clean',     name: 'Sade Gradyan' },
];

const ACCENTS = [
  {
    id: 'emerald',
    color: '#00a884',
    hover: '#00c49a',
    bright: '#00e5b3',
    glow: 'rgba(0, 229, 179, 0.35)',
    active: 'rgba(0, 229, 179, 0.14)',
    bubbleOut: '#005c4b',
    grad: 'linear-gradient(135deg, #00755e 0%, #004f40 100%)',
  },
  {
    id: 'purple',
    color: '#9333ea',
    hover: '#a855f7',
    bright: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.35)',
    active: 'rgba(192, 132, 252, 0.14)',
    bubbleOut: '#4c1d95',
    grad: 'linear-gradient(135deg, #7e22ce 0%, #4c1d95 100%)',
  },
  {
    id: 'sapphire',
    color: '#2563eb',
    hover: '#3b82f6',
    bright: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.35)',
    active: 'rgba(96, 165, 250, 0.14)',
    bubbleOut: '#1e3a8a',
    grad: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
  },
  {
    id: 'rose',
    color: '#e11d48',
    hover: '#f43f5e',
    bright: '#fb7185',
    glow: 'rgba(251, 113, 133, 0.35)',
    active: 'rgba(251, 113, 133, 0.14)',
    bubbleOut: '#881337',
    grad: 'linear-gradient(135deg, #be123c 0%, #881337 100%)',
  },
  {
    id: 'amber',
    color: '#d97706',
    hover: '#f59e0b',
    bright: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.35)',
    active: 'rgba(251, 191, 36, 0.14)',
    bubbleOut: '#78350f',
    grad: 'linear-gradient(135deg, #b45309 0%, #78350f 100%)',
  },
  {
    id: 'cyan',
    color: '#0891b2',
    hover: '#06b6d4',
    bright: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.35)',
    active: 'rgba(34, 211, 238, 0.14)',
    bubbleOut: '#164e63',
    grad: 'linear-gradient(135deg, #0e7490 0%, #164e63 100%)',
  },
];

const THEME_WAVE_COLORS = {
  aurora:    { primary: '#00e5b3', secondary: '#38bdf8', accent: 'emerald' },
  nebula:    { primary: '#c084fc', secondary: '#f472b6', accent: 'purple' },
  matrix:    { primary: '#10b981', secondary: '#34d399', accent: 'emerald' },
  fireflies: { primary: '#facc15', secondary: '#10b981', accent: 'amber' },
  sky:       { primary: '#fb923c', secondary: '#38bdf8', accent: 'amber' },
  midnight:  { primary: '#38bdf8', secondary: '#818cf8', accent: 'sapphire' },
  classic:   { primary: '#00a884', secondary: '#00e5b3', accent: 'emerald' },
  oled:      { primary: '#00e5b3', secondary: '#0ea5e9', accent: 'emerald' },
  clean:     { primary: '#22d3ee', secondary: '#38bdf8', accent: 'cyan' },
};

let currentTheme = 'aurora';
let currentOpacity = 18;
let currentAccent = 'emerald';
let currentBubbleStyle = 'modern';
let currentFontSize = '14.5px';
let compactMode = false;

let waveRafId = null;

function ensureWaveCanvas() {
  let cv = document.getElementById('fx-wave-canvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'fx-wave-canvas';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (cv.width !== w * dpr || cv.height !== h * dpr) {
    cv.width = w * dpr;
    cv.height = h * dpr;
  }
  return { cv, ctx: cv.getContext('2d'), w, h, dpr };
}

/**
 * yNorm (0..1) ve p (0..1) için sağdan sola kıvrılarak ilerleyen
 * çok harmonikli sinüzoidal dalga cephesinin X koordinatını hesaplar.
 */
function calcWaveX(yNorm, p, w, phaseShift = 0) {
  const ease = 1 - Math.pow(1 - p, 2.4);
  const baseX = (w + 130) * (1 - ease) + (-160) * ease;
  const env = Math.pow(Math.sin(Math.min(1, Math.max(0, p)) * Math.PI), 0.6);
  const w1 = Math.sin(yNorm * Math.PI * 4.5 - p * Math.PI * 5.5 + phaseShift) * 74;
  const w2 = Math.cos(yNorm * Math.PI * 8.0 + p * Math.PI * 7.5 + phaseShift * 1.35) * 36;
  const w3 = Math.sin(yNorm * Math.PI * 2.5 + p * Math.PI * 3.5 - phaseShift * 0.7) * 30;
  return baseX + (w1 + w2 + w3) * env;
}

function buildWavyPolygonKeyframes(w, h) {
  const STEPS = 28;
  const Y_PTS = 38;
  const frames = [];
  for (let k = 0; k <= STEPS; k++) {
    const p = k / STEPS;
    const pts = [`${w + 260}px -80px`, `${w + 260}px ${h + 80}px`];
    for (let i = Y_PTS; i >= 0; i--) {
      const yNorm = i / Y_PTS;
      const y = Math.round(yNorm * h);
      const x = Math.round(calcWaveX(yNorm, p, w, 0));
      pts.push(`${x}px ${y}px`);
    }
    frames.push({ clipPath: `polygon(${pts.join(', ')})` });
  }
  return frames;
}

function startCanvasLiquidWaves(primaryColor, secondaryColor, duration = 1050) {
  if (waveRafId) cancelAnimationFrame(waveRafId);
  const { ctx, w, h, dpr } = ensureWaveCanvas();
  const start = performance.now();
  const Y_STEPS = 64;

  function drawRibbon(p, phaseFront, offsetFront, phaseBack, offsetBack, colorA, alphaA, colorB, alphaB) {
    const env = Math.pow(Math.sin(p * Math.PI), 0.65);
    ctx.beginPath();
    let minX = w, maxX = 0;
    for (let i = 0; i <= Y_STEPS; i++) {
      const yNorm = i / Y_STEPS;
      const y = yNorm * h;
      const x = calcWaveX(yNorm, p, w, phaseFront) + offsetFront * env;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = Y_STEPS; i >= 0; i--) {
      const yNorm = i / Y_STEPS;
      const y = yNorm * h;
      const x = calcWaveX(yNorm, p, w, phaseBack) + offsetBack * env;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const grad = ctx.createLinearGradient(minX - 20, 0, maxX + 40, 0);
    grad.addColorStop(0, hexToRgba(colorA, alphaA * env));
    grad.addColorStop(0.55, hexToRgba(colorB, alphaB * env));
    grad.addColorStop(1, hexToRgba(colorB, 0));
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (p < 1) {
      const env = Math.pow(Math.sin(p * Math.PI), 0.65);

      // 1. Arka geniş sıvı dalga kuşağı
      drawRibbon(p, 0, -8, 1.1, 220, primaryColor, 0.62, secondaryColor, 0.34);

      // 2. Faz farkıyla kesişen ikinci ipek dalga kuşağı
      drawRibbon(p, 2.1, -46, 0.5, 135, secondaryColor, 0.54, primaryColor, 0.28);

      // 3. Üçüncü ince köpük dalgası
      drawRibbon(p, 4.0, -24, 2.8, 70, '#ffffff', 0.28, primaryColor, 0.18);

      // 4. Ana dalga sırtı parlak çizgi (Crest)
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= Y_STEPS; i++) {
        const yNorm = i / Y_STEPS;
        const x = calcWaveX(yNorm, p, w, 0);
        const y = yNorm * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexToRgba('#ffffff', 0.88 * env);
      ctx.lineWidth = 3.5;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 24;
      ctx.stroke();

      // İkincil ince dalga teli
      ctx.beginPath();
      for (let i = 0; i <= Y_STEPS; i++) {
        const yNorm = i / Y_STEPS;
        const x = calcWaveX(yNorm, p, w, 2.1) - 42 * env;
        const y = yNorm * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexToRgba(secondaryColor, 0.78 * env);
      ctx.lineWidth = 2.2;
      ctx.shadowColor = secondaryColor;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.restore();

      waveRafId = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, w, h);
      waveRafId = null;
    }
  }

  waveRafId = requestAnimationFrame(frame);
}

function hexToRgba(hex, alpha) {
  const clean = (hex || '#00e5b3').replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/**
 * Tema veya renk değiştiğinde sağdan sola kıvrılarak ilerleyen
 * gerçek sinüzoidal sıvı dalga (View Transition + 60fps Canvas Dalga) geçişi üretir.
 */
export function triggerThemeWave(applyMutation) {
  applyMutation();
}

export function getCurrentTheme() {
  return currentTheme || document.documentElement.dataset.theme || 'aurora';
}

function setAccentVariables(found) {
  currentAccent = found.id;
  const root = document.documentElement.style;
  root.setProperty('--accent', found.color);
  root.setProperty('--accent-hover', found.hover);
  root.setProperty('--accent-bright', found.bright);
  root.setProperty('--accent-glow', found.glow);
  root.setProperty('--bg-active', found.active);
  root.setProperty('--bubble-out', found.bubbleOut);
  root.setProperty('--bubble-out-grad', found.grad);
  try { localStorage.setItem('wa_accent', currentAccent); } catch {}
}

export function applyTheme(themeId, opacity, opts = {}) {
  const nextTheme = themeId || currentTheme || 'aurora';
  const nextOpacity = typeof opacity === 'number' ? opacity : currentOpacity;
  const waveCfg = THEME_WAVE_COLORS[nextTheme] || THEME_WAVE_COLORS.aurora;

  triggerThemeWave(() => {
    currentTheme = nextTheme;
    currentOpacity = nextOpacity;

    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.style.setProperty('--doodle-opacity', (currentOpacity / 100).toString());
    setLiveBgMode(currentTheme);

    // Kullanıcı etkileşimiyle tema seçildiğinde temanın kendi vurgu rengini de uygula
    if (!opts?.silent && !opts?.keepAccent && waveCfg.accent) {
      const matchingAccent = ACCENTS.find(a => a.id === waveCfg.accent);
      if (matchingAccent) setAccentVariables(matchingAccent);
    }

    try {
      localStorage.setItem('wa_theme', currentTheme);
      localStorage.setItem('wa_opacity', currentOpacity.toString());
    } catch {}

    updatePickerUI();
  }, waveCfg.primary, { ...opts, secondaryColor: waveCfg.secondary });
}

export function applyAccent(accentId, opts = {}) {
  const found = ACCENTS.find(a => a.id === accentId) || ACCENTS[0];

  triggerThemeWave(() => {
    setAccentVariables(found);
    updatePickerUI();
  }, found.bright, { ...opts, secondaryColor: found.color });
}

export function applyBubbleStyle(styleId, opts = {}) {
  const foundAccent = ACCENTS.find(a => a.id === currentAccent) || ACCENTS[0];
  triggerThemeWave(() => {
    currentBubbleStyle = styleId || 'modern';
    document.documentElement.dataset.bubble = currentBubbleStyle;
    try { localStorage.setItem('wa_bubble_style', currentBubbleStyle); } catch {}
    updatePickerUI();
  }, foundAccent.bright, { ...opts, secondaryColor: foundAccent.color });
}

export function applyFontSize(sizeStr) {
  currentFontSize = sizeStr || '14.5px';
  document.documentElement.style.setProperty('--chat-font-size', currentFontSize);
  try { localStorage.setItem('wa_font_size', currentFontSize); } catch {}
  updatePickerUI();
}

export function applyCompactMode(enabled) {
  compactMode = !!enabled;
  document.body.classList.toggle('compact-mode', compactMode);
  try { localStorage.setItem('wa_compact', compactMode ? '1' : '0'); } catch {}
}

function updatePickerUI() {
  const modal = $('wallpaper-modal');
  if (!modal) return;

  modal.querySelectorAll('.theme-option').forEach(elOpt => {
    elOpt.classList.toggle('active', elOpt.dataset.theme === currentTheme);
  });

  modal.querySelectorAll('.opacity-pill').forEach(elPill => {
    elPill.classList.toggle('active', Number(elPill.dataset.val) === currentOpacity);
  });

  modal.querySelectorAll('.accent-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.accent === currentAccent);
  });

  modal.querySelectorAll('.bubble-style-pill').forEach(bp => {
    bp.classList.toggle('active', bp.dataset.bstyle === currentBubbleStyle);
  });

  modal.querySelectorAll('.fontsize-pill').forEach(fp => {
    fp.classList.toggle('active', fp.dataset.fsize === currentFontSize);
  });

  modal.querySelectorAll('.sound-pill').forEach(sp => {
    sp.classList.toggle('active', sp.dataset.sound === getSoundPack());
  });

  const slider = $('opacity-slider');
  const valLabel = $('opacity-val');
  if (slider) slider.value = currentOpacity;
  if (valLabel) valLabel.textContent = `%${currentOpacity}`;
}

export function openWallpaperPicker() {
  const modal = $('wallpaper-modal');
  if (!modal) return;
  injectV6StudioControls(modal);
  updatePickerUI();
  modal.classList.add('open');
}

export function closeWallpaperPicker() {
  const modal = $('wallpaper-modal');
  if (modal) modal.classList.remove('open');
}

function injectV6StudioControls(modal) {
  const body = modal.querySelector('.wp-body');
  if (!body || body.dataset.v6Ready === '1') return;
  body.dataset.v6Ready = '1';

  // Yeni 4 Canlı Sahneyi Tema Izgarasına Ekle
  const grid = body.querySelector('.theme-grid');
  if (grid) {
    const extraThemes = [
      { id: 'nebula',    name: 'Kozmik Bulutsu' },
      { id: 'matrix',    name: 'Matrix Yağmur' },
      { id: 'fireflies', name: 'Ateşböcekleri' },
      { id: 'sky',       name: 'Dinamik Gökyüzü' },
    ];
    extraThemes.forEach(t => {
      if (!grid.querySelector(`[data-theme="${t.id}"]`)) {
        const btn = el('button', 'theme-option');
        btn.type = 'button';
        btn.dataset.theme = t.id;
        btn.innerHTML = `<div class="theme-thumb ${t.id}"></div><span class="theme-name">${t.name}</span>`;
        btn.addEventListener('click', () => applyTheme(t.id, currentOpacity));
        grid.appendChild(btn);
      }
    });
  }

  // V6 Ekstra Kişiselleştirme Kontrolleri (#22, #23, #25, #29, #30, #82)
  const extra = el('div', 'wp-v6-extras');
  extra.innerHTML = `
    <div class="wp-section-title" style="margin-top:18px">Vurgu Rengi Paleti (#22)</div>
    <div class="accent-row">
      ${ACCENTS.map(a => `<button type="button" class="accent-swatch" data-accent="${a.id}" style="background:${a.bright}" title="${a.id}"></button>`).join('')}
    </div>

    <div class="wp-section-title" style="margin-top:16px">Mesaj Balonu Stili (#23) &amp; Yazı Boyutu (#25)</div>
    <div class="opacity-pills" style="margin-bottom:8px">
      <button type="button" class="opacity-pill bubble-style-pill" data-bstyle="modern">3B Gradyan</button>
      <button type="button" class="opacity-pill bubble-style-pill" data-bstyle="glass">Sıvı Cam</button>
      <button type="button" class="opacity-pill bubble-style-pill" data-bstyle="neon">Neon Çerçeve</button>
      <button type="button" class="opacity-pill bubble-style-pill" data-bstyle="round">Tam Yuvarlak</button>
    </div>
    <div class="opacity-pills">
      <button type="button" class="opacity-pill fontsize-pill" data-fsize="13px">Küçük</button>
      <button type="button" class="opacity-pill fontsize-pill" data-fsize="14.5px">Normal</button>
      <button type="button" class="opacity-pill fontsize-pill" data-fsize="16px">Büyük</button>
      <button type="button" class="opacity-pill fontsize-pill" data-fsize="18px">Dev</button>
    </div>

    <div class="wp-section-title" style="margin-top:16px">Bildirim Ses Paketi (#30)</div>
    <div class="opacity-pills">
      <button type="button" class="opacity-pill sound-pill" data-sound="crystal">${icon('diamond')} Kristal</button>
      <button type="button" class="opacity-pill sound-pill" data-sound="classic">${icon('bell')} Klasik</button>
      <button type="button" class="opacity-pill sound-pill" data-sound="scifi">${icon('rocket')} Bilim Kurgu</button>
      <button type="button" class="opacity-pill sound-pill" data-sound="water">${icon('droplet')} Su</button>
      <button type="button" class="opacity-pill sound-pill" data-sound="silent">${icon('volumeOff')} Sessiz</button>
    </div>

    <div class="wp-section-title" style="margin-top:16px">Görünüm &amp; Gizlilik Seçenekleri (#29, #82)</div>
    <div class="opacity-pills">
      <button type="button" class="opacity-pill" id="wp-toggle-compact">${icon('layout')} Kompakt Liste</button>
      <button type="button" class="opacity-pill" id="wp-toggle-privacy">${icon('shield')} Sekme Değişince Bulanıklaştır</button>
    </div>
  `;
  body.appendChild(extra);

  extra.querySelectorAll('.accent-swatch').forEach(sw => {
    sw.addEventListener('click', () => applyAccent(sw.dataset.accent));
  });
  extra.querySelectorAll('.bubble-style-pill').forEach(bp => {
    bp.addEventListener('click', () => applyBubbleStyle(bp.dataset.bstyle));
  });
  extra.querySelectorAll('.fontsize-pill').forEach(fp => {
    fp.addEventListener('click', () => applyFontSize(fp.dataset.fsize));
  });
  extra.querySelectorAll('.sound-pill').forEach(sp => {
    sp.addEventListener('click', () => {
      setSoundPack(sp.dataset.sound);
      playFxSound('in');
      updatePickerUI();
    });
  });

  const compBtn = $('wp-toggle-compact');
  if (compBtn) {
    compBtn.classList.toggle('active', compactMode);
    compBtn.addEventListener('click', () => {
      applyCompactMode(!compactMode);
      compBtn.classList.toggle('active', compactMode);
    });
  }

  const privBtn = $('wp-toggle-privacy');
  if (privBtn) {
    privBtn.classList.toggle('active', isPrivacyShieldEnabled());
    privBtn.addEventListener('click', () => {
      const st = togglePrivacyShield();
      privBtn.classList.toggle('active', st);
    });
  }
}

export function initWallpaperPicker() {
  try {
    const savedTheme = localStorage.getItem('wa_theme');
    const savedOpacity = localStorage.getItem('wa_opacity');
    const savedAccent = localStorage.getItem('wa_accent');
    const savedBubble = localStorage.getItem('wa_bubble_style');
    const savedFont = localStorage.getItem('wa_font_size');
    const savedCompact = localStorage.getItem('wa_compact');

    if (savedTheme) currentTheme = savedTheme;
    if (savedOpacity) currentOpacity = Number(savedOpacity);
    if (savedAccent) currentAccent = savedAccent;
    if (savedBubble) currentBubbleStyle = savedBubble;
    if (savedFont) currentFontSize = savedFont;
    if (savedCompact === '1') compactMode = true;
  } catch {}

  applyTheme(currentTheme, currentOpacity, { silent: true });
  applyAccent(currentAccent, { silent: true });
  applyBubbleStyle(currentBubbleStyle, { silent: true });
  applyFontSize(currentFontSize);
  applyCompactMode(compactMode);

  const trigger1 = $('theme-btn');
  const trigger2 = $('chat-theme-btn');
  const trigger3 = $('empty-theme-btn');
  if (trigger1) trigger1.addEventListener('click', openWallpaperPicker);
  if (trigger2) trigger2.addEventListener('click', openWallpaperPicker);
  if (trigger3) trigger3.addEventListener('click', openWallpaperPicker);

  const modal = $('wallpaper-modal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('#wp-close')) closeWallpaperPicker();
  });

  modal.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      applyTheme(opt.dataset.theme, currentOpacity, { x: e.clientX, y: e.clientY });
    });
  });

  modal.querySelectorAll('.opacity-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      applyTheme(currentTheme, Number(pill.dataset.val), { keepAccent: true });
    });
  });

  const slider = $('opacity-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      applyTheme(currentTheme, Number(e.target.value), { silent: true });
    });
  }

  hydrateIcons(modal);
}
