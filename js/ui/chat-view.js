/* =====================================================================
 *  ui/chat-view.js — v6 Sağ Panel:
 *  Sesli/Görüntülü Arama (#51, #52), Canlı Titreşim (#57), Medya Galerisi (#44),
 *  Sohbet Analizi & E2EE Parmak İzi (#84, #93), Sabitlenmiş Mesaj (#35),
 *  Akıllı Hızlı Yanıtlar (#71), Mesaj İletme (#34), 3B Yazıyor Balonu (#13),
 *  Kendime Notlar (#72) ve Etkileşimli Widget Güncellemeleri
 * ===================================================================== */
import { $, el, setAvatar, sameDay, fmtDayLabel, fmtLastSeen, trErr } from '../utils.js';
import { CONFIG } from '../config.js';
import { state, bus, setLastSeen } from '../state.js';
import {
  fetchMessages, sendMessage, markRead,
  deleteMessageForEveryone, editMessage, toggleReaction, fetchReactions,
  toggleStar, fetchStarred
} from '../services/messages.js';
import { fetchProfile, fetchLastSeen, blockUser, unblockUser } from '../services/profiles.js';
import { validateImage, validateVideo, validateDocument, getAvatarUrl } from '../services/storage.js';
import { sendTyping } from '../services/presence.js';
import { notifyMessage } from '../services/notifications.js';
import { createMessageEl, updateRowTick } from './message-bubble.js';
import { stopAllAudio } from './audio-player.js';
import { initComposer } from './composer.js';
import { openMediaPreview, initMediaPreview } from './media-preview.js';
import { scheduleChatsRefresh } from './sidebar.js';
import { initChatSearch, resetChatSearch } from './chat-search.js';
import { openWallpaperPicker } from './wallpaper-picker.js';
import { getSmartReplies } from './rich-content.js';
import { openMediaGalleryModal } from './media-studio.js';
import { startCall, sendNudgeBroadcast, openWhiteboardModal, sendCollabBroadcast } from './live-collab.js';
import { openChatAnalyticsModal } from './command-palette.js';
import { playFxSound, checkAndTriggerCelebration, toggleZenMode } from './fx.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { getLocalMessages, saveLocalMessages, saveSingleLocalMessage, deleteLocalMessage } from '../services/db.js';

const GROUP_GAP_MS = 5 * 60 * 1000;

let composer = null;
let token = 0;
let loaded = [];
let loadedIds = new Set();
let hasMore = false;
let unseen = 0;

let starredSet = new Set();
let reactionsMap = new Map();
const chatCache = new Map(); // chatId -> { messages: [], hasMore: false }

const box = () => $('messages');
const nearBottom = () => { const b = box(); return b.scrollHeight - b.scrollTop - b.clientHeight < 140; };
function scrollToBottom(smooth = false) {
  const b = box();
  b.style.scrollBehavior = smooth ? 'smooth' : 'auto';
  b.scrollTop = b.scrollHeight;
  b.style.scrollBehavior = '';
}

function jumpToMessage(id) {
  const row = box().querySelector(`[data-id="${id}"]`);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('highlight-flash');
    void row.offsetWidth;
    row.classList.add('highlight-flash');
  } else {
    toast('Alıntılanan mesaj daha eski.');
  }
}

/* =====================================================================
 *  Başlatma
 * ===================================================================== */
export function initChatView() {
  initMediaPreview();
  initChatSearch();

  composer = initComposer({
    send: sendPayload,
    onTyping: () => { if (state.activeChat && !state.activeChat.isSelf) sendTyping(state.activeChat.id); },
    onImage: previewImage,
    onVideo: handleVideo,
    onDocument: handleDocument,
    onEdit: handleEditMessage,
  });

  ensureV6HeaderAndBanners();

  $('back-btn').addEventListener('click', closeChat);
  $('scroll-down').addEventListener('click', () => { scrollToBottom(true); setUnseen(0); });
  box().addEventListener('scroll', () => {
    const show = !nearBottom();
    $('scroll-down').classList.toggle('show', show);
    if (!show) setUnseen(0);
  }, { passive: true });

  initChatMenu();

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !state.activeChat) return;
    if (document.querySelector('#lightbox.open, #media-preview.open, #emoji-panel.open, #wallpaper-modal.open, #profile-modal.open, .v6-modal.open')) return;
    closeChat();
  }, true);

  // Sürükle-bırak ile dosya gönderme
  const chatView = $('chat-view');
  let dragCount = 0;

  chatView.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCount++;
    chatView.classList.add('dragging');
  });
  chatView.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCount = Math.max(0, dragCount - 1);
    if (!dragCount) chatView.classList.remove('dragging');
  });
  chatView.addEventListener('dragover', (e) => { e.preventDefault(); });
  chatView.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCount = 0;
    chatView.classList.remove('dragging');
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (f.type.startsWith('image/')) previewImage(f);
    else if (f.type.startsWith('video/')) handleVideo(f);
    else handleDocument(f);
  });

  // Realtime dinleyicileri
  bus.on('message:insert', onRealtimeInsert);
  bus.on('message:update', onRealtimeUpdate);
  bus.on('message:widget-update', ({ messageId, content }) => {
    const target = loaded.find(m => m.id === messageId);
    if (target) {
      target.content = content;
      refreshSingleMessage(messageId);
    }
  });
  bus.on('reaction:change', onRealtimeReaction);
  bus.on('star:change', onRealtimeStar);
  bus.on('presence:change', updateHeader);
  bus.on('presence:typing', () => {
    updateHeader();
    renderTypingBubble();
  });
}

