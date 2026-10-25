/* =====================================================================
 *  ui/fx.js — v6 Fizik Tabanlı Efektler, Konfeti/Emoji Yağmuru,
 *  Parçacık Patlaması, Özel Ses Paketleri, Dinamik Sekme İkonu ve Gizlilik Kalkanı
 * ===================================================================== */
import { $ } from '../utils.js';

let currentSoundPack = localStorage.getItem('wa_sound_pack') || 'crystal';
let privacyShieldEnabled = localStorage.getItem('wa_privacy_shield') === '1';
let zenMode = false;

/* ---------------- 1. Özel Web Audio Ses Paketleri (#30) ---------------- */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function setSoundPack(pack) {
  currentSoundPack = pack || 'crystal';
  try { localStorage.setItem('wa_sound_pack', currentSoundPack); } catch {}
}

export function getSoundPack() {
  return currentSoundPack;
}

export function playFxSound(type = 'in') {
  if (currentSoundPack === 'silent') return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'nudge') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
    osc.frequency.setValueAtTime(220, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.32);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.36);
    return;
  }

  if (type === 'ring') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.18);
    osc.frequency.setValueAtTime(783.99, now + 0.36);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.start(now);
    osc.stop(now + 0.66);
    return;
  }

  const presets = {
    crystal: { wave: 'sine', f1: type === 'out' ? 587 : 740, f2: type === 'out' ? 880 : 1108, dur: 0.18 },
    classic: { wave: 'triangle', f1: type === 'out' ? 440 : 520, f2: type === 'out' ? 660 : 780, dur: 0.14 },
    scifi:   { wave: 'sine', f1: type === 'out' ? 320 : 960, f2: type === 'out' ? 920 : 480, dur: 0.22 },
    water:   { wave: 'sine', f1: 360, f2: 720, dur: 0.16 },
  };
  const p = presets[currentSoundPack] || presets.crystal;
  osc.type = p.wave;
  osc.frequency.setValueAtTime(p.f1, now);
  osc.frequency.exponentialRampToValueAtTime(p.f2, now + p.dur);
  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur + 0.04);
  osc.start(now);
  osc.stop(now + p.dur + 0.05);
}

/* ---------------- 2. İnteraktif Dalga (Ripple) Dokunuşu (#2) ---------------- */
export function initClickRipples() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button, .qa-card, .chat-item');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'fx-click-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }, { passive: true });
}

/* ---------------- 3. Parçacık Patlaması (Particle Burst) (#3) ---------------- */
export function triggerParticleBurst(x, y, color = '#00e5b3') {
  const container = document.createElement('div');
  container.className = 'fx-burst-container';
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;
  const count = 16;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const dist = 28 + Math.random() * 44;
    p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
    p.style.background = i % 2 === 0 ? color : '#38bdf8';
    container.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 700);
}

/* ---------------- 4. Tam Ekran Konfeti & Emoji Yağmuru (#12) ---------------- */
const CELEBRATION_EMOJIS = {
  '🎉': ['🎉', '🎊', '✨', '🥳', '🎈'],
  '🥳': ['🥳', '🎉', '🎂', '✨', '🎊'],
  '🎂': ['🎂', '🍰', '🕯️', '🎉', '🎈'],
  '❤️': ['❤️', '💖', '💘', '✨', '💕'],
  '🔥': ['🔥', '⚡', '💥', '✨', '🧡'],
  '✨': ['✨', '⭐', '🌟', '💫', '💎'],
  '👏': ['👏', '🙌', '🌟', '🎉', '💯'],
  '💯': ['💯', '🔥', '🚀', '⚡', '🏆'],
};

export function checkAndTriggerCelebration(text) {
  if (!text) return;
  const trimmed = text.trim();
  const pool = CELEBRATION_EMOJIS[trimmed];
  if (pool) triggerEmojiRain(pool);
}

