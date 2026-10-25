/* =====================================================================
 *  config.js — uygulama sabitleri
 * ===================================================================== */
export const CONFIG = Object.freeze({
  APP_VERSION: '0.7',
  VERSION: '0.7',
  SUPABASE_URL: 'https://sfsnazicaejrdakyvhfg.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc25hemljYWVqcmRha3l2aGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzY5NTYsImV4cCI6MjEwODMxMjk1Nn0.pNkP6yxGhfO1WOYgtM0f0qE6mxsNPQKDtqfDuayEHlQ',

  BUCKET: 'mesaj-fotolari',
  AVATARS_BUCKET: 'avatars',
  MAX_IMAGE_MB: 10,
  MAX_AVATAR_MB: 2,
  MAX_AUDIO_SEC: 300,
  MIN_AUDIO_MS: 700,
  MAX_DOC_MB: 25,
  MAX_VIDEO_MB: 35,
  PAGE_SIZE: 40,

  HEARTBEAT_MS: 30_000,        // last_seen güncelleme aralığı
  TYPING_THROTTLE_MS: 2_500,   // "yazıyor" sinyali gönderme sıklığı
  TYPING_TTL_MS: 4_000,        // karşı taraftan sinyal gelmezse göstergeyi kapat

  USERNAME_RE: /^[a-z0-9_]{3,20}$/,
  REACTIONS: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
  IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  IMAGE_EXT: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' },
  AUDIO_EXT: { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' },
  VIDEO_TYPES: ['video/mp4', 'video/webm'],
  VIDEO_EXT: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
});