function ensureV6HeaderAndBanners() {
  const head = document.querySelector('#chat-view .chat-head');
  const searchBtn = $('chat-search-btn');
  if (head && searchBtn && !$('chat-voice-call-btn')) {
    const callBtn = el('button', 'icon-btn v6-head-btn');
    callBtn.innerHTML = icon('phone');
    callBtn.type = 'button';
    callBtn.id = 'chat-voice-call-btn';
    callBtn.title = 'Sesli Arama (#51)';
    callBtn.addEventListener('click', () => { if (state.activeChat) startCall(state.activeChat, false); });

    const videoBtn = el('button', 'icon-btn v6-head-btn');
    videoBtn.innerHTML = icon('video');
    videoBtn.type = 'button';
    videoBtn.id = 'chat-video-call-btn';
    videoBtn.title = 'Görüntülü Arama (#52)';
    videoBtn.addEventListener('click', () => { if (state.activeChat) startCall(state.activeChat, true); });

    const nudgeBtn = el('button', 'icon-btn v6-head-btn');
    nudgeBtn.innerHTML = icon('vibrate');
    nudgeBtn.type = 'button';
    nudgeBtn.id = 'chat-nudge-btn';
    nudgeBtn.title = 'Ekranı Titret (Nudge #57)';
    nudgeBtn.addEventListener('click', () => {
      if (state.activeChat) {
        sendNudgeBroadcast(state.activeChat.id);
        toast(`@${state.activeChat.username} kişisine titreşim gönderildi!`);
      }
    });

    const zenBtn = el('button', 'icon-btn v6-head-btn');
    zenBtn.innerHTML = icon('leaf');
    zenBtn.type = 'button';
    zenBtn.id = 'chat-zen-btn';
    zenBtn.title = 'Zen Odak Modu (Sol Paneli Gizle/Göster #100)';
    zenBtn.addEventListener('click', () => {
      const z = toggleZenMode();
      toast(z ? 'Zen odak modu aktif' : 'Normal görünüm');
    });

    head.insertBefore(callBtn, searchBtn);
    head.insertBefore(videoBtn, searchBtn);
    head.insertBefore(nudgeBtn, searchBtn);
    head.insertBefore(zenBtn, searchBtn);
  }

  // Sabitlenmiş Mesaj Çubuğu (#35)
  const searchBar = $('chat-search-bar');
  if (searchBar && !$('pinned-msg-bar')) {
    const pinBar = el('div', 'pinned-msg-bar');
    pinBar.id = 'pinned-msg-bar';
    pinBar.hidden = true;
    searchBar.parentElement.insertBefore(pinBar, searchBar.nextSibling);
  }

  // Akıllı Yanıtlar (Smart Replies) Çubuğu (#71)
  const bannerCont = $('composer-banner-container');
  if (bannerCont && !$('smart-reply-bar')) {
    const srBar = el('div', 'smart-reply-bar');
    srBar.id = 'smart-reply-bar';
    srBar.hidden = true;
    bannerCont.parentElement.insertBefore(srBar, bannerCont);
  }

  // Başlık ve Avatara Tıklayarak Kişi Bilgisi Açma
  const headInfo = document.querySelector('#chat-view .chat-head .info');
  const headAvatar = $('chat-avatar-wrap');
  const triggerInfo = () => {
    if (state.activeChat && !state.activeChat.isSelf) {
      openContactInfoModal(state.activeChat);
    }
  };
  if (headInfo && !headInfo.dataset.clickBound) {
    headInfo.dataset.clickBound = '1';
    headInfo.style.cursor = 'pointer';
    headInfo.title = 'Kişi Bilgisini ve Hakkında Metnini Gör';
    headInfo.addEventListener('click', triggerInfo);
  }
  if (headAvatar && !headAvatar.dataset.clickBound) {
    headAvatar.dataset.clickBound = '1';
    headAvatar.style.cursor = 'pointer';
    headAvatar.title = 'Kişi Bilgisini ve Hakkında Metnini Gör';
    headAvatar.addEventListener('click', triggerInfo);
  }
}