export function triggerEmojiRain(emojiPool = ['🎉', '✨', '🎊', '🥳']) {
  const wrap = document.createElement('div');
  wrap.className = 'fx-emoji-rain';
  const count = 28;
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.textContent = emojiPool[i % emojiPool.length];
    span.style.left = `${Math.random() * 96}%`;
    span.style.animationDelay = `${Math.random() * 0.8}s`;
    span.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    span.style.fontSize = `${20 + Math.random() * 18}px`;
    wrap.appendChild(span);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3400);
}

/* ---------------- 5. Çift Tıklama Dev 3B Kalp Animasyonu (#18) ---------------- */
export function triggerBigHeart(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const heart = document.createElement('div');
  heart.className = 'fx-big-heart';
  heart.textContent = '❤️';
  heart.style.left = `${cx}px`;
  heart.style.top = `${cy}px`;
  document.body.appendChild(heart);
  triggerParticleBurst(cx, cy, '#f43f5e');
  setTimeout(() => heart.remove(), 900);
}

/* ---------------- 6. 3B Paralaks Kart Eğimi (#4) ---------------- */
export function init3DParallaxCards() {
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.qa-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(500px) rotateX(${(-y * 10).toFixed(1)}deg) rotateY(${(x * 10).toFixed(1)}deg) translateY(-3px)`;
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest('.qa-card');
    if (card && !card.contains(e.relatedTarget)) {
      card.style.transform = '';
    }
  }, { passive: true });
}

/* ---------------- 7. Dinamik Sekme İkonu (Favicon Badge) (#99) ---------------- */
let faviconCanvas = null;
export function updateFaviconBadge(unreadCount = 0) {
  if (!faviconCanvas) {
    faviconCanvas = document.createElement('canvas');
    faviconCanvas.width = 64;
    faviconCanvas.height = 64;
  }
  const ctx = faviconCanvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  // Yuvarlak Zümrüt İkon Gövdesi
  const grad = ctx.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, '#00e5b3');
  grad.addColorStop(1, '#007a63');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(4, 4, 56, 56, 16);
  ctx.fill();

  // Sohbet İkonu
  ctx.fillStyle = '#04221b';
  ctx.beginPath();
  ctx.roundRect(16, 18, 32, 22, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, 40);
  ctx.lineTo(16, 48);
  ctx.lineTo(28, 40);
  ctx.fill();

  // Okunmamış Sayacı Rozeti
  if (unreadCount > 0) {
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(48, 16, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#070d12';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unreadCount > 9 ? '9+' : String(unreadCount), 48, 17);
  }

  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = faviconCanvas.toDataURL('image/png');
}

/* ---------------- 8. Ekran Gizlilik Kalkanı (Privacy Blur) (#82) ---------------- */
export function initPrivacyShield() {
  const applyBlur = (blur) => {
    document.body.classList.toggle('privacy-blurred', blur);
  };

  window.addEventListener('blur', () => {
    if (privacyShieldEnabled) applyBlur(true);
  });
  window.addEventListener('focus', () => {
    applyBlur(false);
  });
}

export function togglePrivacyShield(forceState) {
  privacyShieldEnabled = typeof forceState === 'boolean' ? forceState : !privacyShieldEnabled;
  try { localStorage.setItem('wa_privacy_shield', privacyShieldEnabled ? '1' : '0'); } catch {}
  return privacyShieldEnabled;
}

export function isPrivacyShieldEnabled() {
  return privacyShieldEnabled;
}

export function triggerImmediatePrivacyLock() {
  document.body.classList.toggle('privacy-blurred');
}

/* ---------------- 9. Zen Odak Modu (Sol Panel Daraltma) (#100) ---------------- */
export function toggleZenMode() {
  zenMode = !zenMode;
  const app = $('app');
  if (app) app.classList.toggle('zen-mode', zenMode);
  return zenMode;
}

export function isZenMode() {
  return zenMode;
}

/* ---------------- 10. Ekran Titretme (Nudge Shake) (#57) ---------------- */
export function triggerScreenShake() {
  const chat = $('chat');
  if (!chat) return;
  chat.classList.remove('fx-nudge-shake');
  void chat.offsetWidth;
  chat.classList.add('fx-nudge-shake');
  playFxSound('nudge');
  setTimeout(() => chat.classList.remove('fx-nudge-shake'), 700);
}
