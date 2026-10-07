// Keeps rendered MP4 files in the browser (IndexedDB); they are too large for localStorage.
const dbName = "scorvik-videos";
const storeName = "films";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

export const saveVideo = (projectId: string, blob: Blob) => run("readwrite", (store) => store.put(blob, projectId));
export const loadVideo = (projectId: string) => run<Blob | undefined>("readonly", (store) => store.get(projectId));
export const deleteVideo = (projectId: string) => run("readwrite", (store) => store.delete(projectId));