function initChatMenu() {
  const btn = $('chat-more-btn');
  const menu = $('chat-header-menu');
  if (!btn || !menu) return;

  // V6 Menü Seçeneklerini Ekle (#44, #55, #86, #89, #93)
  if (!menu.dataset.v6Ready) {
    menu.dataset.v6Ready = '1';

    const infoBtn = el('button', '');
    infoBtn.innerHTML = `${icon('info')} Kişi Bilgisi &amp; Hakkında`;
    infoBtn.type = 'button';
    infoBtn.addEventListener('click', () => {
      menu.hidden = true;
      if (state.activeChat && !state.activeChat.isSelf) {
        openContactInfoModal(state.activeChat);
      }
    });

    const galleryBtn = el('button', '');
    galleryBtn.innerHTML = `${icon('image')} Medya, Belge & Link Galerisi`;
    galleryBtn.type = 'button';
    galleryBtn.addEventListener('click', () => {
      menu.hidden = true;
      if (state.activeChat) openMediaGalleryModal(loaded, state.activeChat.username);
    });

    const wbBtn = el('button', '');
    wbBtn.innerHTML = `${icon('palette')} Ortak Çizim Tahtası`;
    wbBtn.type = 'button';
    wbBtn.addEventListener('click', () => {
      menu.hidden = true;
      if (state.activeChat) openWhiteboardModal(state.activeChat.id, previewImage);
    });

    const statsBtn = el('button', '');
    statsBtn.innerHTML = `${icon('chart')} İstatistik, E2EE & Dışa Aktar`;
    statsBtn.type = 'button';
    statsBtn.addEventListener('click', () => {
      menu.hidden = true;
      if (state.activeChat) openChatAnalyticsModal(state.activeChat, loaded);
    });

    const clearBtn = el('button', '');
    clearBtn.innerHTML = `${icon('eraser')} Ekranı Temizle`;
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => {
      menu.hidden = true;
      loaded = [];
      loadedIds.clear();
      renderAll();
      toast('Sohbet ekranı temizlendi.');
    });

    menu.prepend(infoBtn);
    menu.insertBefore(galleryBtn, $('menu-item-block'));
    menu.insertBefore(wbBtn, $('menu-item-block'));
    menu.insertBefore(statsBtn, $('menu-item-block'));
    menu.insertBefore(clearBtn, $('menu-item-block'));
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });

  document.addEventListener('click', () => { menu.hidden = true; });

  $('menu-item-search').addEventListener('click', () => {
    menu.hidden = true;
    $('chat-search-btn').click();
  });
  $('menu-item-theme').addEventListener('click', () => {
    menu.hidden = true;
    openWallpaperPicker();
  });
  $('menu-item-block').addEventListener('click', async () => {
    menu.hidden = true;
    if (!state.activeChat) return;
    const c = state.activeChat;
    try {
      if (c.is_blocked) {
        await unblockUser(c.id);
        c.is_blocked = false;
        toast(`@${c.username} engeli kaldırıldı.`);
      } else {
        if (!confirm(`@${c.username} kullanıcısını engellemek istediğinize emin misiniz?`)) return;
        await blockUser(c.id);
        c.is_blocked = true;
        toast(`@${c.username} engellendi.`);
      }
      updateBlockStatus();
      scheduleChatsRefresh();
    } catch (err) {
      toast('İşlem başarısız: ' + trErr(err));
    }
  });
}

function updateBlockStatus() {
  if (!state.activeChat) return;
  const c = state.activeChat;
  const blockBtnText = $('menu-block-text');
  if (blockBtnText) blockBtnText.textContent = c.is_blocked ? 'Engeli Kaldır' : 'Engelle';

  composer.setBlocked(c.is_blocked, c.blocked_by_them, async () => {
    try {
      await unblockUser(c.id);
      c.is_blocked = false;
      toast(`@${c.username} engeli kaldırıldı.`);
      updateBlockStatus();
      scheduleChatsRefresh();
    } catch (err) {
      toast(trErr(err));
    }
  });
}

/* =====================================================================
 *  Sabitlenmiş Mesaj (#35) ve Akıllı Yanıtlar (#71)
 * ===================================================================== */
function renderPinnedBanner() {
  const bar = $('pinned-msg-bar');
  if (!bar || !state.activeChat) return;
  try {
    const raw = localStorage.getItem(`wa_pin_${state.activeChat.id}`);
    if (!raw) { bar.hidden = true; return; }
    const pin = JSON.parse(raw);
    bar.innerHTML = `
      <div class="pin-info" id="pin-jump-trigger">
        <b class="ico-inline">${icon('pin')} Sabitlenmiş Mesaj</b>
        <span>${(pin.content || 'Medya mesajı').slice(0, 85)}</span>
      </div>
      <button type="button" class="icon-btn" id="pin-unpin-btn" title="Sabitlemeyi Kaldır">${icon('close')}</button>
    `;
    bar.hidden = false;
    $('pin-jump-trigger').onclick = () => jumpToMessage(pin.id);
    $('pin-unpin-btn').onclick = (e) => {
      e.stopPropagation();
      localStorage.removeItem(`wa_pin_${state.activeChat.id}`);
      bar.hidden = true;
    };
  } catch {
    bar.hidden = true;
  }
}

function pinMessage(m) {
  if (!state.activeChat) return;
  try {
    localStorage.setItem(`wa_pin_${state.activeChat.id}`, JSON.stringify({
      id: m.id,
      content: m.content || (m.image_path ? 'Fotoğraf' : 'Sesli mesaj'),
    }));
    renderPinnedBanner();
    toast('Mesaj sohbetin üstüne sabitlendi!');
  } catch {}
}

function updateSmartReplies() {
  const bar = $('smart-reply-bar');
  if (!bar || !state.activeChat || !loaded.length) {
    if (bar) bar.hidden = true;
    return;
  }
  const last = loaded[loaded.length - 1];
  if (last.sender_id === state.me.id && !state.activeChat.isSelf) {
    bar.hidden = true;
    return;
  }
  const suggestions = getSmartReplies(last.content);
  bar.replaceChildren();
  suggestions.forEach(s => {
    const pill = el('button', 'smart-reply-pill', s);
    pill.type = 'button';
    pill.addEventListener('click', () => {
      bar.hidden = true;
      sendPayload({ content: s });
    });
    bar.appendChild(pill);
  });
  bar.hidden = false;
}

/* =====================================================================
 *  Sohbet açma / kapama (Kendime Notlar #72 destekli)
 * ===================================================================== */
