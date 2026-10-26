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

/* ---------- Avatar & Temiz 1:1 Kare Kırpma (centerCrop) ---------- */
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

export function setAvatar(node, name, avatarUrl = null) {
  if (!node) return;
  const n = name || '?';
  if (avatarUrl) {
    node.textContent = '';
    node.style.backgroundImage = 'none';
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

    img.style.transform = 'none';
    img.style.objectFit = 'cover';
    img.style.objectPosition = 'center center';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.borderRadius = '50%';
    img.style.display = 'block';

    if (img.dataset.src !== avatarUrl) {
      img.dataset.src = avatarUrl;
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
 * Yüklenen profil fotoğrafını 512x512 kareye centerCrop yapar (asla büyütüp taşırmaz).
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

        // Merkeze göre tam kare (1:1) kırpma:
        const side = Math.min(nw, nh);
        const sx = (nw - side) / 2;
        const sy = (nh - side) / 2;

        ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT);
        URL.revokeObjectURL(url);
        cv.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
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
