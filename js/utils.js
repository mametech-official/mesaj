/* =====================================================================
 *  utils.js — DOM, biçimlendirme ve akıllı Avatar centerCrop yardımcıları
 * ===================================================================== */
import { CONFIG } from './config.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) {
    if (typeof text === 'string' && text.includes('<') && text.includes('>')) {
      e.innerHTML = text;
    } else {
      e.textContent = text;
    }
  }
  return e;
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/* ---------- Avatar & Akıllı Ekran Görüntüsü / Kenar Boşluğu Kırpma (centerCrop) ---------- */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seededRandom(seed) {          // mulberry32
  let a = hashString(String(seed));
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const avatarCropCache = new Map();

/**
 * Bir görselde telefon ekran görüntüsü kaynaklı üst/alt/yan siyah veya düz renk
 * boşlukları (letterbox) tespit edip yuvarlak alanı %100 dolduracak centerCrop ölçeğini hesaplar.
 */
function analyzeAvatarLetterbox(imgEl, url) {
  if (avatarCropCache.has(url)) return avatarCropCache.get(url);

  const nw = imgEl.naturalWidth || 0;
  const nh = imgEl.naturalHeight || 0;
  if (!nw || !nh) return null;

  let scale = 1.04;
  let posX = 50;
  let posY = 50;

  // Dikey veya yatay telefon ekran görüntüsü oranı tespiti (örn. 9:16, 9:20)
  const ratio = Math.max(nw / nh, nh / nw);
  if (ratio > 1.32) {
    // Ekran görüntüsü içindeki yatay/kare fotoğrafın yuvarlak çerçeveyi tam doldurması için:
    scale = Math.min(2.25, Math.max(1.48, ratio * 0.92));
  }

  // Offscreen canvas ile piksel bazlı üst/alt/sol/sağ boşluk (letterbox) taraması
  try {
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    // object-fit: cover simülasyonu ile 64x64 merkeze çiz
    const sRatio = Math.max(S / nw, S / nh);
    const dw = nw * sRatio;
    const dh = nh * sRatio;
    const dx = (S - dw) / 2;
    const dy = (S - dh) / 2;
    ctx.drawImage(imgEl, dx, dy, dw, dh);

    const data = ctx.getImageData(0, 0, S, S).data;
    const isRowUniformBorder = (y) => {
      let r0 = data[(y * S + 8) * 4];
      let g0 = data[(y * S + 8) * 4 + 1];
      let b0 = data[(y * S + 8) * 4 + 2];
      let diffSum = 0;
      let count = 0;
      for (let x = 8; x < S - 8; x += 2) {
        const idx = (y * S + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        diffSum += Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0);
        count++;
      }
      const avgDiff = diffSum / Math.max(1, count);
      const lum = (r0 + g0 + b0) / 3;
      // Çok koyu (siyah bar), çok açık (beyaz bar) veya tamamen tek renk şerit
      return avgDiff < 18 || lum < 22 || lum > 242;
    };

    const isColUniformBorder = (x) => {
      let r0 = data[(8 * S + x) * 4];
      let g0 = data[(8 * S + x) * 4 + 1];
      let b0 = data[(8 * S + x) * 4 + 2];
      let diffSum = 0;
      let count = 0;
      for (let y = 8; y < S - 8; y += 2) {
        const idx = (y * S + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        diffSum += Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0);
        count++;
      }
      const avgDiff = diffSum / Math.max(1, count);
      const lum = (r0 + g0 + b0) / 3;
      return avgDiff < 18 || lum < 22 || lum > 242;
    };

    let top = 0;
    while (top < 24 && isRowUniformBorder(top)) top++;
    let bottom = S - 1;
    while (bottom > S - 25 && isRowUniformBorder(bottom)) bottom--;

    let left = 0;
    while (left < 24 && isColUniformBorder(left)) left++;
    let right = S - 1;
    while (right > S - 25 && isColUniformBorder(right)) right--;

    const activeH = Math.max(18, bottom - top + 1);
    const activeW = Math.max(18, right - left + 1);

    if (top > 2 || (S - 1 - bottom) > 2 || left > 2 || (S - 1 - right) > 2) {
      const neededScaleY = (S / activeH) * 1.12;
      const neededScaleX = (S / activeW) * 1.12;
      scale = Math.min(2.8, Math.max(scale, neededScaleY, neededScaleX));
      posY = Math.round(((top + bottom) / 2 / S) * 100);
      posX = Math.round(((left + right) / 2 / S) * 100);
    }
  } catch {
    // CORS kısıtlıysa oran tabanlı centerCrop ölçeği devrede kalır
  }

  const res = { scale: Number(scale.toFixed(2)), posX, posY };
  avatarCropCache.set(url, res);
  return res;
}

export function setAvatar(node, name, avatarUrl = null) {
  if (!node) return;
  const n = name || '?';
  if (avatarUrl) {
    node.textContent = '';
    node.style.backgroundImage = `url("${avatarUrl}")`;
    node.style.backgroundSize = 'cover';
    node.style.backgroundPosition = 'center center';
    node.style.backgroundRepeat = 'no-repeat';
    node.style.backgroundColor = '#182530';
    node.classList.add('has-img');

    let img = node.querySelector('img.avatar-img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'avatar-img';
      img.alt = n;
      img.decoding = 'async';
      node.appendChild(img);
    }

    const applyCrop = (crop) => {
      if (!crop) return;
      img.style.objectPosition = `${crop.posX}% ${crop.posY}%`;
      img.style.transform = `scale(${crop.scale})`;
    };

    const cached = avatarCropCache.get(avatarUrl);
    if (cached) applyCrop(cached);

    if (img.dataset.src !== avatarUrl) {
      img.dataset.src = avatarUrl;
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const crop = analyzeAvatarLetterbox(img, avatarUrl);
        applyCrop(crop);
      };
      img.onerror = () => {
        // Eğer crossOrigin desteklenmiyorsa normal modda yeniden yükle
        if (img.crossOrigin) {
          img.removeAttribute('crossorigin');
          img.src = avatarUrl;
        }
      };
      img.src = avatarUrl;
    }
  } else {
    node.style.backgroundImage = 'none';
    node.classList.remove('has-img');
    node.replaceChildren();
    node.textContent = n.charAt(0);
    node.style.backgroundColor = `hsl(${hashString(n) % 360} 42% 36%)`;
  }
}