export async function openChat(chat) {
  if (!chat || (state.activeChat && state.activeChat.id === chat.id)) return;
  const my = ++token;

  stopAllAudio();
  composer.reset();
  resetChatSearch();
  setUnseen(0);

  const isSelf = chat.id === state.me?.id || !!chat.isSelf;
  state.activeChat = { ...chat, isSelf };
  loaded = []; loadedIds = new Set();
  starredSet.clear();
  reactionsMap.clear();

  const avUrl = getAvatarUrl(chat.avatar_path);
  setAvatar($('chat-avatar'), chat.username, avUrl);
  if (isSelf) {
    $('chat-title').innerHTML = `<span class="ico-inline">${icon('pin')} Kendime Notlar (@${chat.username})</span>`;
  } else {
    $('chat-title').textContent = '@' + chat.username;
  }
  updateHeader();
  updateBlockStatus();
  renderPinnedBanner();
  composer.loadDraft(chat.id);

  if (!isSelf) {
    fetchLastSeen(chat.id).then((ls) => { if (my === token) { setLastSeen(chat.id, ls); updateHeader(); } });
    fetchProfile(chat.id).then((p) => {
      if (my === token && p) {
        if (p.about) state.activeChat.about = p.about;
        if (p.avatar_path) state.activeChat.avatar_path = p.avatar_path;
        updateHeader();
      }
    }).catch(() => {});
  }

  $('empty-state').hidden = true;
  const view = $('chat-view');
  view.hidden = false;
  view.classList.remove('chat-slide-in');
  void view.offsetWidth;
  view.classList.add('chat-slide-in');
  $('app').classList.add('chat-open');
  bus.emit('chat:active');

  if (isSelf) {
    try {
      const savedNotes = JSON.parse(localStorage.getItem(`wa_self_notes_${state.me.id}`) || '[]');
      loaded = savedNotes;
      loadedIds = new Set(savedNotes.map(m => m.id));
      hasMore = false;
      renderAll();
      scrollToBottom();
      updateSmartReplies();
    } catch {
      loaded = [];
      renderAll();
    }
    return;
  }

  // Önbellekte varsa (RAM veya IndexedDB) 0ms gecikmeyle anında ekrana çiz
  const cached = chatCache.get(chat.id);
  if (cached && cached.messages.length) {
    loaded = [...cached.messages];
    loadedIds = new Set(loaded.map((m) => m.id));
    hasMore = cached.hasMore;
    renderAll();
    scrollToBottom();
  } else {
    try {
      const localMsgs = await getLocalMessages(chat.id);
      if (my === token && localMsgs && localMsgs.length) {
        loaded = [...localMsgs];
        loadedIds = new Set(loaded.map((m) => m.id));
        hasMore = localMsgs.length >= CONFIG.PAGE_SIZE;
        chatCache.set(chat.id, { messages: [...loaded], hasMore });
        renderAll();
        scrollToBottom();
      } else {
        box().replaceChildren(el('div', 'no-msg', 'Yükleniyor…'));
      }
    } catch {
      box().replaceChildren(el('div', 'no-msg', 'Yükleniyor…'));
    }
  }

  try {
    const rows = await fetchMessages(state.me.id, chat.id);
    if (my !== token) return;
    loaded = rows;
    loadedIds = new Set(rows.map((m) => m.id));
    hasMore = rows.length === CONFIG.PAGE_SIZE;
    chatCache.set(chat.id, { messages: [...rows], hasMore });
    saveLocalMessages(chat.id, rows).catch(() => {});

    renderAll();
    scrollToBottom();
    updateSmartReplies();
    if (window.matchMedia('(min-width: 761px)').matches) composer.focus();

    // Tepkiler, yıldızlar ve okundu bilgisi arka planda bloklamadan yüklensin
    if (rows.length) {
      Promise.all([
        fetchReactions(rows.map(m => m.id)).catch(() => []),
        fetchStarred(chat.id).catch(() => []),
      ]).then(([reacs, stars]) => {
        if (my !== token) return;
        const touchedIds = new Set();
        reacs.forEach(r => {
          const arr = reactionsMap.get(r.message_id) || [];
          arr.push(r);
          reactionsMap.set(r.message_id, arr);
          touchedIds.add(r.message_id);
        });
        stars.forEach(s => {
          starredSet.add(s.message_id);
          touchedIds.add(s.message_id);
        });
        touchedIds.forEach(id => refreshSingleMessage(id));
      });
    }

    markRead(chat.id).then(() => {
      if (my === token) scheduleChatsRefresh();
    }).catch(() => {});
  } catch (err) {
    if (my !== token) return;
    if (!loaded.length) box().replaceChildren(el('div', 'no-msg', 'Mesajlar yüklenemedi.'));
    toast(trErr(err));
  }
}

export function closeChat() {
  token++;
  stopAllAudio();
  composer.reset();
  resetChatSearch();
  state.activeChat = null;
  loaded = []; loadedIds = new Set();
  starredSet.clear();
  reactionsMap.clear();
  $('app').classList.remove('chat-open');
  bus.emit('chat:active');

  setTimeout(() => {
    if (!state.activeChat) {
      $('chat-view').hidden = true;
      $('empty-state').hidden = false;
    }
  }, 260);
}

export function resetChatView() {
  closeChat();
  box().replaceChildren();
}

/* =====================================================================
 *  Başlık durumu & 3B Yazıyor Balonu (#13)
 * ===================================================================== */
