/* ui/sidebar.js — sol panel: sohbet listesi, arama (arkadaşlık istekleri ile), filtreler */
import { $, el, avatarEl, debounce, fmtListTime, fmtDuration, trErr } from '../utils.js';
import { state, bus, setLastSeen } from '../state.js';
import {
  fetchChats,
  searchUsers,
  fetchRequests,
  sendFriendRequest,
  respondFriendRequest,
  cancelFriendRequest,
} from '../services/chats.js';
import { fetchStarred, fetchMessages } from '../services/messages.js';
import { getAvatarUrl } from '../services/storage.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { updateFaviconBadge } from './fx.js';
import { renderStoriesBar } from './command-palette.js';
import { getLocalChats, saveLocalChats, getLocalMessages, getSyncCachedMessages, saveLocalMessages } from '../services/db.js';
import { setCachedChatMessages, chatCache } from './chat-view.js';

let onOpen = () => {};
let query = '';
let searchResults = [];
let filter = 'all';               // 'all' | 'unread' | 'requests'
let searchSeq = 0;
let renderQueued = false;

function preloadRecentMessages(chats) {
  if (!Array.isArray(chats)) return;
  const top = chats.slice(0, 8);
  top.forEach((c, idx) => {
    if (!c || !c.contact_id) return;
    const cid = c.contact_id;

    // 1. 0.00ms senkron LocalStorage önbelleğini RAM'e yükle
    const syncMsgs = getSyncCachedMessages(cid);
    if (syncMsgs && syncMsgs.length) {
      setCachedChatMessages(cid, syncMsgs, syncMsgs.length >= 35);
    }

    // 2. IndexedDB'den kontrol et ve ilk 6 aktif sohbeti arka planda sunucudan hazırla
    getLocalMessages(cid, 50).then((msgs) => {
      if (msgs && msgs.length) {
        setCachedChatMessages(cid, msgs, msgs.length >= 35);
      }
      // İlk 6 sohbet için mesajlar henüz önbellekte yoksa veya yeni mesaj varsa arka planda indir
      if (idx < 6 && state.me?.id && c.last_message_at) {
        const current = chatCache.get(cid)?.messages || msgs || [];
        const lastCachedTime = current.length ? new Date(current[current.length - 1].created_at).getTime() : 0;
        const lastServerTime = new Date(c.last_message_at).getTime();
        if (!current.length || lastServerTime > lastCachedTime) {
          fetchMessages(state.me.id, cid).then((remoteRows) => {
            if (remoteRows && remoteRows.length) {
              setCachedChatMessages(cid, remoteRows, remoteRows.length >= 40);
              saveLocalMessages(cid, remoteRows).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  });
}

export function handleSidebarBack() {
  if (query) {
    clearSearch();
    render();
    return true;
  }
  if (filter !== 'all') {
    filter = 'all';
    document.querySelectorAll('.filters button').forEach((b) => b.classList.toggle('active', b.dataset.filter === 'all'));
    render();
    return true;
  }
  return false;
}

export async function loadChats() {
  // 1. Önce telefon/cihaz hafızasından 0ms'de anında ekrana bas
  if (!state.chats || !state.chats.length) {
    try {
      const cached = await getLocalChats();
      if (cached && cached.length) {
        state.chats = cached;
        cached.forEach((c) => setLastSeen(c.contact_id, c.last_seen));
        bus.emit('chats:changed');
        preloadRecentMessages(cached);
      }
    } catch {}
  }

  // 2. Arka planda sunucudan güncelle
  try {
    const remote = await fetchChats();
    state.chats = remote;
    state.chats.forEach((c) => setLastSeen(c.contact_id, c.last_seen));
    bus.emit('chats:changed');
    saveLocalChats(remote).catch(() => {});
    preloadRecentMessages(remote);
  } catch (err) {
    if (!state.chats || !state.chats.length) {
      toast('Sohbetler yüklenemedi: ' + trErr(err));
    }
  }
}

export async function loadRequests() {
  try {
    state.requests = await fetchRequests();
    bus.emit('requests:changed');
    updateRequestsBadge();
  } catch (err) {
    console.warn('İstekler yüklenemedi:', err.message);
  }
}

function updateRequestsBadge() {
  const badge = $('req-badge');
  if (!badge) return;
  const incomingCount = state.requests.filter((r) => r.direction === 'incoming').length;
  if (incomingCount > 0) {
    badge.hidden = false;
    badge.textContent = incomingCount > 99 ? '99+' : String(incomingCount);
  } else {
    badge.hidden = true;
  }
}

export const scheduleChatsRefresh = debounce(loadChats, 250);
export const scheduleRequestsRefresh = debounce(loadRequests, 300);

export function resetSidebar() {
  query = ''; searchResults = []; filter = 'all';
  $('search').value = '';
  document.querySelectorAll('.filters button').forEach((b) => b.classList.toggle('active', b.dataset.filter === 'all'));
  $('list').replaceChildren();
  document.title = 'Mesaj';
}

export function clearSearch() {
  query = ''; searchResults = [];
  $('search').value = '';
}

/** @param {{onOpen:(chat:{id:string, username:string, avatar_path?:string})=>void}} opts */
export function initSidebar(opts) {
  onOpen = opts.onOpen;

  $('search').addEventListener('input', onSearchInput);
  document.querySelectorAll('.filters button').forEach((b) => {
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      document.querySelectorAll('.filters button').forEach((x) => x.classList.toggle('active', x === b));
      scheduleRender();
    });
  });

  for (const evt of ['chats:changed', 'requests:changed', 'presence:changed', 'typing:changed', 'chat:active']) {
    bus.on(evt, scheduleRender);
  }

  bus.on('request:change', () => {
    scheduleRequestsRefresh();
    if (query) runSearch(query);
  });

  bus.on('friends:change', () => {
    scheduleChatsRefresh();
    scheduleRequestsRefresh();
    if (query) runSearch(query);
  });
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

/* ---------------- Arama ---------------- */
const runSearch = debounce(async (q) => {
  const seq = ++searchSeq;
  try {
    const rows = await searchUsers(q);
    if (seq !== searchSeq) return;
    searchResults = rows;
    render();
  } catch (err) {
    toast('Arama başarısız: ' + trErr(err));
  }
}, 280);

function onSearchInput() {
  const q = $('search').value.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
  if (!q) { query = ''; searchResults = []; runSearch.cancel(); searchSeq++; render(); return; }
  query = q;
  runSearch(q);
}

/* ---------------- Arkadaşlık İşlemleri ---------------- */
async function handleSendRequest(user) {
  try {
    const status = await sendFriendRequest(user.id);
    if (status === 'friend') {
      toast(`${user.username} ile arkadaş oldunuz!`);
      await loadChats();
      await loadRequests();
      clearSearch();
      onOpen({ id: user.id, username: user.username, avatar_path: user.avatar_path });
    } else {
      toast('Arkadaşlık isteği gönderildi');
      user.relation = 'outgoing';
      await loadRequests();
      render();
    }
  } catch (err) {
    toast(trErr(err));
  }
}

async function handleRespondRequest(requestId, accept, otherUser) {
  try {
    await respondFriendRequest(requestId, accept);
    toast(accept ? 'Arkadaşlık isteği kabul edildi!' : 'İstek reddedildi');
    await loadChats();
    await loadRequests();
    if (accept && otherUser) {
      clearSearch();
      onOpen({ id: otherUser.id, username: otherUser.username, avatar_path: otherUser.avatar_path });
    } else {
      render();
    }
  } catch (err) {
    toast(trErr(err));
  }
}

async function handleCancelRequest(requestId, user) {
  try {
    await cancelFriendRequest(requestId);
    toast('İstek iptal edildi');
    if (user) user.relation = 'none';
    await loadRequests();
    render();
  } catch (err) {
    toast(trErr(err));
  }
}

/* ---------------- Render Parçaları ---------------- */
function previewNode(c) {
  const wrap = el('div', 'preview');
  const draft = (() => { try { return localStorage.getItem(`wa_draft_${c.contact_id}`); } catch { return null; } })();
  if (draft) {
    const dSpan = el('span', 'draft-tag', '[Taslak] ');
    wrap.append(dSpan, el('span', 'ptext', draft));
    return wrap;
  }
  if (state.typing.has(c.contact_id)) {
    wrap.classList.add('typing');
    wrap.append(el('span', 'ptext', 'yazıyor…'));
    return wrap;
  }
  if (!c.last_message_at) {
    wrap.append(el('span', 'ptext', 'Sohbeti başlatmak için tıkla'));
    return wrap;
  }
  if (c.last_sender_id === state.me.id && !c.last_is_deleted) {
    const t = el('span', 'tick' + (c.last_read_at ? ' read' : c.last_delivered_at ? ' delivered' : ' sent'));
    t.innerHTML = icon(c.last_read_at || c.last_delivered_at ? 'doubleCheck' : 'check');
    wrap.append(t);
  }
  let text;
  if (c.last_is_deleted) {
    const m = document.createElement('span');
    m.innerHTML = icon('ban');
    wrap.append(m.firstChild);
    text = 'Bu mesaj silindi';
  } else if (c.last_has_audio) {
    const m = document.createElement('span');
    m.innerHTML = icon('mic');
    wrap.append(m.firstChild);
    text = fmtDuration(c.last_audio_ms || 0);
  } else if (c.last_has_image) {
    const m = document.createElement('span');
    m.innerHTML = icon('image');
    wrap.append(m.firstChild);
    text = c.last_content || 'Fotoğraf';
  } else if (c.last_has_file) {
    const m = document.createElement('span');
    m.innerHTML = icon('document');
    wrap.append(m.firstChild);
    text = c.last_file_name || 'Belge';
  } else {
    text = c.last_content || '';
  }
  wrap.append(el('span', 'ptext', text));
  return wrap;
}

function isPinnedChat(id) {
  try {
    const arr = JSON.parse(localStorage.getItem('wa_pinned_chats') || '[]');
    return arr.includes(id);
  } catch { return false; }
}

function togglePinChat(id) {
  try {
    const arr = JSON.parse(localStorage.getItem('wa_pinned_chats') || '[]');
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(id);
    localStorage.setItem('wa_pinned_chats', JSON.stringify(arr));
    return idx < 0;
  } catch { return false; }
}

function chatItemNode(c) {
  const active = state.activeChat && state.activeChat.id === c.contact_id;
  const pinned = isPinnedChat(c.contact_id);
  const btn = el('button', 'chat-item' + (active ? ' active' : ''));
  btn.type = 'button';
  btn.title = `@${c.username}${c.about ? ` • "${c.about}"` : ''} (Açmak için tıkla, sabitlemek için sağ tıkla)`;
  const body = el('div', 'body');
  const r1 = el('div', 'row');
  const nick = (() => { try { return localStorage.getItem(`wa_nick_${c.contact_id}`); } catch { return null; } })();
  const nameSpan = el('span', 'name');
  if (pinned) {
    const pinWrap = el('span', 'ico-inline');
    pinWrap.innerHTML = icon('pin');
    pinWrap.append(document.createTextNode(nick ? `${nick} (@${c.username})` : '@' + c.username));
    nameSpan.append(pinWrap);
  } else {
    nameSpan.textContent = nick ? `${nick} (@${c.username})` : '@' + c.username;
  }
  r1.append(nameSpan);
  if (c.last_message_at) r1.append(el('span', 'time' + (Number(c.unread_count) > 0 ? ' unread' : ''), fmtListTime(c.last_message_at)));
  const r2 = el('div', 'row');
  r2.append(previewNode(c));
  if (Number(c.unread_count) > 0) r2.append(el('span', 'badge', c.unread_count > 99 ? '99+' : String(c.unread_count)));
  body.append(r1, r2);

  const avUrl = getAvatarUrl(c.avatar_path);
  btn.append(avatarEl(c.username, { online: state.onlineIds.has(c.contact_id), avatarUrl: avUrl }), body);
  btn.addEventListener('click', () => onOpen({ id: c.contact_id, username: c.username, avatar_path: c.avatar_path, about: c.about }));
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const nowPinned = togglePinChat(c.contact_id);
    toast(nowPinned ? `@${c.username} en üste sabitlendi` : `Sabitleme kaldırıldı`);
    render();
  });
  return btn;
}

function searchItemNode(u) {
  const row = el('div', 'chat-item static-item');
  const body = el('div', 'body');
  const r1 = el('div', 'row');
  r1.append(el('span', 'name', '@' + u.username));
  const r2 = el('div', 'row');

  const avUrl = getAvatarUrl(u.avatar_path);
  row.append(avatarEl(u.username, { online: state.onlineIds.has(u.id), avatarUrl: avUrl }));

  if (u.relation === 'friend') {
    r2.append(el('span', 'ptext muted-sub', 'Arkadaşınız'));
    const btn = el('button', 'btn-sm primary', 'Sohbeti Aç');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      clearSearch();
      onOpen({ id: u.id, username: u.username, avatar_path: u.avatar_path });
    });
    r1.append(btn);
  } else if (u.relation === 'outgoing') {
    r2.append(el('span', 'ptext muted-sub', 'İstek gönderildi (Bekliyor)'));
    const cancelBtn = el('button', 'btn-sm secondary', 'İptal');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => handleCancelRequest(u.request_id, u));
    r1.append(cancelBtn);
  } else if (u.relation === 'incoming') {
    r2.append(el('span', 'ptext muted-sub', 'Sana istek gönderdi'));
    const btnGroup = el('div', 'btn-group');
    const accBtn = el('button', 'btn-sm primary', 'Kabul Et');
    accBtn.type = 'button';
    accBtn.addEventListener('click', () => handleRespondRequest(u.request_id, true, u));
    const decBtn = el('button', 'btn-sm danger', 'Reddet');
    decBtn.type = 'button';
    decBtn.addEventListener('click', () => handleRespondRequest(u.request_id, false, u));
    btnGroup.append(accBtn, decBtn);
    r1.append(btnGroup);
  } else {
    r2.append(el('span', 'ptext muted-sub', 'Sohbet etmek için istek gönderin'));
    const addBtn = el('button', 'btn-sm primary', 'Arkadaş Ekle');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => handleSendRequest(u));
    r1.append(addBtn);
  }

  body.append(r1, r2);
  row.append(body);
  return row;
}

