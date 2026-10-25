/* ui/audio-player.js — WhatsApp tarzı ses oynatıcı (dalga formu + ilerleme) */
import { el, fmtDuration, seededRandom } from '../utils.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const BARS = 38;
let current = null;                        // şu an çalan Audio

export function stopAllAudio() {
  if (current) { current.pause(); current = null; }
}

/**
 * @param {{getSrc: () => Promise<string>, durationMs: number, seed: string}} opts
 */
export function createAudioPlayer({ getSrc, durationMs, seed }) {
  const root = el('div', 'audio-player');
  const btn = el('button', 'ap-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Oynat');
  btn.innerHTML = icon('play');

  const body = el('div', 'ap-body');
  const wave = el('div', 'ap-wave');
  const rnd = seededRandom(seed);
  const bars = [];
  for (let i = 0; i < BARS; i++) {
    const b = document.createElement('span');
    b.style.height = `${18 + Math.round(rnd() * 82)}%`;
    bars.push(b);
    wave.append(b);
  }
  const time = el('span', 'ap-time', fmtDuration(durationMs));
  body.append(wave, time);

  const speedBtn = el('button', 'ap-speed', '1x');
  speedBtn.type = 'button';
  speedBtn.title = 'Oynatma hızı';
  const rates = [1, 1.5, 2];
  let rateIdx = 0;
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rateIdx = (rateIdx + 1) % rates.length;
    const rate = rates[rateIdx];
    audio.playbackRate = rate;
    speedBtn.textContent = `${rate}x`;
  });

  root.append(btn, body, speedBtn);

  const audio = new Audio();
  audio.preload = 'none';
  let ready = false;
  const totalSec = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationMs / 1000) || 1;

  async function ensureSrc() {
    if (ready) return;
    audio.src = await getSrc();
    ready = true;
  }
  function paint(ratio) {
    const n = Math.round(ratio * BARS);
    bars.forEach((b, i) => b.classList.toggle('played', i < n));
  }
  function reset() {
    paint(0);
    time.textContent = fmtDuration(durationMs);
  }

  btn.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    try {
      await ensureSrc();
      if (current && current !== audio) current.pause();
      current = audio;
      await audio.play();
    } catch (err) {
      toast('Ses oynatılamadı.');
    }
  });
  wave.addEventListener('click', async (e) => {
    try {
      await ensureSrc();
      const r = wave.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      audio.currentTime = ratio * totalSec();
      paint(ratio);
    } catch (_) { /* yok say */ }
  });

  audio.addEventListener('play', () => {
    root.classList.add('playing');
    btn.innerHTML = icon('pause');
    btn.setAttribute('aria-label', 'Duraklat');
  });
  audio.addEventListener('pause', () => {
    root.classList.remove('playing');
    btn.innerHTML = icon('play');
    btn.setAttribute('aria-label', 'Oynat');
    if (current === audio) current = null;
  });
  audio.addEventListener('ended', () => { audio.currentTime = 0; reset(); });
  audio.addEventListener('timeupdate', () => {
    const t = audio.currentTime;
    paint(Math.min(1, t / totalSec()));
    time.textContent = fmtDuration(t * 1000);
  });
  audio.addEventListener('error', () => { if (ready) toast('Ses dosyası yüklenemedi.'); });

  return root;
}