function updateHeader() {
  const c = state.activeChat;
  if (!c) return;
  const status = $('chat-status');
  if (c.isSelf) {
    status.innerHTML = `<span class="presence-text online">Kişisel bulut alanınız</span> <span class="chat-about-sep">•</span> <span class="chat-about-text">Notlar, kodlar ve görevler</span>`;
    status.className = 'status online';
    $('chat-avatar-wrap').classList.add('online');
    return;
  }
  const typing = state.typing.has(c.id);
  const online = state.onlineIds.has(c.id);
  const ls = state.lastSeen.get(c.id);

  if (typing) {
    status.innerHTML = `<span class="presence-text typing">yazıyor…</span>`;
    status.className = 'status typing';
  } else {
    const presenceText = online ? 'çevrimiçi' : (ls ? `son görülme ${fmtLastSeen(ls)}` : 'çevrimdışı');
    const aboutText = c.about || 'Merhaba! Ben de Mesaj kullanıyorum.';

    status.innerHTML = `
      <span class="presence-text ${online ? 'online' : ''}">${presenceText}</span>
      <span class="chat-about-sep">•</span>
      <span class="chat-about-text" title="Hakkında: ${aboutText}">"${aboutText}"</span>
    `;
    status.className = 'status' + (online ? ' online' : '');
  }
  status.title = c.about ? `Hakkında: ${c.about}` : '';
  $('chat-avatar-wrap').classList.toggle('online', online);
}

export function openContactInfoModal(chat) {
  if (!chat || chat.isSelf) return;
  let modal = $('contact-info-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'contact-info-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:440px">
        <div class="v6-modal-head">
          <div style="display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700">
            ${icon('info', 18)} <span>Kişi Bilgisi</span>
          </div>
          <button type="button" class="icon-btn" id="ci-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-modal-body" style="align-items:center;padding:22px 18px">
          <!-- Büyük Avatar -->
          <div style="position:relative;margin-bottom:12px">
            <div class="avatar xl" id="ci-avatar" style="width:96px;height:96px;font-size:36px;border:3px solid var(--accent-bright);box-shadow:0 8px 24px rgba(0,0,0,0.35);cursor:pointer" title="Fotoğrafı büyüt"></div>
            <span class="presence-dot" id="ci-presence-dot" style="width:16px;height:16px;bottom:3px;right:3px"></span>
          </div>

          <h2 id="ci-username" style="font-size:19px;font-weight:700;margin-bottom:4px;color:var(--text)"></h2>
          <div id="ci-status" style="font-size:12.5px;color:var(--text-sub);margin-bottom:16px"></div>

          <!-- HAKKINDA / BİYOGRAFİ KARTI -->
          <div class="ci-card">
            <div class="ci-card-label">
              ${icon('info', 14)} <span>Hakkında / Durum Metni</span>
            </div>
            <div id="ci-about" class="ci-card-text"></div>
          </div>

          <!-- Hızlı Eylem Butonları -->
          <div style="display:flex;gap:10px;width:100%;margin-top:4px">
            <button type="button" class="btn-sm secondary" id="ci-voice-call" style="flex:1;justify-content:center;padding:10px">
              ${icon('phone', 15)} <span>Sesli</span>
            </button>
            <button type="button" class="btn-sm secondary" id="ci-video-call" style="flex:1;justify-content:center;padding:10px">
              ${icon('video', 15)} <span>Görüntülü</span>
            </button>
            <button type="button" class="btn-sm secondary" id="ci-gallery" style="flex:1;justify-content:center;padding:10px">
              ${icon('image', 15)} <span>Medya</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#ci-close-btn')) {
        modal.classList.remove('open');
      }
    });

    $('ci-avatar').addEventListener('click', () => {
      if (state.activeChat?.avatar_path) {
        openMediaPreview({ image_path: state.activeChat.avatar_path });
      }
    });

    $('ci-voice-call').addEventListener('click', () => {
      modal.classList.remove('open');
      if (state.activeChat) startCall(state.activeChat, false);
    });

    $('ci-video-call').addEventListener('click', () => {
      modal.classList.remove('open');
      if (state.activeChat) startCall(state.activeChat, true);
    });

    $('ci-gallery').addEventListener('click', () => {
      modal.classList.remove('open');
      if (state.activeChat) openMediaGalleryModal(loaded, state.activeChat.username);
    });
  }

  // Bilgileri Doldur
  const avUrl = chat.avatar_path ? getAvatarUrl(chat.avatar_path) : null;
  setAvatar($('ci-avatar'), chat.username, avUrl);
  $('ci-username').textContent = '@' + chat.username;

  const online = state.onlineIds.has(chat.id);
  const ls = state.lastSeen.get(chat.id);
  $('ci-status').textContent = online ? 'Şu anda çevrimiçi' : (ls ? `Son görülme ${fmtLastSeen(ls)}` : 'Çevrimdışı');
  $('ci-presence-dot').style.display = online ? 'block' : 'none';

  const aboutText = chat.about || 'Merhaba! Ben de Mesaj kullanıyorum.';
  $('ci-about').textContent = aboutText;

  modal.classList.add('open');
}

function renderTypingBubble() {
  const b = box();
  if (!b || !state.activeChat) return;
  const existing = b.querySelector('.typing-bubble-row');
  if (state.typing.has(state.activeChat.id)) {
    if (!existing) {
      const tb = el('div', 'msg-row in first typing-bubble-row');
      tb.innerHTML = `<div class="bubble typing-3d-dots"><span></span><span></span><span></span></div>`;
      b.appendChild(tb);
      if (nearBottom()) scrollToBottom(true);
    }
  } else if (existing) {
    existing.remove();
  }
}

/* =====================================================================
 *  Mesaj akışı
 * ===================================================================== */
function isFirstOfGroup(prev, m) {
  return !prev || prev.sender_id !== m.sender_id || !sameDay(prev.created_at, m.created_at)
    || new Date(m.created_at) - new Date(prev.created_at) > GROUP_GAP_MS;
}

