/* =====================================================================
 *  ui/media-studio.js — v6 Medya Stüdyosu:
 *  Canlı Kamera Çekimi (#45), Sohbet Medya/Belge/Link Galerisi (#44),
 *  Sesli Dikte / Konuşmayı Metne Çevirme (#48)
 * ===================================================================== */
import { $, el, fmtSize, fmtTime } from '../utils.js';
import { getSignedUrl } from '../services/storage.js';
import { openLightbox } from './lightbox.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

/* ---------------- 1. Kamera ile Anlık Fotoğraf Çekimi (#45) ---------------- */
let activeStream = null;

export async function openCameraModal(onCapturedFile) {
  let modal = $('camera-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'camera-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:520px">
        <div class="v6-modal-head">
          <h3>${icon('camera')} Kamera Stüdyosu</h3>
          <button type="button" class="icon-btn" id="cam-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-modal-body" style="align-items:center">
          <div class="cam-stage">
            <video id="cam-video" autoplay playsinline muted></video>
          </div>
          <div class="cam-controls">
            <button type="button" class="btn-sm secondary" id="cam-mirror-btn">${icon('mirror')} Ayna Modu</button>
            <button type="button" class="btn-sm primary" id="cam-snap-btn">${icon('camera')} Fotoğraf Çek</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#cam-close-btn')) closeCameraModal();
    });
    $('cam-mirror-btn').addEventListener('click', () => {
      $('cam-video').classList.toggle('mirrored');
    });
  }

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: false });
    const video = $('cam-video');
    video.srcObject = activeStream;
    video.classList.add('mirrored');
    modal.classList.add('open');

    const snapBtn = $('cam-snap-btn');
    snapBtn.onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (video.classList.contains('mirrored')) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `kamera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeCameraModal();
        if (onCapturedFile) onCapturedFile(file);
      }, 'image/jpeg', 0.92);
    };
  } catch (err) {
    toast('Kamera erişimi sağlanamadı veya izin verilmedi.');
  }
}

export function closeCameraModal() {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  const modal = $('camera-modal');
  if (modal) modal.classList.remove('open');
}

/* ---------------- 2. Sohbet Medya, Belge ve Bağlantı Galerisi (#44) ---------------- */
export function openMediaGalleryModal(messages, chatUsername) {
  let modal = $('gallery-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'gallery-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:600px">
        <div class="v6-modal-head">
          <h3 id="gal-title">${icon('image')} Sohbet Medya Galerisi</h3>
          <button type="button" class="icon-btn" id="gal-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-tabs" id="gal-tabs">
          <button type="button" data-tab="photos" class="active">Fotoğraflar</button>
          <button type="button" data-tab="docs">Belgeler & Video</button>
          <button type="button" data-tab="links">Bağlantılar</button>
        </div>
        <div class="v6-modal-body" id="gal-body" style="max-height:420px;overflow-y:auto"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#gal-close-btn')) modal.classList.remove('open');
    });
  }

  $('gal-title').innerHTML = `${icon('image')} @${chatUsername || 'sohbet'} — Medya & Dosyalar`;
  const body = $('gal-body');

  function renderTab(tab) {
    body.replaceChildren();
    if (tab === 'photos') {
      const photos = (messages || []).filter(m => m.image_path && !m.is_deleted);
      if (!photos.length) {
        body.append(el('div', 'list-empty', 'Bu sohbette henüz fotoğraf paylaşılmamış.'));
        return;
      }
      const grid = el('div', 'gal-photo-grid');
      photos.forEach(m => {
        const item = el('div', 'gal-photo-item');
        const img = el('img');
        getSignedUrl(m.image_path).then(url => {
          img.src = url;
          item.addEventListener('click', () => openLightbox(url));
        }).catch(() => {});
        item.append(img);
        grid.append(item);
      });
      body.append(grid);
    } else if (tab === 'docs') {
      const docs = (messages || []).filter(m => m.file_path && !m.is_deleted);
      if (!docs.length) {
        body.append(el('div', 'list-empty', 'Bu sohbette henüz belge veya video paylaşılmamış.'));
        return;
      }
      docs.forEach(m => {
        const row = el('div', 'gal-doc-row');
        row.innerHTML = `<b class="ico-inline">${icon('document')} ${m.file_name || 'Dosya'}</b><span>${m.file_size ? fmtSize(m.file_size) : ''} • ${fmtTime(m.created_at)}</span>`;
        row.addEventListener('click', async () => {
          const url = await getSignedUrl(m.file_path);
          window.open(url, '_blank');
        });
        body.append(row);
      });
    } else {
      const links = [];
      (messages || []).forEach(m => {
        if (!m.content || m.is_deleted) return;
        const found = m.content.match(/https?:\/\/[^\s<>"']+/gi);
        if (found) found.forEach(u => links.push({ url: u, at: m.created_at }));
      });
      if (!links.length) {
        body.append(el('div', 'list-empty', 'Bu sohbette henüz web bağlantısı paylaşılmamış.'));
        return;
      }
      links.forEach(l => {
        const row = el('a', 'gal-doc-row');
        row.href = l.url;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
        row.innerHTML = `<b class="ico-inline">${icon('link')} ${l.url}</b><span>${fmtTime(l.at)}</span>`;
        body.append(row);
      });
    }
  }

  modal.querySelectorAll('#gal-tabs button').forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll('#gal-tabs button').forEach(x => x.classList.toggle('active', x === btn));
      renderTab(btn.dataset.tab);
    };
  });

  renderTab('photos');
  modal.classList.add('open');
}

/* ---------------- 3. Sesli Dikte (Web Speech API) (#48) ---------------- */
export function startVoiceDictation(onTextResult) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    toast('Tarayıcınız sesli dikte (Web Speech API) özelliğini desteklemiyor.');
    return;
  }
  const rec = new SpeechRec();
  rec.lang = 'tr-TR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  toast('Dinleniyor… Konuşmaya başlayın');
  rec.onresult = (e) => {
    const transcript = e.results?.[0]?.[0]?.transcript;
    if (transcript && onTextResult) onTextResult(transcript);
  };
  rec.onerror = () => toast('Ses algılanamadı.');
  rec.start();
}
