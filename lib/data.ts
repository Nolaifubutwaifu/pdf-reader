import { supabase } from './supabase';
import { dropCached, getCached, putCached } from './cache';
import type { AnnotationRow, DocumentRow, NRect, Stroke } from './types';

const BUCKET = 'pdfs';

function must<T>(data: T | null, error: { message: string } | null, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  if (data === null) throw new Error(`${what}: no data returned`);
  return data;
}

/* ————— Documents ————— */

export async function listDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('added_at', { ascending: false });
  return must(data, error, 'Could not load your documents');
}

/** Map of documentId → number of annotations, for the library cards. */
export async function annotationCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('annotations').select('document_id');
  const rows = must(data, error, 'Could not count highlights');
  const out: Record<string, number> = {};
  for (const r of rows) out[r.document_id] = (out[r.document_id] ?? 0) + 1;
  return out;
}

/**
 * Upload a PDF: file to Storage under <user>/<docId>.pdf, then a row pointing
 * at it. The blob is cached locally on the way through, so the document you
 * just added opens without a round trip.
 */
export async function uploadDocument(file: Blob, name: string): Promise<DocumentRow> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('You are signed out — sign in again to upload.');

  const id = crypto.randomUUID();
  const storagePath = `${userId}/${id}.pdf`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data, error } = await supabase
    .from('documents')
    .insert({
      id,
      user_id: userId,
      name,
      storage_path: storagePath,
      byte_size: file.size,
    })
    .select()
    .single();

  if (error) {
    // Don't leave an orphaned file behind if the row insert failed.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Could not save the document: ${error.message}`);
  }

  await putCached(id, file);
  return data as DocumentRow;
}

/** Cache-first fetch of the actual PDF bytes. */
export async function getDocumentBlob(doc: DocumentRow): Promise<Blob> {
  const hit = await getCached(doc.id);
  if (hit) return hit;

  const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (error) throw new Error(`Could not download the PDF: ${error.message}`);
  await putCached(doc.id, data);
  return data;
}

export async function deleteDocument(doc: DocumentRow): Promise<void> {
  // Annotations cascade in the database; the stored file does not.
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (rmErr) throw new Error(`Could not remove the file: ${rmErr.message}`);
  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error) throw new Error(`Could not remove the document: ${error.message}`);
  await dropCached(doc.id);
}

export async function touchDocument(id: string): Promise<void> {
  await supabase.from('documents').update({ last_opened_at: new Date().toISOString() }).eq('id', id);
}

export async function setPageCount(id: string, pageCount: number): Promise<void> {
  await supabase.from('documents').update({ page_count: pageCount }).eq('id', id);
}

/* ————— Annotations ————— */

export async function listAnnotations(documentId: string): Promise<AnnotationRow[]> {
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('document_id', documentId)
    .order('page', { ascending: true });
  return must(data, error, 'Could not load your highlights');
}

export async function listAllAnnotations(): Promise<AnnotationRow[]> {
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .order('created_at', { ascending: true });
  return must(data, error, 'Could not load your notes');
}

export async function createAnnotation(input: {
  documentId: string;
  page: number;
  rects: NRect[];
  color: string;
  quote: string;
  note?: string;
  comment?: string;
  strokes?: Stroke[];
}): Promise<AnnotationRow> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('You are signed out — sign in again to annotate.');

  const { data, error } = await supabase
    .from('annotations')
    .insert({
      document_id: input.documentId,
      user_id: userId,
      page: input.page,
      rects: input.rects,
      color: input.color,
      quote: input.quote,
      note: input.note ?? '',
      comment: input.comment ?? '',
      strokes: input.strokes ?? [],
    })
    .select()
    .single();
  return must(data as AnnotationRow, error, 'Could not save the highlight');
}

export async function updateAnnotation(
  id: string,
  patch: Partial<Pick<AnnotationRow, 'note' | 'comment' | 'color' | 'strokes'>>,
): Promise<void> {
  const { error } = await supabase.from('annotations').update(patch).eq('id', id);
  if (error) throw new Error(`Could not save: ${error.message}`);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const { error } = await supabase.from('annotations').delete().eq('id', id);
  if (error) throw new Error(`Could not delete: ${error.message}`);
}
