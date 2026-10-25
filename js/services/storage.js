/* services/storage.js — Supabase Storage (özel bucket + avatars + signed URL) */
import { sb } from '../supabase.js';
import { CONFIG, uuid } from '../utils.js';

const bucket = () => sb.storage.from(CONFIG.BUCKET);
const urlCache = new Map();

/** @returns {string|null} hata mesajı veya null */
export function validateImage(file) {
  if (!file) return 'Dosya seçilmedi.';
  if (!CONFIG.IMAGE_TYPES.includes(file.type)) return 'Sadece JPG, PNG, WEBP veya GIF gönderebilirsin.';
  if (file.size > CONFIG.MAX_IMAGE_MB * 1024 * 1024) return `Fotoğraf en fazla ${CONFIG.MAX_IMAGE_MB} MB olabilir.`;
  return null;
}

export function validateAvatar(file) {
  if (!file) return 'Dosya seçilmedi.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Sadece JPG, PNG veya WEBP yükleyebilirsin.';
  if (file.size > CONFIG.MAX_AVATAR_MB * 1024 * 1024) return `Profil resmi en fazla ${CONFIG.MAX_AVATAR_MB} MB olabilir.`;
  return null;
}

export function validateVideo(file) {
  if (!file) return 'Video seçilmedi.';
  if (!CONFIG.VIDEO_TYPES.includes(file.type)) return 'Sadece MP4 veya WebM formatında video gönderebilirsiniz.';
  if (file.size > CONFIG.MAX_VIDEO_MB * 1024 * 1024) return `Video en fazla ${CONFIG.MAX_VIDEO_MB} MB olabilir.`;
  return null;
}

export function validateDocument(file) {
  if (!file) return 'Dosya seçilmedi.';
  if (file.size > CONFIG.MAX_DOC_MB * 1024 * 1024) return `Belge en fazla ${CONFIG.MAX_DOC_MB} MB olabilir.`;
  return null;
}

/** Dosyayı <userId>/<uuid>.<ext> yoluna yükler, yolu döndürür. */
export async function uploadMedia(userId, body, { ext, contentType }) {
  const path = `${userId}/${uuid()}.${ext}`;
  const { error } = await bucket().upload(path, body, { contentType, cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadAvatar(userId, file) {
  const ext = CONFIG.IMAGE_EXT[file.type] || 'jpg';
  const path = `${userId}/${uuid()}.${ext}`;
  const { error } = await sb.storage.from(CONFIG.AVATARS_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export function getAvatarUrl(path) {
  if (!path) return null;
  const { data } = sb.storage.from(CONFIG.AVATARS_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function removeMedia(paths) {
  if (paths.length) await bucket().remove(paths);
}

export function getSignedUrl(path) {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = bucket().createSignedUrl(path, 3600).then(({ data, error }) => {
    if (error) throw error;
    return data.signedUrl;
  });
  urlCache.set(path, { promise, exp: Date.now() + 50 * 60 * 1000 });
  promise.catch(() => urlCache.delete(path));
  return promise;
}

export const clearUrlCache = () => urlCache.clear();
