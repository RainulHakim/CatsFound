/**
 * Local draft for the post form (SPEC §5.1): if the finder reloads or the
 * tab is killed mid-flow, the photo and answers are still there. IndexedDB,
 * because localStorage can't hold image blobs. Every call fails soft.
 */
export type Draft = {
  photos: { name: string; type: string; blob: Blob }[];
  category: string;
  building: string;
  description: string;
  secret: string;
  startedAt: number;
};

const DB = "catfound";
const STORE = "drafts";
const KEY = "found-item";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const loadDraft = () => run<Draft>("readonly", (s) => s.get(KEY) as IDBRequest<Draft>);
export const saveDraft = (d: Draft) => run("readwrite", (s) => s.put(d, KEY));
export const clearDraft = () => run("readwrite", (s) => s.delete(KEY));