function getQuoteSnippet(quoteId) {
  if (!quoteId) return null;
  const q = loaded.find(x => x.id === quoteId);
  if (!q) return { authorName: 'Mesaj', snippet: 'Alıntılanan mesaj' };
  const authorName = q.sender_id === state.me.id ? 'Siz' : state.activeChat.username;
  const snippet = q.content || (q.image_path ? 'Fotoğraf' : q.audio_path ? 'Ses kaydı' : q.file_name || 'Dosya');
  return { authorName, snippet };
}

function renderAll() {
  const b = box();
  b.replaceChildren();
  if (hasMore) {
    const more = el('button', 'load-more', 'Daha eski mesajları yükle');
    more.type = 'button';
    more.addEventListener('click', () => loadOlder(more));
    b.append(more);
  }
  if (!loaded.length) {
    b.append(el('div', 'no-msg', state.activeChat?.isSelf
      ? 'Kendinize not, `/todo`, `/anket`, `/kod` veya fotoğraf gönderebilirsiniz!'
      : 'Henüz mesaj yok. Merhaba de!'));
    return;
  }
  let prev = null;
  const frag = document.createDocumentFragment();
  for (const m of loaded) {
    if (!prev || !sameDay(prev.created_at, m.created_at)) frag.append(el('div', 'day-sep', fmtDayLabel(m.created_at)));
    frag.append(createMessageElement(m, prev, false));
    prev = m;
  }
  b.append(frag);
  renderTypingBubble();
}

function refreshSingleMessage(messageId) {
  const idx = loaded.findIndex((x) => x.id === messageId);
  if (idx === -1) return;
  const oldRow = box().querySelector(`.msg-row[data-id="${messageId}"]`);
  if (!oldRow) {
    renderAll();
    return;
  }
  const prev = idx > 0 ? loaded[idx - 1] : null;
  const newRow = createMessageElement(loaded[idx], prev, false);
  oldRow.replaceWith(newRow);
}

function createMessageElement(m, prev, animate) {
  return createMessageEl(m, {
    meId: state.me.id,
    meUsername: state.me.username,
    first: isFirstOfGroup(prev, m),
    animate,
    onReply: (msg) => {
      const name = msg.sender_id === state.me.id ? 'Siz' : state.activeChat.username;
      composer.startReply(msg, name);
    },
    onEdit: (msg) => composer.startEdit(msg),
    onForward: (msg) => openForwardModal(msg),
    onPin: (msg) => pinMessage(msg),
    onUpdateRichWidget: async (msg, newContent) => {
      msg.content = newContent;
      refreshSingleMessage(msg.id);
      if (state.activeChat?.isSelf) {
        saveSelfNotes();
        return;
      }
      sendCollabBroadcast('widget-update', {
        messageId: msg.id,
        content: newContent,
        from: state.me?.username,
      });

      try {
        await editMessage(msg.id, newContent);
      } catch (err) {
        sendCollabBroadcast('widget-persist-request', {
          messageId: msg.id,
          content: newContent,
          senderId: msg.sender_id,
        });
      }
    },
    onDelete: async (msg) => {
      if (state.activeChat?.isSelf) {
        loaded = loaded.filter(x => x.id !== msg.id);
        saveSelfNotes();
        renderAll();
        return;
      }
      try {
        await deleteMessageForEveryone(msg.id);
        msg.is_deleted = true;
        refreshSingleMessage(msg.id);
        deleteLocalMessage(msg.id).catch(() => {});
      } catch (err) {
        toast('Silinemedi: ' + trErr(err));
      }
    },
    onDeleteLocal: (msg) => {
      loaded = loaded.filter(x => x.id !== msg.id);
      loadedIds.delete(msg.id);
      const oldRow = box().querySelector(`.msg-row[data-id="${msg.id}"]`);
      if (oldRow) oldRow.remove();
      else renderAll();
      if (state.activeChat?.isSelf) saveSelfNotes();
    },
    onReact: async (msg, emoji) => {
      const meId = state.me?.id;
      if (state.activeChat?.isSelf) {
        let list = reactionsMap.get(msg.id) || [];
        const existingMine = list.find(r => r.user_id === meId);
        if (existingMine && existingMine.emoji === emoji) {
          list = list.filter(r => !(r.user_id === meId && r.emoji === emoji));
        } else {
          list = list.filter(r => r.user_id !== meId);
          list.push({ user_id: meId, emoji, created_at: new Date().toISOString() });
        }
        reactionsMap.set(msg.id, list);
        saveSelfNotes();
        refreshSingleMessage(msg.id);
        return;
      }
      try {
        let currentList = reactionsMap.get(msg.id) || [];
        const mineExisting = currentList.find(r => r.user_id === meId);
        if (mineExisting && mineExisting.emoji === emoji) {
          currentList = currentList.filter(r => !(r.user_id === meId && r.emoji === emoji));
        } else {
          currentList = currentList.filter(r => r.user_id !== meId);
          currentList.push({ user_id: meId, emoji, created_at: new Date().toISOString() });
        }
        reactionsMap.set(msg.id, currentList);
        refreshSingleMessage(msg.id);

        await toggleReaction(msg.id, emoji);
        const reacs = await fetchReactions([msg.id]);
        reactionsMap.set(msg.id, reacs);
        refreshSingleMessage(msg.id);
      } catch (err) {
        toast('Tepki eklenemedi: ' + trErr(err));
        const reacs = await fetchReactions([msg.id]).catch(() => []);
        reactionsMap.set(msg.id, reacs);
        refreshSingleMessage(msg.id);
      }
    },
    onStar: async (msg) => {
      try {
        if (state.activeChat?.isSelf) {
          if (starredSet.has(msg.id)) starredSet.delete(msg.id);
          else starredSet.add(msg.id);
          refreshSingleMessage(msg.id);
          return;
        }
        const res = await toggleStar(msg.id);
        if (res) starredSet.add(msg.id);
        else starredSet.delete(msg.id);
        toast(res ? 'Mesaj yıldızlandı ⭐' : 'Yıldız kaldırıldı');
        refreshSingleMessage(msg.id);
      } catch (err) {
        toast('Yıldızlanamadı: ' + trErr(err));
      }
    },
    isStarred: starredSet.has(m.id),
    reactions: reactionsMap.get(m.id) || [],
    quotedMsg: getQuoteSnippet(m.reply_to_id),
    onJumpToQuote: (qid) => jumpToMessage(qid),
  });
}

