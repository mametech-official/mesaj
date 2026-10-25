/* =====================================================================
 *  services/db.js — Yerel IndexedDB Veritabanı (WhatsApp Hızı / Offline-First)
 *  Sohbetleri ve mesajları telefon/tarayıcı hafızasında saklar (0ms açılış).
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
        // 1. Sohbet listesi tablosu
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'contact_id' });
        }
        // 2. Mesajlar tablosu (Hızlı sohbet içi arama ve sıralama)
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

export async function getLocalChats() {
  const db = await openDB();
  if (!db) {
    try {
      return JSON.parse(localStorage.getItem('wa_cached_chats') || '[]');
    } catch { return []; }
  }

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
    localStorage.setItem('wa_cached_chats', JSON.stringify(chats.slice(0, 40)));
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

/* ---------------- 2. Mesaj İşlemleri (0ms Chat View) ---------------- */

export async function getLocalMessages(chatId, limit = 80) {
  const db = await openDB();
  if (!db) {
    try {
      return JSON.parse(localStorage.getItem(`wa_cached_msgs_${chatId}`) || '[]');
    } catch { return []; }
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chat_id');
      const req = index.getAll(IDBKeyRange.only(chatId));

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        resolve(list.slice(-limit));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveLocalMessages(chatId, messages) {
  if (!chatId || !Array.isArray(messages) || !messages.length) return;

  try {
    localStorage.setItem(`wa_cached_msgs_${chatId}`, JSON.stringify(messages.slice(-50)));
  } catch {}

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