function requestItemNode(req) {
  const row = el('div', 'chat-item static-item req-item');
  const body = el('div', 'body');
  const r1 = el('div', 'row');
  r1.append(el('span', 'name', '@' + req.username));

  const avUrl = getAvatarUrl(req.avatar_path);
  row.append(avatarEl(req.username, { online: state.onlineIds.has(req.user_id), avatarUrl: avUrl }));

  const r2 = el('div', 'row');
  if (req.direction === 'incoming') {
    r2.append(el('span', 'ptext muted-sub', 'Sana arkadaşlık isteği gönderdi'));
    const btnGroup = el('div', 'btn-group');
    const accBtn = el('button', 'btn-sm primary', 'Kabul Et');
    accBtn.type = 'button';
    accBtn.addEventListener('click', () => handleRespondRequest(req.request_id, true, {
      id: req.user_id, username: req.username, avatar_path: req.avatar_path
    }));
    const decBtn = el('button', 'btn-sm danger', 'Reddet');
    decBtn.type = 'button';
    decBtn.addEventListener('click', () => handleRespondRequest(req.request_id, false));
    btnGroup.append(accBtn, decBtn);
    r1.append(btnGroup);
  } else {
    r2.append(el('span', 'ptext muted-sub', 'İstek gönderildi (Bekliyor)'));
    const cancelBtn = el('button', 'btn-sm secondary', 'İptal');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => handleCancelRequest(req.request_id));
    r1.append(cancelBtn);
  }

  body.append(r1, r2);
  row.append(body);
  return row;
}