/**
 * Yüklenen profil fotoğrafını 512x512 kareye centerCrop yapar ve kenar boşluklarını temizler.
 */
export async function centerCropAvatarFile(file) {
  if (!file) return file;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const nw = img.naturalWidth || 512;
        const nh = img.naturalHeight || 512;
        const OUT = 512;
        const cv = document.createElement('canvas');
        cv.width = OUT;
        cv.height = OUT;
        const ctx = cv.getContext('2d');

        const crop = analyzeAvatarLetterbox(img, url) || { scale: 1, posX: 50, posY: 50 };
        const baseScale = Math.max(OUT / nw, OUT / nh) * (crop.scale || 1);
        const dw = nw * baseScale;
        const dh = nh * baseScale;
        const dx = (OUT - dw) * (crop.posX / 100);
        const dy = (OUT - dh) * (crop.posY / 100);

        ctx.drawImage(img, dx, dy, dw, dh);
        URL.revokeObjectURL(url);
        cv.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function avatarEl(name, { online = false, small = false, avatarUrl = null } = {}) {
  const wrap = el('div', 'avatar-wrap' + (online ? ' online' : ''));
  const av = el('div', 'avatar' + (small ? ' sm' : ''));
  setAvatar(av, name, avatarUrl);
  wrap.append(av, el('span', 'presence-dot'));
  return wrap;
}

/* ---------- Tarih / saat ---------- */
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const isToday = (d) => d.toDateString() === new Date().toDateString();
const isYesterday = (d) => { const y = new Date(); y.setDate(y.getDate() - 1); return d.toDateString() === y.toDateString(); };

export const fmtTime = (iso) => timeFmt.format(new Date(iso));
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export function fmtDayLabel(iso) {
  const d = new Date(iso);
  if (isToday(d)) return 'Bugün';
  if (isYesterday(d)) return 'Dün';
  return dateFmt.format(d);
}
export function fmtListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) return timeFmt.format(d);
  if (isYesterday(d)) return 'Dün';
  return shortDateFmt.format(d);
}
export function fmtLastSeen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) return `bugün ${timeFmt.format(d)}`;
  if (isYesterday(d)) return `dün ${timeFmt.format(d)}`;
  return `${shortDateFmt.format(d)} ${timeFmt.format(d)}`;
}
export function fmtSize(bytes) {
  return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s){1,12}$/u;
export const isEmojiOnly = (s) => !!s && EMOJI_ONLY_RE.test(s) && /\p{Extended_Pictographic}/u.test(s);

/* ---------- Hata mesajları (TR) ---------- */
export function trErr(err) {
  const m = (err && (err.message || err.error_description || String(err))) || 'Bilinmeyen hata';
  if (/Invalid login credentials/i.test(m)) return 'E-posta veya şifre hatalı.';
  if (/Email not confirmed/i.test(m)) return 'E-posta adresin henüz doğrulanmamış. Gelen kutunu kontrol et.';
  if (/already registered|already been registered/i.test(m)) return 'Bu e-posta ile zaten bir hesap var.';
  if (/Database error saving new user|profiles_username/i.test(m)) return 'Kullanıcı adı geçersiz veya zaten alınmış.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar dene.';
  if (/Password should be at least/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  if (/valid email|invalid.*email/i.test(m)) return 'Geçerli bir e-posta adresi gir.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Ağ hatası. İnternet bağlantını kontrol et.';
  if (/exceeded the maximum allowed size|too large|Payload too large/i.test(m)) return 'Dosya çok büyük.';
  if (/mime type/i.test(m)) return 'Bu dosya türü desteklenmiyor.';
  if (/row-level security|violates row/i.test(m)) return 'Bu işlem için yetkin yok.';
  if (/cannot add yourself/i.test(m)) return 'Kendine arkadaşlık isteği gönderemezsin.';
  if (/user not found/i.test(m)) return 'Kullanıcı bulunamadı.';
  return m;
}

export { CONFIG };
