import Dexie, { type EntityTable } from 'dexie';

interface CachedBlob {
  documentId: string;
  blob: Blob;
  cachedAt: number;
}

/**
 * Local blob cache. Supabase Storage is the source of truth for PDF files;
 * this keeps a copy so reopening a document is instant and doesn't re-download
 * tens of megabytes. Safe to clear at any time — anything missing is refetched.
 */
const cacheDb = new Dexie('marginalia-cache') as Dexie & {
  blobs: EntityTable<CachedBlob, 'documentId'>;
};

cacheDb.version(1).stores({ blobs: 'documentId, cachedAt' });

export async function getCached(documentId: string): Promise<Blob | null> {
  try {
    const row = await cacheDb.blobs.get(documentId);
    return row?.blob ?? null;
  } catch {
    return null; // A broken cache must never block reading.
  }
}

export async function putCached(documentId: string, blob: Blob): Promise<void> {
  try {
    await cacheDb.blobs.put({ documentId, blob, cachedAt: Date.now() });
  } catch {
    // Quota exceeded or private mode — the app still works uncached.
  }
}

export async function dropCached(documentId: string): Promise<void> {
  try {
    await cacheDb.blobs.delete(documentId);
  } catch {
    // Nothing to do.
  }
}

export async function cacheSize(): Promise<number> {
  try {
    const all = await cacheDb.blobs.toArray();
    return all.reduce((n, r) => n + r.blob.size, 0);
  } catch {
    return 0;
  }
}

export async function clearCache(): Promise<void> {
  try {
    await cacheDb.blobs.clear();
  } catch {
    // Nothing to do.
  }
}
