/* =====================================================================
 *  ui/media-preview.js — v6 Fotoğraf Önizleme + Filtreler, Döndürme,
 *  Tek Gösterimlik (View-Once) Modu ve Yükleme Çubuğu (#38, #41, #42)
 * ===================================================================== */
import { $, el, fmtSize, trErr } from '../utils.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

let currentUrl = null;
let sendHandler = null;
let busy = false;
let currentFilter = 'none';
let currentRotation = 0;
let viewOnce = false;

const FILTERS = [
  { id: 'none',      label: 'Orijinal',    css: 'none' },
  { id: 'cinema',    label: 'Sinematik',   css: 'contrast(1.18) saturate(1.22) brightness(0.96)' },
  { id: 'bw',        label: 'Siyah-Beyaz', css: 'grayscale(1) contrast(1.15)' },
  { id: 'vivid',     label: 'Canlı',       css: 'saturate(1.65) contrast(1.08)' },
  { id: 'retro',     label: 'Retro',       css: 'sepia(0.55) contrast(1.08) brightness(0.95)' },
  { id: 'cyber',     label: 'Siber',       css: 'hue-rotate(155deg) saturate(1.45)' },
];

export const isMediaPreviewOpen = () => $('media-preview').classList.contains('open');

export function openMediaPreview(file, onSend) {
  closeMediaPreview();
  currentUrl = URL.createObjectURL(file);
  sendHandler = onSend;
  currentFilter = 'none';
  currentRotation = 0;
  viewOnce = false;

  const img = $('mp-img');
  img.src = currentUrl;
  img.style.filter = 'none';
  img.style.transform = '';

  $('mp-name').textContent = file.name || 'Yapıştırılan görsel';
  $('mp-size').textContent = fmtSize(file.size);
  $('mp-caption').value = '';
  setProgress(null);

  ensureEditorToolbar();
  updateEditorToolbarUI();

  const root = $('media-preview');
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  root._file = file;
  setTimeout(() => $('mp-caption').focus(), 220);
}

function ensureEditorToolbar() {
  const stage = document.querySelector('#media-preview .mp-stage');
  if (!stage || stage.querySelector('.mp-editor-bar')) return;

  const bar = el('div', 'mp-editor-bar');
  FILTERS.forEach(f => {
    const b = el('button', 'mp-filter-pill', f.label);
    b.type = 'button';
    b.dataset.filter = f.id;
    b.addEventListener('click', () => {
      currentFilter = f.css;
      $('mp-img').style.filter = currentFilter;
      updateEditorToolbarUI(f.id);
    });
    bar.appendChild(b);
  });

  const rotBtn = el('button', 'mp-filter-pill');
  rotBtn.innerHTML = `${icon('rotate')} 90°`;
  rotBtn.type = 'button';
  rotBtn.addEventListener('click', () => {
    currentRotation = (currentRotation + 90) % 360;
    $('mp-img').style.transform = `rotate(${currentRotation}deg)`;
  });
  bar.appendChild(rotBtn);

  const voBtn = el('button', 'mp-filter-pill mp-vo-btn');
  voBtn.innerHTML = `${icon('eye')} Tek Gösterim`;
  voBtn.type = 'button';
  voBtn.addEventListener('click', () => {
    viewOnce = !viewOnce;
    voBtn.classList.toggle('active', viewOnce);
    toast(viewOnce ? 'Tek gösterimlik mod aktif' : 'Normal medya modu');
  });
  bar.appendChild(voBtn);

  stage.appendChild(bar);
}

function updateEditorToolbarUI(activeFilterId = 'none') {
  document.querySelectorAll('#media-preview .mp-filter-pill[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === activeFilterId);
  });
  const voBtn = document.querySelector('#media-preview .mp-vo-btn');
  if (voBtn) voBtn.classList.toggle('active', viewOnce);
}

async function processEditedImage(originalFile) {
  if ((currentFilter === 'none' && currentRotation === 0) || !originalFile.type.startsWith('image/')) {
    return originalFile;
  }
  return new Promise((resolve) => {
    const img = $('mp-img');
    const canvas = document.createElement('canvas');
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const swapped = currentRotation === 90 || currentRotation === 270;
    canvas.width = swapped ? h : w;
    canvas.height = swapped ? w : h;
    const ctx = canvas.getContext('2d');
    ctx.filter = currentFilter;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((currentRotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    canvas.toBlob((blob) => {
      if (!blob) { resolve(originalFile); return; }
      resolve(new File([blob], originalFile.name || 'duzenlenmis.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

export function closeMediaPreview() {
  const root = $('media-preview');
  if (!root.classList.contains('open') && !currentUrl) return;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
  root._file = null;
  sendHandler = null;
  setProgress(null);
  const url = currentUrl;
  currentUrl = null;
  if (url) setTimeout(() => URL.revokeObjectURL(url), 400);
}

function setProgress(percent) {
  const p = $('mp-progress');
  if (!p) return;
  if (percent === null) {
    p.hidden = true;
    return;
  }
  p.hidden = false;
  const bar = $('mp-progress-bar');
  if (bar) bar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
  const text = $('mp-progress-text');
  if (text) text.textContent = `Yükleniyor... %${percent}`;
}

export function initMediaPreview() {
  $('mp-close').addEventListener('click', closeMediaPreview);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isMediaPreviewOpen()) closeMediaPreview(); });
  $('mp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const root = $('media-preview');
    if (busy || !sendHandler || !root._file) return;
    busy = true;
    const btn = $('mp-send');
    btn.disabled = true;
    btn.classList.add('sending');
    setProgress(10);
    try {
      const processedFile = await processEditedImage(root._file);
      let caption = $('mp-caption').value.trim();
      if (viewOnce) caption = `[VIEWONCE]${caption}`;
      await sendHandler({
        file: processedFile,
        caption,
        onProgress: (pct) => setProgress(pct),
      });
      closeMediaPreview();
    } catch (err) {
      toast('Gönderilemedi: ' + trErr(err));
      setProgress(null);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.classList.remove('sending');
    }
  });
}
