/* =====================================================================
 *  state.js — ortak durum + hafif olay yayını (bus)
 * ===================================================================== */
const listeners = new Map();

export const bus = {
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt)?.delete(fn);
  },
  emit(evt, data) {
    listeners.get(evt)?.forEach((fn) => {
      try { fn(data); } catch (err) { console.error(`[bus:${evt}]`, err); }
    });
  },
};

export const state = {
  me: null,                       // { id, username, avatar_path, last_seen }
  chats: [],                      // get_chats() sonucu
  requests: [],                   // get_requests() sonucu
  activeChat: null,               // { id, username, avatar_path }
  onlineIds: new Set(),           // presence ile çevrim içi kullanıcılar
  lastSeen: new Map(),            // userId -> ISO tarih
  typing: new Map(),              // userId -> timeout id
};

export function setLastSeen(userId, iso) {
  if (!iso) return;
  const cur = state.lastSeen.get(userId);
  if (!cur || new Date(iso) > new Date(cur)) state.lastSeen.set(userId, iso);
}

export function resetState() {
  state.me = null;
  state.chats = [];
  state.requests = [];
  state.activeChat = null;
  state.onlineIds = new Set();
  state.lastSeen = new Map();
  state.typing.forEach((t) => clearTimeout(t));
  state.typing = new Map();
}