function saveSelfNotes() {
  if (!state.me) return;
  try {
    localStorage.setItem(`wa_self_notes_${state.me.id}`, JSON.stringify(loaded.slice(-200)));
  } catch {}
}

/* ---------------- Mesaj İletme (Forwarding) Modalı (#34) ---------------- */
function openForwardModal(msg) {
  const friends = state.chats || [];
  if (!friends.length) {
    toast('İletilecek başka bir arkadaş bulunamadı.');
    return;
  }
  const targetName = prompt(
    `Mesajı iletmek istediğiniz kişinin kullanıcı adını yazın:\nMevcut kişiler: ${friends.map(f => '@' + f.username).join(', ')}`,
    friends[0].username
  );
  if (!targetName) return;
  const clean = targetName.replace(/^@/, '').trim().toLowerCase();
  const target = friends.find(f => f.username.toLowerCase() === clean);
  if (!target) {
    toast('Bu kullanıcı adıyla arkadaş bulunamadı.');
    return;
  }
  const senderLabel = msg.sender_id === state.me.id ? state.me.username : (state.activeChat?.username || 'kullanici');
  sendMessage({
    me: state.me,
    to: target.contact_id,
    content: `[FWD:${senderLabel}]${msg.content || ''}`,
  }).then(() => {
    toast(`↪ Mesaj @${target.username} kişisine iletildi!`);
  }).catch(err => toast(trErr(err)));
}

async function loadOlder(btn) {
  if (!loaded.length || !state.activeChat) return;
  const my = token;
  btn.disabled = true;
  try {
    const older = (await fetchMessages(state.me.id, state.activeChat.id, loaded[0].created_at))
      .filter((m) => !loadedIds.has(m.id));
    if (my !== token) return;
    hasMore = older.length === CONFIG.PAGE_SIZE;
    older.forEach((m) => loadedIds.add(m.id));
    loaded = [...older, ...loaded];

    if (older.length) {
      const reacs = await fetchReactions(older.map(m => m.id)).catch(() => []);
      reacs.forEach(r => {
        const arr = reactionsMap.get(r.message_id) || [];
        arr.push(r);
        reactionsMap.set(r.message_id, arr);
      });
    }

    const b = box(), oldH = b.scrollHeight;
    renderAll();
    b.style.scrollBehavior = 'auto';
    b.scrollTop = b.scrollHeight - oldH;
    b.style.scrollBehavior = '';
  } catch (err) {
    toast(trErr(err));
    btn.disabled = false;
  }
}

function appendMessage(m) {
  if (loadedIds.has(m.id)) return;
  const b = box();
  const mine = m.sender_id === state.me.id;
  const stick = mine || nearBottom();
  const prev = loaded[loaded.length - 1];

  if (!loaded.length) b.replaceChildren();
  if (!prev || !sameDay(prev.created_at, m.created_at)) b.append(el('div', 'day-sep', fmtDayLabel(m.created_at)));

  const row = createMessageElement(m, prev, true);
  b.append(row);
  loaded.push(m);
  loadedIds.add(m.id);

  if (state.activeChat && !state.activeChat.isSelf && !String(m.id).startsWith('opt_')) {
    saveSingleLocalMessage(state.activeChat.id, m).catch(() => {});
  }

  updateSmartReplies();
  if (stick) {
    scrollToBottom(true);
  } else if (!mine) {
    setUnseen(unseen + 1);
  }
}

function setUnseen(n) {
  unseen = n;
  const badge = $('scroll-badge');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : n;
}

/* =====================================================================
 *  Gönderme akışları
 * ===================================================================== */
