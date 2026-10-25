/* =====================================================================
 *  ui/fx.js — Ultra-Hafif Ses ve Görsel Efekt Yöneticisi (Maksimum Performans)
 * ===================================================================== */
import { $ } from '../utils.js';

let currentSoundPack = localStorage.getItem('wa_sound_pack') || 'crystal';
let privacyShieldEnabled = localStorage.getItem('wa_privacy_shield') === '1';
let zenMode = false;

/* ---------------- 1. Hafif Web Audio Ses Paketleri (#30) ---------------- */
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
  try {
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
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
      return;
    }

    if (type === 'ring') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.18);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.52);
      return;
    }

    const presets = {
      crystal: { wave: 'sine', f1: type === 'out' ? 587 : 740, f2: type === 'out' ? 880 : 1108, dur: 0.12 },
      classic: { wave: 'triangle', f1: type === 'out' ? 440 : 520, f2: type === 'out' ? 660 : 780, dur: 0.10 },
      scifi:   { wave: 'sine', f1: type === 'out' ? 320 : 960, f2: type === 'out' ? 920 : 480, dur: 0.14 },
      water:   { wave: 'sine', f1: 360, f2: 720, dur: 0.12 },
    };
    const p = presets[currentSoundPack] || presets.crystal;
    osc.type = p.wave;
    osc.frequency.setValueAtTime(p.f1, now);
    osc.frequency.exponentialRampToValueAtTime(p.f2, now + p.dur);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur + 0.03);
    osc.start(now);
    osc.stop(now + p.dur + 0.04);
  } catch {}
}

/* ---------------- 2-6. Performans İçin Devre Dışı Bırakılan Ağır DOM Efektleri ---------------- */
export function initClickRipples() {}
export function triggerParticleBurst() {}
export function checkAndTriggerCelebration() {}
export function triggerEmojiRain() {}
export function triggerBigHeart() {}
export function init3DParallaxCards() {}
export function updateFaviconBadge() {}

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
  setTimeout(() => chat.classList.remove('fx-nudge-shake'), 450);
}