/* ---------------- Ana Render ---------------- */
function render() {
  if (!state.me) return;
  const list = $('list');
  list.replaceChildren();

  updateRequestsBadge();
  renderStoriesBar();

  // Toplam okunmamış sayısı & Dinamik Sekme İkonu (#99)
  const totalUnread = state.chats.reduce((n, c) => n + (Number(c.unread_count) || 0), 0);
  document.title = totalUnread ? `(${totalUnread}) Mesaj` : 'Mesaj';
  updateFaviconBadge(totalUnread);

  // 1. Arama modu
  if (query) {
    list.append(el('div', 'list-title', 'Kullanıcılar'));
    if (!searchResults.length) {
      list.append(el('div', 'list-empty', 'Bu kullanıcı adıyla eşleşen kimse bulunamadı.'));
      return;
    }
    for (const u of searchResults) {
      list.append(searchItemNode(u));
    }
    return;
  }

  // 2. İstekler sekmesi
  if (filter === 'requests') {
    list.append(el('div', 'list-title', 'Arkadaşlık İstekleri'));
    if (!state.requests.length) {
      list.append(el('div', 'list-empty', 'Bekleyen arkadaşlık isteği yok.\nYukarıdaki kutudan kullanıcı adı arayarak arkadaş ekleyebilirsin.'));
      return;
    }
    for (const req of state.requests) {
      list.append(requestItemNode(req));
    }
    return;
  }

  // 3. Yıldızlı Mesajlar sekmesi
  if (filter === 'starred') {
    list.append(el('div', 'list-title', 'Yıldızlı Mesajlar'));
    fetchStarred().then(starred => {
      list.replaceChildren();
      list.append(el('div', 'list-title', 'Yıldızlı Mesajlar'));
      if (!starred.length) {
        list.append(el('div', 'list-empty', 'Henüz yıldızlanmış bir mesajınız yok.\nMesaj menüsünden Yıldızla seçeneğini kullanabilirsiniz.'));
        return;
      }
      starred.forEach(s => {
        const item = el('div', 'starred-item');
        const head = el('div', 'starred-head');
        head.innerHTML = `<b>@${s.sender_name}</b><span>${fmtListTime(s.created_at)}</span>`;
        const desc = s.content || (s.image_path ? 'Fotoğraf' : s.audio_path ? 'Sesli mesaj' : s.file_name || 'Belge');
        const body = el('div', 'starred-body', desc);
        item.append(head, body);
        item.addEventListener('click', () => {
          const otherId = s.sender_id === state.me.id ? s.receiver_id : s.sender_id;
          const c = (state.chats || []).find(x => x.contact_id === otherId);
          if (c) {
            onOpen({ id: c.contact_id, username: c.username, avatar_path: c.avatar_path, about: c.about });
            setTimeout(() => {
              const row = document.querySelector(`[data-id="${s.message_id}"]`);
              if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight-flash');
              }
            }, 300);
          }
        });
        list.append(item);
      });
    }).catch(err => {
      list.append(el('div', 'list-empty', 'Yıldızlı mesajlar yüklenemedi.'));
    });
    return;
  }

  // 3. Sohbetler (Tümü / Okunmamış) — Sabitlenenler en üstte (#67)
  const rawChats = filter === 'unread' ? state.chats.filter((c) => Number(c.unread_count) > 0) : state.chats;
  const chats = [...rawChats].sort((a, b) => (isPinnedChat(b.contact_id) ? 1 : 0) - (isPinnedChat(a.contact_id) ? 1 : 0));
  if (!chats.length) {
    list.append(el('div', 'list-empty', filter === 'unread'
      ? 'Okunmamış sohbetin yok.'
      : 'Henüz arkadaşın yok.\nYukarıdan bir kullanıcı adı arayıp "Arkadaş Ekle" butonuyla istek gönder.'));
    return;
  }
  for (const c of chats) {
    list.append(chatItemNode(c));
  }
}
