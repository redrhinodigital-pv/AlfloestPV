/**
 * dbHelper.js
 * 
 * Promise-based local client-side IndexedDB caching system to enable
 * instant room loading and offline message access.
 */

const DB_NAME = 'AlfloestPV_DB';
const DB_VERSION = 1;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open local IndexedDB cache.'));
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      
      // Store 1: Rooms metadata list
      if (!db.objectStoreNames.contains('rooms')) {
        db.createObjectStore('rooms', { keyPath: 'folderId' });
      }

      // Store 2: Cached messages list keyed by a compound key [roomId + msgId]
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'cacheKey' });
        // Index by roomId and timestamp for fast sorted listings
        msgStore.createIndex('roomId', 'roomId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Cache list of messages in bulk
 */
export async function cacheMessages(roomId, messagesList) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    messagesList.forEach((msg) => {
      const cacheKey = `${roomId}_${msg.id}`;
      store.put({
        cacheKey,
        roomId,
        ...msg,
      });
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load cached messages for a given room, sorted by timestamp
 */
export async function getCachedMessages(roomId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('roomId');
    
    const request = index.getAll(IDBKeyRange.only(roomId));

    request.onsuccess = () => {
      const results = request.result || [];
      // Sort by timestamp
      results.sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear cached messages for a given room (e.g. on exit/error)
 */
export async function clearCachedMessages(roomId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const index = store.index('roomId');

    const request = index.openCursor(IDBKeyRange.only(roomId));

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve(true);
      }
    };

    request.onerror = () => reject(request.error);
  });
}
