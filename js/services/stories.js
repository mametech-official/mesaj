/* =====================================================================
 *  services/stories.js — 24 Saatlik Hikayeler / Durum (Stories) Servisi (#61)
 *  Metin + Fotoğraf + Video + Ses Desteği ve Gerçek Zamanlı Eşitleme
 * ===================================================================== */
import { state, bus } from '../state.js';
import { sb } from '../supabase.js';
import { CONFIG, uuid } from '../utils.js';

const STORAGE_PREFIX = 'wa_stories_v7_';
const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

// Eski genel ve güvensiz depolamayı temizle
try { localStorage.removeItem('wa_stories_v6'); } catch {}

function getStorageKey() {
  return state.me?.id ? `${STORAGE_PREFIX}${state.me.id}` : null;
}

export const STORY_GRADIENTS = [
  'linear-gradient(135deg, #00d9a6, #0284c7)',
  'linear-gradient(135deg, #a855f7, #ec4899)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #8b5cf6, #6366f1)',
];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function compressImageToDataUrl(file, maxDim = 920, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const cv = document.createElement('canvas');
      cv.width = width;
      cv.height = height;
      cv.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Hikaye medyasını (fotoğraf / video / ses) Supabase Storage'a yükleyip
 * tüm kullanıcıların erişebileceği 24 saatlik imzalı URL (signedUrl) üretir.
 */
export async function uploadStoryMedia(fileOrBlob, mediaType) {
  if (!fileOrBlob || !state.me) return null;

  const mime = fileOrBlob.type || (
    mediaType === 'video' ? 'video/mp4' :
    mediaType === 'audio' ? 'audio/webm' : 'image/jpeg'
  );

  let ext = 'bin';
  if (mediaType === 'image') {
    ext = CONFIG.IMAGE_EXT?.[mime] || 'jpg';
  } else if (mediaType === 'video') {
    ext = mime.includes('webm') ? 'webm' : 'mp4';
  } else if (mediaType === 'audio') {
    ext = CONFIG.AUDIO_EXT?.[mime] || (mime.includes('mp4') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : 'webm');
  }

  const bucket = sb.storage.from(CONFIG.BUCKET);
  const path = `${state.me.id}/story_${uuid()}.${ext}`;

  // 1. Gerçek MIME türü ile yüklemeyi dene
  let uploadErr = null;
  const res1 = await bucket.upload(path, fileOrBlob, {
    contentType: mime,
    cacheControl: '86400',
    upsert: false,
  });
  uploadErr = res1.error;

  // 2. Eğer bucket video MIME kısıtlamasına takıldıysa uyumlu medya kapsayıcısıyla tekrar dene
  if (uploadErr && mediaType === 'video') {
    const fallbackMime = mime.includes('webm') ? 'audio/webm' : 'audio/mp4';
    const res2 = await bucket.upload(path, fileOrBlob, {
      contentType: fallbackMime,
      cacheControl: '86400',
      upsert: true,
    });
    uploadErr = res2.error;
  }

  if (!uploadErr) {
    const { data, error } = await bucket.createSignedUrl(path, 86400);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  }

  // 3. Yedek (Fallback): Sıkıştırılmış DataURL
  if (mediaType === 'image') {
    return await compressImageToDataUrl(fileOrBlob);
  }
  return await blobToDataUrl(fileOrBlob);
}

/** 24 saati geçmemiş, yalnızca bana ve arkadaşlarıma ait geçerli hikayeleri döndürür */
export function getStories() {
  if (!state.me) return [];
  try {
    const key = getStorageKey();
    const raw = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    const cutoff = Date.now() - STORY_TTL_MS;

    const friendIds = new Set((state.chats || []).map(c => String(c.contact_id).trim()));
    const friendUsers = new Set((state.chats || []).map(c => (c.username || '').toLowerCase().trim()));
    const myId = String(state.me.id).trim();
    const myUser = (state.me.username || '').toLowerCase().trim();

    return raw
      .filter(s => {
        if (!s || !s.id || s.createdAt <= cutoff || (!s.text && !s.mediaUrl)) return false;
        const sId = s.userId ? String(s.userId).trim() : null;
        const sUser = (s.username || '').toLowerCase().trim();
        const isMine = (sId && sId === myId) || (sUser && sUser === myUser);
        const isFriend = (sId && friendIds.has(sId)) || (sUser && friendUsers.has(sUser));
        return isMine || isFriend;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Sadece geçerli kullanıcının aktif hikayeleri */
export function getMyStories() {
  if (!state.me) return [];
  const myId = String(state.me.id).trim();
  const myUser = (state.me.username || '').toLowerCase().trim();
  return getStories().filter(s => {
    const sId = s.userId ? String(s.userId).trim() : null;
    const sUser = (s.username || '').toLowerCase().trim();
    return (sId && sId === myId) || (sUser && sUser === myUser);
  });
}

/** Hikayeleri kullanıcı bazında tekilleştirip gruplar (Asla mükerrer grup oluşturmaz) */
export function getStoriesGroupedByUser() {
  const all = getStories();
  const groups = [];

  all.forEach(st => {
    if (!st) return;
    const normUsername = (st.username || '').toLowerCase().trim();
    const userId = st.userId ? String(st.userId).trim() : null;

    // Aynı userId VEYA aynı kullanıcı adına sahip grubu bul
    let g = groups.find(existing => {
      if (userId && existing.userId && existing.userId === userId) return true;
      if (normUsername && existing.username && existing.username.toLowerCase().trim() === normUsername) return true;
      return false;
    });

    if (!g) {
      g = {
        userId: userId || null,
        username: st.username || 'anonim',
        avatar_path: st.avatar_path || null,
        stories: [],
      };
      groups.push(g);
    } else {
      if (!g.userId && userId) g.userId = userId;
      if ((!g.username || g.username === 'anonim') && st.username) g.username = st.username;
      if (!g.avatar_path && st.avatar_path) g.avatar_path = st.avatar_path;
    }

    if (!g.stories.some(s => s.id === st.id)) {
      g.stories.push(st);
    }
  });

  // Her kullanıcının hikayelerini eskiden yeniye doğru kronolojik sırala
  groups.forEach(g => {
    g.stories.sort((a, b) => a.createdAt - b.createdAt);
  });

  return groups;
}

/** Gelen hikayeleri mevcut listeyle birleştirip kaydeder (Yabancıların hikayeleri filtrelenir) */
export function mergeStories(incoming) {
  if (!state.me || !Array.isArray(incoming) || !incoming.length) return false;

  const friendIds = new Set((state.chats || []).map(c => String(c.contact_id).trim()));
  const friendUsers = new Set((state.chats || []).map(c => (c.username || '').toLowerCase().trim()));
  const myId = String(state.me.id).trim();
  const myUser = (state.me.username || '').toLowerCase().trim();

  const current = getStories();
  const map = new Map();
  current.forEach(s => map.set(s.id, s));

  let changed = false;
  const cutoff = Date.now() - STORY_TTL_MS;

  incoming.forEach(st => {
    if (!st || !st.id || !st.createdAt || st.createdAt <= cutoff) return;
    const sId = st.userId ? String(st.userId).trim() : null;
    const sUser = (st.username || '').toLowerCase().trim();
    const isMine = (sId && sId === myId) || (sUser && sUser === myUser);
    const isFriend = (sId && friendIds.has(sId)) || (sUser && friendUsers.has(sUser));

    // Yabancıların (arkadaş olmayanların) hikayelerini asla kabul etme
    if (!isMine && !isFriend) return;

    if (!map.has(st.id)) {
      map.set(st.id, {
        id: st.id,
        userId: st.userId || null,
        username: st.username || 'anonim',
        avatar_path: st.avatar_path || null,
        text: st.text || '',
        bg: st.bg || STORY_GRADIENTS[0],
        mediaType: st.mediaType || null,
        mediaUrl: st.mediaUrl || null,
        createdAt: Number(st.createdAt),
      });
      changed = true;
    }
  });

  if (changed) {
    const updated = Array.from(map.values())
      .filter(s => s.createdAt > cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(100);
    const key = getStorageKey();
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {}
    }
    bus.emit('stories:changed');
    return true;
  }
  return false;
}

/** Yeni bir hikaye (metin ve/veya fotoğraf, video, ses) yayınlar */
export function addStory(text, bg, media = null) {
  if (!state.me) return null;
  const newStory = {
    id: 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    userId: state.me.id,
    username: state.me.username,
    avatar_path: state.me.avatar_path || null,
    text: String(text || '').trim(),
    bg: bg || STORY_GRADIENTS[0],
    mediaType: media?.type || null,
    mediaUrl: media?.url || null,
    createdAt: Date.now(),
  };

  mergeStories([newStory]);

  // Gerçek zamanlı kanallara yayınla
  bus.emit('story:broadcast', newStory);
  bus.emit('presence:update_stories');
  bus.emit('stories:changed');

  return newStory;
}

/** Hikayeyi siler ve tüm eşlere bildirir */
export function deleteStory(storyId) {
  deleteStoryLocally(storyId);
  bus.emit('story:broadcast_delete', storyId);
  bus.emit('presence:update_stories');
}

/** Hikayeyi yerel depodan siler (diğer istemcilerden gelen sinyalde kullanılır) */
export function deleteStoryLocally(storyId) {
  const current = getStories().filter(s => s.id !== storyId);
  const key = getStorageKey();
  if (key) {
    try {
      localStorage.setItem(key, JSON.stringify(current));
    } catch {}
  }
  bus.emit('stories:changed');
}
