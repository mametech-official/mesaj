/* =====================================================================
 *  app.js — uygulama girişi: modülleri başlatır, oturum yaşam döngüsünü yönetir
 * ===================================================================== */
import { $, setAvatar, trErr } from './utils.js';
import { state, bus, resetState } from './state.js';
import { onAuthChange, signOut } from './services/auth.js';
import { fetchProfile, updateProfileAvatar } from './services/profiles.js';
import { startMessageRealtime, stopMessageRealtime } from './services/realtime.js';
import { startPresence, stopPresence, clearTyping } from './services/presence.js';
import { uploadAvatar, validateAvatar, getAvatarUrl, clearUrlCache } from './services/storage.js';
import { markDelivered } from './services/messages.js';
import { hydrateIcons } from './ui/icons.js';
import { showScreen } from './ui/screens.js';
import { toast } from './ui/toast.js';
import { initLightbox } from './ui/lightbox.js';
import { initWallpaperPicker, openWallpaperPicker } from './ui/wallpaper-picker.js';
import { initProfileModal, openProfileModal } from './ui/profile-modal.js';
import { initLiveBackgrounds } from './ui/canvas-bg.js';
import { initClickRipples, init3DParallaxCards, initPrivacyShield, updateFaviconBadge } from './ui/fx.js';
import { initLiveCollab, stopLiveCollab } from './ui/live-collab.js';
import { initCommandPalette, openCommandPalette, renderStoriesBar } from './ui/command-palette.js';
import { requestNotificationPermission } from './services/notifications.js';
import { initAuthView, resetAuthView } from './ui/auth-view.js';
import { initSidebar, loadChats, loadRequests, resetSidebar } from './ui/sidebar.js';
import { initChatView, openChat, resetChatView } from './ui/chat-view.js';

let starting = null;

async function startApp(user) {
  if (starting === user.id) return;
  starting = user.id;
  try {
    const profile = await fetchProfile(user.id);
    state.me = {
      id: profile.id,
      username: profile.username,
      avatar_path: profile.avatar_path,
      about: profile.about || 'Merhaba! Ben de Mesaj kullanıyorum.',
      last_seen: profile.last_seen,
    };

    updateMeAvatarUI();
    $('me-name').textContent = '@' + profile.username;
    showScreen('app');

    // Masaüstü bildirim izni iste
    requestNotificationPermission().catch(() => {});

    startMessageRealtime(state.me);
    startPresence(state.me);
    initLiveCollab();

    await Promise.all([loadChats(), loadRequests()]);
    renderStoriesBar();
    await markDelivered();
  } catch (err) {
    starting = null;
    toast('Profil yüklenemedi: ' + trErr(err));
    await signOut();
  }
}

function updateMeAvatarUI() {
  const av = $('me-avatar');
  if (!av || !state.me) return;
  const avUrl = getAvatarUrl(state.me.avatar_path);
  setAvatar(av, state.me.username, avUrl);
}

function stopApp() {
  starting = null;
  stopLiveCollab();
  stopMessageRealtime();
  stopPresence();
  resetChatView();
  resetSidebar();
  resetState();
  clearUrlCache();
  resetAuthView();
  showScreen('auth');
}

/* ---------------- Profil Fotoğrafı Değiştirme ---------------- */
function initAvatarUpload() {
  const wrap = $('me-avatar-wrap');
  const input = $('avatar-input');
  if (!wrap || !input) return;

  wrap.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !state.me) return;

    const err = validateAvatar(file);
    if (err) { toast(err); return; }

    toast('Profil resmi yükleniyor…');
    try {
      const path = await uploadAvatar(state.me.id, file);
      await updateProfileAvatar(state.me.id, path);
      state.me.avatar_path = path;
      updateMeAvatarUI();
      await loadChats();
      toast('Profil resmi güncellendi! ✓');
    } catch (uploadErr) {
      toast('Resim yüklenemedi: ' + trErr(uploadErr));
    }
  });
}

/* ---------------- Bağlantı durumu çubuğu ---------------- */
function initConnectionBanner() {
  let timer = null;
  const banner = $('conn-banner');
  const show = (text) => { $('conn-text').textContent = text; banner.hidden = false; };
  const hide = () => { clearTimeout(timer); banner.hidden = true; };

  bus.on('realtime:status', (status) => {
    if (status === 'SUBSCRIBED') return hide();
    if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
      clearTimeout(timer);
      timer = setTimeout(() => show('Bağlantı kuruluyor…'), 1500);
    }
  });
  window.addEventListener('offline', () => show('İnternet bağlantısı yok'));
  window.addEventListener('online', () => show('Bağlantı kuruluyor…'));
}

/* ---------------- Başlat ---------------- */
function init() {
  hydrateIcons();
  initLiveBackgrounds();
  initClickRipples();
  init3DParallaxCards();
  initPrivacyShield();
  updateFaviconBadge(0);
  initLightbox();
  initWallpaperPicker();
  initProfileModal();
  initAuthView();
  initSidebar({ onOpen: openChat });
  initChatView();
  initCommandPalette({ onOpenChat: openChat, onSelectChat: openChat });
  initAvatarUpload();
  initConnectionBanner();

  $('logout-btn').addEventListener('click', () => signOut());

  const cmdBtn = $('cmd-palette-btn');
  if (cmdBtn) cmdBtn.addEventListener('click', openCommandPalette);
  const emptyCmdBtn = $('empty-cmd-btn');
  if (emptyCmdBtn) emptyCmdBtn.addEventListener('click', openCommandPalette);

  const profileBtn = $('profile-settings-btn');
  if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
  const meTrigger = $('me-profile-trigger');
  if (meTrigger) meTrigger.addEventListener('click', openProfileModal);

  // Boş ekran hızlı eylem kartları
  const qaSearch = $('qa-search');
  if (qaSearch) qaSearch.addEventListener('click', () => {
    const s = $('search');
    if (s) { s.focus(); s.select(); }
  });
  const qaTheme = $('qa-theme');
  if (qaTheme) qaTheme.addEventListener('click', openWallpaperPicker);
  const qaStarred = $('qa-starred');
  if (qaStarred) qaStarred.addEventListener('click', () => {
    const btn = document.querySelector('.filters button[data-filter="starred"]');
    if (btn) btn.click();
  });
  const qaProfile = $('qa-profile');
  if (qaProfile) qaProfile.addEventListener('click', openProfileModal);

  // PWA Servis Çalışanı
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('PWA SW kayıt hatası:', err));
  }

  bus.on('message:insert', (m) => {
    if (state.me && m.sender_id !== state.me.id) clearTyping(m.sender_id);
  });

  onAuthChange((event, session) => {
    if (session && session.user) {
      if (!state.me || state.me.id !== session.user.id) startApp(session.user);
    } else {
      stopApp();
    }
  });
}

init();
