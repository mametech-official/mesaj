/* =====================================================================
 *  ui/lightbox.js — v6 Gelişmiş Lightbox (Zoom, Döndürme, İndirme) (#49)
 * ===================================================================== */
import { $, el } from '../utils.js';
import { icon } from './icons.js';

let scale = 1;
let deg = 0;

export function initLightbox() {
  const box = $('lightbox');
  if (!box) return;

  // Kontrol araç çubuğu oluştur
  if (!box.querySelector('.lb-toolbar')) {
    const bar = el('div', 'lb-toolbar');
    bar.innerHTML = `
      <button type="button" id="lb-zoom-in" title="Yakınlaştır">${icon('zoomIn')} Yakınlaştır</button>
      <button type="button" id="lb-zoom-out" title="Uzaklaştır">${icon('zoomOut')} Uzaklaştır</button>
      <button type="button" id="lb-rotate" title="90° Döndür">${icon('rotate')} Döndür</button>
      <button type="button" id="lb-download" title="İndir">${icon('download')} İndir</button>
      <button type="button" id="lb-close" title="Kapat">${icon('close')} Kapat</button>
    `;
    bar.addEventListener('click', (e) => e.stopPropagation());
    box.appendChild(bar);

    $('lb-zoom-in').addEventListener('click', () => { scale = Math.min(4, scale + 0.35); applyTransform(); });
    $('lb-zoom-out').addEventListener('click', () => { scale = Math.max(0.5, scale - 0.35); applyTransform(); });
    $('lb-rotate').addEventListener('click', () => { deg = (deg + 90) % 360; applyTransform(); });
    $('lb-download').addEventListener('click', () => {
      const img = box.querySelector('img');
      if (!img || !img.src) return;
      const a = document.createElement('a');
      a.href = img.src;
      a.download = `mesaj_gorsel_${Date.now()}.jpg`;
      a.target = '_blank';
      a.click();
    });
    $('lb-close').addEventListener('click', closeLightbox);
  }

  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(4, Math.max(0.5, scale + (e.deltaY < 0 ? 0.2 : -0.2)));
    applyTransform();
  }, { passive: false });

  box.addEventListener('click', (e) => {
    if (e.target === box) closeLightbox();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isLightboxOpen()) closeLightbox(); });
}

function applyTransform() {
  const img = $('lightbox')?.querySelector('img');
  if (img) img.style.transform = `scale(${scale}) rotate(${deg}deg)`;
}

export function openLightbox(src) {
  const box = $('lightbox');
  if (!box) return;
  scale = 1;
  deg = 0;
  const img = box.querySelector('img');
  img.src = src;
  img.style.transform = '';
  box.classList.add('open');
}

export function closeLightbox() {
  const box = $('lightbox');
  if (box) box.classList.remove('open');
}

export const isLightboxOpen = () => $('lightbox')?.classList.contains('open');
