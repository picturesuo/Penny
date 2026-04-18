import type { VaultEntry } from "@/types/thought-map";

const DATABASE_NAME = "penny-vault";
const DATABASE_VERSION = 1;
const STORE_NAME = "vault_entries";

function assertIndexedDBAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment.");
  }
}

function openDatabase() {
  assertIndexedDBAvailable();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open vault storage."));
  });
}

async function withVaultStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T> | T) {
  const db = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      Promise.resolve(handler(store))
        .then((value) => {
          transaction.oncomplete = () => resolve(value);
          transaction.onerror = () => reject(transaction.error ?? new Error("Vault transaction failed."));
        })
        .catch((error) => reject(error));
    });
  } finally {
    db.close();
  }
}

export async function listVaultEntries() {
  return withVaultStore("readonly", async (store) => {
    const request = store.getAll();

    return await new Promise<VaultEntry[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as VaultEntry[]).sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()));
      request.onerror = () => reject(request.error ?? new Error("Failed to read vault entries."));
    });
  });
}

export async function getVaultEntry(id: string) {
  return withVaultStore("readonly", async (store) => {
    const request = store.get(id);

    return await new Promise<VaultEntry | null>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as VaultEntry | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Failed to read vault entry."));
    });
  });
}

export async function saveVaultEntry(entry: VaultEntry) {
  await withVaultStore("readwrite", async (store) => {
    const request = store.put(entry);

    return await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Failed to save vault entry."));
    });
  });

  return entry;
}

export async function touchVaultEntry(id: string) {
  const entry = await getVaultEntry(id);
  if (!entry) {
    return null;
  }

  const nextEntry: VaultEntry = {
    ...entry,
    lastAccessedAt: new Date(),
  };
  await saveVaultEntry(nextEntry);
  return nextEntry;
}

export async function deleteVaultEntry(id: string) {
  await withVaultStore("readwrite", async (store) => {
    const request = store.delete(id);

    return await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Failed to delete vault entry."));
    });
  });
}

