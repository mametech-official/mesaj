/* =====================================================================
 *  services/db.js — Yerel IndexedDB + Senkron LocalStorage Önbelleği
 *  (WhatsApp Hızı / Offline-First: 0.00ms anında sohbet ve mesaj açılışı)
 * ===================================================================== */

const DB_NAME = 'mesaj_local_db_v1';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'contact_id' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('chat_id', 'chat_id', { unique: false });
          msgStore.createIndex('created_at', 'created_at', { unique: false });
        }
      };

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

/* ---------------- 1. Sohbet Listesi İşlemleri (0ms Sidebar) ---------------- */

export function getSyncCachedChats() {
  try {
    const raw = localStorage.getItem('wa_cached_chats');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getLocalChats() {
  const syncList = getSyncCachedChats();
  if (syncList && syncList.length) return syncList;

  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('chats', 'readonly');
      const store = tx.objectStore('chats');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveLocalChats(chats) {
  if (!Array.isArray(chats) || !chats.length) return;
  try {
    localStorage.setItem('wa_cached_chats', JSON.stringify(chats.slice(0, 50)));
  } catch {}

  const db = await openDB();
  if (!db) return;

  try {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    for (const c of chats) {
      if (c && c.contact_id) store.put(c);
    }
  } catch {}
}

/* ---------------- 2. Mesaj İşlemleri (0ms Senkron + IndexedDB) ---------------- */

/**
 * 0.00ms senkron mesaj okuma — Promise/await beklemeden anında döner!
 */
export function getSyncCachedMessages(chatId) {
  if (!chatId) return [];
  try {
    const raw = localStorage.getItem(`wa_cached_msgs_${chatId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getLocalMessages(chatId, limit = 80) {
  const syncMsgs = getSyncCachedMessages(chatId);
  const db = await openDB();
  if (!db) return syncMsgs.slice(-limit);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chat_id');
      const req = index.getAll(IDBKeyRange.only(chatId));

      req.onsuccess = () => {
        const list = req.result || [];
        if (!list.length && syncMsgs.length) {
          resolve(syncMsgs.slice(-limit));
          return;
        }
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const sliced = list.slice(-limit);
        try {
          if (sliced.length) {
            localStorage.setItem(`wa_cached_msgs_${chatId}`, JSON.stringify(sliced.slice(-60)));
          }
        } catch {}
        resolve(sliced);
      };
      req.onerror = () => resolve(syncMsgs.slice(-limit));
    } catch {
      resolve(syncMsgs.slice(-limit));
    }
  });
}

export async function saveLocalMessages(chatId, messages) {
  if (!chatId || !Array.isArray(messages)) return;

  try {
    localStorage.setItem(`wa_cached_msgs_${chatId}`, JSON.stringify(messages.slice(-60)));
  } catch {}

  if (!messages.length) return;
  const db = await openDB();
  if (!db) return;

  try {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    for (const m of messages) {
      if (m && m.id) {
        store.put({ ...m, chat_id: chatId });
      }
    }
  } catch {}
}

export async function saveSingleLocalMessage(chatId, message) {
  if (!chatId || !message || !message.id) return;

  try {
    const existing = getSyncCachedMessages(chatId);
    const idx = existing.findIndex((x) => x.id === message.id);
    if (idx >= 0) existing[idx] = message;
    else existing.push(message);
    localStorage.setItem(`wa_cached_msgs_${chatId}`, JSON.stringify(existing.slice(-60)));
  } catch {}

  const db = await openDB();
  if (!db) return;

  try {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    store.put({ ...message, chat_id: chatId });
  } catch {}
}

export async function deleteLocalMessage(messageId) {
  if (!messageId) return;
  const db = await openDB();
  if (!db) return;

  try {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    store.delete(messageId);
  } catch {}
}