async function sendPayload(payload) {
  if (!state.activeChat) return;
  const targetChatId = state.activeChat.id;
  if (state.activeChat.isSelf) {
    const fakeMsg = {
      id: 'self_' + Date.now(),
      sender_id: state.me.id,
      receiver_id: state.me.id,
      content: payload.content || 'Sesli not',
      reply_to_id: payload.replyToId || null,
      created_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
    };
    appendMessage(fakeMsg);
    saveSelfNotes();
    return;
  }

  // Metin mesajlarını 0ms gecikmeyle (Optimistic UI) anında ekrana çiz
  let optId = null;
  if (payload.content && !payload.image && !payload.audio && !payload.video && !payload.document) {
    optId = 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const optMsg = {
      id: optId,
      sender_id: state.me.id,
      receiver_id: targetChatId,
      content: payload.content.trim(),
      reply_to_id: payload.replyToId || null,
      created_at: new Date().toISOString(),
      media_type: 'text',
    };
    appendMessage(optMsg);
  }

  try {
    const saved = await sendMessage({ me: state.me, to: targetChatId, ...payload });
    if (saved && optId) {
      loadedIds.delete(optId);
      loadedIds.add(saved.id);
      const idx = loaded.findIndex((m) => m.id === optId);
      if (idx !== -1) loaded[idx] = saved;
      const row = box().querySelector(`.msg-row[data-id="${optId}"]`);
      if (row) {
        row.dataset.id = saved.id;
        updateRowTick(row, saved);
      }
      if (state.activeChat && state.activeChat.id === targetChatId) {
        chatCache.set(targetChatId, { messages: [...loaded], hasMore });
      }
    } else if (saved && state.activeChat && state.activeChat.id === targetChatId) {
      appendMessage(saved);
      chatCache.set(targetChatId, { messages: [...loaded], hasMore });
    }
  } catch (err) {
    if (optId) {
      loaded = loaded.filter((m) => m.id !== optId);
      loadedIds.delete(optId);
      const row = box().querySelector(`.msg-row[data-id="${optId}"]`);
      if (row) row.remove();
    }
    throw err;
  }
}

function previewImage(file) {
  const err = validateImage(file);
  if (err) return toast(err);
  openMediaPreview(file, async ({ file: editedFile, caption, onProgress }) => {
    await sendMessage({
      me: state.me, to: state.activeChat.id, image: editedFile || file, content: caption,
      replyToId: null, onProgress,
    });
  });
}

function handleVideo(file) {
  const err = validateVideo(file);
  if (err) return toast(err);
  openMediaPreview(file, async ({ caption, onProgress }) => {
    await sendMessage({
      me: state.me, to: state.activeChat.id, video: file, content: caption,
      replyToId: null, onProgress,
    });
  });
}

async function handleDocument(file) {
  const err = validateDocument(file);
  if (err) return toast(err);
  try {
    toast('Belge gönderiliyor…');
    await sendMessage({
      me: state.me, to: state.activeChat.id, document: file,
    });
  } catch (err) {
    toast('Belge gönderilemedi: ' + trErr(err));
  }
}

async function handleEditMessage(m, newText) {
  if (state.activeChat?.isSelf) {
    m.content = newText;
    m.edited_at = new Date().toISOString();
    saveSelfNotes();
    refreshSingleMessage(m.id);
    return;
  }
  await editMessage(m.id, newText);
  m.content = newText;
  m.edited_at = new Date().toISOString();
  refreshSingleMessage(m.id);
  toast('Mesaj düzenlendi.');
}

/* =====================================================================
 *  Realtime olayları
 * ===================================================================== */
function onRealtimeInsert(m) {
  const isCurrentChat = state.activeChat && (m.sender_id === state.activeChat.id || m.receiver_id === state.activeChat.id);

  if (isCurrentChat) {
    // Eğer bizim gönderdiğimiz mesajın optimistic kopyası henüz id güncellemediyse eşleştir
    if (m.sender_id === state.me.id && !loadedIds.has(m.id)) {
      const optIdx = loaded.findIndex((x) => String(x.id).startsWith('opt_') && x.content === m.content);
      if (optIdx !== -1) {
        const oldOptId = loaded[optIdx].id;
        loadedIds.delete(oldOptId);
        loadedIds.add(m.id);
        loaded[optIdx] = m;
        const row = box().querySelector(`.msg-row[data-id="${oldOptId}"]`);
        if (row) {
          row.dataset.id = m.id;
          updateRowTick(row, m);
        }
      } else {
        appendMessage(m);
      }
    } else {
      appendMessage(m);
    }
    chatCache.set(state.activeChat.id, { messages: [...loaded], hasMore });

    if (m.sender_id === state.activeChat.id) {
      markRead(state.activeChat.id);
      playFxSound('in');
    }
  } else if (m.receiver_id === state.me.id) {
    playFxSound('in');
  }

  if (m.receiver_id === state.me.id) {
    const friend = (state.chats || []).find(c => c.contact_id === m.sender_id);
    const senderName = friend ? friend.username : 'Bir arkadaş';
    notifyMessage({
      title: `@${senderName}`,
      body: m.content || (m.image_path ? 'Fotoğraf' : m.audio_path ? 'Sesli mesaj' : m.file_name || 'Dosya'),
      onClick: () => {
        openChat({ id: m.sender_id, username: senderName });
      },
    });
  }

  scheduleChatsRefresh();
}

function onRealtimeUpdate(m) {
  const row = box().querySelector(`.msg-row[data-id="${m.id}"]`);
  const existing = loaded.find(x => x.id === m.id);

  if (existing) {
    existing.read_at = m.read_at;
    existing.delivered_at = m.delivered_at;
    existing.is_deleted = m.is_deleted;
    existing.content = m.content;
    existing.edited_at = m.edited_at;
  }

  if (m.is_deleted || m.edited_at) {
    refreshSingleMessage(m.id);
  } else if (row) {
    updateRowTick(row, m);
  }
}

function onRealtimeReaction(r) {
  if (!r || !r.message_id) return;
  fetchReactions([r.message_id]).then(list => {
    reactionsMap.set(r.message_id, list);
    refreshSingleMessage(r.message_id);
  });
}

function onRealtimeStar() {
  if (state.activeChat && !state.activeChat.isSelf) {
    fetchStarred(state.activeChat.id).then(list => {
      starredSet = new Set(list.map(s => s.message_id));
      loaded.forEach((m) => refreshSingleMessage(m.id));
    });
  }
}
