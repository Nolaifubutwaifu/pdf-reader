import Dexie from 'dexie';
import { createAnnotation, uploadDocument } from './data';

const LEGACY_DB = 'marginalia';
const DONE_KEY = 'marginalia:legacy-imported';

interface LegacyPdf {
  id: string;
  name: string;
  data: Blob;
  addedAt: number;
}

interface LegacyAnnotation {
  id: string;
  pdfId: string;
  page: number;
  rects: { x: number; y: number; w: number; h: number }[];
  color: string;
  quote: string;
  note: string;
  comment?: string;
  strokes?: { color: string; pts: { x: number; y: number }[] }[];
}

async function openLegacy(): Promise<Dexie | null> {
  if (!(await Dexie.exists(LEGACY_DB))) return null;
  const db = new Dexie(LEGACY_DB);
  // Open in dynamic mode so we adopt whatever schema is already on disk.
  await db.open();
  const names = db.tables.map((t) => t.name);
  if (!names.includes('pdfs')) {
    db.close();
    return null;
  }
  return db;
}

/** How many documents are sitting in the old browser-only store, if any. */
export async function legacyCount(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  if (localStorage.getItem(DONE_KEY)) return 0;
  try {
    const db = await openLegacy();
    if (!db) return 0;
    const n = await db.table('pdfs').count();
    db.close();
    return n;
  } catch {
    return 0;
  }
}

export function dismissLegacy(): void {
  localStorage.setItem(DONE_KEY, String(Date.now()));
}

/**
 * One-time import of browser-only data into the signed-in account. Uploads
 * each PDF, then recreates its annotations against the new document id.
 * Non-destructive: the local copy is left untouched.
 */
export async function importLegacy(
  onProgress?: (done: number, total: number) => void,
): Promise<{ documents: number; annotations: number }> {
  const db = await openLegacy();
  if (!db) return { documents: 0, annotations: 0 };

  const pdfs = (await db.table('pdfs').toArray()) as LegacyPdf[];
  const anns = db.tables.some((t) => t.name === 'annotations')
    ? ((await db.table('annotations').toArray()) as LegacyAnnotation[])
    : [];

  let docCount = 0;
  let annCount = 0;

  for (const [i, p] of pdfs.entries()) {
    onProgress?.(i, pdfs.length);
    try {
      const doc = await uploadDocument(p.data, p.name);
      docCount++;
      for (const a of anns.filter((x) => x.pdfId === p.id)) {
        await createAnnotation({
          documentId: doc.id,
          page: a.page,
          rects: a.rects,
          color: a.color,
          quote: a.quote,
          note: a.note ?? '',
          comment: a.comment ?? '',
          strokes: a.strokes ?? [],
        });
        annCount++;
      }
    } catch {
      // Skip anything unreadable and keep going; the local copy survives.
    }
  }

  onProgress?.(pdfs.length, pdfs.length);
  db.close();
  localStorage.setItem(DONE_KEY, String(Date.now()));
  return { documents: docCount, annotations: annCount };
}
