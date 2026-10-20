// A tiny wrapper around IndexedDB: one store for the saved database file and small settings, one for cover pictures.
const NAME = 'book-journal-phone';
let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('covers'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opened = null; reject(req.error); };
    });
  }
  return opened;
}

export type Store = 'kv' | 'covers';

export async function idbGet<T = unknown>(store: Store, key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(store: Store, key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbCount(store: Store): Promise<number> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbClear(store: Store): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
